import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath || !latestPath
      ? 'authenticated 2.1.104, 2.1.105, and 2.1.116 bundles are required'
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
  [12758, ['unresolved', 9750636, 9752283, 'FunctionDeclaration', '191cecc40157f10ddfa6412b0b8f526017ed06d75c11b89398bc220a255fcd7e']],
  [12759, ['unresolved', 9752283, 9754495, 'FunctionDeclaration', '2f6ea650f301d2fe4900136682580fdc3a0a40c4ed7f7e9db10fc1e3d181086c']],
  [16680, ['unresolved', 11907037, 11926370, 'FunctionDeclaration', 'bbfda2bbc1ab4b17bc0517435055467eaf7d187192cca516cc4a64479d438be1']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
}

async function loadTypeScript() {
  const candidates = [
    path.resolve(
      path.dirname(process.execPath),
      '../lib/node_modules/typescript/lib/typescript.js',
    ),
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate, 'the pinned TypeScript compiler must be available')
  const module = await import(pathToFileURL(candidate).href)
  return module.default ?? module
}

function noopModule() {
  const noop = () => undefined
  return new Proxy(noop, {
    get: (_target, property) =>
      property === '__esModule' ? true : property === 'default' ? noop : noop,
  })
}

async function executeLogging(contents) {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(
    `${contents}\nexport { logAPISuccess }`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const events = []
  class APIError extends Error {}
  const module = { exports: {} }
  new Function('require', 'exports', 'module', 'MACRO', javascript)(
    id => {
      if (id === 'bun:bundle') return { feature: () => false }
      if (id === '@anthropic-ai/sdk') return { APIError }
      if (id.endsWith('/bootstrap/state.js')) {
        return {
          consumeInvokingRequestId: () => undefined,
          consumePostCompaction: () => false,
          getIsNonInteractiveSession: () => false,
          getLastApiCompletionTimestamp: () => null,
          getTeleportedSessionInfo: () => undefined,
          markFirstTeleportMessageLogged: () => undefined,
          setLastApiCompletionTimestamp: () => undefined,
          addToTotalDurationState: () => undefined,
        }
      }
      if (id.endsWith('/analytics/index.js')) {
        return { logEvent: (name, metadata) => events.push({ name, metadata }) }
      }
      if (id.endsWith('/analytics/metadata.js')) {
        return { sanitizeToolNameForAnalytics: value => value }
      }
      if (id.endsWith('/model/providers.js')) {
        return { getAPIProviderForStatsig: () => 'first-party' }
      }
      if (id.endsWith('/slowOperations.js')) {
        return { jsonStringify: JSON.stringify }
      }
      if (id.endsWith('/emptyUsage.js')) return { EMPTY_USAGE: {} }
      return noopModule()
    },
    module.exports,
    module,
    { BUILD_TIME: undefined },
  )
  return { logging: module.exports, events }
}

function successInput(overrides = {}) {
  return {
    model: 'claude-test',
    preNormalizedModel: 'claude-test',
    messageCount: 1,
    messageTokens: 10,
    usage: {
      input_tokens: 10,
      output_tokens: 2,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    durationMs: 50,
    durationMsIncludingRetries: 80,
    attempt: 2,
    ttftMs: 20,
    requestId: 'final-request',
    firstAttemptRequestId: 'first-request',
    stopReason: null,
    costUSD: 0.01,
    didFallBackToNonStreaming: true,
    querySource: 'repl_main_thread',
    ...overrides,
  }
}

test(
  'authenticated target105 pins first-request attribution across both logging layers and the retry caller',
  bundleOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(baselineBytes),
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
    )
    assert.equal(
      sha256(targetBytes),
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    )
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const latest = latestBytes.toString('utf8')

    for (const [index, [classification, start, end, nodeType, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, classification, `${index}: class`)
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        [start, end, nodeType, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }

    assert.equal(occurrences(baseline, 'firstAttemptRequestId'), 0)
    assert.equal(occurrences(target, 'firstAttemptRequestId'), 5)
    assert.equal(occurrences(latest, 'firstAttemptRequestId'), 5)
    assert.equal(
      occurrences(target.slice(9750636, 9752283), 'firstAttemptRequestId'),
      2,
    )
    assert.equal(
      occurrences(target.slice(9752283, 9754495), 'firstAttemptRequestId'),
      2,
    )
    assert.equal(
      occurrences(target.slice(11907037, 11926370), 'firstAttemptRequestId'),
      1,
    )
  },
)

test(
  'source root preserves the first streaming request across both non-streaming fallback paths',
  sourceOptions,
  () => {
    const logging = source('services/api/logging.ts')
    const claude = source('services/api/claude.ts')
    assert.equal(occurrences(logging, 'firstAttemptRequestId'), 9)
    assert.ok(logging.includes('firstAttemptRequestId !== requestId'))
    assert.ok(logging.includes('firstAttemptRequestId,'))
    assert.ok(
      claude.includes(
        'let firstAttemptRequestId: string | null | undefined = undefined',
      ),
    )
    assert.ok(claude.includes('firstAttemptRequestId = streamRequestId'))
    assert.ok(
      claude.includes(
        "(failedRequestId !== 'unknown' ? failedRequestId : null)",
      ),
    )
    assert.ok(
      claude.includes(
        'firstAttemptRequestId: firstAttemptRequestId ?? null',
      ),
    )
    assert.equal(occurrences(claude, 'firstAttemptRequestId'), 5)
  },
)

test(
  'executable success logger emits the first request only when fallback changed the request ID',
  sourceOptions,
  async () => {
    const { logging, events } = await executeLogging(
      source('services/api/logging.ts'),
    )
    logging.logAPISuccess(successInput())
    assert.equal(events.length, 1)
    assert.equal(events[0].name, 'tengu_api_success')
    assert.equal(events[0].metadata.requestId, 'final-request')
    assert.equal(events[0].metadata.firstAttemptRequestId, 'first-request')

    events.length = 0
    logging.logAPISuccess(
      successInput({ firstAttemptRequestId: 'final-request' }),
    )
    assert.equal(events[0].metadata.firstAttemptRequestId, undefined)

    events.length = 0
    logging.logAPISuccess(successInput({ requestId: null }))
    assert.equal(events[0].metadata.firstAttemptRequestId, undefined)
  },
)
