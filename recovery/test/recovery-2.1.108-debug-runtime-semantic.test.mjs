import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.107-to-2.1.108'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const targetPath = process.env.CLAUDE_CODE_2_1_108_BUNDLE
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

const identity = [
  145822,
  146824,
  'VariableDeclaration',
  '1e1e1577649a432d2a283a43ebecbb7be7f5e38b9af58181cb648f6907f36448',
  'changed',
]
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const source = relative =>
  fs.readFileSync(path.join(sourceRoot, relative), 'utf8')

function loadTargetDebugRuntime(fragment, argv = [], env = {}) {
  const processState = { argv: ['bun', 'cli.js', ...argv], env: { ...env } }
  const context = vm.createContext({
    Promise,
    process: processState,
    L: callback => callback,
    p4() {},
    v8() {},
    v9() {},
    HZ7() {},
    g8() {},
    _q() {},
    o8() {},
    W1: callback => callback,
    PG7: false,
    R6: value => ['1', 'true', 'yes', 'on'].includes(value?.toLowerCase()),
    $Z7: value => ({ pattern: value }),
    wY6: () => '',
    XG7: value => value,
    MG7: value => value,
    VD5: async () => {},
    kD5: async () => {},
  })
  vm.runInContext(fragment, context)
  vm.runInContext('_8()', context)
  return {
    debugFile: () => vm.runInContext('DG7()', context),
    debugFilter: () => vm.runInContext('ED5()', context),
    debugMode: () => vm.runInContext('jk()', context),
    debugToStderr: () => vm.runInContext('MC()', context),
    minLevel: () => vm.runInContext('ND5()', context),
  }
}

test(
  'target108 debug runtime is pinned to exact unit 900 and executes every flag branch',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetPath
        ? 'authenticated target108 bundle is required'
        : false,
  },
  () => {
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(targetBytes),
      'dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73',
    )
    const region = structural.regions.find(item => item.target?.index === 900)
    assert.deepEqual(
      [
        region.target.start,
        region.target.end,
        region.target.nodeType,
        region.target.sourceHash,
        region.classification,
      ],
      identity,
    )
    assert.equal(region.baselineUnitIndex, 897)
    assert.equal(region.pairReason, 'unique-coarse-structural-hash')

    const fragment = targetBytes.toString('utf8').slice(identity[0], identity[1])
    assert.equal(sha256(fragment), identity[3])

    assert.equal(loadTargetDebugRuntime(fragment).minLevel(), 'debug')
    assert.equal(
      loadTargetDebugRuntime(fragment, [], {
        CLAUDE_CODE_DEBUG_LOG_LEVEL: ' VERBOSE ',
      }).minLevel(),
      'verbose',
    )
    assert.equal(
      loadTargetDebugRuntime(fragment, [], {
        CLAUDE_CODE_DEBUG_LOG_LEVEL: 'invalid',
      }).minLevel(),
      'debug',
    )
    for (const argv of [
      ['--debug'],
      ['-d'],
      ['--debug=api'],
      ['--debug-to-stderr'],
      ['-d2e'],
      ['--debug-file=/tmp/debug.log'],
      ['--debug-file', '/tmp/debug.log'],
    ]) {
      assert.equal(loadTargetDebugRuntime(fragment, argv).debugMode(), true)
    }
    assert.equal(loadTargetDebugRuntime(fragment).debugMode(), false)
    assert.equal(
      loadTargetDebugRuntime(fragment, [], { DEBUG: 'true' }).debugMode(),
      true,
    )
    assert.equal(
      loadTargetDebugRuntime(fragment, ['--debug=api']).debugFilter().pattern,
      'api',
    )
    assert.equal(loadTargetDebugRuntime(fragment).debugFilter(), null)
    assert.equal(
      loadTargetDebugRuntime(fragment, ['--debug-to-stderr']).debugToStderr(),
      true,
    )
    assert.equal(
      loadTargetDebugRuntime(fragment, ['--debug-file=/tmp/a']).debugFile(),
      '/tmp/a',
    )
    assert.equal(
      loadTargetDebugRuntime(fragment, ['--debug-file', '/tmp/b']).debugFile(),
      '/tmp/b',
    )
    assert.equal(loadTargetDebugRuntime(fragment).debugFile(), null)
  },
)

test(
  'the semantic owner retains the complete target108 debug runtime',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const debug = source('utils/debug.ts')
    for (const fragment of [
      "export type DebugLogLevel = 'verbose' | 'debug' | 'info' | 'warn' | 'error'",
      'const LEVEL_ORDER: Record<DebugLogLevel, number>',
      'process.env.CLAUDE_CODE_DEBUG_LOG_LEVEL?.toLowerCase().trim()',
      'Object.hasOwn(LEVEL_ORDER, raw)',
      "return 'debug'",
      'isEnvTruthy(process.env.DEBUG)',
      'isEnvTruthy(process.env.DEBUG_SDK)',
      "process.argv.includes('--debug')",
      "process.argv.includes('-d')",
      "arg.startsWith('--debug=')",
      "process.argv.includes('--debug-to-stderr')",
      "process.argv.includes('-d2e')",
      "arg.startsWith('--debug-file=')",
      "arg === '--debug-file' && i + 1 < process.argv.length",
    ]) {
      assert.ok(debug.includes(fragment), fragment)
    }
  },
)
