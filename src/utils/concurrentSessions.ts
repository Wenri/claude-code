import { feature } from 'bun:bundle'
import { statSync } from 'fs'
import { chmod, mkdir, readdir, readFile, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { z } from 'zod/v4'
import {
  getOriginalCwd,
  getSessionId,
  onSessionSwitch,
} from '../bootstrap/state.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../services/analytics/index.js'
import { registerCleanup } from './cleanupRegistry.js'
import { logForDebugging } from './debug.js'
import { getClaudeConfigHomeDir } from './envUtils.js'
import { errorMessage, isFsInaccessible } from './errors.js'
import {
  getCurrentProcessStartToken,
  isProcessRunning,
  processStartTokenMatches,
} from './genericProcessUtils.js'
import { lazySchema } from './lazySchema.js'
import { getPlatform } from './platform.js'
import { jsonParse, jsonStringify } from './slowOperations.js'
import { getAgentId } from './teammate.js'
import { lazySchema } from './lazySchema.js'

export type SessionKind = 'interactive' | 'bg' | 'daemon' | 'daemon-worker'
export type SessionStatus = 'busy' | 'idle' | 'waiting'

export interface ConcurrentSession {
  pid: number
  sessionId?: string
  cwd?: string
  startedAt: number
  version?: string
  kind?: SessionKind
  entrypoint?: string
  name?: string
  logPath?: string
  agent?: string
  status?: SessionStatus
  waitingFor?: string
  updatedAt?: number
  state?: string
  detail?: string
  tempo?: 'active' | 'idle' | 'blocked'
  needs?: string
  bridgeSessionId?: string
  messagingSocketPath?: string
  procStart?: string
}

const ConcurrentSessionSchema = lazySchema(() =>
  z.object({
    pid: z.number(),
    sessionId: z.string(),
    cwd: z.string().optional(),
    startedAt: z.number(),
    version: z.string().optional(),
    kind: z.enum(['interactive', 'bg', 'daemon', 'daemon-worker']),
  }),
)

type PriorUncleanSession = z.infer<ReturnType<typeof ConcurrentSessionSchema>>

// Crash details are collected only on the first complete registry scan. Later
// scans still sweep dead PID files, but do not repeatedly attribute the same
// startup's stale-session set while concurrent-session telemetry is polled.
const priorUncleanSessions: PriorUncleanSession[] = []
let hasScannedPriorUncleanSessions = false

function getSessionsDir(): string {
  return join(getClaudeConfigHomeDir(), 'sessions')
}

const FLEETVIEW_HEARTBEAT = '.fleetview-heartbeat'
const FLEETVIEW_HEARTBEAT_TTL_MS = 5_000
let fleetViewHeartbeatCache: { at: number; value: boolean } | undefined

/** True while a FleetView process is actively watching this session set. */
export function isFleetViewWatching(): boolean {
  const now = Date.now()
  if (fleetViewHeartbeatCache && now - fleetViewHeartbeatCache.at < 1_000) {
    return fleetViewHeartbeatCache.value
  }
  let value = false
  try {
    value =
      now - statSync(join(getSessionsDir(), FLEETVIEW_HEARTBEAT)).mtimeMs <
      FLEETVIEW_HEARTBEAT_TTL_MS
  } catch (error) {
    if (!isFsInaccessible(error)) {
      logForDebugging(
        `[concurrentSessions] heartbeat stat failed: ${errorMessage(error)}`,
      )
    }
  }
  fleetViewHeartbeatCache = { at: now, value }
  return value
}

export async function clearFleetViewHeartbeat(): Promise<void> {
  try {
    await unlink(join(getSessionsDir(), FLEETVIEW_HEARTBEAT))
  } catch {}
}

/**
 * Kind override from env. Set by the spawner (`claude --bg`, daemon
 * supervisor) so the child can register without the parent having to
 * write the file for it — cleanup-on-exit wiring then works for free.
 * Gated so the env-var string is DCE'd from external builds.
 */
function envSessionKind(): SessionKind | undefined {
  if (feature('BG_SESSIONS')) {
    const k = process.env.CLAUDE_CODE_SESSION_KIND
    if (k === 'bg' || k === 'daemon' || k === 'daemon-worker') return k
  }
  return undefined
}

/**
 * True when this REPL is running inside a `claude --bg` tmux session.
 * Exit paths (/exit, ctrl+c, ctrl+d) should detach the attached client
 * instead of killing the process.
 */
export function isBgSession(): boolean {
  return envSessionKind() === 'bg'
}

/**
 * Write a PID file for this session and register cleanup.
 *
 * Registers all top-level sessions — interactive CLI, SDK (vscode, desktop,
 * typescript, python, -p), bg/daemon spawns — so `claude ps` sees everything
 * the user might be running. Skips only teammates/subagents, which would
 * conflate swarm usage with genuine concurrency and pollute ps with noise.
 *
 * Returns true if registered, false if skipped.
 * Errors logged to debug, never thrown.
 */
export async function registerSession(): Promise<boolean> {
  if (getAgentId() != null) return false

  const kind: SessionKind = envSessionKind() ?? 'interactive'
  const dir = getSessionsDir()
  const pidFile = join(dir, `${process.pid}.json`)

  registerCleanup(async () => {
    try {
      await unlink(pidFile)
    } catch {
      // ENOENT is fine (already deleted or never written)
    }
  })

  try {
    await mkdir(dir, { recursive: true, mode: 0o700 })
    await chmod(dir, 0o700)
    await writeFile(
      pidFile,
      jsonStringify({
        pid: process.pid,
        sessionId: getSessionId(),
        cwd: getOriginalCwd(),
        startedAt: Date.now(),
        procStart: getCurrentProcessStartToken(),
        version: typeof MACRO !== 'undefined' ? MACRO.VERSION : 'unknown',
        peerProtocol: 1,
        kind,
        entrypoint: process.env.CLAUDE_CODE_ENTRYPOINT,
        ...(feature('UDS_INBOX')
          ? { messagingSocketPath: process.env.CLAUDE_CODE_MESSAGING_SOCKET }
          : {}),
        ...(feature('BG_SESSIONS')
          ? {
              name: process.env.CLAUDE_CODE_SESSION_NAME,
              logPath: process.env.CLAUDE_CODE_SESSION_LOG,
              agent: process.env.CLAUDE_CODE_AGENT,
            }
          : {}),
      }),
    )
    // --resume / /resume mutates getSessionId() via switchSession. Without
    // this, the PID file's sessionId goes stale and `claude ps` sparkline
    // reads the wrong transcript.
    onSessionSwitch(id => {
      void updatePidFile({ sessionId: id })
    })
    return true
  } catch (e) {
    logForDebugging(`[concurrentSessions] register failed: ${errorMessage(e)}`)
    return false
  }
}

/**
 * Update this session's name in its PID registry file so ListPeers
 * can surface it. Best-effort: silently no-op if name is falsy, the
 * file doesn't exist (session not registered), or read/write fails.
 */
async function updatePidFile(patch: Record<string, unknown>): Promise<void> {
  const pidFile = join(getSessionsDir(), `${process.pid}.json`)
  try {
    const data = jsonParse(await readFile(pidFile, 'utf8')) as Record<
      string,
      unknown
    >
    await writeFile(pidFile, jsonStringify({ ...data, ...patch }))
  } catch (e) {
    logForDebugging(
      `[concurrentSessions] updatePidFile failed: ${errorMessage(e)}`,
    )
  }
}

export async function updateSessionName(
  name: string | undefined,
): Promise<void> {
  if (!name) return
  await updatePidFile({ name })
}

/**
 * Record this session's Remote Control session ID so peer enumeration can
 * dedup: a session reachable over both UDS and bridge should only appear
 * once (local wins). Cleared on bridge teardown so stale IDs don't
 * suppress a legitimately-remote session after reconnect.
 */
export async function updateSessionBridgeId(
  bridgeSessionId: string | null,
): Promise<void> {
  await updatePidFile({ bridgeSessionId })
}

/**
 * Push live activity state for `claude ps`. Fire-and-forget from REPL's
 * status-change effect — a dropped write just means ps falls back to
 * transcript-tail derivation for one refresh.
 */
export async function updateSessionActivity(patch: {
  status?: SessionStatus
  waitingFor?: string
  state?: string
  detail?: string
  tempo?: 'active' | 'idle' | 'blocked'
  needs?: string
}): Promise<void> {
  if (!feature('BG_SESSIONS')) return
  await updatePidFile({ ...patch, updatedAt: Date.now() })
}

/**
 * Count live concurrent CLI sessions (including this one).
 * Filters out stale PID files (crashed sessions) and deletes them.
 * Returns 0 on any error (conservative).
 */
export async function countConcurrentSessions(): Promise<number> {
  const dir = getSessionsDir()
  let files: string[]
  try {
    files = await readdir(dir)
  } catch (e) {
    if (!isFsInaccessible(e)) {
      logForDebugging(`[concurrentSessions] readdir failed: ${errorMessage(e)}`)
    }
    return 0
  }

  let count = 0
  for (const file of files) {
    // Strict filename guard: only `<pid>.json` is a candidate. parseInt's
    // lenient prefix-parsing means `2026-03-14_notes.md` would otherwise
    // parse as PID 2026 and get swept as stale — silent user data loss.
    // See anthropics/claude-code#34210.
    if (!/^\d+\.json$/.test(file)) continue
    const pid = parseInt(file.slice(0, -5), 10)
    if (pid === process.pid) {
      count++
      continue
    }
    if (isProcessRunning(pid)) {
      count++
    } else if (getPlatform() !== 'wsl') {
      // Stale file from a crashed session — sweep it. Skip on WSL: if
      // ~/.claude/sessions/ is shared with Windows-native Claude (symlink
      // or CLAUDE_CONFIG_DIR), a Windows PID won't be probeable from WSL
      // and we'd falsely delete a live session's file. This is just
      // telemetry so conservative undercount is acceptable.
      const stalePath = join(dir, file)
      const parsed = hasScannedPriorUncleanSessions
        ? null
        : await readFile(stalePath, 'utf8')
            .then(contents =>
              ConcurrentSessionSchema().safeParse(jsonParse(contents)),
            )
            .catch(() => null)
      const removed = await unlink(stalePath).then(
        () => true,
        () => false,
      )
      if (
        removed &&
        parsed?.success &&
        parsed.data.kind === 'interactive'
      ) {
        priorUncleanSessions.push(parsed.data)
        logForDebugging(
          `Prior session exited uncleanly: ${parsed.data.sessionId} (v${parsed.data.version ?? '?'})`,
        )
        logEvent('tengu_unclean_exit', {
          session_age_sec: Math.round(
            (Date.now() - parsed.data.startedAt) / 1000,
          ),
          prior_version: (parsed.data.version ??
            'unknown') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          on_current_version: parsed.data.version === MACRO.VERSION,
          prior_session_id:
            parsed.data.sessionId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
      }
    }
  }
  if (!hasScannedPriorUncleanSessions) {
    priorUncleanSessions.sort(
      (left, right) => right.startedAt - left.startedAt,
    )
    hasScannedPriorUncleanSessions = true
  }
  return count
}

/**
 * Return the live local session registry used by FleetView.  Stale PID files
 * are removed on platforms where a PID probe is authoritative.  The process
 * birth token prevents a recycled PID from making an old session look live.
 */
export async function listAllLiveSessions(): Promise<ConcurrentSession[]> {
  const dir = getSessionsDir()
  let files: string[]
  try {
    files = await readdir(dir)
  } catch {
    return []
  }

  const candidates = await Promise.all(
    files
      .filter(file => /^\d+\.json$/.test(file))
      .map(async file => {
        const pid = Number(file.slice(0, -5))
        try {
          const raw = jsonParse(await readFile(join(dir, file), 'utf8')) as Record<
            string,
            unknown
          >
          const kind =
            raw.kind === 'interactive' ||
            raw.kind === 'bg' ||
            raw.kind === 'daemon' ||
            raw.kind === 'daemon-worker'
              ? raw.kind
              : undefined
          const status =
            raw.status === 'busy' || raw.status === 'idle' || raw.status === 'waiting'
              ? raw.status
              : undefined
          const tempo =
            raw.tempo === 'active' || raw.tempo === 'idle' || raw.tempo === 'blocked'
              ? raw.tempo
              : undefined
          return {
            file,
            session: {
              pid,
              sessionId:
                typeof raw.sessionId === 'string' ? raw.sessionId : undefined,
              cwd: typeof raw.cwd === 'string' ? raw.cwd : undefined,
              startedAt:
                typeof raw.startedAt === 'number' ? raw.startedAt : 0,
              version: typeof raw.version === 'string' ? raw.version : undefined,
              kind,
              entrypoint:
                typeof raw.entrypoint === 'string' ? raw.entrypoint : undefined,
              name: typeof raw.name === 'string' ? raw.name : undefined,
              logPath: typeof raw.logPath === 'string' ? raw.logPath : undefined,
              agent: typeof raw.agent === 'string' ? raw.agent : undefined,
              status,
              waitingFor:
                typeof raw.waitingFor === 'string' ? raw.waitingFor : undefined,
              updatedAt:
                typeof raw.updatedAt === 'number' ? raw.updatedAt : undefined,
              state: typeof raw.state === 'string' ? raw.state : undefined,
              detail: typeof raw.detail === 'string' ? raw.detail : undefined,
              tempo,
              needs: typeof raw.needs === 'string' ? raw.needs : undefined,
              bridgeSessionId:
                typeof raw.bridgeSessionId === 'string'
                  ? raw.bridgeSessionId
                  : undefined,
              messagingSocketPath:
                typeof raw.messagingSocketPath === 'string'
                  ? raw.messagingSocketPath
                  : undefined,
              procStart:
                typeof raw.procStart === 'string' ? raw.procStart : undefined,
            } satisfies ConcurrentSession,
          }
        } catch {
          return null
        }
      }),
  )

  const live: ConcurrentSession[] = []
  for (const candidate of candidates) {
    if (!candidate) continue
    const { file, session } = candidate
    const running = isProcessRunning(session.pid)
    if (running && (await processStartTokenMatches(session.pid, session.procStart))) {
      live.push(session)
    } else if (!running && getPlatform() !== 'wsl') {
      void unlink(join(dir, file)).catch(() => {})
    }
  }
  return live
}
