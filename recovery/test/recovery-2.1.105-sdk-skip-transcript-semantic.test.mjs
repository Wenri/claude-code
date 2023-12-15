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
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
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
  [7418, ['FunctionDeclaration', 5238826, 5239039, '4db61f41fd00d92f5f54be80a3cd87290e4dc0c199923810e85e25eb235797b6']],
  [10211, ['FunctionDeclaration', 8296262, 8296779, 'e21ab5d7df961b0fd6a06c3d5d30d4b33f4b17c8a8a32dce905a5345aa933ad7']],
  [10235, ['VariableDeclaration', 8299675, 8335567, 'c7c382e007d7cffc57ad1927e2c4caf70af1cf012a0b70a467df10472563703b']],
  [11568, ['FunctionDeclaration', 9138261, 9138538, 'c5883aecf92fcbf3056bda72b72c615fcb81cfce09da22e7b1cec9f7cbd08e83']],
  [11570, ['FunctionDeclaration', 9138857, 9139012, '87ec34c1f95847ec9802acf6ad450e98c8ef2ab51a9354b8cf7df2e2c58ee863']],
  [11571, ['FunctionDeclaration', 9139012, 9139161, 'c290a70a396df0da071e27ef113002a7f7bafbc792c4e7bc58d7ff46a559e335']],
  [11573, ['VariableDeclaration', 9139176, 9139509, '644c19af65bbde9bd9b0aff846d570a66f12793387283f13c9c1e6d51be413c8']],
])

const typedRows = new Map([
  [99, [5239003, 5239018]],
  [190, [8296744, 8296759]],
  [193, [8330414, 8330429]],
  [194, [8330848, 8330863]],
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

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
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

test('authenticated target105 introduces the complete skip-transcript task graph', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  const latestBytes = fs.readFileSync(latestPath)
  assert.equal(sha256(baselineBytes), 'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39')
  assert.equal(sha256(targetBytes), '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75')
  assert.equal(sha256(latestBytes), 'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a')
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')
  const latest = latestBytes.toString('utf8')
  assert.equal(occurrences(baseline, 'skip_transcript'), 0)
  assert.equal(occurrences(target, 'skip_transcript'), 4)
  assert.equal(occurrences(latest, 'skip_transcript'), 4)
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
  for (const [, [start, end]] of typedRows) {
    assert.equal(target.slice(start, end), 'skip_transcript')
  }
  assert.match(target.slice(9138261, 9138538), /skipTranscript:!0/)
  for (const index of [11570, 11571, 11573]) {
    const [, , start, end] = [index, ...units.get(index)]
    assert.match(target.slice(start, end), /skipTranscript:!0/)
  }
})

test('authored source propagates skip-transcript from task state through both SDK bookends', sourceOptions, () => {
  const task = source('Task.ts')
  const queue = source('utils/sdkEventQueue.ts')
  const framework = source('utils/task/framework.ts')
  const dream = source('tasks/DreamTask/DreamTask.ts')
  const schemas = source('entrypoints/sdk/coreSchemas.ts')
  assert.match(task, /skipTranscript\?: boolean/)
  assert.match(framework, /skip_transcript: task\.skipTranscript/)
  assert.match(queue, /skip_transcript: opts\?\.skipTranscript/)
  assert.equal(occurrences(dream, 'skipTranscript: true'), 4)
  assert.match(schemas, /SDKTaskNotificationMessageSchema[\s\S]*skip_transcript: z\.boolean\(\)\.optional\(\)/)
  assert.match(schemas, /SDKTaskStartedMessageSchema[\s\S]*Ambient\/housekeeping task/)
})

test('task start and terminal emitters preserve the ambient-task flag at runtime', sourceOptions, async () => {
  const queueJavaScript = await compileCommonJs(source('utils/sdkEventQueue.ts'))
  const queueModule = { exports: {} }
  new Function('require', 'module', 'exports', queueJavaScript)(
    id => {
      if (id === 'crypto') return crypto
      if (id.endsWith('/bootstrap/state.js')) {
        return {
          getIsNonInteractiveSession: () => true,
          getSessionId: () => 'session-1',
        }
      }
      throw new Error(`unexpected queue import: ${id}`)
    },
    queueModule,
    queueModule.exports,
  )
  queueModule.exports.emitTaskTerminatedSdk('dream-1', 'completed', { skipTranscript: true })
  const [terminal] = queueModule.exports.drainSdkEvents()
  assert.equal(terminal.skip_transcript, true)
  assert.equal(terminal.subtype, 'task_notification')

  const registerTask = await extractFunction('utils/task/framework.ts', 'registerTask')
  const registerJavaScript = await compileCommonJs(`
    type TaskState = any
    type SetAppState = any
    const events: any[] = []
    const enqueueSdkEvent = (event: any) => events.push(event)
    ${registerTask}
    module.exports = { registerTask, events }
  `)
  const registerModule = { exports: {} }
  new Function('module', 'exports', registerJavaScript)(registerModule, registerModule.exports)
  let state = { tasks: {} }
  registerModule.exports.registerTask(
    {
      id: 'dream-1', type: 'dream', status: 'running', description: 'dreaming',
      startTime: 1, outputFile: '', outputOffset: 0, notified: false, skipTranscript: true,
    },
    update => { state = update(state) },
  )
  assert.equal(registerModule.exports.events.length, 1)
  assert.equal(registerModule.exports.events[0].skip_transcript, true)
  assert.equal(registerModule.exports.events[0].subtype, 'task_started')
})
