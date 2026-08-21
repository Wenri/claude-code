import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = [
  {
    version: '2.1.121',
    env: 'CLAUDE_CODE_2_1_121_BUNDLE',
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
]

function count(haystack, needle) {
  return haystack.split(needle).length - 1
}

function readBundle(release) {
  const filename = process.env[release.env]
  assert.ok(filename, `${release.env} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return bytes.toString('utf8')
}

function readSource(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

test('authenticates retained agents runtime and lifecycle surfaces', () => {
  for (const release of releases) {
    const bundle = readBundle(release)

    for (const [needle, expected] of [
      ['agentTypesInvokedThisSession', 6],
      ['agentLifecycle', 13],
      ['.agentLifecycle.markTypeInvoked(', 1],
      ['.agentLifecycle.registerName(', 3],
      ['.agentLifecycle.clearTodos(', 1],
      ['No subagents are currently running.', 1],
      ['Recently completed', 1],
      ['View running instance', 1],
      ['Enter a prompt for this subagent', 1],
      ['navFromContent:!0', 1],
      ['title:"Library",id:"definitions"', 1],
      ['usedThisSession', 2],
      ['runningByType', 15],
    ]) {
      assert.equal(
        count(bundle, needle),
        expected,
        `${release.version}: ${needle} cardinality`,
      )
    }

    assert.match(bundle, /agentTypesInvokedThisSession:new Set/)
    assert.match(
      bundle,
      /title:"Agents",color:"permission",navFromContent:!0,selectedTab:/,
    )
    assert.match(bundle, /title:"Library",id:"definitions"/)
    assert.match(bundle, /placeholder:"Describe the task\\u2026"/)
    assert.match(bundle, /"Enter to run \\xB7 Esc to go back"/)
    assert.match(bundle, /nextInput:`@agent-\$\{[^}]+\.agentType\} \$\{[^}]+\}`/)
  }
})

test('source restores agent lifecycle state and every retained call site', () => {
  const state = readSource('src/state/AppStateStore.ts')
  assert.match(state, /agentTypesInvokedThisSession: Set<string>/)
  assert.match(state, /agentTypesInvokedThisSession: new Set\(\)/)

  const main = readSource('src/main.tsx')
  assert.match(main, /agentTypesInvokedThisSession: new Set\(\)/)

  const lifecycle = readSource('src/utils/agentLifecycle.ts')
  assert.match(
    lifecycle,
    /previous\.agentTypesInvokedThisSession\.has\(agentType\)/,
  )
  assert.match(
    lifecycle,
    /agentTypesInvokedThisSession: new Set\([\s\S]*?previous\.agentTypesInvokedThisSession,[\s\S]*?\)\.add\(agentType\)/,
  )
  assert.match(lifecycle, /new Map\(previous\.agentNameRegistry\)/)
  assert.match(lifecycle, /const \{ \[agentId\]: _removed, \.\.\.todos \} = previous\.todos/)
  assert.match(lifecycle, /markTypeInvoked\(\) \{\}/)
  assert.match(lifecycle, /registerName\(\) \{\}/)
  assert.match(lifecycle, /clearTodos\(\) \{\}/)

  const tool = readSource('src/Tool.ts')
  assert.match(tool, /agentLifecycle: AgentLifecycle/)

  const agentTool = readSource('src/tools/AgentTool/AgentTool.tsx')
  assert.match(
    agentTool,
    /agentLifecycle\.markTypeInvoked\(selectedAgent\.agentType\)/,
  )
  assert.match(agentTool, /agentLifecycle\.registerName\(/)

  const resumeAgent = readSource('src/tools/AgentTool/resumeAgent.ts')
  assert.match(resumeAgent, /agentLifecycle\.registerName\(/)

  const runAgent = readSource('src/tools/AgentTool/runAgent.ts')
  assert.match(runAgent, /agentLifecycle\.clearTodos\(agentId\)/)

  const fork = readSource('src/commands/fork/fork.ts')
  assert.match(fork, /agentLifecycle\.registerName\(name, asAgentId\(agentId\)\)/)

  for (const relativePath of [
    'src/QueryEngine.ts',
    'src/utils/queryContext.ts',
    'src/screens/REPL.tsx',
  ]) {
    assert.match(readSource(relativePath), /agentLifecycle: createAgentLifecycle\(/)
  }
  assert.match(
    readSource('src/utils/forkedAgent.ts'),
    /agentLifecycle: parentContext\.agentLifecycle/,
  )
  for (const relativePath of [
    'src/entrypoints/mcp.ts',
    'src/utils/agenticSessionSearch.ts',
  ]) {
    assert.match(readSource(relativePath), /agentLifecycle: NOOP_AGENT_LIFECYCLE/)
  }
})

test('source restores Running and Library tabs with target navigation behavior', () => {
  const menu = readSource('src/components/agents/AgentsMenu.tsx')
  assert.match(menu, /type === 'local_agent'/)
  assert.match(menu, /agentType !== 'main-session'/)
  assert.match(menu, /\.slice\(0, 5\)/)
  assert.match(
    menu,
    /\.sort\(\(left, right\) => \(right\.endTime \?\? 0\) - \(left\.endTime \?\? 0\)\)/,
  )
  assert.match(menu, /\.sort\(\(left, right\) => left\.startTime - right\.startTime\)/)
  assert.match(menu, /setInterval\(\(\) => forceTick\(value => value \+ 1\), 1000\)/)
  assert.match(menu, /No subagents are currently running\./)
  assert.match(menu, /Recently completed/)
  assert.match(menu, /initialDetailTaskId=\{modeState\.taskId\}/)
  assert.match(
    menu,
    /onBack=\{\(\) =>\s*setModeState\(\{ mode: 'list-agents', source: 'all' \}\)\s*\}/,
  )
  assert.match(menu, /enterTeammateView\(selectedTask\.id, setAppState\)/)
  assert.match(menu, /selectedTask\.abortController\?\.abort\(\)/)
  assert.match(menu, /const \[selectedTab, setSelectedTab\] = useState\('running'\)/)
  assert.match(menu, /runningCount > 0 \? `Running \(\$\{runningCount\}\)` : 'Running'/)
  assert.match(menu, /title="Library" id="definitions"/)
  assert.match(menu, /title="Agents"\s+color="permission"\s+navFromContent/)
  assert.match(menu, /label: 'Run agent'/)
  assert.match(menu, /label: 'View running instance'/)
  assert.match(menu, /nextInput: `@agent-\$\{agent\.agentType\} \$\{prompt\}`/)
  assert.match(menu, /submitNextInput: true/)
  assert.match(menu, /subtitle="Enter a prompt for this subagent"/)
  assert.match(menu, /placeholder="Describe the task…"/)
  assert.equal(
    count(menu, 'Press ↑↓ to navigate · Enter to select · Esc to go back'),
    1,
  )
  assert.match(
    menu,
    /Press ↑↓ to navigate, Enter to select, Esc to cancel/,
  )

  const list = readSource('src/components/agents/AgentsList.tsx')
  assert.match(list, /usedThisSession\?: Set<string>/)
  assert.match(list, /runningByType\?: Map<string, number>/)
  assert.match(list, /usedThisSession\.has\(left\.agentType\)/)
  assert.match(list, /usedThisSession\.has\(right\.agentType\)/)
  assert.match(list, /const running = isOverridden/)
  assert.match(list, /running > 0/)
  assert.match(list, /● \{running\} running/)
  assert.match(list, /focusHeader\(\)/)
  assert.match(list, /Math\.min\(currentPosition \+ 1, totalItems - 1\)/)

  const command = readSource('src/commands/agents/agents.tsx')
  assert.match(command, /toolUseContext=\{context\}/)
})
