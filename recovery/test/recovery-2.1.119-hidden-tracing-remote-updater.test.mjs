import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const BASELINE_BYTES = 13_234_618
const BASELINE_SHA256 =
  '84d06c8582112ca623b66cc28b3a55c5d57e9add86d7a1b1163d6a12a31a9ffa'
const TARGET_BYTES = 13_720_987
const TARGET_SHA256 =
  '9a1fccbe69ffe06c82345db1cc8cdbbc9a9929ed723bc8832ad48dfeff64b4ef'
const repo = fileURLToPath(new URL('../..', import.meta.url))

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function loadBundle(environmentName, expectedBytes, expectedSha256) {
  const filename = process.env[environmentName]
  assert.ok(filename, environmentName + ' must be set')
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, expectedBytes, environmentName + ': byte length')
  assert.equal(sha256(bytes), expectedSha256, environmentName + ': SHA-256')
  return bytes.toString('utf8')
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

function compact(value) {
  return value.replaceAll(/\s+/g, ' ').trim()
}

function readSource(sourcePath) {
  return fs.readFileSync(path.join(repo, sourcePath), 'utf8')
}

function assertSourceFragments(sourcePath, fragments) {
  const contents = compact(readSource(sourcePath))
  for (const fragment of fragments) {
    assert.equal(
      contents.includes(compact(fragment)),
      true,
      sourcePath + ': ' + fragment,
    )
  }
}

const BUNDLE_FRAGMENTS = [
  ['LLM attempt span event', 'gen_ai.request.attempt', 1, 1],
  ['trusted-device policy', 'require_trusted_devices', 1, 1],
  ['trusted-device header', 'X-Trusted-Device-Token', 3, 3],
  ['teleport forbidden diagnostic', 'teleport_events_forbidden', 1, 1],
  [
    'teleport trusted-device recovery',
    'This session requires a trusted device. Run /login to enroll this device, then retry.',
    2,
    2,
  ],
  [
    'outbound mirror policy',
    'Skipping mirror: allow_remote_sessions policy not allowed',
    1,
    1,
  ],
  ['repo checkout map', 'CLAUDE_CODE_REPO_CHECKOUTS', 1, 1],
  ['repo base-ref map', 'CLAUDE_CODE_BASE_REFS', 1, 1],
  ['remote branch metadata', 'current_branches', 3, 3],
  ['remote requesting event', 'stream_request_start', 8, 8],
  ['remote review-ready summary', 'Ready for review', 0, 2],
  ['post-turn summary', 'post_turn_summary', 4, 9],
  ['minimum-version protection', 'minimumVersion setting', 2, 2],
  [
    'deferred daemon restart',
    'Claude daemon will restart for the upgrade once background jobs finish',
    2,
    2,
  ],
  [
    'notification preferences API',
    '/api/claude_code/notification/preferences',
    1,
    1,
  ],
  ['push-notification telemetry', 'tengu_push_notification_send', 1, 1],
  ['push no-transport result', 'no_transport', 0, 5],
  [
    'monitor guidance',
    'Start a background monitor that streams events from a long-running script.',
    1,
    1,
  ],
  ['ambient memory update', 'memory_update', 0, 4],
  [
    'memory reconciliation',
    'Reconcile memories against CLAUDE.md',
    0,
    1,
  ],
  ['editor signal result', 'closed unexpectedly (', 0, 1],
  ['editor exit-code result', 'quit unexpectedly (exit code ', 0, 1],
  ['remote model control', 'subtype:"set_model"', 0, 2],
  ['ambient task transcript flag', 'skip_transcript', 4, 4],
  ['auto-compact command hint', 'use /autocompact to configure', 0, 1],
  ['background MCP approval attachment', 'attach to respond', 0, 1],
  ['background wake-router timeout', '[wakeRouter] dispatch for ', 0, 1],
  [
    'background agents command description',
    'Manage background and configured agents',
    0,
    1,
  ],
  [
    'merged usage command aliases',
    'name:"usage",aliases:["cost","stats"]',
    2,
    2,
  ],
  [
    'SDK rewritten-input permission recheck',
    'ask rule on hook-rewritten input',
    2,
    2,
  ],
  [
    'model capability output-token cap',
    'if(_?.max_tokens&&_.max_tokens>=4096)q=_.max_tokens,$=Math.min($,q);return{default:$,upperLimit:q}',
    1,
    1,
  ],
]

const MANAGED_MEMORY_SEMANTIC_EVIDENCE = [
  [
    [
      '# Managed Agents \\u2014 Memory Stores',
      0,
      1,
      '5c01dce3f06914f5db39614424bcb6e581cdd57736c4ca60a443ab9cd4f241b5',
    ],
    [
      'Memory stores ship under the `managed-agents-2026-04-01` beta header',
      0,
      1,
      'c3b0e4c719349b69fdf88f9040ed9fec9f087d3906b76ab2cde0bd5a2a87c2b3',
    ],
  ],
  [
    [
      'src/skills/bundled/claude-api/shared/managed-agents-memory.md',
      '# Managed Agents — Memory Stores',
      1,
      'ea640932a96cc6f769c20138bd147687e5943bd7d1d7a5b9c16f66c2e75330e9',
    ],
    [
      'src/skills/bundled/claude-api/shared/managed-agents-memory.md',
      'Memory stores ship under the `managed-agents-2026-04-01` beta header',
      1,
      'c3b0e4c719349b69fdf88f9040ed9fec9f087d3906b76ab2cde0bd5a2a87c2b3',
    ],
    [
      'src/skills/bundled/claudeApiContent.ts',
      'managed-agents-memory.md',
      2,
      '023535d481724db1d29bf8e6e83252fc32ad655eb6cc654d5a58cc82859b99c5',
    ],
  ],
]

test('hidden, tracing, remote, and updater witnesses use authenticated bundles', () => {
  const baseline = loadBundle(
    'CLAUDE_CODE_2_1_118_BUNDLE',
    BASELINE_BYTES,
    BASELINE_SHA256,
  )
  const target = loadBundle(
    'CLAUDE_CODE_2_1_119_BUNDLE',
    TARGET_BYTES,
    TARGET_SHA256,
  )

  for (const [name, fragment, baselineCount, targetCount] of BUNDLE_FRAGMENTS) {
    assert.equal(
      occurrences(baseline, fragment),
      baselineCount,
      name + ': baseline count',
    )
    assert.equal(
      occurrences(target, fragment),
      targetCount,
      name + ': target count',
    )
  }
})

test('managed-agent memory witnesses bind the exact bundle and source bytes', () => {
  const baseline = loadBundle(
    'CLAUDE_CODE_2_1_118_BUNDLE',
    BASELINE_BYTES,
    BASELINE_SHA256,
  )
  const target = loadBundle(
    'CLAUDE_CODE_2_1_119_BUNDLE',
    TARGET_BYTES,
    TARGET_SHA256,
  )
  const [targetEvidence, sourceEvidence] = MANAGED_MEMORY_SEMANTIC_EVIDENCE
  for (const [fragment, baselineCount, targetCount, fragmentSha256] of
    targetEvidence) {
    assert.equal(sha256(fragment), fragmentSha256, fragment)
    assert.equal(occurrences(baseline, fragment), baselineCount, fragment)
    assert.equal(occurrences(target, fragment), targetCount, fragment)
  }
  for (const [sourcePath, fragment, count, fragmentSha256] of sourceEvidence) {
    assert.equal(sha256(fragment), fragmentSha256, sourcePath + ': ' + fragment)
    assert.equal(
      occurrences(readSource(sourcePath), fragment),
      count,
      sourcePath + ': ' + fragment,
    )
  }
})

test('recovers tracing attempts, request IDs, and streaming fallback boundaries', () => {
  assertSourceFragments('src/utils/telemetry/sessionTracing.ts', [
    "'gen_ai.system': 'anthropic'",
    "'gen_ai.request.model': model",
    "span.addEvent('gen_ai.request.attempt', attributes)",
    "emitPerfettoInstant('LLM Attempt', 'api,attempt', attributes)",
    "endAttributes['gen_ai.response.id'] = metadata.requestId",
    'code: SpanStatusCode.ERROR',
  ])
  assertSourceFragments('src/services/api/claude.ts', [
    "provider === 'firstParty' && isFirstPartyAnthropicBaseUrl()",
    "provider === 'anthropicAws' && !process.env.ANTHROPIC_AWS_BASE_URL",
    'recordLLMRequestAttempt(llmSpan, { attempt: attemptStartTimes.length, clientRequestId, })',
  ])
  assertSourceFragments('src/services/api/logging.ts', [
    'clientRequestId: didFallBackToNonStreaming ? undefined : clientRequestId',
  ])
})

test('recovers fail-closed trusted-device and teleport behavior', () => {
  assertSourceFragments('src/bridge/trustedDevice.ts', [
    "const TRUSTED_DEVICE_POLICY = 'require_trusted_devices'",
    'getFeatureValue_CACHED_MAY_BE_STALE(TRUSTED_DEVICE_GATE, false) && isPolicyAllowed(TRUSTED_DEVICE_POLICY)',
    'export function readStoredTrustedDeviceToken()',
    'await waitForPolicyLimitsToLoad()',
    'Org has not enabled ${TRUSTED_DEVICE_POLICY}, skipping enrollment',
  ])
  assertSourceFragments('src/services/api/sessionIngress.ts', [
    "headers['X-Trusted-Device-Token'] = trustedDeviceToken",
    "logForDiagnosticsNoPII('error', 'teleport_events_forbidden')",
    "data?.error?.resource === 'untrusted_device'",
    'This session requires a trusted device. Run /login to enroll this device, then retry.',
  ])
  assertSourceFragments('src/utils/teleport.tsx', [
    "if (feature('KAIROS'))",
    "await import('../bridge/trustedDevice.js')",
    'trustedDeviceToken = readStoredTrustedDeviceToken()',
    'if (error instanceof TeleportOperationError) { throw error; }',
    '${sessionId} not found.\\nRun /status in Claude Code to check your account.',
  ])
})

test('recovers remote policy, metadata, SDK status, and updater coordination', () => {
  assertSourceFragments('src/commands.ts', [
    'usage, // Show usage info (including the /cost and /stats aliases)',
    'usageNonInteractive, // Show usage and session cost',
  ])
  assert.equal(
    /\bcost,/.test(readSource('src/commands.ts')),
    false,
    'safe-command sets must not reference the removed cost command',
  )
  assertSourceFragments('src/cli/structuredIO.ts', [
    'executePermissionRequestHooksForSDK( tool: Tool,',
    'executePermissionRequestHooks( tool.name,',
    'await checkRuleBasedPermissions(tool, finalInput, toolUseContext)',
    'applyPermissionUpdates( prev.toolPermissionContext, permissionUpdates',
  ])
  assertSourceFragments('src/utils/context.ts', [
    "import { getModelCapability } from './model/modelCapabilities.js'",
    'const cap = getModelCapability(model)',
    'cap?.max_tokens && cap.max_tokens >= 4_096',
  ])
  assertSourceFragments('src/bridge/initReplBridge.ts', [
    "outboundOnly && !isPolicyAllowed('allow_remote_sessions')",
    '[bridge:repl] Skipping mirror: allow_remote_sessions policy not allowed',
  ])
  assertSourceFragments('src/bridge/remoteBridgeCore.ts', [
    'transport.reportMetadata({ pending_action: details })',
    'transport.reportMetadata({ pending_action: null })',
    'current_branches: { [repo]: currentBranch }',
    "'tengu_bridge_requires_action_details'",
    "request.request.tool_name === 'PowerShell'",
  ])
  assert.equal(
    occurrences(
      readSource('src/bridge/remoteBridgeCore.ts'),
      'reportMetadata(metadata) {',
    ),
    1,
    'remoteBridgeCore return has one reportMetadata member',
  )
  assert.equal(
    occurrences(readSource('src/bridge/replBridge.ts'), 'reportMetadata(metadata:'),
    1,
    'ReplBridgeHandle declares reportMetadata once',
  )
  assertSourceFragments('src/remote/sdkMessageAdapter.ts', [
    "msg.status === 'requesting'",
    "event: { type: 'stream_request_start' }",
    "review_ready: 'Ready for review'",
    "level: msg.status_category === 'blocked' ? 'warning' : 'info'",
    "msg.subtype === 'post_turn_summary'",
  ])
  assertSourceFragments('src/cli/update.ts', [
    "const displayChannel = channel === 'rc' ? 'slow' : channel",
    'Could not check for updates (network check skipped or unavailable).',
    'which is below your minimumVersion setting',
    'await daemonVersionDiffers(result.latestVersion)',
    'await daemonVersionDiffers(latestVersion)',
    'Claude daemon will restart for the upgrade once background jobs finish',
  ])
})

test('recovers repo checkout metadata, notification preferences, and ambient memory', () => {
  assertSourceFragments('src/utils/repoCheckouts.ts', [
    'process.env.CLAUDE_CODE_REPO_CHECKOUTS',
    'process.env.CLAUDE_CODE_BASE_REFS',
    'await addWatchedRepo(checkout)',
    'onRepoBranchChange(() => void refreshRepoBranches())',
    'reportMetadata?.({ current_branches: branches })',
  ])
  assertSourceFragments('src/cli/remoteIO.ts', [
    'setSessionMetadataChangedListener(metadata => { this.ccrClient?.reportMetadata(metadata) })',
    'initializeRepoBranchWatcher(notifySessionMetadataChanged)',
  ])
  assertSourceFragments('src/services/notificationPreferences.ts', [
    '/api/claude_code/notification/preferences',
    'featurePreference.bogosort',
    'featurePreference.code_requires_action',
    'response.push_reachability ?? null',
    "updateSettingsForSource('userSettings', settingsToSeed)",
  ])
  assertSourceFragments('src/utils/attachments.ts', [
    "type: 'memory_update'",
    "maybe('memory_update'",
    'current.pendingMemoryUpdates.length === 0',
    'inContextPaths: update.paths.filter(isInContext)',
  ])
})

test('recovers push, monitor, memory, classifier, editor, and remote-model assets', () => {
  assertSourceFragments('src/tools/PushNotificationTool/PushNotificationTool.ts', [
    "'config_off', 'user_present', 'no_transport'",
    "logEvent('tengu_push_notification_send'",
    "getConfigValue('agentPushNotifEnabled', false).value",
    'context.sendOSNotification',
    'pushSent: true',
  ])
  assertSourceFragments('src/tools/PushNotificationTool/UI.tsx', [
    "Not sent because you're active in this terminal.",
    'Not sent — Remote Control is off. Enable with',
  ])
  assertSourceFragments('src/tools/MonitorTool/prompt.ts', [
    'Start a background monitor that streams events from a long-running script.',
    'One per occurrence, until a known end',
    "Don't use an unbounded command for a single notification.",
    'Coverage — silence is not success.',
  ])
  assertSourceFragments('src/services/autoDream/consolidationPrompt.ts', [
    '### Reconcile memories against CLAUDE.md',
    'CLAUDE.md may be stale',
  ])
  assertSourceFragments(
    'src/utils/permissions/yolo-classifier-prompts/auto_mode_system_prompt.txt',
    [
      'ENCODED COMMANDS:',
      'pwsh -EncodedCommand',
      'If you cannot confidently decode it, the action is unverifiable — block it.',
    ],
  )
  assert.equal(
    fs.statSync(
      path.join(
        repo,
        'src/utils/permissions/yolo-classifier-prompts/permissions_anthropic.txt',
      ),
    ).size,
    0,
    'permissions_anthropic remains the authenticated DCE-empty asset',
  )
  assertSourceFragments('src/utils/promptEditor.ts', [
    '${editorName} closed unexpectedly (${result.signal})',
    '${editorName} quit unexpectedly (exit code ${result.status})',
  ])
  assertSourceFragments('src/commands/model/model.tsx', [
    "subtype: 'set_model'",
    '[remote] set_model rejected:',
  ])
  assertSourceFragments('src/utils/sdkEventQueue.ts', [
    'skip_transcript?: boolean',
    'skipTranscript?: boolean',
    'skip_transcript: opts?.skipTranscript',
  ])
  assertSourceFragments('src/tasks/DreamTask/DreamTask.ts', [
    'skipTranscript: true',
    "emitTaskTerminatedSdk(taskId, 'completed', { skipTranscript: true })",
    "emitTaskTerminatedSdk(taskId, 'failed', { skipTranscript: true })",
    "emitTaskTerminatedSdk(taskId, 'stopped', { skipTranscript: true })",
  ])
  assertSourceFragments('src/entrypoints/sdk/coreSchemas.ts', [
    'skip_transcript: z.boolean().optional()',
    'Ambient/housekeeping task. Consumers should hide this from the inline transcript',
  ])
  assertSourceFragments('src/services/compact/autoCompact.ts', [
    '· use /autocompact to configure',
  ])
  assertSourceFragments('src/services/mcpServerApproval.tsx', [
    'await markBackgroundMcpApprovalBlocked(pendingServers)',
    "state: 'blocked'",
    'new MCP ${serverWord} ${needWord} approval',
    'in .mcp.json (${pendingServers.join(\', \')}) — attach to respond',
  ])
  assertSourceFragments('src/hooks/useWakeRouter.ts', [
    "command.mode !== 'task-notification'",
    "candidate.status !== 'completed'",
    'getAgentKeepaliveReasons(candidate).size === 0',
    'prompt: consumedCommands',
    ".join('\\n\\n')",
    'remove(consumed)',
    'dispatch for ${agentId} exceeded ${WAKE_DISPATCH_TIMEOUT_MS}ms; releasing inFlight reservation',
  ])
  assertSourceFragments('src/screens/REPL.tsx', [
    'resumeAgentBackground({ agentId, prompt, toolUseContext, canUseTool })',
    'useWakeRouter(wakeParkedAgent)',
  ])
  assertSourceFragments('src/main.tsx', [
    'Manage background and configured agents',
  ])
})
