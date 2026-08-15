import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  unlink,
  writeFile,
} from 'fs/promises'
import { createServer, Socket, type Server } from 'net'
import { basename, dirname, join } from 'path'
import { StringDecoder } from 'string_decoder'
import chokidar, { type FSWatcher } from 'chokidar'
import { logEvent } from '../services/analytics/index.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { bgSupervisorNoun } from '../utils/agentsFleet.js'
import { atomicWriteFile } from '../utils/atomicWrite.js'
import { logForDebugging } from '../utils/debug.js'
import { getErrnoCode, isENOENT } from '../utils/errors.js'
import {
  getProcessStartToken,
  getProcessStartTokenAsync,
  isProcessRunning,
} from '../utils/genericProcessUtils.js'
import { logError } from '../utils/log.js'
import { isInBundledMode } from '../utils/bundledMode.js'
import type { RelaunchLauncher } from '../utils/relaunch.js'
import {
  canonicalizePath,
  getProjectDir,
} from '../utils/sessionStoragePortable.js'
import { hasTranscriptMessages } from '../utils/transcriptValidation.js'
import { withTimeout } from '../utils/sleep.js'
import {
  isSettledJob,
  readJobState,
  writeJobState,
  getJobDir,
} from './jobs.js'
import {
  cleanupStaleRuntimeDirs,
  ensureDaemonDir,
  ensureDaemonRuntimeDir,
  getControlSocketPath,
  getDaemonRuntimeDir,
  getDispatchDir,
  getPtyDir,
  getPtyErrorPath,
  getPtyPidDir,
  getPtyPidPath,
  getPtySocketPath,
  getRejectedDispatchDir,
  getRendezvousDir,
  getRendezvousSocketPath,
  getRosterPath,
} from './paths.js'
import {
  ControlMessageSchema,
  DETACH_SEQUENCE,
  DispatchSchema,
  ManifestSchema,
  MIN_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  type Dispatch,
  type Manifest,
  type WorkerRecord,
} from './protocol.js'
import { connectPtyHost, type PtyClient } from './ptyClient.js'
import { killWorkerThroughPty } from './orphanReaper.js'
import { controlPeerMatchesCurrentUser } from './peerCredentials.js'
import {
  killSparePty,
  reapOrphanSpares,
  sendSpareClaim,
  spawnSpare,
  type SpareProcess,
} from './spare.js'

const MAX_SOCKET_BUFFER = 1_048_576
const MAX_DISPATCH_BYTES = 262_144
const MAX_DISPATCH_AGE_MS = 86_400_000
const MAX_RESPAWN_ATTEMPTS = 20
const RESPAWN_DELAY_MS = 10_000
const TRACKED_DEC_MODES = new Set([1000, 1002, 1003, 1004, 1006, 2004, 2031])
const DEC_MODE_SEQUENCE = /\x1b\[\?([\d;]+)([hl])/g

type Dispose = () => void

export type SpawnPty = (
  command: string,
  args: string[],
  options: {
    cols: number
    rows: number
    cwd: string
    env: NodeJS.ProcessEnv
    ptySock: string
  },
) => PtyClient

type WorkerOutcome = NonNullable<BackgroundRecord['outcome']>
export type WorkerPhase =
  | { kind: 'spawning' }
  | { kind: 'running' }
  | { kind: 'upgrading' }
  | { kind: 'retiring'; reason: 'reap' | 'grace' | 'stop' }
  | { kind: 'retired'; outcome: WorkerOutcome }

function phaseLabel(phase: WorkerPhase): string {
  if (phase.kind === 'retiring') return `retiring:${phase.reason}`
  if (phase.kind === 'retired') return `retired:${phase.outcome}`
  return phase.kind
}

function canTransition(from: WorkerPhase, to: WorkerPhase): boolean {
  if (from.kind === 'retired') return false
  switch (to.kind) {
    case 'spawning':
      return from.kind === 'upgrading' || from.kind === 'running'
    case 'running':
      return from.kind === 'spawning'
    case 'upgrading':
      return from.kind === 'running'
    case 'retiring':
    case 'retired':
      return true
  }
}

function pinnedWorkerLauncher(): RelaunchLauncher {
  if (isInBundledMode()) return { cmd: process.execPath, prefixArgs: [] }
  const script = process.argv[1]
  return script
    ? { cmd: process.execPath, prefixArgs: [script] }
    : { cmd: process.execPath, prefixArgs: [] }
}

function defaultSpawnPty(): SpawnPty | undefined {
  if (typeof Bun === 'undefined') return undefined
  return (command, args, options) => {
    const launcher = pinnedWorkerLauncher()
    const child = Bun.spawn(
      [
        launcher.cmd,
        ...launcher.prefixArgs,
        '--bg-pty-host',
        options.ptySock,
        String(options.cols),
        String(options.rows),
        '--',
        command,
        ...args,
      ],
      {
        cwd: options.cwd,
        env: options.env,
        stdio: ['ignore', 'ignore', 'ignore'],
        detached: true,
      },
    )
    child.unref()
    return connectPtyHost(options.ptySock, child.pid)
  }
}

function createDecModeTracker() {
  const enabled = new Set<number>()
  let pending = ''
  return {
    feed(data: string) {
      const combined = pending ? pending + data : data
      DEC_MODE_SEQUENCE.lastIndex = 0
      let match: RegExpExecArray | null
      let consumed = 0
      while ((match = DEC_MODE_SEQUENCE.exec(combined)) !== null) {
        const set = match[2] === 'h'
        for (const value of match[1].split(';')) {
          const mode = Number(value)
          if (!TRACKED_DEC_MODES.has(mode)) continue
          if (set) enabled.add(mode)
          else enabled.delete(mode)
        }
        consumed = match.index + match[0].length
      }
      const suffix = combined.slice(Math.max(consumed, combined.length - 16))
      const escape = suffix.lastIndexOf('\x1b')
      pending =
        escape >= 0 && /^\x1b(\[(\?[\d;]*)?)?$/.test(suffix.slice(escape))
          ? suffix.slice(escape)
          : ''
    },
    snapshot() {
      return [...enabled]
    },
  }
}

function createSignal<T>() {
  const listeners = new Set<(value: T) => void>()
  return {
    emit(value: T) {
      for (const listener of listeners) listener(value)
    },
    subscribe(listener: (value: T) => void): Dispose {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export interface BackgroundRecord {
  short: string
  nonce?: string
  sessionId: string
  pid: number
  attempt: number
  startedAt: number
  cwd: string
  backend: 'daemon'
  tempo: 'active' | 'idle'
  state: string
  detail: string
  intent: string
  name?: string
  agent?: string
  routine?: string
  worktreePath?: string
  cliVersion?: string
  messagingSock?: string
  legacy?: boolean
  outcome?: 'done' | 'failed' | 'crashed' | 'killed'
  settledAt?: number
}

export interface AuthSnapshot {
  accessToken?: string
  subscriptionType?: string
  rateLimitTier?: string
}

function launchArgs(
  dispatch: Dispatch,
  attempt: number,
  currentTranscriptValid: boolean,
  resumeSessionId: string,
  respawnFlags: string[],
): string[] {
  if (attempt > 1 && currentTranscriptValid) {
    return ['--resume', resumeSessionId, ...respawnFlags]
  }
  if (dispatch.launch.mode === 'resume') {
    return [
      ...(dispatch.launch.fork
        ? ['--session-id', dispatch.sessionId, '--fork-session']
        : []),
      '--resume',
      dispatch.launch.sessionId,
      ...dispatch.launch.flagArgs,
    ]
  }
  return dispatch.launch.args
}

const strippedInheritedEnv = [
  'CLAUDE_CODE_QUESTION_PREVIEW_FORMAT',
  'GITHUB_ACTIONS',
  'CLAUDECODE',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_EXECPATH',
  'TERM_PROGRAM',
  'TERM_PROGRAM_VERSION',
  '__CFBundleIdentifier',
  'KITTY_WINDOW_ID',
  'WT_SESSION',
  'KONSOLE_VERSION',
  'VTE_VERSION',
  'ZED_TERM',
  'ZELLIJ',
  'TMUX',
  'STY',
]

function jobEnvironment(
  dispatch: Dispatch,
  jobDir: string,
  rendezvousSocket: string,
  auth?: AuthSnapshot,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...dispatch.env,
    ...(process.platform === 'darwin' && auth?.accessToken
      ? {
          CLAUDE_CODE_OAUTH_TOKEN: auth.accessToken,
          ...(auth.subscriptionType
            ? { CLAUDE_CODE_SUBSCRIPTION_TYPE: auth.subscriptionType }
            : {}),
          ...(auth.rateLimitTier
            ? { CLAUDE_CODE_RATE_LIMIT_TIER: auth.rateLimitTier }
            : {}),
        }
      : {}),
    CLAUDE_CODE_SESSION_KIND: 'bg',
    CLAUDE_BG_BACKEND: 'daemon',
    CLAUDE_ENABLE_STREAM_WATCHDOG: '1',
    CLAUDE_BG_SOURCE: dispatch.source,
    CLAUDE_JOB_DIR: jobDir,
    CLAUDE_CODE_SESSION_NAME:
      dispatch.seed?.name || dispatch.seed?.intent || dispatch.short,
    CLAUDE_BG_RENDEZVOUS_SOCK: rendezvousSocket,
    FORCE_COLOR: '3',
    COLORTERM: 'truecolor',
    BROWSER: 'true',
  }
  if (process.env.CLAUDE_CONFIG_DIR) {
    env.CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR
  }
  if (dispatch.isolation === 'worktree') env.CLAUDE_BG_ISOLATION = 'worktree'
  for (const key of strippedInheritedEnv) {
    if (!dispatch.env?.[key]) delete env[key]
  }
  return env
}

function connectRendezvous(
  path: string,
  onMessage: (message: Record<string, unknown>) => void,
  onClose: () => void,
  onReady?: () => void,
) {
  let socket: Socket | undefined
  let stopped = false
  let attempts = 0
  let timer: NodeJS.Timeout | undefined
  const backoff = [100, 250, 500, 1_000, 2_000]
  const retry = () => {
    if (stopped || timer) return
    if (attempts >= 30) {
      logForDebugging(
        `[bg-rv] ${path}: ${attempts} connect attempts failed — giving up (pid-poll is liveness backstop)`,
        { level: 'warn' },
      )
      return
    }
    const wait = backoff[Math.min(attempts++, backoff.length - 1)]
    timer = setTimeout(() => {
      timer = undefined
      open()
    }, wait)
    timer.unref()
  }
  const open = () => {
    if (stopped) return
    const candidate = new Socket()
    let connected = false
    candidate.on('error', retry)
    candidate.once('close', () => {
      if (socket === candidate) socket = undefined
      if (stopped) return
      if (connected) onClose()
      retry()
    })
    candidate.once('connect', () => {
      connected = true
      attempts = 0
      socket = candidate
      onReady?.()
      candidate.write(
        `${JSON.stringify({
          proto: PROTOCOL_VERSION,
          role: 'supervisor',
          supervisorPid: process.pid,
        })}\n`,
      )
      let buffered = ''
      const decoder = new StringDecoder('utf8')
      candidate.on('data', (chunk) => {
        buffered += decoder.write(chunk)
        let newline
        while ((newline = buffered.indexOf('\n')) >= 0) {
          const line = buffered.slice(0, newline)
          buffered = buffered.slice(newline + 1)
          try {
            const message = JSON.parse(line)
            if (message && typeof message === 'object' && 'type' in message) {
              onMessage(message as Record<string, unknown>)
            }
          } catch {}
        }
      })
    })
    candidate.connect(path)
  }
  open()
  return {
    send(message: unknown) {
      if (!socket || socket.destroyed) {
        if (attempts >= 30) {
          attempts = 0
          retry()
        }
        return false
      }
      try {
        socket.write(`${JSON.stringify(message)}\n`)
        return true
      } catch {
        return false
      }
    },
    close() {
      stopped = true
      if (timer) clearTimeout(timer)
      socket?.destroy()
      socket = undefined
    },
  }
}

export class BackgroundHandle {
  readonly record: BackgroundRecord
  readonly stream = createSignal<string>()
  readonly state = createSignal<Partial<BackgroundRecord>>()
  readonly settled = createSignal<BackgroundRecord['outcome']>()
  readonly attachers = new Map<unknown, { cols: number; rows: number }>()
  private pty?: PtyClient
  private procStart?: string
  private offData?: { dispose(): void }
  private offExit?: { dispose(): void }
  private rendezvous?: ReturnType<typeof connectRendezvous>
  private ptySocket: string
  private rendezvousSocket: string
  private attempt = 0
  private phase: WorkerPhase = { kind: 'spawning' }
  private workerReady = false
  private lastInputAt?: number
  private replyChain: Promise<void> = Promise.resolve()
  private respawnTimer?: NodeJS.Timeout
  private pidPoll?: NodeJS.Timeout
  private pidPollTick = 0
  private ring: string[] = []
  private ringBytes = 0
  private decModes = createDecModeTracker()
  private cols = 200
  private rows = 50

  constructor(
    readonly dispatch: Dispatch,
    private readonly spawnPty: SpawnPty | undefined,
    private readonly getAuthSnapshot?: () => AuthSnapshot | undefined,
    adopted?: WorkerRecord,
  ) {
    this.ptySocket = adopted?.ptySock ?? getPtySocketPath(dispatch.short)
    this.rendezvousSocket =
      adopted?.rendezvousSock ?? getRendezvousSocketPath(dispatch.short)
    this.attempt = adopted?.attempt ?? 0
    this.cols = dispatch.cols ?? 200
    this.rows = dispatch.rows ?? 50
    this.record = {
      short: dispatch.short,
      nonce: dispatch.nonce,
      sessionId: dispatch.sessionId,
      pid: adopted?.pid ?? 0,
      attempt: adopted?.attempt ?? 0,
      startedAt: adopted?.startedAt ?? Date.now(),
      cwd: dispatch.cwd,
      backend: 'daemon',
      tempo: 'active',
      state: adopted ? 'adopted' : 'starting',
      detail: adopted ? 'adopted from previous supervisor' : '',
      intent: dispatch.seed?.intent ?? '',
      name: dispatch.seed?.name,
      agent: dispatch.agent,
      routine: dispatch.routine,
      worktreePath: dispatch.worktree?.path,
      cliVersion: adopted?.cliVersion ?? MACRO.VERSION,
      legacy: adopted ? !adopted.ptySock : undefined,
    }
  }

  static spawn(
    dispatch: Dispatch,
    spawnPty?: SpawnPty,
    getAuthSnapshot?: () => AuthSnapshot | undefined,
  ) {
    const handle = new BackgroundHandle(
      dispatch,
      spawnPty ?? defaultSpawnPty(),
      getAuthSnapshot,
    )
    void handle.doSpawn(dispatch.reattachEnv)
    return handle
  }

  static claim(
    dispatch: Dispatch,
    options: {
      pid: number
      ptySockPath: string
      spawnPty: SpawnPty | undefined
      getAuthSnapshot?: () => AuthSnapshot | undefined
    },
  ): BackgroundHandle {
    const handle = new BackgroundHandle(
      dispatch,
      options.spawnPty,
      options.getAuthSnapshot,
    )
    Object.assign(handle.record, {
      pid: options.pid,
      attempt: 1,
      state: 'running',
      cliVersion: MACRO.VERSION,
    })
    handle.attempt = 1
    handle.ptySocket = options.ptySockPath
    handle.rendezvousSocket = getRendezvousSocketPath(dispatch.short)
    handle.wirePty(connectPtyHost(options.ptySockPath, options.pid))
    handle.resize(dispatch.cols ?? 200, dispatch.rows ?? 50)
    handle.connectRendezvous()
    void getProcessStartTokenAsync(options.pid).then((token) => {
      if (
        handle.record.pid !== options.pid ||
        handle.isDetached ||
        handle.record.outcome
      ) {
        return
      }
      if (token) handle.procStart = token
      handle.patch({ pid: options.pid })
    })
    return handle
  }

  static buildClaimFrame(
    dispatch: Dispatch,
    auth?: AuthSnapshot,
  ): { env: NodeJS.ProcessEnv; argv: string[] } {
    const jobDir = getJobDir(dispatch.short)
    const env = jobEnvironment(
      dispatch,
      jobDir,
      getRendezvousSocketPath(dispatch.short),
      auth,
    )
    if (dispatch.reattachEnv) Object.assign(env, dispatch.reattachEnv)
    return {
      env,
      argv: launchArgs(
        dispatch,
        1,
        false,
        dispatch.sessionId,
        dispatch.respawnFlags,
      ),
    }
  }

  static async adopt(
    record: WorkerRecord,
    spawnPty: SpawnPty | undefined,
    getAuthSnapshot?: () => AuthSnapshot | undefined,
  ): Promise<BackgroundHandle | null> {
    try {
      process.kill(record.pid, 0)
    } catch (error) {
      const code = getErrnoCode(error)
      if (code === 'ESRCH' || code === 'EPERM') return null
    }
    const token = await getProcessStartTokenAsync(record.pid)
    if (record.procStart && token && record.procStart !== token) return null
    const handle = new BackgroundHandle(
      record.dispatch,
      spawnPty,
      getAuthSnapshot,
      record,
    )
    handle.procStart = record.procStart ?? token
    handle.workerReady = true
    if (record.ptySock) {
      handle.wirePty(
        connectPtyHost(record.ptySock, record.pid, handle.procStart),
      )
      handle.cols = 0
    } else handle.startPidPoll()
    handle.connectRendezvous()
    return handle
  }

  get isKilling() {
    return this.phase.kind === 'retiring' && this.phase.reason === 'reap'
  }

  get isRetiring() {
    return this.phase.kind === 'retiring' && this.phase.reason === 'grace'
  }

  getPhase(): WorkerPhase {
    return this.phase
  }

  private get isTransitioning() {
    return this.phase.kind !== 'running' || !this.pty || !this.record.pid
  }

  private get isDetached() {
    return this.phase.kind === 'retiring' && this.phase.reason === 'stop'
  }

  private transitionTo(next: WorkerPhase): boolean {
    if (!canTransition(this.phase, next)) {
      logForDebugging(
        `[bg] illegal worker-phase transition ${phaseLabel(this.phase)} → ${phaseLabel(next)} for ${this.record.short}`,
        { level: 'warn' },
      )
      return false
    }
    this.phase = next
    return true
  }

  private shutdownWorker(): boolean {
    const rendezvousSent = this.rendezvous?.send({ type: 'shutdown' }) ?? false
    if (!rendezvousSent) this.sigtermWorker()
    else {
      const timer = setTimeout((handle: BackgroundHandle) => {
        if (
          (handle.phase.kind === 'upgrading' ||
            (handle.phase.kind === 'retiring' &&
              handle.phase.reason === 'grace')) &&
          !handle.record.outcome
        ) {
          handle.sigtermWorker()
        }
      }, 5_000, this)
      timer.unref()
    }
    return rendezvousSent
  }

  private sigtermWorker(): void {
    try {
      this.pty?.kill('SIGTERM')
    } catch {}
  }

  tail(count: number): string[] {
    return count > 0 ? this.ring.slice(-count) : []
  }

  decModeSnapshot(): number[] {
    return this.decModes.snapshot()
  }

  write(value: string): void {
    this.lastInputAt = Date.now()
    this.pty?.write(value)
  }

  reply(value: string): boolean {
    this.lastInputAt = Date.now()
    if (this.pty) {
      this.replyChain = this.replyChain.then(
        () =>
          new Promise<void>((resolve) => {
            this.pty?.write(`\x1B[200~${value}\x1B[201~`)
            setTimeout(() => {
              this.pty?.write('\r')
              resolve()
            }, 10)
          }),
      )
      return true
    }
    return this.rendezvous?.send({ type: 'reply', text: value }) ?? false
  }

  resize(cols: number, rows: number): void {
    try {
      this.pty?.resize(cols, rows)
      this.cols = cols
      this.rows = rows
    } catch {}
  }

  private signalPtyProcessGroup(): void {
    if (process.platform === 'win32' || !this.record.pid) return
    const timer = setTimeout((pid: number) => {
      try {
        process.kill(-pid, 'SIGWINCH')
      } catch {}
    }, 15, this.record.pid)
    timer.unref()
  }

  resizeForRepaint(cols: number, rows: number): Dispose {
    if (cols !== this.cols || rows !== this.rows) {
      this.resize(cols, rows)
      this.signalPtyProcessGroup()
      this.rendezvous?.send({ type: 'repaint' })
      return () => {}
    }
    const repaintSent = this.rendezvous?.send({ type: 'repaint' }) === true
    const timer = setTimeout(
      (originalCols: number, originalRows: number) => {
        if (this.cols !== originalCols || this.rows !== originalRows) return
        const temporaryCols = Math.max(2, originalCols - 1)
        this.resize(temporaryCols, originalRows)
        this.signalPtyProcessGroup()
        const restore = setTimeout(
          (
            restoreCols: number,
            restoreRows: number,
            expectedCols: number,
          ) => {
            if (this.cols === expectedCols && this.rows === restoreRows) {
              this.resize(restoreCols, restoreRows)
              this.signalPtyProcessGroup()
            }
          },
          30,
          originalCols,
          originalRows,
          temporaryCols,
        )
      },
      repaintSent ? 50 : 0,
      cols,
      rows,
    )
    return () => clearTimeout(timer)
  }

  kill(signal: NodeJS.Signals = 'SIGTERM'): void {
    if (this.phase.kind === 'retired') return
    this.transitionTo({ kind: 'retiring', reason: 'reap' })
    if (this.respawnTimer) clearTimeout(this.respawnTimer)
    this.respawnTimer = undefined
    if (this.pty) {
      try {
        this.pty.kill(signal)
      } catch {}
    }
    else if (this.record.pid && !this.pidRecycled()) {
      try {
        process.kill(-this.record.pid, signal)
      } catch {
        try {
          process.kill(this.record.pid, signal)
        } catch {}
      }
    }
    if (!this.pty) this.finish('killed')
  }

  async respawnIfIdleStale(): Promise<{
    respawned: boolean
    reason?: string
  }> {
    if (this.isTransitioning) {
      return { respawned: false, reason: 'in-progress' }
    }
    if (this.record.outcome) {
      return { respawned: false, reason: 'no-state' }
    }
    if (this.attachers.size > 0) return { respawned: false, reason: 'attached' }
    const state = await readJobState(getJobDir(this.dispatch.short))
    if (this.isTransitioning) {
      return { respawned: false, reason: 'in-progress' }
    }
    if (this.record.outcome) {
      return { respawned: false, reason: 'no-state' }
    }
    if (!state) return { respawned: false, reason: 'no-state' }
    if (isSettledJob(state)) return { respawned: false, reason: 'settled' }
    if (!state.cliVersion || state.cliVersion === MACRO.VERSION) {
      return { respawned: false, reason: 'not-stale' }
    }
    if (state.tempo !== 'idle') return { respawned: false, reason: 'busy' }
    if (!this.transitionTo({ kind: 'upgrading' })) {
      return { respawned: false, reason: 'in-progress' }
    }
    logEvent('tengu_bg_respawn_stale', { rvSent: this.shutdownWorker() })
    return { respawned: true }
  }

  async retireIfSettled(graceMs: number): Promise<{
    retired: boolean
    reason?: string
  }> {
    if (this.isTransitioning) return { retired: false, reason: 'in-progress' }
    if (this.record.outcome) {
      return { retired: false, reason: 'no-state' }
    }
    if (this.attachers.size > 0) return { retired: false, reason: 'attached' }
    if (this.lastInputAt && Date.now() - this.lastInputAt < graceMs) {
      return { retired: false, reason: 'recent-input' }
    }
    const state = await readJobState(getJobDir(this.dispatch.short))
    if (this.isTransitioning || this.attachers.size > 0) {
      return { retired: false, reason: 'in-progress' }
    }
    if (!state) return { retired: false, reason: 'no-state' }
    if (!isSettledJob(state)) return { retired: false, reason: 'not-settled' }
    if ((state.inFlight?.tasks ?? 1) > 0 || (state.inFlight?.queued ?? 1) > 0) {
      return { retired: false, reason: 'inflight' }
    }
    if (state.inFlight?.kinds.includes('session_cron')) {
      return { retired: false, reason: 'session-cron' }
    }
    if (state.routine) return { retired: false, reason: 'routine' }
    const settledForMs = state.updatedAt
      ? Date.now() - Date.parse(state.updatedAt)
      : 0
    if (!settledForMs || settledForMs < graceMs) {
      return { retired: false, reason: 'grace' }
    }
    if (!this.transitionTo({ kind: 'retiring', reason: 'grace' })) {
      return { retired: false, reason: 'in-progress' }
    }
    logEvent('tengu_bg_retired', {
      rvSent: this.shutdownWorker(),
      settledForMs,
      state: state.state,
    })
    return { retired: true }
  }

  rosterEntry(): WorkerRecord {
    return {
      pid: this.record.pid,
      procStart: this.procStart,
      sessionId: this.record.sessionId,
      rendezvousSock: this.rendezvousSocket,
      ptySock: this.record.legacy ? undefined : this.ptySocket,
      messagingSock: this.record.messagingSock,
      cliVersion: this.record.cliVersion,
      startedAt: this.record.startedAt,
      attempt: this.attempt,
      cwd: this.dispatch.cwd,
      worktreePath: this.dispatch.worktree?.path,
      dispatch: this.cappedDispatch(),
    }
  }

  private cappedDispatch(): Dispatch {
    return JSON.parse(
      JSON.stringify(this.dispatch, (key, value) =>
        key === 'reattachEnv'
          ? undefined
          : typeof value === 'string' && value.length > 4_096
            ? value.slice(0, 4_096)
            : value,
      ),
    ) as Dispatch
  }

  stop(): void {
    if (this.phase.kind === 'retiring' && this.phase.reason === 'reap') {
      this.finish('killed')
    } else if (
      this.phase.kind === 'retiring' &&
      this.phase.reason === 'grace'
    ) {
      this.finish('done')
    } else if (this.phase.kind !== 'retired') {
      this.transitionTo({ kind: 'retiring', reason: 'stop' })
    }
    if (this.respawnTimer) clearTimeout(this.respawnTimer)
    this.respawnTimer = undefined
    this.clearLiveness()
    this.offData?.dispose()
    this.offExit?.dispose()
    this.pty?.dispose()
    this.pty = undefined
  }

  private async doSpawn(reattachEnv?: Record<string, string>): Promise<void> {
    this.attempt++
    this.workerReady = false
    const dispatch = this.dispatch
    const jobDir = getJobDir(dispatch.short)
    await mkdir(jobDir, { recursive: true }).catch(() => {})
    const sourceSessionId =
      dispatch.launch.mode === 'resume' ? dispatch.launch.sessionId : undefined
    let currentTranscriptValid = false
    let sourceTranscriptMissing = false
    let resumeSessionId = dispatch.sessionId
    let respawnFlags = dispatch.respawnFlags
    if (this.attempt > 1) {
      const state = await readJobState(jobDir)
      resumeSessionId = state?.resumeSessionId ?? dispatch.sessionId
      respawnFlags = state?.respawnFlags ?? dispatch.respawnFlags
      const cwd = await canonicalizePath(dispatch.cwd)
      const currentTranscript = join(
        getProjectDir(cwd),
        `${resumeSessionId}.jsonl`,
      )
      currentTranscriptValid = await hasTranscriptMessages(currentTranscript)
      sourceTranscriptMissing =
        !currentTranscriptValid &&
        sourceSessionId !== undefined &&
        !(await hasTranscriptMessages(
          join(getProjectDir(cwd), `${sourceSessionId}.jsonl`),
        ))
      if (!currentTranscriptValid) {
        await unlink(currentTranscript).catch(() => {})
      }
    }
    if (
      this.phase.kind === 'retiring' ||
      this.phase.kind === 'retired' ||
      this.record.outcome
    ) {
      return
    }
    if (sourceTranscriptMissing) {
      this.patch({
        state: 'crashed',
        detail: `source session ${sourceSessionId} not found`,
      })
      this.finish('crashed')
      return
    }
    if (!this.spawnPty) {
      this.patch({
        state: 'crashed',
        detail: 'Bun.Terminal unavailable (running under Node?)',
      })
      logEvent('tengu_bg_pty_unavailable', {})
      this.finish('crashed')
      return
    }
    const launcher = pinnedWorkerLauncher()
    const args = launchArgs(
      dispatch,
      this.attempt,
      currentTranscriptValid,
      resumeSessionId,
      respawnFlags,
    )
    const env = jobEnvironment(
      dispatch,
      jobDir,
      this.rendezvousSocket,
      this.getAuthSnapshot?.(),
    )
    if (this.attempt > 1 && currentTranscriptValid) {
      env.CLAUDE_CODE_RESUME_INTERRUPTED_TURN = '1'
    }
    if (reattachEnv) Object.assign(env, reattachEnv)
    try {
      const pty = this.spawnPty(
        launcher.cmd,
        [...launcher.prefixArgs, ...args],
        {
          cols: this.cols || dispatch.cols || 200,
          rows: this.rows || dispatch.rows || 50,
          cwd: dispatch.cwd,
          env,
          ptySock: this.ptySocket,
        },
      )
      if (process.platform === 'win32') {
        void mkdir(getPtyPidDir(), { recursive: true })
          .then(() => writeFile(getPtyPidPath(dispatch.short), String(pty.pid)))
          .catch(() => {})
      }
      this.wirePty(pty)
      this.rendezvous?.close()
      this.rendezvous = undefined
      this.connectRendezvous()
      this.patch({
        pid: pty.pid,
        attempt: this.attempt,
        state: this.attempt > 1 ? 'resuming' : 'running',
        detail: '',
        cliVersion: MACRO.VERSION,
      })
      logEvent('tengu_bg_worker_spawn', {
        attempt: this.attempt,
        source: this.dispatch.source,
      })
      void getProcessStartTokenAsync(pty.pid).then((token) => {
        if (
          !token ||
          this.record.pid !== pty.pid ||
          this.isDetached ||
          this.record.outcome
        ) {
          return
        }
        this.procStart = token
        this.patch({ pid: pty.pid })
      })
    } catch (error) {
      this.scheduleRespawn(String(error))
    }
  }

  private wirePty(pty: PtyClient): void {
    this.pty = pty
    this.transitionTo({ kind: 'running' })
    this.decModes = createDecModeTracker()
    pty.onResume?.(() => this.rendezvous?.send({ type: 'repaint' }))
    this.offData = pty.onData((data) => {
      this.decModes.feed(data)
      const cleaned = data.includes(DETACH_SEQUENCE)
        ? data.replaceAll(DETACH_SEQUENCE, '')
        : data
      this.pushRing(cleaned)
      this.stream.emit(data)
    })
    let exited = false
    this.offExit = pty.onExit(({ exitCode }) => {
      if (exited) return
      exited = true
      this.offData?.dispose()
      this.pty = undefined
      this.onExit(exitCode)
    })
  }

  private pushRing(data: string): void {
    this.ring.push(data)
    this.ringBytes += data.length
    if (this.ringBytes <= 262_144 * 1.25 || this.ring.length <= 1) return
    let count = 0
    let bytes = 0
    while (
      this.ringBytes - bytes > 262_144 &&
      count < this.ring.length - 1
    ) {
      bytes += this.ring[count]!.length
      count++
    }
    this.ring.splice(0, count)
    this.ringBytes -= bytes
  }

  private onExit(exitCode: number | undefined): void {
    if (this.isDetached || this.phase.kind === 'retired') return
    let outcome: WorkerOutcome | undefined
    if (this.phase.kind === 'retiring' && this.phase.reason === 'reap') {
      outcome = 'killed'
    } else if (
      this.phase.kind === 'retiring' &&
      this.phase.reason === 'grace'
    ) {
      outcome = 'done'
    } else if (this.phase.kind === 'upgrading') {
      outcome = undefined
    } else if (exitCode === 0) {
      outcome = 'done'
    } else if (
      (!this.workerReady && this.attempt >= 2) ||
      this.attempt >= MAX_RESPAWN_ATTEMPTS
    ) {
      outcome = 'crashed'
    }
    logEvent('tengu_bg_worker_exit', {
      code: exitCode ?? undefined,
      attempt: this.attempt,
      source: this.dispatch.source,
      outcome,
    })
    if (this.phase.kind === 'retiring') {
      return this.finish(this.phase.reason === 'reap' ? 'killed' : 'done')
    }
    if (this.phase.kind === 'upgrading') {
      this.transitionTo({ kind: 'spawning' })
      this.attempt = 1
      this.patch({ pid: 0, state: 'starting', detail: 'upgrading' })
      this.procStart = undefined
      void this.buildBridgeReattachEnvFromState().then((env) =>
        this.doSpawn(env),
      )
      return
    }
    if (exitCode === 0) return this.finish('done')
    if (!this.workerReady && this.attempt >= 2) {
      this.patch({ state: 'crashed', detail: `exit ${exitCode} before init` })
      return this.finish('crashed')
    }
    this.scheduleRespawn(`exit ${exitCode}`)
  }

  private async buildBridgeReattachEnvFromState(): Promise<
    Record<string, string> | undefined
  > {
    const state = await readJobState(getJobDir(this.dispatch.short)).catch(
      () => null,
    )
    if (!state?.bridgeSessionId) return undefined
    return {
      CLAUDE_BRIDGE_REATTACH_SESSION: state.bridgeSessionId,
      ...(state.bridgeSessionSeq !== undefined && state.bridgeSessionSeq > 0
        ? { CLAUDE_BRIDGE_REATTACH_SEQ: String(state.bridgeSessionSeq) }
        : {}),
    }
  }

  private connectRendezvous(): void {
    if (this.rendezvous || this.isDetached || this.record.outcome) return
    this.rendezvous = connectRendezvous(
      this.rendezvousSocket,
      (message) => {
        if (message.type === 'done') {
          const outcome =
            message.outcome === 'done' ||
            message.outcome === 'failed' ||
            message.outcome === 'killed' ||
            message.outcome === 'crashed'
              ? message.outcome
              : 'done'
          this.finish(outcome)
        } else if (
          message.type === 'state' &&
          message.patch &&
          typeof message.patch === 'object'
        ) {
          this.patch(message.patch as Partial<BackgroundRecord>)
        }
      },
      () => this.checkPid(),
      () => {
        this.workerReady = true
      },
    )
  }

  private startPidPoll(): void {
    if (this.pidPoll) return
    this.pidPoll = setInterval(() => this.checkPid(true), 5_000)
    this.pidPoll.unref()
  }

  private pidRecycled(): boolean {
    if (!this.procStart || !this.record.pid) return false
    const current = getProcessStartToken(this.record.pid)
    return current !== undefined && current !== this.procStart
  }

  private checkPid(checkRecycled = false): void {
    if (!this.record.pid || this.record.outcome) return
    try {
      process.kill(this.record.pid, 0)
    } catch (error) {
      const code = getErrnoCode(error)
      if (code === 'ESRCH' || code === 'EPERM') {
        this.finish(this.isKilling ? 'killed' : 'crashed')
      }
      return
    }
    if (checkRecycled && this.pidPollTick++ % 12 !== 0) return
    if (this.pidRecycled()) {
      this.finish(this.isKilling ? 'killed' : 'crashed')
    }
  }

  private clearLiveness(): void {
    if (this.pidPoll) clearInterval(this.pidPoll)
    this.pidPoll = undefined
    this.rendezvous?.close()
    this.rendezvous = undefined
  }

  private scheduleRespawn(detail: string): void {
    if (this.attempt >= MAX_RESPAWN_ATTEMPTS) {
      logEvent('tengu_bg_respawn_exhausted', { attempts: this.attempt })
      this.patch({ state: 'crashed', detail })
      this.finish('crashed')
      return
    }
    if (this.phase.kind === 'running') {
      this.transitionTo({ kind: 'spawning' })
    }
    this.patch({
      pid: 0,
      state: 'crashed',
      detail: `${detail}; respawning`,
    })
    this.procStart = undefined
    const notice = `\r\n\x1b[2m[worker crashed (${detail}) — respawning…]\x1b[0m\r\n`
    this.pushRing(notice)
    this.stream.emit(notice)
    this.respawnTimer = setTimeout(() => {
      this.respawnTimer = undefined
      if (this.phase.kind !== 'retiring' && this.phase.kind !== 'retired') {
        void this.doSpawn()
      }
    }, RESPAWN_DELAY_MS)
    this.respawnTimer.unref()
  }

  private patch(patch: Partial<BackgroundRecord>): void {
    Object.assign(this.record, patch)
    this.state.emit(patch)
  }

  private finish(outcome: NonNullable<BackgroundRecord['outcome']>): void {
    if (this.record.outcome) return
    this.transitionTo({ kind: 'retired', outcome })
    this.clearLiveness()
    this.patch({ outcome, settledAt: Date.now(), tempo: 'idle' })
    this.settled.emit(outcome)
  }
}

function emptyRoster(): Manifest {
  return {
    proto: PROTOCOL_VERSION,
    supervisorPid: process.pid,
    updatedAt: Date.now(),
    workers: {},
  }
}

function rosterWorkerCount(value: unknown): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0
  const workers = (value as { workers?: unknown }).workers
  return workers && typeof workers === 'object' && !Array.isArray(workers)
    ? Object.keys(workers).length
    : 0
}

async function quarantineRoster(): Promise<void> {
  await rename(
    getRosterPath(),
    `${getRosterPath()}.corrupt.${Date.now()}`,
  ).catch(error => logError(error))
}

async function readRoster(): Promise<{
  manifest: Manifest
  parseFailed: boolean
}> {
  let decoded: unknown
  try {
    decoded = JSON.parse(await readFile(getRosterPath(), 'utf8'))
  } catch (error) {
    if (isENOENT(error)) return { manifest: emptyRoster(), parseFailed: false }
    logError(error)
    logEvent('tengu_bg_roster_parse_failed', {
      orphaned: -1,
      quarantined: 1,
    })
    await quarantineRoster()
    return { manifest: emptyRoster(), parseFailed: true }
  }
  const parsed = ManifestSchema().safeParse(decoded)
  if (parsed.success) return { manifest: parsed.data, parseFailed: false }
  const orphaned = rosterWorkerCount(decoded)
  logError(
    new Error(
      `roster.json parse failed (orphaning ${orphaned} worker(s)): ${parsed.error.issues[0]?.message}`,
    ),
  )
  logEvent('tengu_bg_roster_parse_failed', {
    orphaned,
    quarantined: 1,
  })
  await quarantineRoster()
  return {
    manifest: emptyRoster(),
    parseFailed: true,
  }
}

let rosterWrite = Promise.resolve()

function writeRoster(handles: Map<string, BackgroundHandle>): Promise<void> {
  const next = rosterWrite.then(async () => {
    const workers: Record<string, WorkerRecord> = {}
    for (const [short, handle] of handles) workers[short] = handle.rosterEntry()
    const manifest: Manifest = {
      proto: PROTOCOL_VERSION,
      supervisorPid: process.pid,
      updatedAt: Date.now(),
      workers,
    }
    await mkdir(dirname(getRosterPath()), { recursive: true, mode: 0o700 })
    await atomicWriteFile(
      getRosterPath(),
      JSON.stringify(manifest, null, 2),
      0o600,
    )
  })
  rosterWrite = next.catch(() => {})
  return next
}

function wireHandle(
  handles: Map<string, BackgroundHandle>,
  handle: BackgroundHandle,
  onKeepAliveChange: () => void,
  pendingSettleWrites: Set<Promise<unknown>>,
): void {
  const track = (promise: Promise<unknown>) => {
    pendingSettleWrites.add(promise)
    void promise.finally(() => pendingSettleWrites.delete(promise))
  }
  handle.state.subscribe((patch) => {
    if (patch.pid) void writeRoster(handles).catch((error) => logError(error))
    if (patch.state === 'crashed' || patch.state === 'resuming') {
      const nextState = patch.state
      const dir = getJobDir(handle.record.short)
      void readJobState(dir)
        .then((state) => {
          if (
            !state ||
            isSettledJob(state) ||
            state.state === 'blocked' ||
            (nextState === 'resuming' && state.state !== 'crashed')
          ) {
            return
          }
          return writeJobState(dir, {
            ...state,
            state: nextState,
            detail: handle.record.detail,
            tempo: nextState === 'crashed' ? 'idle' : 'active',
            inFlight: undefined,
            updatedAt: new Date().toISOString(),
          })
        })
        .catch((error) => logError(error))
    }
  })
  handle.settled.subscribe((outcome) => {
    if (!outcome) return
    const dir = getJobDir(handle.record.short)
    track(
      readJobState(dir)
        .then((state) => {
          if (
            !state ||
            isSettledJob(state) ||
            (outcome === 'done' && state.state === 'blocked')
          ) {
            return
          }
          const now = new Date().toISOString()
          return writeJobState(dir, {
            ...state,
            state:
              outcome === 'done'
                ? 'done'
                : outcome === 'killed'
                  ? 'stopped'
                  : 'failed',
            detail: (handle.record.detail || state.detail).replace(
              /; respawning$/,
              '',
            ),
            tempo: 'idle',
            inFlight: undefined,
            needs: undefined,
            updatedAt: now,
            firstTerminalAt: state.firstTerminalAt ?? now,
          })
        })
        .catch((error) => logError(error)),
    )
    handles.delete(handle.record.short)
    onKeepAliveChange()
    track(writeRoster(handles).catch((error) => logError(error)))
    if (process.platform === 'win32') {
      track(unlink(getPtyPidPath(handle.record.short)).catch(() => {}))
      track(
        unlink(getPtyErrorPath(getPtySocketPath(handle.record.short))).catch(
          () => {},
        ),
      )
    } else {
      const roster = handle.rosterEntry()
      track(
        unlink(roster.rendezvousSock).catch(() => {}),
      )
      if (roster.ptySock) {
        track(unlink(roster.ptySock).catch(() => {}))
        track(unlink(getPtyErrorPath(roster.ptySock)).catch(() => {}))
      }
    }
  })
}

function sendJson(socket: Socket, value: unknown, end = true): void {
  if (socket.destroyed) return
  const data = `${JSON.stringify(value)}\n`
  if (end) socket.end(data)
  else socket.write(data)
}

async function awaitAck(
  handles: Map<string, BackgroundHandle>,
  socket: Socket,
  op: string,
  short: string,
  nonce: string | undefined,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + Math.min(timeoutMs, 30_000)
  let stale = false
  while (Date.now() < deadline) {
    if (socket.destroyed) return
    const handle = handles.get(short)
    if (handle) {
      if (nonce && handle.record.nonce !== nonce) {
        stale = true
        await new Promise((resolve) => setTimeout(resolve, 25))
        continue
      }
      sendJson(socket, {
        ok: true,
        op,
        short,
        pid: handle.record.pid,
        messagingSock: handle.record.messagingSock ?? '',
      })
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  sendJson(
    socket,
    stale
      ? {
          ok: false,
          error:
            'a previous dispatch with this id is still being cleaned up — retry in a moment',
          code: 'ESTALE',
        }
      : {
          ok: false,
          error: `${bgSupervisorNoun()} didn't acknowledge in time — retry`,
          code: 'ETIMEOUT',
        },
  )
}

async function handleControl(
  handles: Map<string, BackgroundHandle>,
  dispatch: (value: Dispatch) => void,
  onNudge: () => Promise<boolean>,
  onShutdown: (reapWorkers: boolean) => number,
  isReady: () => boolean,
  onYield: () => boolean,
  socket: Socket,
  raw: string,
  initialData: Buffer,
  registerLease: (
    socket: Socket,
    client: { label: string; cwd: string; pid: number } | null,
  ) => void,
  listLeases: () => Array<{ label: string; cwd: string; pid: number }>,
): Promise<void> {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    sendJson(socket, { ok: false, error: 'bad json', code: 'EUNKNOWN' })
    return
  }
  if (!value || typeof value !== 'object') {
    sendJson(socket, { ok: false, error: 'bad json', code: 'EUNKNOWN' })
    return
  }
  const unparsed = value as Record<string, unknown>
  if (unparsed.op === 'ping') {
    sendJson(socket, {
      ok: true,
      op: 'ping',
      version: MACRO.VERSION,
      proto: PROTOCOL_VERSION,
    })
    return
  }
  if (unparsed.op === 'nudge') {
    sendJson(socket, {
      ok: true,
      op: 'nudge',
      restarting: await onNudge(),
    })
    return
  }
  if (unparsed.op === 'yield') {
    sendJson(socket, { ok: true, op: 'yield', yielding: onYield() })
    return
  }
  if (unparsed.op === 'lease') {
    const client = unparsed.client
    registerLease(
      socket,
      client &&
        typeof client === 'object' &&
        typeof (client as { label?: unknown }).label === 'string' &&
        typeof (client as { cwd?: unknown }).cwd === 'string' &&
        typeof (client as { pid?: unknown }).pid === 'number'
        ? (client as { label: string; cwd: string; pid: number })
        : null,
    )
    sendJson(socket, { ok: true, op: 'lease' }, false)
    return
  }
  if (unparsed.op === 'leases') {
    sendJson(socket, { ok: true, op: 'leases', clients: listLeases() })
    return
  }
  if (unparsed.op === 'shutdown') {
    const reapWorkers = unparsed.reapWorkers !== false
    sendJson(socket, {
      ok: true,
      op: 'shutdown',
      reaped: onShutdown(reapWorkers),
    })
    return
  }
  if (!isReady()) {
    sendJson(socket, {
      ok: false,
      error: `${bgSupervisorNoun()} starting (adoption in progress)`,
      code: 'ESTARTING',
    })
    return
  }
  const clientProtocol = unparsed.proto
  if (
    typeof clientProtocol !== 'number' ||
    !Number.isInteger(clientProtocol) ||
    clientProtocol < MIN_PROTOCOL_VERSION ||
    clientProtocol > PROTOCOL_VERSION
  ) {
    logEvent('tengu_bg_proto_mismatch', {
      client_proto:
        typeof clientProtocol === 'number' ? clientProtocol : -1,
      server_proto: PROTOCOL_VERSION,
    })
    sendJson(socket, {
      ok: false,
      error: `proto mismatch (server=${PROTOCOL_VERSION}, client=${clientProtocol}) — ${bgSupervisorNoun()} and CLI versions differ; restart claude`,
      code: 'EPROTO',
      serverProto: PROTOCOL_VERSION,
      serverVersion: MACRO.VERSION,
    })
    return
  }
  const parsed = ControlMessageSchema().safeParse(value)
  if (!parsed.success) {
    sendJson(socket, {
      ok: false,
      error: `malformed request: ${parsed.error.issues[0]?.message ?? 'invalid'}`,
      code: 'EUNKNOWN',
    })
    return
  }
  const message = parsed.data
  switch (message.op) {
    case 'list':
      sendJson(socket, {
        ok: true,
        op: 'list',
        jobs: [...handles.values()].map((handle) => handle.record),
      })
      return
    case 'has': {
      const handle = handles.get(message.short)
      sendJson(socket, {
        ok: true,
        op: 'has',
        alive: Boolean(
          handle &&
            !handle.record.outcome &&
            !handle.isRetiring &&
            !handle.isKilling,
        ),
      })
      return
    }
    case 'await-ack':
      await awaitAck(
        handles,
        socket,
        'await-ack',
        message.short,
        message.nonce,
        message.timeoutMs,
      )
      return
    case 'dispatch':
      dispatch(message.d)
      await awaitAck(
        handles,
        socket,
        'dispatch',
        message.d.short,
        message.d.nonce,
        message.timeoutMs,
      )
      return
    case 'reply': {
      const handle = handles.get(message.short)
      if (
        !handle ||
        handle.isRetiring ||
        handle.isKilling ||
        handle.record.outcome
      ) {
        sendJson(socket, {
          ok: false,
          error: 'job not found — it may have already exited',
          code: 'ENOJOB',
        })
      } else if (!handle.reply(message.text)) {
        sendJson(socket, {
          ok: false,
          error:
            "job isn't accepting replies — it may be in a non-interactive state",
          code: 'ENOREPLY',
        })
      } else sendJson(socket, { ok: true, op: 'reply' })
      return
    }
    case 'kill': {
      const handle = handles.get(message.short)
      if (!handle) {
        sendJson(socket, {
          ok: false,
          error: 'job not found — it may have already exited',
          code: 'ENOJOB',
        })
      } else {
        handle.kill(message.signal ?? 'SIGTERM')
        sendJson(socket, { ok: true, op: 'kill' })
      }
      return
    }
    case 'respawn-stale': {
      const handle = handles.get(message.short)
      if (!handle) {
        sendJson(socket, {
          ok: false,
          error: 'job not found — it may have already exited',
          code: 'ENOJOB',
        })
      } else {
        sendJson(socket, {
          ok: true,
          op: 'respawn-stale',
          ...(await handle.respawnIfIdleStale()),
        })
      }
      return
    }
    case 'resize': {
      const handle = handles.get(message.short)
      if (!handle) {
        sendJson(socket, {
          ok: false,
          error: 'job not found — it may have already exited',
          code: 'ENOJOB',
        })
      } else {
        if (message.attachId) {
          const attached = handle.attachers.get(message.attachId)
          if (!attached) {
            sendJson(socket, { ok: true, op: 'resize' })
            return
          }
          attached.cols = message.cols
          attached.rows = message.rows
        }
        handle.resize(message.cols, message.rows)
        sendJson(socket, { ok: true, op: 'resize' })
      }
      return
    }
    case 'attach': {
      const handle = handles.get(message.short)
      if (!handle || handle.isKilling || handle.record.outcome) {
        sendJson(socket, {
          ok: false,
          error: 'job not found — it may have already exited',
          code: 'ENOJOB',
        })
        return
      }
      if (handle.isRetiring) {
        sendJson(socket, {
          ok: false,
          error: 'job is retiring; retry attach',
          code: 'ERESPAWNING',
        })
        return
      }
      if (handle.record.legacy) {
        const value = handle.dispatch
        const cwd = await canonicalizePath(value.cwd)
        const transcript = join(
          getProjectDir(cwd),
          `${value.sessionId}.jsonl`,
        )
        const transcriptExists = await hasTranscriptMessages(transcript)
        if (!transcriptExists) await rm(transcript, { force: false }).catch(() => {})
        if (handles.get(message.short) !== handle || socket.destroyed) {
          sendJson(socket, {
            ok: false,
            error: 'supervisor restarting',
            code: 'ERESPAWNING',
          })
          return
        }
        if (!handle.isKilling) {
          logEvent('tengu_bg_attach_legacy_autorespawn', {})
          handle.kill('SIGTERM')
          dispatch({
            ...value,
            source: 'respawn',
            launch: transcriptExists
              ? {
                  mode: 'resume',
                  sessionId: value.sessionId,
                  fork: false,
                  flagArgs: value.respawnFlags,
                }
              : value.launch,
          })
        }
        sendJson(socket, {
          ok: false,
          error: 'legacy job respawning with worker-owned PTY; retry attach',
          code: 'ERESPAWNING',
        })
        return
      }
      registerLease(socket, null)
      sendJson(
        socket,
        { ok: true, op: 'attach', decModes: handle.decModeSnapshot() },
        false,
      )
      logEvent('tengu_bg_attach', {})
      let bufferedOutput: string[] | null = []
      let bufferedBytes = 0
      let markerTail = ''
      let bufferTimer: NodeJS.Timeout
      let repaintTimer: NodeJS.Timeout | undefined
      let cancelRepaintResize: Dispose = () => {}
      const clearDisplay = '\x1B[2J'
      const homeAndEraseLine = '\x1B[H\x1B[2K'
      const flushBufferedOutput = (write: boolean) => {
        if (bufferedOutput === null) return
        const output = bufferedOutput
        bufferedOutput = null
        clearTimeout(bufferTimer)
        if (write && !socket.destroyed) {
          for (const data of output) socket.write(data)
        }
      }
      bufferTimer = setTimeout(() => {
        const hadNoOutput = bufferedOutput !== null && bufferedBytes === 0
        flushBufferedOutput(true)
        if (hadNoOutput && !socket.destroyed) {
          const state = handle.record.state
          const message =
            state === 'starting' ||
            state === 'resuming' ||
            state === 'adopted' ||
            state === 'crashed'
              ? 'Session is starting — it will appear once ready. Ctrl+B then d to detach'
              : 'Waiting for session to redraw… Ctrl+B then d to detach'
          socket.write(
            `${clearDisplay}\x1B[H\n  \x1B[2m${message}\x1B[0m\n`,
          )
          repaintTimer = setInterval(() => {
            const attached = handle.attachers.get(attachId)
            cancelRepaintResize()
            cancelRepaintResize = handle.resizeForRepaint(
              attached?.cols ?? messageCols,
              attached?.rows ?? messageRows,
            )
          }, 1_000)
          repaintTimer.unref()
        }
      }, 500)
      bufferTimer.unref()
      const stopStream = handle.stream.subscribe((data) => {
        if (socket.destroyed) return
        if (
          repaintTimer &&
          (data.includes(clearDisplay) || data.includes(homeAndEraseLine))
        ) {
          clearInterval(repaintTimer)
          repaintTimer = undefined
        }
        if (bufferedOutput !== null) {
          const withTail = markerTail + data
          if (
            withTail.includes(clearDisplay) ||
            withTail.includes(homeAndEraseLine)
          ) {
            const fromMarker =
              data.includes(clearDisplay) || data.includes(homeAndEraseLine)
                ? data
                : withTail
            flushBufferedOutput(false)
            if (socket.writableLength <= MAX_SOCKET_BUFFER) {
              socket.write(fromMarker)
            } else socket.destroy()
            return
          }
          bufferedOutput.push(data)
          bufferedBytes += data.length
          markerTail = withTail.slice(-6)
          if (bufferedBytes > 65_536) flushBufferedOutput(true)
          return
        }
        if (socket.writableLength > MAX_SOCKET_BUFFER) socket.destroy()
        else socket.write(data)
      })
      const attachId: unknown = message.attachId ?? socket
      const messageCols = message.cols
      const messageRows = message.rows
      handle.attachers.set(attachId, {
        cols: message.cols,
        rows: message.rows,
      })
      const cancelResizeRestore = handle.resizeForRepaint(
        message.cols,
        message.rows,
      )
      const stopSettled = handle.settled.subscribe(() => socket.end())
      const decoder = new StringDecoder('utf8')
      if (initialData.length) handle.write(decoder.write(initialData))
      socket.on('data', (chunk) => handle.write(decoder.write(chunk)))
      socket.once('close', () => {
        if (repaintTimer) clearInterval(repaintTimer)
        cancelRepaintResize()
        cancelResizeRestore()
        flushBufferedOutput(false)
        const tail = decoder.end()
        if (tail) handle.write(tail)
        stopStream()
        stopSettled()
        handle.attachers.delete(attachId)
        if (handle.attachers.size > 0) {
          const remaining = [...handle.attachers.values()].at(-1)!
          handle.resizeForRepaint(remaining.cols, remaining.rows)
        }
      })
      return
    }
    case 'subscribe': {
      const handle = handles.get(message.short)
      if (!handle) {
        sendJson(socket, {
          ok: false,
          error: 'job not found — it may have already exited',
          code: 'ENOJOB',
        })
        return
      }
      registerLease(socket, null)
      sendJson(
        socket,
        {
          type: 'snapshot',
          record: handle.record,
          streamTail: handle.tail(message.tail ?? 200),
        },
        false,
      )
      if (handle.record.outcome) {
        sendJson(
          socket,
          { type: 'settled', outcome: handle.record.outcome },
          false,
        )
        socket.end()
        return
      }
      const subscriptions = [
        handle.stream.subscribe((line) =>
          sendJson(socket, { type: 'stream', line }, false),
        ),
        handle.state.subscribe((patch) =>
          sendJson(socket, { type: 'state', patch }, false),
        ),
        handle.settled.subscribe((outcome) => {
          sendJson(socket, { type: 'settled', outcome }, false)
          socket.end()
        }),
      ]
      socket.on('close', () => subscriptions.forEach((dispose) => dispose()))
      return
    }
    case 'ensure-spare':
      sendJson(socket, { ok: true, op: 'ensure-spare' })
      return
    case 'permission-response':
      sendJson(socket, { ok: true, op: 'permission-response' })
      return
    case 'ping':
    case 'nudge':
    case 'yield':
    case 'lease':
    case 'leases':
    case 'shutdown':
      return
  }
}

async function startControlServer(
  handles: Map<string, BackgroundHandle>,
  dispatch: (value: Dispatch) => void,
  onNudge: () => Promise<boolean>,
  onShutdown: (reapWorkers: boolean) => number,
  isReady: () => boolean,
  onYield: () => boolean,
  onLeaseChange?: () => void,
): Promise<{
  server: Server
  leaseCount(): number
  close(): Promise<void>
}> {
  await ensureDaemonRuntimeDir()
  const path = getControlSocketPath()
  await unlink(path).catch(() => {})
  const sockets = new Set<Socket>()
  const leases = new Map<
    Socket,
    { label: string; cwd: string; pid: number } | null
  >()
  const registerLease = (
    socket: Socket,
    client: { label: string; cwd: string; pid: number } | null,
  ) => {
    if (leases.has(socket)) return
    leases.set(socket, client)
    logEvent('tengu_daemon_lease', { op: 'open' })
    onLeaseChange?.()
    socket.once('close', () => {
      leases.delete(socket)
      logEvent('tengu_daemon_lease', { op: 'close' })
      onLeaseChange?.()
    })
  }
  const listLeases = () =>
    [...leases.values()].filter(
      (client): client is { label: string; cwd: string; pid: number } =>
        client !== null,
    )
  const server = createServer((socket) => {
    if (!controlPeerMatchesCurrentUser(socket)) {
      logEvent('tengu_daemon_peer_uid_reject', {})
      socket.destroy()
      return
    }
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
    socket.on('error', () => socket.destroy())
    socket.setTimeout(30_000, () => socket.destroy())
    let buffered = Buffer.alloc(0)
    const first = (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk])
      const newline = buffered.indexOf(10)
      if (newline < 0) {
        if (buffered.length > MAX_SOCKET_BUFFER) socket.destroy()
        return
      }
      socket.off('data', first)
      socket.setTimeout(0)
      const raw = buffered.subarray(0, newline).toString('utf8')
      const remainder = buffered.subarray(newline + 1)
      void handleControl(
        handles,
        dispatch,
        onNudge,
        onShutdown,
        isReady,
        onYield,
        socket,
        raw,
        remainder,
        registerLease,
        listLeases,
      ).catch((error) =>
        sendJson(socket, {
          ok: false,
          error: String(error),
          code: 'EUNKNOWN',
        }),
      )
    }
    socket.on('data', first)
  })
  server.on('error', (error) => logError(error))
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(path, () => {
      server.off('error', reject)
      resolve()
    })
  })
  return {
    server,
    leaseCount: () => leases.size,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy()
        server.close(() => {
          void unlink(path).catch(() => {})
          resolve()
        })
      }),
  }
}

async function rejectDispatch(path: string, reason: string): Promise<void> {
  await mkdir(getRejectedDispatchDir(), { recursive: true, mode: 0o700 }).catch(() => {})
  await rename(path, join(getRejectedDispatchDir(), basename(path))).catch(
    () => unlink(path).catch(() => {}),
  )
  logForDebugging(`[bg-dispatch] rejected ${basename(path)}: ${reason}`, {
    level: 'warn',
  })
}

async function readDispatch(
  path: string,
  onDispatch: (dispatch: Dispatch) => void,
): Promise<void> {
  let metadata
  try {
    metadata = await lstat(path)
  } catch (error) {
    if (!isENOENT(error)) await rejectDispatch(path, String(error))
    return
  }
  if (metadata.isSymbolicLink()) {
    await rejectDispatch(path, 'symlink')
    return
  }
  if (metadata.size > MAX_DISPATCH_BYTES) {
    await rejectDispatch(path, `oversized (${metadata.size} bytes)`)
    return
  }
  let raw
  try {
    raw = await readFile(path, 'utf8')
  } catch (error) {
    if (!isENOENT(error)) await rejectDispatch(path, String(error))
    return
  }
  let decoded: unknown
  try {
    decoded = JSON.parse(raw)
  } catch {}
  const parsed = DispatchSchema().safeParse(decoded)
  if (!parsed.success) return rejectDispatch(path, 'schema')
  if (Date.now() - parsed.data.createdAt > MAX_DISPATCH_AGE_MS) {
    return rejectDispatch(path, 'stale')
  }
  onDispatch(parsed.data)
  await unlink(path).catch(() => {})
}

async function startDispatchWatcher(
  onDispatch: (dispatch: Dispatch) => void,
): Promise<FSWatcher> {
  await mkdir(getDispatchDir(), { recursive: true, mode: 0o700 }).catch(() => {})
  const platform = process.platform
  const usePolling = typeof Bun !== 'undefined' && platform === 'darwin'
  const watcher = chokidar.watch(getDispatchDir(), {
    ignoreInitial: true,
    depth: 0,
    usePolling,
    interval: 100,
    ignored: (path) => {
      const name = basename(path)
      return name.endsWith('.tmp') || name.includes('.tmp.') || name === 'rejected'
    },
    ...(platform === 'win32'
      ? { awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 20 } }
      : {}),
  })
  watcher.on('add', (path) => {
    void readDispatch(path, onDispatch).catch((error) =>
      logForDebugging(`[bg-dispatch] ${String(error)}`, { level: 'error' }),
    )
  })
  watcher.on('error', (error) =>
    logForDebugging(`[bg-dispatch] watcher error: ${String(error)}`, {
      level: 'error',
    }),
  )
  await withTimeout(
    new Promise<void>((resolve) => watcher.once('ready', resolve)),
    5_000,
    'chokidar ready',
  ).catch((error) =>
    logForDebugging(`[bg-dispatch] watcher ready wait: ${String(error)}`),
  )
  await (async () => {
    for (const name of await readdir(getDispatchDir())) {
      if (
        name.startsWith('.') ||
        name.endsWith('.tmp') ||
        name.includes('.tmp.') ||
        name === 'rejected'
      ) {
        continue
      }
      await readDispatch(join(getDispatchDir(), name), onDispatch)
    }
  })().catch((error) =>
    logForDebugging(`[bg-dispatch] cold-start drain: ${String(error)}`, {
      level: 'error',
    }),
  )
  return watcher
}

async function reapOrphanedPtySockets(
  handles: Map<string, BackgroundHandle>,
  log: (message: string) => void,
): Promise<void> {
  const windows = process.platform === 'win32'
  const directory = windows ? getPtyPidDir() : getPtyDir()
  const suffix = windows ? '.pid' : '.sock'
  const entries = await readdir(directory).catch(() => [])
  const hostEntries = new Set(entries.filter(entry => entry.endsWith(suffix)))
  let reaped = 0
  for (const entry of entries) {
    if (!entry.endsWith(suffix)) {
      if (
        entry.endsWith('.sock.err') &&
        !hostEntries.has(entry.slice(0, -4))
      ) {
        void unlink(join(directory, entry)).catch(() => {})
      }
      continue
    }
    const short = entry.slice(0, -suffix.length)
    if (handles.has(short)) continue
    reaped++
    const pidPath = getPtyPidPath(short)
    const socketPath = getPtySocketPath(short)
    void killWorkerThroughPty(socketPath).then(killed => {
      if (!windows) return
      const errorPath = getPtyErrorPath(socketPath)
      if (killed) {
        void unlink(pidPath).catch(() => {})
        void unlink(errorPath).catch(() => {})
        return
      }
      void readFile(pidPath, 'utf8')
        .then(raw => {
          if (!isProcessRunning(Number(raw))) {
            void unlink(pidPath).catch(() => {})
            void unlink(errorPath).catch(() => {})
          }
        })
        .catch(() => {})
    })
  }
  if (reaped > 0) {
    log(`bg orphan-reap: ${reaped} roster-less pty host(s)`)
    logEvent('tengu_bg_orphan_reap', { reaped })
  }
}

export async function runBackgroundSupervisor(options?: {
  getAuthSnapshot?: () => AuthSnapshot | undefined
  log?: (message: string) => void
  onNudge?: () => Promise<boolean>
  onShutdown?: () => void
  onYield?: () => boolean
  onKeepAliveChange?: () => void
  spawnPty?: SpawnPty
}): Promise<{
  handles: Map<string, BackgroundHandle>
  dispatch(value: Dispatch): void
  leaseCount(): number
  liveHandleCount(): number
  pendingSettleWrites(): number
  killAll(signal: NodeJS.Signals): number
  close(): Promise<void>
}> {
  const log = options?.log ?? ((message) => logForDebugging(message))
  const handles = new Map<string, BackgroundHandle>()
  const pendingSettleWrites = new Set<Promise<unknown>>()
  const spawnPty = options?.spawnPty ?? defaultSpawnPty()
  let closing = false
  let ready = false
  let spare: SpareProcess | null = null
  let spawningSpare = false
  const canPrewarm = options?.spawnPty === undefined
  const ensureSpare = () => {
    if (
      spare ||
      spawningSpare ||
      closing ||
      !ready ||
      !spawnPty ||
      !canPrewarm ||
      process.platform === 'win32' ||
      !getFeatureValue_CACHED_MAY_BE_STALE('tengu_bg_spare_enable', true)
    ) {
      return
    }
    spawningSpare = true
    let candidate: SpareProcess | null = null
    let exited = false
    const startedAt = Date.now()
    void spawnSpare({
      log,
      onExit: () => {
        if (!candidate) {
          exited = true
          return
        }
        if (spare === candidate) {
          spare = null
          if (Date.now() - startedAt >= 2_000) ensureSpare()
        }
      },
    })
      .then((created) => {
        candidate = created
        if (!created || closing || exited) {
          created?.dispose()
          return
        }
        spare = created
        logEvent('tengu_bg_spare_spawn', {})
      })
      .catch((error) => logError(error))
      .finally(() => {
        spawningSpare = false
      })
  }
  const dispatch = (value: Dispatch, retry = 0) => {
    if (closing) return
    const existing = handles.get(value.short)
    if (existing) {
      if (
        (existing.isKilling || existing.isRetiring || existing.record.outcome) &&
        retry < 30
      ) {
        if (retry === 15 && (existing.isKilling || existing.isRetiring)) {
          logEvent('tengu_bg_dispatch_sigkill_escalate', {})
          existing.kill('SIGKILL')
        }
        setTimeout(() => dispatch(value, retry + 1), 100)
        return
      }
      log(`bg: dup dispatch ${value.short} dropped (existing handle still live)`)
      return
    }
    let handle: BackgroundHandle | undefined
    if (
      spare &&
      spare.cliVersion === MACRO.VERSION &&
      getFeatureValue_CACHED_MAY_BE_STALE('tengu_bg_spare_enable', true)
    ) {
      const claimed = spare
      spare = null
      try {
        handle = BackgroundHandle.claim(value, {
          pid: claimed.hostPid,
          ptySockPath: claimed.ptySock,
          spawnPty,
          getAuthSnapshot: options?.getAuthSnapshot,
        })
        const frame = BackgroundHandle.buildClaimFrame(
          value,
          options?.getAuthSnapshot?.(),
        )
        void sendSpareClaim(claimed.claimSock, {
          cwd: value.cwd,
          env: frame.env,
          argv: frame.argv,
          sessionId: value.sessionId,
        }).catch((error) => {
          logForDebugging(`[bg-spare] send-claim failed: ${String(error)}`, {
            level: 'warn',
          })
          killSparePty(claimed.ptySock)
        })
        logEvent('tengu_bg_spare_claim', {
          age_ms: Date.now() - claimed.startedAt,
        })
        log(`bg claimed-spare ${value.short} (${value.source})`)
      } catch (error) {
        const code = getErrnoCode(error)
        logEvent('tengu_bg_spare_claim_fail', {
          reason:
            code === 'ENOENT'
              ? 'enoent'
              : code === 'ECONNREFUSED'
                ? 'econnrefused'
                : error instanceof Error
                  ? 'error'
                  : 'unknown',
        })
        claimed.dispose()
      }
    }
    if (!handle) {
      handle = BackgroundHandle.spawn(
        value,
        spawnPty,
        options?.getAuthSnapshot,
      )
      log(`bg spawned ${value.short} (${value.source})`)
    }
    handles.set(value.short, handle)
    wireHandle(
      handles,
      handle,
      options?.onKeepAliveChange ?? (() => {}),
      pendingSettleWrites,
    )
    options?.onKeepAliveChange?.()
    void writeRoster(handles)
    ensureSpare()
  }

  const killAll = (signal: NodeJS.Signals = 'SIGTERM') => {
    let killed = 0
    for (const handle of handles.values()) {
      if (!handle.record.outcome) {
        handle.kill(signal)
        killed++
      }
    }
    return killed
  }

  await ensureDaemonRuntimeDir()
  await ensureDaemonDir()
  const control = await startControlServer(
    handles,
    dispatch,
    options?.onNudge ?? (async () => false),
    (reapWorkers) => {
      const reaped = reapWorkers ? killAll('SIGTERM') : 0
      options?.onShutdown?.()
      return reaped
    },
    () => ready,
    options?.onYield ?? (() => false),
    options?.onKeepAliveChange,
  )
  await Promise.all(
    process.platform === 'win32'
      ? [mkdir(getPtyPidDir(), { recursive: true }).catch(() => {})]
      : [
          mkdir(getRendezvousDir(), { recursive: true, mode: 0o700 }).catch(
            () => {},
          ),
          mkdir(getPtyDir(), { recursive: true, mode: 0o700 }).catch(() => {}),
        ],
  )
  cleanupStaleRuntimeDirs()
  const { manifest: roster, parseFailed } = await readRoster()
  let adopted = 0
  let dead = 0
  await Promise.all(
    Object.entries(roster.workers).map(async ([short, record]) => {
      let handle: BackgroundHandle | null
      try {
        handle = await BackgroundHandle.adopt(
          record,
          spawnPty,
          options?.getAuthSnapshot,
        )
      } catch (error) {
        logError(error)
        dead++
        return
      }
      if (handle) {
        handles.set(record.dispatch.short, handle)
        wireHandle(
          handles,
          handle,
          options?.onKeepAliveChange ?? (() => {}),
          pendingSettleWrites,
        )
        adopted++
        return
      }
      dead++
      if (process.platform === 'win32') {
        void unlink(getPtyPidPath(short)).catch(() => {})
        void unlink(getPtyErrorPath(getPtySocketPath(short))).catch(() => {})
      } else {
        void unlink(record.rendezvousSock).catch(() => {})
        if (record.ptySock) {
          void unlink(record.ptySock).catch(() => {})
          void unlink(getPtyErrorPath(record.ptySock)).catch(() => {})
          try {
            process.kill(record.pid, 0)
          } catch {
            try {
              process.kill(-record.pid, 'SIGTERM')
            } catch {}
          }
        }
      }
    }),
  )
  if (adopted + dead > 0) {
    log(`bg adopt: adopted=${adopted} dead=${dead}`)
    logEvent('tengu_bg_adopt', { adopted, dead })
  }
  if (!parseFailed) await reapOrphanedPtySockets(handles, log)
  if (!parseFailed) await reapOrphanSpares(handles, log)
  await writeRoster(handles).catch((error) => logError(error))
  ready = true
  options?.onKeepAliveChange?.()
  ensureSpare()
  const retirementSweep = setInterval(() => {
    for (const handle of handles.values()) {
      void handle.retireIfSettled(3_600_000).catch((error) => logError(error))
    }
  }, 60_000)
  retirementSweep.unref()
  const watcher = await startDispatchWatcher(dispatch)
  return {
    handles,
    dispatch: value => dispatch(value),
    leaseCount: control.leaseCount,
    liveHandleCount: () => {
      let count = 0
      for (const handle of handles.values()) {
        if (!handle.record.outcome) count++
      }
      return count
    },
    pendingSettleWrites: () => pendingSettleWrites.size,
    killAll,
    close: async () => {
      closing = true
      clearInterval(retirementSweep)
      spare?.dispose()
      spare = null
      await Promise.all([
        watcher.close().catch(() => {}),
        control.close().catch(() => {}),
      ])
      for (const handle of handles.values()) handle.stop()
      await Promise.allSettled([...pendingSettleWrites])
      if (
        handles.size === 0 &&
        !parseFailed &&
        process.platform !== 'win32'
      ) {
        await rm(getDaemonRuntimeDir(), { recursive: true, force: false }).catch(
          () => {},
        )
      }
    },
  }
}
