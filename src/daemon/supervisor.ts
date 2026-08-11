import { spawn } from 'child_process'
import { mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'fs/promises'
import { createServer, Socket, type Server } from 'net'
import { basename, dirname, join } from 'path'
import { StringDecoder } from 'string_decoder'
import chokidar, { type FSWatcher } from 'chokidar'
import { logEvent } from '../services/analytics/index.js'
import { logForDebugging } from '../utils/debug.js'
import { getErrnoCode, isENOENT } from '../utils/errors.js'
import {
  getProcessStartToken,
  getProcessStartTokenAsync,
} from '../utils/genericProcessUtils.js'
import { logError } from '../utils/log.js'
import {
  canonicalizePath,
  getProjectDir,
} from '../utils/sessionStoragePortable.js'
import { hasTranscriptMessages } from '../utils/transcriptValidation.js'
import { withTimeout } from '../utils/sleep.js'
import { encodeControlFrame } from './framing.js'
import {
  isSettledJob,
  readJobState,
  writeJobState,
  getJobDir,
} from './jobs.js'
import {
  cleanupStaleRuntimeDirs,
  ensureDaemonRuntimeDir,
  getControlSocketPath,
  getDaemonRuntimeDir,
  getDispatchDir,
  getPtyDir,
  getPtyErrorPath,
  getPtySocketPath,
  getRejectedDispatchDir,
  getRendezvousDir,
  getRendezvousSocketPath,
  getRosterPath,
  getSettledDir,
  getSettledPath,
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

const MAX_SOCKET_BUFFER = 1_048_576
const MAX_DISPATCH_BYTES = 262_144
const MAX_DISPATCH_AGE_MS = 86_400_000
const MAX_RESPAWN_ATTEMPTS = 20
const RESPAWN_DELAY_MS = 10_000

type Dispose = () => void

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

interface AuthSnapshot {
  accessToken?: string
  subscriptionType?: string
  rateLimitTier?: string
}

function launchExecutable(): { command: string; prefix: string[] } {
  if (process.argv[1] && process.execPath !== process.argv[1]) {
    return { command: process.execPath, prefix: [process.argv[1]] }
  }
  return { command: process.execPath, prefix: [] }
}

function launchArgs(
  dispatch: Dispatch,
  attempt: number,
  currentTranscriptValid: boolean,
): string[] {
  if (attempt > 1 && currentTranscriptValid) {
    return ['--resume', dispatch.sessionId, ...dispatch.respawnFlags]
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
      if (!socket || socket.destroyed) return false
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

class BackgroundHandle {
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
  private stopped = false
  private killed = false
  private upgrading = false
  private respawnTimer?: NodeJS.Timeout
  private pidPoll?: NodeJS.Timeout
  private pidPollTick = 0
  private ring: string[] = []
  private ringBytes = 0
  private cols = 200
  private rows = 50

  constructor(
    readonly dispatch: Dispatch,
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
    getAuthSnapshot?: () => AuthSnapshot | undefined,
  ) {
    const handle = new BackgroundHandle(dispatch, getAuthSnapshot)
    void handle.spawn()
    handle.connectRendezvous()
    return handle
  }

  static async adopt(
    record: WorkerRecord,
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
    const handle = new BackgroundHandle(record.dispatch, getAuthSnapshot, record)
    handle.procStart = record.procStart ?? token
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
    return this.killed
  }

  tail(count: number): string[] {
    return count > 0 ? this.ring.slice(-count) : []
  }

  write(value: string): void {
    this.pty?.write(value)
  }

  reply(value: string): boolean {
    if (this.pty) {
      this.pty.write(`\x1B[200~${value}\x1B[201~`)
      setTimeout(() => this.pty?.write('\r'), 10)
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
    this.rendezvous?.send({ type: 'repaint' })
    const temporaryCols = Math.max(2, cols - 1)
    this.resize(temporaryCols, rows)
    this.signalPtyProcessGroup()
    const timer = setTimeout(() => {
      if (this.cols === temporaryCols && this.rows === rows) {
        this.resize(cols, rows)
        this.signalPtyProcessGroup()
      }
    }, 30)
    return () => clearTimeout(timer)
  }

  kill(signal: NodeJS.Signals = 'SIGTERM'): void {
    this.killed = true
    if (this.respawnTimer) clearTimeout(this.respawnTimer)
    this.respawnTimer = undefined
    if (this.pty) this.pty.kill(signal)
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
    if (this.upgrading || !this.pty || !this.record.pid) {
      return { respawned: false, reason: 'in-progress' }
    }
    if (this.killed || this.stopped || this.record.outcome) {
      return { respawned: false, reason: 'no-state' }
    }
    if (this.attachers.size > 0) return { respawned: false, reason: 'attached' }
    const state = await readJobState(getJobDir(this.dispatch.short))
    if (this.upgrading || !this.pty || !this.record.pid) {
      return { respawned: false, reason: 'in-progress' }
    }
    if (!state) return { respawned: false, reason: 'no-state' }
    if (!state.cliVersion || state.cliVersion === MACRO.VERSION) {
      return { respawned: false, reason: 'not-stale' }
    }
    if (state.tempo !== 'idle') return { respawned: false, reason: 'busy' }
    this.upgrading = true
    const rendezvousSent = this.rendezvous?.send({ type: 'shutdown' }) ?? false
    if (!rendezvousSent) this.sigtermForUpgrade()
    else {
      const timer = setTimeout(() => {
        if (this.upgrading && !this.record.outcome) this.sigtermForUpgrade()
      }, 2_000)
      timer.unref()
    }
    logEvent('tengu_bg_respawn_stale', { rvSent: rendezvousSent })
    return { respawned: true }
  }

  private sigtermForUpgrade(): void {
    try {
      this.pty?.kill('SIGTERM')
    } catch {}
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
      dispatch: JSON.parse(
        JSON.stringify(this.dispatch, (_key, value) =>
          typeof value === 'string' && value.length > 4_096
            ? value.slice(0, 4_096)
            : value,
        ),
      ) as Dispatch,
    }
  }

  stop(): void {
    if (this.killed) this.finish('killed')
    this.stopped = true
    if (this.respawnTimer) clearTimeout(this.respawnTimer)
    this.respawnTimer = undefined
    this.clearLiveness()
    this.offData?.dispose()
    this.offExit?.dispose()
    this.pty?.dispose()
    this.pty = undefined
  }

  private async spawn(): Promise<void> {
    this.attempt++
    const dispatch = this.dispatch
    const jobDir = getJobDir(dispatch.short)
    await mkdir(jobDir, { recursive: true }).catch(() => {})
    const sourceSessionId =
      dispatch.launch.mode === 'resume' ? dispatch.launch.sessionId : undefined
    let currentTranscriptValid = false
    let sourceTranscriptMissing = false
    if (this.attempt > 1) {
      const cwd = await canonicalizePath(dispatch.cwd)
      const currentTranscript = join(
        getProjectDir(cwd),
        `${dispatch.sessionId}.jsonl`,
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
    if (this.killed || this.stopped || this.record.outcome) return
    if (sourceTranscriptMissing) {
      this.patch({
        state: 'crashed',
        detail: `source session ${sourceSessionId} not found`,
      })
      this.finish('crashed')
      return
    }
    const executable = launchExecutable()
    const args = launchArgs(dispatch, this.attempt, currentTranscriptValid)
    const env = jobEnvironment(
      dispatch,
      jobDir,
      this.rendezvousSocket,
      this.getAuthSnapshot?.(),
    )
    if (this.attempt > 1 && currentTranscriptValid) {
      env.CLAUDE_CODE_RESUME_INTERRUPTED_TURN = '1'
    }
    try {
      const host = spawn(
        executable.command,
        [
          ...executable.prefix,
          '--bg-pty-host',
          this.ptySocket,
          String(this.cols),
          String(this.rows),
          '--',
          executable.command,
          ...executable.prefix,
          ...args,
        ],
        {
          cwd: dispatch.cwd,
          env,
          stdio: 'ignore',
          detached: true,
          windowsHide: true,
        },
      )
      host.unref()
      if (!host.pid) throw new Error('PTY host did not return a pid')
      this.wirePty(connectPtyHost(this.ptySocket, host.pid))
      this.patch({
        pid: host.pid,
        attempt: this.attempt,
        state: this.attempt > 1 ? 'resuming' : 'running',
        cliVersion: MACRO.VERSION,
      })
      logEvent('tengu_bg_worker_spawn', { attempt: this.attempt })
      void getProcessStartTokenAsync(host.pid).then((token) => {
        if (
          !token ||
          this.record.pid !== host.pid ||
          this.stopped ||
          this.record.outcome
        ) {
          return
        }
        this.procStart = token
        this.patch({ pid: host.pid })
      })
    } catch (error) {
      this.scheduleRespawn(String(error))
    }
  }

  private wirePty(pty: PtyClient): void {
    this.pty = pty
    pty.onResume(() => this.rendezvous?.send({ type: 'repaint' }))
    this.offData = pty.onData((data) => {
      const cleaned = data.includes(DETACH_SEQUENCE)
        ? data.replaceAll(DETACH_SEQUENCE, '')
        : data
      this.ring.push(cleaned)
      this.ringBytes += cleaned.length
      while (this.ringBytes > 262_144 && this.ring.length > 1) {
        this.ringBytes -= this.ring.shift()!.length
      }
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

  private onExit(exitCode: number | undefined): void {
    if (this.stopped) return
    logEvent('tengu_bg_worker_exit', {
      code: exitCode ?? undefined,
      attempt: this.attempt,
    })
    if (this.killed) return this.finish('killed')
    if (this.upgrading) {
      this.upgrading = false
      this.attempt = 1
      this.patch({ pid: 0, state: 'starting', detail: 'upgrading' })
      this.procStart = undefined
      void this.spawn()
    } else if (exitCode === 0) {
      this.finish('done')
    } else {
      this.scheduleRespawn(`exit ${exitCode}`)
    }
  }

  private connectRendezvous(): void {
    if (this.rendezvous || this.stopped || this.record.outcome) return
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
        this.finish(this.killed ? 'killed' : 'crashed')
      }
      return
    }
    if (checkRecycled && this.pidPollTick++ % 12 !== 0) return
    if (this.pidRecycled()) this.finish(this.killed ? 'killed' : 'crashed')
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
    this.patch({
      pid: 0,
      state: 'crashed',
      detail: `${detail}; respawning`,
    })
    this.procStart = undefined
    this.respawnTimer = setTimeout(() => {
      this.respawnTimer = undefined
      if (!this.stopped && !this.killed) void this.spawn()
    }, RESPAWN_DELAY_MS)
    this.respawnTimer.unref()
  }

  private patch(patch: Partial<BackgroundRecord>): void {
    Object.assign(this.record, patch)
    this.state.emit(patch)
  }

  private finish(outcome: NonNullable<BackgroundRecord['outcome']>): void {
    if (this.record.outcome) return
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
    await mkdir(dirname(getRosterPath()), { recursive: true })
    const temporary = `${getRosterPath()}.tmp.${process.pid}`
    await writeFile(temporary, JSON.stringify(manifest, null, 2), 'utf8')
    await rename(temporary, getRosterPath())
  })
  rosterWrite = next.catch(() => {})
  return next
}

async function persistSettled(
  handle: BackgroundHandle,
  outcome: NonNullable<BackgroundRecord['outcome']>,
): Promise<void> {
  const record = handle.record
  await writeFile(
    getSettledPath(record.short),
    JSON.stringify(
      {
        short: record.short,
        sessionId: record.sessionId,
        name: record.name,
        intent: record.intent,
        outcome,
        cwd: record.cwd,
        worktreePath: record.worktreePath,
        startedAt: record.startedAt,
        settledAt: record.settledAt ?? Date.now(),
        attempts: record.attempt,
      },
      null,
      2,
    ),
    'utf8',
  )
}

function wireHandle(
  handles: Map<string, BackgroundHandle>,
  handle: BackgroundHandle,
  onKeepAliveChange?: () => void,
): void {
  handle.state.subscribe((patch) => {
    if (patch.pid) void writeRoster(handles)
    if (patch.state === 'crashed') {
      const dir = getJobDir(handle.record.short)
      void readJobState(dir).then((state) => {
        if (!state || isSettledJob(state)) return
        return writeJobState(dir, {
          ...state,
          state: 'crashed',
          detail: handle.record.detail,
          tempo: 'idle',
          inFlight: undefined,
          updatedAt: new Date().toISOString(),
        })
      })
    }
  })
  handle.settled.subscribe((outcome) => {
    if (!outcome) return
    void persistSettled(handle, outcome)
    const dir = getJobDir(handle.record.short)
    void readJobState(dir).then((state) => {
      if (!state || isSettledJob(state)) return
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
    handles.delete(handle.record.short)
    onKeepAliveChange?.()
    void writeRoster(handles)
    void unlink(getRendezvousSocketPath(handle.record.short)).catch(() => {})
    void unlink(getPtySocketPath(handle.record.short)).catch(() => {})
    void unlink(getPtyErrorPath(getPtySocketPath(handle.record.short))).catch(
      () => {},
    )
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
          error: "daemon didn't acknowledge in time — retry",
          code: 'ETIMEOUT',
        },
  )
}

async function handleControl(
  handles: Map<string, BackgroundHandle>,
  dispatch: (value: Dispatch) => void,
  onNudge: () => Promise<boolean>,
  isReady: () => boolean,
  socket: Socket,
  raw: string,
  initialData: Buffer,
  registerLease: (socket: Socket) => void,
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
  if (unparsed.op === 'lease') {
    registerLease(socket)
    sendJson(socket, { ok: true, op: 'lease' }, false)
    return
  }
  if (!isReady()) {
    sendJson(socket, {
      ok: false,
      error: 'daemon starting (adoption in progress)',
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
      error: `proto mismatch (server=${PROTOCOL_VERSION}, client=${clientProtocol}) — daemon and CLI versions differ; restart claude`,
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
        alive: Boolean(handle && !handle.record.outcome),
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
      if (!handle) {
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
      if (!handle || handle.record.outcome) {
        sendJson(socket, {
          ok: false,
          error: 'job not found — it may have already exited',
          code: 'ENOJOB',
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
        if (!transcriptExists) await rm(transcript, { force: true }).catch(() => {})
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
      registerLease(socket)
      sendJson(socket, { ok: true, op: 'attach' }, false)
      logEvent('tengu_bg_attach', {})
      let bufferedOutput: string[] | null = []
      let bufferedBytes = 0
      let markerTail = ''
      let bufferTimer: NodeJS.Timeout
      const flushBufferedOutput = (write: boolean) => {
        if (bufferedOutput === null) return
        const output = bufferedOutput
        bufferedOutput = null
        clearTimeout(bufferTimer)
        if (write && !socket.destroyed) {
          for (const data of output) socket.write(data)
        }
      }
      bufferTimer = setTimeout(flushBufferedOutput, 500, true)
      bufferTimer.unref()
      const stopStream = handle.stream.subscribe((data) => {
        if (socket.destroyed) return
        if (bufferedOutput !== null) {
          const withTail = markerTail + data
          if (withTail.includes('\x1B[2J')) {
            const fromMarker = data.includes('\x1B[2J') ? data : withTail
            flushBufferedOutput(false)
            if (socket.writableLength <= MAX_SOCKET_BUFFER) {
              socket.write(fromMarker)
            } else socket.destroy()
            return
          }
          bufferedOutput.push(data)
          bufferedBytes += data.length
          markerTail = data.slice(-3)
          if (bufferedBytes > 65_536) flushBufferedOutput(true)
          return
        }
        if (socket.writableLength > MAX_SOCKET_BUFFER) socket.destroy()
        else socket.write(data)
      })
      const attachId: unknown = message.attachId ?? socket
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
      registerLease(socket)
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
    case 'lease':
      return
  }
}

async function startControlServer(
  handles: Map<string, BackgroundHandle>,
  dispatch: (value: Dispatch) => void,
  onNudge: () => Promise<boolean>,
  isReady: () => boolean,
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
  const leases = new Set<Socket>()
  const registerLease = (socket: Socket) => {
    if (leases.has(socket)) return
    leases.add(socket)
    onLeaseChange?.()
    socket.once('close', () => {
      leases.delete(socket)
      onLeaseChange?.()
    })
  }
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
    socket.on('error', () => socket.destroy())
    let buffered = Buffer.alloc(0)
    const first = (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk])
      const newline = buffered.indexOf(10)
      if (newline < 0) {
        if (buffered.length > MAX_SOCKET_BUFFER) socket.destroy()
        return
      }
      socket.off('data', first)
      const raw = buffered.subarray(0, newline).toString('utf8')
      const remainder = buffered.subarray(newline + 1)
      void handleControl(
        handles,
        dispatch,
        onNudge,
        isReady,
        socket,
        raw,
        remainder,
        registerLease,
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
  await mkdir(getRejectedDispatchDir(), { recursive: true }).catch(() => {})
  await rename(path, join(getRejectedDispatchDir(), path.split('/').at(-1)!)).catch(
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
    metadata = await stat(path)
  } catch (error) {
    if (!isENOENT(error)) await rejectDispatch(path, String(error))
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
  await mkdir(getDispatchDir(), { recursive: true })
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
  if (process.platform === 'win32') return
  const entries = await readdir(getPtyDir()).catch(() => [])
  let reaped = 0
  for (const entry of entries) {
    if (!entry.endsWith('.sock')) continue
    const short = entry.slice(0, -5)
    if (handles.has(short)) continue
    reaped++
    const socketPath = getPtySocketPath(short)
    const socket = new Socket()
    socket.on('error', () => {
      void unlink(socketPath).catch(() => {})
      void unlink(getPtyErrorPath(socketPath)).catch(() => {})
    })
    socket.once('connect', () => {
      socket.resume()
      socket.write(encodeControlFrame({ t: 'kill', sig: 'SIGTERM' }))
      socket.end()
      const timer = setTimeout(() => socket.destroy(), 2_000)
      timer.unref()
    })
    socket.connect(socketPath)
  }
  if (reaped > 0) {
    log(`bg orphan-reap: ${reaped} roster-less pty sock(s)`)
    logEvent('tengu_bg_orphan_reap', { reaped })
  }
}

export async function runBackgroundSupervisor(options?: {
  getAuthSnapshot?: () => AuthSnapshot | undefined
  log?: (message: string) => void
  onNudge?: () => Promise<boolean>
  onKeepAliveChange?: () => void
}): Promise<{
  handles: Map<string, BackgroundHandle>
  dispatch(value: Dispatch): void
  leaseCount(): number
  liveHandleCount(): number
  killAll(signal: NodeJS.Signals): void
  close(): Promise<void>
}> {
  const log = options?.log ?? ((message) => logForDebugging(message))
  const handles = new Map<string, BackgroundHandle>()
  let closing = false
  let ready = false
  const dispatch = (value: Dispatch, retry = 0) => {
    if (closing) return
    const existing = handles.get(value.short)
    if (existing) {
      if ((existing.isKilling || existing.record.outcome) && retry < 30) {
        setTimeout(() => dispatch(value, retry + 1), 100)
        return
      }
      log(`bg: dup dispatch ${value.short} dropped (existing handle still live)`)
      return
    }
    const handle = BackgroundHandle.spawn(value, options?.getAuthSnapshot)
    handles.set(value.short, handle)
    wireHandle(handles, handle, options?.onKeepAliveChange)
    options?.onKeepAliveChange?.()
    void writeRoster(handles)
    log(`bg spawned ${value.short} (${value.source})`)
  }

  await ensureDaemonRuntimeDir()
  const control = await startControlServer(
    handles,
    dispatch,
    options?.onNudge ?? (async () => false),
    () => ready,
    options?.onKeepAliveChange,
  )
  await Promise.all([
    mkdir(getRendezvousDir(), { recursive: true, mode: 0o700 }),
    mkdir(getPtyDir(), { recursive: true, mode: 0o700 }),
    mkdir(getSettledDir(), { recursive: true }),
  ])
  cleanupStaleRuntimeDirs()
  const { manifest: roster, parseFailed } = await readRoster()
  let adopted = 0
  let dead = 0
  await Promise.all(
    Object.values(roster.workers).map(async (record) => {
      const handle = await BackgroundHandle.adopt(
        record,
        options?.getAuthSnapshot,
      )
      if (handle) {
        handles.set(record.dispatch.short, handle)
        wireHandle(handles, handle, options?.onKeepAliveChange)
        adopted++
        return
      }
      dead++
      if (process.platform !== 'win32') {
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
  await writeRoster(handles)
  ready = true
  options?.onKeepAliveChange?.()
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
    killAll: signal => {
      for (const handle of handles.values()) {
        if (!handle.record.outcome) handle.kill(signal)
      }
    },
    close: async () => {
      closing = true
      await Promise.all([watcher.close(), control.close()])
      for (const handle of handles.values()) handle.stop()
      if (
        handles.size === 0 &&
        !parseFailed &&
        process.platform !== 'win32'
      ) {
        await rm(getDaemonRuntimeDir(), { recursive: true, force: true }).catch(
          () => {},
        )
      }
    },
  }
}
