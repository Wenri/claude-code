import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))

const BASELINE_BYTES = 13_784_743
const BASELINE_SHA256 =
  'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f'
const TARGET_BYTES = 13_908_188
const TARGET_SHA256 =
  '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function loadBundle(environmentName, expectedBytes, expectedSha256) {
  const filename = process.env[environmentName]
  assert.ok(filename, `${environmentName} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, expectedBytes, `${environmentName}: byte length`)
  assert.equal(sha256(bytes), expectedSha256, `${environmentName}: SHA-256`)
  return bytes.toString('utf8')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function readSource(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

function compact(value) {
  return value.replaceAll(/\s+/g, ' ').trim()
}

function assertSourceFragments(relativePath, fragments) {
  const contents = compact(readSource(relativePath))
  for (const fragment of fragments) {
    assert.equal(
      contents.includes(compact(fragment)),
      true,
      `${relativePath}: ${fragment}`,
    )
  }
}

const TARGET_WITNESSES = [
  ['fleet hard-disable', 'CLAUDE_CODE_DISABLE_AGENTS_FLEET', 0, 2],
  ['warm-spare rollout', 'tengu_bg_spare_enable', 0, 2],
  ['warm-spare claim failure', 'tengu_bg_spare_claim_fail', 0, 2],
  ['warm-spare entrypoint', '--bg-spare', 0, 2],
  ['control peer ownership', 'tengu_daemon_peer_uid_reject', 0, 2],
  ['transient-daemon provenance', '--spawned-by', 0, 3],
  ['state-local order file', 'stateOrder', 0, 2],
  ['state-local sort field', 'stateSortOrder', 0, 5],
  ['name provenance', 'nameSource', 0, 13],
  ['settlement drain', 'pendingSettleWrites', 0, 1],
  ['duplicate-dispatch escalation', 'tengu_bg_dispatch_sigkill_escalate', 0, 2],
  ['service recall', 'service recall flag set', 0, 1],
  ['daemon handover', 'yielding to a foreground/service daemon', 0, 1],
  ['safe respawn refusal', 'tengu_bg_respawn_unconfirmed_bail', 0, 2],
  ['safe delete refusal', 'jobdir/worktree removal', 0, 1],
  ['container recovery notice', 'The container was restarted', 0, 1],
  [
    'crash-respawn prompt restore',
    '[sessionRestore] Auto-resuming interrupted turn for bg crash-respawn',
    0,
    1,
  ],
  ['kill fallback', 'tengu_bg_killjob_ctrl_fallback', 0, 2],
  ['status session summary', 'bg sessions:', 0, 1],
  ['worker state machine', 'worker-phase transition', 0, 1],
  ['disabled worker registry rejection', "worker kind '", 0, 1],
  ['rendezvous repaint fallback', "Session can't redraw right now", 0, 1],
  ['cross-platform orphan reaper', 'roster-less pty host(s)', 0, 1],
  ['fleet delete confirmation', 'stopped. ctrl+x again to delete.', 0, 1],
  ['remote file binary encoding', 'lossy for binary', 0, 1],
  ['remote file encoding marker', 'older CLI ignored the request', 0, 1],
  [
    'background exit description',
    'Detach from this background session (it keeps running)',
    0,
    1,
  ],
  [
    'headless background exit notice',
    'Session keeps running. Use /stop to end it.',
    0,
    1,
  ],
  ['background exit dialog removed', 'Leave background session', 1, 0],
  [
    'bridge immediate-command dispatch',
    'Ran immediate command without enqueue',
    0,
    1,
  ],
  ['bridge reattach fallback', 'bridge_repl_v2_reattach_fallback', 0, 1],
  ['managed fleet opt-out', 'Disable the background-agents fleet', 0, 1],
  [
    'daemon cold-start setting copy',
    "When no background service is running: 'transient' spawns one for this login session; 'ask' offers to install it persistently",
    0,
    1,
  ],
  ['background detach choice removed', 'Detach (keep running)', 1, 0],
  ['background stop dialog removed', 'Stop this background session?', 1, 0],
  ['background detach telemetry removed', 'chose_detach', 1, 0],
  [
    'hard-coded daemon hub noun removed',
    'Exposed to claude.ai/code via the daemon.',
    1,
    0,
  ],
  [
    'hard-coded daemon orphan copy removed',
    'Background daemon lost track of this job',
    1,
    0,
  ],
  [
    'positional daemon registry grammar',
    ' <add|remove|list>',
    0,
    3,
  ],
  [
    'scheduled remove usage',
    'usage: claude daemon scheduled remove <task-id>',
    0,
    1,
  ],
  [
    'assistant add spelling',
    '`claude daemon assistant add` is not available in this build',
    0,
    1,
  ],
  [
    'dynamic daemon update notice',
    'will restart on the new version shortly; background jobs continue uninterrupted',
    0,
    1,
  ],
  [
    'legacy daemon update notice removed',
    'Claude daemon will restart for the upgrade once background jobs finish',
    2,
    0,
  ],
  ['spare claim timeout', 'send-claim timeout', 0, 1],
  ['recall telemetry', 'tengu_copper_lantern', 0, 3],
  ['idle diagnosis', 'nothing holding this daemon open', 0, 1],
  ['version-skew status', 'different CLI version', 0, 1],
  ['session permission restore', 'session_allow_rules', 0, 2],
  ['background-task restore', 'running_background_tasks', 0, 3],
  ['lease telemetry', 'tengu_daemon_lease', 1, 3],
  ['yield telemetry', 'tengu_daemon_yield_takeover', 0, 2],
  ['legacy auto-uninstall event removed', 'tengu_daemon_auto_uninstall', 3, 0],
  ['legacy service marker removed', 'claude-managed: v1', 1, 0],
]

test('authenticates the canonical 2.1.120 and 2.1.121 inner bundles', () => {
  const baseline = loadBundle(
    'CLAUDE_2_1_120_CLI_INNER',
    BASELINE_BYTES,
    BASELINE_SHA256,
  )
  const target = loadBundle(
    'CLAUDE_2_1_121_CLI_INNER',
    TARGET_BYTES,
    TARGET_SHA256,
  )
  for (const [name, fragment, baselineCount, targetCount] of TARGET_WITNESSES) {
    assert.equal(occurrences(baseline, fragment), baselineCount, `${name}: baseline`)
    assert.equal(occurrences(target, fragment), targetCount, `${name}: target`)
  }
})

test('recovers fleet gating, secure daemon paths, and warm-spare transport', () => {
  assertSourceFragments('src/utils/agentsFleet.ts', [
    'process.env.CLAUDE_CODE_DISABLE_AGENTS_FLEET',
    'export async function ensureFleetGateHydrated()',
    "getFeatureValue_CACHED_MAY_BE_STALE('tengu_copper_lantern', false)",
  ])
  assertSourceFragments('src/daemon/paths.ts', [
    "mkdir(daemonDir, { recursive: true, mode: 0o700 })",
    "writeFileSync(path, key, { flag: 'wx', mode: 0o600 })",
    'getSpareClaimSocketPath',
    'getPtyPidPath',
  ])
  assertSourceFragments('src/daemon/peerCredentials.ts', [
    "openSymbol('libc.so.6'",
    "openSymbol('/usr/lib/libSystem.B.dylib'",
    'controlPeerMatchesCurrentUser',
  ])
  assertSourceFragments('src/daemon/spare.ts', [
    "'--bg-spare'",
    "throw new Error('send-claim timeout')",
    'CLAUDE_CODE_SESSION_KIND',
  ])
})

test('recovers worker lifecycle, takeover, service recall, and safe cleanup', () => {
  assertSourceFragments('src/daemon/supervisor.ts', [
    'private replyChain: Promise<void> = Promise.resolve()',
    'illegal worker-phase transition',
    "logEvent('tengu_daemon_peer_uid_reject', {})",
    "logEvent('tengu_bg_dispatch_sigkill_escalate', {})",
    'pendingSettleWrites: () => pendingSettleWrites.size',
    'await Promise.allSettled([...pendingSettleWrites])',
    "logEvent('tengu_bg_spare_claim'",
    "logEvent('tengu_bg_spare_claim_fail'",
    'const directory = windows ? getPtyPidDir() : getPtyDir()',
    'void killWorkerThroughPty(socketPath).then(killed =>',
    'roster-less pty host(s)',
    "`${bgSupervisorNoun()} didn't acknowledge in time — retry`",
  ])
  assertSourceFragments('src/daemon/main.ts', [
    'const DAEMON_LOG_ROTATION_BYTES = 10 * 1024 * 1024',
    'async function createDaemonLogger',
    'function workerKindEnabled',
    'yielding to a foreground/service daemon — bg workers will be re-adopted',
    'service recall flag set — draining workers and uninstalling service',
    "logEvent('tengu_daemon_yield_takeover'",
    "['--spawned-by', JSON.stringify(parsed.spawnedBy)]",
  ])
  assertSourceFragments('src/daemon/client.ts', [
    'logind KillUserProcesses=yes',
    'export async function isBackgroundJobAlive',
    "response.code === 'ESTARTING' && attempt < 10",
    "logEvent('tengu_bg_killjob_ctrl_fallback'",
  ])
  assertSourceFragments('src/daemon/workerRegistry.ts', [
    "kind !== 'heartbeat' && !isDaemonWorkerRegistryEnabled()",
    "process.stderr.write(`worker kind '${kind}' is not available.\\n`)",
    'process.exit(2)',
  ])
  assertSourceFragments('src/daemon/cli.ts', [
    "export function parseKindArgs( kind: 'scheduled' | 'assistant' | 'remote-control', args: string[]",
    "unknown action '${actionArg}' — expected: claude daemon ${kind} <add|remove|list>",
    "'${arg}' is no longer supported — use: claude daemon ${kind} <add|remove|list>",
    'for (const entry of config.assistant ?? [])',
    'usage: claude daemon scheduled remove <task-id>',
    '`claude daemon assistant add` is not available in this build',
  ])
  assertSourceFragments('src/bridge/remoteBridgeCore.ts', [
    'let isReattach = reattachSessionId !== undefined',
    'async function createFreshSession()',
    'bridge_repl_v2_reattach_fallback',
    "'fetchRemoteCredentials (post-fallback)'",
    'initialSequenceNum: isReattach ? reattachSequenceNum : undefined',
  ])
  assertSourceFragments('src/daemon/rendezvous.ts', [
    'const sequence = bridge.getLastSequenceNum()',
    'void bridge.teardown({ skipArchive: true })',
    'pending.push(runCleanupFunctions())',
    'instances.get(process.stdout)?.forceRedraw()',
    "Session can't redraw right now — Ctrl+B then d to detach",
    "origin: { kind: 'peer', from: 'bg-rendezvous' }",
  ])
  assertSourceFragments('src/cli/bg.ts', [
    "logEvent('tengu_bg_respawn_unconfirmed_bail', {})",
    'skipping jobdir/worktree removal to avoid stranding a live worker',
    '`${bgSupervisorNounCap()} lost track of this job — press Enter to respawn it`',
    "`Couldn't attach — ${bgSupervisorNoun()} is unavailable",
    "`${bgSupervisorNounCap()} is restarting — try again in a moment.`",
  ])
  assertSourceFragments('src/daemon/hub.tsx', [
    '`Exposed to claude.ai/code via the ${bgSupervisorNoun()}.`',
    'The {bgSupervisorNoun()} will stop the worker on its next reconcile.',
  ])
  assertSourceFragments('src/commands/stop/stop.tsx', [
    'onDone() await stopBackgroundSession(\'stop_command\') return null',
  ])
  assertSourceFragments('src/components/BackgroundExitDialog.tsx', [
    "const recordChoice = (choice: 'exit' | 'stay')",
    "{ label: 'Exit anyway', value: 'exit' }",
    "{ label: 'Stay', value: 'stay' }",
  ])
  assertSourceFragments('src/components/FleetView.tsx', [
    'const flushOrderWrites = useCallback(() =>',
    "setError(`Couldn't save order — ${errorMessage(caught)}`)",
    "setError(`Couldn't stop — ${errorMessage(caught)}`)",
    "setError(`Couldn't delete — ${errorMessage(caught)}`)",
    "'stopped. ctrl+x again to delete.'",
  ])
  assertSourceFragments('src/commands/exit/index.ts', [
    "? 'Detach from this background session (it keeps running)'",
    "get description() { return getExitDescription() }",
  ])
  assertSourceFragments('src/commands/exit/exit.tsx', [
    'if (isBgSession()) { onDone(); detachBackgroundSession(); return null;',
  ])
  assertSourceFragments('src/commands/exit/exit-noninteractive.ts', [
    "value: 'Session keeps running. Use /stop to end it.'",
  ])
})

test('recovers durable job ordering, generated-name context, and restart state', () => {
  assertSourceFragments('src/daemon/jobs.ts', [
    "readFile(join(jobDir, 'stateOrder'), 'utf-8')",
    'stateSortOrder: stateOrder',
    "writeFile(join(jobDir, 'stateOrder'), String(order), 'utf-8')",
    'nameSource: source',
    'const jobStateCache = new Map<string, JobState | null>()',
    "jobsWatcher = watch(jobsDir, { recursive: true }",
    'if (jobStateCache.size > 1_000) jobStateCache.clear()',
  ])
  assertSourceFragments('src/components/FleetView.tsx', [
    'return state.stateSortOrder ?? Date.parse(state.updatedAt)',
    "[useStateOrder ? 'stateSortOrder' : 'sortOrder']: order",
  ])
  assertSourceFragments('src/jobs/classifier.ts', [
    'const SIDE_QUERY_TOKEN_OVERHEAD = 2_048',
    'max_tokens: 32 + SIDE_QUERY_TOKEN_OVERHEAD',
    'agentContext?: string',
    "nameSource: 'auto'",
  ])
  assertSourceFragments('src/state/onChangeAppState.ts', [
    'running_background_tasks: nextTasks',
    'session_allow_rules: safeRules?.length ? [...safeRules] : null',
  ])
  assertSourceFragments('src/utils/sessionRestore.ts', [
    'isEnvTruthy(process.env.CLAUDE_CODE_RESUME_INTERRUPTED_TURN)',
    '[sessionRestore] Auto-resuming interrupted turn for bg crash-respawn',
    'initialMessage = { message: result.turnInterruptionState.message }',
  ])
  assertSourceFragments('src/utils/conversationRecovery.ts', [
    'export function removeInterruptedMessage(',
    'if (index !== -1) messages.splice(index, 2)',
  ])
  assertSourceFragments('src/cli/print.ts', [
    'The container was restarted. The following background tasks were running and are now stopped:',
    'notifySessionInternalMetadataChanged({ running_background_tasks: [] })',
  ])
  assertSourceFragments('src/entrypoints/sdk/controlSchemas.ts', [
    "encoding: z .enum(['utf-8', 'base64'])",
    "encoding: z .literal('base64')",
    'older CLI ignored the request',
    'SDKControlReadFileRequestSchema()',
  ])
  assertSourceFragments('src/bridge/bridgeMessaging.ts', [
    'request.request.path, request.request.max_bytes, request.request.encoding',
  ])
  assertSourceFragments('src/bridge/readFileForRemote.ts', [
    "encoding: 'utf-8' | 'base64' = 'utf-8'",
    ".toString(encoding === 'base64' ? 'base64' : 'utf-8')",
    "...(encoding === 'base64' && { encoding })",
  ])
  assertSourceFragments('src/hooks/useReplBridge.tsx', [
    'onReadFile: async (path, maxBytes, encoding) =>',
    'store.getState().toolPermissionContext, encoding',
    'function resolveBridgeImmediateCommand(',
    "logEvent('tengu_immediate_command_executed'",
    'tryRunImmediateCommand(fields.content)',
    'Ran immediate command without enqueue',
  ])
  assertSourceFragments('src/utils/settings/types.ts', [
    'disableBackgroundAgents: z .boolean() .optional()',
    'Disable the background-agents fleet',
    "When no background service is running: 'transient' spawns one for this login session; 'ask' offers to install it persistently",
  ])
  assertSourceFragments('src/cli/update.ts', [
    'async function printDaemonUpgradeNotice(version: string)',
    '${bgSupervisorNounCap()} will restart on the new version shortly; background jobs continue uninterrupted',
    'await printDaemonUpgradeNotice(result.latestVersion)',
    'await printDaemonUpgradeNotice(latestVersion)',
  ])
  assertSourceFragments('src/screens/REPL.tsx', [
    'const runBridgeImmediateCommand = useCallback(',
    'const result = await (await command.load()).call(args, context)',
    '`<${LOCAL_COMMAND_STDERR_TAG}>${escapeXml(String(error))}</${LOCAL_COMMAND_STDERR_TAG}>`',
    'runBridgeImmediateCommand,',
  ])
})

test('removes the obsolete managed-marker auto-uninstall path', () => {
  const daemonSources = [
    'src/daemon/main.ts',
    'src/daemon/service.ts',
  ].map(readSource).join('\n')
  assert.equal(daemonSources.includes('tengu_daemon_auto_uninstall'), false)
  assert.equal(daemonSources.includes('claude-managed: v1'), false)
  assert.equal(daemonSources.includes('removeLegacyDaemonService'), false)
})
