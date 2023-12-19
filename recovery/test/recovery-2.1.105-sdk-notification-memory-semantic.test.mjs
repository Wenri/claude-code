import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = { skip: selected ? false : `not applicable to ${semanticCase}` }
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath || !latestPath
      ? 'authenticated 2.1.104, 2.1.105, and 2.1.116 bundles are required'
      : false,
}

const units = new Map([
  [10235, ['VariableDeclaration', 8299675, 8335567, 'c7c382e007d7cffc57ad1927e2c4caf70af1cf012a0b70a467df10472563703b']],
  [11672, ['VariableDeclaration', 9170849, 9176941, '062b0d42bb7c8b2b3181720b111ce7f365f2dff2e3f6c163a4d58e8b6eb5e847']],
  [12732, ['FunctionDeclaration', 9725317, 9730282, '643c8a934688519f99c8c02a882a5259b07aeb586ee069c8e5afa45cf0190222']],
  [12795, ['FunctionDeclaration', 9772875, 9773226, 'c8876b31bf933e6691ebe6cc67b8d153b00ef5f9dc11a5a61263c3b6947d9548']],
  [18929, ['FunctionDeclaration', 13409881, 13409952, 'b549e4e268123a51a89ba1b0260e8011b12a1f341b3cda491c360090bcbfb7b3']],
  [18930, ['FunctionDeclaration', 13409952, 13410243, 'b53c07e4ff4532e4f638a530577862abd2d3edc44dff196a435eac54c9d8d703']],
  [18934, ['ClassDeclaration', 13410330, 13426994, '9c1d060ead7a059c35f7a2f11f846cedaa050565fe4fcc62e0d5a1f6651204c5']],
])

const typedRows = new Map([
  [195, [8330896, 8331017]],
  [196, [8332219, 8332372]],
  [197, [8332937, 8332952]],
  [198, [8332976, 8332988]],
  [199, [8333000, 8333180]],
  [200, [8333234, 8333350]],
  [201, [8333425, 8333547]],
  [202, [8333595, 8333782]],
  [289, [9728426, 9728452]],
  [666, [13410050, 13410065]],
])

const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(repositoryRoot, 'recovery/cases', caseName, 'structural/generated-delta.json.gz'),
    ),
  ),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

async function loadTypeScript() {
  const candidates = [
    path.resolve(path.dirname(process.execPath), '../lib/node_modules/typescript/lib/typescript.js'),
    path.join(repositoryRoot, '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js'),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate, 'the pinned TypeScript compiler must be available')
  const module = await import(pathToFileURL(candidate).href)
  return module.default ?? module
}

async function extractFunction(relative, name) {
  const ts = await loadTypeScript()
  const owner = source(relative)
  const parsed = ts.createSourceFile(relative, owner, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const declaration = parsed.statements.find(
    statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  )
  assert.ok(declaration, `${name} declaration`)
  return declaration.getText(parsed).replace(/^export\s+/, '')
}

async function compileCommonJs(contents) {
  const ts = await loadTypeScript()
  return ts.transpileModule(contents, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
}

test('authenticated target105 introduces SDK notification and memory-recall delivery', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  const latestBytes = fs.readFileSync(latestPath)
  assert.equal(sha256(baselineBytes), 'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39')
  assert.equal(sha256(targetBytes), '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75')
  assert.equal(sha256(latestBytes), 'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a')
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')
  const latest = latestBytes.toString('utf8')
  for (const [index, [nodeType, start, end, hash]] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.index, region.target.nodeType, region.target.start, region.target.end, region.target.sourceHash],
      [index, nodeType, start, end, hash],
      `${index}: identity`,
    )
    assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
  }
  for (const [index, [start, end]] of typedRows) {
    assert.ok(target.slice(start, end).length > 0, `${index}: exact typed range`)
  }
  const schemaDescription = 'Loop-side text notification. Mirrors the interactive REPL notification queue (key/priority/timeout). JSX notifications are not emitted on this channel.'
  assert.ok(!baseline.includes(schemaDescription))
  assert.ok(target.includes(schemaDescription))
  assert.ok(latest.includes(schemaDescription))
  assert.ok(!baseline.includes('subtype:"memory_recall"'))
  assert.ok(target.includes('subtype:y.literal("memory_recall")'))
  assert.ok(target.slice(9170849, 9176941).includes('timeout_ms:1e4'))
  assert.ok(target.slice(9725317, 9730282).includes('if(A.addNotification?.'))
  assert.ok(target.slice(9725317, 9730282).includes(',!w)Xv({type:"system",subtype:"notification"'))
  assert.ok(target.slice(9772875, 9773226).includes('subtype:"notification"'))
  assert.ok(target.slice(13409881, 13409952).includes('startsWith'))
  assert.ok(target.slice(13409952, 13410243).includes('subtype:"memory_recall"'))
  assert.ok(target.slice(13410330, 13426994).includes('attachment.type==="relevant_memories"'))
})

test('authored source wires every SDK notification producer and both schemas', sourceOptions, () => {
  const schemas = source('entrypoints/sdk/coreSchemas.ts')
  const queue = source('utils/sdkEventQueue.ts')
  const exitPlan = source('tools/ExitPlanModeTool/ExitPlanModeV2Tool.ts')
  const stopHooks = source('query/stopHooks.ts')
  const compact = source('services/compact/compact.ts')
  const queryEngine = source('QueryEngine.ts')
  for (const fragment of [
    'SDKNotificationMessageSchema',
    'SDKMemoryRecallMessageSchema',
    'Loop-side text notification.',
    'Recalled from memory',
    'SDKNotificationMessageSchema()',
    'SDKMemoryRecallMessageSchema()',
  ]) assert.ok(schemas.includes(fragment), `schema fragment: ${fragment}`)
  assert.match(queue, /type NotificationSdkEvent = [\s\S]*timeout_ms\?: number/)
  assert.match(exitPlan, /enqueueSdkEvent\(\{[\s\S]*auto-mode-gate-plan-exit-fallback[\s\S]*timeout_ms: 10000/)
  assert.match(stopHooks, /if \(!stopHookActive\) \{[\s\S]*subtype: 'notification'[\s\S]*Stop hook error occurred/)
  assert.match(compact, /addErrorNotificationIfNeeded[\s\S]*enqueueSdkEvent\(\{[\s\S]*error-compacting-conversation/)
  assert.match(queryEngine, /getSdkMemoryRecallEvent[\s\S]*subtype: 'memory_recall'/)
  assert.match(queryEngine, /attachment\.type === 'relevant_memories'[\s\S]*yield memoryRecall/)
})

test('memory recall preserves select/synthesis scope and content semantics', sourceOptions, async () => {
  const extractDirectory = await extractFunction('QueryEngine.ts', 'getSynthesisMemoryDirectory')
  const convert = await extractFunction('QueryEngine.ts', 'getSdkMemoryRecallEvent')
  const javascript = await compileCommonJs(`
    type SDKMessage = any
    const SYNTHESIS_MEMORY_PREFIX = '<synthesis:'
    const memoryScopeForPath = (value: string) => value.includes('/team/') ? 'team' : value.includes('/personal/') ? 'personal' : null
    const randomUUID = () => 'uuid-1'
    const getSessionId = () => 'session-1'
    ${extractDirectory}
    ${convert}
    module.exports = { getSdkMemoryRecallEvent }
  `)
  const module = { exports: {} }
  new Function('module', 'exports', javascript)(module, module.exports)
  assert.equal(module.exports.getSdkMemoryRecallEvent([]), undefined)
  assert.deepEqual(
    module.exports.getSdkMemoryRecallEvent([
      { path: '/team/a.md', content: 'do not emit' },
      { path: '/unknown/b.md', content: 'do not emit either' },
    ]),
    {
      type: 'system', subtype: 'memory_recall', mode: 'select',
      memories: [
        { path: '/team/a.md', scope: 'team' },
        { path: '/unknown/b.md', scope: 'personal' },
      ],
      uuid: 'uuid-1', session_id: 'session-1',
    },
  )
  assert.deepEqual(
    module.exports.getSdkMemoryRecallEvent([
      { path: '<synthesis:/team/project>', content: 'distilled' },
    ]),
    {
      type: 'system', subtype: 'memory_recall', mode: 'synthesize',
      memories: [
        { path: '<synthesis:/team/project>', scope: 'team', content: 'distilled' },
      ],
      uuid: 'uuid-1', session_id: 'session-1',
    },
  )
})

test('compaction mirrors only user-visible errors onto the SDK notification channel', sourceOptions, async () => {
  const addError = await extractFunction('services/compact/compact.ts', 'addErrorNotificationIfNeeded')
  const javascript = await compileCommonJs(`
    type ToolUseContext = any
    const ERROR_MESSAGE_USER_ABORT = 'aborted'
    const ERROR_MESSAGE_NOT_ENOUGH_MESSAGES = 'not enough'
    const ERROR_MESSAGE_COMPACTION_BLOCKED = 'blocked:'
    const events: any[] = []
    const enqueueSdkEvent = (event: any) => events.push(event)
    const hasExactErrorMessage = (error: unknown, value: string) => error instanceof Error && error.message === value
    ${addError}
    module.exports = { addErrorNotificationIfNeeded, events }
  `)
  const module = { exports: {} }
  new Function('module', 'exports', javascript)(module, module.exports)
  const ui = []
  const context = { addNotification: value => ui.push(value) }
  module.exports.addErrorNotificationIfNeeded(new Error('boom'), context)
  assert.deepEqual(ui[0], {
    key: 'error-compacting-conversation', text: 'Error compacting conversation',
    priority: 'immediate', color: 'error',
  })
  assert.deepEqual(module.exports.events[0], {
    type: 'system', subtype: 'notification', key: 'error-compacting-conversation',
    text: 'Error compacting conversation', priority: 'immediate', color: 'error',
  })
  module.exports.addErrorNotificationIfNeeded(new Error('aborted'), context)
  assert.equal(module.exports.events.length, 1)
})
