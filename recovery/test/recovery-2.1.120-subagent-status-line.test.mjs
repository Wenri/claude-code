import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const BASELINE_BYTES = 13_720_987
const BASELINE_SHA256 =
  '9a1fccbe69ffe06c82345db1cc8cdbbc9a9929ed723bc8832ad48dfeff64b4ef'
const TARGET_BYTES = 13_784_743
const TARGET_SHA256 =
  'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function loadBundle(environmentNames, expectedBytes, expectedSha256) {
  const filename = environmentNames.map(name => process.env[name]).find(Boolean)
  assert.ok(filename, `${environmentNames.join(' or ')} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, expectedBytes, `${filename}: byte length`)
  assert.equal(sha256(bytes), expectedSha256, `${filename}: SHA-256`)
  return bytes.toString('utf8')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

function compact(value) {
  return value.replaceAll(/\s+/g, ' ').trim()
}

function assertSourceFragments(relativePath, fragments) {
  const contents = compact(source(relativePath))
  for (const fragment of fragments) {
    assert.ok(contents.includes(compact(fragment)), `${relativePath}: ${fragment}`)
  }
}

function windowAround(contents, marker, before, after) {
  const offset = contents.indexOf(marker)
  assert.notEqual(offset, -1, marker)
  return contents.slice(Math.max(0, offset - before), offset + after)
}

test('authenticates the inherited subagent status-line path in both adjacent bundles', () => {
  const baseline = loadBundle(
    ['CLAUDE_CODE_2_1_119_BUNDLE', 'CLAUDE_2_1_119_CLI_INNER'],
    BASELINE_BYTES,
    BASELINE_SHA256,
  )
  const target = loadBundle(
    ['CLAUDE_CODE_2_1_120_BUNDLE', 'CLAUDE_2_1_120_CLI_INNER'],
    TARGET_BYTES,
    TARGET_SHA256,
  )

  for (const [fragment, expected] of [
    ['subagentStatusLine', 10],
    ['taskDecorations', 12],
    ['tokenSamples', 1],
    ['Skipping subagentStatusLine execution - workspace trust not accepted', 1],
    ['subagentStatusLine emitted non-JSON line:', 1],
    ['subagentStatusLine emitted invalid schema:', 1],
    ['subagentStatusLine tick failed:', 1],
  ]) {
    assert.equal(occurrences(baseline, fragment), expected, `2.1.119: ${fragment}`)
    assert.equal(occurrences(target, fragment), expected, `2.1.120: ${fragment}`)
  }

  for (const bundle of [baseline, target]) {
    const runner = windowAround(
      bundle,
      'Skipping subagentStatusLine execution - workspace trust not accepted',
      1_000,
      4_500,
    )
    for (const fragment of [
      '=5000',
      'tokenSamples',
      'CLAUDE_PROJECT_DIR',
      'preserveOutputOnError:!0',
      'subagentStatusLine exited ',
      'subagentStatusLine emitted invalid schema:',
    ]) {
      assert.ok(runner.includes(fragment), `authenticated runner: ${fragment}`)
    }
  }
})

test('recovers command schema, policy/trust safety, bounded samples, and NDJSON parsing', () => {
  assertSourceFragments('src/utils/settings/types.ts', [
    'subagentStatusLine: z .object({ type: z.literal(\'command\'), command: z.string(), })',
    'Custom per-subagent status line shown in the agent panel; receives row context as JSON on stdin',
  ])
  assertSourceFragments('src/utils/subagentStatusLine.ts', [
    'SUBAGENT_STATUS_LINE_TIMEOUT_MS = 5_000',
    'SUBAGENT_STATUS_LINE_TOKEN_SAMPLE_LIMIT = 16',
    'shouldDisableAllHooksIncludingManaged()',
    'shouldSkipHookDueToTrust()',
    'shouldAllowManagedHooksOnly() ? getSettingsForSource(\'policySettings\')?.subagentStatusLine',
    'Skipping subagentStatusLine execution - workspace trust not accepted',
    'history.splice( 0, history.length - SUBAGENT_STATUS_LINE_TOKEN_SAMPLE_LIMIT',
    'for (const id of samples.keys())',
    '...createBaseHookInput()',
    'if (task.type === \'in_process_teammate\') { return describeTeammateActivity(task)',
    'label: getTaskLabel(task) || task.description',
    'tokenSamples: tokenSamples.get(task.id) ?? []',
    'CLAUDE_PROJECT_DIR: projectPath',
    'buildPowerShellArgs(command)',
    'shell: isWindows ? (gitBashPath ?? true) : true',
    'preserveOutputOnError: true',
    "result.stdout.split('\\n')",
    'SubagentStatusLineOutputSchema.safeParse(parsed)',
    'decorations[validated.data.id] = { content: validated.data.content',
  ])
})

test('recovers the polling lifecycle and row-scoped decoration state', () => {
  assertSourceFragments('src/hooks/useSubagentStatusLine.ts', [
    'SUBAGENT_STATUS_LINE_INITIAL_DELAY_MS = 300',
    'SUBAGENT_STATUS_LINE_REFRESH_MS = 5_000',
    'SUBAGENT_STATUS_LINE_INDENT_COLUMNS = 4',
    'state.settings?.subagentStatusLine?.command !== undefined',
    'const runningRef = useRef(false)',
    'updateSubagentTokenSamples(',
    'Math.max(0, columns - SUBAGENT_STATUS_LINE_INDENT_COLUMNS)',
    'if (currentTaskIds.has(taskId)) filtered[taskId] = decoration',
    'areTaskDecorationsEqual( current.taskDecorations, filtered',
    'setTimeout( tick, SUBAGENT_STATUS_LINE_INITIAL_DELAY_MS',
    'setInterval(tick, SUBAGENT_STATUS_LINE_REFRESH_MS)',
    'subagentStatusLine tick failed:',
  ])
  assertSourceFragments('src/state/AppStateStore.ts', [
    'taskDecorations: Record<string, { content: string }>',
    'tasks: {}, taskDecorations: {}',
  ])
  assertSourceFragments('src/main.tsx', ['tasks: {}, taskDecorations: {}'])
})

test('recovers decorated rendering, empty-row hiding, and stable keyboard selection', () => {
  assertSourceFragments('src/components/CoordinatorAgentStatus.tsx', [
    'export function getPanelAgentTasks(',
    "decorations[task.id]?.content !== ''",
    'const taskDecorations = useAppState(',
    'decoration={taskDecorations[task.id]}',
    'if (!isForkSubagentEnabled()) return 0',
    '<Ansi>{decoration.content}</Ansi>',
  ])
  assertSourceFragments('src/components/PromptInput/PromptInputFooterLeftSide.tsx', [
    'useSubagentStatusLine();',
    'const taskDecorations = useAppState(',
    'isForkSubagentEnabled() && getVisibleAgentTasks(tasks, taskDecorations).length > 0',
  ])
  assertSourceFragments('src/components/PromptInput/PromptInputFooter.tsx', [
    'isForkSubagentEnabled() && <CoordinatorTaskPanel />',
  ])
  assertSourceFragments('src/components/PromptInput/PromptInput.tsx', [
    'export function reconcileCoordinatorTaskIndex(',
    'const taskDecorations = useAppState(',
    'getVisibleAgentTasks(tasks, taskDecorations).map(task => task.id)',
    'previousCoordinatorTaskIdsRef.current = visibleCoordinatorTaskIds',
    'getVisibleAgentTasks(tasks, taskDecorations)[coordinatorTaskIndex - 1]',
  ])
  assertSourceFragments('src/components/tasks/BackgroundTaskStatus.tsx', [
    'isBackgroundTask(t) && !(isForkSubagentEnabled() && isPanelAgentTask(t))',
  ])
  assertSourceFragments('src/components/tasks/taskStatusUtils.tsx', [
    '!isBackgroundTask(t) || isForkSubagentEnabled() && isPanelAgentTask(t)',
  ])

  assert.equal(
    source('src/components/PromptInput/PromptInputFooter.tsx').includes(
      '"external" === \'ant\' && <CoordinatorTaskPanel />',
    ),
    false,
  )
})
