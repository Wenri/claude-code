import { randomBytes } from 'crypto'
import { watch } from 'fs'
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'fs/promises'
import { basename, dirname, join } from 'path'
import { z } from 'zod/v4'
import { logForDebugging } from '../utils/debug.js'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import { isENOENT } from '../utils/errors.js'
import { safeParseJSON } from '../utils/json.js'
import { lazySchema } from '../utils/lazySchema.js'

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
          }),
        )
        .nullable()
        .default(null),
      linkScanOffset: z.number().default(0),
      linkScanPath: z.string().optional(),
      template: z.string(),
      routine: z.string().optional(),
      intent: z.string(),
      initialPrompt: z.string().optional(),
      name: z.string().optional(),
      sessionId: z.string(),
      cliVersion: z.string().optional(),
      cwd: z.string(),
      createdAt: z.string(),
      updatedAt: z.string(),
      firstTerminalAt: z.string().nullable().default(null),
      worktreePath: z.string().optional(),
      worktreeBranch: z.string().optional(),
      worktreeHookBased: z.boolean().optional(),
      originCwd: z.string().optional(),
      backend: z.enum(['daemon', 'peer']).default('daemon'),
      sock: z.string().optional(),
      pid: z.number().optional(),
      sortOrder: z.number().optional(),
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
  name?: string
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

async function atomicWrite(path: string, contents: string): Promise<void> {
  const temporary = join(
    dirname(path),
    `.${basename(path)}.tmp.${randomBytes(4).toString('hex')}`,
  )
  try {
    await writeFile(temporary, contents, { encoding: 'utf-8' })
    try {
      await rename(temporary, path)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'EPERM' || code === 'EEXIST' || code === 'EXDEV') {
        await copyFile(temporary, path)
        await rm(temporary, { force: true }).catch(() => {})
      } else {
        throw error
      }
    }
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

export async function writeJobState(
  jobDir: string,
  state: JobState,
): Promise<void> {
  const { pinned: _pinned, sortOrder: _sortOrder, ...persisted } = state
  await atomicWrite(join(jobDir, STATE_FILE), JSON.stringify(persisted, null, 2))
}

export async function readJobState(jobDir: string): Promise<JobState | null> {
  try {
    const [rawState, rawOrder] = await Promise.all([
      readFile(join(jobDir, STATE_FILE), 'utf-8'),
      readFile(join(jobDir, 'order'), 'utf-8').catch(() => null),
    ])
    const result = JobStateSchema().safeParse(safeParseJSON(rawState))
    if (!result.success) {
      logForDebugging(
        `[jobs] skipping ${basename(jobDir)}: state.json schema validation failed — ${result.error.message}`,
        { level: 'warn' },
      )
      return null
    }

    const order = rawOrder !== null ? Number(rawOrder) : undefined
    let state = result.data
    if (Number.isFinite(order)) state = { ...state, sortOrder: order }
    return state
  } catch (error) {
    if (!isENOENT(error)) {
      logForDebugging(
        `[jobs] skipping ${basename(jobDir)}: state.json read/parse failed — ${error instanceof Error ? error.message : String(error)}`,
        { level: 'warn' },
      )
    }
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
  await atomicWrite(path, JSON.stringify([...pins], null, 2))
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
): Promise<void> {
  const jobDir = getJobDir(sessionId.slice(0, 8))
  const first = await readJobState(jobDir)
  if (!first || first.sessionId !== sessionId || first.name === name) return
  const latest = (await readJobState(jobDir)) ?? first
  if (latest.sessionId !== sessionId || latest.name === name) return
  await writeJobState(jobDir, {
    ...latest,
    name,
    updatedAt: new Date().toISOString(),
  }).catch(() => {})
}

export async function writeJobOrder(
  jobDir: string,
  order: number,
): Promise<void> {
  await writeFile(join(jobDir, 'order'), String(order), 'utf-8')
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
    intent: options.intent,
    name: options.name,
    initialPrompt: options.template.initialPrompt,
    sessionId: options.sessionId,
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
