#!/usr/bin/env node

import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

export const RELEASE_2_1_124 = Object.freeze({
  case: '2.1.123-to-2.1.124',
  release: '2.1.124',
  baseline: {
    bytes: 13_949_576,
    sha256: '59c8eebc0660d4bbc5c1f82af0ca5e94df5db46084687b979ad21a07fba3d7dd',
  },
  target: {
    bytes: 13_980_928,
    sha256: 'dc2b68c385a3064737343e51e6d7c690f9e03cc40fa89c4393708ae03094d590',
  },
  normalizedTarget: {
    bytes: 13_980_928,
    sha256: 'ba52324141d6f5002f3a9e1a089bbac6f5155f0c8386c1c971756a704ca96a8e',
  },
  targetTokens: 4_405_970,
  targetUnits: 22_358,
  totalClusters: 205,
})

const METADATA_REPLACEMENTS = Object.freeze([
  ['version', '2.1.123', '2.1.124', 163],
  ['buildTimestamp', '2026-04-29T00:34:52Z', '2026-04-30T00:25:36Z', 162],
  ['sourceRevision', '54903ade25087ef906df59ec6a608cc3a50a3f06', '241621312a512bb8563f31eaa762903c15edaa07', 162],
])

const ARTIFACTS = Object.freeze({
  rawLedger: 'structural/generated-delta.json.gz',
  metadataLedger: 'structural/metadata-normalized-delta.json.gz',
  exactLedger: 'structural/known-delta-ledger.json.gz',
  clusterLedger: 'structural/semantic-cluster-ledger.json.gz',
  proof: 'structural/known-delta-proof.json',
})

const BASE_REVISION = '338d170737e8294c489481bc2e8fac52d8ce5f85'
const BASELINE_STATEMENT_CLUSTERS = new Set([7, 115, 186, 188, 189])
const PREFERRED_CLUSTER_STATEMENT_INDEX = Object.freeze({
  30: 6_577,
  37: 6_960,
  45: 7_950,
  66: 11_317,
  69: 11_954,
  73: 12_042,
  78: 12_593,
  80: 12_631,
  65: 11_287,
  75: 12_385,
  82: 13_030,
  83: 13_054,
  87: 13_472,
  99: 14_140,
  115: 14_953,
  122: 15_824,
  125: 15_945,
  126: 16_018,
  127: 16_045,
  133: 17_446,
  135: 17_665,
  139: 18_068,
  142: 18_456,
  150: 19_195,
  151: 19_206,
  162: 19_637,
  163: 19_683,
  166: 19_746,
  167: 19_756,
  170: 20_349,
  173: 20_480,
  178: 20_702,
  185: 21_195,
  186: 21_157,
  188: 21_309,
  189: 21_334,
  192: 21_480,
  183: 21_062,
  195: 21_928,
  198: 22_170,
})

const EXPECTED_ARTIFACTS = Object.freeze({
  rawLedger: { bytes: 2_415_762, sha256: '0675cd7f48b2d74b5922e5eacabd76a8a151d9cdd6f515d76e2aa350fb83e982' },
  metadataLedger: { bytes: 2_397_530, sha256: 'de7f4b2a3bd15392758ac3c981d4759f54bfcdb9a5ee3a810d8215fe4da3e460' },
  exactLedger: { bytes: 2_234_460, sha256: '97cf1e6fe195eb4a2605cb0ade2de5fe8963adcb1a02ab2cafd731a783f54a24' },
  clusterLedger: { bytes: 157_873, sha256: '412326ff7ff466aa8d6f2d661122355b1e16ce7a8b66a9302cbc51881aa20157' },
})

const ALL_CHANGED_SOURCE_PATHS = Object.freeze([
  'src/QueryEngine.ts',
  'src/Tool.ts',
  'src/bootstrap/state.ts',
  'src/bridge/initReplBridge.ts',
  'src/bridge/trustedDevice.ts',
  'src/cli/bg.ts',
  'src/cli/exit.ts',
  'src/cli/handlers/auth.ts',
  'src/cli/handlers/project.tsx',
  'src/cli/handlers/templateJobs.ts',
  'src/cli/print.ts',
  'src/commands/bridge/bridge.tsx',
  'src/commands/clear/caches.ts',
  'src/commands/clear/conversation.ts',
  'src/commands/compact/compact.ts',
  'src/commands/effort/effort.tsx',
  'src/commands/init.ts',
  'src/commands/logout/logout.tsx',
  'src/commands/plugin/ManagePlugins.tsx',
  'src/commands/review/ultrareviewEnabled.ts',
  'src/commands/teleport/teleport.tsx',
  'src/components/FleetView.tsx',
  'src/components/FeedbackSurvey/MemoryEvaluationSurveyView.tsx',
  'src/components/HistorySearchDialog.tsx',
  'src/components/InvalidSettingsDialog.tsx',
  'src/components/Messages.tsx',
  'src/components/PromptInput/PromptInput.tsx',
  'src/components/PromptInput/PromptInputFooter.tsx',
  'src/components/PromptInput/useSwarmBanner.ts',
  'src/components/QuickOpenDialog.tsx',
  'src/components/ScrollKeybindingHandler.tsx',
  'src/components/design-system/FuzzyPicker.tsx',
  'src/components/messages/SystemAPIErrorMessage.tsx',
  'src/components/tasks/BackgroundTasksDialog.tsx',
  'src/constants/betas.ts',
  'src/constants/prompts.ts',
  'src/daemon/jobs.ts',
  'src/daemon/main.ts',
  'src/daemon/spare.ts',
  'src/daemon/supervisor.ts',
  'src/dialogLaunchers.tsx',
  'src/entrypoints/cli.tsx',
  'src/entrypoints/init.ts',
  'src/entrypoints/sdk/coreSchemas.ts',
  'src/entrypoints/sdk/controlSchemas.ts',
  'src/history.ts',
  'src/hooks/fileSuggestions.ts',
  'src/hooks/notifs/useStartupNotifications.tsx',
  'src/hooks/unifiedSuggestions.ts',
  'src/hooks/useHistorySearch.ts',
  'src/hooks/useReplBridge.tsx',
  'src/hooks/useTypeahead.tsx',
  'src/ink/scroll-config.ts',
  'src/ink/termio/osc.ts',
  'src/jobs/classifier.ts',
  'src/keybindings/defaultBindings.ts',
  'src/keybindings/schema.ts',
  'src/main.tsx',
  'src/migrations/migrateNotificationImpressions.ts',
  'src/query/stopHooks.ts',
  'src/screens/Doctor.tsx',
  'src/screens/REPL.tsx',
  'src/services/PromptSuggestion/speculation.ts',
  'src/services/analytics/growthbook.ts',
  'src/services/api/claude.ts',
  'src/services/api/client.ts',
  'src/services/api/errors.ts',
  'src/services/api/workloadIdentity.ts',
  'src/services/compact/autoCompact.ts',
  'src/services/mcp/auth.ts',
  'src/services/mcp/client.ts',
  'src/services/mcp/config.ts',
  'src/services/oauth/auth-code-listener.ts',
  'src/services/oauth/client.ts',
  'src/services/toolUseSummary/toolUseSummaryGenerator.ts',
  'src/services/tools/StreamingToolExecutor.ts',
  'src/services/tools/toolExecution.ts',
  'src/services/tools/toolIsolation.ts',
  'src/services/tools/toolOrchestration.ts',
  'src/state/AppStateStore.ts',
  'src/tools/AgentTool/runAgent.ts',
  'src/tools/AskUserQuestionTool/AskUserQuestionTool.tsx',
  'src/tools/BashTool/readOnlyValidation.ts',
  'src/tools/BriefTool/BriefTool.ts',
  'src/tools/BriefTool/prompt.ts',
  'src/tools/EnterPlanModeTool/EnterPlanModeTool.ts',
  'src/tools/ExitPlanModeTool/ExitPlanModeV2Tool.ts',
  'src/tools/FileReadTool/FileReadTool.ts',
  'src/tools/FileReadTool/imageProcessor.ts',
  'src/tools/ListPeersTool/constants.ts',
  'src/tools/REPLTool/prompt.ts',
  'src/tools/REPLTool/types.ts',
  'src/tools/REPLTool/vm.ts',
  'src/tools/SkillTool/SkillTool.ts',
  'src/tools/WebSearchTool/WebSearchTool.ts',
  'src/tools/shared/gitOperationTracking.ts',
  'src/types/logs.ts',
  'src/upstreamproxy/relay.ts',
  'src/upstreamproxy/upstreamproxy.ts',
  'src/utils/attachments.ts',
  'src/utils/auth.ts',
  'src/utils/bash/ast.ts',
  'src/utils/config.ts',
  'src/utils/conversationRecovery.ts',
  'src/utils/hooks/hooksConfigManager.ts',
  'src/utils/imageResizer.ts',
  'src/utils/managedEnvConstants.ts',
  'src/utils/messages.ts',
  'src/utils/model/gatewayModelDiscovery.ts',
  'src/utils/model/model.ts',
  'src/utils/model/modelOptions.ts',
  'src/utils/permissions/permissions.ts',
  'src/utils/permissions/permissionRuleParser.ts',
  'src/utils/permissions/yoloClassifier.ts',
  'src/utils/plugins/refresh.ts',
  'src/utils/powershell/parser.ts',
  'src/utils/prStatus.ts',
  'src/utils/processUserInput/processSlashCommand.tsx',
  'src/utils/sandbox/sandbox-adapter.ts',
  'src/utils/sessionStorage.ts',
  'src/utils/sessionStoragePortable.ts',
  'src/utils/settings/settings.ts',
  'src/utils/settings/settingsCache.ts',
  'src/utils/settings/types.ts',
  'src/utils/shell/powershellDetection.ts',
  'src/utils/subprocessEnv.ts',
  'src/utils/suggestions/commandSuggestions.ts',
  'src/utils/swarm/spawnUtils.ts',
  'src/utils/taskSummary.ts',
  'src/utils/telemetry/pluginTelemetry.ts',
  'src/utils/udsClient.ts',
])


// Canonical, statement-reviewed ownership.  A cluster may name more than one
// source witness only when the same bundle cluster spans multiple active
// source-level statements or an exported declaration and its callsite.
const PRECISE_CLUSTER_SOURCE_SPECS = Object.freeze({
  3: ['src/utils/settings/settingsCache.ts'],
  5: ['src/bootstrap/state.ts'],
  6: ['src/bootstrap/state.ts'],
  7: ['src/bootstrap/state.ts'],
  8: ['src/bootstrap/state.ts'],
  12: ['src/tools/ListPeersTool/constants.ts', 'src/utils/permissions/permissionRuleParser.ts'],
  13: ['src/tools/BriefTool/prompt.ts'],
  14: ['src/utils/permissions/permissionRuleParser.ts'],
  15: ['src/utils/settings/types.ts'],
  17: ['src/utils/settings/settings.ts'],
  18: ['src/utils/settings/settings.ts'],
  19: ['src/services/oauth/client.ts'],
  20: ['src/services/api/workloadIdentity.ts'],
  21: ['src/services/api/workloadIdentity.ts'],
  22: ['src/services/api/workloadIdentity.ts'],
  23: ['src/constants/betas.ts'],
  24: ['src/utils/model/model.ts'],
  25: ['src/services/api/workloadIdentity.ts'],
  27: ['src/services/api/client.ts'],
  28: ['src/services/api/client.ts'],
  29: ['src/utils/auth.ts'],
  30: ['src/utils/auth.ts'],
  32: ['src/services/analytics/growthbook.ts'],
  35: ['src/utils/config.ts'],
  37: ['src/ink/termio/osc.ts'],
  38: ['src/ink/termio/osc.ts'],
  39: ['src/ink/scroll-config.ts'],
  40: ['src/keybindings/defaultBindings.ts'],
  41: ['src/keybindings/schema.ts'],
  42: ['src/tools/FileReadTool/imageProcessor.ts'],
  43: ['src/utils/imageResizer.ts'],
  44: ['src/history.ts'],
  45: ['src/history.ts'],
  46: ['src/daemon/jobs.ts'],
  48: ['src/utils/sandbox/sandbox-adapter.ts'],
  49: ['src/services/api/errors.ts'],
  50: ['src/services/api/errors.ts'],
  51: ['src/services/api/errors.ts'],
  52: ['src/services/api/errors.ts'],
  53: ['src/utils/bash/ast.ts'],
  54: ['src/utils/bash/ast.ts'],
  55: ['src/utils/telemetry/pluginTelemetry.ts'],
  57: ['src/entrypoints/sdk/coreSchemas.ts'],
  58: ['src/services/toolUseSummary/toolUseSummaryGenerator.ts'],
  59: ['src/tools/shared/gitOperationTracking.ts'],
  62: ['src/bridge/trustedDevice.ts'],
  63: ['src/utils/managedEnvConstants.ts'],
  64: ['src/tools/BashTool/readOnlyValidation.ts'],
  65: ['src/services/tools/toolOrchestration.ts'],
  66: ['src/services/PromptSuggestion/speculation.ts', 'src/components/PromptInput/PromptInput.tsx'],
  67: ['src/commands/logout/logout.tsx'],
  68: ['src/services/oauth/auth-code-listener.ts'],
  69: ['src/services/mcp/auth.ts'],
  70: ['src/services/mcp/config.ts'],
  71: ['src/services/mcp/config.ts'],
  72: ['src/services/mcp/config.ts'],
  73: ['src/cli/handlers/auth.ts'],
  75: ['src/utils/udsClient.ts'],
  76: ['src/utils/conversationRecovery.ts'],
  77: ['src/utils/swarm/spawnUtils.ts'],
  78: ['src/utils/permissions/yoloClassifier.ts'],
  79: ['src/utils/permissions/yoloClassifier.ts'],
  80: ['src/utils/permissions/yoloClassifier.ts'],
  81: ['src/utils/prStatus.ts'],
  82: ['src/utils/prStatus.ts'],
  83: ['src/components/messages/SystemAPIErrorMessage.tsx'],
  84: ['src/utils/processUserInput/processSlashCommand.tsx'],
  85: ['src/tools/SkillTool/SkillTool.ts'],
  87: ['src/utils/shell/powershellDetection.ts'],
  88: ['src/tools/BriefTool/BriefTool.ts'],
  89: ['src/tools/REPLTool/prompt.ts'],
  90: ['src/services/tools/toolIsolation.ts'],
  91: ['src/services/tools/toolIsolation.ts'],
  92: ['src/tools/REPLTool/vm.ts'],
  93: ['src/tools/WebSearchTool/WebSearchTool.ts'],
  94: ['src/tools/ExitPlanModeTool/ExitPlanModeV2Tool.ts'],
  95: ['src/tools/AskUserQuestionTool/AskUserQuestionTool.tsx'],
  96: ['src/tools/EnterPlanModeTool/EnterPlanModeTool.ts'],
  99: ['src/services/tools/toolExecution.ts', 'src/services/tools/StreamingToolExecutor.ts'],
  100: ['src/jobs/classifier.ts'],
  101: ['src/utils/taskSummary.ts'],
  102: ['src/utils/taskSummary.ts', 'src/query/stopHooks.ts'],
  103: ['src/tools/AgentTool/runAgent.ts'],
  104: ['src/utils/attachments.ts'],
  105: ['src/utils/attachments.ts'],
  106: ['src/utils/attachments.ts'],
  107: ['src/utils/plugins/refresh.ts'],
  108: ['src/utils/powershell/parser.ts'],
  109: ['src/tools/FileReadTool/FileReadTool.ts'],
  110: ['src/services/compact/autoCompact.ts'],
  111: ['src/services/compact/autoCompact.ts'],
  115: ['src/services/mcp/auth.ts'],
  117: ['src/services/mcp/client.ts', 'src/Tool.ts'],
  118: ['src/utils/permissions/permissions.ts'],
  119: ['src/utils/messages.ts'],
  120: ['src/utils/messages.ts'],
  121: ['src/utils/messages.ts'],
  122: ['src/hooks/fileSuggestions.ts'],
  124: ['src/commands/clear/conversation.ts'],
  125: ['src/commands/compact/compact.ts'],
  126: ['src/utils/model/gatewayModelDiscovery.ts'],
  127: ['src/utils/model/modelOptions.ts'],
  128: ['src/screens/Doctor.tsx'],
  129: ['src/commands/init.ts'],
  130: ['src/commands/plugin/ManagePlugins.tsx'],
  131: ['src/components/Messages.tsx'],
  132: ['src/components/Messages.tsx'],
  133: ['src/commands/review/ultrareviewEnabled.ts'],
  134: ['src/components/tasks/BackgroundTasksDialog.tsx'],
  135: ['src/commands/teleport/teleport.tsx'],
  136: ['src/components/design-system/FuzzyPicker.tsx'],
  137: ['src/utils/hooks/hooksConfigManager.ts'],
  139: ['src/utils/plugins/refresh.ts'],
  140: ['src/commands/effort/effort.tsx'],
  142: ['src/commands/bridge/bridge.tsx'],
  143: ['src/cli/bg.ts'],
  144: ['src/cli/handlers/templateJobs.ts'],
  146: ['src/cli/handlers/templateJobs.ts'],
  148: ['src/utils/sessionStorage.ts'],
  149: ['src/utils/sessionStorage.ts'],
  150: ['src/utils/sessionStorage.ts'],
  151: ['src/utils/sessionStorage.ts'],
  152: ['src/utils/sessionStorage.ts'],
  153: ['src/utils/sessionStorage.ts'],
  154: ['src/utils/sessionStorage.ts'],
  155: ['src/utils/sessionStorage.ts'],
  156: ['src/utils/sessionStorage.ts'],
  160: ['src/constants/prompts.ts'],
  161: ['src/constants/prompts.ts'],
  162: ['src/services/api/claude.ts'],
  163: ['src/daemon/spare.ts'],
  164: ['src/daemon/supervisor.ts'],
  166: ['src/upstreamproxy/relay.ts'],
  167: ['src/upstreamproxy/upstreamproxy.ts'],
  168: ['src/entrypoints/init.ts'],
  169: ['src/hooks/useReplBridge.tsx'],
  170: ['src/hooks/useHistorySearch.ts'],
  171: ['src/utils/suggestions/commandSuggestions.ts'],
  172: ['src/hooks/useTypeahead.tsx'],
  173: ['src/components/HistorySearchDialog.tsx'],
  174: ['src/components/PromptInput/PromptInputFooter.tsx'],
  175: ['src/components/PromptInput/PromptInputFooter.tsx'],
  177: ['src/components/PromptInput/useSwarmBanner.ts'],
  178: ['src/components/PromptInput/PromptInput.tsx'],
  180: ['src/components/FleetView.tsx'],
  181: ['src/components/FleetView.tsx'],
  182: ['src/components/FleetView.tsx'],
  183: ['src/components/FleetView.tsx'],
  184: ['src/components/FeedbackSurvey/MemoryEvaluationSurveyView.tsx'],
  185: ['src/hooks/notifs/useStartupNotifications.tsx'],
  186: ['src/hooks/notifs/useStartupNotifications.tsx'],
  187: ['src/entrypoints/sdk/controlSchemas.ts'],
  188: ['src/hooks/notifs/useStartupNotifications.tsx'],
  189: ['src/hooks/notifs/useStartupNotifications.tsx'],
  191: ['src/components/ScrollKeybindingHandler.tsx'],
  192: ['src/screens/REPL.tsx'],
  193: ['src/components/InvalidSettingsDialog.tsx'],
  194: ['src/dialogLaunchers.tsx'],
  195: ['src/migrations/migrateNotificationImpressions.ts'],
  196: ['src/QueryEngine.ts'],
  197: ['src/cli/print.ts'],
  198: ['src/cli/handlers/project.tsx'],
  199: ['src/main.tsx'],
  200: ['src/main.tsx'],
  201: ['src/main.tsx', 'src/daemon/spare.ts'],
  203: ['src/daemon/supervisor.ts'],
  204: ['src/daemon/main.ts'],
  205: ['src/entrypoints/cli.tsx'],
})


// Reviewed exceptions for source statements whose minified semantic terms do
// not survive source spelling.  The key includes the cluster so a fragment can
// never be reused as generic evidence for another change in the same file.
const PRECISE_REVIEWED_SOURCE_FRAGMENTS = Object.freeze({
  '46::src/daemon/jobs.ts': "if (latest.name === name || (source === 'auto' && latest.name)) return true",
  '42::src/tools/FileReadTool/imageProcessor.ts': 'export function getImageDimensionsFromBuffer(',
  '54::src/utils/bash/ast.ts': 'const BACKSLASH_WHITESPACE_RE =',
  '57::src/entrypoints/sdk/coreSchemas.ts': "'oauth_org_not_allowed',",
  '58::src/services/toolUseSummary/toolUseSummaryGenerator.ts': 'enablePromptCaching: false,',
  '65::src/services/tools/toolOrchestration.ts': 'for await (const update of runToolUse(',
  '66::src/components/PromptInput/PromptInput.tsx': 'if (Date.now() - speculation.startTime > SPECULATION_STALE_TIMEOUT_MS) {',
  '80::src/utils/permissions/yoloClassifier.ts': 'async function runClassifierRequest(',
  '81::src/utils/prStatus.ts': 'function createConcurrencyLimiter<Args extends unknown[], Result>(',
  '82::src/utils/prStatus.ts': '`[ghPrStatus] batch query failed on ${host} (exit ${result.code}); keeping last-known`',
  '94::src/tools/ExitPlanModeTool/ExitPlanModeV2Tool.ts': 'getAllowedChannels().length > 0 &&\n      getIsNonInteractiveSession()',
  '95::src/tools/AskUserQuestionTool/AskUserQuestionTool.tsx': "if ((feature('KAIROS') || feature('KAIROS_CHANNELS')) && getAllowedChannels().length > 0 && getIsNonInteractiveSession()) {",
  '96::src/tools/EnterPlanModeTool/EnterPlanModeTool.ts': 'getAllowedChannels().length > 0 &&\n      getIsNonInteractiveSession()',
  '99::src/services/tools/StreamingToolExecutor.ts': 'let hasCompletedResults = false',
  '99::src/services/tools/toolExecution.ts': 'toolUseContext.setInProgressToolUseIDs(previous =>',
  '102::src/utils/taskSummary.ts': 'const REMOTE_CCR_ENTRYPOINTS = new Set([',
  '108::src/utils/powershell/parser.ts': "if ($tok.Kind -eq $tk::Generic -and ($tok.Text -replace '[\\u2013\\u2014\\u2015]','-') -eq '--%') {",
  '110::src/services/compact/autoCompact.ts': 'export function shouldUseColdCompact(): boolean {',
  '111::src/services/compact/autoCompact.ts': 'const stripNonEssential = shouldUseColdCompact()',
  '125::src/commands/compact/compact.ts': 'shouldUseColdCompact(),',
  '128::src/screens/Doctor.tsx': 'function getSandboxDependencyErrors(): string[] {',
  '131::src/components/Messages.tsx': 'const turnsWithReplacementText = new Set<number>();',
  '132::src/components/Messages.tsx': 'const briefFiltered = briefToolNames.length > 0 && !isTranscriptMode ? isBriefOnly ? filterForBriefTool(messagesToShowNotTruncated, briefToolNames, dropTextToolNames) : dropTextToolNames.length > 0 ? dropTextInBriefTurns(messagesToShowNotTruncated, dropTextToolNames) : messagesToShowNotTruncated : messagesToShowNotTruncated;',
  '133::src/commands/review/ultrareviewEnabled.ts': 'return getUltrareviewConfig()?.enabled === true && isBridgeEnabled()',
  '134::src/components/tasks/BackgroundTasksDialog.tsx': "...((currentSelection as { type: string } | null)?.type !== 'mcp_task' ? [<KeyboardShortcutHint key=\"enter\" shortcut=\"Enter\" action=\"view\" />] : []),",
  '139::src/utils/plugins/refresh.ts': 'clearInstalledPluginsCache()',
  '140::src/commands/effort/effort.tsx': 'function setEffortValue(effortValue: EffortValue): EffortCommandResult {',
  '142::src/commands/bridge/bridge.tsx': 'const trustedDeviceReason = getTrustedDeviceUnenrolledReason();',
  '144::src/cli/handlers/templateJobs.ts': "tempo: 'active',",
  '161::src/constants/prompts.ts': "return 'Shell: PowerShell (use PowerShell syntax — e.g., $null not /dev/null, $env:VAR not $VAR, backtick for line continuation). Bash is also available via the Bash tool for POSIX scripts.'",
  '174::src/components/PromptInput/PromptInputFooter.tsx': 'const modeLabels = [',
  '198::src/cli/handlers/project.tsx': 'export async function purgeProjectHandler(',
  '3::src/utils/settings/settingsCache.ts': 'export function getCachedPolicyTierSettings(): SettingsJson[] | undefined {',
  '5::src/bootstrap/state.ts': 'export function createStickyBetas(): StickyBetas {',
  '7::src/bootstrap/state.ts': 'return stickyBetas.sent.has(beta) && !stickyBetas.rejected.has(beta)',
  '8::src/bootstrap/state.ts': 'STATE.stickyBetas = createStickyBetas()',
  '12::src/tools/ListPeersTool/constants.ts': "export const LIST_PEERS_TOOL_NAME = 'ListPeers'",
  '12::src/utils/permissions/permissionRuleParser.ts': "} from '../../tools/ListPeersTool/constants.js'",
  '13::src/tools/BriefTool/prompt.ts': "'You ended the turn without calling SendUserMessage.'",
  '14::src/utils/permissions/permissionRuleParser.ts': '[LIST_PEERS_TOOL_NAME]: LIST_AGENTS_TOOL_NAME,',
  '17::src/utils/settings/settings.ts': 'export function getAllPolicyTierSettings(): SettingsJson[] {',
  '18::src/utils/settings/settings.ts': 'export function hasIsolatePeerMachines(): boolean {',
  '19::src/services/oauth/client.ts': 'timeout: 30000,',
  '20::src/services/api/workloadIdentity.ts': 'const authType = getProfileAuthType(configDir, profile)',
  '21::src/services/api/workloadIdentity.ts': 'function getProfileAuthType(configDir: string, profile: string): string | null {',
  '22::src/services/api/workloadIdentity.ts': 'const authType = getProfileAuthType(configDir, explicitProfile)',
  '25::src/services/api/workloadIdentity.ts': 'signal: AbortSignal.timeout(10_000),',
  '29::src/utils/auth.ts': 'if (isInvalidGrantError(error) && refreshTokenUsed) {',
  '32::src/services/analytics/growthbook.ts': 'export function isGrowthBookEnabled(): boolean {',
  '35::src/utils/config.ts': 'export function deleteProjectConfig(projectPath: string): void {',
  '38::src/ink/termio/osc.ts': 'const POWERSHELL_CLIPBOARD_COMMAND =',
  '39::src/ink/scroll-config.ts': 'return version !== null && version >= 1_092_000 && version < 1_105_000',
  '43::src/utils/imageResizer.ts': 'const fallbackDimensions = getImageDimensionsFromBuffer(imageBuffer)',
  '44::src/history.ts': "scope: HistoryScope = 'project',",
  '50::src/services/api/errors.ts': 'return OAUTH_ORG_NOT_ALLOWED_ERROR_MESSAGE',
  '51::src/services/api/errors.ts': "error: 'oauth_org_not_allowed',",
  '53::src/utils/bash/ast.ts': "const gap = Buffer.from(node.text, 'utf8')",
  '59::src/tools/shared/gitOperationTracking.ts': 'setSessionPrResolved(true)',
  '62::src/bridge/trustedDevice.ts': 'export function getTrustedDeviceUnenrolledReason(): string | null {',
  '66::src/services/PromptSuggestion/speculation.ts': 'export const SPECULATION_STALE_TIMEOUT_MS = 30_000',
  '68::src/services/oauth/auth-code-listener.ts': "this.localServer.listen(port ?? 0, '127.0.0.1', () => {",
  '69::src/services/mcp/auth.ts': 'export function hasExpiredMcpAccessTokenWithoutRefresh(',
  '69::src/services/mcp/config.ts': 'hasExpiredMcpAccessTokenWithoutRefresh(name, config, oauthEntries))',
  '71::src/services/mcp/config.ts': "(config.type === 'sse' || config.type === 'http') &&",
  '73::src/cli/handlers/auth.ts': "process.stdout.write('Paste code here if prompted > ')",
  '78::src/services/tools/toolExecution.ts': 'toolUseContext.setInProgressToolUseIDs(previous =>',
  '83::src/components/messages/SystemAPIErrorMessage.tsx': 'const remainingMs = Math.max(0, Math.ceil((retryDeadline - Date.now()) / 1000)) * 1000;',
  '85::src/tools/SkillTool/SkillTool.ts': 'recordSkillActivated(commandName, command, invocationTrigger)',
  '88::src/tools/BriefTool/BriefTool.ts': 'const DEFAULT_BRIEF_ENFORCE_TEXT = `In brief mode, plain assistant text is hidden from the user — only ${BRIEF_TOOL_NAME} reaches them. Call it now with your substantive reply for this turn. Do not mention this reminder; the message should read as if you wrote it unprompted, addressing only what the user actually asked. If you genuinely have nothing useful to tell the user, you may end the turn without calling it.`',
  '89::src/tools/REPLTool/prompt.ts': 'Thenable \\`o.*\\` values are auto-awaited **at return only**',
  '90::src/services/tools/toolIsolation.ts': 'if (current) onLatch?.(current)',
  '91::src/services/tools/toolIsolation.ts': 'latch.onLatch?.(classifiedAs)',
  '92::src/tools/REPLTool/vm.ts': '"REPL: unawaited Promise coerced to string. Shorthand results used " +',
  '103::src/tools/AgentTool/runAgent.ts': "callSite: 'attachments_subagent',",
  '106::src/utils/attachments.ts': 'const MAX_EDITED_TEXT_FILE_SNIPPET_BUDGET = 16_384',
  '107::src/utils/plugins/refresh.ts': 'clearInstalledPluginsCache()',
  '109::src/tools/FileReadTool/FileReadTool.ts': "'The line number to start reading from. Only provide if the file is too large to read at once',",
  '115::src/services/mcp/auth.ts': "export function getMcpOAuthEntries(): SecureStorageData['mcpOAuth'] | undefined {",
  '115::src/services/mcp/client.ts': 'const sessionIngressToken =',
  '115::src/services/mcp/config.ts': 'export function isCcrProxyUrl(url: string): boolean {',
  '117::src/services/mcp/client.ts': 'serverInfoName: client.serverInfo?.name,',
  '117::src/Tool.ts': 'serverInfoName?: string',
  '119::src/utils/messages.ts': "if (attachment.reminderType === 'once') {",
  '120::src/utils/messages.ts': 'const text = block.text?.trim()',
  '121::src/utils/messages.ts': "attachment.snippet === ''",
  '122::src/hooks/fileSuggestions.ts': 'export function createFileIndexCache() {',
  '124::src/commands/clear/conversation.ts': 'saveIsolationLatch(isolationLatch.current)',
  '136::src/components/design-system/FuzzyPicker.tsx': 'if (resetKey === undefined) return',
  '143::src/cli/bg.ts': "'\\x1B[0m' +",
  '151::src/utils/sessionStorage.ts': 'export function saveIsolationLatch(',
  '163::src/daemon/spare.ts': 'export async function runClaimedSpare(',
  '164::src/daemon/supervisor.ts': 'noteActivity(): void {',
  '167::src/upstreamproxy/upstreamproxy.ts': 'export async function initEgressGateway(opts?: {',
  '168::src/entrypoints/init.ts': 'const { initEgressGateway, getEgressGatewayEnv } = await import(',
  '169::src/hooks/useReplBridge.tsx': "{' '}· {detail || '/remote-control'}",
  '172::src/hooks/useTypeahead.tsx': 'onSubmit(input, true);',
  '180::src/components/FleetView.tsx': 'export function flattenDetail(value: string): string {',
  '183::src/components/FleetView.tsx': 'lastPrStatuses = action.prStatuses',
  '185::src/hooks/notifs/useStartupNotifications.tsx': 'const STARTUP_NOTIFICATIONS: StartupNotificationConfig[] = [',
  '186::src/hooks/notifs/useStartupNotifications.tsx': 'id: "official-marketplace",',
  '188::src/hooks/notifs/useStartupNotifications.tsx': 'id: "npm-deprecation",',
  '189::src/hooks/notifs/useStartupNotifications.tsx': 'id: "model-migration",',
  '199::src/main.tsx': 'migrateNotificationImpressions();',
  '200::src/main.tsx': "program.command('project').description('Manage Claude Code project state')",
  '201::src/main.tsx': 'const CURRENT_MIGRATION_VERSION = 13;',
  '201::src/daemon/spare.ts': 'await runClaimedSpare(frame, mainModule)',
  '203::src/daemon/supervisor.ts': 'handle.noteActivity()',
  '204::src/daemon/main.ts': "getAuthSnapshot:\n          options.origin === 'service'\n            ? () => auth.getAuthSnapshot()\n            : undefined,",
  '205::src/entrypoints/cli.tsx': 'const trustedDeviceReason = getTrustedDeviceUnenrolledReason();',
})

const ADDITIONAL_CLUSTER_SOURCE_WITNESSES = Object.freeze({
  3: [
    {
      path: 'src/utils/settings/settingsCache.ts',
      fragment: 'export function setCachedPolicyTierSettings(value: SettingsJson[]): void {',
    },
  ],
  5: [
    { path: 'src/bootstrap/state.ts', fragment: 'export function latchStickyBeta(' },
    { path: 'src/bootstrap/state.ts', fragment: 'export function rejectStickyBeta(' },
  ],
  6: [
    {
      path: 'src/bootstrap/state.ts',
      fragment: 'export function setSessionPrResolved(resolved: boolean): void {',
    },
  ],
  15: [
    { path: 'src/utils/settings/types.ts', fragment: 'doneMeansMerged: z' },
    { path: 'src/utils/settings/types.ts', fragment: 'isolatePeerMachines: z' },
  ],
  23: [
    { path: 'src/constants/betas.ts', fragment: 'export const TOKEN_EFFICIENT_TOOLS_BETA = createBetaDescriptor(' },
    { path: 'src/constants/betas.ts', fragment: 'export const BETA_DESCRIPTOR_BY_HEADER = new Map(' },
  ],
  27: [
    { path: 'src/services/api/client.ts', fragment: 'Authorization: null,' },
    {
      path: 'src/services/api/client.ts',
      fragment: 'const authToken = await tokenCache.getToken()',
    },
  ],
  29: [
    {
      path: 'src/utils/auth.ts',
      fragment: 'refreshTokenUsed = lockedTokens.refreshToken',
    },
  ],
  32: [
    {
      path: 'src/services/analytics/growthbook.ts',
      fragment: '!isEnvTruthy(process.env.DISABLE_GROWTHBOOK) &&',
    },
  ],
  35: [
    {
      path: 'src/utils/config.ts',
      fragment: "'deleteProjectConfig fallback: re-read config is missing auth that cache has; refusing to write. See GH #3117.',",
    },
    {
      path: 'src/utils/config.ts',
      fragment: 'if (wouldLoseAuthState(config)) {',
    },
  ],
  39: [
    {
      path: 'src/ink/scroll-config.ts',
      fragment: "useDecayCurve:\n      !wheelFlood && (xtermJs || platform === 'win32' || wtSession),",
    },
    {
      path: 'src/ink/scroll-config.ts',
      fragment: 'useAdaptiveDrain: !wheelFlood && xtermJs,',
    },
    {
      path: 'src/ink/scroll-config.ts',
      fragment: 'base: readScrollSpeedBase(xtermJs, wheelFlood),',
    },
    {
      path: 'src/ink/scroll-config.ts',
      fragment: '!wheelFlood &&',
    },
  ],
  44: [
    {
      path: 'src/history.ts',
      fragment: "if (scope === 'project' && entry.project !== currentProject) continue",
    },
    {
      path: 'src/history.ts',
      fragment: "if (scope === 'session' && entry.sessionId !== currentSession) continue",
    },
  ],
  48: [
    {
      path: 'src/utils/sandbox/sandbox-adapter.ts',
      fragment: 'return getAllPolicyTierSettings().some(',
    },
    {
      path: 'src/utils/sandbox/sandbox-adapter.ts',
      fragment: 'const policyTiers = getAllPolicyTierSettings()',
    },
    {
      path: 'src/utils/sandbox/sandbox-adapter.ts',
      fragment: 'const allowManagedDomainsOnly = policyTiers.some(',
    },
    {
      path: 'src/utils/sandbox/sandbox-adapter.ts',
      fragment: 'for (const policySettings of policyTiers)',
    },
  ],
  49: [
    {
      path: 'src/services/api/errors.ts',
      fragment: 'if (!/dimensions exceed max allowed size.*\\d+ pixels/.test(error.message)) {',
    },
    {
      path: 'src/services/api/errors.ts',
      fragment: '/messages\\.(\\d+)\\.content\\.(\\d+)\\.image/',
    },
  ],
  54: [
    {
      path: 'src/utils/bash/ast.ts',
      fragment: 'containsAnyPlaceholder(a[i + 1]!)',
    },
    {
      path: 'src/utils/bash/ast.ts',
      fragment: "reason: `'${name} ... ${a[i]} ...' operand is non-numeric — \\`[[\\` arithmetically evaluates identifiers/subscripts (may run $(cmd))`,",
    },
    {
      path: 'src/utils/bash/ast.ts',
      fragment: 'deferredNewlineHash ??= {',
    },
    {
      path: 'src/utils/bash/ast.ts',
      fragment: 'return deferredNewlineHash ?? { ok: true }',
    },
    {
      path: 'src/utils/bash/ast.ts',
      fragment: 'if (BACKSLASH_WHITESPACE_RE.test(cmd)) {',
    },
  ],
  57: [
    {
      path: 'src/entrypoints/sdk/coreSchemas.ts',
      fragment: 'origin: SDKMessageOriginSchema().optional(),',
    },
  ],
  64: [
    {
      path: 'src/tools/BashTool/readOnlyValidation.ts',
      fragment: 'if (containsAnyPlaceholder(format)) return false',
    },
    {
      path: 'src/tools/BashTool/readOnlyValidation.ts',
      fragment: '!numericArgument.test(argument)',
    },
  ],
  69: [
    {
      path: 'src/services/mcp/auth.ts',
      fragment: 'entry.expiresAt < Date.now()',
    },
  ],
  71: [
    {
      path: 'src/services/mcp/config.ts',
      fragment: '(hasMcpDiscoveryButNoToken(name, config, oauthEntries) ||\n        hasExpiredMcpAccessTokenWithoutRefresh(name, config, oauthEntries))',
    },
  ],
  75: [
    {
      path: 'src/utils/udsClient.ts',
      fragment: 'const attrs = buildCrossSessionAttrs(undefined, fromName)',
    },
  ],
  81: [
    {
      path: 'src/utils/prStatus.ts',
      fragment: 'if (active < concurrency) {',
    },
    {
      path: 'src/utils/prStatus.ts',
      fragment: 'await new Promise<void>(resolve => queue.push(resolve))',
    },
    {
      path: 'src/utils/prStatus.ts',
      fragment: 'const runBatch = createConcurrencyLimiter(',
    },
  ],
  82: [
    {
      path: 'src/utils/prStatus.ts',
      fragment: "const PR_BATCH_CACHE_TTL = '30s'",
    },
    {
      path: 'src/utils/prStatus.ts',
      fragment: "return join(getClaudeConfigHomeDir(), 'gh-pr-status-cache.json')",
    },
  ],
  80: [
    {
      path: 'src/utils/permissions/yoloClassifier.ts',
      fragment: 'const CLASSIFIER_MAX_RETRIES = 2',
    },
    {
      path: 'src/utils/permissions/yoloClassifier.ts',
      fragment: 'return await sideQuery({ ...options, signal })',
    },
    {
      path: 'src/utils/permissions/yoloClassifier.ts',
      fragment: 'runClassifierRequest(stage1Opts, signal)',
    },
    {
      path: 'src/utils/permissions/yoloClassifier.ts',
      fragment: 'runClassifierRequest(stage2Opts, signal)',
    },
    {
      path: 'src/utils/permissions/yoloClassifier.ts',
      fragment: 'runClassifierRequest(sideQueryOpts, signal)',
    },
  ],
  88: [
    {
      path: 'src/tools/BriefTool/BriefTool.ts',
      fragment: ': DEFAULT_BRIEF_ENFORCE_TEXT',
    },
  ],
  90: [
    {
      path: 'src/services/tools/toolIsolation.ts',
      fragment: 'return { current, onLatch }',
    },
  ],
  92: [
    {
      path: 'src/tools/REPLTool/vm.ts',
      fragment: '"Auto-await applies only to o.* keys at return time.",',
    },
  ],
  115: [
    {
      path: 'src/services/mcp/auth.ts',
      fragment: '(oauthEntries ?? getMcpOAuthEntries())?.[serverKey]',
    },
  ],
  119: [
    {
      path: 'src/utils/messages.ts',
      fragment: '"The user has asked you to work without stopping for clarifying questions. When you\'d normally pause to check, make the reasonable call and continue; they\'ll redirect if needed.",',
    },
  ],
  120: [
    {
      path: 'src/utils/messages.ts',
      fragment: "if (text !== undefined && text !== '' && text !== NO_CONTENT_MESSAGE) {",
    },
  ],
  121: [
    {
      path: 'src/utils/messages.ts',
      fragment: 'The diff was omitted because other modified files in this turn already exceeded the snippet budget; use the Read tool if you need the current content.',
    },
  ],
  122: [
    {
      path: 'src/hooks/fileSuggestions.ts',
      fragment: 'export const globalFileIndexCache = createFileIndexCache()',
    },
    {
      path: 'src/hooks/fileSuggestions.ts',
      fragment: 'export function resetFileIndexCache(cache: FileIndexCache): void {',
    },
    {
      path: 'src/hooks/fileSuggestions.ts',
      fragment: 'export async function generateFileSuggestions(\n  cache: FileIndexCache,',
    },
  ],
  127: [
    {
      path: 'src/utils/model/modelOptions.ts',
      fragment: 'for (const opt of getGatewayModelOptions()) {',
    },
  ],
  131: [
    {
      path: 'src/components/Messages.tsx',
      fragment: 'textSuppressingNameSet.has(block.name)',
    },
    {
      path: 'src/components/Messages.tsx',
      fragment: '!turnsWithReplacementText.has(messageTurns[index]!)',
    },
    {
      path: 'src/components/Messages.tsx',
      fragment: 'return !msg.isMeta || isChannelOrigin(msg.origin);',
    },
  ],
  140: [
    {
      path: 'src/commands/effort/effort.tsx',
      fragment: 'const remoteSuffix = applyRemoteEffort(persistable)',
    },
    {
      path: 'src/commands/effort/effort.tsx',
      fragment: 'const remoteSuffix = applyRemoteEffort(undefined)',
    },
  ],
  180: [
    {
      path: 'src/components/FleetView.tsx',
      fragment: 'return stripAnsi(value)',
    },
  ],
  151: [
    {
      path: 'src/utils/sessionStorage.ts',
      fragment: 'export function getCurrentSessionIsolationLatch():',
    },
  ],
  163: [
    { path: 'src/daemon/spare.ts', fragment: 'export function receiveClaim(' },
  ],
  164: [
    { path: 'src/daemon/supervisor.ts', fragment: 'if (adopted) this.lastInputAt = Date.now()' },
    { path: 'src/daemon/supervisor.ts', fragment: 'if (!cwdExists) {' },
  ],
  178: [
    { path: 'src/components/PromptInput/PromptInput.tsx', fragment: "key: 'remote-history-search-unavailable'," },
    { path: 'src/components/PromptInput/PromptInput.tsx', fragment: 'function SwarmBannerBorder({' },
    { path: 'src/components/PromptInput/PromptInput.tsx', fragment: 'function GradientDashes({' },
  ],
  185: [
    { path: 'src/hooks/notifs/useStartupNotifications.tsx', fragment: 'id: "chrome-extension",' },
    { path: 'src/hooks/notifs/useStartupNotifications.tsx', fragment: 'id: "model-migration",' },
    { path: 'src/hooks/notifs/useStartupNotifications.tsx', fragment: 'id: "subscription-switch",' },
    { path: 'src/hooks/notifs/useStartupNotifications.tsx', fragment: 'export function useStartupNotifications(' },
    { path: 'src/hooks/notifs/useStartupNotifications.tsx', fragment: 'void Promise.allSettled(' },
  ],
  186: [
    { path: 'src/hooks/notifs/useStartupNotifications.tsx', fragment: 'id: "chrome-extension",' },
  ],
  189: [
    { path: 'src/hooks/notifs/useStartupNotifications.tsx', fragment: 'id: "subscription-switch",' },
  ],
  192: [
    { path: 'src/screens/REPL.tsx', fragment: 'useStartupNotifications();' },
    {
      path: 'src/screens/REPL.tsx',
      fragment: 'isolationLatchRef.current = createToolIsolationLatch(getCurrentSessionIsolationLatch() ?? getIsolationClassFromMessages(initialMessages, tools), saveIsolationLatch);',
    },
  ],
  199: [
    { path: 'src/main.tsx', fragment: 'void refreshGatewayModels();' },
  ],
})

// Only clusters that combine independently active source statements carry
// more than one raw statement witness.  Indices are frozen to the authenticated
// semantic cluster ledger, never discovered by a shortest-statement fallback.
const ADDITIONAL_CLUSTER_STATEMENT_INDICES = Object.freeze({
  39: [7_533, 7_534, 7_536],
  48: [8_410],
  54: [8_703],
  66: [11_319],
  69: [11_951, 11_953],
  72: [12_024],
  73: [12_045, 12_046],
  75: [12_380, 12_383],
  78: [12_594, 12_597],
  80: [12_633, 12_635],
  82: [13_033],
  88: [13_733, 13_735],
  119: [15_607],
  140: [18_381],
  99: [14_143],
  102: [14_275, 14_276],
  151: [19_207],
  162: [19_636],
  163: [19_684, 19_685, 19_686],
  167: [19_755],
  178: [20_704, 20_705],
  182: [21_053],
  185: [21_192, 21_193, 21_196, 21_198],
  186: [21_151, 21_161],
  189: [21_336, 21_338],
  199: [22_239],
  198: [22_153],
  201: [22_254, 22_257],
})

const CLUSTER_SOURCE_ABSENCES = Object.freeze({
  7: [
    { path: 'src/bootstrap/state.ts', fragment: 'export function getAfkModeHeaderLatched(): boolean | null {' },
    { path: 'src/bootstrap/state.ts', fragment: 'export function setAfkModeHeaderLatched(v: boolean): void {' },
    { path: 'src/bootstrap/state.ts', fragment: 'export function getFastModeHeaderLatched(): boolean | null {' },
    { path: 'src/bootstrap/state.ts', fragment: 'export function setFastModeHeaderLatched(v: boolean): void {' },
    { path: 'src/bootstrap/state.ts', fragment: 'export function getCacheEditingHeaderLatched(): boolean | null {' },
    { path: 'src/bootstrap/state.ts', fragment: 'export function setCacheEditingHeaderLatched(v: boolean): void {' },
    { path: 'src/bootstrap/state.ts', fragment: 'export function getCacheDiagnosisHeaderLatched(): boolean | null {' },
    { path: 'src/bootstrap/state.ts', fragment: 'export function setCacheDiagnosisHeaderLatched(v: boolean): void {' },
  ],
  65: [
    { path: 'src/services/tools/toolOrchestration.ts', fragment: 'toolUseContext.setInProgressToolUseIDs(prev =>\n      new Set(prev).add(toolUse.id),' },
  ],
  80: [
    {
      path: 'src/utils/permissions/yoloClassifier.ts',
      fragment: 'maxRetries: getDefaultMaxRetries(),',
    },
  ],
  108: [
    { path: 'src/utils/powershell/parser.ts', fragment: 'if ($tok.Kind -eq $tk::MinusMinus) { $hasStopParsing = $true; break }' },
  ],
  109: [
    { path: 'src/tools/FileReadTool/FileReadTool.ts', fragment: "getFeatureValue_CACHED_MAY_BE_STALE('tengu_slate_reef', false)" },
  ],
  115: [
    {
      path: 'src/services/mcp/auth.ts',
      fragment: 'const entry = getSecureStorage().read()?.mcpOAuth?.[serverKey]',
    },
  ],
  140: [
    {
      path: 'src/commands/effort/effort.tsx',
      fragment: "updateSettingsForSource('userSettings', {",
    },
    {
      path: 'src/commands/effort/effort.tsx',
      fragment: 'Failed to set effort level:',
    },
  ],
  144: [
    { path: 'src/cli/handlers/templateJobs.ts', fragment: "detail: text.replace(/[\\r\\n]+/g, ' ').slice(0, 80)," },
  ],
  174: [
    { path: 'src/components/PromptInput/PromptInputFooter.tsx', fragment: "isBgSession() && 'background'," },
  ],
})

const SUPPORT_BINDING_SPECS = Object.freeze([
  {
    id: 'app-state-pride-gradient-shape',
    path: 'src/state/AppStateStore.ts',
    fragment: 'prideGradient?: Array<keyof Theme>',
    semanticTerms: ['prideGradient'],
    relatedDirectClusterIds: [177,178],
    reason: 'Carries the typed state field consumed by the recovered pride-gradient banner behavior.',
  },
  {
    id: 'bridge-file-index-cache-callsite',
    path: 'src/bridge/initReplBridge.ts',
    fragment: 'await generateFileSuggestions(globalFileIndexCache, query, true)',
    semanticTerms: ['globalFileIndexCache'],
    relatedDirectClusterIds: [122],
    reason: 'Propagates the recovered explicit file-index cache through the bridge completion callsite.',
  },
  {
    id: 'clear-file-index-cache-callsite',
    path: 'src/commands/clear/caches.ts',
    fragment: 'resetFileIndexCache(globalFileIndexCache)',
    semanticTerms: ['resetFileIndexCache'],
    relatedDirectClusterIds: [122],
    reason: 'Resets the recovered explicit file-index cache during session clear.',
  },
  {
    id: 'cli-project-warning-helper',
    path: 'src/cli/exit.ts',
    fragment: 'export function cliWarn(msg: string): void {',
    semanticTerms: ['cliWarn'],
    relatedDirectClusterIds: [198,200],
    reason: 'Implements non-fatal warning output required by the recovered project purge command.',
  },
  {
    id: 'egress-subprocess-environment-surface',
    path: 'src/utils/subprocessEnv.ts',
    fragment: 'export function registerEgressGatewayEnvFn(',
    semanticTerms: ['registerEgressGatewayEnvFn'],
    relatedDirectClusterIds: [167,168],
    reason: 'Carries the renamed egress-gateway environment registration surface used by initialization.',
  },
  {
    id: 'project-purge-directory-enumeration',
    path: 'src/utils/sessionStoragePortable.ts',
    fragment: 'export async function findProjectDirs(projectPath: string): Promise<string[]> {',
    semanticTerms: ['findProjectDirs'],
    relatedDirectClusterIds: [198],
    reason: 'Enumerates every hashed project directory consumed by project purge.',
  },
  {
    id: 'quick-open-file-index-cache-callsite',
    path: 'src/components/QuickOpenDialog.tsx',
    fragment: 'generateFileSuggestions(globalFileIndexCache, q, true).then(items => {',
    semanticTerms: ['globalFileIndexCache'],
    relatedDirectClusterIds: [122],
    reason: 'Propagates the explicit file-index cache through Quick Open.',
  },
  {
    id: 'repl-isolation-latch-type',
    path: 'src/tools/REPLTool/types.ts',
    fragment: "onLatch?: (value: 'web' | 'connectors') => void",
    semanticTerms: ['onLatch'],
    relatedDirectClusterIds: [90,91,192],
    reason: 'Types the recovered latch callback shared by isolation creation and the REPL lifecycle.',
  },
  {
    id: 'transcript-isolation-entry-types',
    path: 'src/types/logs.ts',
    fragment: 'export type IsolationLatchEntry = {',
    semanticTerms: ['IsolationLatchEntry'],
    relatedDirectClusterIds: [148,149,150,151,152,153,154,155,156,192],
    reason: 'Defines transcript and log shapes required by persisted isolation-latch recovery.',
  },
  {
    id: 'unified-suggestions-file-index-cache',
    path: 'src/hooks/unifiedSuggestions.ts',
    fragment: 'fileIndexCache: FileIndexCache,',
    semanticTerms: ['FileIndexCache'],
    relatedDirectClusterIds: [122,172],
    reason: 'Threads the recovered explicit file-index cache through unified suggestions.',
  },
])

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function evidence(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function occurrences(contents, fragment) {
  let count = 0
  let offset = 0
  while ((offset = contents.indexOf(fragment, offset)) !== -1) {
    count += 1
    offset += fragment.length
  }
  return count
}

function candidateScore(fragment, source, semanticTerms) {
  let score = Math.min(fragment.length, 240)
  score += semanticTerms.filter(term =>
    semanticTermMatches(fragment, term)).length * 10_000
  if (occurrences(source, fragment) === 1) score += 2_000
  if (/\b(?:export|function|class|const|return|await|log|throw)\b/.test(fragment)) {
    score += 300
  }
  if (/^(?:import|type)\b/.test(fragment)) score -= 250
  if (/^[{}()[\],;]+$/.test(fragment)) score -= 2_000
  if (/^(?:\/\/|\*)/.test(fragment)) score -= 100
  return score
}

function clusterSemanticTerms(cluster) {
  const terms = []
  for (const row of cluster.inventory.literalDelta) {
    if (row.target <= 0) continue
    if (row.key.startsWith('string:')) {
      try { terms.push(JSON.parse(row.key.slice('string:'.length))) } catch {}
    } else if (row.key.startsWith('template:')) {
      terms.push(row.key.slice('template:'.length))
    }
  }
  for (const row of cluster.inventory.semanticPropertyDelta) {
    if (row.target <= 0) continue
    terms.push(row.key.slice(row.key.lastIndexOf(':') + 1))
  }
  return [...new Set(terms.filter(term =>
    typeof term === 'string' && term.length >= 5 && term.length <= 160))]
}

function semanticTermMatches(fragment, term) {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(term)) {
    return fragment.includes(term)
  }
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(
    `(^|[^A-Za-z0-9_$])${escaped}([^A-Za-z0-9_$]|$)`,
  ).test(fragment)
}

function selectSourceFragment(sourceRoot, sourcePath, clusterId, cluster) {
  const filename = path.join(sourceRoot, sourcePath)
  const source = fs.readFileSync(filename, 'utf8')
  const diff = execFileSync(
    'git',
    [
      'diff',
      '--unified=0',
      '--no-ext-diff',
      '--no-renames',
      `${BASE_REVISION}..HEAD`,
      '--',
      sourcePath,
    ],
    { cwd: sourceRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  )
  const candidates = [
    ...new Set(
      diff
        .split('\n')
        .filter(line => line.startsWith('+') && !line.startsWith('+++'))
        .map(line => line.slice(1).trim())
        .filter(fragment => fragment.length >= 8 && fragment.length <= 500)
        .filter(fragment => source.includes(fragment)),
    ),
  ]
  if (candidates.length === 0) {
    candidates.push(
      ...source
        .split('\n')
        .map(line => line.trim())
        .filter(fragment => fragment.length >= 8 && fragment.length <= 500),
    )
  }
  const semanticTerms = clusterSemanticTerms(cluster)
  candidates.sort(
    (left, right) =>
      candidateScore(right, source, semanticTerms) -
        candidateScore(left, source, semanticTerms) ||
      left.localeCompare(right),
  )
  assert(candidates.length > 0, `${sourcePath}: no source witness candidate`)
  const reviewedFragment =
    PRECISE_REVIEWED_SOURCE_FRAGMENTS[`${clusterId}::${sourcePath}`]
  if (reviewedFragment !== undefined) {
    assert(source.includes(reviewedFragment),
      `C${clusterId} ${sourcePath}: reviewed source fragment changed`)
  }
  const fragment = reviewedFragment ?? candidates[0]
  const matchedSemanticTerms = semanticTerms.filter(term =>
    semanticTermMatches(fragment, term))
  assert(
    matchedSemanticTerms.length > 0 || reviewedFragment !== undefined,
    `C${clusterId} ${sourcePath}: source witness has no semantic term and is not reviewed`,
  )
  return {
    path: sourcePath,
    fragment,
    count: occurrences(source, fragment),
    matchedSemanticTerms,
    reviewed: true,
  }
}

function explicitSourceWitness(sourceRoot, clusterId, cluster, spec) {
  const source = fs.readFileSync(path.join(sourceRoot, spec.path), 'utf8')
  assert(source.includes(spec.fragment),
    `C${clusterId} ${spec.path}: explicit reviewed source fragment changed`)
  return {
    path: spec.path,
    fragment: spec.fragment,
    count: occurrences(source, spec.fragment),
    matchedSemanticTerms: clusterSemanticTerms(cluster).filter(term =>
      semanticTermMatches(spec.fragment, term)),
    reviewed: true,
  }
}

function authenticate(filename, expected, label) {
  const bytes = fs.readFileSync(filename)
  assert(JSON.stringify(evidence(bytes)) === JSON.stringify(expected), `${label} identity`)
  return { bytes, source: bytes.toString('utf8') }
}

export function normalizeRelease21124Metadata({ baseline, target }) {
  const replacementsByTarget = new Map(
    METADATA_REPLACEMENTS.map(([field, baselineValue, targetValue, rawCount]) =>
      [targetValue, { field, baselineValue, targetValue, rawCount }]),
  )
  const ast = parse(target, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const counts = new Map()
  const edits = []
  const stack = [ast]
  while (stack.length > 0) {
    const node = stack.pop()
    if (!node || typeof node !== 'object') continue
    if (node.type === 'Literal' && replacementsByTarget.has(node.value)) {
      const replacement = replacementsByTarget.get(node.value)
      assert(node.raw === JSON.stringify(replacement.targetValue), `${replacement.field} encoding`)
      edits.push({ start: node.start, end: node.end, text: JSON.stringify(replacement.baselineValue) })
      counts.set(replacement.field, (counts.get(replacement.field) ?? 0) + 1)
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) if (child?.type) stack.push(child)
      } else if (value?.type) stack.push(value)
    }
  }
  edits.sort((left, right) => right.start - left.start)
  let normalized = target
  for (const edit of edits) {
    normalized = normalized.slice(0, edit.start) + edit.text + normalized.slice(edit.end)
  }
  // The executable wrapper banner contributes one non-AST version marker.
  // Normalize it too so the finite metadata surface is all 163 raw markers.
  assert(occurrences(normalized, '2.1.124') === 1, 'version banner count')
  normalized = normalized.replace('2.1.124', '2.1.123')
  const replacements = METADATA_REPLACEMENTS.map(
    ([field, baselineValue, targetValue, rawCount]) => {
      assert(counts.get(field) === 162, `${field} AST count`)
      assert(occurrences(baseline, baselineValue) === rawCount, `${field} baseline raw count`)
      assert(occurrences(target, targetValue) === rawCount, `${field} target raw count`)
      return {
        field,
        count: 162,
        rawCount,
        baseline: { value: baselineValue, sha256: sha256(baselineValue) },
        target: { value: targetValue, sha256: sha256(targetValue) },
      }
    },
  )
  assert(
    JSON.stringify(evidence(normalized)) ===
      JSON.stringify(RELEASE_2_1_124.normalizedTarget),
    `normalized target identity: ${JSON.stringify(evidence(normalized))}`,
  )
  return { normalized, replacements }
}

function witness(value, count) {
  return [{ kind: 'literal', value, count }]
}

function direct(rowId, clusterIds, value, count, sourcePaths, testIds, title) {
  return {
    clusterIds: [...clusterIds].sort((a, b) => a - b),
    rowId,
    title,
    sourcePaths: [...new Set(sourcePaths)].sort(),
    targetWitnesses: witness(value, count),
    testIds: [...new Set(testIds)].sort(),
  }
}

export function release21124ClusterInventory({
  baseline,
  target,
  clusterLedger,
  sourceRoot,
}) {
  assert(typeof baseline === 'string' && typeof target === 'string',
    'cluster inventory requires authenticated adjacent bundles')
  assert(clusterLedger?.coverage?.clusterCount === RELEASE_2_1_124.totalClusters,
    'cluster inventory requires the authenticated 205-cluster ledger')
  assert(sourceRoot, 'cluster inventory requires a recovered source root')
  const semantic = 'semantic-delta'
  const directRows = [
    direct('legacy-list-peers-alias', [12], 'ListPeers', 1, ['src/tools/ListPeersTool/constants.ts','src/utils/permissions/permissionRuleParser.ts'], ['legacy-list-peers-alias',semantic], 'Legacy ListPeers alias maps to ListAgents'),
    direct('settings-runtime', [3,5,7,8,15,17,18,23,24,27,28,29,30,32,35,48,63,77], 'token-efficient-tools-2026-03-28', 1, [], ['gateway-doctor-plugins','runtime-tail',semantic], 'Settings, beta, model, sandbox, and runtime configuration'),
    direct('brief-skill-telemetry', [13,14,55,84,85,88,102], 'invocation_trigger', 6, [], ['skill-activation-telemetry','ui-command-semantics',semantic], 'Brief and skill activation telemetry'),
    direct('oauth-mcp-auth', [19,20,21,22,25,50,51,52,57,62,68,69,70,71,72,73,115,117], '/v2/session_ingress/mcp/ws/', 1, [], ['gateway-doctor-plugins','mcp-oauth-dedup','runtime-tail',semantic], 'OAuth, workload identity, MCP, and authentication'),
    direct('terminal-bash-scroll', [37,38,39,53,54,64,87,191], ' \\xB7 wheelFlood', 1, ['src/components/ScrollKeybindingHandler.tsx','src/ink/scroll-config.ts','src/ink/termio/osc.ts','src/tools/BashTool/readOnlyValidation.ts','src/utils/bash/ast.ts','src/utils/powershell/parser.ts','src/utils/shell/powershellDetection.ts'], ['runtime-tail','ui-command-semantics','ui-sdk-tail',semantic], 'Terminal OSC, Bash validation, PowerShell, and wheel flood'),
    direct('history-suggestions', [40,41,44,45,122,136,170,171,172,173,178], 'historySearch:cycleScope', 4, [], ['history-picker-scopes','ui-command-semantics',semantic], 'History scopes, suggestions, and fuzzy picker semantics'),
    direct('image-read-retry', [42,43,49,104,105,106,108,109,162], 'dimensions exceed max allowed size', 1, ['src/services/api/claude.ts','src/tools/FileReadTool/FileReadTool.ts','src/tools/FileReadTool/imageProcessor.ts','src/utils/attachments.ts','src/utils/imageResizer.ts'], ['runtime-tail',semantic], 'Image sizing, file reads, and API retry behavior'),
    direct('gateway-doctor-plugins', [107,126,127,128,129,130,137,139], '[gatewayDiscovery] 0 usable models after filter', 1, [], ['gateway-doctor-plugins','ui-command-semantics',semantic], 'Gateway discovery, doctor, init, and plugin refresh'),
    direct('tool-execution-classifier', [58,65,66,75,76,78,79,80,83,93,94,95,96,99,100,101,103,118], 'setInProgressToolUseIDs({action:"add"', 1, [], ['runtime-tail',semantic], 'Tool execution, deferred tools, classifier, and task lifecycle'),
    direct('pr-fleet-status', [6,46,59,81,82,180,181,182,183], "Couldn't rename \\u2014 the job may have been removed or its state file is unwritable.", 1, [], ['runtime-tail','ui-command-semantics',semantic], 'Fleet and pull-request status lifecycle'),
    direct('compact-messages', [110,111,119,120,121,125,131,132], 'CLAUDE_CODE_COLD_COMPACT', 2, [], ['runtime-tail','ui-command-semantics',semantic], 'Cold compaction and message rendering'),
    direct('sdk-print-share', [187,196,197], 'ccshare_url', 2, [], ['ui-command-semantics','ui-sdk-tail',semantic], 'SDK schemas, print output, and share URL'),
    direct('repl-isolation', [89,90,91,92,124,148,149,150,151,152,153,154,155,156,192], 'isolation-latch', 4, [], ['repl-isolation','runtime-tail',semantic], 'REPL tool isolation and persisted isolation latch'),
    direct('commands-ui', [133,134,135,140,142,143,144,146,160,161,169,174,175,177,184,193,194], 'Fix with Claude', 2, [], ['runtime-tail','ui-command-semantics','ui-sdk-tail',semantic], 'Command and interactive UI semantics'),
    direct('egress-daemon-runtime', [163,164,166,167,168,199,201,203,204,205], 'egressGatewayEnv', 1, ['src/cli/bg.ts','src/daemon/jobs.ts','src/daemon/main.ts','src/daemon/spare.ts','src/daemon/supervisor.ts','src/entrypoints/cli.tsx','src/entrypoints/init.ts','src/main.tsx','src/upstreamproxy/relay.ts','src/upstreamproxy/upstreamproxy.ts'], ['gateway-doctor-plugins','runtime-tail',semantic], 'Daemon, egress gateway, and entrypoint lifecycle'),
    direct('startup-notifications', [67,185,186,188,189,195], 'seenNotifications', 9, ['src/bootstrap/state.ts','src/hooks/notifs/useStartupNotifications.tsx','src/migrations/migrateNotificationImpressions.ts','src/utils/config.ts','src/utils/settings/settings.ts','src/utils/settings/types.ts'], ['ui-command-semantics','ui-sdk-tail',semantic], 'Startup notification registry and persistence'),
    direct('project-purge', [198,200], 'purge [path]', 1, ['src/cli/handlers/project.tsx','src/main.tsx'], ['project-purge',semantic], 'Project purge command'),
  ]
  const accountingOnly = [
    {
      clusterIds: [1,2,9,10,11,26],
      reason: 'dependency',
      evidence: {
        classification: 'third-party dependency and vendor payload changes',
        clusterRationales: {
          1: 'Bundled dependency statement set with no application source owner.',
          2: 'Bundled dependency statement set with no application source owner.',
          9: 'Third-party payload delta adjacent to unchanged application initialization.',
          10: 'Third-party payload delta adjacent to unchanged application initialization.',
          11: 'Third-party payload delta adjacent to unchanged application initialization.',
          26: 'Dependency-only transport/parser statement delta with no source-tree obligation.',
        },
      },
    },
    {
      clusterIds: [74,86,157,158,165,190],
      reason: 'identifier-only',
      evidence: {
        classification: 'identifier permutations or inert constants with unchanged executable semantics',
        clusterRationales: {
          74: 'Private/minified identifier permutation; task-output behavior is byte-semantically unchanged.',
          86: 'Private-field identifier permutation in unchanged TaskOutput behavior.',
          157: 'Identifier-only session-storage surface with no literal, property, or operator delta.',
          158: 'Identifier-only session-storage surface with no literal, property, or operator delta.',
          165: 'Renamed initializer-local binding with unchanged daemon behavior.',
          190: 'Identifier-only notification initializer surface with unchanged behavior.',
        },
      },
    },
    {
      clusterIds: [4,16,31,33,34,36,47,56,60,61,97,98,112,116,138,141,145,147,176,179,202],
      reason: 'initializer-linkage',
      evidence: {
        classification: 'reviewed module initializer, export-table, or tree-shake-only linkage paired with active direct implementations',
        pairedDirectClusterIds: [3,17,18,32,35,62,110,151,167,168,180],
        clusterRationales: {
          4: 'Settings-cache module initializer linkage; active cache body is C3.',
          16: 'Settings export table only; exported declarations and bodies are C17/C18.',
          31: 'GrowthBook export table only; exported body is C32.',
          33: 'GrowthBook module initializer linkage with no independent executable delta.',
          34: 'Config export table only; deleteProjectConfig declaration/body is C35.',
          36: 'Hard-false tree-shake retention helper; recovered source and runtime branch are unchanged.',
          47: 'Egress-gateway renamed export table; declarations and callsites are C167/C168.',
          56: 'Plugin telemetry module initializer linkage paired with the active C55 body.',
          60: 'Hard-false bridge helper and guards retained only for tree-shake linkage.',
          61: 'Trusted-device export table only; exported declaration/body is C62.',
          97: 'Empty retained helper emitted by tree shaking; no source-level execution.',
          98: 'Initializer call to the empty retained helper in C97.',
          112: 'Cold-compact module linkage; active helper and callers are C110/C111/C125.',
          116: 'MCP module initializer/export linkage; active client behavior is C117.',
          138: 'Plugin/hooks initializer linkage paired with active refresh and hook bodies.',
          141: 'Command UI module initializer linkage paired with active effort/bridge behavior.',
          145: 'Template-job module initializer linkage paired with C144/C146 bodies.',
          147: 'Session-storage export linkage plus provably null pride branch; save/get bodies are C151.',
          176: 'Prompt UI initializer linkage paired with C177/C178 active rendering.',
          179: 'FleetView export table only; flattenDetail declaration/body is C180.',
          202: 'Entrypoint/daemon initializer linkage paired with the active C203–C205 tail.',
        },
      },
    },
    {
      clusterIds: [113,114,123,159],
      reason: 'exact-relocation',
      evidence: {
        classification: 'exact dependency or application statement relocation represented by adjacent clusters',
        clusterRationales: {
          113: 'Exact compact/MCP statement relocation with unchanged normalized statement identity.',
          114: 'Exact compact/MCP statement relocation with unchanged normalized statement identity.',
          123: 'The getDirectoryNames helper is byte-identical across adjacent sources and relocated beside the active C122 file-index cache surface.',
          159: 'Removed combineAbortSignals statement exactly relocated to the retained helper used by C78.',
        },
      },
    },
  ]
  const changedPaths = execFileSync(
    'git',
    ['diff', '--name-only', '--no-renames', `${BASE_REVISION}..HEAD`, '--', 'src'],
    { cwd: sourceRoot, encoding: 'utf8' },
  ).trim().split('\n').filter(Boolean).sort()
  assert(
    JSON.stringify(changedPaths) ===
      JSON.stringify([...ALL_CHANGED_SOURCE_PATHS].sort()),
    'recovered source topology differs from the frozen 131-path inventory',
  )
  const changedPathSet = new Set(changedPaths)
  const sourceWitnessCache = new Map()
  const baseSourceCache = new Map()
  const baseSourceForPath = sourcePath => {
    if (!baseSourceCache.has(sourcePath)) {
      try {
        baseSourceCache.set(sourcePath, execFileSync(
          'git', ['show', `${BASE_REVISION}:${sourcePath}`],
          {
            cwd: sourceRoot,
            encoding: 'utf8',
            maxBuffer: 32 * 1024 * 1024,
            stdio: ['ignore', 'pipe', 'ignore'],
          },
        ))
      } catch {
        baseSourceCache.set(sourcePath, null)
      }
    }
    return baseSourceCache.get(sourcePath)
  }
  const sourceWitness = (clusterId, sourcePath, cluster) => {
    assert(changedPathSet.has(sourcePath),
      `${sourcePath}: cluster source is not in changed Git topology`)
    const key = `${clusterId}\0${sourcePath}`
    if (!sourceWitnessCache.has(key)) {
      sourceWitnessCache.set(
        key,
        selectSourceFragment(sourceRoot, sourcePath, clusterId, cluster),
      )
    }
    return sourceWitnessCache.get(key)
  }
  const clusterById = new Map(
    clusterLedger.clusters.map(cluster => [cluster.id, cluster]),
  )
  const clusterBinding = (clusterId, testIds) => {
    const cluster = clusterById.get(clusterId)
    assert(cluster, `cluster C${clusterId} absent from semantic ledger`)
    const side = BASELINE_STATEMENT_CLUSTERS.has(clusterId)
      ? 'baseline'
      : 'target'
    const sideSource = side === 'target' ? target : baseline
    const otherSource = side === 'target' ? baseline : target
    const statements = cluster[`${side}Statements`]
    const candidates = statements.map(statement => {
      const text = sideSource.slice(statement.raw.start, statement.raw.end)
      const count = occurrences(sideSource, text)
      const otherSideCount = occurrences(otherSource, text)
      const rawEvidence = evidence(text)
      assert(rawEvidence.bytes === statement.raw.bytes,
        `C${clusterId} statement width changed across metadata normalization`)
      return { statement, text, count, otherSideCount, rawEvidence }
    }).filter(candidate => candidate.count !== candidate.otherSideCount)
    candidates.sort((left, right) =>
      Number(right.statement.index === PREFERRED_CLUSTER_STATEMENT_INDEX[clusterId]) -
        Number(left.statement.index === PREFERRED_CLUSTER_STATEMENT_INDEX[clusterId]) ||
      left.statement.raw.bytes - right.statement.raw.bytes ||
      left.statement.index - right.statement.index)
    assert(candidates.length > 0,
      `C${clusterId} has no adjacent-count-changing statement witness`)
    const selected = candidates[0]
    const sourcePaths = [
      ...new Set(PRECISE_CLUSTER_SOURCE_SPECS[clusterId] ?? []),
    ].sort()
    assert(sourcePaths.length > 0,
      `C${clusterId} has no exact recovered source owner or callsite`)
    const toRawWitness = candidate => ({
        kind: 'raw-statement',
        side,
        statementIndex: candidate.statement.index,
        start: candidate.statement.raw.start,
        end: candidate.statement.raw.end,
        bytes: candidate.rawEvidence.bytes,
        sha256: candidate.rawEvidence.sha256,
        normalizedSha256: candidate.statement.raw.sha256,
        count: candidate.count,
        otherSideCount: candidate.otherSideCount,
      })
    const additionalIndices = [
      ...(ADDITIONAL_CLUSTER_STATEMENT_INDICES[clusterId] ?? []),
    ].sort((left, right) => left - right)
    assert(!additionalIndices.includes(selected.statement.index),
      `C${clusterId}: primary statement duplicated as additional witness`)
    const additionalTargetWitnesses = additionalIndices.map(index => {
      const candidate = candidates.find(row => row.statement.index === index)
      assert(candidate, `C${clusterId}: additional statement ${index} is not count-changing on ${side}`)
      return toRawWitness(candidate)
    })
    const sourceWitnesses = sourcePaths.map(sourcePath =>
      sourceWitness(clusterId, sourcePath, cluster))
    for (const spec of ADDITIONAL_CLUSTER_SOURCE_WITNESSES[clusterId] ?? []) {
      assert(changedPathSet.has(spec.path),
        `${spec.path}: additional cluster source is not in changed Git topology`)
      sourceWitnesses.push(explicitSourceWitness(sourceRoot, clusterId, cluster, spec))
    }
    const allClusterRaw = [
      ...cluster.baselineStatements.map(statement =>
        baseline.slice(statement.raw.start, statement.raw.end)),
      ...cluster.targetStatements.map(statement =>
        target.slice(statement.raw.start, statement.raw.end)),
    ].join('\n')
    const selectedRaw = [
      selected.text,
      ...additionalIndices.map(index =>
        candidates.find(candidate => candidate.statement.index === index).text),
    ].join('\n')
    const matchedSemanticTerms = new Set(
      sourceWitnesses.flatMap(witness => witness.matchedSemanticTerms),
    )
    for (const term of matchedSemanticTerms) {
      if (allClusterRaw.includes(term)) {
        assert(selectedRaw.includes(term),
          `C${clusterId}: selected raw statements omit source semantic term ${JSON.stringify(term)}`)
      }
    }
    const sourceAbsences = (CLUSTER_SOURCE_ABSENCES[clusterId] ?? []).map(spec => {
      assert(changedPathSet.has(spec.path),
        `C${clusterId} ${spec.path}: source-absence path is not changed`)
      const currentSource = fs.readFileSync(path.join(sourceRoot, spec.path), 'utf8')
      const baseSource = baseSourceForPath(spec.path)
      assert(!currentSource.includes(spec.fragment),
        `C${clusterId} ${spec.path}: removed source fragment is still present`)
      assert(baseSource !== null && baseSource.includes(spec.fragment),
        `C${clusterId} ${spec.path}: removed source fragment is absent from base`)
      return { path: spec.path, fragment: spec.fragment }
    })
    const hasChangedPositiveSource = sourceWitnesses.some(source => {
      const baseSource = baseSourceForPath(source.path)
      return baseSource === null ||
        occurrences(baseSource, source.fragment) !== source.count
    })
    assert(hasChangedPositiveSource || sourceAbsences.length > 0,
      `C${clusterId}: direct binding has no changed positive source witness or reviewed source removal`)
    return {
      clusterId,
      targetWitness: toRawWitness(selected),
      ...(additionalTargetWitnesses.length > 0
        ? { additionalTargetWitnesses }
        : {}),
      sourceWitnesses,
      ...(sourceAbsences.length > 0 ? { sourceAbsences } : {}),
      testIds: [...testIds],
    }
  }
  const boundDirectRows = directRows.map(row => {
    const clusterBindings = row.clusterIds.map(clusterId =>
      clusterBinding(clusterId, row.testIds))
    const sourcePaths = [
      ...new Set(
        clusterBindings.flatMap(binding =>
          binding.sourceWitnesses.map(source => source.path)),
      ),
    ].sort()
    const testIds = [
      ...new Set(clusterBindings.flatMap(binding => binding.testIds)),
    ].sort()
    const sourcePathAbsences = clusterBindings
      .flatMap(binding => binding.sourceAbsences ?? [])
      .map(absence => ({ paths: [absence.path], fragment: absence.fragment }))
      .sort((left, right) =>
        left.paths[0].localeCompare(right.paths[0]) ||
        left.fragment.localeCompare(right.fragment))
    return {
      ...row,
      sourcePaths,
      testIds,
      clusterBindings,
      ...(sourcePathAbsences.length > 0 ? { sourcePathAbsences } : {}),
    }
  })
  const directSourcePaths = [
    ...new Set(boundDirectRows.flatMap(row => row.sourcePaths)),
  ].sort()
  const directSourcePathSet = new Set(directSourcePaths)
  const directBindingById = new Map(
    boundDirectRows.flatMap(row => row.clusterBindings).map(binding => [
      binding.clusterId,
      binding,
    ]),
  )
  const supportBindings = [...SUPPORT_BINDING_SPECS]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(spec => {
      assert(changedPathSet.has(spec.path),
        `${spec.id}: support source is not in changed Git topology`)
      assert(!directSourcePathSet.has(spec.path),
        `${spec.id}: support path is also claimed as a direct owner`)
      const source = fs.readFileSync(path.join(sourceRoot, spec.path), 'utf8')
      assert(source.includes(spec.fragment),
        `${spec.id}: reviewed support fragment changed`)
      const relatedBindings = spec.relatedDirectClusterIds.map(clusterId => {
        const binding = directBindingById.get(clusterId)
        assert(binding, `${spec.id}: related C${clusterId} is not direct`)
        return binding
      })
      return {
        id: spec.id,
        classification: 'owning-direct-prerequisite',
        reason: spec.reason,
        sourceWitness: {
          path: spec.path,
          fragment: spec.fragment,
          count: occurrences(source, spec.fragment),
          matchedSemanticTerms: [...spec.semanticTerms].sort(),
          reviewed: true,
        },
        relatedDirectClusterIds: [...spec.relatedDirectClusterIds]
          .sort((left, right) => left - right),
        testIds: [
          ...new Set(relatedBindings.flatMap(binding => binding.testIds)),
        ].sort(),
      }
    })
  const supportSourcePaths = supportBindings
    .map(binding => binding.sourceWitness.path)
    .sort()
  assert(new Set(supportSourcePaths).size === supportSourcePaths.length,
    'support bindings must have one unique source path each')
  const boundSourcePaths = [
    ...new Set([...directSourcePaths, ...supportSourcePaths]),
  ].sort()
  assert(
    JSON.stringify(boundSourcePaths) === JSON.stringify(changedPaths),
    'precise direct-owner and support union must equal all changed paths',
  )
  const ids = [...boundDirectRows, ...accountingOnly].flatMap(row => row.clusterIds).sort((a, b) => a - b)
  assert(new Set(ids).size === ids.length, 'cluster partition duplicates')
  assert(ids.length === RELEASE_2_1_124.totalClusters && ids.every((id, index) => id === index + 1), 'cluster partition must be exactly 1..205')
  return {
    schemaVersion: 1,
    totalClusters: RELEASE_2_1_124.totalClusters,
    direct: boundDirectRows,
    accountingOnly,
    supportBindings,
  }
}

function ledgerSummary(report) {
  return {
    baseline: report.baseline,
    target: report.target,
    globalBindingPairCount: report.globalBindingEvidence.pairCount,
    pairCount: report.pairCount,
    coverage: report.coverage,
    unmatchedBaselineCount: report.unmatchedBaseline.length,
    unresolvedTargetCount: report.unresolvedTarget.length,
    changedTargetIndices: report.regions.filter(row => row.classification === 'changed').map(row => row.target.index),
    unresolvedTargetIndices: report.unresolvedTarget.map(row => row.target.index),
  }
}

function readLedger(filename, expected, label) {
  const bytes = fs.readFileSync(filename)
  assert(JSON.stringify(evidence(bytes)) === JSON.stringify(expected), `${label} artifact identity`)
  return { bytes, report: JSON.parse(gunzipSync(bytes).toString('utf8')) }
}

export function rebuildRelease21124Core({ baselinePath, targetPath, rawLedgerPath, metadataLedgerPath, exactLedgerPath, clusterLedgerPath, sourceRoot }) {
  const baseline = authenticate(path.resolve(baselinePath), RELEASE_2_1_124.baseline, '2.1.123 baseline')
  const target = authenticate(path.resolve(targetPath), RELEASE_2_1_124.target, '2.1.124 target')
  const normalization = normalizeRelease21124Metadata({ baseline: baseline.source, target: target.source })
  const raw = readLedger(rawLedgerPath, EXPECTED_ARTIFACTS.rawLedger, 'raw ledger')
  const metadata = readLedger(metadataLedgerPath, EXPECTED_ARTIFACTS.metadataLedger, 'metadata ledger')
  const exact = readLedger(exactLedgerPath, EXPECTED_ARTIFACTS.exactLedger, 'exact ledger')
  const cluster = readLedger(clusterLedgerPath, EXPECTED_ARTIFACTS.clusterLedger, 'cluster ledger')
  assert(raw.report.baseline.sha256 === RELEASE_2_1_124.baseline.sha256 && raw.report.target.sha256 === RELEASE_2_1_124.target.sha256, 'raw adjacent ledger inputs')
  assert(metadata.report.baseline.sha256 === RELEASE_2_1_124.baseline.sha256 && metadata.report.target.sha256 === RELEASE_2_1_124.normalizedTarget.sha256, 'metadata ledger inputs')
  assert(exact.report.baseline.sha256 === RELEASE_2_1_124.normalizedTarget.sha256 && exact.report.target.sha256 === RELEASE_2_1_124.normalizedTarget.sha256, 'exact ledger inputs')
  assert(exact.report.coverage.tokens.matched === RELEASE_2_1_124.targetTokens && exact.report.coverage.units.matched === RELEASE_2_1_124.targetUnits, 'exact ledger cardinality')
  assert(['changed','moved','unresolved'].every(key => exact.report.coverage.tokens[key] === 0 && exact.report.coverage.units[key] === 0), 'exact ledger residue')
  assert(exact.report.unmatchedBaseline.length === 0 && exact.report.unresolvedTarget.length === 0, 'exact ledger unmatched residue')
  assert(cluster.report.coverage.clusterCount === RELEASE_2_1_124.totalClusters, 'cluster ledger count')
  const inventory = release21124ClusterInventory({
    baseline: baseline.source,
    target: target.source,
    clusterLedger: cluster.report,
    sourceRoot: path.resolve(sourceRoot),
  })
  for (const row of inventory.direct) {
    for (const item of row.targetWitnesses) {
      assert(occurrences(target.source, item.value) === item.count, `${row.rowId} target witness count`)
      assert(occurrences(baseline.source, item.value) !== item.count, `${row.rowId} witness must differ in baseline`)
    }
  }
  const proof = {
    schemaVersion: 1,
    kind: 'release-2.1.124-known-semantic-delta-proof',
    case: RELEASE_2_1_124.case,
    release: RELEASE_2_1_124.release,
    complete: true,
    claim: 'Authenticated adjacent inner bundles are exhaustively partitioned into 205 identifier-insensitive statement clusters. Every active application cluster binds an exact adjacent raw statement, reviewed source owners or callsites, and focused tests; support-only changed paths and accounting-only clusters are explicitly closed. The exact normalized ledger has zero semantic residue.',
    authenticatedInputs: { baseline: RELEASE_2_1_124.baseline, target: RELEASE_2_1_124.target },
    metadataNormalization: { replacementCardinalityPerValue: 162, replacements: normalization.replacements, normalizedTarget: RELEASE_2_1_124.normalizedTarget },
    knownDelta: {
      changedSourcePaths: {
        baseRevision: BASE_REVISION,
        count: ALL_CHANGED_SOURCE_PATHS.length,
        paths: [...ALL_CHANGED_SOURCE_PATHS].sort(),
      },
      clusterInventory: inventory,
    },
    ledgers: { rawAdjacent: ledgerSummary(raw.report), metadataNormalized: ledgerSummary(metadata.report), knownDeltaExact: ledgerSummary(exact.report) },
  }
  return { proof, ledgers: { raw: raw.bytes, metadata: metadata.bytes, exact: exact.bytes, cluster: cluster.bytes } }
}

function writeArtifact(root, relative, value) {
  const filename = path.join(root, relative)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, value)
  return { path: relative, ...evidence(value) }
}

export function buildRelease21124SemanticDelta(options) {
  const result = rebuildRelease21124Core(options)
  const root = path.resolve(options.outputRoot)
  const artifacts = {
    rawLedger: writeArtifact(root, ARTIFACTS.rawLedger, result.ledgers.raw),
    metadataLedger: writeArtifact(root, ARTIFACTS.metadataLedger, result.ledgers.metadata),
    exactLedger: writeArtifact(root, ARTIFACTS.exactLedger, result.ledgers.exact),
    clusterLedger: writeArtifact(root, ARTIFACTS.clusterLedger, result.ledgers.cluster),
  }
  const proof = { ...result.proof, artifacts }
  const proofBytes = Buffer.from(`${JSON.stringify(proof, null, 2)}\n`)
  const proofEvidence = writeArtifact(root, ARTIFACTS.proof, proofBytes)
  return { proof, proofEvidence }
}

export const release21124SemanticDeltaInternals = Object.freeze({ artifacts: ARTIFACTS, expectedArtifacts: EXPECTED_ARTIFACTS })

function parseArguments(argv) {
  const result = {}
  const allowed = new Set(['baseline','target','raw-ledger','metadata-ledger','exact-ledger','cluster-ledger','source-root','output'])
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, '')
    const value = argv[index + 1]
    assert(allowed.has(key) && value, `invalid argument: ${argv[index] ?? ''}`)
    result[key] = value
  }
  return result
}

function main() {
  const args = parseArguments(process.argv.slice(2))
  const required = ['baseline','target','raw-ledger','metadata-ledger','exact-ledger','cluster-ledger','source-root','output']
  assert(required.every(key => args[key]), `Usage: build-2.1.124-semantic-delta.mjs ${required.map(key => `--${key} PATH`).join(' ')}`)
  const result = buildRelease21124SemanticDelta({
    baselinePath: args.baseline,
    targetPath: args.target,
    rawLedgerPath: args['raw-ledger'],
    metadataLedgerPath: args['metadata-ledger'],
    exactLedgerPath: args['exact-ledger'],
    clusterLedgerPath: args['cluster-ledger'],
    sourceRoot: args['source-root'],
    outputRoot: args.output,
  })
  console.log(JSON.stringify({ status: '2.1.124-semantic-delta-built', proof: result.proofEvidence, exact: result.proof.ledgers.knownDeltaExact.coverage }, null, 2))
}

const invokedAsScript = process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (invokedAsScript) {
  try { main() } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error))
    process.exitCode = 1
  }
}
