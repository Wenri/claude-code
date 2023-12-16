import assert from 'node:assert/strict'
import { AsyncLocalStorage } from 'node:async_hooks'
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

const baselineUnits = {
  runner: {
    index: 12933,
    start: 8296332,
    end: 8296919,
    sourceHash:
      'df0b660f5919f19e8a27e078692a8a09e680570a7946bb18236a5d0682605b38',
  },
  tool: {
    index: 12942,
    start: 8297476,
    end: 8299288,
    sourceHash:
      '532f0b4f743fe08efa579d49d3fc655ca138642364fa5370b419ffca7474b3a5',
  },
}

const targetUnits = {
  notification: {
    index: 13060,
    start: 8342817,
    end: 8343133,
    sourceHash:
      '4e56eba96861c359482cee03ce12288c74fd77c07c1da1a91213f509f5b88a80',
  },
  callerResolver: {
    index: 13065,
    start: 8343984,
    end: 8344071,
    sourceHash:
      '56b25cc293ca3512ab1149f21a2acb8574c5f3706c3009fb17e999d022dd2ebe',
  },
  ownershipPredicate: {
    index: 13066,
    start: 8344071,
    end: 8344125,
    sourceHash:
      'bb238ce4fd33b612427306742b7b161176b382a20e9fc6cf5e72c9380a5ef9fe',
  },
  runner: {
    index: 13069,
    start: 8344239,
    end: 8345102,
    sourceHash:
      'cd57522b38c7b16300b2f0147d2ece03fdf89e75439739b232938149e00d6b51',
  },
  tool: {
    index: 13078,
    start: 8345671,
    end: 8347495,
    sourceHash:
      '77115a85c31d02f14a722c5a90e44030a6404232f2aa4a522ce2a32056edea85',
  },
}

const typedRows = [
  [589, 'ownerAgentId', 8342872, 8342884],
  [592, 'callerAgentId', 8344296, 8344309],
  [593, '"main session"', 8344562, 8344576],
  [594, ' is owned by ', 8344536, 8344549],
  [595, ' cannot stop it.', 8344589, 8344605],
  [596, '"not_owner"', 8344607, 8344618],
  [597, 'ownerAgentId', 8344998, 8345010],
  [598, 'callerAgentId', 8347332, 8347345],
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

async function transpileCommonJs(relative, requireStub) {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(source(relative), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const module = { exports: {} }
  new Function('exports', 'module', 'require', javascript)(
    module.exports,
    module,
    requireStub,
  )
  return module.exports
}

function createTaskRegistry(task) {
  let current = task
  return {
    get() {
      return current
    },
    update(_taskId, updater) {
      current = updater(current)
    },
    current() {
      return current
    },
  }
}

async function createStopTaskHarness(task) {
  const events = []
  const taskRegistry = createTaskRegistry(task)
  const taskImpl = {
    async kill(taskId, registry) {
      events.push({ type: 'kill', taskId, registry })
    },
  }
  const module = await transpileCommonJs(
    'src/tasks/stopTask.ts',
    specifier => {
      if (specifier.endsWith('/constants/xml.js')) {
        return {
          STATUS_TAG: 'status',
          SUMMARY_TAG: 'summary',
          TASK_ID_TAG: 'task-id',
          TASK_NOTIFICATION_TAG: 'task-notification',
          TOOL_USE_ID_TAG: 'tool-use-id',
        }
      }
      if (specifier === '../tasks.js') {
        return {
          getTaskByType(type) {
            events.push({ type: 'lookup', taskType: type })
            return taskImpl
          },
        }
      }
      if (specifier.endsWith('/types/ids.js')) {
        return { asAgentId: value => value }
      }
      if (specifier.endsWith('/utils/messageQueueManager.js')) {
        return {
          enqueuePendingNotification(notification) {
            events.push({ type: 'notification', notification })
          },
        }
      }
      if (specifier.endsWith('/utils/sdkEventQueue.js')) {
        return {
          emitTaskTerminatedSdk(taskId, status, options) {
            events.push({ type: 'sdk', taskId, status, options })
          },
        }
      }
      if (specifier.endsWith('/utils/xml.js')) {
        return {
          escapeXml(value) {
            return value
              .replaceAll('&', '&amp;')
              .replaceAll('<', '&lt;')
              .replaceAll('>', '&gt;')
              .replaceAll('"', '&quot;')
              .replaceAll("'", '&apos;')
          },
        }
      }
      if (specifier.endsWith('/LocalShellTask/guards.js')) {
        return { isLocalShellTask: value => value?.type === 'local_bash' }
      }
      throw new Error(`unexpected stopTask import: ${specifier}`)
    },
  )
  return { ...module, events, taskRegistry }
}

async function loadTaskStopToolHarness() {
  const calls = []
  const storage = new AsyncLocalStorage()
  const module = await transpileCommonJs(
    'src/tools/TaskStopTool/TaskStopTool.ts',
    specifier => {
      if (specifier === 'zod/v4') return { z: {} }
      if (specifier === '../../Tool.js') {
        return { buildTool: definition => definition }
      }
      if (specifier.endsWith('/tasks/stopTask.js')) {
        return {
          async stopTask(taskId, context) {
            calls.push({ taskId, context })
            return { taskId, taskType: 'local_bash', command: 'echo ok' }
          },
        }
      }
      if (specifier.endsWith('/types/ids.js')) {
        return { asAgentId: value => value }
      }
      if (specifier.endsWith('/utils/agentContext.js')) {
        return { getAgentContext: () => storage.getStore() }
      }
      if (specifier.endsWith('/utils/lazySchema.js')) {
        return { lazySchema: () => () => ({}) }
      }
      if (specifier.endsWith('/utils/slowOperations.js')) {
        return { jsonStringify: JSON.stringify }
      }
      if (specifier.endsWith('/prompt.js')) {
        return { DESCRIPTION: 'stop task', TASK_STOP_TOOL_NAME: 'TaskStop' }
      }
      if (specifier.endsWith('/UI.js')) {
        return { renderToolResultMessage() {}, renderToolUseMessage() {} }
      }
      throw new Error(`unexpected TaskStopTool import: ${specifier}`)
    },
  )
  return { TaskStopTool: module.TaskStopTool, calls, storage }
}

function localShellTask(agentId) {
  return {
    id: 'task<&',
    type: 'local_bash',
    status: 'running',
    description: 'agent <job>',
    toolUseId: 'tool<&',
    command: 'echo ok',
    notified: false,
    agentId,
  }
}

test(
  'target116 authenticates every task-stop ownership helper and runner',
  pairOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselineBundlePath)
    const targetBytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(baselineBytes), baselineSha256)
    assert.equal(sha256(targetBytes), targetSha256)
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')

    for (const unit of Object.values(baselineUnits)) {
      assert.equal(
        sha256(baseline.slice(unit.start, unit.end)),
        unit.sourceHash,
        `baseline structural unit ${unit.index}`,
      )
    }
    for (const unit of Object.values(targetUnits)) {
      const region = structural.regions[unit.index]
      assert.equal(region.classification, 'unresolved')
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [unit.start, unit.end, unit.sourceHash],
      )
      assert.equal(
        sha256(target.slice(unit.start, unit.end)),
        unit.sourceHash,
        `target structural unit ${unit.index}`,
      )
    }
    for (const [row, value, start, end] of typedRows) {
      assert.equal(target.slice(start, end), value, `typed-audit row ${row}`)
    }

    const baselineRunnerSource = baseline.slice(
      baselineUnits.runner.start,
      baselineUnits.runner.end,
    )
    const targetRunnerSource = target.slice(
      targetUnits.runner.start,
      targetUnits.runner.end,
    )
    assert.doesNotMatch(baselineRunnerSource, /callerAgentId|not_owner/)
    assert.match(targetRunnerSource, /callerAgentId/)
    assert.match(targetRunnerSource, /not_owner/)
    assert.match(targetRunnerSource, /main session/)
  },
)

test(
  'trusted and matching callers stop tasks, but mismatches fail before kill',
  sourceOptions,
  async () => {
    const trusted = await createStopTaskHarness(localShellTask('agent-owner'))
    const trustedResult = await trusted.stopTask('task<&', {
      taskRegistry: trusted.taskRegistry,
      setAppState() {},
      callerAgentId: undefined,
    })
    assert.equal(trustedResult.command, 'echo ok')
    assert.equal(trusted.events.filter(event => event.type === 'kill').length, 1)

    const matching = await createStopTaskHarness(localShellTask('agent-owner'))
    await matching.stopTask('task<&', {
      taskRegistry: matching.taskRegistry,
      setAppState() {},
      callerAgentId: 'agent-owner',
    })
    assert.equal(matching.events.filter(event => event.type === 'kill').length, 1)

    const mismatched = await createStopTaskHarness(
      localShellTask('agent-owner'),
    )
    await assert.rejects(
      mismatched.stopTask('task<&', {
        taskRegistry: mismatched.taskRegistry,
        setAppState() {},
        callerAgentId: 'agent-other',
      }),
      error => {
        assert.equal(error.code, 'not_owner')
        assert.equal(
          error.message,
          'Task task<& is owned by agent-owner; agent agent-other cannot stop it.',
        )
        return true
      },
    )
    assert.deepEqual(mismatched.events, [])

    const mainOwned = await createStopTaskHarness(localShellTask(undefined))
    await assert.rejects(
      mainOwned.stopTask('task<&', {
        taskRegistry: mainOwned.taskRegistry,
        setAppState() {},
        callerAgentId: 'agent-other',
      }),
      error => {
        assert.equal(error.code, 'not_owner')
        assert.match(error.message, /owned by main session/)
        return true
      },
    )
    assert.deepEqual(mainOwned.events, [])
  },
)

test(
  'trusted cross-owner stops notify the owner, while self-stops do not',
  sourceOptions,
  async () => {
    const trusted = await createStopTaskHarness(localShellTask('agent-owner'))
    await trusted.stopTask('task<&', {
      taskRegistry: trusted.taskRegistry,
      setAppState() {},
    })
    const notifications = trusted.events.filter(
      event => event.type === 'notification',
    )
    assert.equal(notifications.length, 1)
    assert.equal(notifications[0].notification.agentId, 'agent-owner')
    assert.equal(notifications[0].notification.priority, 'next')
    assert.equal(notifications[0].notification.mode, 'task-notification')
    assert.equal(
      notifications[0].notification.value,
      '<task-notification>\n' +
        '<task-id>task&lt;&amp;</task-id>\n' +
        '<tool-use-id>tool&lt;&amp;</tool-use-id>\n' +
        '<status>stopped</status>\n' +
        '<summary>Task &quot;agent &lt;job&gt;&quot; was stopped by main session</summary>\n' +
        '</task-notification>',
    )

    const matching = await createStopTaskHarness(localShellTask('agent-owner'))
    await matching.stopTask('task<&', {
      taskRegistry: matching.taskRegistry,
      setAppState() {},
      callerAgentId: 'agent-owner',
    })
    assert.equal(
      matching.events.filter(event => event.type === 'notification').length,
      0,
    )
  },
)

test(
  'TaskStopTool resolves direct and AsyncLocalStorage caller identities',
  sourceOptions,
  async () => {
    const harness = await loadTaskStopToolHarness()
    const baseContext = { taskRegistry: {}, setAppState() {} }

    await harness.storage.run({ agentId: 'agent-als' }, () =>
      harness.TaskStopTool.call(
        { task_id: 'direct-task' },
        { ...baseContext, agentId: 'agent-direct' },
      ),
    )
    assert.equal(harness.calls[0].context.callerAgentId, 'agent-direct')

    await harness.storage.run({ agentId: 'agent-als' }, () =>
      harness.TaskStopTool.call({ task_id: 'als-task' }, baseContext),
    )
    assert.equal(harness.calls[1].context.callerAgentId, 'agent-als')

    await harness.TaskStopTool.call({ task_id: 'trusted-task' }, baseContext)
    assert.equal(harness.calls[2].context.callerAgentId, undefined)
  },
)
