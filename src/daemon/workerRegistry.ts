import { mkdir, readFile } from 'fs/promises'
import { dirname } from 'path'
import { setTimeout as delay } from 'timers/promises'
import { z } from 'zod/v4'
import { parseCronExpression } from '../utils/cron.js'
import { atomicWriteFile } from '../utils/atomicWrite.js'
import { isDaemonWorkerRegistryEnabled } from '../utils/agentsFleet.js'
import {
  DEFAULT_CRON_JITTER_CONFIG,
  jitteredNextCronRunMs,
} from '../utils/cronTasks.js'
import { lazySchema } from '../utils/lazySchema.js'
import {
  getCurrentProcessStartToken,
  processStartTokenMatches,
} from '../utils/genericProcessUtils.js'
import { WORKLOAD_CRON } from '../utils/workloadContext.js'
import { getScheduledStatusPath } from './paths.js'
import {
  createWorkerAuthManager,
  type WorkerAuthManager,
} from './auth.js'

export const heartbeatWorkerSchema = lazySchema(() =>
  z.object({ intervalSeconds: z.number().positive().default(30) }).strict(),
)

const permissionModes = [
  'dontAsk',
  'auto',
  'default',
  'acceptEdits',
  'plan',
  'bypassPermissions',
] as const

export const scheduledTaskSchema = lazySchema(() =>
  z
    .object({
      id: z.string().min(1),
      cron: z.string().refine((value) => parseCronExpression(value) !== null, {
        message: 'invalid 5-field cron expression',
      }),
      prompt: z.string().min(1),
      directory: z.string().min(1),
      enabled: z.boolean().default(true),
      permissionMode: z.enum(permissionModes).default('dontAsk'),
      model: z.string().optional(),
      runTimeoutMinutes: z.number().positive().max(10_080).default(30),
      maxQueued: z.number().int().positive().default(1),
    })
    .strict(),
)

export const scheduledWorkerSchema = lazySchema(() =>
  z
    .object({
      tasks: z
        .array(scheduledTaskSchema())
        .default([])
        .refine(
          (tasks) => new Set(tasks.map((task) => task.id)).size === tasks.length,
          { message: 'task ids must be unique' },
        ),
      maxConcurrent: z.number().int().positive().default(1),
    })
    .strict(),
)

export const remoteControlWorkerSchema = lazySchema(() =>
  z
    .object({
      dir: z.string(),
      name: z.string().optional(),
      spawnMode: z.enum(['same-dir', 'worktree']).default('same-dir'),
      capacity: z.number().int().positive().default(32),
      permissionMode: z.enum(permissionModes).optional(),
      sandbox: z.boolean().default(false),
      sessionTimeoutSeconds: z.number().int().positive().optional(),
      createSessionOnStart: z.boolean().default(false),
    })
    .strict(),
)

type WorkerRunner = (
  config: unknown,
  signal: AbortSignal,
  log: (message: string) => void,
  auth: WorkerAuthManager,
) => Promise<void>

async function heartbeatWorker(
  config: unknown,
  signal: AbortSignal,
  log: (message: string) => void,
): Promise<void> {
  const { intervalSeconds } = heartbeatWorkerSchema().parse(config)
  log(`heartbeat worker started (interval=${intervalSeconds}s)`)
  while (!signal.aborted) {
    try {
      await delay(intervalSeconds * 1_000, undefined, { signal })
    } catch {
      return
    }
    if (!signal.aborted) log('heartbeat')
  }
}

type ScheduledTask = z.infer<ReturnType<typeof scheduledTaskSchema>>

export interface ScheduledWorkerStatus {
  workerPid: number
  workerProcStart?: string
  writtenAt: number
  tasks: Record<string, { running: boolean; lastFiredAt?: number }>
}

async function writeScheduledStatus(
  tasks: ScheduledWorkerStatus['tasks'],
): Promise<void> {
  const path = getScheduledStatusPath()
  const status: ScheduledWorkerStatus = {
    workerPid: process.pid,
    workerProcStart: getCurrentProcessStartToken(),
    writtenAt: Date.now(),
    tasks,
  }
  try {
    await mkdir(dirname(path), { recursive: true })
    await atomicWriteFile(path, JSON.stringify(status))
  } catch {}
}

export async function readScheduledStatus(): Promise<ScheduledWorkerStatus | null> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(getScheduledStatusPath(), 'utf8'))
  } catch {
    return null
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as Partial<ScheduledWorkerStatus>).workerPid !== 'number' ||
    !(parsed as Partial<ScheduledWorkerStatus>).tasks ||
    typeof (parsed as Partial<ScheduledWorkerStatus>).tasks !== 'object'
  ) {
    return null
  }
  try {
    process.kill((parsed as ScheduledWorkerStatus).workerPid, 0)
  } catch {
    return null
  }
  if (
    !(await processStartTokenMatches(
      (parsed as ScheduledWorkerStatus).workerPid,
      (parsed as ScheduledWorkerStatus).workerProcStart,
    ))
  ) {
    return null
  }
  return parsed as ScheduledWorkerStatus
}

async function runScheduledTask(
  task: ScheduledTask,
  abortController: AbortController,
  log: (message: string) => void,
  query: typeof import('../entrypoints/agentSdk.js').query,
): Promise<void> {
  const result = query({
    prompt: task.prompt,
    options: {
      cwd: task.directory,
      permissionMode: task.permissionMode,
      ...(task.permissionMode === 'bypassPermissions' && {
        allowDangerouslySkipPermissions: true,
      }),
      ...(task.model && { model: task.model }),
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      settingSources: ['user', 'project', 'local'],
      pathToClaudeCodeExecutable: process.execPath,
      abortController,
      stderr: data => log(`[${task.id}] ${data.trimEnd()}`),
      workload: WORKLOAD_CRON,
    },
  })
  for await (const message of result) {
    if (message.type === 'result') {
      log(
        `task=${task.id} result subtype=${message.subtype} duration=${message.duration_ms}ms cost=$${message.total_cost_usd.toFixed(4)}`,
      )
    }
  }
}

async function scheduledWorker(
  config: unknown,
  signal: AbortSignal,
  log: (message: string) => void,
  auth: WorkerAuthManager,
): Promise<void> {
  const { tasks, maxConcurrent } = scheduledWorkerSchema().parse(config)
  const { enableConfigs } = await import('../utils/config.js')
  const { initializeErrorLogSink } = await import('../utils/errorLogSink.js')
  const { initializeAnalyticsSink } = await import(
    '../services/analytics/sink.js'
  )
  enableConfigs()
  initializeErrorLogSink()
  initializeAnalyticsSink()
  if (!auth.getAccessToken()) {
    log('scheduled worker: not authed — run `claude auth login`')
    process.exit(1)
  }
  const { query } = await import('../entrypoints/agentSdk.js')
  log(`scheduled worker started tasks=${tasks.length} maxConcurrent=${maxConcurrent}`)
  if (tasks.length === 0) {
    const keepAlive = setInterval(() => {}, 60_000)
    await new Promise<void>((resolve) => {
      if (signal.aborted) resolve()
      else signal.addEventListener('abort', () => resolve(), { once: true })
    })
    clearInterval(keepAlive)
    return
  }

  const queued: ScheduledTask[] = []
  const running = new Set<Promise<void>>()
  const lastFired = new Map<string, number>()
  const runningTaskIds = new Set<string>()
  const anchor = Date.now()
  const persistStatus = () => {
    const values: ScheduledWorkerStatus['tasks'] = {}
    for (const task of tasks) {
      const last = lastFired.get(task.id)
      values[task.id] = {
        running: runningTaskIds.has(task.id),
        ...(last !== undefined && { lastFiredAt: last }),
      }
    }
    void writeScheduledStatus(values)
  }
  persistStatus()
  let wake: (() => void) | undefined
  const enqueue = (task: ScheduledTask) => {
    const count = queued.reduce(
      (total, queuedTask) => total + Number(queuedTask.id === task.id),
      0,
    )
    if (count >= task.maxQueued) {
      log(`task=${task.id} dropped (queue full: ${count}/${task.maxQueued})`)
      return
    }
    queued.push(task)
    wake?.()
    wake = undefined
  }
  const nextFire = (task: ScheduledTask) => {
    return jitteredNextCronRunMs(
      task.cron,
      lastFired.get(task.id) ?? anchor,
      task.id,
      DEFAULT_CRON_JITTER_CONFIG,
    )
  }
  const timer = setInterval(() => {
    const now = Date.now()
    for (const task of tasks) {
      if (!task.enabled) continue
      const next = nextFire(task)
      if (next !== null && next <= now) {
        lastFired.set(task.id, now)
        enqueue(task)
      }
    }
  }, 1_000)
  signal.addEventListener('abort', () => {
    clearInterval(timer)
    wake?.()
    wake = undefined
  })

  while (!signal.aborted) {
    while (running.size < maxConcurrent && queued.length > 0 && !signal.aborted) {
      const task = queued.shift()!
      const controller = new AbortController()
      runningTaskIds.add(task.id)
      persistStatus()
      const abort = () => controller.abort()
      signal.addEventListener('abort', abort, { once: true })
      const timeout = setTimeout(
        () => controller.abort(),
        Math.min(task.runTimeoutMinutes, 10_080) * 60_000,
      )
      const job = (async () => {
        log(`task=${task.id} start cron='${task.cron}' dir='${task.directory}'`)
        try {
          await runScheduledTask(task, controller, log, query)
        } catch (error) {
          log(`task=${task.id} threw: ${String(error)}`)
        } finally {
          clearTimeout(timeout)
          signal.removeEventListener('abort', abort)
          runningTaskIds.delete(task.id)
          persistStatus()
        }
      })().finally(() => {
        running.delete(job)
        wake?.()
        wake = undefined
      })
      running.add(job)
    }
    if (signal.aborted) break
    if (queued.length === 0 || running.size >= maxConcurrent) {
      await new Promise<void>((resolve) => {
        wake = resolve
      })
    }
  }
  await Promise.allSettled([...running])
}

async function remoteControlWorker(
  config: unknown,
  signal: AbortSignal,
  log: (message: string) => void,
  auth: WorkerAuthManager,
): Promise<void> {
  const value = remoteControlWorkerSchema().parse(config)
  const { enableConfigs } = await import('../utils/config.js')
  const { initializeErrorLogSink } = await import('../utils/errorLogSink.js')
  const { initializeAnalyticsSink } = await import(
    '../services/analytics/sink.js'
  )
  const { getBridgeTokenOverride } = await import('../bridge/bridgeConfig.js')
  enableConfigs()
  initializeErrorLogSink()
  initializeAnalyticsSink()
  const getAccessToken = () => getBridgeTokenOverride() ?? auth.getAccessToken()
  if (!getAccessToken()) {
    log('Not logged in · Please run /login')
    process.exit(1)
  }
  const { runBridgeHeadless, BridgeHeadlessPermanentError } = await import(
    '../bridge/bridgeMain.js'
  )
  try {
    await runBridgeHeadless(
      {
        dir: value.dir,
        name: value.name,
        spawnMode: value.spawnMode,
        capacity: value.capacity,
        permissionMode: value.permissionMode,
        sandbox: value.sandbox,
        createSessionOnStart: value.createSessionOnStart,
        getAccessToken,
        onAuth401: auth.reportAuth401,
        log,
      },
      signal,
    )
  } catch (error) {
    if (error instanceof BridgeHeadlessPermanentError) {
      log(error.message)
      process.exit(78)
    }
    throw error
  }
}

export const WORKER_KINDS: Record<
  string,
  { schema: () => z.ZodType; run: WorkerRunner; needsOAuth: boolean }
> = {
  heartbeat: {
    schema: heartbeatWorkerSchema,
    run: heartbeatWorker,
    needsOAuth: false,
  },
  scheduled: {
    schema: scheduledWorkerSchema,
    run: scheduledWorker,
    needsOAuth: true,
  },
  remoteControl: {
    schema: remoteControlWorkerSchema,
    run: remoteControlWorker,
    needsOAuth: true,
  },
}

export function isShutdownSentinel(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'shutdown'
  )
}

export function registerShutdownHandlers(
  emitter: NodeJS.Process,
  controller: AbortController,
): void {
  const abort = () => controller.abort()
  emitter.on('SIGTERM', abort)
  emitter.on('SIGINT', abort)
  emitter.on('message', (message) => {
    if (isShutdownSentinel(message)) controller.abort()
  })
}

export function httpStatusOf(error: unknown): number | undefined {
  let current = error as
    | { status?: unknown; response?: { status?: unknown }; cause?: unknown }
    | null
    | undefined
  for (let depth = 0; current != null && depth < 8; depth++) {
    if (typeof current.status === 'number') return current.status
    if (typeof current.response?.status === 'number') {
      return current.response.status
    }
    current = current.cause as typeof current
  }
  return undefined
}

export function startParentWatchdog(
  controller: AbortController,
  overrides?: {
    ppid?: () => number
    isAlive?: (pid: number) => boolean
    log?: (message: string) => void
    onGone?: () => void
    intervalMs?: number
    exitGraceMs?: number
  },
): NodeJS.Timeout | undefined {
  const options = {
    ppid: () => process.ppid,
    isAlive: (pid: number) => {
      try {
        process.kill(pid, 0)
        return true
      } catch {
        return false
      }
    },
    log: (message: string) => process.stdout.write(`${message}\n`),
    onGone: () => process.exit(0),
    intervalMs: 30_000,
    exitGraceMs: 2_000,
    ...overrides,
  }
  const parentPid = options.ppid()
  if (parentPid <= 1) return undefined
  let gone = false
  const timer = setInterval(() => {
    if (gone) return
    if (
      options.isAlive(parentPid) &&
      (process.platform === 'win32' || options.ppid() === parentPid)
    ) {
      return
    }
    gone = true
    clearInterval(timer)
    options.log('parent supervisor gone — exiting')
    controller.abort()
    setTimeout(options.onGone, options.exitGraceMs).unref()
  }, options.intervalMs)
  timer.unref()
  return timer
}

export async function runDaemonWorker(kind: string | undefined): Promise<void> {
  if (!kind || !(kind in WORKER_KINDS)) {
    process.stderr.write(`unknown worker kind: ${kind}\n`)
    process.exit(2)
    return
  }
  if (kind !== 'heartbeat' && !isDaemonWorkerRegistryEnabled()) {
    process.stderr.write(`worker kind '${kind}' is not available.\n`)
    process.exit(2)
    return
  }
  const worker = WORKER_KINDS[kind]!
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
  let input: { config?: unknown; initialAccessToken?: string } = {}
  try {
    input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch (error) {
    process.stderr.write(`invalid config JSON on stdin: ${String(error)}\n`)
    process.exit(2)
    return
  }
  const parsed = worker.schema().safeParse(input.config)
  if (!parsed.success) {
    process.stderr.write(`config validation failed: ${parsed.error.message}\n`)
    process.exit(2)
    return
  }
  const controller = new AbortController()
  registerShutdownHandlers(process, controller)
  startParentWatchdog(controller)
  try {
    await worker.run(
      parsed.data,
      controller.signal,
      (message) => process.stdout.write(`${message}\n`),
      createWorkerAuthManager(input.initialAccessToken),
    )
  } catch (error) {
    if (httpStatusOf(error) === 429) {
      process.stdout.write(`rate limited (429): ${String(error)}\n`)
      process.exit(75)
    }
    throw error
  }
}
