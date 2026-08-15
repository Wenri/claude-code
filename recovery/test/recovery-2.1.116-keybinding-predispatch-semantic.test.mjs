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

const baselineUnits = new Map([
  [
    10682,
    [
      6256617,
      6257871,
      'FunctionDeclaration',
      '36c8a805f5c18595aaf200f8bc3ca7a6f655901085fdfdf81157f6cbca809eb7',
    ],
  ],
  [
    10683,
    [
      6257871,
      6259778,
      'FunctionDeclaration',
      'd52861df1bed415f9ea1631d8ef434e5d46a92d3a753abb1f3876d674c920983',
    ],
  ],
])
const targetUnits = new Map([
  [
    10789,
    [
      6290018,
      6291327,
      'FunctionDeclaration',
      '000709b699a3f63e809f441ffa3e0f69de459ca37a440bab3018269b5025a9d0',
    ],
  ],
  [
    10790,
    [
      6291327,
      6293362,
      'FunctionDeclaration',
      '0ab7fa483056ff1ce8f96da8ab37648cad1dc78c53a036f39f9efb01d454ec48',
    ],
  ],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrenceCount(source, value) {
  return source.split(value).length - 1
}

function source() {
  return fs.readFileSync(
    path.join(sourceRoot, 'keybindings/KeybindingProviderSetup.tsx'),
    'utf8',
  )
}

test(
  'target116 pins the interactive pre-dispatch registry in inner coordinates',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.114 and 2.1.116 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
    )
    assert.equal(
      sha256(targetBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
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

    for (const [index, [start, end, nodeType, hash]] of baselineUnits) {
      const unit = baseline.slice(start, end)
      assert.equal(sha256(unit), hash, `baseline u${index}`)
      assert.equal(
        structural.unmatchedBaseline.some(
          row =>
            row.index === index &&
            row.start === start &&
            row.end === end &&
            row.nodeType === nodeType &&
            row.sourceHash === hash,
        ),
        true,
        `baseline structural u${index}`,
      )
      assert.equal(unit.includes('preDispatchRef'), false)
    }

    for (const [index, [start, end, nodeType, hash]] of targetUnits) {
      const unit = target.slice(start, end)
      assert.equal(sha256(unit), hash, `target u${index}`)
      assert.deepEqual(
        [
          structural.regions[index].classification,
          structural.regions[index].target.start,
          structural.regions[index].target.end,
          structural.regions[index].target.nodeType,
          structural.regions[index].target.sourceHash,
        ],
        ['unresolved', start, end, nodeType, hash],
        `target structural u${index}`,
      )
    }

    assert.equal(
      occurrenceCount(target.slice(6290018, 6291327), 'preDispatchRef'),
      2,
    )
    assert.equal(
      occurrenceCount(target.slice(6291327, 6293362), 'preDispatchRef'),
      1,
    )
    assert.equal(occurrenceCount(baseline, 'preDispatchRef'), 0)
    assert.equal(occurrenceCount(target, 'preDispatchRef'), 5)

    const setupUnit = target.slice(6290018, 6291327)
    assert.match(setupUnit, /useRef\(new Set\)/)
    const interceptorUnit = target.slice(6291327, 6293362)
    assert.match(interceptorUnit, /for\(let \w+ of \w+\.current\)try/)
    assert.match(interceptorUnit, /===!0\)\{\w+\(\);return\}/)
    assert.match(interceptorUnit, /catch\(\w+\)\{\w+\(\w+\)\}/)
  },
)

test(
  'interactive keybinding setup owns and dispatches the target116 registry',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const contents = source()
    assert.match(
      contents,
      /const preDispatchRef = useRef\(\s*new Set<\(input: string, key: Key\) => boolean \| void>\(\),\s*\)/,
    )
    assert.match(
      contents,
      /<KeybindingProvider[^>]+preDispatchRef=\{preDispatchRef\}>/,
    )
    assert.match(
      contents,
      /<ChordInterceptor[^>]+preDispatchRef=\{preDispatchRef\}/,
    )
    assert.match(
      contents,
      /for \(const handler of preDispatchRef\.current\) \{[\s\S]*?handler\(input, key\) === true[\s\S]*?stopPropagation\(\)/,
    )
    assert.match(
      contents,
      /handler\(input, key\) === true[\s\S]*?catch \{[\s\S]*?const resolvedByContext/,
    )

    const preDispatch = new Set()
    const calls = []
    preDispatch.add((input, key) => {
      calls.push(['observer', input, key.name])
    })
    preDispatch.add((input, key) => {
      calls.push(['consumer', input, key.name])
      return true
    })
    preDispatch.add(() => {
      calls.push(['unreachable'])
    })
    let stopped = 0
    for (const handler of preDispatch) {
      if (handler('x', { name: 'x' }) === true) {
        stopped++
        break
      }
    }
    assert.deepEqual(calls, [
      ['observer', 'x', 'x'],
      ['consumer', 'x', 'x'],
    ])
    assert.equal(stopped, 1)
  },
)

test(
  'the cumulative target110 single-key route remains intact',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const contents = source()
    assert.match(contents, /singleKey\?: boolean/)
    assert.match(contents, /if \(!registration\.singleKey\) continue/)
    assert.match(
      contents,
      /resolved\.type === 'match' \? resolved\.action : null/,
    )
    assert.match(
      contents,
      /registration\.handler\(\) !== false[\s\S]*?recordKeybindingFired\(action\)[\s\S]*?stopPropagation\(\)/,
    )
    assert.match(
      contents,
      /for \(const handler of preDispatchRef\.current\)[\s\S]*?const resolvedByContext/,
    )
  },
)
