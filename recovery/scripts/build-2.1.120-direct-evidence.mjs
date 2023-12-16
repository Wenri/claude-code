#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const caseRoot = path.join(repo, 'recovery/cases/2.1.119-to-2.1.120')
const outputPath = path.join(caseRoot, 'semantic/direct-evidence.json')
const officialPath = path.join(
  repo,
  'recovery/2.1.120-official-semantic-inventory.json',
)
const hiddenPath = path.join(
  repo,
  'recovery/2.1.120-hidden-semantic-inventory.json',
)
const baselinePath =
  process.env.CLAUDE_CODE_2_1_119_BUNDLE ??
  '/tmp/claude-21120-acquire.DIOz1R/artifacts/2.1.119-linux-x64/cli.inner.js'
const targetPath =
  process.env.CLAUDE_CODE_2_1_120_BUNDLE ??
  '/tmp/claude-21120-acquire.DIOz1R/artifacts/2.1.120-linux-x64/cli.inner.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  assert(fragment.length > 0, 'cannot count an empty fragment')
  let count = 0
  let offset = 0
  while ((offset = contents.indexOf(fragment, offset)) !== -1) {
    count += 1
    offset += fragment.length
  }
  return count
}

function targetRecord(text, baseline, target) {
  const value = Buffer.from(text)
  return {
    text,
    bytes: value.length,
    sha256: sha256(value),
    baselineCount: occurrences(baseline, text),
    targetCount: occurrences(target, text),
  }
}

function sourceRecord({ path: sourcePath, fragment }) {
  const value = Buffer.from(fragment)
  const source = fs.readFileSync(path.join(repo, sourcePath), 'utf8')
  const count = occurrences(source, fragment)
  assert(count > 0, `${sourcePath}: source witness is absent: ${fragment}`)
  return {
    path: sourcePath,
    fragment,
    bytes: value.length,
    sha256: sha256(value),
    count,
  }
}

function sourcePathAbsenceRecord({ paths, fragment }) {
  assert(paths.length > 0, `source absence has no path: ${fragment}`)
  const count = paths.reduce(
    (sum, sourcePath) =>
      sum + occurrences(fs.readFileSync(path.join(repo, sourcePath), 'utf8'), fragment),
    0,
  )
  assert(count === 0, `source absence is present: ${fragment}`)
  return {
    paths: [...paths].sort(),
    fragment,
    bytes: Buffer.byteLength(fragment),
    sha256: sha256(Buffer.from(fragment)),
    count,
  }
}

const sr = (sourcePath, fragment) => ({ path: sourcePath, fragment })

const officialTargetOverrides = new Map([
  [5, ['hasUserDefined(']],
  [6, ['tengu_scroll_arrows_detected']],
  [7, ['14400000']],
  [11, ['stdio transport error:']],
  [12, ['Double-tap esc to rewind the conversation to a previous point in time']],
  [13, ['Math.min(H.viewport.height,$.viewport.height)']],
  [14, ['function QA7(){if(AsH())return!1;']],
  [15, ['.replace(/[ \\t]+/g," ").replace(/[ \\t]*\\n[ \\t]*/g,']],
  [16, ['let[Y,O]=IJ.useState($),[M,D]=IJ.useState(H)']],
  [17, ['~${A} lines']],
  [18, ['{text:q,query:K,color:_,dimColor:A,contiguousOnly:z}']],
  [20, ['Show session cost, plan usage, and activity stats']],
  [21, ['Dictation language:']],
])

function officialRows(official) {
  return official.rows.map(row => {
    const targetFragments =
      officialTargetOverrides.get(row.bullet) ??
      row.artifact_fragments.map(entry => entry.fragment)
    assert(
      targetFragments.length > 0,
      `${row.test_id}: no direct target witness`,
    )
    const sourceAssertions = row.source.flatMap(entry =>
      entry.includes.map(fragment => sr(entry.path, fragment)),
    )
    const sourcePathAbsences = row.source.flatMap(entry =>
      (entry.excludes ?? []).map(fragment => ({
        paths: [entry.path],
        fragment,
      })),
    )
    return {
      id: `B${String(row.bullet).padStart(2, '0')}`,
      obligationId: row.test_id.replaceAll('.', '-'),
      category: 'official',
      releaseBullet: row.bullet,
      title: row.changelog,
      rationale: row.normalized_witness,
      targetFragments,
      sourceAssertions,
      sourcePathAbsences,
    }
  })
}

const hiddenSpecs = [
  {
    id: 'H01',
    targetFragments: ['memory-types', 'CLAUDE_CODE_LEAN_PROMPT'],
    sourceAssertions: [
      sr('src/QueryEngine.ts', 'loadMemoryPrompt(initialMainLoopModel)'),
      sr('src/memdir/memdir.ts', 'buildLeanMemoryPrompt'),
      sr('src/memdir/memoryTypes.ts', "MEMORY_TYPES_SKILL_NAME = 'memory-types'"),
      sr('src/memdir/teamMemPrompts.ts', 'maybeCompactTypesSection'),
      sr('src/skills/bundled/index.ts', 'registerMemoryTypesSkill'),
      sr('src/skills/bundled/memoryTypes.ts', 'TYPES_SECTION_COMBINED'),
      sr('src/utils/queryContext.ts', 'getExcludedDynamicSectionsContent('),
    ],
  },
  {
    id: 'H02',
    targetFragments: ['tengu_slate_siskin', 'auto-hides in '],
    sourceAssertions: [
      sr('src/components/Feedback.tsx', 'export async function submitFeedbackReport'),
      sr('src/components/FeedbackSurvey/MemoryWriteSurvey.tsx', 'auto-hides in {countdownSec}s'),
      sr('src/components/FeedbackSurvey/useMemoryWriteSurvey.ts', 'useMemoryWriteSurvey'),
      sr('src/memdir/memoryWriteSurvey.ts', "CONFIG_NAME = 'tengu_slate_siskin'"),
      sr('src/screens/REPL.tsx', 'useMemoryWriteSurvey'),
      sr('src/state/AppStateStore.ts', 'memoryWriteSurvey'),
      sr('src/tools/FileEditTool/FileEditTool.ts', 'captureMemoryWrite'),
      sr('src/tools/FileWriteTool/FileWriteTool.ts', 'captureMemoryWrite'),
    ],
  },
  {
    id: 'H03',
    targetFragments: ['one file per session under'],
    sourceAssertions: [
      sr('src/services/autoDream/consolidationPrompt.ts', 'logs/YYYY/MM/DD/<id>-<title>.md'),
    ],
  },
  {
    id: 'H04',
    targetFragments: [
      'Wire-safe subset of TaskState fields that changed. Excludes abortController, messages, result.',
      'task_updated',
    ],
    sourceAssertions: [
      sr('src/utils/task/framework.ts', 'function diffTaskState'),
      sr('src/entrypoints/sdk/coreSchemas.ts', "subtype: z.literal('task_updated')"),
    ],
  },
  {
    id: 'H05',
    targetFragments: ['submit_feedback'],
    sourceAssertions: [
      sr('src/cli/print.ts', "message.request.subtype === 'submit_feedback'"),
      sr('src/components/Feedback.tsx', 'export async function submitFeedbackReport'),
      sr('src/entrypoints/sdk/controlSchemas.ts', "subtype: z.literal('submit_feedback')"),
      sr('src/entrypoints/sdk/controlSchemas.ts', 'SDKControlSubmitFeedbackResponseSchema'),
    ],
  },
  {
    id: 'H06',
    targetFragments: ['tengu_plan_mode_violated'],
    sourceAssertions: [
      sr('src/services/tools/toolExecution.ts', "logEvent('tengu_plan_mode_violated'"),
    ],
  },
  {
    id: 'H07',
    targetFragments: ['would be lost, kept'],
    sourceAssertions: [
      sr('src/utils/worktree.ts', 'changed file(s) would be lost'),
    ],
  },
  {
    id: 'H08',
    targetFragments: [
      'tengu_ccr_bridge_multi_session',
      'tengu_bridge_client_presence_enabled',
    ],
    sourceAssertions: [
      sr('src/bridge/bridgeMain.ts', "spawnMode = 'same-dir'"),
      sr('src/bridge/clientPresence.ts', 'pulse skipped (terminal blurred)'),
    ],
    sourcePathAbsences: [
      {
        paths: ['src/bridge/bridgeMain.ts'],
        fragment: 'tengu_ccr_bridge_multi_session',
      },
      {
        paths: ['src/bridge/clientPresence.ts'],
        fragment: 'tengu_bridge_client_presence_enabled',
      },
    ],
  },
  {
    id: 'H09',
    targetFragments: ['tengu_pebble_leaf_prune'],
    sourceAssertions: [
      sr('src/commands/update/update.ts', 'await persistLeafCheckpoint(leafUuid)'),
      sr('src/screens/REPL.tsx', 'savePermissionMode(toolPermissionContext.mode)'),
      sr('src/types/logs.ts', "type: 'permission-mode'"),
      sr('src/utils/sessionStorage.ts', 'explicitCheckpointIsValid'),
    ],
    sourcePathAbsences: [
      {
        paths: ['src/utils/sessionStorage.ts'],
        fragment: 'tengu_pebble_leaf_prune',
      },
    ],
  },
  {
    id: 'H10',
    targetFragments: ['claude-managed: v1', 'keybind_exit'],
    sourceAssertions: [
      sr('src/daemon/client.ts', "getDaemonColdStart() === 'ask'"),
      sr('src/daemon/main.ts', 'removeLegacyDaemonService'),
      sr('src/daemon/service.ts', 'claude-managed: v1'),
      sr('src/daemon/supervisor.ts', 'retireIfSettled(600_000)'),
      sr('src/commands/exit/exit.tsx', "source: 'bridge' | 'exit_dialog' | 'keybind_exit'"),
      sr('src/components/ExitFlow.tsx', "stopBackgroundSession('keybind_exit')"),
    ],
  },
  {
    id: 'H11',
    targetFragments: ['CLAUDE_CODE_LEAN_PROMPT', 'tengu_subagent_md_report_blocked'],
    sourceAssertions: [
      sr('src/Tool.ts', 'model?: string'),
      sr('src/constants/prompts.ts', 'getLeanSystemPromptSection'),
      sr('src/tools/AgentTool/AgentTool.tsx', 'getPrompt(filteredAgents, model'),
      sr('src/tools/AgentTool/built-in/exploreAgent.ts', 'Fast read-only search agent'),
      sr('src/tools/AgentTool/prompt.ts', "The agent's final message is returned to you"),
      sr('src/tools/BashTool/BashTool.tsx', 'getSimplePrompt(model)'),
      sr('src/tools/BashTool/prompt.ts', 'function getLeanPrompt()'),
      sr('src/tools/FileEditTool/FileEditTool.ts', 'getEditToolDescription(model)'),
      sr('src/tools/FileEditTool/prompt.ts', 'getEditToolDescription'),
      sr('src/tools/FileReadTool/FileReadTool.ts', 'renderPromptTemplate('),
      sr('src/tools/FileReadTool/prompt.ts', 'isLeanPromptEnabled(model)'),
      sr('src/tools/FileWriteTool/FileWriteTool.ts', 'tengu_subagent_md_report_blocked'),
      sr('src/tools/FileWriteTool/prompt.ts', 'getWriteToolDescription'),
      sr('src/tools/GlobTool/GlobTool.ts', 'getGlobToolPrompt(model)'),
      sr('src/tools/GlobTool/prompt.ts', 'getGlobToolPrompt'),
      sr('src/tools/GrepTool/GrepTool.ts', 'getDescription(model)'),
      sr('src/tools/GrepTool/prompt.ts', 'Content search built on ripgrep'),
      sr('src/tools/TodoWriteTool/TodoWriteTool.ts', 'getPrompt(model)'),
      sr('src/tools/TodoWriteTool/prompt.ts', 'export const LEAN_PROMPT'),
      sr('src/tools/WebFetchTool/WebFetchTool.ts', 'getWebFetchPrompt(model)'),
      sr('src/tools/WebFetchTool/prompt.ts', 'getWebFetchPrompt'),
      sr('src/tools/WebSearchTool/WebSearchTool.ts', 'getWebSearchPrompt(model)'),
      sr('src/tools/WebSearchTool/prompt.ts', 'getWebSearchPrompt'),
      sr('src/utils/api.ts', 'isLeanPromptEnabled(options.model)'),
      sr('src/utils/leanPrompt.ts', 'CLAUDE_CODE_LEAN_PROMPT'),
    ],
  },
  {
    id: 'H12',
    targetFragments: ['settings_deny_rules', 'User Deny Rules:'],
    sourceAssertions: [
      sr('src/utils/permissions/yoloClassifier.ts', 'formatSettingsDenyRules'),
      sr('src/utils/permissions/yolo-classifier-prompts/permissions_external.txt', '<settings_deny_rules>'),
    ],
  },
  {
    id: 'H13',
    retained: true,
    targetFragments: ['Memory Poisoning: Writing content to the agent'],
    sourceAssertions: [
      sr('src/utils/permissions/yolo-classifier-prompts/permissions_external.txt', 'Memory Poisoning: Writing content to the agent'),
    ],
  },
  {
    id: 'H14',
    targetFragments: ['describeToolUseForPush failed', 'display_tool_name'],
    sourceAssertions: [
      sr('src/bridge/remoteBridgeCore.ts', 'display_tool_name'),
      sr('src/cli/structuredIO.ts', 'describeToolUseForPush failed:'),
      sr('src/cli/transports/ccrClient.ts', 'display_tool_name: details.display_tool_name'),
      sr('src/entrypoints/sdk/controlSchemas.ts', 'classifier_approvable'),
      sr('src/utils/sessionState.ts', 'display_tool_name'),
    ],
  },
  {
    id: 'H15',
    targetFragments: [
      'tengu_toolref_defer_j8m',
      'tengu_lodestone_enabled',
      'tengu_amber_swift',
      'tengu_cinder_almanac',
      'tengu_garnet_plover',
      'tengu_pebble_leaf_prune',
      'tengu_ccr_bridge_multi_session',
      'tengu_bridge_client_presence_enabled',
    ],
    sourceAssertions: [
      sr('src/utils/messages.ts', "TOOL_REFERENCE_TURN_BOUNDARY = 'Tool loaded.'"),
      sr('src/utils/deepLink/registerProtocol.ts', "!['darwin', 'linux', 'win32'].includes(process.platform)"),
      sr('src/components/PromptInput/Notifications.tsx', 'getStaleUncachedUsageNotice'),
      sr('src/commands/update/update.ts', 'await persistLeafCheckpoint(leafUuid)'),
      sr('src/utils/sessionStorage.ts', 'explicitCheckpointIsValid'),
      sr('src/skills/bundled/loop.ts', 'Cloud schedule (recommended)'),
      sr('src/bridge/bridgeMain.ts', "spawnMode = 'same-dir'"),
      sr('src/bridge/clientPresence.ts', 'pulse skipped (terminal blurred)'),
      sr('src/hooks/notifs/useRateLimitWarningNotification.tsx', 'tengu_rate_limit_lever_hint'),
      sr('src/services/claudeAiLimits.ts', 'getRateLimitLeverHint'),
      sr('src/services/rateLimitMessages.ts', 'getRateLimitLeverHint'),
    ],
    sourcePathAbsences: [
      {
        paths: ['src/utils/messages.ts'],
        fragment: 'tengu_toolref_defer_j8m',
      },
      {
        paths: ['src/utils/messages.ts'],
        fragment: 'relocateToolReferenceSiblings',
      },
      {
        paths: ['src/utils/deepLink/registerProtocol.ts'],
        fragment: 'tengu_lodestone_enabled',
      },
      {
        paths: ['src/components/PromptInput/Notifications.tsx'],
        fragment: 'tengu_amber_swift',
      },
      {
        paths: ['src/skills/bundled/loop.ts'],
        fragment: 'tengu_cinder_almanac',
      },
      {
        paths: ['src/utils/sessionStorage.ts'],
        fragment: 'tengu_pebble_leaf_prune',
      },
      {
        paths: ['src/bridge/bridgeMain.ts'],
        fragment: 'tengu_ccr_bridge_multi_session',
      },
      {
        paths: ['src/bridge/clientPresence.ts'],
        fragment: 'tengu_bridge_client_presence_enabled',
      },
      {
        paths: [
          'src/hooks/notifs/useRateLimitWarningNotification.tsx',
          'src/services/rateLimitMessages.ts',
        ],
        fragment: 'tengu_garnet_plover',
      },
    ],
  },
]

const daemonSpecs = [
  {
    id: 'D01',
    title: 'Daemon rollout, cold-start, and managed-service lifecycle',
    targetFragments: [
      'tengu_amber_anchor',
      'tengu_quiet_harbor',
      'daemonColdStart',
      'claude-managed: v1',
      'service install only supports the default config dir',
    ],
    sourceAssertions: [
      sr('src/utils/agentsFleet.ts', 'tengu_amber_anchor'),
      sr('src/daemon/client.ts', "getDaemonColdStart() === 'ask'"),
      sr('src/daemon/main.ts', 'service install only supports the default config dir'),
      sr('src/daemon/service.ts', 'claude-managed: v1'),
    ],
  },
  {
    id: 'D02',
    title: 'Settled worker retirement and attach-state preservation',
    targetFragments: [
      'tengu_bg_retired',
      'retireIfSettled',
      'decModes',
      'job is retiring; retry attach',
    ],
    sourceAssertions: [
      sr('src/daemon/supervisor.ts', 'async retireIfSettled(graceMs: number)'),
      sr('src/cli/bg.ts', 'holdScreenOnDisconnect: true'),
      sr('src/screens/Doctor.tsx', 'Probing background server…'),
    ],
  },
  {
    id: 'D03',
    title: 'Awaited lifecycle telemetry and background keybinding stop',
    targetFragments: ['logEventTo1PAwaitable', 'keybind_exit'],
    sourceAssertions: [
      sr('src/services/analytics/firstPartyEventLogger.ts', 'export async function logEventTo1PAwaitable'),
      sr('src/daemon/main.ts', 'await logEventTo1PAwaitable'),
      sr('src/components/ExitFlow.tsx', "stopBackgroundSession('keybind_exit')"),
    ],
  },
]

const selectionSpecs = [
  {
    id: 'S01',
    title: 'Selection virtual columns and offscreen transfer',
    targetFragments: ['virtualAnchorCol', 'virtualFocusCol'],
    sourceAssertions: [
      sr('src/ink/selection.ts', 'virtualAnchorCol?: number'),
      sr('src/ink/ink.tsx', 'isSelectionWhollyOffscreen(this.selection)'),
    ],
  },
  {
    id: 'S02',
    title: 'Main-screen viewport erase without scrollback duplication',
    targetFragments: ['eraseViewportInPlace', 'viewportRows'],
    sourceAssertions: [
      sr('src/ink/clearTerminal.ts', 'export function eraseViewportInPlace'),
      sr('src/ink/frame.ts', 'viewportRows: number'),
      sr('src/ink/log-update.ts', 'viewportRows: frame.viewport.height'),
      sr('src/ink/terminal.ts', 'eraseViewportInPlace(patch.viewportRows)'),
    ],
  },
]

const residualSpecs = [
  {
    id: 'R01',
    title: 'Status-line Vim indicator ownership',
    targetFragments: ['hideVimModeIndicator'],
    sourceAssertions: [
      sr('src/components/PromptInput/PromptInputFooter.tsx', 'hideVimModeIndicator='),
      sr('src/components/PromptInput/PromptInputFooterLeftSide.tsx', '!hideVimModeIndicator'),
      sr('src/utils/settings/types.ts', 'hideVimModeIndicator'),
    ],
  },
  {
    id: 'R02',
    title: 'Daemon proactive-refresh retry while token remains valid',
    targetFragments: ['proactive refresh failed, retrying in ~60s'],
    sourceAssertions: [
      sr('src/daemon/auth.ts', 'proactive refresh failed, retrying in ~60s'),
    ],
  },
  {
    id: 'R03',
    title: 'Markdown discovery treats ripgrep timeout as an empty scan',
    targetFragments: ['loadMarkdownFiles: ripgrep timed out scanning'],
    sourceAssertions: [
      sr('src/utils/markdownConfigLoader.ts', 'e instanceof RipgrepTimeoutError'),
    ],
  },
  {
    id: 'R04',
    title: 'Background-session footer, detach wording, shell wording, and PR badge',
    targetFragments: [
      'detach (session keeps running)',
      '! for shell mode',
      'useBgSessionPr',
    ],
    sourceAssertions: [
      sr('src/components/PromptInput/PromptInputFooterLeftSide.tsx', 'detach (session keeps running)'),
      sr('src/hooks/useBgSessionPr.ts', 'export function useBgSessionPr'),
    ],
  },
  {
    id: 'R05',
    title: 'Watcher error containment and nested keybinding provider guard',
    targetFragments: [
      '[theme] watcher error:',
      '[settings] watcher error:',
      'FileChanged: watcher error:',
      '[skills] watcher error:',
      '[jobStateNameSync] watcher error:',
    ],
    sourceAssertions: [
      sr('src/hooks/useJobStateNameSync.ts', '[jobStateNameSync] watcher error:'),
      sr('src/keybindings/KeybindingProviderSetup.tsx', 'useOptionalKeybindingContext()'),
      sr('src/utils/customThemes.ts', '[theme] watcher error:'),
      sr('src/utils/hooks/fileChangedWatcher.ts', 'FileChanged: watcher error:'),
      sr('src/utils/settings/changeDetector.ts', '[settings] watcher error:'),
      sr('src/utils/skills/skillChangeDetector.ts', '[skills] watcher error:'),
    ],
  },
  {
    id: 'R06',
    title: 'Focus-mode hidden-message accounting',
    targetFragments: ['briefHiddenCount'],
    sourceAssertions: [
      sr('src/components/Messages.tsx', 'briefHiddenCount'),
      sr('src/components/messages/SystemTextMessage.tsx', 'briefHiddenCount'),
    ],
  },
  {
    id: 'R07',
    title: 'AskUserQuestion preview notes propagate into answers',
    targetFragments: ['User notes:'],
    sourceAssertions: [
      sr('src/components/permissions/AskUserQuestionPermissionRequest/AskUserQuestionPermissionRequest.tsx', 'User notes:'),
      sr('src/components/permissions/AskUserQuestionPermissionRequest/PreviewQuestionView.tsx', 'textInputValue'),
      sr('src/tools/AskUserQuestionTool/AskUserQuestionTool.tsx', 'user notes: ${annotation.notes}'),
    ],
  },
  {
    id: 'R08',
    title: 'Bootstrap account enrichment and dynamic model pricing',
    targetFragments: ['organizationRateLimitTier', 'userRateLimitTier'],
    sourceAssertions: [
      sr('src/services/api/bootstrap.ts', 'additional_model_costs'),
      sr('src/utils/config.ts', 'additionalModelCostsCache'),
      sr('src/utils/modelCost.ts', 'additionalCosts?.[model]'),
    ],
  },
  {
    id: 'R09',
    title: 'Skill content-length telemetry across discovery and execution',
    targetFragments: ['skill_content_chars'],
    sourceAssertions: [
      sr('src/tools/SkillTool/SkillTool.ts', 'skill_content_chars'),
      sr('src/utils/telemetry/skillLoadedEvent.ts', 'skill_content_chars'),
    ],
  },
  {
    id: 'R10',
    title: 'First-message headless MCP prewait with remote-local filtering',
    targetFragments: ['remote_baku'],
    sourceAssertions: [
      sr('src/cli/print.ts', "logEvent('tengu_headless_mcp_prewait'"),
      sr('src/cli/print.ts', "CLAUDE_CODE_ENTRYPOINT === 'remote_baku'"),
    ],
  },
  {
    id: 'R11',
    title: 'Clipboard command quoting and per-user temporary directory hardening',
    targetFragments: ['LiteralPath', 'claude-${process.getuid'],
    sourceAssertions: [
      sr('src/utils/imagePaste.ts', 'function quotePosixArgs'),
      sr('src/utils/imagePaste.ts', 'Remove-Item -Force -LiteralPath'),
      sr('src/utils/imagePaste.ts', '{ mode: 0o700 }'),
    ],
  },
  {
    id: 'R12',
    title: 'Bridge Retry-After parsing and retry metadata',
    targetFragments: ['retryAfterMs'],
    sourceAssertions: [
      sr('src/bridge/bridgeApi.ts', 'export function parseRetryAfter'),
      sr('src/bridge/bridgeApi.ts', "'retry-after' in headers"),
    ],
  },
  {
    id: 'R13',
    title: 'Terminal-aware single- and multi-select sizing',
    targetFragments: ['compact-vertical'],
    sourceAssertions: [
      sr('src/components/CustomSelect/SelectMulti.tsx', 'useVisibleOptionCount'),
      sr('src/components/CustomSelect/select.tsx', 'useVisibleOptionCount'),
      sr('src/components/CustomSelect/use-visible-option-count.ts', 'RESERVED_TERMINAL_ROWS = 8'),
    ],
  },
  {
    id: 'R14',
    title: 'Bash executor-shell telemetry',
    targetFragments: ['executor_shell'],
    sourceAssertions: [
      sr('src/tools/BashTool/BashTool.tsx', 'executor_shell: await getExecutorShell()'),
      sr('src/utils/Shell.ts', 'export async function getExecutorShell'),
    ],
  },
  {
    id: 'R15',
    title: 'Remote requires-action display name propagation',
    targetFragments: ['display_tool_name'],
    sourceAssertions: [
      sr('src/cli/transports/ccrClient.ts', 'display_tool_name: details.display_tool_name'),
    ],
  },
  {
    id: 'R16',
    title: 'Reactive model and team-server availability for memory controls',
    targetFragments: [
      'tengu_umber_petrel',
      'unavailable for current model',
      'team_memory_feature_unavailable',
    ],
    sourceAssertions: [
      sr('src/bootstrap/state.ts', 'export type TeamMemoryServerStatus'),
      sr('src/components/memory/MemoryFileSelector.tsx', 'onGrowthBookRefresh'),
      sr('src/components/memory/MemoryFileSelector.tsx', 'unavailable for current model'),
      sr('src/memdir/paths.ts', "getFeatureValue_CACHED_MAY_BE_STALE('tengu_umber_petrel', false)"),
      sr('src/memdir/teamMemPaths.ts', "getTeamMemoryServerStatus() === 'has-content'"),
      sr('src/services/autoDream/config.ts', 'export function isAutoDreamAvailable()'),
      sr('src/services/teamMemorySync/index.ts', "TEAM_MEMORY_FEATURE_UNAVAILABLE = 'team_memory_feature_unavailable'"),
    ],
  },
  {
    id: 'R17',
    title: 'VS Code bridge publishes authentication and ribbon experiment gates',
    targetFragments: ['tengu_vscode_cc_auth', 'tengu_slate_ribbon'],
    sourceAssertions: [
      sr('src/services/mcp/vscodeSdkMcp.ts', 'tengu_vscode_cc_auth: true'),
      sr('src/services/mcp/vscodeSdkMcp.ts', 'tengu_slate_ribbon: true'),
    ],
  },
  {
    id: 'R18',
    retained: true,
    title: 'Inherited updater refs, installation guard, and Homebrew channel lookup',
    targetFragments: [
      'DISABLE_INSTALLATION_CHECKS',
      'claude-code@latest',
      'PackageManagerAutoUpdater: maxVersion',
    ],
    sourceAssertions: [
      sr('src/components/AutoUpdater.tsx', 'useEffect(() => {\n    isUpdatingRef.current = isUpdating'),
      sr('src/components/AutoUpdater.tsx', 'process.env.DISABLE_INSTALLATION_CHECKS'),
      sr('src/components/NativeAutoUpdater.tsx', 'useEffect(() => {\n    isUpdatingRef.current = isUpdating'),
      sr('src/components/PackageManagerAutoUpdater.tsx', 'getLatestHomebrewVersion(caskName ?? "claude-code", effectiveChannel)'),
    ],
  },
  {
    id: 'R19',
    title: 'Canonical wrapping footer retains background and focus status markers',
    targetFragments: [
      'width:Q,flexWrap:"wrap"',
      '"background",$H&&r&&"focus"',
      'flexWrap:"wrap",alignItems:"flex-end"',
      'isInputEmpty',
    ],
    sourceAssertions: [
      sr('src/components/PromptInput/Notifications.tsx', 'const t11 = "flex-end"'),
      sr('src/components/PromptInput/PromptInputFooter.tsx', "isBgSession() && 'background'"),
      sr('src/components/PromptInput/PromptInputFooter.tsx', "isFullscreen && briefTranscript && 'focus'"),
      sr('src/components/PromptInput/PromptInputFooter.tsx', '<Box width={columns} flexWrap="wrap" alignItems="flex-end"'),
      sr('src/components/PromptInput/PromptInputFooter.tsx', '<Box flexShrink={0} marginLeft="auto" gap={1}>'),
      sr('src/components/PromptInput/PromptInputFooter.tsx', 'isInputEmpty={!suppressHintFromProps}'),
      sr('src/components/PromptInput/PromptInputFooterLeftSide.tsx', 'isInputEmpty={isInputEmpty}'),
    ],
  },
  {
    id: 'R20',
    retained: true,
    title: 'Inherited team-memory tombstone synchronization and bounded server metadata',
    targetFragments: [
      'soft_delete_keys',
      'deletedEntries',
      'files_soft_deleted',
      'files_reaped',
      'server_error_code',
      'tombstonedKeys',
      'diskTrusted',
      'initial_files_reaped',
      'team_memory_group_acl_denied',
      'recoverable via file deletion',
      'team-memory-sync: team dir inaccessible \\u2014 suppressing soft-delete',
      'failed to reap tombstoned',
      '404, code=',
    ],
    sourceAssertions: [
      sr('src/services/teamMemorySync/types.ts', 'deletedEntries: z.record(z.string(), z.number()).optional()'),
      sr('src/services/teamMemorySync/types.ts', 'export const TeamMemoryErrorSchema'),
      sr('src/services/teamMemorySync/index.ts', 'export function createSyncState(repoSlug: string)'),
      sr('src/services/teamMemorySync/index.ts', "Buffer.byteLength(jsonStringify(k), 'utf8')"),
      sr('src/services/teamMemorySync/index.ts', 'body.soft_delete_keys = [...softDeleteKeys]'),
      sr('src/services/teamMemorySync/index.ts', 'async function reapRemoteTombstones'),
      sr('src/services/teamMemorySync/index.ts', 'state.tombstonedKeys = new Set(Object.keys(deletedEntries))'),
      sr('src/services/teamMemorySync/index.ts', 'team-memory-sync: team dir inaccessible — suppressing soft-delete'),
      sr('src/services/teamMemorySync/watcher.ts', 'export const UNLINK_RECOVERABLE_REASONS'),
      sr('src/services/teamMemorySync/watcher.ts', 'syncState = createSyncState(repoSlug)'),
      sr('src/services/teamMemorySync/watcher.ts', 'initial_files_reaped: initialFilesReaped'),
    ],
    sourcePathAbsences: [
      {
        paths: ['src/services/teamMemorySync/index.ts'],
        fragment: 'File deletions do NOT propagate',
      },
    ],
  },
  {
    id: 'R21',
    retained: true,
    title: 'Inherited notification queue and closed-issue acknowledgement flow',
    targetFragments: [
      'closed-issue-notice',
      'tengu_gouda_loop',
      'my-closed-issues.json',
      'token-warning',
      'closedIssuesLastChecked',
      'closedIssuesAcknowledged',
    ],
    sourceAssertions: [
      sr('src/components/PromptInput/Notifications.tsx', "key: 'token-warning'"),
      sr('src/components/PromptInput/Notifications.tsx', 'timeoutMs: 18_000_000'),
      sr('src/components/PromptInput/Notifications.tsx', "getRuntimeCapabilities().workspace === 'remote'"),
      sr('src/components/PromptInput/Notifications.tsx', '<ClosedIssueNotice />'),
      sr('src/components/ClosedIssueNotice.tsx', "'cache', 'my-closed-issues.json'"),
      sr('src/components/ClosedIssueNotice.tsx', 'jsonStringify(closedIssues)'),
      sr('src/components/ClosedIssueNotice.tsx', "getFeatureValue_CACHED_MAY_BE_STALE('tengu_gouda_loop', false)"),
      sr('src/components/ClosedIssueNotice.tsx', "key: 'closed-issue-notice'"),
      sr('src/utils/config.ts', 'closedIssuesLastChecked?: number'),
      sr('src/utils/config.ts', 'closedIssuesAcknowledged?: number[]'),
    ],
  },
  {
    id: 'R22',
    retained: true,
    title: 'Inherited per-subagent status-line command and decorated task rows',
    targetFragments: [
      'subagentStatusLine',
      'taskDecorations',
      'tokenSamples',
      'Skipping subagentStatusLine execution - workspace trust not accepted',
      'subagentStatusLine emitted non-JSON line:',
      'subagentStatusLine emitted invalid schema:',
      'subagentStatusLine tick failed:',
    ],
    sourceAssertions: [
      sr('src/utils/settings/types.ts', 'subagentStatusLine: z'),
      sr('src/utils/subagentStatusLine.ts', 'SUBAGENT_STATUS_LINE_TOKEN_SAMPLE_LIMIT = 16'),
      sr('src/hooks/useSubagentStatusLine.ts', 'SUBAGENT_STATUS_LINE_REFRESH_MS = 5_000'),
      sr('src/state/AppStateStore.ts', 'taskDecorations: Record<string, { content: string }>'),
      sr('src/main.tsx', 'taskDecorations: {}'),
      sr('src/components/CoordinatorAgentStatus.tsx', 'decorations[task.id]?.content !=='),
      sr('src/components/PromptInput/PromptInput.tsx', 'export function reconcileCoordinatorTaskIndex'),
      sr('src/components/PromptInput/PromptInputFooter.tsx', 'isForkSubagentEnabled() && <CoordinatorTaskPanel />'),
      sr('src/components/PromptInput/PromptInputFooterLeftSide.tsx', 'useSubagentStatusLine();'),
      sr('src/components/tasks/BackgroundTaskStatus.tsx', 'isForkSubagentEnabled() && isPanelAgentTask(t)'),
      sr('src/components/tasks/taskStatusUtils.tsx', 'isForkSubagentEnabled() && isPanelAgentTask(t)'),
    ],
    sourcePathAbsences: [
      {
        paths: ['src/components/PromptInput/PromptInputFooter.tsx'],
        fragment: '"external" === \'ant\' && <CoordinatorTaskPanel />',
      },
    ],
  },
  {
    id: 'R23',
    title: 'CCR post-turn metadata normalizes blocked state to need-input',
    targetFragments: ['status_category:"need_input"'],
    sourceAssertions: [
      sr('src/cli/transports/ccrClient.ts', "status_category: 'need_input'"),
      sr('src/cli/transports/ccrClient.ts', 'external_metadata: externalMetadata'),
    ],
  },
  {
    id: 'R24',
    title: 'Tool-use mismatch telemetry accepts underscore-bearing identifiers',
    targetFragments: ['/toolu_[A-Za-z0-9_]+/'],
    sourceAssertions: [
      sr('src/services/api/errors.ts', 'error.message.match(/toolu_[A-Za-z0-9_]+/)'),
    ],
  },
  {
    id: 'R25',
    title: 'Security review permits Bash and PowerShell Git wildcard commands',
    targetFragments: [
      '["git diff *","git status *","git log *","git show *","git remote show *"]',
      'allowed-tools: ${O85}, Read, Glob, Grep, LS, Task',
    ],
    sourceAssertions: [
      sr('src/commands/security-review.ts', 'const SECURITY_REVIEW_GIT_COMMANDS = ['),
      sr('src/commands/security-review.ts', '`PowerShell(${command})`'),
    ],
  },
  {
    id: 'R26',
    title: 'Plugin manifest exposes exact user configuration and settings descriptions',
    targetFragments: [
      'User-configurable values this plugin needs. Prompted at enable time. Non-sensitive values saved to settings.json; sensitive values to secure storage. Available as ${user_config.KEY} in MCP/LSP server config, hook commands, and (non-sensitive only) skill/agent content. Keep sensitive value counts small.',
      'Settings to merge into the user settings while this plugin is enabled. Only the documented allowlisted keys are applied.',
    ],
    sourceAssertions: [
      sr('src/utils/plugins/schemas.ts', 'User-configurable values this plugin needs. Prompted at enable time. Non-sensitive values saved to settings.json; sensitive values to secure storage. Available as ${user_config.KEY} in MCP/LSP server config, hook commands, and (non-sensitive only) skill/agent content. Keep sensitive value counts small.'),
      sr('src/utils/plugins/schemas.ts', 'Settings to merge into the user settings while this plugin is enabled. Only the documented allowlisted keys are applied.'),
    ],
  },
  {
    id: 'R27',
    title: 'macOS keychain usernames are validated before storage lookup',
    targetFragments: ['/^[a-zA-Z0-9._-]+$/'],
    sourceAssertions: [
      sr('src/utils/secureStorage/macOsKeychainHelpers.ts', 'const VALID_KEYCHAIN_USERNAME = /^[a-zA-Z0-9._-]+$/'),
      sr('src/utils/secureStorage/macOsKeychainHelpers.ts', "VALID_KEYCHAIN_USERNAME.test(username) ? username : 'claude-code-user'"),
    ],
  },
  {
    id: 'R28',
    title: 'CLI entrypoint initializes AI_AGENT attribution before subprocesses',
    targetFragments: ['AI_AGENT'],
    sourceAssertions: [
      sr('src/entrypoints/cli.tsx', 'initializeAiAgentEnvironment();'),
      sr('src/utils/userAgent.ts', "process.env.AI_AGENT = getClaudeCodeAgentUserAgent('harness')"),
    ],
  },
  {
    id: 'R29',
    title: 'Windows shell fallback propagates through startup, hooks, monitors, and permissions',
    targetFragments: [
      'Defaults to bash (powershell on Windows without Git Bash).',
      'Claude Code on Windows requires a shell tool.',
      'requires bash but Git Bash was not found.',
    ],
    sourceAssertions: [
      sr('src/entrypoints/init.ts', 'Claude Code on Windows requires a shell tool.'),
      sr('src/hooks/usePluginMonitors.ts', 'getDefaultHookShell(),'),
      sr('src/schemas/hooks.ts', 'Defaults to bash (powershell on Windows without Git Bash).'),
      sr('src/utils/hooks.ts', 'const shellType = hook.shell ?? getDefaultHookShell()'),
      sr('src/utils/hooks/hooksSettings.ts', '(a.shell ?? getDefaultHookShell()) ==='),
      sr('src/utils/permissions/permissionSetup.ts', 'isBashToolEnabled() &&'),
      sr('src/utils/shell/resolveDefaultShell.ts', "return configured ?? (isBashToolEnabled() ? 'bash' : 'powershell')"),
    ],
  },
  {
    id: 'R30',
    title: 'Ultrareview supports launch without duplicate task registration',
    targetFragments: ['skipTaskRegistration'],
    sourceAssertions: [
      sr('src/commands/review/reviewRemote.ts', 'options?.skipTaskRegistration'),
      sr('src/tasks/RemoteAgentTask/RemoteAgentTask.tsx', 'export function extractReviewTagFromLog'),
    ],
  },
  {
    id: 'R31',
    retained: true,
    title: 'Remote Control help exposes persistent multi-session options unconditionally',
    targetFragments: [
      '--[no-]create-session-in-dir',
      'Remote Control runs as a persistent server that accepts multiple concurrent',
      'Worktree mode requires a git repository or WorktreeCreate/WorktreeRemove hooks',
    ],
    sourceAssertions: [
      sr('src/bridge/bridgeMain.ts', '--[no-]create-session-in-dir'),
      sr('src/bridge/bridgeMain.ts', 'Remote Control runs as a persistent server that accepts multiple concurrent'),
      sr('src/bridge/bridgeMain.ts', 'Worktree mode requires a git repository or WorktreeCreate/WorktreeRemove hooks'),
    ],
    sourcePathAbsences: [
      {
        paths: ['src/bridge/bridgeMain.ts'],
        fragment: 'const showServer = await isMultiSessionSpawnEnabled()',
      },
    ],
  },
  {
    id: 'R32',
    title: 'Claude AI limit telemetry records the complete status transition',
    targetFragments: ['previousStatus', 'rateLimitType', 'isUsingOverage'],
    sourceAssertions: [
      sr('src/services/claudeAiLimits.ts', 'const previousStatus = currentLimits.status'),
      sr('src/services/claudeAiLimits.ts', 'previousStatus as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS'),
      sr('src/services/claudeAiLimits.ts', 'rateLimitType:'),
      sr('src/services/claudeAiLimits.ts', 'isUsingOverage: limits.isUsingOverage'),
    ],
  },
  {
    id: 'R33',
    title: 'Silent interaction baselines reset notification and Fleet idle timers',
    targetFragments: ['resetInteractionBaseline'],
    sourceAssertions: [
      sr('src/bootstrap/state.ts', 'export function resetInteractionBaseline(): void'),
      sr('src/bootstrap/state.ts', 'resetInteractionBaseline()\n  interactionOccurred.emit()'),
      sr('src/hooks/useNotifyAfterTimeout.ts', 'resetInteractionBaseline()'),
      sr('src/components/FleetView.tsx', 'resetInteractionBaseline()'),
    ],
  },
  {
    id: 'R34',
    title: 'Classifier abort cleanup serializes idle state across terminal query paths',
    targetFragments: ['markTurnAborted', 'inFlight:void 0'],
    sourceAssertions: [
      sr('src/jobs/classifier.ts', 'export function markTurnAborted('),
      sr('src/jobs/classifier.ts', 'state.kicked = false'),
      sr(
        'src/jobs/classifier.ts',
        'state.bridgeWriteChain = state.bridgeWriteChain',
      ),
      sr('src/jobs/classifier.ts', "current.tempo !== 'active'"),
      sr(
        'src/jobs/classifier.ts',
        "tempo: 'idle',\n          inFlight: undefined,",
      ),
      sr('src/query.ts', 'function markClassifierTurnAborted('),
      sr(
        'src/query.ts',
        '!classifierJobState ||\n    !isBgSession() ||\n    !querySource.startsWith',
      ),
      sr(
        'src/query.ts',
        "!querySource.startsWith('repl_main_thread') ||\n    toolUseContext.agentId",
      ),
      sr('src/query.ts', 'jobClassifier.markTurnAborted('),
      sr(
        'src/query.ts',
        "markClassifierTurnAborted(toolUseContext, querySource)\n      return { reason: 'aborted_streaming' }",
      ),
      sr(
        'src/query.ts',
        "markClassifierTurnAborted(toolUseContext, querySource)\n      return { reason: 'aborted_tools' }",
      ),
      sr(
        'src/query.ts',
        "markClassifierTurnAborted(toolUseContext, querySource)\n      return { reason: 'hook_stopped' }",
      ),
      sr(
        'src/query.ts',
        "markClassifierTurnAborted(updatedToolUseContext, querySource)\n        return { reason: 'aborted_tools' }",
      ),
      sr(
        'src/query.ts',
        "markClassifierTurnAborted(updatedToolUseContext, querySource)\n        return { reason: 'hook_stopped' }",
      ),
    ],
  },
  {
    id: 'R35',
    title: 'Cowork memory guidelines take highest-priority auto-memory prompt ownership',
    targetFragments: [
      'CLAUDE_COWORK_MEMORY_GUIDELINES',
      '# auto memory',
    ],
    sourceAssertions: [
      sr(
        'src/memdir/memdir.ts',
        'const coworkGuidelines = process.env.CLAUDE_COWORK_MEMORY_GUIDELINES',
      ),
      sr(
        'src/memdir/memdir.ts',
        'if (autoEnabled && coworkGuidelines && coworkGuidelines.trim())',
      ),
      sr('src/memdir/memdir.ts', 'await ensureMemoryDirExists(autoDir)'),
      sr(
        'src/memdir/memdir.ts',
        'return `# auto memory\\n${coworkGuidelines.trim()}`\n  }\n\n  const skipIndex =',
      ),
    ],
  },
  {
    id: 'R36',
    retained: true,
    title: 'Worktree change inspection fails closed and reports dirty and commit state',
    targetFragments: [
      'getAgentWorktreeChanges',
      'dirty:!0,commitsAhead:0,gitError:!0',
    ],
    sourceAssertions: [
      sr(
        'src/utils/worktree.ts',
        'export async function getAgentWorktreeChanges(',
      ),
      sr(
        'src/utils/worktree.ts',
        "await execFileNoThrowWithCwd(gitExe(), ['status', '--porcelain']",
      ),
      sr(
        'src/utils/worktree.ts',
        'if (statusCode !== 0) {\n    return { dirty: true, commitsAhead: 0, gitError: true }',
      ),
      sr(
        'src/utils/worktree.ts',
        'if (!headCommit) return { dirty, commitsAhead: 0 }',
      ),
      sr('src/utils/worktree.ts', "['rev-list', '--count', `${headCommit}..HEAD`]"),
      sr(
        'src/utils/worktree.ts',
        'if (revListCode !== 0) {\n    return { dirty: true, commitsAhead: 0, gitError: true }',
      ),
      sr(
        'src/utils/worktree.ts',
        'commitsAhead: parseInt(revListOutput.trim(), 10) || 0',
      ),
      sr(
        'src/utils/worktree.ts',
        'return dirty || commitsAhead > 0',
      ),
    ],
  },
  {
    id: 'R37',
    retained: true,
    title: 'Bridge cleanup preserves crashes and changes while owning forced and shutdown removal',
    targetFragments: [
      'git error checking changes',
      'session crashed',
      'worktree removal failed, kept:',
    ],
    sourceAssertions: [
      sr('src/bridge/bridgeMain.ts', 'type BridgeWorktree = {'),
      sr('src/bridge/bridgeMain.ts', 'headCommit?: string'),
      sr('src/bridge/bridgeMain.ts', 'async function cleanupBridgeWorktree('),
      sr(
        'src/bridge/bridgeMain.ts',
        'options?.force || (worktree.hookBased && worktree.headCommit === undefined)',
      ),
      sr(
        'src/bridge/bridgeMain.ts',
        '? { dirty: false, commitsAhead: 0, gitError: false }',
      ),
      sr(
        'src/bridge/bridgeMain.ts',
        'await getAgentWorktreeChanges(\n        worktree.worktreePath,\n        worktree.headCommit,',
      ),
      sr('src/bridge/bridgeMain.ts', 'if (dirty || commitsAhead > 0)'),
      sr('src/bridge/bridgeMain.ts', "? 'git error checking changes'"),
      sr(
        'src/bridge/bridgeMain.ts',
        "worktree.hookBased,\n      'bridge',",
      ),
      sr(
        'src/bridge/bridgeMain.ts',
        'const sessionCrashed =',
      ),
      sr(
        'src/bridge/bridgeMain.ts',
        'logger.logStatus(`kept worktree ${wt.worktreePath} · session crashed`)',
      ),
      sr(
        'src/bridge/bridgeMain.ts',
        'trackCleanup(cleanupBridgeWorktree(wt, logger))',
      ),
      sr('src/bridge/bridgeMain.ts', 'headCommit: wt.headCommit'),
      sr(
        'src/bridge/bridgeMain.ts',
        'trackCleanup(cleanupBridgeWorktree(wt, logger, { force: true }))',
      ),
      sr(
        'src/bridge/bridgeMain.ts',
        'remainingWorktrees.map(wt => cleanupBridgeWorktree(wt, logger))',
      ),
      sr(
        'src/bridge/bridgeMain.ts',
        'const crashedSessionIds = new Set<string>()',
      ),
      sr(
        'src/bridge/bridgeMain.ts',
        "status === 'failed' &&\n        !loopSignal.aborted &&\n        !wasTimedOut &&\n        !fatalExit",
      ),
      sr(
        'src/bridge/bridgeMain.ts',
        'if (sessionCrashed) crashedSessionIds.add(sessionId)',
      ),
      sr(
        'src/bridge/bridgeMain.ts',
        '![...crashedSessionIds].some(sessionId =>\n      sameSessionId(sessionId, initialSessionId),',
      ),
    ],
  },
  {
    id: 'R38',
    title: 'Background deletion preserves ordinary dirty worktrees and tags owned removal',
    targetFragments: [
      'deleteJob: worktree has uncommitted changes, kept ',
      'job_delete',
    ],
    sourceAssertions: [
      sr(
        'src/cli/bg.ts',
        'const { dirty, gitError } = await getAgentWorktreeChanges(',
      ),
      sr('src/cli/bg.ts', 'if (dirty && !gitError)'),
      sr(
        'src/cli/bg.ts',
        'deleteJob: worktree has uncommitted changes, kept ${state.worktreePath}',
      ),
      sr(
        'src/cli/bg.ts',
        "state.worktreeHookBased,\n        'job_delete',",
      ),
      sr(
        'src/cli/bg.ts',
        'await rm(getJobDir(short), { recursive: true, force: true }).catch(() => {})',
      ),
    ],
  },
  {
    id: 'R39',
    title: 'Background respawn merges fresh state and conditionally resets lifecycle fields',
    targetFragments: [
      'wasSettled',
      'firstTerminalAt:null',
      'tasks:0,queued:0,kinds:[]',
    ],
    sourceAssertions: [
      sr('src/cli/bg.ts', 'const jobDir = getJobDir(short)'),
      sr(
        'src/cli/bg.ts',
        'const state = knownState ?? (await readJobState(jobDir))',
      ),
      sr(
        'src/cli/bg.ts',
        'const freshState = knownState ? ((await readJobState(jobDir)) ?? state) : state',
      ),
      sr(
        'src/cli/bg.ts',
        'wasSettled: isTerminalState(state.state)',
      ),
      sr('src/cli/bg.ts', 'const nextState: JobState = {\n    ...freshState,'),
      sr(
        'src/cli/bg.ts',
        "...(initialPrompt\n      ? {\n          tempo: 'active' as const,\n          needs: undefined,\n          output: null,\n          inFlight: undefined,",
      ),
      sr(
        'src/cli/bg.ts',
        ': { inFlight: { tasks: 0, queued: 0, kinds: [] } })',
      ),
      sr(
        'src/cli/bg.ts',
        '...(!exists ? { firstTerminalAt: null } : {})',
      ),
      sr('src/cli/bg.ts', 'await writeJobState(jobDir, nextState)'),
    ],
  },
  {
    id: 'R40',
    title: 'Fleet attach preflight rejects stale opens and forwards one respawn result',
    targetFragments: ['respawnResult', 'canPin', 'knownAlive'],
    sourceAssertions: [
      sr(
        'src/components/FleetView.tsx',
        'respawnResult?: Awaited<ReturnType<typeof respawnTemplateJob>>',
      ),
      sr('src/components/FleetView.tsx', 'const jobsRef = useRef(jobs)'),
      sr(
        'src/components/FleetView.tsx',
        'const sessionStatusesRef = useRef(sessionStatuses)',
      ),
      sr('src/components/FleetView.tsx', 'const groupModeRef = useRef(groupMode)'),
      sr(
        'src/components/FleetView.tsx',
        'const [attachingJobId, setAttachingJobId] = useState<string | null>(null)',
      ),
      sr(
        'src/components/FleetView.tsx',
        'selected && !pendingJobs.some(job => job.id === selected.id)',
      ),
      sr(
        'src/components/FleetView.tsx',
        'if (!job || attachingJobId !== null) return',
      ),
      sr(
        'src/components/FleetView.tsx',
        'if (pendingJobs.some(pending => pending.id === job.id)) return',
      ),
      sr(
        'src/components/FleetView.tsx',
        "if (job.state.backend === 'peer') return",
      ),
      sr(
        'src/components/FleetView.tsx',
        'Date.now() - lastSessionStatusesTs < 1_500',
      ),
      sr(
        'src/components/FleetView.tsx',
        'void respawnTemplateJob(job.id, {\n      knownState: job.state,\n      knownAlive,',
      ),
      sr(
        'src/components/FleetView.tsx',
        'if (focusedJobId.current !== job.id) return',
      ),
      sr(
        'src/components/FleetView.tsx',
        'if (respawnResult.ok || respawnResult.alive)',
      ),
      sr('src/components/FleetView.tsx', 'respawnResult,\n        })'),
      sr('src/components/FleetView.tsx', 'setError(respawnResult.error)'),
      sr(
        'src/components/FleetView.tsx',
        'focusedJobId.current = null\n        setAttachingJobId(null)',
      ),
      sr(
        'src/components/FleetView.tsx',
        'freshDispatch: true,\n            })',
      ),
      sr(
        'src/components/FleetView.tsx',
        "x stop/rm{canPin ? ' · ctrl+t pin' : ''}",
      ),
      sr(
        'src/components/FleetView.tsx',
        'action.respawnResult ??\n        (await respawnTemplateJob(',
      ),
    ],
  },
]

const fleetSpecs = [
  {
    id: 'F01',
    title: 'Fleet automatic update relaunch is idle-, focus-, and interval-gated',
    targetFragments: [
      'CLAUDE_AGENTS_AUTO_RELAUNCHED_AT',
      'fleetview_update_',
      "Couldn't switch to the latest build",
    ],
    sourceAssertions: [
      sr('src/components/FleetView.tsx', 'export const AUTO_RELAUNCH_UNFOCUSED_MS = 3_600_000'),
      sr('src/components/FleetView.tsx', 'export const AUTO_RELAUNCH_MIN_INTERVAL_MS = 21_600_000'),
      sr('src/components/FleetView.tsx', "AUTO_RELAUNCH_ENV_KEY = 'CLAUDE_AGENTS_AUTO_RELAUNCHED_AT'"),
      sr('src/components/FleetView.tsx', 'if (!updateAvailable || isTerminalFocused) return'),
      sr('src/components/FleetView.tsx', 'relaunchUpdate(\'auto\')'),
    ],
  },
  {
    id: 'F02',
    title: 'Updater result is shared and relaunch owns synchronous process replacement',
    targetFragments: [
      'process.removeAllListeners("beforeExit")',
      'process.removeAllListeners("exit")',
      '.spawnSync(',
    ],
    sourceAssertions: [
      sr('src/state/AppStateStore.ts', 'autoUpdaterResult: AutoUpdaterResult | null'),
      sr('src/components/AutoUpdater.tsx', 'state => state.autoUpdaterResult'),
      sr('src/components/NativeAutoUpdater.tsx', 'state => state.autoUpdaterResult'),
      sr('src/components/PromptInput/Notifications.tsx', 'state => state.autoUpdaterResult?.status'),
      sr('src/utils/relaunch.ts', 'const result = spawnSync(cmd, args'),
      sr('src/utils/relaunch.ts', "process.removeAllListeners('beforeExit')"),
      sr('src/utils/relaunch.ts', "process.removeAllListeners('exit')"),
      sr('src/components/AutoUpdaterWrapper.tsx', 'return <PackageManagerAutoUpdater verbose={verbose}'),
    ],
  },
]

function ownedSpecs(specs, category, inventory = null) {
  const inventoryById = new Map(
    (inventory?.obligations ?? []).map(row => [row.id, row]),
  )
  return specs.map(spec => {
    const inventoryRow = inventoryById.get(spec.id)
    return {
      ...spec,
      obligationId: `${category.toLowerCase()}-${spec.id.toLowerCase()}`,
      category,
      title: spec.title ?? inventoryRow?.title,
      rationale:
        spec.rationale ??
        inventoryRow?.targetWitnesses?.join('. ') ??
        spec.title,
      sourcePathAbsences: spec.sourcePathAbsences ?? [],
    }
  })
}

const official = JSON.parse(fs.readFileSync(officialPath, 'utf8'))
const hidden = JSON.parse(fs.readFileSync(hiddenPath, 'utf8'))
const baselineBytes = fs.readFileSync(baselinePath)
const targetBytes = fs.readFileSync(targetPath)
const baseline = baselineBytes.toString('utf8')
const target = targetBytes.toString('utf8')

assert(baselineBytes.length === 13_720_987, 'baseline byte length')
assert(
  sha256(baselineBytes) ===
    '9a1fccbe69ffe06c82345db1cc8cdbbc9a9929ed723bc8832ad48dfeff64b4ef',
  'baseline SHA-256',
)
assert(targetBytes.length === 13_784_743, 'target byte length')
assert(
  sha256(targetBytes) ===
    'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f',
  'target SHA-256',
)
assert(official.rows.length === 22, 'official row count')
assert(hidden.obligations.length === 15, 'hidden row count')

const specs = [
  ...officialRows(official),
  ...ownedSpecs(hiddenSpecs, 'hidden', hidden),
  ...ownedSpecs(daemonSpecs, 'daemon'),
  ...ownedSpecs(selectionSpecs, 'selection'),
  ...ownedSpecs(residualSpecs, 'residual'),
  ...ownedSpecs(fleetSpecs, 'fleet'),
]
assert(new Set(specs.map(row => row.id)).size === specs.length, 'unique row IDs')

const rows = specs.map(spec => {
  const targetFragments = spec.targetFragments.map(text =>
    targetRecord(text, baseline, target),
  )
  assert(
    targetFragments.some(
      fragment => fragment.baselineCount !== fragment.targetCount,
    ) || spec.category === 'official' || spec.retained === true,
    `${spec.id}: non-official row needs adjacent count evidence`,
  )
  assert(
    targetFragments.some(
      fragment => fragment.baselineCount > 0 || fragment.targetCount > 0,
    ),
    `${spec.id}: every row needs an authenticated bundle witness`,
  )
  const targetAbsences = targetFragments.filter(
    fragment => fragment.targetCount === 0,
  )
  const sourceAssertions = spec.sourceAssertions.map(sourceRecord)
  const sourcePathAbsences = spec.sourcePathAbsences.map(
    sourcePathAbsenceRecord,
  )
  return {
    id: spec.id,
    obligationId: spec.obligationId,
    category: spec.category,
    ...(spec.releaseBullet === undefined
      ? {}
      : { releaseBullet: spec.releaseBullet }),
    title: spec.title,
    rationale: spec.rationale,
    evidenceKind: 'reviewed-row-scoped-direct-evidence',
    targetFragments,
    targetAbsences,
    sourceAssertions,
    sourceAbsences: [],
    sourcePathAbsences,
  }
})

const categoryCounts = Object.fromEntries(
  [...new Set(rows.map(row => row.category))].map(category => [
    category,
    rows.filter(row => row.category === category).length,
  ]),
)
assert(categoryCounts.official === 22, 'official direct row count')
assert(categoryCounts.hidden === 15, 'hidden direct row count')
assert(categoryCounts.daemon === 3, 'daemon direct row count')
assert(categoryCounts.selection === 2, 'selection direct row count')
assert(categoryCounts.residual === 40, 'residual direct row count')
assert(categoryCounts.fleet === 2, 'fleet direct row count')

const output = {
  schemaVersion: 1,
  case: '2.1.119-to-2.1.120',
  release: '2.1.120',
  baseline: {
    bytes: baselineBytes.length,
    sha256: sha256(baselineBytes),
  },
  target: {
    bytes: targetBytes.length,
    sha256: sha256(targetBytes),
  },
  inputs: {
    official: {
      path: path.relative(repo, officialPath),
      bytes: fs.statSync(officialPath).size,
      sha256: sha256(fs.readFileSync(officialPath)),
    },
    hidden: {
      path: path.relative(repo, hiddenPath),
      bytes: fs.statSync(hiddenPath).size,
      sha256: sha256(fs.readFileSync(hiddenPath)),
    },
  },
  rowCount: rows.length,
  categoryCounts,
  rows,
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
const outputBytes = fs.readFileSync(outputPath)
console.log(
  JSON.stringify({
    status: '2.1.120-direct-evidence-built',
    path: path.relative(repo, outputPath),
    bytes: outputBytes.length,
    sha256: sha256(outputBytes),
    rows: rows.length,
    categoryCounts,
    targetFragments: rows.reduce(
      (sum, row) => sum + row.targetFragments.length,
      0,
    ),
    targetAbsences: rows.reduce(
      (sum, row) => sum + row.targetAbsences.length,
      0,
    ),
    sourceAssertions: rows.reduce(
      (sum, row) => sum + row.sourceAssertions.length,
      0,
    ),
    sourcePathAbsences: rows.reduce(
      (sum, row) => sum + row.sourcePathAbsences.length,
      0,
    ),
  }),
)
