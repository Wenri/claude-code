import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'

const unitPairs = [
  {
    owner: 'src/tools/AgentTool/agentToolUtils.ts',
    baseline: {
      index: 12039,
      start: 7652080,
      end: 7654491,
      sourceHash:
        '2c199875ce8771d7ac828b0877f43484aff711f1c6c79fd2a3625f58ab63d24e',
    },
    target: {
      index: 12148,
      start: 7692695,
      end: 7695304,
      sourceHash:
        'd26b811290dd9cd2155b3a26070a941c75620435d23d40adaa625d2f843c252c',
    },
  },
  {
    owner: 'src/tools/AgentTool/AgentTool.tsx',
    baseline: {
      index: 12408,
      start: 7802106,
      end: 7819865,
      sourceHash:
        '6acd0625528dc548a23cddb8489275b5f8493164c10390dad83f685fda681452',
    },
    target: {
      index: 12531,
      start: 7846319,
      end: 7864084,
      sourceHash:
        'b7a3df6f396b1c6c22e5081d66be1dfab9b109b859855f7a53993b578a147b2d',
    },
  },
  {
    owner: 'src/tools/AgentTool/resumeAgent.ts',
    baseline: {
      index: 13413,
      start: 8517360,
      end: 8520077,
      sourceHash:
        'a22f127fdb03cb1068891f2f642a8f4cdea1f1ef5608c397e5e0b7a97c8b1c49',
    },
    target: {
      index: 13552,
      start: 8566042,
      end: 8568779,
      sourceHash:
        'cbc90cc3c68f8789c7aeff3f17ecc1649d4f461ef20c105856153eee84b95524',
    },
  },
]

const literalPins = [
  {
    reportRow: 454,
    value: 'query_progress',
    start: 7693663,
    end: 7693679,
    source: '"query_progress"',
  },
  {
    addedOwnerResidueRow: 314,
    value: 'system:',
    start: 7693845,
    end: 7693852,
    source: 'system:',
  },
]

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
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

async function instantiateLifecycle() {
  const ts = await loadTypeScript()
  const owner = source('src/tools/AgentTool/agentToolUtils.ts')
  const sourceFile = ts.createSourceFile(
    'agentToolUtils.ts',
    owner,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const declaration = sourceFile.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'runAsyncAgentLifecycle',
  )
  assert.ok(declaration, 'runAsyncAgentLifecycle declaration must be present')
  const isolated = owner.slice(declaration.getStart(sourceFile), declaration.end)
  const javascript = ts.transpileModule(isolated, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText

  return dependencies => {
    const module = { exports: {} }
    const names = Object.keys(dependencies)
    const values = Object.values(dependencies)
    new Function(...names, 'module', 'exports', javascript)(
      ...values,
      module,
      module.exports,
    )
    return module.exports.runAsyncAgentLifecycle
  }
}

function createHarness(makeStream) {
  const state = {
    now: 10_000,
    timers: [],
    debug: [],
    events: [],
    failures: [],
    notifications: [],
    aborted: false,
    cleaned: [],
    appState: { tasks: { task: { retain: false } } },
  }
  const fakeSetTimeout = (callback, delay) => {
    const timer = {
      callback,
      delay,
      cleared: false,
      unref() {},
    }
    state.timers.push(timer)
    return timer
  }
  const fakeClearTimeout = timer => {
    timer.cleared = true
  }
  state.latestTimer = () =>
    state.timers.findLast(timer => timer.cleared === false)

  const dependencies = {
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    Date: { now: () => state.now },
    createProgressTracker: () => ({}),
    createActivityDescriptionResolver: () => () => undefined,
    startAgentSummarization: () => ({ stop() {} }),
    asAgentId: value => value,
    logForDebugging: (message, options) =>
      state.debug.push({ message, options }),
    logEvent: (name, metadata) => state.events.push({ name, metadata }),
    failAsyncAgent: (taskId, message) =>
      state.failures.push({ taskId, message }),
    extractPartialResult: () => undefined,
    enqueueAgentNotification: notification =>
      state.notifications.push(notification),
    isLocalAgentTask: () => true,
    updateProgressFromMessage() {},
    updateAsyncAgentProgress() {},
    getProgressUpdate: () => ({}),
    getLastToolUseName: () => undefined,
    emitTaskProgress() {},
    clearInvokedSkillsForAgent: agentId => state.cleaned.push(agentId),
    clearDumpState: agentId => state.cleaned.push(agentId),
  }

  const args = {
    taskId: 'task',
    abortController: {
      abort() {
        state.aborted = true
      },
      signal: {},
    },
    makeStream,
    metadata: {
      agentType: 'researcher',
      resolvedAgentModel: 'model',
      startTime: 1,
      isBuiltInAgent: false,
    },
    description: 'background work',
    toolUseContext: {
      taskRegistry: { update() {} },
      options: { tools: [] },
      toolUseId: 'parent-tool-use',
    },
    rootSetAppState(update) {
      state.appState = update(state.appState)
    },
    agentIdForCleanup: 'agent-cleanup',
    enableSummarization: false,
    getWorktreeResult: async () => ({}),
  }
  return { state, dependencies, args }
}

test('target 2.1.116 pins query-progress watchdog reset and both live callers', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  assert.equal(sha256(baseline), baselineSha256)
  assert.equal(sha256(target), targetSha256)

  for (const pair of unitPairs) {
    const baselineRegion = structural.unmatchedBaseline.find(
      unit => unit.index === pair.baseline.index,
    )
    assert.ok(baselineRegion, `${pair.owner}: baseline unit`)
    assert.deepEqual(
      [baselineRegion.start, baselineRegion.end, baselineRegion.sourceHash],
      [pair.baseline.start, pair.baseline.end, pair.baseline.sourceHash],
    )
    assert.equal(
      sha256(baseline.slice(pair.baseline.start, pair.baseline.end)),
      pair.baseline.sourceHash,
      `${pair.owner}: baseline bytes`,
    )

    const targetRegion = structural.regions[pair.target.index]
    assert.equal(targetRegion.classification, 'unresolved')
    assert.deepEqual(
      [
        targetRegion.target.start,
        targetRegion.target.end,
        targetRegion.target.sourceHash,
      ],
      [pair.target.start, pair.target.end, pair.target.sourceHash],
    )
    assert.equal(
      sha256(target.slice(pair.target.start, pair.target.end)),
      pair.target.sourceHash,
      `${pair.owner}: target bytes`,
    )
  }

  for (const pin of literalPins) {
    assert.equal(target.slice(pin.start, pin.end), pin.source)
  }

  const baselineLifecycle = baseline.slice(
    unitPairs[0].baseline.start,
    unitPairs[0].baseline.end,
  )
  const targetLifecycle = target.slice(
    unitPairs[0].target.start,
    unitPairs[0].target.end,
  )
  assert.doesNotMatch(baselineLifecycle, /query_progress/)
  assert.match(targetLifecycle, /query_progress/)
  assert.match(targetLifecycle, /Math\.min\([^)]*0\.1,1000\)/)
  assert.match(targetLifecycle, /system:\$\{/)
})

test('source forwards the heartbeat through both runAgent call sites', sourceOptions, () => {
  const lifecycle = source('src/tools/AgentTool/agentToolUtils.ts')
  const agentTool = source('src/tools/AgentTool/AgentTool.tsx')
  const resumeAgent = source('src/tools/AgentTool/resumeAgent.ts')

  assert.match(lifecycle, /lastQueryProgressAt = 0/)
  assert.match(
    lifecycle,
    /queryProgressThrottleMs = Math\.min\(stallTimeoutMs \* 0\.1, 1000\)/,
  )
  assert.match(lifecycle, /lastMessageType = 'query_progress'/)
  assert.match(lifecycle, /`system:\$\{message\.subtype\}`/)
  assert.match(
    lifecycle,
    /makeStream\(\s*onCacheSafeParams,\s*onQueryProgress,?\s*\)/,
  )
  for (const caller of [agentTool, resumeAgent]) {
    assert.match(
      caller,
      /makeStream:\s*\(onCacheSafeParams, onQueryProgress\)\s*=>/,
    )
    assert.match(caller, /onCacheSafeParams,\s*onQueryProgress/)
  }
})

test('actual lifecycle throttles query heartbeats and records their stall label', sourceOptions, async () => {
  const instantiate = await instantiateLifecycle()
  let harness
  const makeStream = async function* (_onCacheSafeParams, onQueryProgress) {
    assert.equal(typeof onQueryProgress, 'function')
    harness.state.now = 10_000
    onQueryProgress()
    assert.equal(harness.state.timers.length, 2, 'first heartbeat resets')
    harness.state.now = 10_500
    onQueryProgress()
    assert.equal(harness.state.timers.length, 2, 'sub-second heartbeat throttles')
    harness.state.now = 11_100
    onQueryProgress()
    assert.equal(harness.state.timers.length, 3, 'later heartbeat resets')
    harness.state.latestTimer().callback()
  }
  harness = createHarness(makeStream)
  const runAsyncAgentLifecycle = instantiate(harness.dependencies)
  await runAsyncAgentLifecycle(harness.args)

  assert.equal(harness.state.aborted, true)
  assert.equal(harness.state.events[0].name, 'tengu_async_agent_stall_timeout')
  assert.deepEqual(harness.state.events[0].metadata, {
    agent_type: 'researcher',
    stall_ms: 600_000,
    last_message_type: 'query_progress',
    message_count: 0,
  })
  assert.equal(harness.state.failures.length, 1)
  assert.equal(harness.state.notifications[0].status, 'failed')
  assert.deepEqual(harness.state.cleaned, ['agent-cleanup', 'agent-cleanup'])
})

test('actual lifecycle records system subtypes in watchdog diagnostics', sourceOptions, async () => {
  const instantiate = await instantiateLifecycle()
  let harness
  const makeStream = async function* () {
    yield { type: 'system', subtype: 'ready' }
    harness.state.latestTimer().callback()
  }
  harness = createHarness(makeStream)
  const runAsyncAgentLifecycle = instantiate(harness.dependencies)
  await runAsyncAgentLifecycle(harness.args)

  assert.equal(harness.state.events[0].metadata.last_message_type, 'system:ready')
  assert.equal(harness.state.events[0].metadata.message_count, 1)
  assert.equal(harness.state.aborted, true)
})
