import { spawn, type ChildProcess } from 'child_process'
import { createWriteStream, type WriteStream } from 'fs'
import {
  open,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from 'fs/promises'
import { basename, dirname, join, normalize } from 'path'
import { createInterface } from 'readline'
import { isDeepStrictEqual } from 'util'
import chokidar from 'chokidar'
import { logEvent } from '../services/analytics/index.js'
import { initializeGrowthBook } from '../services/analytics/growthbook.js'
import { logEventTo1PAwaitable } from '../services/analytics/firstPartyEventLogger.js'
import {
  fleetGateRejected,
  ensureFleetGateHydrated,
  isAgentsFleetEnabled,
  isDaemonCliEnabled,
  isDaemonServiceInstallEnabled,
  isDaemonServiceRecalled,
  isDaemonWorkerRegistryEnabled,
} from '../utils/agentsFleet.js'
import { isInBundledMode } from '../utils/bundledMode.js'
import { logForDebugging } from '../utils/debug.js'
import { errorMessage, getErrnoCode, isENOENT } from '../utils/errors.js'
import { logError } from '../utils/log.js'
import {
  getRelaunchLauncher,
  type RelaunchLauncher,
} from '../utils/relaunch.js'
import { sleep } from '../utils/sleep.js'
import { getProcessStartTokenAsync } from '../utils/genericProcessUtils.js'
import { getXDGDataHome } from '../utils/xdg.js'
import {
  createDaemonLock,
  getRunningDaemon,
  readDaemonLock,
  removeDaemonLock,
  replaceDaemonLock,
  processLooksLikeDaemon,
  stopRunningDaemon,
  type DaemonLock,
} from './lock.js'
import { daemonSpawnEnv, requestControl } from './client.js'
import { createDaemonAuthManager } from './auth.js'
import {
  controlDaemonService,
  getDaemonExecutablePath,
  getDefaultDaemonConfigPath,
  getDefaultDaemonLogPath,
  installDaemonService,
  isDaemonServiceInstalled,
  isServiceInstallSupported,
  serviceExecutableIsMissing,
  uninstallDaemonService,
} from './service.js'
import { runBackgroundSupervisor } from './supervisor.js'
import { WORKER_KINDS } from './workerRegistry.js'
import { handleCliKind, handleListAllKinds } from './cli.js'
import { getDaemonStatusPath } from './paths.js'
import { formatBgDaemonStatus, getBgDaemonStatus } from './status.js'
import { reapOrphanWorkers } from './orphanReaper.js'

const SERVICE_HELP = `  install           Install as a launchctl/systemd service (persists across reboot)
  start             Start the installed service
  restart           Restart the installed service
`
const SERVICE_DISABLED_HELP = `
  Service install is disabled in this version — the daemon runs on demand
  and exits when the last client disconnects.
`
const REGISTRY_HELP = `
Listing:
  list [--json]                             Flat list across all kinds
  scheduled [--json]                        List scheduled tasks
  assistant [--json]                        List assistants
  remote-control [--json]                   List remote-control servers

Mutation (require the service to be installed):
  scheduled add --cron "<expr>" --prompt "<text>" [--dir <path>]
            [--permission-mode <mode>] [--model <id>] [--id <task-id>]
  scheduled remove <task-id>
  assistant add [--dir <path>] [--name <n>] [--model <id>]
            [--permission-mode <mode>]
  assistant remove <name-or-dir>
  remote-control add [--dir <path>] [--name <n>]
                 [--spawn-mode same-dir|worktree]
  remote-control remove <name-or-dir>
`

function daemonHelp(): string {
  return `Usage: claude daemon [subcommand] [options]

Service lifecycle:
  run [json-path]   Run the supervisor in the foreground (default when piped)
  status            Show daemon pid, version, uptime
  logs              Tail the daemon log (Ctrl-C to stop)
  uninstall         Remove the background service (launchctl/systemd)
  stop              Shut down the supervisor and terminate background sessions
                      --any           also stop a transient (non-service) daemon
                      --keep-workers  leave detached sessions running
${isDaemonServiceInstallEnabled() ? SERVICE_HELP : SERVICE_DISABLED_HELP}${isDaemonWorkerRegistryEnabled() ? REGISTRY_HELP : ''}
Options:
  --json-path <p>   Config file (default: ~/.claude/daemon.json)
  --log-file <p>    Log file (default: ~/.claude/daemon.log)
  --help, -h        Show this help
`
}

type DaemonSubcommand =
  | 'run'
  | 'install'
  | 'uninstall'
  | 'start'
  | 'stop'
  | 'restart'
  | 'status'
  | 'log'
  | 'logs'
  | 'list'
  | 'scheduled'
  | 'assistant'
  | 'remote-control'
  | 'hub'

export interface ParsedDaemonArgs {
  sub: string
  jsonPath: string
  logPath: string
  origin?: 'foreground' | 'service' | 'transient'
  spawnedBy?: { label: string; cwd: string; pid: number }
  rest: string[]
}

function parseOrigin(value: string): ParsedDaemonArgs['origin'] {
  if (value === 'foreground' || value === 'service' || value === 'transient') {
    return value
  }
  if (value === 'auto') return 'transient'
  return undefined
}

function parseSpawnedBy(
  value: string,
): ParsedDaemonArgs['spawnedBy'] {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.label === 'string' &&
      typeof parsed.cwd === 'string' &&
      typeof parsed.pid === 'number'
    ) {
      return { label: parsed.label, cwd: parsed.cwd, pid: parsed.pid }
    }
  } catch {}
  return undefined
}

export function parseArgs(args: string[]): ParsedDaemonArgs {
  let jsonPath = getDefaultDaemonConfigPath()
  let explicitJsonPath = false
  let logPath = getDefaultDaemonLogPath()
  let origin: ParsedDaemonArgs['origin']
  let spawnedBy: ParsedDaemonArgs['spawnedBy']
  const consumed = new Set<number>()
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--json-path' && args[index + 1]) {
      consumed.add(index)
      consumed.add(++index)
      jsonPath = args[index]
      explicitJsonPath = true
    } else if (arg.startsWith('--json-path=')) {
      consumed.add(index)
      jsonPath = arg.slice(12)
      explicitJsonPath = true
    } else if (arg === '--log-file' && args[index + 1]) {
      consumed.add(index)
      consumed.add(++index)
      logPath = args[index]
    } else if (arg.startsWith('--log-file=')) {
      consumed.add(index)
      logPath = arg.slice(11)
    } else if (arg === '--origin' && args[index + 1]) {
      consumed.add(index)
      consumed.add(++index)
      origin = parseOrigin(args[index])
    } else if (arg.startsWith('--origin=')) {
      consumed.add(index)
      origin = parseOrigin(arg.slice(9))
    } else if (arg === '--spawned-by' && args[index + 1]) {
      consumed.add(index)
      consumed.add(++index)
      spawnedBy = parseSpawnedBy(args[index])
    }
  }
  const rest = args.filter((_arg, index) => !consumed.has(index))
  const commands = new Set<string>([
    'run',
    'install',
    'uninstall',
    'start',
    'stop',
    'restart',
    'status',
    'log',
    'logs',
    'list',
    'scheduled',
    'assistant',
    'remote-control',
    'hub',
  ])
  const defaultSub: DaemonSubcommand = process.stdin.isTTY ? 'hub' : 'run'
  const positional = rest.findIndex((arg) => !arg.startsWith('-'))
  if (positional === -1) {
    return { sub: defaultSub, jsonPath, logPath, origin, spawnedBy, rest }
  }
  const candidate = rest[positional]
  if (!commands.has(candidate)) {
    if (!/[./\\~]/.test(candidate)) {
      return { sub: candidate, jsonPath, logPath, origin, spawnedBy, rest: [] }
    }
    return {
      sub: 'run',
      jsonPath: explicitJsonPath ? jsonPath : candidate,
      logPath,
      origin,
      spawnedBy,
      rest: [],
    }
  }
  const remaining = [
    ...rest.slice(0, positional),
    ...rest.slice(positional + 1),
  ]
  if (candidate === 'run' && !explicitJsonPath) {
    const path = remaining.find((arg) => !arg.startsWith('-'))
    if (path) jsonPath = path
  }
  return {
    sub: candidate,
    jsonPath,
    logPath,
    origin,
    spawnedBy,
    rest: remaining,
  }
}

function output(message: string): void {
  process.stdout.write(`${message}\n`)
}

function outputError(message: string): void {
  process.stderr.write(`${message}\n`)
}

type WorkerConfig = Record<string, unknown[]>

type LoadedWorkerConfig = {
  config: WorkerConfig
  unknownKeys: string[]
}

type WorkerConfigDiff = {
  stop: string[]
  start: Array<{ id: string; kind: string; config: unknown }>
  restart: Array<{ id: string; kind: string; config: unknown }>
}

type ExecutableIdentity = {
  target: string
  mtimeMs: number
}

const BINARY_IDENTITY_POLL_INTERVAL_MS = 60_000
const CONFIGURED_WORKER_START_STAGGER_MS = 2_000
const DAEMON_LOG_ROTATION_BYTES = 10 * 1024 * 1024

type DaemonLogger = {
  write(scope: string, message: string): void
  close(): Promise<void>
}

function openDaemonLog(path: string): WriteStream {
  const stream = createWriteStream(path, { flags: 'a' })
  // A logging failure must never crash the daemon. The next write/rotation
  // will get another chance to establish the sink.
  stream.on('error', () => {})
  return stream
}

function closeDaemonLog(stream: WriteStream): Promise<void> {
  return new Promise(resolve => stream.end(resolve))
}

async function rotateDaemonLog(path: string): Promise<void> {
  const rotated = `${path}.1`
  try {
    await rename(path, rotated)
  } catch (error) {
    if (isENOENT(error)) return
    await unlink(rotated).catch(() => {})
    await rename(path, rotated).catch(() => unlink(path).catch(() => {}))
  }
}

async function createDaemonLogger(path: string): Promise<DaemonLogger> {
  const mirrorToStdout = process.stdout.isTTY
  let size = await stat(path).then(value => value.size).catch(() => 0)
  if (size > DAEMON_LOG_ROTATION_BYTES) {
    await rotateDaemonLog(path)
    size = 0
  }
  let stream = openDaemonLog(path)
  let rotating = false
  return {
    write(scope, message) {
      const line = `[${new Date().toISOString()}] [${scope}] ${String(message)}\n`
      size += Buffer.byteLength(line)
      stream.write(line)
      if (mirrorToStdout) process.stdout.write(line)
      if (size > DAEMON_LOG_ROTATION_BYTES && !rotating) {
        rotating = true
        const previous = stream
        void (async () => {
          // Windows cannot rename an open file. On Unix, opening the new file
          // before closing the old descriptor avoids dropping concurrent logs.
          if (process.platform === 'win32') {
            await closeDaemonLog(previous)
            await rotateDaemonLog(path)
            stream = openDaemonLog(path)
          } else {
            await rotateDaemonLog(path)
            stream = openDaemonLog(path)
            await closeDaemonLog(previous)
          }
          size = 0
          rotating = false
        })().catch(() => {
          rotating = false
        })
      }
    },
    close: () => closeDaemonLog(stream),
  }
}

function workerKindEnabled(kind: string): boolean {
  return kind === 'heartbeat' || isDaemonWorkerRegistryEnabled()
}

function configuredWorkerCount(config: WorkerConfig): number {
  let count = 0
  for (const kind of Object.keys(WORKER_KINDS)) {
    count += (config[kind] ?? []).length
  }
  return count
}

function daemonWorkerInvocation(): RelaunchLauncher {
  // Daemon children must remain pinned to the daemon's version. A normal
  // interactive relaunch intentionally follows the stable installer symlink.
  if (isInBundledMode()) return { cmd: process.execPath, prefixArgs: [] }
  return getRelaunchLauncher()
}

async function loadWorkerConfigDetails(
  path: string,
): Promise<LoadedWorkerConfig> {
  let value: unknown
  try {
    value = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (isENOENT(error)) return { config: {}, unknownKeys: [] }
    throw error
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`failed to parse ${path} as JSON`)
  }
  const rawConfig = value as Record<string, unknown>
  if (
    rawConfig.$schema !== undefined &&
    typeof rawConfig.$schema !== 'string'
  ) {
    throw new Error('config validation failed: $schema must be a string')
  }
  const knownKeys = new Set(['$schema', ...Object.keys(WORKER_KINDS)])
  const unknownKeys = Object.keys(rawConfig).filter(
    (key) => !knownKeys.has(key),
  )
  const config: WorkerConfig = {}
  for (const [kind, worker] of Object.entries(WORKER_KINDS)) {
    const raw = rawConfig[kind]
    const entries = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw]
    const parsed: unknown[] = []
    for (const entry of entries) parsed.push(worker.schema().parse(entry))
    config[kind] = parsed
  }
  return { config, unknownKeys }
}

async function loadWorkerConfig(path: string): Promise<WorkerConfig> {
  return (await loadWorkerConfigDetails(path)).config
}

export function diffWorkerConfig(
  previous: WorkerConfig,
  next: WorkerConfig,
): WorkerConfigDiff {
  const diff: WorkerConfigDiff = { stop: [], start: [], restart: [] }
  for (const kind of Object.keys(WORKER_KINDS)) {
    const oldEntries = previous[kind] ?? []
    const newEntries = next[kind] ?? []
    const length = Math.max(oldEntries.length, newEntries.length)
    for (let index = 0; index < length; index++) {
      const id = `${kind}:${index}`
      const oldConfig = oldEntries[index]
      const newConfig = newEntries[index]
      if (oldConfig !== undefined && newConfig === undefined) {
        diff.stop.push(id)
      } else if (oldConfig === undefined && newConfig !== undefined) {
        diff.start.push({ id, kind, config: newConfig })
      } else if (!isDeepStrictEqual(oldConfig, newConfig)) {
        diff.restart.push({ id, kind, config: newConfig })
      }
    }
  }
  return diff
}

export function watchDaemonConfig(
  path: string,
  onChange: () => void,
): () => void {
  const directory = dirname(path)
  const normalizedDirectory = normalize(directory)
  const filename = basename(path)
  const watcher = chokidar.watch(directory, {
    persistent: true,
    ignoreInitial: true,
    depth: 0,
    ignored: (candidate) => {
      const normalizedCandidate = normalize(candidate)
      return (
        normalizedCandidate !== normalizedDirectory &&
        basename(normalizedCandidate) !== filename
      )
    },
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    atomic: true,
    ignorePermissionErrors: true,
  })
  watcher.on('add', onChange)
  watcher.on('change', onChange)
  watcher.on('unlink', onChange)
  watcher.on('error', (error) =>
    logForDebugging(`[daemon-config] watcher error: ${String(error)}`, {
      level: 'warn',
    }),
  )
  return () => void watcher.close().catch(() => {})
}

export async function getExecutableIdentity(
  path: string,
): Promise<ExecutableIdentity | null> {
  try {
    const target = await realpath(path)
    const metadata = await stat(target)
    return { target, mtimeMs: metadata.mtimeMs }
  } catch {
    return null
  }
}

export function executableIdentityChanged(
  previous: ExecutableIdentity,
  next: ExecutableIdentity,
): boolean {
  if (previous.target !== next.target) return true
  return !isInBundledMode() && previous.mtimeMs !== next.mtimeMs
}

class ManagedWorker {
  private child: ChildProcess | null = null
  private spawnedAt = 0
  private stopping = false
  private crashes = 0
  private respawn?: NodeJS.Timeout
  private exitPromise: Promise<void> | null = null

  constructor(
    readonly id: string,
    readonly kind: string,
    private config: unknown,
    private invocation: RelaunchLauncher,
    private readonly log: (scope: string, message: string) => void,
    private readonly auth: ReturnType<typeof createDaemonAuthManager>,
    private readonly onStateChange?: () => void,
  ) {}

  get status(): { pid: number; startedAt: number } | null {
    const pid = this.child?.pid
    return pid === undefined ? null : { pid, startedAt: this.spawnedAt }
  }

  updateConfig(config: unknown): void {
    this.config = config
  }

  start(delayMs = 0): void {
    this.stopping = false
    if (delayMs) {
      this.respawn = setTimeout(() => this.spawn(), delayMs)
      this.respawn.unref()
    } else this.spawn()
  }

  async stop(): Promise<void> {
    this.stopping = true
    if (this.respawn) {
      clearTimeout(this.respawn)
      this.respawn = undefined
    }
    const child = this.child
    if (!child) return
    const exitPromise = this.exitPromise
    let sent = false
    try {
      sent = child.send?.({ type: 'shutdown' }) ?? false
    } catch {}
    if (process.platform !== 'win32' || !sent) child.kill('SIGTERM')
    const timer = setTimeout(() => child.kill('SIGKILL'), 5_000)
    timer.unref()
    if (exitPromise) await exitPromise
    clearTimeout(timer)
  }

  private spawn(): void {
    const started = Date.now()
    this.spawnedAt = started
    const child = spawn(
      this.invocation.cmd,
      [...this.invocation.prefixArgs, '--daemon-worker', this.kind],
      {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      windowsHide: true,
      },
    )
    this.child = child
    this.onStateChange?.()
    child.stdin?.on('error', error => {
      this.log(this.id, `stdin write error: ${error.message}`)
    })
    child.stdin?.write(`${JSON.stringify({
      config: this.config,
      initialAccessToken: this.auth.getAccessToken(),
    })}\n`)
    child.stdin?.end()
    this.auth.attachWorker(child)
    const stdout = createInterface({ input: child.stdout! })
    stdout.on('line', (line) =>
      this.log(this.id, line),
    )
    const stderr = createInterface({ input: child.stderr! })
    stderr.on('line', (line) =>
      this.log(this.id, line),
    )
    let finished = false
    this.exitPromise = new Promise<void>(resolve => {
      const finish = (code: number | null, signal: NodeJS.Signals | null) => {
        if (finished) return
        finished = true
        stdout.close()
        stderr.close()
        this.child = null
        this.onStateChange?.()
        this.auth.detachWorker(child)
        this.exitPromise = null
        this.onExit(code, signal, started)
        resolve()
      }
      child.on('exit', finish)
      child.on('error', error => {
        this.log(this.id, `spawn error: ${error.message}`)
        if (!isENOENT(error)) {
          finish(null, null)
          return
        }
        void resolveLatestNativeExecutable().then(next => {
          if (next && next !== this.invocation.cmd) {
            this.log(
              this.id,
              `execPath gone (version GC?) — re-resolved to ${next}`,
            )
            this.invocation = { cmd: next, prefixArgs: [] }
            this.crashes = 0
          }
          finish(null, null)
        })
      })
    })
  }

  private onExit(
    code: number | null,
    signal: NodeJS.Signals | null,
    started: number,
  ): void {
    if (this.stopping) return
    const uptime = Date.now() - started
    if (code === 75) {
      const wait = Math.round(30_000 * (0.5 + Math.random()))
      this.log(
        this.id,
        `exited tempfail code=${code} uptime=${uptime}ms — retry in ${wait}ms`,
      )
      this.scheduleRespawn(wait)
      return
    }
    if (code === 78) {
      this.log(this.id, `exited permanently code=${code} uptime=${uptime}ms — will not respawn`)
      logEvent('tengu_daemon_worker_permanent_exit', {
        exit_code: code ?? undefined,
        uptime_ms: uptime,
        worker_kind: this.kind,
      })
      return
    }
    if (code !== 0 || uptime < 60_000) {
      this.crashes++
      const wait = Math.round(
        Math.min(1_000 * 2 ** this.crashes, 300_000) *
          (0.5 + Math.random()),
      )
      this.log(
        this.id,
        `exited code=${code} sig=${signal} uptime=${uptime}ms consecutive=${this.crashes} backoff=${wait}ms`,
      )
      logEvent('tengu_daemon_worker_crash', {
        consecutive: this.crashes,
        exit_code: code ?? undefined,
        uptime_ms: uptime,
        worker_kind: this.kind,
      })
      this.scheduleRespawn(wait)
      return
    }
    this.crashes = 0
    this.log(
      this.id,
      `exited code=${code} sig=${signal} uptime=${uptime}ms (clean) — respawning`,
    )
    this.spawn()
  }

  private scheduleRespawn(delayMs: number): void {
    if (this.respawn) clearTimeout(this.respawn)
    this.respawn = setTimeout(() => {
      this.respawn = undefined
      if (!this.stopping) this.spawn()
    }, delayMs)
    this.respawn.unref()
  }
}

async function resolveLatestNativeExecutable(): Promise<string | null> {
  if (!isInBundledMode()) return null
  const versions = join(getXDGDataHome(), 'claude', 'versions')
  try {
    const entries = (await readdir(versions)).sort((left, right) =>
      left.localeCompare(right, undefined, { numeric: true }),
    )
    return entries.length ? join(versions, entries.at(-1)!) : null
  } catch {
    return null
  }
}

async function writeDaemonStatus(
  workers: Record<string, { pid: number; startedAt: number }>,
): Promise<void> {
  const path = getDaemonStatusPath()
  const temporary = `${path}.tmp.${process.pid}`
  const status = {
    supervisorPid: process.pid,
    writtenAt: Date.now(),
    workers,
  }
  try {
    await writeFile(temporary, JSON.stringify(status, null, 2), 'utf8')
    try {
      await rename(temporary, path)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'EEXIST' && code !== 'EPERM' && code !== 'EXDEV') throw error
      await unlink(path).catch(() => {})
      await rename(temporary, path)
    }
  } catch {
    await unlink(temporary).catch(() => {})
  }
}

async function removeDaemonStatus(): Promise<void> {
  await unlink(getDaemonStatusPath()).catch(() => {})
}

async function runDaemon(options: {
  jsonPath: string
  logPath: string
  origin: string
  spawnedBy?: { label: string; cwd: string; pid: number }
  signal: AbortSignal
  watch?: typeof watchDaemonConfig
  createAuth?: typeof createDaemonAuthManager
  staleCheckIntervalMs?: number
  /** @deprecated retained for recovery tests from 2.1.120. */
  binaryIdentityPollIntervalMs?: number
  idleGraceMs?: number
}): Promise<{ upgradeDetected: boolean; exitCode: number }> {
  const logger = await createDaemonLogger(options.logPath)
  const log = (scope: string, message: string) => logger.write(scope, message)
  log(
    'supervisor',
    `─── daemon start ─── version=${MACRO.VERSION} pid=${process.pid} origin=${options.origin}`,
  )
  void initializeGrowthBook()
  let running = await getRunningDaemon()
  let attemptedTakeover = false
  if (
    running?.origin === 'transient' &&
    options.origin !== 'transient'
  ) {
    attemptedTakeover = true
    log(
      'supervisor',
      `transient daemon running (pid=${running.pid}, origin=transient) — asking it to yield to origin=${options.origin}`,
    )
    const response = await requestControl({
      proto: 1,
      op: 'yield',
    })
    if (response.ok && response.op === 'yield' && response.yielding) {
      const deadline = Date.now() + 5_000
      while (running && Date.now() < deadline) {
        await sleep(100)
        running = await getRunningDaemon()
      }
      logEvent('tengu_daemon_yield_takeover', {
        ok: !running,
        new_origin: options.origin,
      })
      if (running) {
        log(
          'supervisor',
          'yield acked but lock still held after 5s — refusing to start',
        )
      }
    } else {
      log(
        'supervisor',
        response.ok
          ? 'existing daemon refused to yield (it reports origin!=transient)'
          : `existing daemon unreachable on control socket (${response.error}); not taking over`,
      )
    }
  }
  if (running) {
    const reason = attemptedTakeover
      ? `origin=${running.origin ?? 'unknown'}; asked it to yield but the handover failed (see above)`
      : options.origin === 'transient'
        ? `origin=${running.origin ?? 'unknown'}; an on-demand daemon never displaces a running one`
        : `origin=${running.origin ?? 'unknown'}; only a transient daemon can be displaced`
    const recovery =
      process.platform === 'win32'
        ? `Stop it with \`taskkill /PID ${running.pid}\`, then retry.`
        : 'Run `claude daemon stop` to stop it, then retry.'
    log(
      'supervisor',
      `another daemon is already running (pid=${running.pid}, version=${running.version}, ${reason}). ${recovery}`,
    )
    await logger.close()
    return { upgradeDetected: false, exitCode: 1 }
  }
  const lock: DaemonLock = {
    pid: process.pid,
    version: MACRO.VERSION,
    jsonPath: options.jsonPath,
    logPath: options.logPath,
    startedAt: Date.now(),
    origin: options.origin,
    spawnedBy: options.spawnedBy,
    procStart: await getProcessStartTokenAsync(process.pid),
  }
  let acquired = await createDaemonLock(lock)
  if (!acquired) {
    const contender = await readDaemonLock()
    if (contender) {
      let isDaemon = false
      try {
        process.kill(contender.pid, 0)
        isDaemon = await processLooksLikeDaemon(contender.pid)
      } catch (error) {
        if (getErrnoCode(error) !== 'ESRCH') isDaemon = true
      }
      if (isDaemon) {
        log('supervisor', `another daemon won the lock race (pid=${contender.pid}) — exiting`)
        await logger.close()
        return { upgradeDetected: false, exitCode: 1 }
      }
    }
    acquired = await replaceDaemonLock(lock)
  }
  if (!acquired) {
    log('supervisor', 'another daemon won the lock race — exiting')
    await logger.close()
    return { upgradeDetected: false, exitCode: 1 }
  }

  const executablePath = getDaemonExecutablePath()
  const initialExecutableIdentity = await getExecutableIdentity(executablePath)
  let upgradeDetected = false
  let shutdownRequested = false
  let serviceRecall = false
  let yielding = false
  let resolveRun: (() => void) | null = null
  const yieldToPersistentDaemon = (): boolean => {
    if (options.origin !== 'transient') return false
    if (!yielding) {
      yielding = true
      log(
        'supervisor',
        'yielding to a foreground/service daemon — bg workers will be re-adopted',
      )
      logEvent('tengu_daemon_yield', {})
      resolveRun?.()
    }
    return true
  }
  const checkForExecutableUpgrade = async (): Promise<boolean> => {
    if (upgradeDetected || !initialExecutableIdentity) return upgradeDetected
    const currentIdentity = await getExecutableIdentity(executablePath)
    if (
      options.signal.aborted ||
      serviceRecall ||
      !currentIdentity ||
      !executableIdentityChanged(initialExecutableIdentity, currentIdentity)
    ) {
      return false
    }
    upgradeDetected = true
    const change =
      initialExecutableIdentity.target === currentIdentity.target
        ? 'mtime changed'
        : `${initialExecutableIdentity.target} → ${currentIdentity.target}`
    log(
      'supervisor',
      `binary at ${executablePath} changed (${change}) — self-restarting for upgrade`,
    )
    resolveRun?.()
    return true
  }

  const workers = new Map<string, ManagedWorker>()
  const workerInvocation = daemonWorkerInvocation()
  const persistWorkerStatus = (): void => {
    const live: Record<string, { pid: number; startedAt: number }> = {}
    for (const [id, worker] of workers) {
      const status = worker.status
      if (status) live[id] = status
    }
    void writeDaemonStatus(live)
  }
  const auth = (options.createAuth ?? createDaemonAuthManager)(
    options.signal,
    message => log('supervisor', message),
    () =>
      [...workers.values()].some(
        worker => WORKER_KINDS[worker.kind]?.needsOAuth === true,
      ),
  )
  const idleGraceMs = options.idleGraceMs ?? 5_000
  let lastGoodConfig: WorkerConfig = {}
  let idleTimer: NodeJS.Timeout | undefined
  let idleExit = false
  let supervisor: Awaited<ReturnType<typeof runBackgroundSupervisor>> | null =
    null
  const liveKeepAliveCount = () =>
    (supervisor?.leaseCount() ?? 0) +
    (supervisor?.liveHandleCount() ?? 0)
  const updateKeepAlive = () => {
    if (options.origin === 'service') return
    if (
      idleExit ||
      upgradeDetected ||
      shutdownRequested ||
      yielding ||
      options.signal.aborted
    ) {
      return
    }
    if (liveKeepAliveCount() > 0) {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = undefined
      return
    }
    if (idleTimer) return
    idleTimer = setTimeout(() => {
      idleTimer = undefined
      if (
        options.signal.aborted ||
        upgradeDetected ||
        liveKeepAliveCount() > 0
      ) {
        return
      }
      idleExit = true
      const configuredWorkers = configuredWorkerCount(lastGoodConfig)
      log(
        'supervisor',
        `idle ${Math.round(idleGraceMs / 1_000)}s with no clients — exiting${
          configuredWorkers > 0
            ? ` (stopping ${configuredWorkers} configured workers)`
            : ''
        }`,
      )
      logEvent('tengu_daemon_idle_exit', {
        grace_ms: idleGraceMs,
        cfg_workers: configuredWorkers,
      })
      resolveRun?.()
    }, idleGraceMs)
    idleTimer.unref()
  }

  const supervisorStart = auth.ready
    .then(() =>
      runBackgroundSupervisor({
        log: (message) => log('bg', message),
        getAuthSnapshot: () => auth.getAuthSnapshot(),
        onNudge: checkForExecutableUpgrade,
        onShutdown: () => {
          shutdownRequested = true
          log('supervisor', 'shutdown requested via control socket')
          resolveRun?.()
        },
        onYield: yieldToPersistentDaemon,
        onKeepAliveChange: updateKeepAlive,
      }),
    )
    .then(async (manager) => {
      if (options.signal.aborted) {
        await manager.close()
        return
      }
      supervisor = manager
      updateKeepAlive()
    })
    .catch((error) => {
      logForDebugging(`background supervisor failed: ${String(error)}`, {
        level: 'error',
      })
    })

  let initialUnknownKeys: string[] = []
  lastGoodConfig = await loadWorkerConfigDetails(options.jsonPath)
    .then((loaded) => {
      initialUnknownKeys = loaded.unknownKeys
      return loaded.config
    })
    .catch((error) => {
      log('supervisor', `config load failed: ${String(error)} — idling`)
      return {} as WorkerConfig
    })
  for (const key of initialUnknownKeys) {
    log('supervisor', `unknown config key '${key}' — upgrade claude?`)
  }
  await auth.ready
  let workerIndex = 0
  for (const kind of Object.keys(WORKER_KINDS)) {
    if (!workerKindEnabled(kind)) continue
    const entries = lastGoodConfig[kind] ?? []
    for (let index = 0; index < entries.length; index++) {
      const workerConfig = entries[index]
      const id = `${kind}:${index}`
      const worker = new ManagedWorker(
        id,
        kind,
        workerConfig,
        workerInvocation,
        log,
        auth,
        persistWorkerStatus,
      )
      workers.set(id, worker)
      worker.start(workerIndex++ * CONFIGURED_WORKER_START_STAGGER_MS)
      log('supervisor', `spawned ${id}`)
    }
  }
  persistWorkerStatus()
  const initialWorkerCount = configuredWorkerCount(lastGoodConfig)
  log('supervisor', `workers=${initialWorkerCount}`)
  if (initialWorkerCount) {
    log(
      'supervisor',
      'daemon.json has configured workers but they do not pin the supervisor — they stop when the last client lease and bg job are gone',
    )
  }
  logEvent('tengu_daemon_start', {
    worker_kinds: Object.keys(WORKER_KINDS).length,
    worker_count: initialWorkerCount,
    origin: options.origin,
  })
  updateKeepAlive()

  const reloadWorkerConfig = async (): Promise<void> => {
    let loaded: LoadedWorkerConfig
    try {
      loaded = await loadWorkerConfigDetails(options.jsonPath)
    } catch (error) {
      log(
        'supervisor',
        `config reload failed: ${String(error)} — keeping last-good config`,
      )
      return
    }
    for (const key of loaded.unknownKeys) {
      log('supervisor', `unknown config key '${key}' — upgrade claude?`)
    }
    const nextConfig = loaded.config
    const diff = diffWorkerConfig(lastGoodConfig, nextConfig)
    lastGoodConfig = nextConfig
    for (const id of diff.stop) {
      const worker = workers.get(id)
      if (!worker) continue
      await worker.stop()
      workers.delete(id)
      log('supervisor', `stopped ${id}`)
    }
    for (const { id, config } of diff.restart) {
      const worker = workers.get(id)
      if (!worker) continue
      await worker.stop()
      worker.updateConfig(config)
      worker.start()
      log('supervisor', `restarted ${id}`)
    }
    let startIndex = 0
    for (const { id, kind, config } of diff.start) {
      if (!workerKindEnabled(kind)) continue
      const worker = new ManagedWorker(
        id,
        kind,
        config,
        workerInvocation,
        log,
        auth,
        persistWorkerStatus,
      )
      workers.set(id, worker)
      worker.start(startIndex++ * CONFIGURED_WORKER_START_STAGGER_MS)
      log('supervisor', `spawned ${id}`)
    }
    const changed = diff.stop.length + diff.start.length + diff.restart.length
    if (changed > 0) {
      log(
        'supervisor',
        `reload: stopped=${diff.stop.length} started=${diff.start.length} restarted=${diff.restart.length}`,
      )
      logEvent('tengu_daemon_config_reload', {
        stopped: diff.stop.length,
        started: diff.start.length,
        restarted: diff.restart.length,
      })
    }
  }
  let reloadChain = Promise.resolve()
  const stopWatchingConfig = (options.watch ?? watchDaemonConfig)(
    options.jsonPath,
    () => {
      reloadChain = reloadChain
        .then(reloadWorkerConfig)
        .catch((error) =>
          logForDebugging(`daemon config reload failed: ${String(error)}`, {
            level: 'error',
          }),
        )
    },
  )

  let binaryIdentityPoll: NodeJS.Timeout | undefined
  const onAbort = () => resolveRun?.()
  await new Promise<void>((resolve) => {
    resolveRun = resolve
    if (
      options.signal.aborted ||
      upgradeDetected ||
      idleExit ||
      shutdownRequested ||
      yielding
    ) {
      resolve()
      return
    }
    options.signal.addEventListener('abort', onAbort, { once: true })
    updateKeepAlive()
    if (!initialExecutableIdentity) {
      log(
        'supervisor',
        `binary identity unresolvable at ${executablePath}; upgrade polling disabled`,
      )
      return
    }
    binaryIdentityPoll = setInterval(
      () => {
        if (options.signal.aborted || upgradeDetected || serviceRecall) {
          if (binaryIdentityPoll) clearInterval(binaryIdentityPoll)
          return
        }
        void checkForExecutableUpgrade()
        if (
          options.origin === 'service' &&
          isDaemonServiceRecalled()
        ) {
          serviceRecall = true
          log(
            'supervisor',
            'service recall flag set — draining workers and uninstalling service',
          )
          resolveRun?.()
        }
      },
      options.staleCheckIntervalMs ??
        options.binaryIdentityPollIntervalMs ??
        BINARY_IDENTITY_POLL_INTERVAL_MS,
    )
    binaryIdentityPoll.unref()
  })
  resolveRun = null
  options.signal.removeEventListener('abort', onAbort)
  if (idleTimer) clearTimeout(idleTimer)
  if (binaryIdentityPoll) clearInterval(binaryIdentityPoll)
  if (upgradeDetected) {
    logEvent('tengu_daemon_self_restart_on_upgrade', {})
  }
  if (serviceRecall) logEvent('tengu_copper_lantern', {})
  log('supervisor', 'shutting down')
  stopWatchingConfig()
  await reloadChain
  let removedOwnLock = false
  const removeOwnLock = async () => {
    if (removedOwnLock) return
    removedOwnLock = true
    const current = await readDaemonLock()
    if (current?.pid === lock.pid && current.startedAt === lock.startedAt) {
      await removeDaemonLock()
    }
  }
  if (yielding) {
    await supervisor?.close()
    supervisor = null
  }
  if (idleExit || serviceRecall || yielding) {
    await removeOwnLock()
    if (serviceRecall) supervisor?.killAll('SIGTERM')
  }
  await Promise.all([
    supervisor?.close(),
    ...[...workers.values()].map((worker) => worker.stop()),
  ])
  await removeDaemonStatus()
  await removeOwnLock()
  if (serviceRecall) await uninstallDaemonService()
  await logger.close()
  auth.dispose()
  void supervisorStart
  return { upgradeDetected, exitCode: 0 }
}

async function showStatus(): Promise<void> {
  const running = await getRunningDaemon()
  if (!running) {
    output('not running')
    output(formatBgDaemonStatus(await getBgDaemonStatus()))
    process.exitCode = 1
    return
  }
  output(`pid:     ${running.pid}`)
  output(`version: ${running.version}`)
  output(`uptime:  ${Math.floor((Date.now() - running.startedAt) / 1_000)}s`)
  const origin = running.origin ?? 'unknown'
  const originDisplay =
    origin !== 'transient' && origin !== 'auto'
      ? origin
      : running.spawnedBy
        ? `transient — started on-demand by \`${running.spawnedBy.label}\` (pid ${running.spawnedBy.pid}) in ${running.spawnedBy.cwd}`
        : 'transient — started on-demand by a client'
  output(`origin:  ${originDisplay}`)
  output(`config:  ${running.jsonPath}`)
  output(`log:     ${running.logPath}`)
  const status = await getBgDaemonStatus()
  output(formatBgDaemonStatus(status))
  if (origin === 'transient' || origin === 'auto') {
    output('')
    const workers = status.workersLive ?? 0
    if (workers > 0 || status.leaseClients.length > 0) {
      output('holding this daemon open:')
      if (workers > 0) {
        output(
          `  ${workers} ${workers === 1 ? 'bg worker' : 'bg workers'} running (daemon waits for them to settle)`,
        )
      }
      for (const client of status.leaseClients) {
        output(`  \`${client.label}\` (pid ${client.pid}) in ${client.cwd}`)
      }
      output('')
      output(
        'to let it idle-exit: wait for (or cancel) bg workers and close any `claude agents`',
      )
    } else if (status.workersLive === 0) {
      output('nothing holding this daemon open — will idle-exit shortly')
    }
  }
  if (running.version !== MACRO.VERSION) {
    output('')
    output(
      `warning: running daemon is ${running.version}, but this claude is ${MACRO.VERSION}`,
    )
    const stopCommand = (await isDaemonServiceInstalled())
      ? 'claude daemon stop'
      : 'claude daemon stop --any'
    output(`  run \`${stopCommand}\` to pick up the new version`)
  }
}

async function tailLog(path: string): Promise<void> {
  if (process.platform !== 'win32') {
    const child = spawn('tail', ['-f', path], { stdio: 'inherit' })
    await new Promise<void>(resolve => {
      child.on('exit', code => {
        if (code) process.exitCode = code
        resolve()
      })
      child.on('error', error => {
        outputError(`tail failed: ${error.message}`)
        process.exitCode = 1
        resolve()
      })
    })
    return
  }
  let file
  try {
    file = await open(path, 'r')
  } catch (error) {
    outputError(`cannot open ${path}: ${errorMessage(error)}`)
    process.exitCode = 1
    return
  }
  let position = (await file.stat()).size
  const buffer = Buffer.alloc(65_536)
  let stopped = false
  process.on('SIGINT', () => {
    stopped = true
  })
  while (!stopped) {
    if ((await file.stat()).size < position) position = 0
    const { bytesRead } = await file.read(
      buffer,
      0,
      buffer.length,
      position,
    )
    if (bytesRead > 0) {
      process.stdout.write(buffer.subarray(0, bytesRead))
      position += bytesRead
    } else await sleep(500)
  }
  await file.close()
}

export async function daemonMain(args: string[]): Promise<void> {
  await ensureFleetGateHydrated()
  if (args.includes('--help') || args.includes('-h')) {
    if (!isDaemonCliEnabled()) fleetGateRejected('daemon')
    output(daemonHelp().trimEnd())
    return
  }
  const parsed = parseArgs(args)
  const sub =
    parsed.sub === 'hub' && !isDaemonWorkerRegistryEnabled()
      ? 'status'
      : parsed.sub
  if (
    !new Set(['run', 'status', 'stop', 'uninstall']).has(sub) &&
    !isDaemonCliEnabled()
  ) {
    fleetGateRejected('daemon')
  }
  if (
    (sub === 'list' ||
      sub === 'scheduled' ||
      sub === 'assistant' ||
      sub === 'remote-control' ||
      sub === 'hub') &&
    !isDaemonWorkerRegistryEnabled()
  ) {
    fleetGateRejected(`daemon ${sub}`)
  }
  switch (sub) {
    case 'run': {
      if (!isAgentsFleetEnabled()) {
        outputError(
          'claude daemon: background agents disabled (ZDR/3P/opt-out)',
        )
        return
      }
      process.title = 'claude daemon'
      const controller = new AbortController()
      let signaled = false
      const shutdown = () => {
        if (signaled) {
          outputError('forced shutdown')
          process.exit(1)
        }
        signaled = true
        controller.abort()
      }
      process.on('SIGINT', shutdown)
      process.on('SIGTERM', shutdown)
      const origin = parsed.origin ?? 'foreground'
      let upgradeDetected: boolean
      let exitCode: number
      try {
        ;({ upgradeDetected, exitCode } = await runDaemon({
          jsonPath: parsed.jsonPath,
          logPath: parsed.logPath,
          origin,
          spawnedBy: parsed.spawnedBy,
          signal: controller.signal,
        }))
      } catch (error) {
        logError(error)
        await logEventTo1PAwaitable('tengu_daemon_startup_crash', {})
        process.exitCode = 1
        return
      }
      if (upgradeDetected && origin === 'service') {
        process.exitCode = 70
        return
      }
      if (upgradeDetected) {
        const { cmd, prefixArgs } = getRelaunchLauncher()
        spawn(
          cmd,
          [
            ...prefixArgs,
            'daemon',
            'run',
            '--json-path',
            parsed.jsonPath,
            '--log-file',
            parsed.logPath,
            '--origin',
            origin,
            ...(parsed.spawnedBy
              ? ['--spawned-by', JSON.stringify(parsed.spawnedBy)]
              : []),
          ],
          {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
            env: daemonSpawnEnv(),
          },
        ).unref()
      }
      process.exitCode = exitCode
      return
    }
    case 'install': {
      if (!isDaemonServiceInstallEnabled()) {
        outputError(
          `\`claude daemon ${sub}\` is disabled in this version — the daemon runs on demand and exits when the last client disconnects.`,
        )
        logEvent('tengu_daemon_install', { ok: false, disabled: true })
        process.exitCode = 1
        return
      }
      if (!isServiceInstallSupported()) {
        outputError('service install not supported on linux')
        process.exitCode = 1
        return
      }
      if (process.env.CLAUDE_CONFIG_DIR) {
        outputError(
          'service install only supports the default config dir — the launchd/systemd unit is a per-user singleton',
        )
        process.exitCode = 1
        return
      }
      const detached = await stopRunningDaemon()
      if (detached !== null) output(`stopped detached daemon (pid ${detached})`)
      const result = await installDaemonService(parsed)
      if (!result.ok) {
        await logEventTo1PAwaitable('tengu_daemon_install', { ok: false })
        outputError(`install failed: ${result.error}`)
        outputError(`  (service file was written to ${result.servicePath})`)
        process.exitCode = 1
        return
      }
      output(`installed: ${result.servicePath}`)
      const reachable = await (async () => {
        const deadline = Date.now() + 5_000
        while (Date.now() < deadline) {
          if ((await requestControl({ proto: 1, op: 'ping' })).ok) return true
          await sleep(100)
        }
        return false
      })()
      await logEventTo1PAwaitable('tengu_daemon_install', {
        ok: true,
        reachable,
      })
      if (reachable) {
        const daemon = await getRunningDaemon().catch(() => null)
        output(
          `running: pid=${daemon?.pid ?? '?'} origin=${daemon?.origin ?? '?'} (managed by ${process.platform === 'darwin' ? 'launchd' : 'systemd'})`,
        )
      } else {
        outputError(
          'warning: service installed but daemon not reachable within 5s — check `claude daemon logs`',
        )
      }
      return
    }
    case 'uninstall': {
      const result = await uninstallDaemonService()
      await logEventTo1PAwaitable('tengu_daemon_control', {
        op_uninstall: true,
        ok: result.ok,
      })
      if (result.ok) output('uninstalled')
      else {
        outputError(`uninstall failed: ${result.error}`)
        process.exitCode = 1
      }
      return
    }
    case 'start':
    case 'restart': {
      if (!isDaemonServiceInstallEnabled()) {
        outputError(
          `\`claude daemon ${sub}\` is disabled in this version — the daemon runs on demand and exits when the last client disconnects.`,
        )
        await logEventTo1PAwaitable('tengu_daemon_install', {
          ok: false,
          disabled: true,
        })
        process.exitCode = 1
        return
      }
      if (!isServiceInstallSupported()) {
        outputError(`service ${sub} not supported on linux`)
        process.exitCode = 1
        return
      }
      if (process.env.CLAUDE_CONFIG_DIR) {
        outputError(
          'the launchd/systemd unit is a per-user singleton for the default config dir',
        )
        process.exitCode = 1
        return
      }
      if (!(await isDaemonServiceInstalled())) {
        outputError('service not installed — run `claude daemon install` first')
        process.exitCode = 1
        return
      }
      let result
      let regenerated = false
      if (await serviceExecutableIsMissing()) {
        regenerated = true
        output('service binary missing — regenerating service file')
        const detached = await stopRunningDaemon()
        if (detached !== null) {
          output(`stopped detached daemon (pid ${detached})`)
        }
        result = await installDaemonService(parsed)
      } else {
        result = await controlDaemonService(sub)
      }
      await logEventTo1PAwaitable('tengu_daemon_control', {
        op_start: sub === 'start',
        op_restart: sub === 'restart',
        ok: result.ok,
        ...(regenerated ? { regenerated: true } : {}),
      })
      if (result.ok) output(sub === 'start' ? 'started' : 'restarted')
      else {
        outputError(
          `${regenerated ? 'regenerate' : sub} failed: ${result.error}`,
        )
        process.exitCode = 1
      }
      return
    }
    case 'stop': {
      const keepWorkers = parsed.rest.includes('--keep-workers')
      const installed = await isDaemonServiceInstalled()
      const running = await getRunningDaemon()
      if (!installed && running && !parsed.rest.includes('--any')) {
        outputError(
          `no background service is installed, but a daemon is running (pid=${running.pid}, origin=${running.origin ?? 'unknown'}). Run \`claude daemon stop --any\` to stop it.`,
        )
        process.exitCode = 1
        return
      }
      const response = await requestControl({
        proto: 1,
        op: 'shutdown',
        reapWorkers: !keepWorkers,
      })
      let reaped =
        response.ok && response.op === 'shutdown' && !keepWorkers
          ? Number(response.reaped) || 0
          : 0
      if (response.ok && response.op === 'shutdown') {
        if (!keepWorkers) {
          reaped = Math.max(reaped, (await reapOrphanWorkers()).reaped)
        }
        if (installed) {
          const result = await controlDaemonService('stop')
          if (!result.ok) {
            outputError(`stop failed: ${result.error}`)
            process.exitCode = 1
            return
          }
        }
        output(
          keepWorkers || reaped === 0
            ? 'stopped'
            : `stopped (terminated ${reaped} ${reaped === 1 ? 'background session' : 'background sessions'})`,
        )
        if (!installed) {
          output(
            'note: the next `claude agents` or `claude --bg` will start a new one',
          )
        }
        await logEventTo1PAwaitable('tengu_daemon_control', {
          op_stop: true,
          ok: true,
          reaped,
        })
        return
      }
      let supervisorStopped = false
      if (installed) {
        const result = await controlDaemonService('stop')
        if (!result.ok) {
          outputError(`stop failed: ${result.error}`)
          process.exitCode = 1
          return
        }
        supervisorStopped = true
      } else if (running && process.platform !== 'win32') {
        try {
          process.kill(running.pid, 'SIGTERM')
          supervisorStopped = true
        } catch (error) {
          if (getErrnoCode(error) === 'ESRCH') {
            supervisorStopped = true
          } else {
            const suffix =
              getErrnoCode(error) === 'EPERM'
                ? ' (running as another user — try with elevated privileges)'
                : ''
            outputError(
              `could not stop daemon (pid=${running.pid}): ${errorMessage(error)}${suffix}`,
            )
            process.exitCode = 1
            return
          }
        }
      }
      reaped = keepWorkers ? 0 : (await reapOrphanWorkers()).reaped
      if (running && !supervisorStopped && process.platform === 'win32') {
        outputError(
          `${reaped > 0 ? `terminated ${reaped} background session(s); ` : ''}supervisor (pid=${running.pid}) is still running — stop it with \`taskkill /PID ${running.pid}\` or close the terminal it was started in.`,
        )
        process.exitCode = 1
        return
      } else if (!running && !installed && reaped === 0) {
        output('no daemon running')
        return
      }
      output(
        keepWorkers || reaped === 0
          ? 'stopped'
          : `stopped (terminated ${reaped} ${reaped === 1 ? 'background session' : 'background sessions'})`,
      )
      if (!installed && running) {
        output(
          'note: the next `claude agents` or `claude --bg` will start a new one',
        )
      }
      await logEventTo1PAwaitable('tengu_daemon_control', {
        op_stop: true,
        ok: true,
        reaped,
      })
      return
    }
    case 'status':
      await showStatus()
      return
    case 'log':
    case 'logs':
      await tailLog(parsed.logPath)
      return
    case 'list': {
      await handleListAllKinds(parsed.rest.includes('--json'), parsed.jsonPath)
      return
    }
    case 'hub':
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        outputError('Interactive hub requires a TTY. See `claude daemon --help`.')
        return
      }
      await (
        await import('./hub.js')
      ).renderDaemonHubStandalone(parsed.jsonPath)
      return
    case 'scheduled':
    case 'assistant':
    case 'remote-control':
      await handleCliKind(parsed.sub, parsed.rest, parsed.jsonPath)
      return
    default:
      outputError(`unknown subcommand: ${sub}`)
      outputError('')
      outputError(daemonHelp().trimEnd())
      process.exitCode = 1
      return
  }
}
