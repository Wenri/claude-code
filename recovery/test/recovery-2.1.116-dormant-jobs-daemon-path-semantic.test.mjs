import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { tokenizer } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const baselinePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
      : false,
}

const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

const units = new Map([
  [
    16276,
    [
      10_305_252,
      10_305_841,
      'FunctionDeclaration',
      '248f87c9c868b5eaa33d8e45e91fd73df6f17ef958aabba15b19a57baa6e3d06',
    ],
  ],
  [
    19574,
    [
      11_920_895,
      11_921_248,
      'VariableDeclaration',
      'ff704f2c2d1e573274d1ccf4488e818091d4a6d97e2d3ed9e5fe2328ee65ef79',
    ],
  ],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function identifierPositions(source, names) {
  const wanted = new Set(names)
  const positions = new Map(names.map(name => [name, []]))
  for (const token of tokenizer(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'script',
  })) {
    if (token.type.label === 'name' && wanted.has(token.value)) {
      positions.get(token.value).push(token.start)
    }
  }
  return positions
}

test('target116 authenticates the jobs loader and daemon-path declaration units', bundleOptions, () => {
  const baseline = fs.readFileSync(baselinePath)
  const target = fs.readFileSync(targetPath)
  assert.equal(
    sha256(baseline),
    'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
  )
  assert.equal(
    sha256(target),
    'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
  )

  for (const [index, identity] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [
        region.target.start,
        region.target.end,
        region.target.nodeType,
        region.target.sourceHash,
      ],
      identity,
      `${index}: structural identity`,
    )
    assert.equal(
      sha256(target.subarray(identity[0], identity[1])),
      identity[3],
      `${index}: bytes`,
    )
  }

  const baselineText = baseline.toString('utf8')
  const targetText = target.toString('utf8')
  for (const fragment of [
    '[jobs] skipping ',
    ': state.json schema validation failed \\u2014 ',
    ': state.json read/parse failed \\u2014 ',
    'TERMUX_VERSION',
  ]) {
    assert.equal(occurrences(baselineText, fragment), 0, `${fragment}: baseline`)
    assert.ok(occurrences(targetText, fragment) > 0, `${fragment}: target`)
  }
})

test('the jobs state loader has no call or export in the authenticated target', bundleOptions, () => {
  const target = fs.readFileSync(targetPath, 'utf8')
  const [start, end] = units.get(16276)
  const unit = target.slice(start, end)
  const loaderName = /^async function ([A-Za-z_$][\w$]*)\(/.exec(unit)?.[1]
  assert.equal(loaderName, 'N$8')
  assert.match(unit, /readFile\([^)]*"state\.json"/)
  assert.match(unit, /safeParse/)

  const positions = identifierPositions(target, [loaderName]).get(loaderName)
  assert.deepEqual(positions, [start + 'async function '.length])

  // Its adjacent path helpers likewise never reach the loader: UM6 is consumed
  // only by V$8, while V$8 itself has no consumer outside its declaration.
  const helpers = identifierPositions(target, ['UM6', 'V$8'])
  assert.equal(helpers.get('UM6').length, 2)
  assert.equal(helpers.get('V$8').length, 1)
  assert.equal(helpers.get('UM6').every(position => position < start), true)
  assert.equal(helpers.get('V$8').every(position => position < start), true)
})

test('the daemon temp-path accessor is confined to an unrooted declaration cluster', bundleOptions, () => {
  const target = fs.readFileSync(targetPath, 'utf8')
  const [start, end] = units.get(19574)
  const unit = target.slice(start, end)
  for (const fragment of [
    'createHash("sha256")',
    '.digest("hex").slice(0,8)',
    'process.env.TERMUX_VERSION&&process.env.PREFIX',
    'bz$.join(process.env.PREFIX,"tmp")',
    '`cc-daemon-${H}`',
  ]) {
    assert.ok(unit.includes(fragment), fragment)
  }

  const bindings = identifierPositions(target, ['YK4', 'bz$', 'do1', 'sDO'])
  assert.deepEqual(
    Object.fromEntries([...bindings].map(([name, positions]) => [name, positions.length])),
    { YK4: 3, 'bz$': 4, do1: 3, sDO: 2 },
  )
  for (const [name, positions] of bindings) {
    assert.equal(
      positions.every(position => position >= start - 24 && position < end),
      true,
      `${name}: no external reference`,
    )
  }

  // sDO is declared and assigned, but never called/read. The only nested edge
  // is sDO's callback calling do1; nothing roots the resulting accessor.
  assert.equal(/sDO\(\)/.test(target), false)
})
