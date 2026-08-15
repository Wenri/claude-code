import { randomBytes, randomUUID } from 'crypto'
import chalk from 'chalk'
import { mkdir, readdir, rename, rm, unlink, writeFile } from 'fs/promises'
import { connect } from 'net'
import { join } from 'path'
import { setTimeout as delay } from 'timers/promises'
import {
  getActiveAgentsFromList,
  getAgentDefinitionsWithOverrides,
} from '../tools/AgentTool/loadAgentsDir.js'
import { getCwd } from '../utils/cwd.js'
import {
  getMainLoopModelOverride,
  getSessionId,
} from '../bootstrap/state.js'
import { findGitRoot } from '../utils/git.js'
import {
  canonicalizePath,
  getProjectDir,
} from '../utils/sessionStoragePortable.js'
import {
  flushSessionStorage,
  saveAiGeneratedTitle,
  getCurrentSessionTitle,
  getCurrentSessionFile,
  isTranscriptPersistenceDisabled,
} from '../utils/sessionStorage.js'
import {
  getAgentWorktreeChanges,
  getCurrentWorktreeSession,
  removeAgentWorktree,
  restoreWorktreeSession,
} from '../utils/worktree.js'
import { getAssistantMessageText, getUserMessageText } from '../utils/messages.js'
import type { Message } from '../types/message.js'
import type { EffortValue } from '../utils/effort.js'
import { logEvent } from '../services/analytics/index.js'
import { logEventTo1PAwaitable } from '../services/analytics/firstPartyEventLogger.js'
import { logForDebugging } from '../utils/debug.js'
import { logError } from '../utils/log.js'
import {
  bgSupervisorNoun,
  bgSupervisorNounCap,
  daemonHint,
} from '../utils/agentsFleet.js'
import { errorMessage } from '../utils/errors.js'
import { registerCleanup } from '../utils/cleanupRegistry.js'
import { relaunch } from '../utils/relaunch.js'
import { withTimeout } from '../utils/sleep.js'
import { peekForStdinData } from '../utils/process.js'
import { getGlobalConfig } from '../utils/config.js'
import {
  hasAutoModeOptIn,
  hasSkipDangerousModePermissionPrompt,
} from '../utils/settings/settings.js'
import { hasTranscriptMessages } from '../utils/transcriptValidation.js'
import {
  CURSOR_HOME,
  DISABLE_KITTY_KEYBOARD,
  DISABLE_MODIFY_OTHER_KEYS,
  ENABLE_KITTY_KEYBOARD,
  ENABLE_MODIFY_OTHER_KEYS,
  ERASE_SCREEN,
  cursorPosition,
} from '../ink/termio/csi.js'
import {
  decreset,
  decset,
  ENTER_ALT_SCREEN,
  ESU,
  EXIT_ALT_SCREEN,
  SHOW_CURSOR,
} from '../ink/termio/dec.js'
import { supportsExtendedKeys } from '../ink/terminal.js'
import { drainStdin } from '../ink/ink.js'
import {
  extractConversationText,
  generateSessionTitle,
} from '../utils/sessionTitle.js'
import {
  createInitialJobState,
  getJobDir,
  getJobsDir,
  isTerminalState,
  readAllJobs,
  readJobState,
  writeJobState,
  type JobState,
} from '../daemon/jobs.js'
import {
  ensureDaemon,
  ensureDaemonInteractive,
  isBackgroundJobAlive,
  killJob,
  listLiveJobs,
  requestControl,
  subscribeToJob,
} from '../daemon/client.js'
import { getControlSocketPath, getDispatchDir } from '../daemon/paths.js'
import {
  DETACH_SEQUENCE,
  parseDetachMessage,
  PROTOCOL_VERSION,
  SHORT_ID_RE,
  type Dispatch,
} from '../daemon/protocol.js'

const BG_FLAGS = ['--bg', '--background']

function enterAttachedTerminal(decModes: number[] = []): string {
  return (
    ENTER_ALT_SCREEN +
    ERASE_SCREEN +
    CURSOR_HOME +
    (supportsExtendedKeys()
      ? DISABLE_KITTY_KEYBOARD +
        ENABLE_KITTY_KEYBOARD +
        ENABLE_MODIFY_OTHER_KEYS
      : '') +
    decModes.map(decset).join('')
  )
}

function leaveAttachedTerminal(
  decModes: number[] = [],
  holdScreen = false,
): string {
  return (
    ESU +
    decModes.map(decreset).reverse().join('') +
    SHOW_CURSOR +
    DISABLE_KITTY_KEYBOARD +
    DISABLE_MODIFY_OTHER_KEYS +
    (holdScreen ? '' : EXIT_ALT_SCREEN)
  )
}

function exitAttachedScreen(): string {
  return DISABLE_KITTY_KEYBOARD + EXIT_ALT_SCREEN + DISABLE_MODIFY_OTHER_KEYS
}
const ENV_ALLOWLIST = [
  'CLAUDE_CONFIG_DIR',
  'CLAUDE_INTERNAL_FC_OVERRIDES',
  'AWS_REGION',
  'AWS_DEFAULT_REGION',
  'AWS_PROFILE',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GOOGLE_CLOUD_PROJECT',
  'GCLOUD_PROJECT',
] as const

export type ReplBackgroundSeed = {
  intent: string
  name?: string
  detail?: string
}

function isCommandEnvelope(text: string): boolean {
  return (
    text.startsWith('<command-name>') ||
    text.startsWith('<local-command-stdout>') ||
    text.startsWith('<bash-input>') ||
    text.startsWith('<bash-stdout>')
  )
}

/** Recover the exact compact seed shown in Fleet while the fork starts. */
export function deriveBackgroundSeed(
  messages: readonly Message[],
  prompt = '',
): ReplBackgroundSeed | null {
  let intent = prompt
  let foundHuman = false
  let detail: string | undefined
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!
    if (message.type === 'assistant' && detail === undefined) {
      const text = getAssistantMessageText(message)
      if (text) detail = text.replace(/\s+/g, ' ').trim().slice(0, 120)
    }
    if (message.type === 'user' && !message.isMeta) {
      const content = message.message.content
      if (
        Array.isArray(content) &&
        content.some(block => block.type === 'tool_result')
      ) {
        continue
      }
      const text = getUserMessageText(message)?.trim()
      if (text && isCommandEnvelope(text)) continue
      foundHuman = true
      if (!intent && text) intent = text
    }
    if (intent && detail !== undefined) break
  }
  if (!foundHuman) return null
  return {
    intent: (intent || '(backgrounded)').slice(0, 200),
    name: getCurrentSessionTitle(getSessionId()),
    detail,
  }
}

/** Compatibility name used by the left-arrow Fleet flow. */
export const parseReplBackgroundSeed = deriveBackgroundSeed

export interface SpawnBgOptions {
  intent?: string
  name?: string
  nameSource?: 'user' | 'auto'
  detail?: string
  worktree?: {
    path: string
    branch?: string
    hookBased?: boolean
    originCwd?: string
  }
}

export type SpawnBgResult =
  | { ok: true; short: string; sessionId: string; idle: boolean }
  | { ok: false; error: string }

function inheritedEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const key of ENV_ALLOWLIST) {
    const value = process.env[key]
    if (value) env[key] = value
  }
  return env
}

export function parseResumeTarget(args: string[]): string | undefined {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--') break
    if (arg.startsWith('--resume=')) return arg.slice(9) || undefined
    if (arg.startsWith('-r=')) return arg.slice(3) || undefined
    if (arg === '--resume' || arg === '-r') {
      const next = args[index + 1]
      return next && !next.startsWith('-') ? next : undefined
    }
  }
  return undefined
}

function respawnFlags(args: string[]): string[] {
  const flags: string[] = []
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (
      arg === '--fork-session' ||
      arg === '-c' ||
      arg === '--continue' ||
      arg.startsWith('--resume=') ||
      arg.startsWith('-r=') ||
      arg.startsWith('--session-id=')
    ) {
      continue
    }
    if (arg === '--resume' || arg === '-r' || arg === '--session-id') {
      if (args[index + 1] !== undefined && !args[index + 1].startsWith('-')) {
        index++
      }
      continue
    }
    flags.push(arg)
  }
  return flags
}

const RESPAWN_VALUE_FLAGS = new Set([
  '--model',
  '-m',
  '--permission-mode',
  '--agent',
  '--agents',
  '--routine',
  '--effort',
  '--add-dir',
  '--mcp-config',
  '--settings',
  '--setting-sources',
  '--system-prompt',
  '--system-prompt-file',
  '--append-system-prompt',
  '--append-system-prompt-file',
  '--fallback-model',
  '--permission-prompt-tool',
  '--allowed-tools',
  '--allowedTools',
  '--disallowed-tools',
  '--disallowedTools',
  '--tools',
  '--session-id',
  '--debug-file',
  '-n',
  '--name',
  '--autocompact',
  '--betas',
  '--file',
  '--max-budget-usd',
  '--max-thinking-tokens',
  '--max-turns',
  '--task-budget',
  '--plan-mode-instructions',
  '--plugin-dir',
  '--resume-session-at',
  '--rewind-files',
  '--thinking',
  '--thinking-display',
])

function persistentRespawnFlags(args: string[]): string[] {
  const flags: string[] = []
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!
    if (!arg.startsWith('-')) continue
    const next = args[index + 1]
    const hasValue = next !== undefined && !next.startsWith('-')
    if (RESPAWN_VALUE_FLAGS.has(arg)) {
      flags.push(arg)
      if (next !== undefined) {
        flags.push(next)
        index++
      }
    } else if (hasValue) {
      index++
    } else {
      flags.push(arg)
    }
  }
  return flags
}

function stripSessionIdFlags(args: string[]): string[] {
  const stripped: string[] = []
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!
    if (arg === '--') {
      stripped.push(...args.slice(index))
      break
    }
    if (arg.startsWith('--session-id=')) continue
    if (arg === '--session-id') {
      if (args[index + 1] !== undefined && !args[index + 1]!.startsWith('-')) {
        index++
      }
      continue
    }
    stripped.push(arg)
  }
  return stripped
}

function optionValue(name: string, args: string[]): string | undefined {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--') break
    if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1)
    if (arg === name && index + 1 < args.length) return args[index + 1]
  }
  return undefined
}

function getBackgroundLaunchSafetyError(args: string[]): string | null {
  const separator = args.indexOf('--')
  const beforeSeparator = separator >= 0 ? args.slice(0, separator) : args
  const permissionMode = optionValue('--permission-mode', beforeSeparator)
  const requestsBypass =
    permissionMode === 'bypassPermissions' ||
    beforeSeparator.includes('--dangerously-skip-permissions') ||
    beforeSeparator.includes('--allow-dangerously-skip-permissions')
  if (
    requestsBypass &&
    !hasSkipDangerousModePermissionPrompt() &&
    !getGlobalConfig().bypassPermissionsModeAccepted
  ) {
    return '--bg with bypassPermissions requires accepting the disclaimer first. Run `claude --dangerously-skip-permissions` once interactively.'
  }
  if (permissionMode === 'auto' && !hasAutoModeOptIn()) {
    return '--bg with auto mode requires opting in first. Run `claude --permission-mode auto` once interactively.'
  }
  return null
}

export async function preSeedReplBgJob(
  sessionId: string,
  options: { cwd: string } & SpawnBgOptions,
): Promise<{ short: string; jobDir: string }> {
  const short = sessionId.slice(0, 8)
  const jobDir = getJobDir(short)
  await mkdir(jobDir, { recursive: true })
  const intent = options.intent ?? ''
  const idle = intent === '' && !options.detail
  await writeJobState(
    jobDir,
    createInitialJobState({
      template: { name: 'bg' },
      intent,
      name: options.name,
      nameSource: options.nameSource,
      detail:
        options.detail ??
        (idle ? '(idle — attach to send a prompt)' : undefined),
      tempo: idle ? 'idle' : undefined,
      sessionId,
      cwd: options.cwd,
      worktreePath: options.worktree?.path,
      worktreeBranch: options.worktree?.branch,
      worktreeHookBased: options.worktree?.hookBased,
      originCwd: options.worktree?.originCwd,
    }),
  )
  return { short, jobDir }
}

let daemonWasReachable = false

async function atomicDispatch(path: string, dispatch: Dispatch): Promise<void> {
  const temporary = `${path}.tmp.${process.pid}.${randomBytes(4).toString('hex')}`
  await writeFile(temporary, JSON.stringify(dispatch), 'utf8')
  await rename(temporary, path)
}

type DispatchResult =
  | { ok: true }
  | {
      ok: false
      reason:
        | 'daemon-unreachable'
        | 'ack-timeout'
        | 'dispatch-write'
        | 'enoconn'
        | 'stale-short'
      detail?: string
      nonce?: string
    }

function dispatchSucceeded(dispatch: Dispatch): DispatchResult {
  daemonWasReachable = true
  logEvent('tengu_bg_dispatch', {
    backend_daemon: true,
    source_shell: dispatch.source === 'shell',
    source_slash: dispatch.source === 'slash',
    source_fleet: dispatch.source === 'fleet',
    has_worktree: dispatch.worktree !== undefined,
    has_agent: dispatch.agent !== undefined,
  })
  return { ok: true }
}

function recordDispatchFallback(
  reason: Exclude<DispatchResult, { ok: true }>['reason'],
): void {
  logEvent('tengu_bg_dispatch_fallback', {
    reason_unreachable: reason === 'daemon-unreachable',
    reason_ack_timeout: reason === 'ack-timeout',
    reason_write: reason === 'dispatch-write',
    reason_enoconn: reason === 'enoconn',
    reason_stale_short: reason === 'stale-short',
  })
}

async function sendDispatch(dispatch: Dispatch): Promise<DispatchResult> {
  if (!daemonWasReachable) {
    const started =
      dispatch.source === 'shell'
        ? await ensureDaemonInteractive()
        : await ensureDaemon({ forceTransient: true })
    if (!started.ok) {
      recordDispatchFallback('daemon-unreachable')
      return {
        ok: false,
        reason: 'daemon-unreachable',
        detail: started.reason,
      }
    }
  }
  const dispatchDir = getDispatchDir()
  const dispatchPath = join(dispatchDir, `${dispatch.short}.json`)
  let nonce = ''
  let reason: Exclude<DispatchResult, { ok: true }>['reason'] = 'ack-timeout'
  let detail = 'no ack'
  for (let attempt = 0; attempt < 2; attempt++) {
    nonce = randomBytes(4).toString('hex')
    const withNonce = { ...dispatch, nonce }
    if (daemonWasReachable) {
      const direct = await requestControl(
        {
          proto: PROTOCOL_VERSION,
          op: 'dispatch',
          d: withNonce,
          timeoutMs: 5_000,
        },
        { timeoutMs: 6_000 },
      )
      if (direct.ok && direct.op === 'dispatch') {
        return dispatchSucceeded(dispatch)
      }
      if (!direct.ok && direct.code === 'ESTALE') {
        reason = 'stale-short'
        detail = direct.error
        if (attempt === 0) continue
        break
      }
    }
    try {
      await atomicDispatch(dispatchPath, withNonce).catch(async (error) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        await mkdir(dispatchDir, { recursive: true })
        await atomicDispatch(dispatchPath, withNonce)
      })
    } catch (error) {
      reason = 'dispatch-write'
      detail = String(error)
      break
    }
    let ack = await requestControl(
      {
        proto: PROTOCOL_VERSION,
        op: 'await-ack',
        short: dispatch.short,
        nonce,
        timeoutMs: 5_000,
      },
      { timeoutMs: 6_000 },
    )
    for (
      let retry = 0;
      !ack.ok && ack.code === 'ESTARTING' && retry < 10;
      retry++
    ) {
      await delay(200)
      ack = await requestControl(
        {
          proto: PROTOCOL_VERSION,
          op: 'await-ack',
          short: dispatch.short,
          nonce,
          timeoutMs: 5_000,
        },
        { timeoutMs: 6_000 },
      )
    }
    if (ack.ok && ack.op === 'await-ack') {
      return dispatchSucceeded(dispatch)
    }
    await unlink(dispatchPath).catch(() => {})
    reason =
      !ack.ok && ack.code === 'ESTALE'
        ? 'stale-short'
        : !ack.ok && (ack.code === 'ENOCONN' || ack.code === 'ESTARTING')
          ? 'enoconn'
          : 'ack-timeout'
    detail = !ack.ok ? ack.error : 'no ack'
    if (reason !== 'stale-short' || attempt === 1) break
  }
  if (daemonWasReachable && reason === 'enoconn') {
    daemonWasReachable = false
    return sendDispatch(dispatch)
  }
  recordDispatchFallback(reason)
  return { ok: false, reason, detail, nonce }
}

function dispatchError(reason: Exclude<DispatchResult, { ok: true }>['reason']) {
  switch (reason) {
    case 'daemon-unreachable':
      return 'not running'
    case 'ack-timeout':
      return 'timed out'
    case 'dispatch-write':
      return "couldn't write dispatch file"
    case 'enoconn':
      return 'socket missing'
    case 'stale-short':
      return 'id collision with a prior job'
  }
}

export async function spawnBgSession(
  args: string[],
  suppliedSessionId?: string,
  source: 'shell' | 'repl' | 'fleet' | 'respawn' = 'shell',
  suppliedCwd?: string,
  options?: SpawnBgOptions,
  reattachEnv?: Record<string, string>,
): Promise<SpawnBgResult> {
  const safetyError = getBackgroundLaunchSafetyError(args)
  if (safetyError) return { ok: false, error: safetyError }
  const sessionId = suppliedSessionId ?? randomUUID()
  const short = sessionId.slice(0, 8)
  const jobDir = getJobDir(short)
  try {
    await mkdir(jobDir, { recursive: true })
    const separator = args.indexOf('--')
    const beforeSeparator = separator >= 0 ? args.slice(0, separator) : args
    const agentName = optionValue('--agent', beforeSeparator)
    const explicitName =
      optionValue('--name', beforeSeparator) ?? optionValue('-n', beforeSeparator)
    const resumeTarget = parseResumeTarget(beforeSeparator)
    const inferredIntent =
      separator >= 0
        ? args.slice(separator + 1).join(' ')
        : args.findLast(
            (arg) =>
              !arg.startsWith('-') &&
              arg.length > 0 &&
              arg !== resumeTarget &&
              arg !== agentName &&
              arg !== explicitName,
          )
    const resuming = beforeSeparator.some(
      (arg) =>
        arg === '-c' ||
        arg === '--continue' ||
        arg === '-r' ||
        arg === '--resume' ||
        arg.startsWith('--resume=') ||
        arg.startsWith('-r='),
    )
    const explicitFork = beforeSeparator.includes('--fork-session')
    const resumingSelf = resumeTarget !== undefined && resumeTarget === sessionId
    const forkFlags = resuming && !explicitFork ? ['--fork-session'] : []
    const sessionFlags = resumingSelf
      ? []
      : ['--session-id', sessionId, ...forkFlags]
    const cwd = suppliedCwd ?? getCwd()

    let activeAgent:
      | Awaited<ReturnType<typeof getAgentDefinitionsWithOverrides>>['allAgents'][number]
      | undefined
    if (agentName) {
      const definitions = await getAgentDefinitionsWithOverrides(cwd)
      activeAgent = getActiveAgentsFromList(definitions.allAgents).find(
        (agent) => agent.agentType === agentName,
      )
      if (!activeAgent && source === 'shell') {
        process.stderr.write(
          `warning: no agent named '${agentName}' — spawning with default template\n`,
        )
      }
    }

    const rawRespawnFlags = respawnFlags(beforeSeparator)
    const savedRespawnFlags =
      separator >= 0
        ? rawRespawnFlags
        : persistentRespawnFlags(rawRespawnFlags)
    const intent = options?.intent ?? inferredIntent ?? ''
    const idle = !agentName && intent === '' && !options?.detail
    let seeded = false
    let seedWrite: Promise<void> | undefined
    const freshDir = suppliedSessionId === undefined
    const existingState = freshDir ? null : await readJobState(jobDir)
    if (source !== 'fleet' && existingState === null) {
      seedWrite = writeJobState(
        jobDir,
        createInitialJobState({
          template: {
            name: agentName ?? 'bg',
            initialPrompt: activeAgent?.initialPrompt,
          },
          intent,
          name: explicitName ?? options?.name,
          nameSource: explicitName ? 'user' : options?.nameSource,
          respawnFlags: savedRespawnFlags,
          detail:
            options?.detail ??
            (idle ? '(idle — attach to send a prompt)' : undefined),
          tempo: idle ? 'idle' : undefined,
          sessionId,
          cwd,
          worktreePath: options?.worktree?.path,
          worktreeBranch: options?.worktree?.branch,
          worktreeHookBased: options?.worktree?.hookBased,
          originCwd: options?.worktree?.originCwd,
        }),
      )
        .then(() => {
          seeded = true
        })
        .catch(error =>
          logForDebugging(`bg seed state write failed: ${errorMessage(error)}`, {
            level: 'warn',
          }),
        )
    } else if (
      source !== 'fleet' &&
      existingState &&
      savedRespawnFlags.length > 0 &&
      existingState.respawnFlags.length === 0
    ) {
      seedWrite = writeJobState(jobDir, {
        ...existingState,
        respawnFlags: savedRespawnFlags,
      }).catch(error =>
        logForDebugging(`bg respawnFlags patch failed: ${errorMessage(error)}`, {
          level: 'warn',
        }),
      )
    }

    const dispatch: Dispatch = {
      proto: PROTOCOL_VERSION,
      short,
      sessionId,
      createdAt: Date.now(),
      source: source === 'repl' ? 'slash' : source,
      cwd,
      launch:
        resuming && resumeTarget !== undefined
          ? {
              mode: 'resume',
              sessionId: resumeTarget,
              fork: !resumingSelf && (explicitFork || forkFlags.length > 0),
              flagArgs: [
                ...respawnFlags(beforeSeparator),
                ...(separator >= 0 ? args.slice(separator) : []),
              ],
            }
          : {
              mode: 'prompt',
              args: [...sessionFlags, ...stripSessionIdFlags(args)],
            },
      respawnFlags: rawRespawnFlags,
      env: inheritedEnv(),
      reattachEnv,
      worktree: options?.worktree
        ? { path: options.worktree.path, ownershipToken: sessionId }
        : undefined,
      isolation:
        activeAgent?.isolation === 'worktree' &&
        activeAgent.source !== 'built-in'
          ? 'worktree'
          : 'none',
      agent: agentName,
      seed: {
        intent: options?.intent ?? inferredIntent ?? '',
        name: explicitName ?? options?.name,
      },
      cols: process.stdout.columns || undefined,
      rows: process.stdout.rows || undefined,
    }
    await Promise.all([seedWrite ?? Promise.resolve(), sendDispatch(dispatch)]).then(
      async ([, result]) => {
        if (result.ok) return
        if (result.reason === 'ack-timeout' || result.reason === 'enoconn') {
          const live = await requestControl({ proto: PROTOCOL_VERSION, op: 'list' })
          if (
            live.ok &&
            live.op === 'list' &&
            Array.isArray(live.jobs) &&
            live.jobs.some(
              (job) =>
                typeof job === 'object' &&
                job !== null &&
                (job as { short?: unknown }).short === short &&
                (job as { nonce?: unknown }).nonce === result.nonce &&
                !(job as { outcome?: unknown }).outcome,
            )
          ) {
            return
          }
        }
        if (seeded) await rm(jobDir, { recursive: true, force: true }).catch(() => {})
        if (result.reason === 'stale-short') {
          throw new Error('Previous session is still shutting down — try again in a moment')
        }
        throw new Error(
        `Couldn't reach the ${bgSupervisorNoun()} (${dispatchError(result.reason)})${daemonHint('status')}`,
        )
      },
    )
    return { ok: true, short, sessionId, idle }
  } catch (error) {
    if (source !== 'fleet') {
      await rm(jobDir, { recursive: true, force: true }).catch(() => {})
    }
    return {
      ok: false,
      error:
        error instanceof Error &&
        (error.message.startsWith("Couldn't reach") ||
          error.message.startsWith('Previous session'))
          ? error.message
          : `Couldn't start the session — ${String(error)}`,
    }
  }
}

export type SpawnBackgroundForkResult =
  | {
      ok: true
      short: string
      handedOff: boolean
      hadWorktree: boolean
    }
  | { ok: false; error: string }

const BACKGROUND_TITLE_TIMEOUT_MS = 3_000

export async function spawnBackgroundFork(
  seed: ReplBackgroundSeed,
  prompt: string | null,
  effort: EffortValue | undefined,
  via: 'command' | 'left_arrow',
  messages: readonly Message[],
  sessionId?: string,
): Promise<SpawnBackgroundForkResult> {
  const model = getMainLoopModelOverride()
  const effortFlag = typeof effort === 'string' ? effort : undefined
  const resumable = getCurrentSessionFile()
  const worktree = getCurrentWorktreeSession()
  const ownsWorktree = Boolean(worktree && !worktree.enteredExisting)
  const result = await spawnBgSession(
    [
      ...(resumable ? ['--resume', resumable, '--fork-session'] : []),
      ...(model ? ['--model', model] : []),
      ...(effortFlag ? ['--effort', effortFlag] : []),
      ...(prompt === null ? [] : ['--', prompt || 'continue']),
    ],
    sessionId,
    'repl',
    worktree?.worktreePath ?? getCwd(),
    {
      ...seed,
      worktree: ownsWorktree
        ? {
            path: worktree!.worktreePath,
            branch: worktree!.worktreeBranch,
            hookBased: worktree!.hookBased ?? false,
            originCwd: worktree!.originalCwd,
          }
        : undefined,
    },
  ).catch(error => ({
    ok: false as const,
    error: `Couldn't background — ${errorMessage(error)}`,
  }))
  if (!result.ok) {
    logEvent('tengu_background_spawn_failed', {})
    return result
  }
  logEvent('tengu_background', { via_flag: false, via })
  if (worktree) restoreWorktreeSession(null)
  if (seed.name === undefined && result.sessionId) {
    const titlePromise = generateSessionTitle(
      extractConversationText([...messages]),
      AbortSignal.timeout(BACKGROUND_TITLE_TIMEOUT_MS),
    )
      .then(title => {
        if (title) saveAiGeneratedTitle(result.sessionId, title)
      })
      .catch(() => {})
    if (via === 'command') registerCleanup(() => titlePromise)
  }
  return {
    ok: true,
    short: result.short,
    handedOff: ownsWorktree,
    hadWorktree: worktree !== null,
  }
}

async function mountFleetInProcess(
  short: string,
  load: Promise<[
    typeof import('../ink.js'),
    typeof import('../components/FleetView.js'),
  ]>,
): Promise<never> {
  const jobsPromise = listLiveJobs()
    .then(live => readAllJobs(live))
    .catch(() => [])
  await withTimeout(flushSessionStorage(), 2_000, 'flush timeout').catch(() => {})
  const keepAlive = setInterval(() => {}, 1_073_741_824)
  const {
    claimShutdown,
    gracefulShutdown,
    releaseShutdownClaim,
  } = await import('../utils/gracefulShutdown.js')
  claimShutdown()
  const instances = (await import('../ink/instances.js')).default
  instances.get(process.stdout)?.unmount()
  await new Promise<void>(resolve => setImmediate(resolve))
  releaseShutdownClaim()
  process.env.CLAUDE_AGENTS_SELECT = short
  const [{ createRoot }, { mountFleetView, seedLastJobs }] = await load
  const root = await createRoot({ exitOnCtrlC: false })
  clearInterval(keepAlive)
  const jobs = await withTimeout(jobsPromise, 50, 'listJobs seed').catch(
    () => null,
  )
  if (jobs !== null) seedLastJobs(jobs)
  logForDebugging('[PERF:bg-leftarrow-mounted]')
  await mountFleetView(root)
  await gracefulShutdown(0, 'other', { suppressResumeHint: true })
  process.exit(0)
}

/** Fork the foreground transcript and replace the REPL with FleetView. */
export async function openAgentsFromForeground(
  messages: readonly Message[],
  effort: EffortValue | undefined,
): Promise<string> {
  logForDebugging('[PERF:bg-leftarrow-start]')
  const parsed = parseReplBackgroundSeed(messages, '')
  if (parsed !== null && isTranscriptPersistenceDisabled()) {
    return 'Cannot open agents — session persistence is disabled, so this conversation cannot be backgrounded.'
  }
  const seed = parsed ?? { intent: '' }
  const load = Promise.all([
    import('../ink.js'),
    import('../components/FleetView.js'),
  ])
  const sessionId = randomUUID()
  const worktree = getCurrentWorktreeSession()
  const ownsWorktree = Boolean(worktree && !worktree.enteredExisting)
  let short: string
  let jobDir: string
  try {
    ;({ short, jobDir } = await preSeedReplBgJob(sessionId, {
      ...seed,
      cwd: worktree?.worktreePath ?? getCwd(),
      worktree: ownsWorktree
        ? {
            path: worktree!.worktreePath,
            branch: worktree!.worktreeBranch,
            hookBased: worktree!.hookBased ?? false,
            originCwd: worktree!.originalCwd,
          }
        : undefined,
    }))
  } catch (error) {
    return `Cannot open agents — ${error instanceof Error ? error.message : String(error)}`
  }
  void spawnBackgroundFork(
    seed,
    null,
    effort,
    'left_arrow',
    messages,
    sessionId,
  ).then(result => {
    if (!result.ok) {
      void rm(jobDir, { recursive: true, force: false }).catch(() => {})
      logError(new Error(`background spawn failed: ${result.error}`))
    }
  })
  logEvent('tengu_open_agents_via_left', { was_empty: parsed === null })
  const { getFeatureValue_CACHED_MAY_BE_STALE } = await import(
    '../services/analytics/growthbook.js'
  )
  if (
    getFeatureValue_CACHED_MAY_BE_STALE(
      'tengu_bg_leftarrow_inprocess',
      true,
    )
  ) {
    try {
      return await mountFleetInProcess(short, load)
    } catch (error) {
      logError(error)
    }
  }
  return await relaunch({
    args: ['agents'],
    env: { CLAUDE_AGENTS_SELECT: short },
  })
}

export function formatBgHints(short: string, name?: string): string {
  const row = (command: string, detail: string) =>
    chalk.dim(`  ${command.padEnd(26)}${detail}`)
  return [
    `backgrounded · ${chalk.cyan(short)}${name ? chalk.dim(` ${name}`) : ''}`,
    row('claude agents', 'list sessions'),
    row(`claude attach ${short}`, 'open in this terminal'),
    row(`claude logs ${short}`, 'show recent output'),
    row(`claude stop ${short}`, 'stop this session'),
  ].join('\n')
}

const MAX_BACKGROUND_STDIN_BYTES = 1_048_576

export async function readBgStdin(
  stdin: typeof process.stdin = process.stdin,
): Promise<string> {
  if (stdin.isTTY) return ''
  stdin.setEncoding('utf8')
  let input = ''
  let truncated = false
  const onData = (chunk: string) => {
    if (truncated) return
    if (input.length + chunk.length > MAX_BACKGROUND_STDIN_BYTES) {
      input += chunk.slice(0, MAX_BACKGROUND_STDIN_BYTES - input.length)
      truncated = true
      return
    }
    input += chunk
  }
  stdin.on('data', onData)
  const timedOut = await peekForStdinData(stdin, 3_000)
  stdin.off('data', onData)
  if (timedOut) return ''
  if (truncated) {
    process.stderr.write(
      `warning: piped stdin exceeds ${MAX_BACKGROUND_STDIN_BYTES} bytes, truncated\n`,
    )
  }
  return input.replace(/\r?\n$/, '')
}

export function withStdinPositional(args: string[], stdin: string): string[] {
  const separator = args.indexOf('--')
  if (separator >= 0) {
    const positional = args.slice(separator + 1).join(' ')
    return [
      ...args.slice(0, separator),
      '--',
      positional ? `${positional}\n${stdin}` : stdin,
    ]
  }
  let positionalIndex = -1
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!
    if (arg.startsWith('-')) {
      const next = args[index + 1]
      if (
        next !== undefined &&
        (RESPAWN_VALUE_FLAGS.has(arg) || !next.startsWith('-'))
      ) {
        index++
      }
      continue
    }
    positionalIndex = index
  }
  if (positionalIndex >= 0) {
    const combined = [...args]
    combined[positionalIndex] = `${args[positionalIndex]}\n${stdin}`
    return combined
  }
  return [...args, '--', stdin]
}

export async function handleBgFlag(args: string[]): Promise<void> {
  const filteredArgs = args.filter((arg) => !BG_FLAGS.includes(arg))
  const stdin = await readBgStdin()
  const result = await spawnBgSession(
    stdin ? withStdinPositional(filteredArgs, stdin) : filteredArgs,
  )
  if (!result.ok) {
    process.stderr.write(`${result.error}\n`)
    process.exit(1)
    return
  }
  process.stdout.write(
    `${formatBgHints(
      result.short,
      result.idle ? '(idle — attach to send a prompt)' : undefined,
    )}\n`,
  )
}

async function resolveJobPrefix(
  prefix: string | undefined,
  usage: string,
): Promise<string> {
  if (!prefix) {
    process.stderr.write(`Usage: ${usage}\n`)
    process.exit(1)
    throw new Error('unreachable')
  }
  const matches = (await readdir(getJobsDir()).catch(() => []))
    .filter((name) => SHORT_ID_RE.test(name))
    .filter((name) => name.startsWith(prefix))
  if (matches.length === 1) return matches[0]
  process.stderr.write(
    matches.length === 0
      ? `No job matching '${prefix}'. Run 'claude agents' to list running sessions.\n`
      : `Ambiguous prefix '${prefix}', matches: ${matches.join(', ')}\n`,
  )
  process.exit(1)
  throw new Error('unreachable')
}

export async function logsHandler(prefix: string | undefined): Promise<void> {
  const short = await resolveJobPrefix(prefix, 'claude logs <id>')
  const result = await new Promise<string[] | string>((resolve) => {
    const stop = subscribeToJob(
      short,
      500,
      (message) => {
        if (message.type === 'snapshot') {
          stop()
          resolve(
            Array.isArray(message.streamTail)
              ? message.streamTail.filter(
                  (value): value is string => typeof value === 'string',
                )
              : [],
          )
        }
      },
      (error) => {
        stop()
        resolve(error)
      },
    )
  })
  if (typeof result === 'string') {
    process.stderr.write(`Couldn't read logs for ${short} — ${result}\n`)
    process.exit(1)
    return
  }
  process.stdout.write(result.join(''))
}

export type AttachOutcome =
  | { outcome: 'detached'; msg?: string }
  | { outcome: 'disconnected' }
  | { outcome: 'error'; msg: string }

/** Bytes at the end of a chunk that may begin a split detach marker. */
export function detachSuffixLength(buffer: Buffer): number {
  const marker = Buffer.from(DETACH_SEQUENCE, 'ascii')
  const maximum = Math.min(buffer.length, marker.length - 1)
  outer: for (let length = maximum; length > 0; length--) {
    const offset = buffer.length - length
    for (let index = 0; index < length; index++) {
      if (buffer[offset + index] !== marker[index]) continue outer
    }
    return length
  }
  return 0
}

async function attachTerminal(
  short: string,
  options: {
    stdin?: typeof process.stdin
    stdout?: typeof process.stdout
    holdScreenOnDisconnect?: boolean
  } = {},
): Promise<AttachOutcome> {
  const stdin = options.stdin ?? process.stdin
  const stdout = options.stdout ?? process.stdout
  const cols = stdout.columns ?? 120
  const rows = stdout.rows ?? 30
  const attachStartedAt = Date.now()
  let attachAckMs: number | undefined
  let firstFrameRecorded = false
  const recordFirstFrame = () => {
    if (firstFrameRecorded) return
    firstFrameRecorded = true
    logEvent('tengu_bg_attach_first_frame', {
      ms: Date.now() - attachStartedAt,
      ack_ms: attachAckMs,
    })
  }
  let currentCols = cols
  let currentRows = rows
  const attachId = randomUUID()
  const wasRaw = Boolean(stdin.isRaw)
  const socket = connect(getControlSocketPath())
  let acknowledged = false
  let finished = false
  let inputPrefix = false
  let decModes: number[] = []
  let outputBuffer = Buffer.alloc(0)
  let ackBuffer = Buffer.alloc(0)
  return new Promise((resolve) => {
    const finish = (result: AttachOutcome) => {
      if (finished) return
      finished = true
      if (acknowledged) {
        const holdScreen =
          result.outcome === 'disconnected' &&
          options.holdScreenOnDisconnect === true
        stdout.write(leaveAttachedTerminal(decModes, holdScreen))
      }
      if (stdin.setRawMode) stdin.setRawMode(wasRaw)
      stdin.off('readable', onReadable)
      stdout.off('resize', onResize)
      socket.destroy()
      resolve(result)
    }
    const onResize = () => {
      const nextCols = stdout.columns ?? cols
      const nextRows = stdout.rows ?? rows
      if (nextCols < currentCols || nextRows < currentRows) {
        stdout.write(ERASE_SCREEN + CURSOR_HOME)
      }
      currentCols = nextCols
      currentRows = nextRows
      void requestControl({
        proto: PROTOCOL_VERSION,
        op: 'resize',
        short,
        cols: nextCols,
        rows: nextRows,
        attachId,
      })
    }
    const onInput = (chunk: Buffer) => {
      let start = 0
      for (let index = 0; index < chunk.length; index++) {
        const byte = chunk[index]
        if (inputPrefix) {
          inputPrefix = false
          if (index > start) socket.write(chunk.subarray(start, index))
          if (byte === 100) return finish({ outcome: 'detached' })
          socket.write(Buffer.from([2, byte]))
          start = index + 1
        } else if (byte === 2) {
          if (index > start) socket.write(chunk.subarray(start, index))
          start = index + 1
          inputPrefix = true
        }
      }
      if (start < chunk.length) socket.write(chunk.subarray(start))
    }
    const onReadable = () => {
      let chunk: Buffer | string | null
      while ((chunk = stdin.read()) !== null) {
        onInput(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
    }
    const onOutput = (chunk: Buffer) => {
      const combined = outputBuffer.length
        ? Buffer.concat([outputBuffer, chunk])
        : chunk
      const marker = combined.indexOf(DETACH_SEQUENCE)
      if (marker >= 0) {
        const before = combined.subarray(0, marker)
        if (before.length) stdout.write(before)
        recordFirstFrame()
        finish({ outcome: 'detached', msg: parseDetachMessage(before) })
        return
      }
      const keep = detachSuffixLength(combined)
      if (combined.length > keep) stdout.write(combined.subarray(0, combined.length - keep))
      recordFirstFrame()
      outputBuffer = Buffer.from(combined.subarray(combined.length - keep))
    }
    socket.on('data', (chunk) => {
      if (acknowledged) return onOutput(chunk)
      ackBuffer = Buffer.concat([ackBuffer, chunk])
      const newline = ackBuffer.indexOf(10)
      if (newline < 0) return
      let response: {
        ok?: boolean
        op?: string
        code?: string
        error?: string
        decModes?: unknown
      }
      try {
        response = JSON.parse(ackBuffer.subarray(0, newline).toString('utf8'))
      } catch (error) {
        finish({ outcome: 'error', msg: `bad ack: ${errorMessage(error)}` })
        return
      }
      if (!response.ok) {
        finish({
          outcome: 'error',
          msg: `${response.code}: ${response.error}`,
        })
        return
      }
      acknowledged = true
      attachAckMs = Date.now() - attachStartedAt
      decModes =
        response.op === 'attach' &&
        Array.isArray(response.decModes) &&
        response.decModes.every((mode): mode is number => typeof mode === 'number')
          ? response.decModes
          : []
      stdout.write(
        `${enterAttachedTerminal(decModes)}\n  \x1B[2mAttaching…\x1B[0m\n`,
      )
      if (stdin.setRawMode) stdin.setRawMode(true)
      stdin.on('readable', onReadable)
      onReadable()
      stdout.on('resize', onResize)
      const remainder = ackBuffer.subarray(newline + 1)
      if (remainder.length) onOutput(remainder)
    })
    socket.on('error', (error) =>
      finish({ outcome: 'error', msg: errorMessage(error) }),
    )
    socket.once('close', () => {
      if (!finished) finish(acknowledged ? { outcome: 'disconnected' } : { outcome: 'error', msg: 'control socket closed' })
    })
    socket.once('connect', () => {
      socket.write(
        `${JSON.stringify({
          proto: PROTOCOL_VERSION,
          op: 'attach',
          short,
          cols,
          rows,
          attachId,
        })}\n`,
      )
    })
  })
}

export type FleetAttachResult =
  | { kind: 'detached' }
  | { kind: 'error'; msg: string; orphaned?: boolean }

/** Attach without exiting the process so FleetView can safely remount. */
export async function attachJob(short: string): Promise<FleetAttachResult> {
  writeFile(join(getJobDir(short), 'recap.trigger'), '').catch(() => {})
  logForDebugging('[PERF:bg-attach-start]')
  drainStdin()
  const daemonUnavailable = /ENOENT|ECONNREFUSED/
  const daemonStarting = /ERESPAWNING|ESTARTING/
  let outcome = await attachTerminal(short, { holdScreenOnDisconnect: true })
  let daemonStart: Awaited<ReturnType<typeof ensureDaemon>> | undefined
  if (
    outcome.outcome === 'error' &&
    outcome.msg &&
    daemonUnavailable.test(outcome.msg)
  ) {
    daemonStart = await ensureDaemon({ forceTransient: true })
    if (daemonStart.ok) {
      outcome = await attachTerminal(short, { holdScreenOnDisconnect: true })
    }
  }
  for (
    let attempt = 0;
    outcome.outcome === 'error' &&
    outcome.msg &&
    daemonStarting.test(outcome.msg) &&
    attempt < 20;
    attempt++
  ) {
    await delay(500)
    outcome = await attachTerminal(short, { holdScreenOnDisconnect: true })
  }
  if (outcome.outcome === 'disconnected') {
    const column = Math.max(1, (process.stdout.columns ?? 80) - 15)
    process.stdout.write(
      `\x1B7${cursorPosition(1, column)}\x1B[2;7m Reconnecting… \x1B[0m\x1B8`,
    )
    if ((await ensureDaemon({ forceTransient: true })).ok) {
      drainStdin()
      outcome = await attachTerminal(short, { holdScreenOnDisconnect: true })
      for (
        let attempt = 0;
        outcome.outcome === 'error' &&
        outcome.msg.includes('ESTARTING') &&
        attempt < 10;
        attempt++
      ) {
        await delay(200)
        outcome = await attachTerminal(short, { holdScreenOnDisconnect: true })
      }
      if (outcome.outcome === 'error' && outcome.msg.includes('ENOJOB')) {
        process.stdout.write(exitAttachedScreen())
        return { kind: 'error', msg: 'That job has exited — back to the list' }
      }
    }
    if (outcome.outcome === 'disconnected') {
      process.stdout.write(exitAttachedScreen())
      return {
        kind: 'error',
        msg: 'Disconnected — the job should still be running. Press Enter to retry',
      }
    }
    if (outcome.outcome === 'error') process.stdout.write(exitAttachedScreen())
  }
  if (outcome.outcome === 'error') {
    if (outcome.msg.includes('ENOJOB')) {
      return {
        kind: 'error',
        orphaned: true,
        msg: `${bgSupervisorNounCap()} lost track of this job — press Enter to respawn it`,
      }
    }
    if (daemonStart && !daemonStart.ok) {
      return {
        kind: 'error',
        msg: `Couldn't start the ${bgSupervisorNoun()} — ${daemonStart.reason}`,
      }
    }
    return {
      kind: 'error',
      msg: daemonStarting.test(outcome.msg)
        ? `${bgSupervisorNounCap()} is still starting — try again in a moment`
        : daemonUnavailable.test(outcome.msg)
          ? `${bgSupervisorNounCap()} didn't respond after starting — try again in a moment`
          : `Couldn't attach — ${outcome.msg}`,
    }
  }
  logForDebugging('[PERF:bg-attach-end]')
  return { kind: 'detached' }
}

export async function attachHandler(prefix: string | undefined): Promise<void> {
  const short = await resolveJobPrefix(prefix, 'claude attach <id>')
  const daemon = await ensureDaemonInteractive()
  if (!daemon.ok) {
    process.stderr.write(
      `Couldn't attach — ${bgSupervisorNoun()} is unavailable (${daemon.reason})${daemonHint('status')}\n`,
    )
    process.exit(1)
    return
  }
  let connectedAt = Date.now()
  let outcome = await attachTerminal(short)
  for (
    let attempt = 0;
    outcome.msg && /ERESPAWNING|ESTARTING/.test(outcome.msg) && attempt < 20;
    attempt++
  ) {
    if (attempt === 0 && outcome.msg.includes('ERESPAWNING')) {
      process.stderr.write('Migrating job to attachable PTY…\n')
    }
    await delay(500)
    connectedAt = Date.now()
    outcome = await attachTerminal(short)
  }
  if (
    outcome.outcome === 'disconnected' &&
    Date.now() - connectedAt < 2_000
  ) {
    const listed = await requestControl({
      proto: PROTOCOL_VERSION,
      op: 'list',
    })
    if (
      listed.ok &&
      listed.op === 'list' &&
      Array.isArray(listed.jobs) &&
      listed.jobs.some(
        job =>
          job &&
          typeof job === 'object' &&
          (job as { short?: unknown }).short === short &&
          !(job as { outcome?: unknown }).outcome,
      )
    ) {
      process.stderr.write(`Session ${short} is respawning — reconnecting…\n`)
      await delay(500)
      outcome = await attachTerminal(short)
    }
  }
  if (outcome.outcome === 'detached' && outcome.msg) {
    process.stderr.write(`${outcome.msg}\n`)
  }
  if (outcome.outcome === 'disconnected') {
    process.stderr.write(
      `Session ${short} closed the connection — it may have exited or be respawning. Run \`claude attach ${short}\` to try again.\n`,
    )
  }
  if (outcome.outcome === 'error') {
    const detail = outcome.msg.includes('ERESPAWNING')
      ? 'Job is respawning after an upgrade — try attach again in a moment.'
      : /ENOENT|ECONNREFUSED|ESTARTING/.test(outcome.msg)
        ? `${bgSupervisorNounCap()} is restarting — try again in a moment.`
        : outcome.msg || 'unknown'
    process.stderr.write(`Couldn't attach to ${short} — ${detail}\n`)
  }
  process.exit(outcome.outcome === 'error' ? 1 : 0)
}

export async function stopHandler(prefix: string | undefined): Promise<void> {
  const short = await resolveJobPrefix(prefix, 'claude stop <id>')
  const result = await killJob(short)
  if (!result.confirmed) {
    process.stderr.write(
      result.error
        ? `couldn't confirm ${short} was stopped — ${result.error}\n`
        : `couldn't confirm ${short} was stopped — the background service may be restarting. Try again in a moment.\n`,
    )
    process.exit(1)
    return
  }
  process.stdout.write(`stopped ${short}\n`)
  const state = await readJobState(getJobDir(short))
  await logEventTo1PAwaitable('tengu_bg_agent_action', {
    action: 'stop',
    source: 'cli',
    jobSessionId: state?.sessionId ?? '',
  })
  if (state?.worktreePath) {
    process.stdout.write(
      `  worktree retained at ${state.worktreePath}\n  run 'claude rm ${short}' to remove worktree and job state\n`,
    )
  }
}

/** Compatibility alias for older callers; the user-facing command is `stop`. */
export const killHandler = stopHandler

export async function deleteBgJob(
  short: string,
): Promise<{ removed: boolean; error?: string }> {
  const state = await readJobState(getJobDir(short))
  const stopped = await killJob(short, state ?? undefined).catch(error => ({
    confirmed: false,
    error: errorMessage(error),
  }))
  if (!stopped.confirmed) {
    logForDebugging(
      `deleteJob: kill unconfirmed for ${short} — skipping jobdir/worktree removal to avoid stranding a live worker`,
      { level: 'warn' },
    )
    return { removed: false, error: stopped.error }
  }
  if (state?.worktreePath) {
    const { dirty, gitError } = await getAgentWorktreeChanges(
      state.worktreePath,
    )
    if (dirty && !gitError) {
      logForDebugging(
        `deleteJob: worktree has uncommitted changes, kept ${state.worktreePath}`,
        { level: 'warn' },
      )
    } else {
      await removeAgentWorktree(
        state.worktreePath,
        state.worktreeBranch,
        findGitRoot(state.originCwd ?? state.worktreePath) ?? undefined,
        state.worktreeHookBased,
        'job_delete',
      ).catch(() => false)
    }
  }
  await rm(getJobDir(short), { recursive: true, force: false }).catch(() => {})
  return { removed: true }
}

export async function rmHandler(prefix: string | undefined): Promise<void> {
  const short = await resolveJobPrefix(prefix, 'claude rm <id>')
  const state = await readJobState(getJobDir(short))
  const result = await deleteBgJob(short)
  if (!result.removed) {
    process.stderr.write(
      `couldn't confirm ${short} was stopped — ${result.error ?? 'the background service may be restarting. Try again in a moment.'}\n`,
    )
    process.exit(1)
    return
  }
  await logEventTo1PAwaitable('tengu_bg_agent_action', {
    action: 'delete',
    source: 'cli',
    jobSessionId: state?.sessionId ?? '',
  })
  process.stdout.write(
    `removed ${short}${state?.worktreePath ? `\n  worktree: ${state.worktreePath}` : ''}\n`,
  )
}

export async function respawnBgJob(
  short: string,
  options?: {
    knownAlive?: boolean
    knownState?: JobState
    force?: boolean
    initialPrompt?: string
  },
): Promise<
  | { ok: true; state: JobState }
  | { ok: false; error: string; alive?: boolean; state?: JobState }
> {
  if (options?.knownAlive && options.knownState && !options.force) {
    return {
      ok: false,
      alive: true,
      state: options.knownState,
      error: `Session ${short} is already running`,
    }
  }
  const jobDir = getJobDir(short)
  const state = options?.knownState ?? (await readJobState(jobDir))
  if (!state) {
    return {
      ok: false,
      alive: false,
      error: "Can't respawn — that job's saved state is missing",
    }
  }
  const wasAlive = await isBackgroundJobAlive(short)
  if (!options?.force && wasAlive) {
    return {
      ok: false,
      alive: true,
      state,
      error: `Session ${short} is already running`,
    }
  }
  const freshState = options?.knownState
    ? ((await readJobState(jobDir)) ?? state)
    : state
  const stopped = await killJob(short, state)
  if (wasAlive && !stopped.confirmed) {
    logEvent('tengu_bg_respawn_unconfirmed_bail', {})
    return {
      ok: false,
      alive: true,
      state,
      error:
        stopped.error ??
        "Couldn't stop the previous worker — supervisor may be starting, retry in a moment",
    }
  }
  const deadline = Date.now() + 3_000
  while ((await isBackgroundJobAlive(short)) && Date.now() < deadline) {
    await delay(100)
  }
  const transcript = join(
    getProjectDir(await canonicalizePath(state.cwd)),
    `${state.sessionId}.jsonl`,
  )
  const exists = await hasTranscriptMessages(transcript)
  if (!exists) await rm(transcript, { force: false }).catch(() => {})
  const templateArgs =
    state.respawnFlags.length > 0
      ? state.respawnFlags
      : state.routine
        ? ['--routine', state.routine]
        : state.template !== 'bg'
          ? ['--agent', state.template]
          : []
  const initialPrompt = options?.initialPrompt ?? (exists ? undefined : state.intent)
  const args = [
    ...(exists ? ['--resume', state.sessionId] : []),
    ...templateArgs,
    ...(initialPrompt ? ['--', initialPrompt] : []),
  ]
  const spawned = await spawnBgSession(
    args,
    state.sessionId,
    'fleet',
    state.cwd,
    undefined,
    state.bridgeSessionId
      ? {
          CLAUDE_BRIDGE_REATTACH_SESSION: state.bridgeSessionId,
          ...(state.bridgeSessionSeq !== undefined &&
          state.bridgeSessionSeq > 0
            ? {
                CLAUDE_BRIDGE_REATTACH_SEQ: String(state.bridgeSessionSeq),
              }
            : {}),
        }
      : undefined,
  )
  if (!spawned.ok) return { ok: false, error: spawned.error, alive: false }
  logEvent('tengu_bg_agent_action', {
    action: 'respawn',
    agent: state.template,
    wasSettled: isTerminalState(state.state),
  })
  const nextState: JobState = {
    ...freshState,
    ...(options?.initialPrompt
      ? {
          detail: options.initialPrompt.replace(/[\r\n]+/g, ' ').slice(0, 80),
        }
      : {}),
    ...(initialPrompt
      ? {
          tempo: 'active' as const,
          needs: undefined,
          output: null,
          inFlight: undefined,
        }
      : { inFlight: { tasks: 0, queued: 0, kinds: [] } }),
    ...(!exists ? { firstTerminalAt: null } : {}),
    updatedAt: new Date().toISOString(),
    backend: 'daemon',
  }
  await writeJobState(jobDir, nextState).catch(() => {})
  return { ok: true, state: nextState }
}

export async function respawnHandler(target: string | undefined): Promise<void> {
  if (!target) {
    process.stderr.write('usage: claude respawn <id>|--all\n')
    process.exitCode = 1
    return
  }
  const daemon = await ensureDaemonInteractive()
  if (!daemon.ok) {
    process.stderr.write(
      `Couldn't respawn — ${bgSupervisorNoun()} is unavailable (${daemon.reason})${daemonHint('status')}\n`,
    )
    process.exitCode = 1
    return
  }
  if (target === '--all') {
    const jobs = (await readAllJobs()).filter(
      (job) => !isTerminalState(job.state.state),
    )
    if (!jobs.length) {
      process.stdout.write('no live jobs to respawn\n')
      return
    }
    for (const job of jobs) {
      const result = await respawnBgJob(job.id, {
        force: true,
        knownState: job.state,
      })
      if (result.ok) process.stdout.write(`respawned ${job.id}\n`)
      else {
        process.stderr.write(`${job.id}: ${result.error}\n`)
        process.exitCode = 1
      }
    }
    return
  }
  const short = await resolveJobPrefix(target, 'claude respawn <id>|--all')
  const result = await respawnBgJob(short, { force: true })
  if (!result.ok) {
    process.stderr.write(`${result.error}\n`)
    process.exitCode = 1
  } else process.stdout.write(`respawned ${short}\n`)
}
