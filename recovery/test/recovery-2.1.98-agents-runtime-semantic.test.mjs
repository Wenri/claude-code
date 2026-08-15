import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.97-to-2.1.98'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_98_BUNDLE
const targetSha256 =
  '27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556'
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_98_BUNDLE is not set'
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

const pinnedUnits = new Map([
  [7824, ['unresolved', 6512472, 6514293, 'b1df5328eec6cb26bca8ddb38756be0b231f872b755566e70a11b697c7297010']],
  [11855, ['unresolved', 9047317, 9064818, '5e0a0d669db0ce419cd3886b7da685b4a87d60d45f85fa9fbb266700c0b0dd48']],
  [15419, ['unresolved', 11312510, 11318293, '13ff1476ff2a0317c9239cc8b0e1fefaa56cba869b2c9bedaf82f06d33dce3d9']],
  [15481, ['unresolved', 11352787, 11352929, 'c5bcbd4a2e03e4d9a360c0170190e7983e1f9946a0b57c01d86f1fecc87544f4']],
  [15482, ['unresolved', 11352929, 11353073, '26429fac4745f0deb0c8a9387a9e602ebda1adce53832d5e74b1412637f2c4ab']],
  [15483, ['unresolved', 11353073, 11353168, '5232a9e6541f1da2bed70744b585b647fe93decb2bf21f2c4d064c08eada4eff']],
  [15484, ['unresolved', 11353168, 11356668, '60be68fee6fc406db0ea23b00507173df1b3fc56d1c738044ca15fd489bce185']],
  [15485, ['unresolved', 11356668, 11356698, '1138faa64ae305cc64b7a3c565cba9748cec7a5350442c83c291a84d4e3a71ae']],
  [15486, ['moved', 11356698, 11356725, '8adc3b8e9894dec750140ba603032120c2fd22ba286fbe2c1080b24d1f5de397']],
  [15487, ['unresolved', 11356725, 11356779, '543034eed86700eb286d31293a65ad5281980a8b402a347592c941c702197602']],
  [15488, ['unresolved', 11356779, 11356828, 'fdd2b584537371ebe532efaa766b80aa2c4a1f37dc86afddb8444697902b89a6']],
  [15489, ['unresolved', 11356828, 11356871, 'f5db936c97df5abefd4c3f38b1f187d479427300ac335ee68514bcee7e955707']],
  [15490, ['moved', 11356871, 11356902, '593bd64c0af2cc6b8d060082212b4313119c62bd404af3743f0696e7c2ca9164']],
  [15491, ['moved', 11356902, 11356913, '79103c4244159d24dcbf402855fde5afa419ab6d09df3a9822903d1450eee5f4']],
  [15492, ['unresolved', 11356913, 11357010, 'bcf43d470c328eee9fb9e2079b6338c858148f78d733284944cc7d59eccc0ef8']],
  [15493, ['unresolved', 11357010, 11370560, '1686c14940ac28d4f94e28460e13c136df408a8799801bcd7b7f6f2ec2c5538a']],
  [15501, ['unresolved', 11370899, 11370953, '15c1b71850f808a44ea9dda9ce86ccfab1b3ec450f54ef9320ba24b25ee7fdb4']],
  [18734, ['unresolved', 13342894, 13399271, '3206870e61dba6dc07b8f3ae726cf9c776a7836a5b7d63f8a880c57c56c3c77d']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function assertFragments(relative, fragments) {
  const text = source(relative)
  for (const fragment of fragments) {
    assert.ok(text.includes(fragment), `${relative}: ${fragment}`)
  }
  return text
}

test('target98 pins the complete Agents runtime and state graph', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), targetSha256)
  const bundle = bytes.toString('utf8')

  for (const [index, [classification, start, end, sourceHash]] of pinnedUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, classification, `${index}: class`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
  }

  for (const fragment of [
    'agentTypesInvokedThisSession:new Set',
    'No subagents are currently running.',
    'Recently completed',
    'View running instance',
    'Enter a prompt for this subagent',
    'No agents found. Create specialized subagents that Claude can delegate to.',
    'submitNextInput:!0',
  ]) {
    assert.ok(bundle.includes(fragment), fragment)
  }

  const invocation = bundle.indexOf('agentTypesInvokedThisSession.has')
  const selectionEvent = bundle.indexOf('tengu_agent_tool_selected', invocation)
  assert.ok(invocation >= 0 && invocation < selectionEvent)
})

test('source recovers Running tab ordering, summaries, stopping, and foregrounding', sourceOptions, () => {
  const running = assertFragments('src/components/agents/RunningAgents.tsx', [
    "task.type === 'local_agent'",
    "task.agentType !== 'main-session'",
    "task.status !== 'completed'",
    "task.status === 'completed'",
    '.sort((a, b) => a.startTime - b.startTime)',
    '.sort((a, b) => (b.endTime ?? 0) - (a.endTime ?? 0))',
    '.slice(0, 5)',
    'new Map<string, string>()',
    'result.set(taskId, name)',
    'setInterval(() => forceDurationRefresh(value => value + 1), 1000)',
    "event.key === 'return'",
    'enterTeammateView(selectedTask.id, setAppState)',
    "event.key === 'x' && selectedTask.status === 'running'",
    'selectedTask.abortController?.abort()',
    'task.progress?.summary || task.description',
    'Date.now() - task.startTime - (task.totalPausedMs ?? 0)',
    'No subagents are currently running.',
    'Recently completed',
    '· x to stop',
  ])
  assert.ok(
    running.indexOf('.filter(isActiveAgent)') <
      running.indexOf('.sort((a, b) => a.startTime - b.startTime)'),
  )
  assert.ok(
    running.indexOf('.filter(isCompletedAgent)') <
      running.indexOf('.slice(0, 5)'),
  )
})

test('source recovers Library, Run agent, and live-instance control flow', sourceOptions, () => {
  const menu = assertFragments('src/components/agents/AgentsRuntimeMenu.tsx', [
    "useState('running')",
    "title={runningCount > 0 ? `Running (${runningCount})` : 'Running'}",
    '<Tab title="Library" id="definitions">',
    'usedThisSession.has(a.agentType) ? 0 : 1',
    'return aUsed - bUsed',
    "task.type === 'local_agent'",
    'result.set(task.agentType, (result.get(task.agentType) ?? 0) + 1)',
    'const running = overridden ? 0',
    'No agents found. Create specialized subagents that Claude can delegate',
    'Each subagent has its own context window, custom system prompt, and',
    'Try creating: Code Reviewer, Code Simplifier, Security Reviewer, Tech',
    "{ label: 'Run agent', value: 'run' }",
    "{ label: 'View running instance', value: 'view-running' }",
    "candidate.type === 'local_agent'",
    'enterTeammateView(task.id, setAppState)',
    'nextInput: `@agent-${agent.agentType} ${prompt}`',
    'submitNextInput: true',
    'Enter a prompt for this subagent',
    "useKeybinding('confirm:no', onCancel, { context: 'Confirmation' })",
  ])
  assert.ok(menu.indexOf('Run agent') < menu.indexOf('View agent'))
  assert.ok(menu.indexOf('nextInput:') < menu.indexOf('submitNextInput: true'))
})

test('source initializes and records agentTypesInvokedThisSession at selection time', sourceOptions, () => {
  assertFragments('src/state/AppStateStore.ts', [
    'agentTypesInvokedThisSession: Set<string>',
    'agentTypesInvokedThisSession: new Set()',
  ])
  assertFragments('src/main.tsx', [
    'agentTypesInvokedThisSession: new Set()',
  ])
  const tool = assertFragments('src/tools/AgentTool/AgentTool.tsx', [
    'previous.agentTypesInvokedThisSession.has(selectedAgent.agentType)',
    'agentTypesInvokedThisSession: new Set(previous.agentTypesInvokedThisSession).add(selectedAgent.agentType)',
    "logEvent('tengu_agent_tool_selected'",
  ])
  assert.ok(
    tool.indexOf('previous.agentTypesInvokedThisSession.has') <
      tool.indexOf("logEvent('tengu_agent_tool_selected'"),
    'session usage is recorded before selection telemetry',
  )
  assertFragments('src/components/agents/AgentsMenu.tsx', [
    "export { AgentsMenu } from './AgentsRuntimeMenu.js'",
  ])
})

test('reference ordering keeps live agents first and only five newest terminal agents', () => {
  const tasks = [
    { id: 'old-running', status: 'running', startTime: 1 },
    { id: 'new-running', status: 'running', startTime: 2 },
    ...Array.from({ length: 7 }, (_, index) => ({
      id: `done-${index}`,
      status: 'completed',
      startTime: 0,
      endTime: index,
    })),
  ]
  const running = tasks
    .filter(task => task.status === 'running')
    .sort((a, b) => a.startTime - b.startTime)
  const completed = tasks
    .filter(task => task.status === 'completed')
    .sort((a, b) => (b.endTime ?? 0) - (a.endTime ?? 0))
    .slice(0, 5)
  assert.deepEqual(running.map(task => task.id), ['old-running', 'new-running'])
  assert.deepEqual(completed.map(task => task.id), [
    'done-6',
    'done-5',
    'done-4',
    'done-3',
    'done-2',
  ])
})
