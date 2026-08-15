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
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8').replace(
    /\s+/g,
    ' ',
  )
}

test('authenticates the retained local-agent detail shortcut surface', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')

    assert.equal(occurrences(bundle, 'killAllAgentsShortcut'), 2, version)
    assert.match(
      bundle,
      /killAllAgentsShortcut:[A-Za-z_$][\w$]*\?[A-Za-z_$][\w$]*:void 0/,
      `${version}: parent passes the configured shortcut conditionally`,
    )
    assert.match(
      bundle,
      /status==="running"&&[A-Za-z_$][\w$]*&&[^;]{0,180}?action:"stop all agents",format:\{keyCase:"lower"\}/,
      `${version}: detail view renders a lowercase stop-all hint while running`,
    )
    assert.match(
      bundle,
      /\.status==="running"\)>1/,
      `${version}: shortcut is gated on multiple running local agents`,
    )
  }
})

test('source restores the exact detail prop and multi-agent gate', () => {
  const detail = source('src/components/tasks/AsyncAgentDetailDialog.tsx')
  const parent = source('src/components/tasks/BackgroundTasksDialog.tsx')

  assert.ok(detail.includes('killAllAgentsShortcut?: string'))
  assert.ok(
    detail.includes(
      'agent.status === "running" && killAllAgentsShortcut && <KeyboardShortcutHint shortcut={killAllAgentsShortcut.toLowerCase()} action="stop all agents" />',
    ),
  )
  assert.ok(
    parent.includes(
      "const hasMultipleRunningAgents = count(agentTasks, task => task.status === 'running') > 1",
    ),
  )
  assert.ok(
    parent.includes(
      'killAllAgentsShortcut={hasMultipleRunningAgents ? killAgentsShortcut : undefined}',
    ),
  )
  assert.ok(
    parent.includes(
      "currentSelection.type === 'local_agent' && hasMultipleRunningAgents",
    ),
  )
})
