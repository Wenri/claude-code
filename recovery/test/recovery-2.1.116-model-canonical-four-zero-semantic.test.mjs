import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
      : false,
}

const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'
const baselineUnit = {
  index: 4531,
  start: 2_034_730,
  end: 2_035_659,
  sourceHash:
    '5c3a88cb09ee5b386d78e20ed33b45ed7dd3c50fc119851adc2f39fd59c4638b',
}
const targetUnit = {
  index: 4544,
  start: 2_037_113,
  end: 2_038_064,
  sourceHash:
    'f32540d7aed8c8250ce91abf8da640964faf6116d3bbc3decc7777431a9c7974',
}
const targetRegexes = [
  {
    pattern: 'claude-opus-4(?!-\\d(?!\\d))',
    start: 2_037_377,
    end: 2_037_405,
  },
  {
    pattern: 'claude-sonnet-4(?!-\\d(?!\\d))',
    start: 2_037_563,
    end: 2_037_593,
  },
]
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function ownerSource() {
  return fs.readFileSync(
    path.join(sourceRoot, 'utils/model/model.ts'),
    'utf8',
  )
}

function functionBody(source, name) {
  const declaration = source.indexOf(`function ${name}(`)
  assert.notEqual(declaration, -1, `${name}: declaration`)
  const bodyStart = source.indexOf('{', declaration)
  let depth = 0
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] !== '}') continue
    depth -= 1
    if (depth === 0) return source.slice(bodyStart + 1, index)
  }
  assert.fail(`${name}: body`)
}

test('target116 pins the future-version-safe canonical model parser', bundleOptions, () => {
  const baseline = fs.readFileSync(baselinePath)
  const target = fs.readFileSync(targetPath)
  assert.equal(sha256(baseline), baselineSha256)
  assert.equal(sha256(target), targetSha256)

  const baselineText = baseline.toString('utf8')
  const targetText = target.toString('utf8')
  assert.equal(
    sha256(baselineText.slice(baselineUnit.start, baselineUnit.end)),
    baselineUnit.sourceHash,
  )
  const region = structural.regions[targetUnit.index]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [
      region.target.start,
      region.target.end,
      region.target.nodeType,
      region.target.sourceHash,
    ],
    [
      targetUnit.start,
      targetUnit.end,
      'FunctionDeclaration',
      targetUnit.sourceHash,
    ],
  )
  assert.equal(
    sha256(targetText.slice(targetUnit.start, targetUnit.end)),
    targetUnit.sourceHash,
  )

  const baselineOwner = baselineText.slice(baselineUnit.start, baselineUnit.end)
  const targetOwner = targetText.slice(targetUnit.start, targetUnit.end)
  assert.match(baselineOwner, /includes\("claude-opus-4"\)/)
  assert.match(baselineOwner, /includes\("claude-sonnet-4"\)/)
  assert.ok(baselineOwner.includes('return H.replace(/-\\d{8}$/,"\")'))
  assert.ok(targetOwner.includes('return H.replace(/-\\d{8}$/,"\")'))
  for (const { pattern, start, end } of targetRegexes) {
    assert.equal(targetText.slice(start, end), `/${pattern}/`)
    assert.ok(targetOwner.includes(`/${pattern}/`))
    assert.equal(baselineText.includes(`/${pattern}/`), false)
  }
})

test('source owns the target matcher change and preserves the inherited fallback and known models', sourceOptions, () => {
  const owner = ownerSource()
  for (const fragment of [
    '/claude-opus-4(?!-\\d(?!\\d))/',
    "return 'claude-opus-4-0'",
    '/claude-sonnet-4(?!-\\d(?!\\d))/',
    "return 'claude-sonnet-4-0'",
    "return name.replace(/-\\d{8}$/, '')",
  ]) {
    assert.ok(owner.includes(fragment), fragment)
  }
  assert.equal(owner.includes("if (name.includes('claude-opus-4'))"), false)
  assert.equal(owner.includes("if (name.includes('claude-sonnet-4'))"), false)

  const canonical = Function(
    'name',
    functionBody(owner, 'firstPartyNameToCanonical'),
  )
  assert.equal(canonical('claude-opus-4'), 'claude-opus-4-0')
  assert.equal(canonical('us.anthropic.claude-opus-4-20250514-v1:0'), 'claude-opus-4-0')
  assert.equal(canonical('claude-sonnet-4@20250514'), 'claude-sonnet-4-0')
  assert.equal(canonical('claude-opus-4-1-20250805'), 'claude-opus-4-1')
  assert.equal(canonical('claude-sonnet-4-6'), 'claude-sonnet-4-6')
  assert.equal(canonical('claude-opus-4-8'), 'claude-opus-4-8')
  assert.equal(canonical('claude-sonnet-4-9'), 'claude-sonnet-4-9')
  assert.equal(canonical('claude-future-family-20270101'), 'claude-future-family')
  assert.equal(canonical('vendor.claude-future-family'), 'vendor.claude-future-family')
})
