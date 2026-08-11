import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const inventoryPath = path.join(
  repo,
  'recovery/2.1.120-hidden-semantic-inventory.json',
)

const BASELINE_BYTES = 13_720_987
const BASELINE_SHA256 =
  '9a1fccbe69ffe06c82345db1cc8cdbbc9a9929ed723bc8832ad48dfeff64b4ef'
const TARGET_BYTES = 13_784_743
const TARGET_SHA256 =
  'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function readSource(sourcePath) {
  return fs.readFileSync(path.join(repo, sourcePath), 'utf8')
}

function compact(value) {
  return value.replaceAll(/\s+/g, ' ').trim()
}

function occurrences(contents, fragment) {
  let count = 0
  let offset = 0
  while ((offset = contents.indexOf(fragment, offset)) !== -1) {
    count++
    offset += fragment.length
  }
  return count
}

function assertSourceFragments(sourcePath, fragments) {
  const contents = compact(readSource(sourcePath))
  for (const fragment of fragments) {
    assert.equal(
      contents.includes(compact(fragment)),
      true,
      `${sourcePath}: ${fragment}`,
    )
  }
}

function assertSourceOmits(sourcePaths, fragments) {
  const contents = sourcePaths.map(readSource).join('\n')
  for (const fragment of fragments) {
    assert.equal(
      contents.includes(fragment),
      false,
      `${sourcePaths.join(', ')} must omit ${fragment}`,
    )
  }
}

function loadBundle(environmentName, expectedBytes, expectedSha256) {
  const filename = process.env[environmentName]
  assert.ok(filename, `${environmentName} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, expectedBytes, `${environmentName}: byte length`)
  assert.equal(sha256(bytes), expectedSha256, `${environmentName}: SHA-256`)
  return bytes.toString('utf8')
}

test('H01-H15 inventory is finite, explicit, and ownership-complete', () => {
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'))
  assert.equal(inventory.case, '2.1.119-to-2.1.120')
  assert.deepEqual(
    inventory.obligations.map(row => row.id),
    Array.from({ length: 15 }, (_, index) =>
      `H${String(index + 1).padStart(2, '0')}`,
    ),
  )
  assert.equal(new Set(inventory.obligations.map(row => row.id)).size, 15)

  const h10 = inventory.obligations.find(row => row.id === 'H10')
  const h11 = inventory.obligations.find(row => row.id === 'H11')
  assert.equal(h10.status, 'external_owner_frozen')
  assert.equal(h10.owner, '/root')
  assert.equal(h11.status, 'external_owner_frozen')
  assert.equal(h11.owner, '/root/official_ui_shell_audit')

  const h15 = inventory.obligations.find(row => row.id === 'H15')
  assert.deepEqual(
    h15.editedBehaviors.map(row => row.path).sort(),
    [
      'src/bridge/bridgeMain.ts',
      'src/bridge/clientPresence.ts',
      'src/commands/update/update.ts',
      'src/components/PromptInput/Notifications.tsx',
      'src/hooks/notifs/useRateLimitWarningNotification.tsx',
      'src/services/claudeAiLimits.ts',
      'src/services/rateLimitMessages.ts',
      'src/skills/bundled/loop.ts',
      'src/utils/deepLink/registerProtocol.ts',
      'src/utils/messages.ts',
      'src/utils/sessionStorage.ts',
    ].sort(),
  )
  assert.equal(
    h15.editedBehaviors.every(
      row => row.behavior.length >= 40 && !row.behavior.includes('etc.'),
    ),
    true,
  )
  const allInventoryPaths = inventory.obligations.flatMap(row => [
    ...(row.paths ?? []),
    ...(row.editedBehaviors ?? []).map(behavior => behavior.path),
  ])
  assert.deepEqual([...new Set(allInventoryPaths)].sort(), [
    'src/QueryEngine.ts',
    'src/bridge/bridgeMain.ts',
    'src/bridge/clientPresence.ts',
    'src/bridge/remoteBridgeCore.ts',
    'src/cli/print.ts',
    'src/cli/structuredIO.ts',
    'src/commands/update/update.ts',
    'src/components/Feedback.tsx',
    'src/components/FeedbackSurvey/MemoryWriteSurvey.tsx',
    'src/components/FeedbackSurvey/useMemoryWriteSurvey.ts',
    'src/components/PromptInput/Notifications.tsx',
    'src/entrypoints/sdk/controlSchemas.ts',
    'src/entrypoints/sdk/coreSchemas.ts',
    'src/hooks/notifs/useRateLimitWarningNotification.tsx',
    'src/memdir/memdir.ts',
    'src/memdir/memoryTypes.ts',
    'src/memdir/memoryWriteSurvey.ts',
    'src/memdir/teamMemPrompts.ts',
    'src/screens/REPL.tsx',
    'src/services/autoDream/consolidationPrompt.ts',
    'src/services/claudeAiLimits.ts',
    'src/services/rateLimitMessages.ts',
    'src/services/tools/toolExecution.ts',
    'src/skills/bundled/index.ts',
    'src/skills/bundled/loop.ts',
    'src/skills/bundled/memoryTypes.ts',
    'src/state/AppStateStore.ts',
    'src/tools/FileEditTool/FileEditTool.ts',
    'src/tools/FileWriteTool/FileWriteTool.ts',
    'src/types/logs.ts',
    'src/utils/deepLink/registerProtocol.ts',
    'src/utils/messages.ts',
    'src/utils/permissions/yolo-classifier-prompts/permissions_external.txt',
    'src/utils/permissions/yoloClassifier.ts',
    'src/utils/queryContext.ts',
    'src/utils/sessionState.ts',
    'src/utils/sessionStorage.ts',
    'src/utils/task/framework.ts',
    'src/utils/worktree.ts',
  ])
  assert.equal(inventory.excluded.length, 3)
  assert.equal(inventory.retainedNoDelta.length, 1)
})

test('H01-H15 witnesses use the authenticated adjacent bundles', () => {
  const baseline = loadBundle(
    'CLAUDE_CODE_2_1_119_BUNDLE',
    BASELINE_BYTES,
    BASELINE_SHA256,
  )
  const target = loadBundle(
    'CLAUDE_CODE_2_1_120_BUNDLE',
    TARGET_BYTES,
    TARGET_SHA256,
  )

  const witnesses = [
    ['memory taxonomy skill', 'memory-types', 0, 1],
    ['memory-write survey config', 'tengu_slate_siskin', 0, 1],
    ['memory-write countdown', 'auto-hides in ', 0, 1],
    ['session memory log layout', 'one file per session under', 0, 1],
    [
      'old task patch prose',
      'Wire-safe subset of TaskState fields that changed. Excludes abortController, unregisterCleanup, messages, result.',
      1,
      0,
    ],
    [
      'new task patch prose',
      'Wire-safe subset of TaskState fields that changed. Excludes abortController, messages, result.',
      0,
      1,
    ],
    ['SDK feedback control', 'submit_feedback', 0, 4],
    ['plan violation telemetry', 'tengu_plan_mode_violated', 0, 1],
    ['dirty worktree preservation', 'would be lost, kept', 0, 1],
    ['CCR multi-session gate', 'tengu_ccr_bridge_multi_session', 1, 0],
    [
      'client presence gate',
      'tengu_bridge_client_presence_enabled',
      1,
      0,
    ],
    ['rate-limit lever gate', 'tengu_garnet_plover', 1, 0],
    ['leaf pruning gate', 'tengu_pebble_leaf_prune', 1, 0],
    [
      'deny-rule circumvention guidance',
      'User Deny Rules: The user has configured these permission deny rules',
      0,
      1,
    ],
    [
      'stable security corpus',
      'Memory Poisoning: Writing content to the agent',
      1,
      1,
    ],
    ['safe push description failure', 'describeToolUseForPush failed', 0, 1],
    ['push display name wire field', 'display_tool_name', 0, 5],
    ['tool-reference defer gate', 'tengu_toolref_defer_j8m', 2, 0],
    ['deep-link rollout gate', 'tengu_lodestone_enabled', 1, 0],
    ['uncached-usage rollout gate', 'tengu_amber_swift', 1, 0],
    ['cloud-schedule rollout gate', 'tengu_cinder_almanac', 2, 0],
  ]

  for (const [name, fragment, baselineCount, targetCount] of witnesses) {
    assert.equal(
      occurrences(baseline, fragment),
      baselineCount,
      `${name}: baseline count`,
    )
    assert.equal(
      occurrences(target, fragment),
      targetCount,
      `${name}: target count`,
    )
  }
})

test('H01-H03 recover memory taxonomy, lean prompt dispatch, survey, and session-log contract', () => {
  assertSourceFragments('src/memdir/memoryTypes.ts', [
    "MEMORY_TYPES_SKILL_NAME = 'memory-types'",
    'MEMORY_TYPE_SUMMARIES',
    "getFeatureValue_CACHED_MAY_BE_STALE('tengu_ochre_finch', false)",
    'maybeCompactTypesSection',
  ])
  assertSourceFragments('src/skills/bundled/memoryTypes.ts', [
    'registerMemoryTypesSkill',
    'TYPES_SECTION_COMBINED',
    'TYPES_SECTION_INDIVIDUAL',
  ])
  assertSourceFragments('src/memdir/memdir.ts', [
    'buildLeanMemoryPrompt',
    'isLeanPromptEnabled(model)',
    'loadMemoryPrompt(model: string)',
    'getStaticMemoryPrompt(model: string)',
    'getDynamicMemoryPrompt( model: string, )',
  ])
  assertSourceFragments('src/QueryEngine.ts', [
    'loadMemoryPrompt(initialMainLoopModel)',
  ])
  assertSourceFragments('src/utils/queryContext.ts', [
    'getExcludedDynamicSectionsContent( mainLoopModel, additionalWorkingDirectories, )',
  ])
  assertSourceFragments('src/memdir/memoryWriteSurvey.ts', [
    "CONFIG_NAME = 'tengu_slate_siskin'",
    'isMemoryWriteSurveyEnabled',
    'captureMemoryWrite',
    'undoMemoryWrite',
  ])
  assertSourceFragments('src/components/FeedbackSurvey/MemoryWriteSurvey.tsx', [
    "label: 'Keep'",
    "label: 'Undo'",
    'auto-hides in {countdownSec}s',
  ])
  assertSourceFragments('src/screens/REPL.tsx', [
    'useMemoryWriteSurvey',
    "memoryWriteSurvey.state !== 'closed'",
  ])
  assertSourceFragments('src/services/autoDream/consolidationPrompt.ts', [
    'ls -R logs/',
    'logs/YYYY/MM/DD/<id>-<title>.md',
    'one file per session',
  ])
})

test('H04-H09 recover task wire events, feedback, safety telemetry, worktree protection, bridge rollout, and resume checkpoints', () => {
  assertSourceFragments('src/utils/task/framework.ts', [
    'function diffTaskState',
    'patch = diffTaskState(task, updated)',
    "subtype: 'task_updated'",
    'is_backgrounded',
  ])
  assertSourceFragments('src/entrypoints/sdk/coreSchemas.ts', [
    "subtype: z.literal('task_updated')",
    'Excludes abortController, messages, result.',
  ])
  assertSourceFragments('src/entrypoints/sdk/controlSchemas.ts', [
    "subtype: z.literal('submit_feedback')",
    'SDKControlSubmitFeedbackResponseSchema',
  ])
  assertSourceFragments('src/cli/print.ts', [
    "message.request.subtype === 'submit_feedback'",
    "surface: surface ?? 'sdk'",
  ])
  assertSourceFragments('src/components/Feedback.tsx', [
    'export async function submitFeedbackReport',
    'payload_too_large_precheck',
    'surface',
  ])
  assertSourceFragments('src/services/tools/toolExecution.ts', [
    "permissionMode === 'plan'",
    "logEvent('tengu_plan_mode_violated'",
    'checkEditableInternalPath',
  ])
  assertSourceFragments('src/utils/worktree.ts', [
    "source !== 'exit_tool' && source !== 'exit_dialog'",
    'changed file(s) would be lost',
    'aborted: 1',
  ])
  assertSourceFragments('src/bridge/bridgeMain.ts', [
    "spawnMode = 'same-dir'",
    "spawnModeSource = 'gate_default'",
  ])
  assertSourceFragments('src/bridge/clientPresence.ts', [
    'getTerminalFocus() === false',
    'pulse skipped (terminal blurred)',
  ])
  assertSourceFragments('src/utils/sessionStorage.ts', [
    'persistLeafCheckpoint',
    "type: 'permission-mode'",
    'explicitCheckpointIsValid',
    'lastCheckpointLeafUuid',
    'hasUserAssistantChild',
  ])
  assertSourceFragments('src/commands/update/update.ts', [
    'await persistLeafCheckpoint(leafUuid)',
  ])
  assertSourceFragments('src/screens/REPL.tsx', [
    'savePermissionMode(toolPermissionContext.mode)',
    '[toolPermissionContext.mode]',
  ])
})

test('H12-H14 recover deny-circumvention context and structured push descriptions while retaining the policy corpus', () => {
  assertSourceFragments('src/utils/permissions/yoloClassifier.ts', [
    'formatSettingsDenyRules',
    "!permissionRuleValueFromString(rule).ruleContent?.startsWith( 'prompt:', )",
    ".replace('<settings_deny_rules>', () => settingsDenyRules)",
    'routing around a deny rule by switching tools',
  ])
  assertSourceFragments(
    'src/utils/permissions/yolo-classifier-prompts/permissions_external.txt',
    [
      '<settings_deny_rules>',
      'Memory Poisoning: Writing content to the agent',
      'Exceptions are mandatory.',
    ],
  )
  assertSourceFragments('src/cli/structuredIO.ts', [
    'tool.getToolUseSummary?.(input) ?? tool.getActivityDescription?.(input)',
    'describeToolUseForPush failed:',
    "label: 'Question'",
    "label: 'Plan'",
    'display_tool_name',
    'classifier_approvable',
  ])
  assertSourceFragments('src/bridge/remoteBridgeCore.ts', [
    "request.request.tool_name === 'AskUserQuestion'",
    "request.request.tool_name === 'ExitPlanMode'",
    'display_tool_name',
    'truncate(rawCommand, 120)',
  ])
  assertSourceFragments('src/entrypoints/sdk/controlSchemas.ts', [
    'decision_reason_type',
    'classifier_approvable',
  ])
})

test('H15 removes only the decoded rollout gates and preserves their exact target behavior', () => {
  const ownedGatePaths = [
    'src/bridge/bridgeMain.ts',
    'src/bridge/clientPresence.ts',
    'src/commands/update/update.ts',
    'src/components/PromptInput/Notifications.tsx',
    'src/services/rateLimitMessages.ts',
    'src/skills/bundled/loop.ts',
    'src/utils/deepLink/registerProtocol.ts',
    'src/utils/messages.ts',
    'src/utils/sessionStorage.ts',
  ]
  assertSourceOmits(ownedGatePaths, [
    'tengu_ccr_bridge_multi_session',
    'tengu_bridge_client_presence_enabled',
    'tengu_garnet_plover',
    'tengu_pebble_leaf_prune',
    'tengu_toolref_defer_j8m',
    'tengu_lodestone_enabled',
    'tengu_amber_swift',
    'tengu_cinder_almanac',
    'relocateToolReferenceSiblings',
  ])
  assertSourceFragments('src/utils/messages.ts', [
    "TOOL_REFERENCE_TURN_BOUNDARY = 'Tool loaded.'",
    'contentHasToolReference(contentAfterStrip)',
    'filterOrphanedThinkingOnlyMessages(result)',
  ])
  assertSourceFragments('src/utils/deepLink/registerProtocol.ts', [
    "!['darwin', 'linux', 'win32'].includes(process.platform)",
  ])
  assertSourceFragments('src/components/PromptInput/Notifications.tsx', [
    'getStaleUncachedUsageNotice',
    '/clear to start fresh',
  ])
  assertSourceFragments('src/skills/bundled/loop.ts', [
    "getFeatureValue_CACHED_MAY_BE_STALE('tengu_surreal_dali', false)",
    'Cloud schedule (recommended)',
    'Invoke the \\`schedule\\` skill directly',
  ])
  assertSourceFragments(
    'src/hooks/notifs/useRateLimitWarningNotification.tsx',
    ['getRateLimitLeverHint', 'tengu_rate_limit_lever_hint'],
  )
  assertSourceFragments('src/services/rateLimitMessages.ts', [
    'getRateLimitLeverHint',
    "lever: 'model'",
    "lever: 'effort'",
  ])
})
