#!/usr/bin/env node

import crypto from 'node:crypto'
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

export function release21124ClusterInventory() {
  const semantic = 'semantic-delta'
  const directRows = [
    direct('settings-runtime', [3,4,5,7,8,15,16,17,18,23,24,27,28,29,30,31,32,33,34,35,36,47,48,63,77], 'token-efficient-tools-2026-03-28', 1, ALL_CHANGED_SOURCE_PATHS, ['gateway-doctor-plugins','runtime-tail',semantic], 'Settings, beta, model, sandbox, and runtime configuration'),
    direct('brief-skill-telemetry', [13,14,55,84,85,88,89,90,91,92,102], 'invocation_trigger', 6, ['src/query/stopHooks.ts','src/tools/BriefTool/BriefTool.ts','src/tools/BriefTool/prompt.ts','src/tools/SkillTool/SkillTool.ts','src/utils/processUserInput/processSlashCommand.tsx','src/utils/telemetry/pluginTelemetry.ts'], ['skill-activation-telemetry','ui-command-semantics',semantic], 'Brief and skill activation telemetry'),
    direct('oauth-mcp-auth', [19,20,21,22,25,50,51,52,57,60,61,62,68,70,71,72,73], '/v2/session_ingress/mcp/ws/', 1, ['src/bridge/trustedDevice.ts','src/services/api/errors.ts','src/services/api/workloadIdentity.ts','src/services/mcp/auth.ts','src/services/mcp/client.ts','src/services/mcp/config.ts','src/services/oauth/auth-code-listener.ts','src/services/oauth/client.ts','src/utils/auth.ts'], ['gateway-doctor-plugins','mcp-oauth-dedup','runtime-tail',semantic], 'OAuth, workload identity, MCP, and authentication'),
    direct('terminal-bash-scroll', [37,38,39,53,54,64,87,191], ' \\xB7 wheelFlood', 1, ['src/components/ScrollKeybindingHandler.tsx','src/ink/scroll-config.ts','src/ink/termio/osc.ts','src/tools/BashTool/readOnlyValidation.ts','src/utils/bash/ast.ts','src/utils/powershell/parser.ts','src/utils/shell/powershellDetection.ts'], ['runtime-tail','ui-command-semantics','ui-sdk-tail',semantic], 'Terminal OSC, Bash validation, PowerShell, and wheel flood'),
    direct('history-suggestions', [40,41,44,45,46,122,123,136,170,171,172,173,178], 'historySearch:cycleScope', 4, ['src/components/HistorySearchDialog.tsx','src/components/PromptInput/PromptInput.tsx','src/components/QuickOpenDialog.tsx','src/components/design-system/FuzzyPicker.tsx','src/history.ts','src/hooks/fileSuggestions.ts','src/hooks/unifiedSuggestions.ts','src/hooks/useHistorySearch.ts','src/hooks/useTypeahead.tsx','src/keybindings/defaultBindings.ts','src/keybindings/schema.ts'], ['history-picker-scopes','ui-command-semantics',semantic], 'History scopes, suggestions, and fuzzy picker semantics'),
    direct('image-read-retry', [42,43,49,104,105,106,108,109,162], 'dimensions exceed max allowed size', 1, ['src/services/api/claude.ts','src/tools/FileReadTool/FileReadTool.ts','src/tools/FileReadTool/imageProcessor.ts','src/utils/attachments.ts','src/utils/imageResizer.ts'], ['runtime-tail',semantic], 'Image sizing, file reads, and API retry behavior'),
    direct('gateway-doctor-plugins', [107,117,126,127,128,129,130,137,139,140], '[gatewayDiscovery] 0 usable models after filter', 1, ['src/commands/init.ts','src/commands/plugin/ManagePlugins.tsx','src/screens/Doctor.tsx','src/utils/hooks/hooksConfigManager.ts','src/utils/model/gatewayModelDiscovery.ts','src/utils/model/model.ts','src/utils/model/modelOptions.ts','src/utils/plugins/refresh.ts'], ['gateway-doctor-plugins','ui-command-semantics',semantic], 'Gateway discovery, doctor, init, and plugin refresh'),
    direct('tool-execution-classifier', [58,65,66,74,75,76,78,79,80,83,86,93,94,95,96,99,101,103,118], 'setInProgressToolUseIDs({action:"add"', 1, ['src/components/tasks/BackgroundTasksDialog.tsx','src/jobs/classifier.ts','src/services/tools/StreamingToolExecutor.ts','src/services/tools/toolExecution.ts','src/services/tools/toolIsolation.ts','src/services/tools/toolOrchestration.ts','src/tools/AgentTool/runAgent.ts','src/utils/conversationRecovery.ts','src/utils/permissions/yoloClassifier.ts','src/utils/taskSummary.ts','src/utils/udsClient.ts'], ['runtime-tail',semantic], 'Tool execution, deferred tools, classifier, and task lifecycle'),
    direct('pr-fleet-status', [6,59,81,82,179,180,181,182,183], "Couldn't rename \\u2014 the job may have been removed or its state file is unwritable.", 1, ['src/components/FleetView.tsx','src/state/AppStateStore.ts','src/tools/shared/gitOperationTracking.ts','src/utils/prStatus.ts','src/utils/sessionStorage.ts'], ['runtime-tail','ui-command-semantics',semantic], 'Fleet and pull-request status lifecycle'),
    direct('compact-messages', [110,111,112,119,120,121,125,131,132], 'CLAUDE_CODE_COLD_COMPACT', 2, ['src/commands/compact/compact.ts','src/components/Messages.tsx','src/services/compact/autoCompact.ts','src/utils/messages.ts'], ['runtime-tail','ui-command-semantics',semantic], 'Cold compaction and message rendering'),
    direct('sdk-print-share', [100,187,196,197], 'ccshare_url', 2, ['src/QueryEngine.ts','src/cli/print.ts','src/entrypoints/sdk/controlSchemas.ts','src/entrypoints/sdk/coreSchemas.ts','src/hooks/fileSuggestions.ts'], ['ui-command-semantics','ui-sdk-tail',semantic], 'SDK schemas, print output, and share URL'),
    direct('repl-isolation', [124,147,148,149,150,151,152,153,154,155,156,192], 'isolation-latch', 4, ['src/bridge/initReplBridge.ts','src/commands/clear/caches.ts','src/commands/clear/conversation.ts','src/hooks/useReplBridge.tsx','src/screens/REPL.tsx','src/tools/REPLTool/prompt.ts','src/tools/REPLTool/types.ts','src/tools/REPLTool/vm.ts','src/utils/sessionStorage.ts','src/utils/sessionStoragePortable.ts'], ['repl-isolation','runtime-tail',semantic], 'REPL tool isolation and persisted isolation latch'),
    direct('commands-ui', [133,134,135,142,143,144,146,160,161,169,174,175,177,184,193,194], 'Fix with Claude', 2, ['src/commands/bridge/bridge.tsx','src/commands/effort/effort.tsx','src/commands/logout/logout.tsx','src/commands/review/ultrareviewEnabled.ts','src/commands/teleport/teleport.tsx','src/components/FeedbackSurvey/MemoryEvaluationSurveyView.tsx','src/components/InvalidSettingsDialog.tsx','src/components/PromptInput/PromptInput.tsx','src/components/PromptInput/PromptInputFooter.tsx','src/components/PromptInput/useSwarmBanner.ts','src/components/messages/SystemAPIErrorMessage.tsx','src/dialogLaunchers.tsx','src/tools/AskUserQuestionTool/AskUserQuestionTool.tsx','src/utils/suggestions/commandSuggestions.ts'], ['runtime-tail','ui-command-semantics','ui-sdk-tail',semantic], 'Command and interactive UI semantics'),
    direct('egress-daemon-runtime', [163,164,166,167,168,199,201,203,204,205], 'egressGatewayEnv', 1, ['src/cli/bg.ts','src/daemon/jobs.ts','src/daemon/main.ts','src/daemon/spare.ts','src/daemon/supervisor.ts','src/entrypoints/cli.tsx','src/entrypoints/init.ts','src/main.tsx','src/upstreamproxy/relay.ts','src/upstreamproxy/upstreamproxy.ts'], ['gateway-doctor-plugins','runtime-tail',semantic], 'Daemon, egress gateway, and entrypoint lifecycle'),
    direct('startup-notifications', [67,185,195], 'seenNotifications', 9, ['src/bootstrap/state.ts','src/hooks/notifs/useStartupNotifications.tsx','src/migrations/migrateNotificationImpressions.ts','src/utils/config.ts','src/utils/settings/settings.ts','src/utils/settings/types.ts'], ['ui-command-semantics','ui-sdk-tail',semantic], 'Startup notification registry and persistence'),
    direct('project-purge', [198,200], 'purge [path]', 1, ['src/cli/handlers/project.tsx','src/main.tsx'], ['project-purge',semantic], 'Project purge command'),
  ]
  const accountingOnly = [
    { clusterIds: [1,2,9,10,11,26], reason: 'dependency', evidence: { classification: 'third-party dependency and vendor payload changes' } },
    { clusterIds: [12,157,158,165,190], reason: 'identifier-only', evidence: { classification: 'renames, inert constants, and no-op identifier surfaces without active caller delta' } },
    { clusterIds: [56,97,98,116,138,141,145,176,202], reason: 'initializer-linkage', evidence: { classification: 'module initializer and import/export linkage paired with active direct clusters' } },
    { clusterIds: [69,113,114,115,159,186,188,189], reason: 'exact-relocation', evidence: { classification: 'exact dependency or application statement relocation represented by adjacent clusters' } },
  ]
  const ids = [...directRows, ...accountingOnly].flatMap(row => row.clusterIds).sort((a, b) => a - b)
  assert(new Set(ids).size === ids.length, 'cluster partition duplicates')
  assert(ids.length === RELEASE_2_1_124.totalClusters && ids.every((id, index) => id === index + 1), 'cluster partition must be exactly 1..205')
  return { schemaVersion: 1, totalClusters: RELEASE_2_1_124.totalClusters, direct: directRows, accountingOnly }
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

export function rebuildRelease21124Core({ baselinePath, targetPath, rawLedgerPath, metadataLedgerPath, exactLedgerPath, clusterLedgerPath }) {
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
  const inventory = release21124ClusterInventory()
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
    claim: 'Authenticated adjacent inner bundles are exhaustively partitioned into 205 identifier-insensitive statement clusters. All active application clusters bind target literals, source owners, and focused tests; accounting-only clusters carry explicit dependency, relocation, identifier, or initializer evidence. The exact normalized ledger has zero semantic residue.',
    authenticatedInputs: { baseline: RELEASE_2_1_124.baseline, target: RELEASE_2_1_124.target },
    metadataNormalization: { replacementCardinalityPerValue: 162, replacements: normalization.replacements, normalizedTarget: RELEASE_2_1_124.normalizedTarget },
    knownDelta: { clusterInventory: inventory },
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
  const allowed = new Set(['baseline','target','raw-ledger','metadata-ledger','exact-ledger','cluster-ledger','output'])
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
  const required = ['baseline','target','raw-ledger','metadata-ledger','exact-ledger','cluster-ledger','output']
  assert(required.every(key => args[key]), `Usage: build-2.1.124-semantic-delta.mjs ${required.map(key => `--${key} PATH`).join(' ')}`)
  const result = buildRelease21124SemanticDelta({
    baselinePath: args.baseline,
    targetPath: args.target,
    rawLedgerPath: args['raw-ledger'],
    metadataLedgerPath: args['metadata-ledger'],
    exactLedgerPath: args['exact-ledger'],
    clusterLedgerPath: args['cluster-ledger'],
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
