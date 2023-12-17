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
  [579, ['unresolved', 45784, 45831, 'ea13d746306e57856ddcd4b0ba736d1dab1fb9fd151716c13669e41e7ed15722']],
  [580, ['unresolved', 45831, 46080, 'a6373d2aa37a5c5bef5b612261525cab8aa99979adf8d882ae674be7040be8e9']],
  [581, ['unresolved', 46080, 46205, '6df802841531aecdd417f37ae5cb85f65d60272d3f4cfcc2c94aa3fba87b42f5']],
  [582, ['unresolved', 46205, 46349, 'd337d0557405d8ba3f9cd6e93b1bb59f7801b5ee773d29e0e493c58bd606c6a7']],
  [583, ['moved', 46349, 46357, '5bd9be3d9f400a00cd5f1f2fd98f1a14406e4df19b714dd16a655e19343f9458']],
  [584, ['unresolved', 46357, 46383, '5ce1841581fbd0c6ce163096607848f1bcb2dcf1100a452dfd0bfa650e75d62d']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source() {
  return fs.readFileSync(
    path.join(sourceRoot, 'services/analytics/index.ts'),
    'utf8',
  )
}

function functionSource(contents, name, prefix = 'export function') {
  const start = contents.indexOf(`${prefix} ${name}(`)
  assert.notEqual(start, -1, `${name}: declaration`)
  const body = contents.indexOf('{', start)
  let depth = 0
  for (let index = body; index < contents.length; index++) {
    if (contents[index] === '{') depth++
    else if (contents[index] === '}' && --depth === 0) {
      return contents.slice(start, index + 1)
    }
  }
  throw new Error(`${name}: unterminated declaration`)
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

test(
  'target105 pins the complete analytics state-object boundary',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath || !latestPath
        ? 'authenticated 2.1.104, 2.1.105, and 2.1.116 bundles are required'
        : false,
  },
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
    for (const [index, [classification, start, end, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, classification, `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }
    assert.equal((baseline.match(/eventQueue/g) ?? []).length, 0)
    assert.equal((target.match(/eventQueue/g) ?? []).length, 6)
    assert.equal((latest.match(/eventQueue/g) ?? []).length, 6)
    assert.equal(target.includes('analytics_sink_attached'), false)
    assert.equal(latest.includes('analytics_sink_attached'), false)
  },
)

test(
  'authored analytics state queues, drains, dispatches, and resets exactly',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const owner = source()
    for (const fragment of [
      'export function createAnalyticsState(): AnalyticsState',
      'return { eventQueue: [], sink: null }',
      'let globalAnalyticsState = createAnalyticsState()',
      'const state = globalAnalyticsState',
      'const queuedEvents = state.eventQueue',
      'state.eventQueue = []',
      'void newSink.logEventAsync(event.eventName, event.metadata)',
      'newSink.logEvent(event.eventName, event.metadata)',
      'globalAnalyticsState = createAnalyticsState()',
    ]) assert.ok(owner.includes(fragment), fragment)
    assert.equal(owner.includes('analytics_sink_attached'), false)

    const declarations = [
      functionSource(owner, 'createAnalyticsState'),
      functionSource(owner, 'attachAnalyticsSink'),
      functionSource(owner, 'logEvent'),
      functionSource(owner, 'logEventAsync', 'export async function'),
      functionSource(owner, '_resetForTesting'),
    ].join('\n')
    const ts = await loadTypeScript()
    const javascript = ts.transpileModule(
      `
type LogEventMetadata = Record<string, unknown>;
type QueuedEvent = { eventName: string; metadata: LogEventMetadata; async: boolean };
type AnalyticsSink = { logEvent(name: string, metadata: LogEventMetadata): void; logEventAsync(name: string, metadata: LogEventMetadata): Promise<void> };
type AnalyticsState = { eventQueue: QueuedEvent[]; sink: AnalyticsSink | null };
const microtasks: Array<() => void> = [];
const queueMicrotask = (callback: () => void) => microtasks.push(callback);
${declarations}
let globalAnalyticsState = createAnalyticsState();
export const __drain = () => { for (const callback of microtasks.splice(0)) callback() };
export const __state = () => globalAnalyticsState;
`,
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText
    const module = { exports: {} }
    new Function('exports', 'module', javascript)(module.exports, module)
    const calls = []
    module.exports.logEvent('sync-before', { value: 1 })
    await module.exports.logEventAsync('async-before', { value: 2 })
    const sink = {
      logEvent: (name, metadata) => calls.push(['sync', name, metadata]),
      logEventAsync: async (name, metadata) =>
        calls.push(['async', name, metadata]),
    }
    module.exports.attachAnalyticsSink(sink)
    assert.equal(calls.length, 0, 'queued events drain in a microtask')
    module.exports.__drain()
    assert.deepEqual(calls, [
      ['sync', 'sync-before', { value: 1 }],
      ['async', 'async-before', { value: 2 }],
    ])
    module.exports.logEvent('sync-after', { value: 3 })
    await module.exports.logEventAsync('async-after', { value: 4 })
    assert.deepEqual(calls.slice(2), [
      ['sync', 'sync-after', { value: 3 }],
      ['async', 'async-after', { value: 4 }],
    ])
    const attached = module.exports.__state()
    module.exports.attachAnalyticsSink({
      logEvent() {
        throw new Error('second sink must not attach')
      },
      async logEventAsync() {
        throw new Error('second sink must not attach')
      },
    })
    assert.equal(module.exports.__state(), attached)
    module.exports._resetForTesting()
    assert.notEqual(module.exports.__state(), attached)
    assert.deepEqual(module.exports.__state(), {
      eventQueue: [],
      sink: null,
    })
  },
)
