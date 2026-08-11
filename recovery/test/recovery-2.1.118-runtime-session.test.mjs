import test from 'node:test'
import {
  assertAuthenticatedFragments,
  assertSourceFragments,
  assertTargetRemoval,
} from './recovery-2.1.118-test-helpers.mjs'

const FRAGMENTS = [
  [
    'bridge reattach diagnostic',
    'bridge_repl_v2_session_reattached',
    0,
    1,
    'c01ee562c2c1129e4d3855c09501502daed7595323e0c64dab3dcb272785889d',
  ],
  [
    'bridge reattach environment',
    'CLAUDE_BRIDGE_REATTACH_SESSION',
    0,
    4,
    '4bee7865ac3c176771c3a81cd924933b580e607925b02571dcbafb00b68011d8',
  ],
  [
    'bridge skip-archive teardown',
    'Teardown complete (skipArchive)',
    0,
    1,
    '3338a715da5cdbc7f29f48b681da56cedfd9cfec45af9e47e41e5e86cf1ddaaa',
  ],
  [
    'cache diagnosis beta',
    'cache-diagnosis-2026-04-07',
    0,
    1,
    '9a35b7fa4401e61a4b40264ddf33cff2515f4a4a8fe32888d090ba18a8342268',
  ],
  [
    'async-agent completion stall log',
    '[Stall] agent_completion',
    0,
    1,
    'bf6d8071759cf2cca41ce39c701eae78cec8489aabea886ddc8b8fdac15a07ea',
  ],
  [
    'remote session-cost control',
    'get_session_cost',
    0,
    3,
    'e74ef6c73f8ef036da98a38b312bb118b2b08e4ef3b54617949111d73914ad9d',
  ],
  [
    'individual policy-limit gate',
    'tengu_slate_kestrel',
    0,
    1,
    'c33eb693c376f4d6d0b807cc67d5994a6106c170364b57eb46fa25a69d2af69b',
  ],
  [
    'MCP proxy semantic error header',
    'X-Mcp-Error-Code',
    0,
    1,
    '91181a490cbe0d63af5284349930a1eb1d01c90cdab81225a7f0fc87cc7faebb',
  ],
  [
    'warm resume hint eligibility',
    'tengu_warm_resume_hint_eligible',
    0,
    1,
    '0d1bd4ed91b6ffc3bc2a9e7cb768ad173fe5d8b6c07be6669f085edc51cde1ef',
  ],
  [
    'fork context pointer entries',
    'fork-context-ref',
    0,
    6,
    '0b83d1f084c483b0620093b07d335dc8354802b51f783887cce59ab45292434b',
  ],
  [
    'cron creator process-start token',
    'createdByProcStart',
    0,
    6,
    '704278405df483b8daa1c12ff099d6c67df5f4a240e833e9776ce5eb204e6862',
  ],
  [
    'third-party probe deadline logging',
    '[3p-probe] ',
    1,
    1,
    '7dd885d8f087b3fdd344cead12da14a3e1d36bb2175a29f4714c0b83d9a4211f',
  ],
  [
    'third-party upgrade dialog',
    'Currently pinned:',
    1,
    1,
    'f26fcb3d67a375a38074b7070ab00dee3c6a08dc483f5f139e125a505196fe18',
  ],
  [
    'session cron background kind',
    'session_cron',
    0,
    1,
    'cfb264f7ec6fd5697fd965bcd380f0f1f23e7c647a3f3b8c8982e49bad7d9a62',
  ],
  [
    'daemon pipe key',
    'pipe.key',
    0,
    1,
    'f7fd02ae06953f5d732feddeae123857ed97b127fcbde5033316ce70b488e7a1',
  ],
  [
    'daemon stale-worker respawn operation',
    'respawn-stale',
    0,
    1,
    'f8db28b0895003945376d5993815111d2a92d5692bd8b0cd0c753e0c4c01696d',
  ],
  [
    'transcript mirror frames',
    'transcript_mirror',
    6,
    6,
    '588661104e955c488e5d93f33ae54c0580ef2731dc8f4cdb0cf25af2d499c358',
  ],
  [
    'session mirror propagation',
    'sessionMirror',
    7,
    7,
    '137c20d134b39e74e8ca1c6c02da4747fc3f38ebed722e8d9e66158ca20f05da',
  ],
  [
    'session mirror CLI option',
    '--session-mirror',
    1,
    1,
    '0143b95d7f80a10969f9a86a5b20668d2586ff8ab25e8b921e58e821e3f478d1',
  ],
  [
    'thinking display CLI option',
    '--thinking-display',
    1,
    1,
    '7cdc122ff5262c5ac9e2f4f778bac867fc0d972f0be36011df7179a671c0cf8e',
  ],
  [
    'thinking display propagation',
    'thinkingDisplay',
    3,
    3,
    'eb55c89ec9a6f35c4bd7d3a6c34a28a4497c77b24327e63d048d7abd58a0aada',
  ],
  [
    'thinking summaries setting',
    'showThinkingSummaries',
    3,
    3,
    'a37018a9ee4534af4dd57e764cbda800855d58016ad5e11efffae918344d2a8f',
  ],
  [
    'cache-diagnosis telemetry',
    'tengu_prompt_cache_diagnostics',
    0,
    1,
    '5b59fdae862a3210bfc4e17d96682ba4dcbeecca5a2227333696c3fd8f4fa73a',
  ],
  [
    'cache-diagnosis toggle transition',
    'cache diagnosis toggled',
    0,
    1,
    '2ee67fbf8a73eb9ea79ec88c8bda6743b0a277e75ac45fd1cdd61bbc3c7e8756',
  ],
  [
    'managed-agents overview contract',
    'Managed Agents provisions a container per session as the agent',
    1,
    1,
    '3c158070c7f0ff916e6e563395038a26e60012ba4f38c157747e7aaa5b7b3d1e',
  ],
  [
    'autofix PR command description',
    'Monitor and autofix any issues with the current PR',
    0,
    2,
    'f39025e988fce82f330acb9744b20684fa6863ad316a586e28a215007266b4e9',
  ],
  [
    'pro-trial ended copy',
    'Your Claude Code trial has ended.',
    0,
    1,
    'f5ae37ff8991e2e0934547e8833741974eabbb50e5f06d53d2ad9ac5fbf62b10',
  ],
  [
    'pro-trial choice telemetry',
    'tengu_pro_trial_expired_choice',
    0,
    1,
    '00b8f7d41e12b7a664042f05cf1843106abbed9fe355c739b5518589118a38e2',
  ],
  [
    'fresh-time schedule permission',
    'Bash(date *)',
    0,
    1,
    'd4817c540b6840b02d450298df184c156f912d94c714e31750ca42e45cf0c50a',
  ],
  [
    'push idle-upsell telemetry',
    'tengu_push_notif_upsell_notification_shown',
    0,
    1,
    '70375c18abc8aa0012c02e4fbe5499fa5756c5e2959cdf6b14de690ddbd53124',
  ],
  [
    'push idle-upsell copy',
    'get pinged when Claude finishes',
    0,
    1,
    '179e62dee7955ea3f59b6f0cacd3e3cf3c2381cc676ef9be5617ca43eff5250c',
  ],
  [
    'monitor live-notification contract',
    'stream events from a background script as live notifications',
    1,
    1,
    'a22632b340da29749de60a8a51563e0b5293434e390a501c4d0e86047b99ec9d',
  ],
  [
    'REPL context contract',
    'setReplContext',
    10,
    10,
    '569ecc378d548e1f26350e15e5cbff889641c5f784f323a35e01c16ba789ccbd',
  ],
  [
    'fork command contract',
    '/fork',
    1,
    1,
    '6e737de1396ec8b6829f6df6ac485f8438df86f8c79bbe41b7db07ffe996badb',
  ],
  [
    'daemon in-flight job field',
    'inFlight',
    0,
    1,
    '78b5a409d614e817e782fbc7cda44607068c32e107caed46ddead552633293b5',
  ],
  [
    'tiny-memory immutable contract',
    'tiny memory mode',
    1,
    1,
    '346b18f39d757bd689202ccc64ffa73c0cd599813e3736f4382aa90950ca9ceb',
  ],
  [
    'PowerShell memory deletion guidance',
    'PowerShell Remove-Item',
    0,
    1,
    'b145613351b137b6d50043456ada32312df65bb5fa8b8d6efe5a3fcfc8675f47',
  ],
  [
    'PowerShell memory read guidance',
    'Get-ChildItem, Get-Content',
    0,
    1,
    '31dee7f347d2bd1d07da7b10887a8db16338e97e26e2f190443d7d0ac750d191',
  ],
  [
    'push-notification tip copy',
    'Get pinged on your phone when long tasks finish',
    0,
    1,
    '71b2c38fd5f7102c4382eeb2988b01c41490e1055739c0e04d45ec783c26a7b7',
  ],
  [
    'Homebrew latest-cask copy',
    'Tip: For more frequent updates, use the claude-code@latest cask:',
    0,
    1,
    '7283ca1f1b99d386d279fdd6c17909591b1b080d79597a9732865b65cb0dbb05',
  ],
  [
    'CCR broadcast removal',
    'broadcast (to: "*") is no longer supported',
    0,
    1,
    '07e3b7ea7ae25284b0cf8598baee2c386c8a996bbfae5760b59e026ded4f4bda',
  ],
  [
    'missing-agent routing failure',
    'No agent named',
    0,
    1,
    '3257900cd222234444f77308d4e1b2e03d1afca4399d2c9ff975d30a0ae32b78',
  ],
  [
    'tmux control-mode renderer classifier',
    'tmux_cc_auto_off',
    0,
    1,
    '91d1529a489cd4300232681f0e3a48fd89839f51b6b484bf439459a9612a83cc',
  ],
  [
    'tmux focus-events hint',
    'tmux focus-events off \\xB7 add',
    1,
    1,
    'cf2c951c497e654a05d35c4937c38846551183db283c2ba3a449c31a4dbe4da4',
  ],
  [
    'persisted-agent resume count',
    'resumePersistedCount',
    0,
    2,
    '9fe8a0bec22deaefae5982bfd084df55417955082ab5a5c3871654824f87f8e0',
  ],
  [
    'usage command session-cost copy',
    'Show session cost',
    0,
    1,
    'f29c548189cfdcc73ac23d41381a64b058554e68fb5d70815fc40281620a74f9',
  ],
  [
    'usage cost and stats aliases',
    'name:"usage",aliases:["cost","stats"]',
    0,
    2,
    'e07e6b48a402bc4226f0502ba33db8c5ce92a7d9905d8a62fdc22be988566c74',
  ],
  [
    'usage stats-tab dispatch',
    '==="stats"?"Stats":"Usage"',
    0,
    1,
    '945b46d80674e17da3c3e70c0a80590f0020dbc1f6be8ee07e760754455d58d4',
  ],
  [
    'additional session directories contract',
    'additionalDirectories',
    15,
    15,
    '568e92fd16b01199d2f633899c72a3b814e7955f7cce738af4c4588660180f42',
  ],
  [
    'remote init model-preservation contract',
    '[useRemoteSession] Init received with ',
    1,
    1,
    '078aa6ba0af5f511394d98289a030b4d9eff0c16cfde170711fb7f23804dd205',
  ],
  [
    'remote session model propagation',
    'environment_variables:U,...H.model&&{model:H.model}',
    0,
    1,
    '711314622e8785872099118a668c3b38009d345612233a43ac4573eb40f1f805',
  ],
  [
    'SessionsV2 client surface',
    'SessionsV2Client',
    0,
    22,
    '32f253b184a2537671fb21f4683442a1c3a8aea0127f11a58f4f50553ff7776e',
  ],
  [
    'team-artifacts tip contract',
    'team-artifacts',
    1,
    1,
    'ffecc22717b632fc610bc712ee3fcd827a0dea199e75ecc9e59c26c4b12ca9c1',
  ],
  [
    'teleport metadata failure envelope',
    'metadataFetchError',
    0,
    2,
    'f828f2e292d4637ee340d2757800d3d48e782de806d419080c1f15e2bbf080f8',
  ],
  [
    'classifier policy-refusal mode',
    'policy_refusal',
    0,
    5,
    'e54e0c8c5bc2e9a4a0e23bd5e8756f70056724c8f72f40e7ec94a6d3380ec3f9',
  ],
  [
    'ultrareview remote-launch contract',
    'ultrareview',
    45,
    45,
    '058c2a4acf9b7ac3c7ce63e097f6cbb78c973afdc752ff69f0f9ba6bca535b29',
  ],
]

test('runtime and session fragments are authenticated', () => {
  assertAuthenticatedFragments(FRAGMENTS)
})

test('recovers SessionsV2 streaming and optimistic-message reconciliation', () => {
  assertSourceFragments('src/remote/SessionsWebSocket.ts', [
    '[SessionsV2Client]',
    'text/event-stream',
    'from_sequence_num',
    'Last-Event-ID',
    "case 'client_event'",
    "case 'ephemeral_event'",
    'MAX_RECONNECT_ATTEMPTS = 5',
    'LIVENESS_TIMEOUT_MS = 45000',
  ])
  assertSourceFragments('src/remote/RemoteSessionManager.ts', [
    'Reconnecting SSE stream',
    'this.client',
  ])
  assertSourceFragments('src/hooks/useRemoteSession.ts', [
    'Reconciled echoed user message ${uuid} to canonical position',
    "subtype: 'set_permission_mode'",
  ])
  assertTargetRemoval('src/hooks/useRemoteSession.ts', 'updateSettingsForSource')
  assertSourceFragments('src/commands/usage/index.ts', [
    'Show session cost, plan usage, and activity stats',
    "aliases: ['cost', 'stats']",
  ])
  assertSourceFragments('src/commands/usage/usage.tsx', [
    "commandName === 'stats' ? 'Stats' : 'Usage'",
  ])
})

test('recovers bridge reconnect, update reattach, controls, and CCR logging', () => {
  assertSourceFragments('src/bridge/remoteBridgeCore.ts', [
    "init_4091_recovery",
    'transportRecoveryAttempts',
    'bridge_repl_v2_session_reattached',
    'Teardown complete (skipArchive)',
    'getLastSequenceNum',
  ])
  assertSourceFragments('src/commands/update/update.ts', [
    'CLAUDE_BRIDGE_REATTACH_SESSION',
    'CLAUDE_BRIDGE_REATTACH_SEQ',
    'skipArchive: true',
  ])
  assertSourceFragments('src/utils/relaunch.ts', [
    'delete childEnv.CLAUDE_BRIDGE_REATTACH_SESSION',
    'delete childEnv.CLAUDE_BRIDGE_REATTACH_SEQ',
  ])
  assertSourceFragments('src/entrypoints/sdk/controlSchemas.ts', [
    "z.literal('get_session_cost')",
    "z.literal('set_color')",
  ])
  assertSourceFragments('src/cli/print.ts', [
    "request.subtype === 'get_session_cost'",
  ])
  assertSourceFragments('src/hooks/useLogMessages.ts', [
    "getRuntimeCapabilities().remote?.kind === 'ccr'",
  ])
  assertSourceFragments('src/commands/autofix-pr/command.ts', [
    'Monitor and autofix any issues with the current PR',
  ])
  assertSourceFragments('src/commands/autofix-pr/autofix-pr.tsx', [
    'Monitor and autofix any issues with the current PR',
    'autofix-pr: monitoring',
  ])
  assertSourceFragments('src/bridge/sessionSubscriptions.ts', [
    'updatePullRequestSubscription',
  ])
  assertSourceFragments('src/utils/fullscreen.ts', [
    'tmux_cc_auto_off',
    "tmux focus-events off · add 'set -g focus-events on'",
  ])
  assertSourceFragments('src/utils/teleport.tsx', [
    'metadataFetchError',
    'fetchSession failed 10 times in a row',
    '...(options.model && { model: options.model })',
  ])
  assertSourceFragments('src/bridge/bridgeMessaging.ts', [
    'set_color',
  ])
})

test('recovers cache diagnosis, WIF, policy, and MCP auth boundaries', () => {
  assertSourceFragments('src/constants/betas.ts', [
    "CACHE_DIAGNOSIS_BETA_HEADER = 'cache-diagnosis-2026-04-07'",
  ])
  assertSourceFragments('src/services/api/claude.ts', [
    'tengu_prompt_cache_diagnostics',
    'retry:cache-diagnosis-beta',
    'previous_message_id',
  ])
  assertSourceFragments('src/services/api/promptCacheBreakDetection.ts', [
    'cache diagnosis toggled',
  ])
  assertSourceFragments('src/services/api/workloadIdentity.ts', [
    'withCredentialsLock',
    'profile-explicit',
    'profile-implicit',
    'Could not acquire credentials lock',
    'MAX_TOKEN_RESPONSE_BYTES = 1024 * 1024',
  ])
  assertSourceFragments('src/services/policyLimits/index.ts', [
    "getFeatureValue_CACHED_MAY_BE_STALE('tengu_slate_kestrel', false)",
    'tokens.subscriptionType === null',
  ])
  assertSourceFragments('src/utils/permissions/yoloClassifier.ts', [
    "type ClassifierFailureMode = 'policy_refusal' | 'unparseable'",
  ])
  assertSourceFragments('src/services/mcp/client.ts', [
    "response.headers.get('X-Mcp-Error-Code')",
    'tengu_mcp_claudeai_proxy_401',
  ])
  assertSourceFragments('src/services/mcp/auth.ts', [
    'trackMCPOAuthFlow',
    '.finally(() =>',
    '.catch(() => {})',
  ])
})

test('recovers REPL hydration, fork pointers, agent liveness, and PID reuse', () => {
  assertSourceFragments('src/tools/REPLTool/REPLTool.tsx', [
    'REPL_TOOL_NAME',
    'replayLog',
    'setReplContext',
  ])
  assertSourceFragments('src/commands/fork/fork.ts', [
    "kind: 'fork'",
    'extractReplReplayEntries',
    'forkContextMessages: context.messages',
    'enableSummarization: false',
  ])
  assertSourceFragments('src/types/logs.ts', [
    "type: 'fork-context-ref'",
    'parentLastUuid',
  ])
  assertSourceFragments('src/utils/sessionStorage.ts', [
    'resolveForkContextRef',
    'forkContextRefs',
    'getSessionAliases',
  ])
  assertSourceFragments('src/QueryEngine.ts', [
    'setReplContext: makeSetReplContext(setAppState)',
  ])
  assertSourceFragments('src/tools/AgentTool/resumeAgent.ts', [
    'resumePersistedCount: resumedMessages.length',
    'resumedCwd',
  ])
  assertSourceFragments('src/tools/AgentTool/agentToolUtils.ts', [
    '[Stall] agent_completion',
    "exitPath: 'watchdog_stall'",
    'onQueryProgress',
  ])
  assertSourceFragments('src/utils/genericProcessUtils.ts', [
    'getCurrentProcessStartToken',
    'processStartTokenMatches',
    "/proc/${pid}/stat",
    "ps -o lstart= -p",
  ])
  assertSourceFragments('src/utils/cronTasksLock.ts', [
    'procStart',
    'getCurrentProcessStartToken',
    'processStartTokenMatches',
  ])
})

test('recovers third-party model upgrades and session-cron background state', () => {
  assertSourceFragments('src/components/ThirdPartyModelUpgradeDialog.tsx', [
    'Newer ${tierLabel} model available',
    'Currently pinned:',
    'defaultFocusValue="confirm"',
  ])
  assertSourceFragments('src/interactiveHelpers.tsx', [
    'await handleBedrockModelUpgrades(root)',
    'await handleBedrockDefaultFallbacks(root)',
    'await handleVertexModelUpgrades(root)',
    'await handleVertexDefaultFallbacks(root)',
    '[3p-probe] ${probeLabel} hit',
  ])
  assertSourceFragments('src/utils/model/bedrockUpgrade.ts', [
    'timeout: 8_000',
    'findBedrockUpgradeCandidates',
    'checkBedrockDefaultAvailability',
  ])
  assertSourceFragments('src/utils/model/vertexUpgrade.ts', [
    'timeout: 8_000',
    'findVertexUpgradeCandidates',
    'checkVertexDefaultAvailability',
  ])
  assertSourceFragments('src/utils/config.ts', [
    'bedrockDeclinedUpgrades',
    'vertexDeclinedUpgrades',
  ])
  assertSourceFragments('src/utils/sessionCronTasks.ts', [
    'getSessionBackgroundExitItems',
    'Runs once in ${formatDuration(',
    "label: 'scheduled task'",
  ])
  assertSourceFragments('src/tasks/pillLabel.ts', [
    'getBackgroundTaskSummary',
    "kinds.push('session_cron')",
  ])
  assertSourceFragments('src/components/BackgroundExitDialog.tsx', [
    'tengu_exit_background_work_prompt',
    'Background work is running',
    'Exit anyway',
  ])
  assertSourceFragments('src/screens/REPL.tsx', [
    'setBackgroundWorkState({',
    'backgroundTaskSummary.kinds',
    'getSessionBackgroundExitItems()',
  ])
  assertSourceFragments('src/daemon/jobs.ts', [
    'inFlight:',
    'cliVersion: z.string().optional()',
  ])
  assertSourceFragments('src/daemon/paths.ts', [
    "join(getDaemonDir(), 'pipe.key')",
    "randomBytes(8).toString('hex')",
    "flag: 'wx'",
  ])
  assertSourceFragments('src/daemon/protocol.ts', [
    "op: z.literal('respawn-stale')",
    'cliVersion: z.string().optional()',
  ])
  assertSourceFragments('src/skills/bundled/scheduleRemoteAgents.ts', [
    'Bash(date *)',
  ])
  assertSourceFragments(
    'src/skills/bundled/claude-api/shared/managed-agents-overview.md',
    ['Managed Agents provisions a container per session as the agent'],
  )
  assertSourceFragments('src/skills/bundled/claudeApiContent.ts', [
    'managed-agents-overview.md',
  ])
  assertSourceFragments('src/services/tips/tipRegistry.ts', [
    "id: 'team-artifacts'",
  ])
})

test('recovers memory, messaging, remote plan, and warm-resume safety', () => {
  assertSourceFragments('src/tools/SendMessageTool/SendMessageTool.ts', [
    'broadcast (to: "*") is no longer supported',
    'to must be a bare teammate name',
    'No agent named',
  ])
  assertTargetRemoval('src/tools/SendMessageTool/prompt.ts', 'Broadcast')
  assertSourceFragments('src/commands/plan/plan.tsx', [
    "remote?.kind === 'ccr'",
    "subtype: 'set_permission_mode'",
    "mode: 'plan'",
  ])
  assertSourceFragments('src/components/WarmResumeHint.tsx', [
    'getRecentActivitySync',
    'getRecentActivity',
    'tengu_warm_resume_hint_eligible',
    '/resume to continue',
  ])
  assertSourceFragments('src/services/extractMemories/extractMemories.ts', [
    'tiny memory mode',
    'PowerShell Remove-Item',
    'Get-ChildItem, Get-Content',
  ])
  assertSourceFragments('src/hooks/useRemoteControlIdleUpsell.tsx', [
    'tengu_push_notif_upsell_notification_shown',
    'get pinged when Claude finishes',
  ])
  assertSourceFragments('src/services/tips/tipRegistry.ts', [
    'Get pinged on your phone when long tasks finish',
  ])
  assertSourceFragments('src/cli/update.ts', [
    'Tip: For more frequent updates, use the claude-code@latest cask:',
  ])
  assertSourceFragments('src/commands/pro-trial-expired/pro-trial-expired.tsx', [
    'Your Claude Code trial has ended.',
    'tengu_pro_trial_expired_choice',
  ])
  assertSourceFragments('src/commands/review/reviewRemote.ts', [
    'checkRemoteAgentEligibility({ allowBundle: true })',
  ])
  assertSourceFragments('src/utils/permissions/filesystem.ts', [
    'memory access blocked by /toggle-memory',
    'Cannot write to memory while it is toggled off',
    'Cannot read memory while it is toggled off',
  ])
})

test('recovers transcript mirroring and thinking-display semantics', () => {
  assertSourceFragments('src/main.tsx', [
    '--session-mirror',
    '--thinking-display <display>',
    "thinkingConfig.display = options.thinkingDisplay",
    "getInitialSettings().showThinkingSummaries === true",
    'sessionMirror,',
  ])
  assertSourceFragments('src/utils/thinking.ts', [
    "display?: 'summarized' | 'omitted'",
  ])
  assertSourceFragments('src/entrypoints/sdk/coreSchemas.ts', [
    "type: z.literal('transcript_mirror')",
    "subtype: z.literal('mirror_error')",
    'SDKMirrorErrorMessageSchema()',
  ])
  assertSourceFragments('src/entrypoints/sdk/controlSchemas.ts', [
    'SDKTranscriptMirrorMessageSchema()',
  ])
  assertSourceFragments('src/utils/sessionStorage.ts', [
    'registerSessionMirror',
    '[SessionMirror] mirror failed for ${filePath}: ${error}',
    'this.fireMirror(filePath, mirrorEntries.slice())',
    'fireSessionMirror(fullPath, [entry])',
  ])
  assertSourceFragments('src/cli/print.ts', [
    "options.outputFormat === 'stream-json' && options.sessionMirror",
    "type: 'transcript_mirror'",
    'await flushSessionStorage()',
    "message.type !== 'transcript_mirror'",
    "message.subtype === 'task_updated'",
    "message.subtype === 'notification'",
  ])
  assertSourceFragments('src/cli/remoteIO.ts', [
    "if (message.type === 'transcript_mirror') return",
  ])
  assertSourceFragments('src/remote/RemoteSessionManager.ts', [
    "message.type !== 'keep_alive'",
    "message.type !== 'transcript_mirror'",
    "message.subtype === 'post_turn_summary'",
  ])
})

test('recovers monitor streaming and async-agent keepalive semantics', () => {
  assertSourceFragments('src/tools/MonitorTool/MonitorTool.tsx', [
    'const MAX_TIMEOUT_MS = 3_600_000',
    'const DEFAULT_TIMEOUT_MS = 300_000',
    '`monitor:${handle.taskId}`',
    'addAgentKeepaliveReason(',
    'removeAgentKeepaliveReason(',
  ])
  assertSourceFragments('src/tools/MonitorTool/stream.ts', [
    'TOKEN_BUCKET_CAPACITY = 10',
    'SUSTAINED_SUPPRESSION_MS = 30_000',
    'MAX_LINE_CHARS = 500',
    'BATCH_FLUSH_MS = 200',
    'MAX_PARTIAL_BUFFER_CHARS = 1_048_576',
  ])
  assertSourceFragments('src/tasks/LocalAgentTask/LocalAgentTask.tsx', [
    'keepaliveReasons?: Set<string>',
    'export function hasAgentKeepalive(',
    'computeEvictAfter(task, { park: true })',
  ])
  assertSourceFragments('src/tools/AgentTool/runAgent.ts', [
    'const preserveMonitorTasks =',
    'hasAgentKeepalive(agentId, toolUseContext.getAppState)',
    '{ skipMonitors: preserveMonitorTasks }',
  ])
  assertSourceFragments('src/tasks/LocalShellTask/killShellTasks.ts', [
    'options?: { skipMonitors?: boolean }',
    "!(options?.skipMonitors && task.kind === 'monitor')",
  ])
  assertSourceFragments('src/utils/task/framework.ts', [
    'keepaliveReasons: existing.keepaliveReasons',
    'skip_transcript: (task as TaskState & { skipTranscript?: boolean })',
  ])
})
