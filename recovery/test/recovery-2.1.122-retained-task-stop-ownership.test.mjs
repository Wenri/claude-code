import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const releases = [
  ['2.1.121', process.env.CLAUDE_CODE_2_1_121_BUNDLE],
  ['2.1.122', process.env.CLAUDE_CODE_2_1_122_BUNDLE],
]

function occurrences(text, needle) {
  return text.split(needle).length - 1
}

function source(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
}

test('authenticates retained TaskStop ownership and owner notification semantics', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')

    for (const [name, count] of [
      ['callerAgentId', 2],
      ['stopperAgentId', 1],
      ['not_owner', 1],
      ['cannot stop it.', 1],
    ]) {
      assert.equal(occurrences(bundle, name), count, `${version}: ${name}`)
    }

    assert.match(
      bundle,
      /Task \$\{[^}]+\} is owned by \$\{[^}]+\}; agent \$\{[^}]+\} cannot stop it\./,
      `${version}: non-owner rejection is retained`,
    )
    assert.match(
      bundle,
      /taskRegistry:[^,}]+,setAppState:[^,}]+,callerAgentId:/,
      `${version}: TaskStop forwards registry, state setter, and caller`,
    )
    assert.match(
      bundle,
      /\.kill\([^,]+,[^,]+,[^)]+\).*?\.update\([^,]+,\([^)]*\)=>\{if\([^)]*\.notified\)return/s,
      `${version}: stop uses the registry-backed kill/update path`,
    )
    assert.match(
      bundle,
      /stopperAgentId:[^}]+\}=.*?was stopped by .*?priority:"next",agentId:/s,
      `${version}: stopped-task notification is routed to its owner`,
    )
  }
})

test('source reconstructs TaskStop registry, ownership, and notification wiring', () => {
  const framework = source('src/utils/task/framework.ts')
  const stop = source('src/tasks/stopTask.ts')
  const tool = source('src/tools/TaskStopTool/TaskStopTool.ts')
  const shellKill = source('src/tasks/LocalShellTask/killShellTasks.ts')
  const print = source('src/cli/print.ts')

  for (const witness of [
    'export type TaskRegistry = {',
    'export function createTaskRegistry(',
    'register(task) {',
    'update(taskId, updater) {',
    'get(taskId) {',
    'all() {',
  ]) {
    assert.ok(framework.includes(witness), `registry: ${witness}`)
  }

  for (const witness of [
    "| 'not_owner'",
    'callerAgentId?: AgentId',
    'getTaskStopCallerAgentId(toolUseContext)',
    'taskRegistry.get(taskId)',
    'taskImpl.kill(taskId, taskRegistry, setAppState)',
    'taskRegistry.update(taskId, prevTask =>',
    'callerAgentId !== task.agentId',
    "priority: 'next'",
    'agentId: asAgentId(ownerAgentId)',
    '`Task "${description}" was stopped by ${formatStopper(stopperAgentId)}`',
  ]) {
    const joined = `${stop}\n${tool}`
    assert.ok(joined.includes(witness), `TaskStop: ${witness}`)
  }

  assert.match(
    stop,
    /Task \$\{taskId\} is owned by \$\{formatStopper\(task\.agentId\)\}; agent \$\{callerAgentId\} cannot stop it\./,
  )
  assert.ok(shellKill.includes("emitTaskTerminatedSdk(taskId, 'stopped'"))
  assert.ok(print.includes('taskRegistry: createTaskRegistry(getAppState, setAppState)'))
})
