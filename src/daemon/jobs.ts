import { watch } from 'fs'
import {
  mkdir,
  readFile,
  readdir,
  writeFile,
} from 'fs/promises'
import { basename, dirname, join } from 'path'
import { z } from 'zod/v4'
import { getSessionId } from '../bootstrap/state.js'
import { logForDebugging } from '../utils/debug.js'
import { atomicWriteFile } from '../utils/atomicWrite.js'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import { isENOENT } from '../utils/errors.js'
import { safeParseJSON } from '../utils/json.js'
import { lazySchema } from '../utils/lazySchema.js'
import { logError } from '../utils/log.js'

export const STATE_FILE = 'state.json'

export const JobStateSchema = lazySchema(() =>
  z
    .object({
      state: z.string(),
      detail: z.string(),
      tempo: z.enum(['active', 'idle', 'blocked']).optional(),
      inFlight: z
        .object({
          tasks: z.number(),
          queued: z.number(),
          kinds: z.array(z.string()),
        })
        .optional(),
      needs_you: z.boolean().optional(),
      needs: z.string().optional(),
      output: z.record(z.string(), z.string()).nullable().default(null),
      children: z
        .array(
          z.object({
            id: z.string(),
            href: z.string(),
            kind: z.enum(['pr', 'frame']).optional(),
          }),
        )
        .nullable()
        .default(null),
      linkScanOffset: z.number().default(0),
      linkScanPath: z.string().optional(),
      template: z.string(),
      routine: z.string().optional(),
      respawnFlags: z.array(z.string()).default([]),
      intent: z.string(),
      initialPrompt: z.string().optional(),
      name: z.string().optional(),
      nameSource: z.enum(['user', 'auto']).optional(),
      sessionId: z.string(),
      resumeSessionId: z.string().optional(),
      cliVersion: z.string().optional(),
      cwd: z.string(),
      createdAt: z.string(),
      updatedAt: z.string(),
      firstTerminalAt: z.string().nullable().default(null),
      worktreePath: z.string().optional(),
      worktreeBranch: z.string().optional(),
      worktreeHookBased: z.boolean().optional(),
      originCwd: z.string().optional(),
      bridgeSessionId: z.string().optional(),
      bridgeSessionSeq: z.number().optional(),
      backend: z.enum(['daemon', 'peer']).catch('daemon').default('daemon'),
      sock: z.string().optional(),
      pid: z.number().optional(),
      sortOrder: z.number().optional(),
      stateSortOrder: z.number().optional(),
      pinned: z.boolean().optional(),
    })
    .transform(({ needs_you, ...rest }) => ({
      ...rest,
      tempo: rest.tempo ?? (needs_you ? 'blocked' : 'idle'),
    })),
)

export type JobState = z.infer<ReturnType<typeof JobStateSchema>>

export interface JobRecord {
  id: string
  state: JobState
}

export interface InitialJobStateOptions {
  sessionId: string
  cwd: string
  intent: string
  template: { name: string; initialPrompt?: string }
  detail?: string
  tempo?: 'active' | 'idle' | 'blocked'
  routine?: string
  respawnFlags?: string[]
  name?: string
  nameSource?: 'user' | 'auto'
  worktreePath?: string
  worktreeBranch?: string
  worktreeHookBased?: boolean
  originCwd?: string
}

export function getJobsDir(): string {
  return join(getClaudeConfigHomeDir(), 'jobs')
}

export function getJobDir(id: string): string {
  return join(getJobsDir(), id)
}

export function getCurrentJobShort(): string {
  const jobDir = process.env.CLAUDE_JOB_DIR
  if (jobDir) return basename(jobDir)
  return getSessionId().slice(0, 8)
}

const jobStateCache = new Map<string, JobState | null>()
let jobsWatcher: ReturnType<typeof watch> | null = null
let watchedJobsDir: string | null = null
let jobsWatcherFailed = false

function firstPathSegment(path: string, separator: string): string {
  const index = path.indexOf(separator)
  return index === -1 ? path : path.slice(0, index)
}

function ensureJobsWatcher(): void {
  const jobsDir = getJobsDir()
  if (watchedJobsDir === jobsDir) return

  try {
    jobsWatcher?.close()
  } catch {}
  jobsWatcher = null
  jobStateCache.clear()
  jobsWatcherFailed = false
  watchedJobsDir = jobsDir

  try {
    jobsWatcher = watch(jobsDir, { recursive: true }, (_event, filename) => {
      if (!filename) return
      const path = firstPathSegment(
        firstPathSegment(filename.toString(), '\\'),
        '/',
      )
      jobStateCache.delete(join(jobsDir, path))
    })
    jobsWatcher.on('error', () => {
      jobsWatcherFailed = true
      jobStateCache.clear()
    })
    jobsWatcher.unref?.()
  } catch {
    jobsWatcherFailed = true
  }
}

function invalidateJobState(jobDir: string): void {
  jobStateCache.delete(jobDir)
}

/** Watch a job until state.json changes. The watcher is deliberately one-shot. */
export function watchJobState(id: string, callback: () => void): () => void {
  try {
    let closed = false
    let watcher: ReturnType<typeof watch> | undefined
    let timeout: ReturnType<typeof setTimeout> | undefined
    const close = () => {
      if (closed) return
      closed = true
      if (timeout) clearTimeout(timeout)
      try {
        watcher?.close()
      } catch {}
    }
    watcher = watch(getJobDir(id), (_event, filename) => {
      if (filename && filename !== STATE_FILE) return
      close()
      callback()
    })
    timeout = setTimeout(close, 10_000)
    watcher.on('error', close)
    return close
  } catch {
    return () => {}
  }
}

export async function writeJobState(
  jobDir: string,
  state: JobState,
): Promise<void> {
  const {
    pinned: _pinned,
    sortOrder: _sortOrder,
    stateSortOrder: _stateSortOrder,
    ...persisted
  } = state
  await atomicWriteFile(
    join(jobDir, STATE_FILE),
    JSON.stringify(persisted, null, 2),
  )
  invalidateJobState(jobDir)
}

export async function readJobState(jobDir: string): Promise<JobState | null> {
  ensureJobsWatcher()
  const cacheable =
    !jobsWatcherFailed && dirname(jobDir) === watchedJobsDir
  if (cacheable && jobStateCache.has(jobDir)) {
    return jobStateCache.get(jobDir) ?? null
  }

  try {
    const [rawState, rawOrder, rawStateOrder] = await Promise.all([
      readFile(join(jobDir, STATE_FILE), 'utf-8'),
      readFile(join(jobDir, 'order'), 'utf-8').catch(() => null),
      readFile(join(jobDir, 'stateOrder'), 'utf-8').catch(() => null),
    ])
    const result = JobStateSchema().safeParse(safeParseJSON(rawState))
    if (!result.success) {
      logForDebugging(
        `[jobs] skipping ${basename(jobDir)}: state.json schema validation failed — ${result.error.message}`,
        { level: 'warn' },
      )
      if (cacheable) jobStateCache.set(jobDir, null)
      return null
    }

    const order = rawOrder !== null ? Number(rawOrder) : undefined
    const stateOrder =
      rawStateOrder !== null ? Number(rawStateOrder) : undefined
    let state = result.data
    if (Number.isFinite(order)) state = { ...state, sortOrder: order }
    if (Number.isFinite(stateOrder)) {
      state = { ...state, stateSortOrder: stateOrder }
    }
    if (cacheable) {
      if (jobStateCache.size > 1_000) jobStateCache.clear()
      jobStateCache.set(jobDir, state)
    }
    return state
  } catch (error) {
    if (!isENOENT(error)) {
      logForDebugging(
        `[jobs] skipping ${basename(jobDir)}: state.json read/parse failed — ${error instanceof Error ? error.message : String(error)}`,
        { level: 'warn' },
      )
    }
    if (cacheable) jobStateCache.set(jobDir, null)
    return null
  }
}

export function getPinsPath(): string {
  return join(getJobsDir(), 'pins.json')
}

async function migrateLegacyPins(): Promise<Set<string>> {
  let entries
  try {
    entries = await readdir(getJobsDir(), { withFileTypes: true })
  } catch {
    return new Set()
  }

  const pinned: string[] = []
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        readFile(join(getJobsDir(), entry.name, 'pinned'), 'utf-8').then(
          () => pinned.push(entry.name),
          () => {},
        ),
      ),
  )
  const result = new Set(pinned)
  await writePins(result).catch(() => {})
  return result
}

export async function readPins(): Promise<Set<string>> {
  try {
    const raw = safeParseJSON(await readFile(getPinsPath(), 'utf-8'))
    if (!Array.isArray(raw)) return new Set()
    return new Set(raw.filter((value): value is string => typeof value === 'string'))
  } catch (error) {
    if (isENOENT(error)) return migrateLegacyPins()
    return new Set()
  }
}

export async function writePins(pins: Set<string>): Promise<void> {
  const path = getPinsPath()
  await mkdir(dirname(path), { recursive: true })
  await atomicWriteFile(path, JSON.stringify([...pins], null, 2))
}

let pinWriteChain = Promise.resolve()

export function setJobPinned(id: string, pinned: boolean): Promise<void> {
  const update = pinWriteChain.then(async () => {
    const pins = await readPins()
    if (pinned ? pins.has(id) : !pins.has(id)) return
    if (pinned) pins.add(id)
    else pins.delete(id)
    await writePins(pins)
  })
  pinWriteChain = update.catch(() => {})
  return update
}

export async function renameJob(
  sessionId: string,
  name: string,
  source: 'user' | 'auto' = 'user',
): Promise<boolean> {
  const isCurrentSession = sessionId === getSessionId()
  const jobDir = getJobDir(
    isCurrentSession ? getCurrentJobShort() : sessionId.slice(0, 8),
  )
  const first = await readJobState(jobDir)
  if (!first || (!isCurrentSession && first.sessionId !== sessionId)) {
    return false
  }
  if (first.name === name) return true
  invalidateJobState(jobDir)
  const latest = (await readJobState(jobDir)) ?? first
  if (!isCurrentSession && latest.sessionId !== sessionId) return false
  if (latest.name === name || (source === 'auto' && latest.name)) return true
  return writeJobState(jobDir, {
    ...latest,
    name,
    nameSource: source,
    updatedAt: new Date().toISOString(),
  }).then(() => true, error => {
    if (!isENOENT(error)) logError(error)
    return false
  })
}

export async function setCurrentJobRespawnFlag(
  flag: string,
  aliases: readonly string[],
  value: string | null,
): Promise<void> {
  const jobDir = process.env.CLAUDE_JOB_DIR
  if (!jobDir) return
  invalidateJobState(jobDir)
  const state = await readJobState(jobDir)
  if (!state?.respawnFlags) return

  const names = [flag, ...aliases]
  const filtered: string[] = []
  for (let index = 0; index < state.respawnFlags.length; index++) {
    const argument = state.respawnFlags[index]!
    if (
      names.some(
        name => argument === name || argument.startsWith(`${name}=`),
      )
    ) {
      if (!argument.includes('=') && state.respawnFlags[index + 1] !== undefined) {
        index++
      }
      continue
    }
    filtered.push(argument)
  }

  const next = value === null ? filtered : [...filtered, flag, value]
  if (
    next.length === state.respawnFlags.length &&
    next.every((argument, index) => argument === state.respawnFlags[index])
  ) {
    return
  }
  await writeJobState(jobDir, {
    ...state,
    respawnFlags: next,
    updatedAt: new Date().toISOString(),
  }).catch(error => {
    if (!isENOENT(error)) logError(error)
  })
}

export async function appendCurrentJobRespawnFlag(
  flag: string,
  value: string,
): Promise<void> {
  const jobDir = process.env.CLAUDE_JOB_DIR
  if (!jobDir) return
  invalidateJobState(jobDir)
  const state = await readJobState(jobDir)
  if (!state?.respawnFlags) return
  for (let index = 0; index < state.respawnFlags.length - 1; index++) {
    if (
      state.respawnFlags[index] === flag &&
      state.respawnFlags[index + 1] === value
    ) {
      return
    }
  }
  await writeJobState(jobDir, {
    ...state,
    respawnFlags: [...state.respawnFlags, flag, value],
    updatedAt: new Date().toISOString(),
  }).catch(error => {
    if (!isENOENT(error)) logError(error)
  })
}

export async function writeJobOrder(
  jobDir: string,
  order: number,
): Promise<void> {
  await writeFile(join(jobDir, 'order'), String(order), 'utf-8')
  invalidateJobState(jobDir)
}

export async function writeJobStateOrder(
  jobDir: string,
  order: number,
): Promise<void> {
  await writeFile(join(jobDir, 'stateOrder'), String(order), 'utf-8')
  invalidateJobState(jobDir)
}

export function terminalStateActivity(
  state: string,
): 'success' | 'failure' | 'stopped' | null {
  if (state === 'done') return 'success'
  if (state === 'failed') return 'failure'
  if (state === 'stopped') return 'stopped'
  return null
}

export function isTerminalState(state: string): boolean {
  return terminalStateActivity(state) !== null
}

export function isSettledJob(state: JobState): boolean {
  return isTerminalState(state.state) && state.tempo !== 'active'
}

function markStale(state: JobState): JobState {
  if (state.state === 'blocked') {
    return { ...state, tempo: 'blocked', inFlight: undefined }
  }
  return {
    ...state,
    state: 'failed',
    tempo: 'idle',
    needs: undefined,
    inFlight: undefined,
    detail: state.detail.replace(/; respawning$/, ''),
  }
}

export async function readAllJobs(
  liveJobs?: ReadonlySet<string>,
): Promise<JobRecord[]> {
  let entries
  try {
    entries = await readdir(getJobsDir(), { withFileTypes: true })
  } catch {
    return []
  }

  const [pins, records] = await Promise.all([
    readPins(),
    Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry): Promise<JobRecord | null> => {
          const state = await readJobState(join(getJobsDir(), entry.name))
          return state ? { id: entry.name, state } : null
        }),
    ),
  ])
  const withPins = records
    .filter((record): record is JobRecord => record !== null)
    .map((record) =>
      pins.has(record.id)
        ? { ...record, state: { ...record.state, pinned: true } }
        : record,
    )

  if (!liveJobs) return withPins
  const now = Date.now()
  return withPins.map((record) => {
    if (isSettledJob(record.state)) return record
    if (liveJobs.has(record.id)) return record
    if (now - Date.parse(record.state.createdAt) < 5_000) return record
    return { ...record, state: markStale(record.state) }
  })
}

function sanitizeDetail(detail: string): string {
  return detail.replace(/[\r\n]+/g, ' ').trim()
}

export function createInitialJobState(
  options: InitialJobStateOptions,
): JobState {
  const now = new Date().toISOString()
  return {
    state: 'working',
    detail:
      options.detail !== undefined
        ? sanitizeDetail(options.detail)
        : 'starting…',
    tempo: options.tempo ?? 'active',
    output: null,
    children: null,
    linkScanOffset: 0,
    template: options.template.name,
    routine: options.routine,
    respawnFlags: options.respawnFlags ?? [],
    intent: options.intent,
    name: options.name,
    nameSource: options.nameSource,
    initialPrompt: options.template.initialPrompt,
    sessionId: options.sessionId,
    resumeSessionId: options.sessionId,
    cwd: options.cwd,
    createdAt: now,
    updatedAt: now,
    firstTerminalAt: null,
    worktreePath: options.worktreePath,
    worktreeBranch: options.worktreeBranch,
    worktreeHookBased: options.worktreeHookBased,
    originCwd: options.originCwd,
    backend: 'daemon',
  }
}
