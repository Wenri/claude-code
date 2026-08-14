#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const outputPath = path.join(repo, 'recovery/2.1.121-direct-evidence-specs.json')
const final = process.argv.slice(2).includes('--final')
if (process.argv.slice(2).some(argument => argument !== '--final')) {
  throw new Error('Usage: build-2.1.121-direct-specs.mjs [--final]')
}
const inventoryPattern = /^2\.1\.121-official-.*-inventory\.json$/
const sr = (sourcePath, fragment) => ({ path: sourcePath, fragment })
const absent = (paths, fragment) => ({ paths, fragment })

const rootTest = ['hidden-obligations']
const manualOfficial = new Map([
  [3, {
    targetFragments: ['Search skills', 'No skills match "'],
    sourceAssertions: [
      sr('src/components/skills/SkillsMenu.tsx', 'Search skills…'),
      sr('src/components/skills/SkillsMenu.tsx', 'filteredSkills'),
    ],
    rationale: 'Target-only search copy and the recovered controlled filter state bind long-list skill filtering.',
  }],
  [5, {
    targetFragments: ['K8?.scrollToBottom(),dz(),X3.current=!1'],
    sourceAssertions: [
      sr('src/screens/REPL.tsx', 'hasScrolledAwayRef.current = !sticky'),
      sr('src/screens/REPL.tsx', '!hasScrolledAwayRef.current'),
    ],
    rationale: 'The exact target render expression clears deliberate scroll-away only at the live edge; source retains that state while typing.',
  }],
  [6, {
    targetFragments: ['height:g,stickyScroll:!1'],
    sourceAssertions: [
      sr('src/components/FullscreenLayout.tsx', 'function ModalScroller('),
      sr('src/components/design-system/Tabs.tsx', 'useModalClaimScrollBox'),
      sr('src/context/modalContext.tsx', 'claimScrollBox'),
      sr('src/ink.ts', "export { FocusManager } from './ink/focus.js'"),
      sr('src/ink/components/App.tsx', 'rootNode._pendingRawModeDelta'),
      sr('src/ink/components/AppContext.ts', 'focusManager'),
      sr('src/ink/dom.ts', 'pendingScrollDelta'),
      sr('src/ink/focus.ts', 'class FocusManager'),
      sr('src/ink/hooks/use-focus.ts', 'export function useFocus()'),
      sr('src/ink/ink.tsx', 'pendingScrollDelta'),
      sr('src/screens/REPL.tsx', 'modalScrollRef'),
    ],
    focusedTests: ['dialog-overflow'],
    rationale: 'The target adds a non-sticky bounded modal ScrollBox; recovered modal context, focus, and pending-delta plumbing authenticate keyboard and wheel overflow.',
  }],
  [7, {
    targetFragments: ['softWrap'],
    sourceAssertions: [
      sr('src/ink/output.ts', 'packSoftWrap'),
      sr('src/ink/screen.ts', 'softWrap: Int32Array'),
      sr('src/ink/selection.ts', 'function urlRunAt('),
    ],
    rationale: 'The authenticated soft-wrap ledger grows and source packs row boundaries so selection can reconstruct a URL across wrapped rows.',
  }],
  [8, {
    targetFragments: ['CLAUDE_CODE_FORK_SUBAGENT'],
    sourceAssertions: [
      sr('src/tools/AgentTool/forkSubagent.ts', 'resolveForkSubagentSource'),
      sr('src/tools/AgentTool/forkSubagent.ts', 'process.env.CLAUDE_CODE_FORK_SUBAGENT'),
    ],
    rationale: 'The adjacent count change is bound to explicit environment-first fork resolution before non-interactive suppression.',
  }],
  [9, {
    retained: true,
    targetFragments: ['/.claude/skills/'],
    sourceAssertions: [
      sr('src/utils/permissions/permissions.ts', "mode === 'bypassPermissions'"),
      sr('src/utils/permissions/pathValidation.ts', 'checkPathSafetyForAutoEdit'),
    ],
    rationale: 'The recovered 2.1.120 base already contains the target bypass ordering for protected skill, agent, and command writes; the adjacent artifact retains the authenticated path marker.',
  }],
  [10, {
    targetFragments: ['AllowClipboardAccess'],
    sourceAssertions: [
      sr('src/commands/terminalSetup/terminalSetup.tsx', 'enableITerm2ClipboardAccess'),
      sr('src/commands/terminalSetup/terminalSetup.tsx', 'AllowClipboardAccess'),
    ],
    rationale: 'Target-only iTerm preference access is implemented both in command registration and the terminal-setup flow.',
  }],
  [12, {
    targetFragments: ['Write the title in '],
    sourceAssertions: [
      sr('src/utils/sessionTitle.ts', 'getInitialSettings().language'),
      sr('src/utils/sessionTitle.ts', 'Write the title in ${language}'),
    ],
    rationale: 'Target-only localized-title prompt text is generated from the configured language.',
  }],
  [15, {
    targetFragments: ["What's new", 'Recent activity', 'No recent activity'],
    sourceAssertions: [
      sr('src/components/LogoV2/LogoV2.tsx', 'const whatsNewFeed = createWhatsNewFeed(changelog)'),
      sr('src/components/LogoV2/feedConfigs.tsx', 'createWhatsNewFeed'),
    ],
    sourcePathAbsences: [
      absent(['src/components/LogoV2/LogoV2.tsx', 'src/components/LogoV2/feedConfigs.tsx'], 'createRecentActivityFeed'),
    ],
    rationale: 'Authenticated target absences remove the Recent activity feed while the retained What’s new feed is wired in every splash layout.',
  }],
  [16, {
    targetFragments: [' (ctrl+o to expand)'],
    sourceAssertions: [
      sr('src/components/DiagnosticsDisplay.tsx', 'verbose || isTranscriptMode'),
      sr('src/components/DiagnosticsDisplay.tsx', '<CtrlOToExpand />'),
      sr('src/components/messages/AttachmentMessage.tsx', 'isTranscriptMode={isTranscriptMode}'),
    ],
    rationale: 'Target-only expansion hint is paired with the recovered transcript-aware diagnostic summary.',
  }],
  [18, {
    targetFragments: ['user_system_prompt', 'gen_ai.response.finish_reasons'],
    sourceAssertions: [
      sr('src/query.ts', 'combineUserSystemPrompt'),
      sr('src/services/analytics/firstPartyEventLogger.ts', 'Record<string, string | number | boolean | undefined>'),
      sr('src/services/api/claude.ts', 'userSystemPrompt?: string'),
      sr('src/services/api/logging.ts', 'stopReason: stopReason ?? undefined'),
      sr('src/utils/telemetry/betaSessionTracing.ts', 'user_system_prompt: content'),
      sr('src/utils/telemetry/sessionTracing.ts', "setAttribute('gen_ai.response.finish_reasons'"),
    ],
    rationale: 'Two target-only span attributes bind stop-reason and opt-in user-system-prompt propagation from query construction through span completion.',
  }],
  [19, {
    retained: true,
    targetFragments: ['Dictation language:'],
    sourceAssertions: [
      sr('src/moreright/useMoreRight.tsx', 'ownsInput: false'),
    ],
    rationale: 'The Linux artifact retains the dictation surface while the recovered platform bridge exposes the input-ownership contract used by native speech-language selection.',
  }],
  [20, {
    retained: true,
    targetFragments: ['Context usage'],
    sourceAssertions: [
      sr('src/moreright/useMoreRight.tsx', 'onSessionRestored: async () => {}'),
    ],
    rationale: 'The Linux artifact retains context usage while the recovered native bridge contract supplies the platform-owned dialog handoff.',
  }],
  [21, {
    retained: true,
    targetFragments: ['image dimensions'],
    sourceAssertions: [
      sr('src/utils/imageStore.ts', 'storedImagePaths.delete(oldest)'),
      sr('src/utils/imageStore.ts', 'MAX_STORED_IMAGE_PATHS'),
    ],
    rationale: 'The authenticated image-processing marker is retained and the source uses a bounded path store rather than retaining unbounded image payloads.',
  }],
  [22, {
    targetFragments: ['jsonlJoin('],
    sourceAssertions: [
      sr('src/utils/sessionStorage.ts', 'reAppendSessionMetadataAsync'),
      sr('src/utils/sessionStorage.ts', 'const content = jsonlJoin(plan.entries)'),
      sr('src/utils/slowOperations.ts', 'export function jsonlJoin'),
    ],
    rationale: 'Target-only batched JSONL serialization avoids allocating and logging a complete multi-gigabyte transcript parse.',
  }],
  [23, {
    targetFragments: ['tool_use'],
    sourceAssertions: [
      sr('src/Tool.ts', "{ kind: 'clear'; toolUseId: string }"),
      sr('src/components/ToolProgress.tsx', 'renderToolProgress'),
      sr('src/screens/REPL.tsx', 'pruneResolvedToolProgress'),
      sr('src/tools/AgentTool/AgentTool.tsx', "kind: 'clear'"),
      sr('src/tools/BashTool/BashTool.tsx', "kind: 'clear'"),
      sr('src/tools/PowerShellTool/PowerShellTool.tsx', "kind: 'clear'"),
      sr('src/utils/processUserInput/processBashCommand.tsx', "kind: 'clear'"),
      sr('src/utils/processUserInput/processSlashCommand.tsx', "kind: 'clear'"),
    ],
    rationale: 'The adjacent tool-use cardinality change is bound to an explicit clear event and result-driven pruning at every long-running tool producer.',
  }],
  [24, {
    targetFragments: ['Working directory "'],
    sourceAssertions: [
      sr('src/utils/Shell.ts', 'setCwdState(fallback)'),
      sr('src/utils/Shell.ts', 'was deleted; shell cwd recovered'),
    ],
    rationale: 'The second target working-directory diagnostic corresponds to stable-directory recovery before Bash execution retries.',
  }],
  [25, {
    retained: true,
    targetFragments: ['--resume'],
    sourceAssertions: [
      sr('src/utils/gracefulShutdown.ts', 'sessionIdExists'),
      sr('src/main.tsx', 'resume'),
    ],
    rationale: 'The authenticated resume CLI surface is retained and source guards session-dependent startup behavior in external builds.',
  }],
  [26, {
    retained: true,
    targetFragments: ['JSON line'],
    sourceAssertions: [
      sr('src/utils/sessionStorage.ts', 'parseTranscriptLine(line'),
      sr('src/utils/sessionStorage.ts', 'continue'),
    ],
    rationale: 'The authenticated JSONL surface is retained while line-scoped parsing skips an invalid record without discarding the large session.',
  }],
  [27, {
    targetFragments: ['[thinking] model rejected thinking.type='],
    sourceAssertions: [
      sr('src/bootstrap/state.ts', 'thinkingTypeOverrides'),
      sr('src/services/api/claude.ts', 'getRejectedThinkingType'),
      sr('src/services/api/claude.ts', "return 'retry:thinking-type'"),
    ],
    rationale: 'Target-only rejection telemetry binds the cached enabled/adaptive fallback used by opaque Bedrock profile ARNs.',
  }],
  [29, {
    targetFragments: ['forceFullReset'],
    sourceAssertions: [
      sr('src/ink/ink.tsx', 'this.log.forceFullReset()'),
      sr('src/ink/log-update.ts', 'forceFullReset(): void'),
    ],
    rationale: 'Target-only forced reset support clears non-fullscreen redraw history instead of duplicating scrollback.',
  }],
  [36, {
    targetFragments: ['stickyScroll'],
    sourceAssertions: [
      sr('src/components/FullscreenLayout.tsx', 'maxHeight={terminalRows - MODAL_TRANSCRIPT_PEEK}'),
      sr('src/components/FullscreenLayout.tsx', 'overflow="hidden"'),
    ],
    focusedTests: ['dialog-overflow'],
    rationale: 'The changed scroll-container count and bounded dialog wrapper prevent usage content clipping when no-flicker mode is disabled.',
  }],
  [37, {
    targetFragments: ['Focus view needs the fullscreen renderer'],
    sourceAssertions: [
      sr('src/commands/focus.ts', 'FULLSCREEN_REQUIRED'),
      sr('src/commands/focus.ts', 'if (!isFullscreenEnvEnabled())'),
    ],
    rationale: 'Target-only explanatory copy replaces the non-fullscreen unknown-command path and preserves disable behavior.',
  }],
])

const officialRows = Array.from({ length: 39 }, (_, index) => ({
  id: `B${String(index + 1).padStart(2, '0')}`,
  category: 'official',
  targetFragments: [],
  sourceAssertions: [],
  sourcePathAbsences: [],
  focusedTests: [],
  rationale: '',
}))
const officialByBullet = new Map(
  officialRows.map((row, index) => [index + 1, row]),
)

for (const name of fs
  .readdirSync(path.join(repo, 'recovery'))
  .filter(name => inventoryPattern.test(name))
  .sort()) {
  const inventory = JSON.parse(
    fs.readFileSync(path.join(repo, 'recovery', name), 'utf8'),
  )
  const testId = name
    .replace(/^2\.1\.121-/, '')
    .replace(/-inventory\.json$/, '')
  for (const inventoryRow of inventory.rows) {
    const row = officialByBullet.get(inventoryRow.bullet)
    for (const witness of inventoryRow.artifact_fragments ?? []) {
      row.targetFragments.push(witness.fragment)
    }
    for (const source of inventoryRow.source ?? []) {
      for (const fragment of source.includes ?? []) {
        row.sourceAssertions.push(sr(source.path, fragment))
      }
      for (const fragment of source.excludes ?? []) {
        row.sourcePathAbsences.push(absent([source.path], fragment))
      }
    }
    row.focusedTests.push(testId)
    row.rationale = [row.rationale, inventoryRow.normalized_witness]
      .filter(Boolean)
      .join(' ')
  }
}

for (const [bullet, manual] of manualOfficial) {
  const row = officialByBullet.get(bullet)
  for (const key of [
    'targetFragments',
    'sourceAssertions',
    'sourcePathAbsences',
    'focusedTests',
  ]) {
    row[key].push(...(manual[key] ?? []))
  }
  row.rationale = [row.rationale, manual.rationale].filter(Boolean).join(' ')
  if (manual.retained) row.retained = true
}
for (const row of officialRows) {
  if (row.focusedTests.length === 0) row.focusedTests.push(...rootTest)
}
for (const bullet of [9, 19, 20, 21, 25, 26, 39]) {
  officialByBullet.get(bullet).retained = true
}

const hiddenRows = [
  {
    id: 'H01',
    category: 'hidden',
    targetFragments: ['/setup_overage_billing', 'tengu_extra_usage_inline_dialog_shown', 'tengu_ember_latch'],
    sourceAssertions: [
      sr('src/commands/extra-usage/ExtraUsageDialog.tsx', 'tengu_extra_usage_inline_dialog_shown'),
      sr('src/commands/extra-usage/extra-usage-core.ts', 'extractAdminRequestError'),
      sr('src/commands/extra-usage/extra-usage.tsx', "getFeatureValue_CACHED_MAY_BE_STALE('tengu_ember_latch', false)"),
      sr('src/components/LogoV2/AnimatedClawd.tsx', 'celebrate: CELEBRATE'),
      sr('src/services/api/extraUsage.ts', '/setup_overage_billing'),
    ],
    rationale: 'Target-only endpoint, rollout, and dialog telemetry bind the complete inline extra-usage state machine.',
  },
  {
    id: 'H02',
    category: 'hidden',
    targetFragments: ['function _P1'],
    sourceAssertions: [
      sr('src/commands/extra-usage/extra-usage-core.ts', 'function extractAdminRequestError'),
      sr('src/commands/extra-usage/extra-usage-core.ts', "for (const key of ['message', 'detail'])"),
    ],
    rationale: 'The exact target helper is localized to safe client-error extraction before the generic admin fallback.',
  },
  {
    id: 'H03',
    category: 'hidden',
    targetFragments: ['tengu_prompt_cache_diagnosis_received'],
    sourceAssertions: [
      sr('src/services/api/claude.ts', 'diagnostics: { previous_message_id: previousMessageId ?? null }'),
      sr('src/services/api/claude.ts', 'logPromptCacheDiagnosis(cacheMissReason'),
      sr('src/services/api/promptCacheBreakDetection.ts', "logEvent('tengu_prompt_cache_diagnosis_received'"),
    ],
    rationale: 'Target-only diagnosis telemetry is bound to request correlation and stream/non-stream response capture.',
  },
  {
    id: 'H04',
    category: 'hidden',
    retained: true,
    targetFragments: ['cache-break-state-', 'messagesHistoryChanged', 'TTL flip expected'],
    sourceAssertions: [
      sr('src/services/api/promptCacheBreakDetection.ts', '`cache-break-state-${getSessionId()}.json`'),
      sr('src/commands/compact/compact.ts', 'shouldTrackPromptCacheBreaks'),
      sr('src/services/compact/autoCompact.ts', 'shouldTrackPromptCacheBreaks'),
      sr('src/services/compact/compact.ts', 'shouldTrackPromptCacheBreaks'),
      sr('src/services/compact/microCompact.ts', 'shouldTrackPromptCacheBreaks'),
      sr('src/tools/AgentTool/runAgent.ts', 'shouldTrackPromptCacheBreaks'),
    ],
    rationale: 'Both authenticated bundles retain the active persisted prompt-cache tracker; the changed API path exposes and consumes it completely.',
  },
  {
    id: 'H05',
    category: 'hidden',
    targetFragments: ['Skipping symlink in .worktreeinclude: ', 'Skipping symlinked settings.local.json: '],
    sourceAssertions: [
      sr('src/utils/worktree.ts', '(await lstat(srcPath)).isSymbolicLink()'),
      sr('src/utils/worktree.ts', 'Skipping symlinked settings.local.json'),
    ],
    rationale: 'Two target-only refusal diagnostics bind lstat-before-copy protection for worktree includes and local settings.',
  },
  {
    id: 'H06',
    category: 'hidden',
    targetFragments: ['loose-sk-ant', 'loose-bearer', 'loose-env-assign', 'loose-jwt'],
    sourceAssertions: [
      sr('src/services/teamMemorySync/secretScanner.ts', 'const LOOSE_REDACTION_RULES'),
      sr('src/utils/debug.ts', 'redactSecrets(message.trim())'),
    ],
    rationale: 'Four target-only loose detector IDs are used only for debug redaction while the strict scan remains unchanged.',
  },
  {
    id: 'H07',
    category: 'hidden',
    targetFragments: ['.1.txt'],
    sourceAssertions: [
      sr('src/utils/debug.ts', 'MAX_DEBUG_LOG_BYTES = 10 * 1024 * 1024'),
      sr('src/utils/debug.ts', 'async function rotateDebugLogIfNeeded'),
      sr('src/utils/debug.ts', "getErrnoCode(error) !== 'EISDIR'"),
    ],
    rationale: 'Target-only rotated suffix binds 10 MiB rotation and directory-path fallback recovery.',
  },
  {
    id: 'H08',
    category: 'hidden',
    targetFragments: ['[Speculation] Skipping symlink source ', 'parent dir escapes cwd via symlink', '[Speculation] Failed to unlink symlink at '],
    sourceAssertions: [
      sr('src/services/PromptSuggestion/speculation.ts', 'canonicalCwd = await realpath(cwd)'),
      sr('src/services/PromptSuggestion/speculation.ts', '(await lstat(src)).isSymbolicLink()'),
      sr('src/services/PromptSuggestion/speculation.ts', 'canonicalParent = await realpath(existingParent)'),
      sr('src/services/PromptSuggestion/speculation.ts', 'await unlink(dest)'),
    ],
    rationale: 'Three target-only fail-closed diagnostics bind source, parent, and destination symlink containment.',
  },
  {
    id: 'H09',
    category: 'hidden',
    targetFragments: ['[reportRenderError] React boundary caught ', 'tengu_idle_amber_finch', 'tengu_spinner_stall_cleared'],
    sourceAssertions: [
      sr('src/commands/branch/branch.ts', 'You are now in the branch. Use /resume'),
      sr('src/components/Spinner/SpinnerAnimationRow.tsx', 'tengu_spinner_stall_cleared'),
      sr('src/ink/components/App.tsx', 'reportRenderError(error, errorInfo)'),
      sr('src/jobs/classifier.ts', 'MOST SPECIFIC identifier'),
      sr('src/main.tsx', 'stdout is not a TTY'),
      sr('src/services/compact/autoCompact.ts', 'rapid-refill breaker'),
      sr('src/tools/PowerShellTool/pathValidation.ts', 'upstream pipeline command'),
      sr('src/tools/PowerShellTool/readOnlyValidation.ts', 'upstream pipeline command'),
      sr('src/utils/gracefulShutdown.ts', 'export function reportRenderError'),
      sr('src/utils/idleTimeout.ts', "tengu_idle_amber_finch"),
    ],
    rationale: 'Reviewed target-only UI/error/spinner markers and wording deltas form the finite renderer, job-label, PowerShell, compact, branch, and idle cluster.',
  },
  {
    id: 'H10',
    category: 'hidden',
    targetFragments: ['Skills, subagents, and plugins', 'No attribution data yet', '"attributionAgent":"'],
    sourceAssertions: [
      sr('src/components/Settings/UsageContributors.tsx', 'Skills, subagents, and plugins'),
      sr('src/components/Settings/UsageContributors.tsx', 'attributionAgent'),
      sr('src/components/Settings/UsageContributors.tsx', 'attributionSkill'),
    ],
    rationale: 'Target-only attribution headings and JSONL keys bind local /usage grouping for plugins, skills, and subagents.',
  },
  {
    id: 'H11',
    category: 'hidden',
    targetFragments: ['tengu_sdk_url_host_rejected', 'bridge_repl_v2_reattach_fallback', 'remote-permission-mode-noop'],
    sourceAssertions: [
      sr('src/bridge/initReplBridge.ts', 'bridge_repl_v2_reattach_fallback'),
      sr('src/bridge/remoteBridgeCore.ts', 'remote-permission-mode-noop'),
      sr('src/cli/transports/transportUtils.ts', 'tengu_sdk_url_host_rejected'),
      sr('src/components/PromptInput/PromptInput.tsx', 'remote-permission-mode-noop'),
      sr('src/main.tsx', '--sdk-url rejected'),
      sr('src/screens/REPL.tsx', 'tengu_immediate_command_executed'),
      sr('src/utils/handlePromptSubmit.ts', 'tengu_immediate_command_executed'),
    ],
    rationale: 'Three target-only telemetry keys localize the SDK allowlist, bridge reattach, immediate dispatch, and remote permission no-op paths.',
  },
  {
    id: 'H12',
    category: 'hidden',
    targetFragments: ['tengu_bg_spare_claim', 'tengu_bg_spare_enable'],
    sourceAssertions: [
      sr('src/daemon/supervisor.ts', 'tengu_bg_spare_claim'),
      sr('src/daemon/ptyHost.ts', 'tengu_bg_spare_enable'),
    ],
    focusedTests: ['daemon-lifecycle'],
    rationale: 'Target-only spare-claim telemetry anchors the broader daemon/background/Fleet recovery, decomposed further by D rows.',
  },
  {
    id: 'H13',
    category: 'hidden',
    targetFragments: ['VERSION:"2.1.121"'],
    sourceAssertions: [
      sr('src/services/mcp/types.ts', 'alwaysLoad: z.boolean().optional()'),
    ],
    rationale: 'The exact release version marker authenticates the target artifact; B01-B39 provide the one-to-one source-semantic decomposition.',
  },
].map(row => ({ ...row, focusedTests: row.focusedTests ?? ['hidden-obligations'], sourcePathAbsences: [] }))

const daemonRows = [
  {
    id: 'D01',
    category: 'daemon',
    title: 'Daemon service install, start, status, log, stop, restart, and version lifecycle',
    targetFragments: ['Usage: claude daemon [subcommand] [options]', 'Service lifecycle:'],
    sourceAssertions: [
      sr('src/daemon/cli.ts', 'Service lifecycle:'),
      sr('src/daemon/service.ts', 'launchctl'),
      sr('src/daemon/status.ts', 'uptime'),
      sr('src/daemon/main.ts', 'supervisor'),
    ],
    rationale: 'Target-only daemon help text binds the complete per-user service lifecycle.',
  },
  {
    id: 'D02',
    category: 'daemon',
    title: 'Transient daemon yield and background spare adoption',
    targetFragments: ['yielding to a foreground/service daemon', 'tengu_bg_spare_claim'],
    sourceAssertions: [
      sr('src/daemon/supervisor.ts', 'tengu_bg_spare_claim'),
      sr('src/daemon/lock.ts', 'yield'),
      sr('src/daemon/ptyHost.ts', 'claim'),
      sr('src/daemon/ptyClient.ts', 'claim'),
    ],
    rationale: 'Exact handover copy and claim telemetry bind lock-safe transient/service ownership transfer.',
  },
  {
    id: 'D03',
    category: 'daemon',
    title: 'Background worker crash recovery, task ownership, and Fleet state',
    targetFragments: [' orphaned background task(s) after restart', 'tengu_bg_agent_action'],
    sourceAssertions: [
      sr('src/utils/agentsFleet.ts', 'daemon'),
      sr('src/utils/backgroundHousekeeping.ts', 'orphan'),
      sr('src/components/FleetView.tsx', 'background'),
      sr('src/components/BackgroundExitDialog.tsx', 'background'),
    ],
    rationale: 'Target-only restart-orphan copy and expanded action telemetry bind background ownership recovery and Fleet UX.',
  },
].map(row => ({ ...row, focusedTests: ['daemon-lifecycle'], sourcePathAbsences: [] }))

const residualRows = [
  {
    id: 'R01',
    category: 'residual',
    title: 'Released shell/plugin gates are removed and privacy opt-out is complete',
    targetFragments: ['tengu_cork_m4q', 'tengu_lapis_finch', 'tengu_quiet_fern:!0'],
    sourceAssertions: [
      sr('src/utils/shell/prefix.ts', 'enablePromptCaching: true'),
      sr('src/utils/plugins/hintRecommendation.ts', 'isTelemetryDisabled()'),
      sr('src/services/mcp/vscodeSdkMcp.ts', 'tengu_quiet_fern: true'),
      sr('src/utils/privacyLevel.ts', 'isEnvTruthy(process.env.DO_NOT_TRACK)'),
    ],
    sourcePathAbsences: [
      absent(['src/utils/shell/prefix.ts'], 'tengu_cork_m4q'),
      absent(['src/utils/plugins/hintRecommendation.ts'], 'tengu_lapis_finch'),
    ],
    rationale: 'Two authenticated target absences and one literal-true gate prove the released paths are unconditional while DO_NOT_TRACK remains fail-closed.',
    focusedTests: ['removed-gates'],
  },
  {
    id: 'R02',
    category: 'residual',
    title: 'Subscription upsells honor both target suppression gates',
    targetFragments: ['tengu_idle_amber_finch', 'tengu_quiet_slate_wren'],
    sourceAssertions: [
      sr('src/utils/subscriptionUpsell.ts', 'tengu_idle_amber_finch'),
      sr('src/services/rateLimitMessages.ts', '!isUpgradeSuppressed()'),
      sr('src/components/messages/RateLimitMessage.tsx', 'serverHidesUpgrade || upgradeSuppressed'),
      sr('src/commands/upgrade/index.ts', '!isUpgradeSuppressed()'),
      sr('src/commands/pro-trial-expired/pro-trial-expired.tsx', '!isUpgradeSuppressed()'),
      sr('src/hooks/notifs/useCanSwitchToExistingSubscription.tsx', '!isProSwitchSuppressed()'),
    ],
    rationale: 'Both target-only rollout keys gate every recovered upgrade and plan-switch surface.',
    focusedTests: ['subscription-upsell-gates'],
  },
  {
    id: 'R03',
    category: 'residual',
    title: 'Runtime hardening for malformed permissions, worktrees, rewind, relaunch, help, and frame links',
    targetFragments: ['malformed updatedPermissions ignored', 'path traversal or absolute path', 'auto_restore_cancel', 'jump_to_message', 'flush timeout (relaunch)', 'stdout is not a TTY', 'frame-link'],
    sourceAssertions: [
      sr('src/utils/queryHelpers.ts', 'malformed updatedPermissions ignored'),
      sr('src/utils/worktree.ts', 'path traversal or absolute path'),
      sr('src/screens/REPL.tsx', "lastUserMsg, 'auto_restore_cancel'"),
      sr('src/utils/relaunch.ts', 'flush timeout (relaunch)'),
      sr('src/main.tsx', 'stdout is not a TTY'),
      sr('src/types/logs.ts', "type: 'frame-link'"),
      sr('src/utils/sessionStorage.ts', "entry.type === 'frame-link'"),
    ],
    rationale: 'Seven target-only diagnostics/markers bind the finite runtime-hardening set at exact source boundaries.',
    focusedTests: ['runtime-hardening'],
  },
].map(row => ({ ...row, sourcePathAbsences: row.sourcePathAbsences ?? [] }))

const dedupe = (values, key) => [
  ...new Map(values.map(value => [key(value), value])).values(),
]
for (const row of [...officialRows, ...hiddenRows, ...daemonRows, ...residualRows]) {
  row.targetFragments = [...new Set(row.targetFragments)]
  row.sourceAssertions = dedupe(
    row.sourceAssertions,
    value => `${value.path}\0${value.fragment}`,
  )
  row.sourcePathAbsences = dedupe(
    row.sourcePathAbsences ?? [],
    value => `${value.paths.join('\0')}\0${value.fragment}`,
  )
  row.focusedTests = [...new Set(row.focusedTests)].sort()
}

const output = {
  schemaVersion: 1,
  case: '2.1.120-to-2.1.121',
  release: '2.1.121',
  complete: final,
  rows: [...officialRows, ...hiddenRows, ...daemonRows, ...residualRows],
}
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
console.log(
  JSON.stringify({
    status: '2.1.121-direct-specs-built',
    rows: output.rows.length,
    official: officialRows.length,
    hidden: hiddenRows.length,
    daemon: daemonRows.length,
    residual: residualRows.length,
    complete: output.complete,
  }),
)
