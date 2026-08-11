import { spawn, type ChildProcess } from 'child_process'
import { createWriteStream } from 'fs'
import { readFile, readdir, realpath, rename, stat, unlink, writeFile } from 'fs/promises'
import { basename, dirname, join, normalize } from 'path'
import { createInterface } from 'readline'
import { isDeepStrictEqual } from 'util'
import chokidar from 'chokidar'
import { logEvent } from '../services/analytics/index.js'
import { isDaemonCliEnabled, fleetGateRejected } from '../utils/agentsFleet.js'
import { isInBundledMode } from '../utils/bundledMode.js'
import { logForDebugging } from '../utils/debug.js'
import { getErrnoCode, isENOENT } from '../utils/errors.js'
import { getRelaunchLauncher } from '../utils/relaunch.js'
import { getXDGDataHome } from '../utils/xdg.js'
import {
  createDaemonLock,
  getRunningDaemon,
  readDaemonLock,
  removeDaemonLock,
  replaceDaemonLock,
  processLooksLikeDaemon,
  type DaemonLock,
} from './lock.js'
import { requestControl } from './client.js'
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

const DAEMON_HELP = `Usage: claude daemon [command] [options]

Manage configured background workers.

Commands:
  run               Run the daemon in the foreground (default when piped)
  install, i        Install as a background service (launchctl/systemd)
  uninstall         Remove the background service
  start             Start the installed service
  stop              Stop the installed service
  restart           Restart the installed service
  status            Show daemon status
  log               Tail the daemon log
  list               List configured workers
  scheduled         Manage scheduled workers
  assistant         Manage assistant workers
  remote-control    Manage Remote Control workers
  hub               Open the interactive daemon hub (default in a TTY)

Options:
  --json-path <p>   Config file (default: ~/.claude/daemon.json)
  --log-file <p>    Log file (default: ~/.claude/daemon.log)
  --origin <value>  Daemon origin (foreground, service, cli, auto)
  -h, --help        Show this help
`

type DaemonSubcommand =
  | 'run'
  | 'install'
  | 'i'
  | 'uninstall'
  | 'start'
  | 'stop'
  | 'restart'
  | 'status'
  | 'log'
  | 'list'
  | 'scheduled'
  | 'assistant'
  | 'remote-control'
  | 'hub'

export interface ParsedDaemonArgs {
  sub: DaemonSubcommand
  jsonPath: string
  logPath: string
  origin?: 'foreground' | 'service' | 'cli' | 'auto'
  rest: string[]
}

function parseOrigin(value: string): ParsedDaemonArgs['origin'] {
  if (
    value === 'foreground' ||
    value === 'service' ||
    value === 'cli' ||
    value === 'auto'
  ) {
    return value
  }
  return undefined
}

export function parseArgs(args: string[]): ParsedDaemonArgs {
  let jsonPath = getDefaultDaemonConfigPath()
  let explicitJsonPath = false
  let logPath = getDefaultDaemonLogPath()
  let origin: ParsedDaemonArgs['origin']
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
    }
  }
  const rest = args.filter((_arg, index) => !consumed.has(index))
  const commands = new Set<DaemonSubcommand>([
    'run',
    'install',
    'i',
    'uninstall',
    'start',
    'stop',
    'restart',
    'status',
    'log',
    'list',
    'scheduled',
    'assistant',
    'remote-control',
    'hub',
  ])
  const defaultSub: DaemonSubcommand = process.stdin.isTTY ? 'hub' : 'run'
  const positional = rest.findIndex((arg) => !arg.startsWith('-'))
  if (positional === -1) {
    return { sub: defaultSub, jsonPath, logPath, origin, rest }
  }
  const candidate = rest[positional] as DaemonSubcommand
  if (!commands.has(candidate)) {
    return {
      sub: 'run',
      jsonPath: explicitJsonPath ? jsonPath : candidate,
      logPath,
      origin,
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
    private execPath: string,
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
    const child = spawn(this.execPath, ['--daemon-worker', this.kind], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      windowsHide: true,
    })
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
          if (next && next !== this.execPath) {
            this.log(
              this.id,
              `execPath gone (version GC?) — re-resolved to ${next}`,
            )
            this.execPath = next
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

function launchExecutable(): string {
  return isInBundledMode() ? process.execPath : (process.argv[1] ?? process.execPath)
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
  signal: AbortSignal
  watch?: typeof watchDaemonConfig
  binaryIdentityPollIntervalMs?: number
  idleGraceMs?: number
}): Promise<{ upgradeDetected: boolean }> {
  const stream = createWriteStream(options.logPath, { flags: 'a' })
  const log = (scope: string, message: string) => {
    const line = `[${new Date().toISOString()}] [${scope}] ${message}\n`
    stream.write(line)
    if (process.stdout.isTTY) process.stdout.write(line)
  }
  log(
    'supervisor',
    `─── daemon start ─── version=${MACRO.VERSION} pid=${process.pid} origin=${options.origin}`,
  )
  const running = await getRunningDaemon()
  if (running) {
    log(
      'supervisor',
      `another daemon is already running (pid=${running.pid}, version=${running.version}) — exiting`,
    )
    stream.end()
    process.exit(1)
  }
  const lock: DaemonLock = {
    pid: process.pid,
    version: MACRO.VERSION,
    jsonPath: options.jsonPath,
    logPath: options.logPath,
    startedAt: Date.now(),
    origin: options.origin,
  }
  if (!(await createDaemonLock(lock))) {
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
        stream.end()
        process.exit(1)
      }
    }
  }
  if (!(await replaceDaemonLock(lock))) {
    log('supervisor', 'another daemon won the lock race — exiting')
    stream.end()
    process.exit(1)
  }

  const executablePath = getDaemonExecutablePath()
  const initialExecutableIdentity = await getExecutableIdentity(executablePath)
  let upgradeDetected = false
  let resolveRun: (() => void) | null = null
  const checkForExecutableUpgrade = async (): Promise<boolean> => {
    if (upgradeDetected || !initialExecutableIdentity) return upgradeDetected
    const currentIdentity = await getExecutableIdentity(executablePath)
    if (
      options.signal.aborted ||
      !currentIdentity ||
      !executableIdentityChanged(initialExecutableIdentity, currentIdentity)
    ) {
      return false
    }
    upgradeDetected = true
    log(
      'supervisor',
      `binary at ${executablePath} changed (${initialExecutableIdentity.target} → ${currentIdentity.target}) — self-restarting for upgrade`,
    )
    resolveRun?.()
    return true
  }

  const workers = new Map<string, ManagedWorker>()
  const workerExecutable = launchExecutable()
  const persistWorkerStatus = (): void => {
    const live: Record<string, { pid: number; startedAt: number }> = {}
    for (const [id, worker] of workers) {
      const status = worker.status
      if (status) live[id] = status
    }
    void writeDaemonStatus(live)
  }
  const auth = createDaemonAuthManager(
    options.signal,
    message => log('supervisor', message),
    () =>
      [...workers.values()].some(
        worker => WORKER_KINDS[worker.kind]?.needsOAuth === true,
      ),
  )
  const idleGraceMs = options.idleGraceMs ?? 5_000
  let idleTimer: NodeJS.Timeout | undefined
  let idleExit = false
  let supervisor: Awaited<ReturnType<typeof runBackgroundSupervisor>> | null =
    null
  const liveKeepAliveCount = () =>
    (supervisor?.leaseCount() ?? 0) +
    (supervisor?.liveHandleCount() ?? 0)
  const updateKeepAlive = () => {
    if (idleExit || upgradeDetected || options.signal.aborted) return
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
      const bgHandles = supervisor?.liveHandleCount() ?? 0
      const configuredWorkers = workers.size
      log(
        'supervisor',
        `idle ${Math.round(idleGraceMs / 1_000)}s with no clients — exiting${
          bgHandles + configuredWorkers > 0
            ? ` (terminating ${bgHandles} bg + ${configuredWorkers} configured workers)`
            : ''
        }`,
      )
      logEvent('tengu_daemon_idle_exit', {
        grace_ms: idleGraceMs,
        bg_handles: bgHandles,
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
  let lastGoodConfig = await loadWorkerConfigDetails(options.jsonPath)
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
    const entries = lastGoodConfig[kind] ?? []
    for (let index = 0; index < entries.length; index++) {
      const workerConfig = entries[index]
      const id = `${kind}:${index}`
      const worker = new ManagedWorker(
        id,
        kind,
        workerConfig,
        workerExecutable,
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
  log('supervisor', `workers=${workers.size}`)
  if (workers.size) {
    log(
      'supervisor',
      'daemon.json has configured workers but the supervisor is client-bound — they will stop when the last client disconnects',
    )
  }
  logEvent('tengu_daemon_start', {
    worker_kinds: Object.keys(WORKER_KINDS).length,
    worker_count: workers.size,
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
      const worker = new ManagedWorker(
        id,
        kind,
        config,
        workerExecutable,
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
    if (options.signal.aborted || upgradeDetected) {
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
      () => void checkForExecutableUpgrade(),
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
  if (idleExit) {
    await removeOwnLock()
    supervisor?.killAll('SIGTERM')
  }
  await supervisor?.close()
  await Promise.all([...workers.values()].map((worker) => worker.stop()))
  await removeDaemonStatus()
  await removeOwnLock()
  await new Promise<void>((resolve) => stream.end(resolve))
  auth.dispose()
  void supervisorStart
  return { upgradeDetected }
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
  output(`origin:  ${running.origin ?? 'unknown'}`)
  output(`config:  ${running.jsonPath}`)
  output(`log:     ${running.logPath}`)
  output(formatBgDaemonStatus(await getBgDaemonStatus()))
  if (running.version !== MACRO.VERSION) {
    output('')
    output(
      `warning: running daemon is ${running.version}, but this claude is ${MACRO.VERSION}`,
    )
    output('  run `claude daemon restart` to pick up the new version')
  }
}

async function tailLog(path: string): Promise<void> {
  try {
    const raw = await readFile(path, 'utf8')
    process.stdout.write(raw.split('\n').slice(-200).join('\n'))
  } catch (error) {
    outputError(String(error))
    process.exitCode = 1
  }
}

async function daemonInvocationHasExternalRestartPolicy(): Promise<boolean> {
  if (process.env.CLAUDE_CONFIG_DIR) return false
  if (!isServiceInstallSupported()) return false
  if (process.platform === 'linux') return Boolean(process.env.INVOCATION_ID)
  return isDaemonServiceInstalled()
}

export async function daemonMain(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    if (!isDaemonCliEnabled()) fleetGateRejected('daemon')
    output(DAEMON_HELP.trimEnd())
    return
  }
  const parsed = parseArgs(args)
  if (parsed.sub !== 'run' && !isDaemonCliEnabled()) {
    fleetGateRejected('daemon')
  }
  switch (parsed.sub) {
    case 'run': {
      process.title = 'claude daemon'
      const controller = new AbortController()
      let signaled = false
      const shutdown = () => {
        if (signaled) process.exit(1)
        signaled = true
        controller.abort()
      }
      process.on('SIGINT', shutdown)
      process.on('SIGTERM', shutdown)
      const origin = parsed.origin ?? 'foreground'
      const { upgradeDetected } = await runDaemon({
        jsonPath: parsed.jsonPath,
        logPath: parsed.logPath,
        origin,
        signal: controller.signal,
      })
      if (
        upgradeDetected &&
        !(await daemonInvocationHasExternalRestartPolicy())
      ) {
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
          ],
          {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
            env: { ...process.env, INVOCATION_ID: '' },
          },
        ).unref()
      }
      return
    }
    case 'install':
    case 'i': {
      if (!isServiceInstallSupported()) {
        outputError('service install not supported on linux')
        process.exitCode = 1
        return
      }
      const result = await installDaemonService(parsed)
      logEvent('tengu_daemon_install', { ok: result.ok })
      if (result.ok) output(`installed: ${result.servicePath}`)
      else {
        outputError(`install failed: ${result.error}`)
        outputError(`  (service file was written to ${result.servicePath})`)
        process.exitCode = 1
      }
      return
    }
    case 'uninstall': {
      const result = await uninstallDaemonService()
      logEvent('tengu_daemon_control', {
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
    case 'stop':
    case 'restart': {
      if (!(await isDaemonServiceInstalled())) {
        outputError('service not installed — run `claude daemon install` first')
        process.exitCode = 1
        return
      }
      if (parsed.sub !== 'stop' && (await serviceExecutableIsMissing())) {
        output('service binary missing — regenerating service file')
        const regenerated = await installDaemonService(parsed)
        if (!regenerated.ok) {
          outputError(`regenerate failed: ${regenerated.error}`)
          process.exitCode = 1
          return
        }
        output(parsed.sub === 'start' ? 'started' : 'restarted')
        return
      }
      const result = await controlDaemonService(parsed.sub)
      logEvent('tengu_daemon_control', {
        op_start: parsed.sub === 'start',
        op_stop: parsed.sub === 'stop',
        op_restart: parsed.sub === 'restart',
        ok: result.ok,
      })
      if (result.ok) {
        output(
          parsed.sub === 'stop'
            ? 'stopped'
            : parsed.sub === 'start'
              ? 'started'
              : 'restarted',
        )
      } else {
        outputError(`${parsed.sub} failed: ${result.error}`)
        process.exitCode = 1
      }
      return
    }
    case 'status':
      await showStatus()
      return
    case 'log':
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
  }
}
