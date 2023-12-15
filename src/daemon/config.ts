import { mkdir, readFile } from 'fs/promises'
import { basename, dirname } from 'path'
import { z } from 'zod/v4'
import { isENOENT } from '../utils/errors.js'
import { atomicWriteFile } from '../utils/atomicWrite.js'
import { parseCronExpression, cronToHuman } from '../utils/cron.js'
import {
  remoteControlWorkerSchema,
  scheduledTaskSchema,
  scheduledWorkerSchema,
} from './workerRegistry.js'
import { getDefaultDaemonConfigPath } from './service.js'

const daemonConfigSchema = () =>
  z.object({
    $schema: z.string().optional(),
    heartbeat: z
      .union([
        z.object({ intervalSeconds: z.number().positive().default(30) }).strict(),
        z.array(
          z.object({ intervalSeconds: z.number().positive().default(30) }).strict(),
        ),
      ])
      .optional()
      .transform(value =>
        value === undefined ? [] : Array.isArray(value) ? value : [value],
      ),
    scheduled: z
      .union([scheduledWorkerSchema(), z.array(scheduledWorkerSchema())])
      .optional()
      .transform(value =>
        value === undefined ? [] : Array.isArray(value) ? value : [value],
      ),
    remoteControl: z
      .union([
        remoteControlWorkerSchema(),
        z.array(remoteControlWorkerSchema()),
      ])
      .optional()
      .transform(value =>
        value === undefined ? [] : Array.isArray(value) ? value : [value],
      ),
  })

export type DaemonConfig = z.infer<ReturnType<typeof daemonConfigSchema>>
export type ScheduledTask = z.infer<ReturnType<typeof scheduledTaskSchema>>
export type ScheduledTaskInput = z.input<ReturnType<typeof scheduledTaskSchema>>
export type RemoteControlConfig = z.infer<
  ReturnType<typeof remoteControlWorkerSchema>
>

export type DaemonConfigReadResult =
  | { ok: true; config: DaemonConfig; unknownKeys: string[] }
  | { ok: false; error: string }

export async function readDaemonConfig(
  path = getDefaultDaemonConfigPath(),
): Promise<DaemonConfigReadResult> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (error) {
    if (isENOENT(error)) {
      return {
        ok: true,
        config: daemonConfigSchema().parse({}),
        unknownKeys: [],
      }
    }
    return { ok: false, error: `failed to read ${path}: ${String(error)}` }
  }
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return { ok: false, error: `failed to parse ${path} as JSON` }
  }
  const parsed = daemonConfigSchema().safeParse(value)
  if (!parsed.success) {
    return {
      ok: false,
      error: `config validation failed: ${parsed.error.message}`,
    }
  }
  const known = new Set(Object.keys(daemonConfigSchema().shape))
  const unknownKeys =
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.keys(value).filter(key => !known.has(key))
      : []
  return { ok: true, config: parsed.data, unknownKeys }
}

async function readRawConfig(path?: string): Promise<{
  jsonPath: string
  existing: Record<string, unknown>
}> {
  const jsonPath = path ?? getDefaultDaemonConfigPath()
  let raw: string
  try {
    raw = await readFile(jsonPath, 'utf8')
  } catch (error) {
    if (isENOENT(error)) return { jsonPath, existing: {} }
    throw error
  }
  if (raw.trim() === '') return { jsonPath, existing: {} }
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error(`daemon.json is malformed: ${jsonPath}`)
  }
  return {
    jsonPath,
    existing:
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {},
  }
}

async function atomicWrite(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await atomicWriteFile(path, value)
}

function scheduledSection(existing: Record<string, unknown>): {
  section: Record<string, unknown>
  tasks: unknown[]
} {
  const raw = existing.scheduled
  let section: Record<string, unknown> = {}
  if (
    Array.isArray(raw) &&
    raw.length > 0 &&
    raw[0] &&
    typeof raw[0] === 'object'
  ) {
    section = raw[0] as Record<string, unknown>
  } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    section = raw as Record<string, unknown>
  }
  return {
    section,
    tasks: Array.isArray(section.tasks) ? section.tasks : [],
  }
}

function setScheduledSection(
  existing: Record<string, unknown>,
  section: Record<string, unknown>,
): void {
  if (Array.isArray(existing.scheduled)) {
    const sections = existing.scheduled.slice()
    sections[0] = section
    existing.scheduled = sections
  } else {
    existing.scheduled = section
  }
}

export async function saveScheduledTask(
  task: ScheduledTaskInput,
  path?: string,
): Promise<void> {
  scheduledTaskSchema().parse(task)
  const { jsonPath, existing } = await readRawConfig(path)
  const { section, tasks } = scheduledSection(existing)
  const next = tasks.filter(
    value =>
      !(
        value &&
        typeof value === 'object' &&
        (value as { id?: unknown }).id === task.id
      ),
  )
  next.push(task)
  setScheduledSection(existing, { ...section, tasks: next })
  await atomicWrite(jsonPath, `${JSON.stringify(existing, null, 2)}\n`)
}

export async function removeScheduledTask(
  id: string,
  path?: string,
): Promise<boolean> {
  const { jsonPath, existing } = await readRawConfig(path)
  if (!('scheduled' in existing)) return false
  const { section, tasks } = scheduledSection(existing)
  const next = tasks.filter(
    value =>
      !(
        value &&
        typeof value === 'object' &&
        (value as { id?: unknown }).id === id
      ),
  )
  if (next.length === tasks.length) return false
  if (next.length === 0) {
    const raw = existing.scheduled
    if (Array.isArray(raw) && raw.length > 1) {
      existing.scheduled = raw.slice(1)
    } else {
      delete existing.scheduled
    }
  } else {
    setScheduledSection(existing, { ...section, tasks: next })
  }
  await atomicWrite(jsonPath, `${JSON.stringify(existing, null, 2)}\n`)
  return true
}

export async function readScheduledTasks(path?: string): Promise<ScheduledTask[]> {
  const { existing } = await readRawConfig(path)
  if (!('scheduled' in existing)) return []
  const { tasks } = scheduledSection(existing)
  const parsed: ScheduledTask[] = []
  for (const task of tasks) {
    const result = scheduledTaskSchema().safeParse(task)
    if (result.success) parsed.push(result.data)
  }
  return parsed
}

export async function upsertRemoteControl(
  input: {
    dir: string
    name?: string
    spawnMode?: 'same-dir' | 'worktree'
  },
  path?: string,
): Promise<'added' | 'updated'> {
  const { jsonPath, existing } = await readRawConfig(path)
  const raw = existing.remoteControl
  const entries = Array.isArray(raw)
    ? raw.filter(
        (value): value is Record<string, unknown> =>
          !!value &&
          typeof value === 'object' &&
          typeof (value as { dir?: unknown }).dir === 'string',
      )
    : raw &&
        typeof raw === 'object' &&
        typeof (raw as { dir?: unknown }).dir === 'string'
      ? [raw as Record<string, unknown>]
      : []
  const index = entries.findIndex(entry => entry.dir === input.dir)
  let result: 'added' | 'updated'
  if (index >= 0) {
    const defined = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    )
    entries[index] = { ...entries[index], ...defined }
    result = 'updated'
  } else {
    entries.push(input)
    result = 'added'
  }
  existing.remoteControl = entries
  await atomicWrite(jsonPath, `${JSON.stringify(existing, null, 2)}\n`)
  return result
}

export async function removeRemoteControl(
  dir: string,
  path?: string,
): Promise<void> {
  const { jsonPath, existing } = await readRawConfig(path)
  const raw = existing.remoteControl
  const entries = Array.isArray(raw)
    ? raw.filter(
        (value): value is Record<string, unknown> =>
          !!value &&
          typeof value === 'object' &&
          typeof (value as { dir?: unknown }).dir === 'string',
      )
    : raw &&
        typeof raw === 'object' &&
        typeof (raw as { dir?: unknown }).dir === 'string'
      ? [raw as Record<string, unknown>]
      : []
  const next = entries.filter(entry => entry.dir !== dir)
  if (next.length === entries.length) return
  if (next.length === 0) delete existing.remoteControl
  else existing.remoteControl = next
  await atomicWrite(jsonPath, `${JSON.stringify(existing, null, 2)}\n`)
}

export async function removeAssistant(
  dir: string,
  path?: string,
): Promise<void> {
  const { jsonPath, existing } = await readRawConfig(path)
  const raw = existing.assistant
  const entries = Array.isArray(raw)
    ? raw.filter(
        (value): value is Record<string, unknown> =>
          !!value &&
          typeof value === 'object' &&
          typeof (value as { dir?: unknown }).dir === 'string',
      )
    : raw &&
        typeof raw === 'object' &&
        typeof (raw as { dir?: unknown }).dir === 'string'
      ? [raw as Record<string, unknown>]
      : []
  const next = entries.filter(entry => entry.dir !== dir)
  if (next.length === entries.length) return
  if (next.length === 0) delete existing.assistant
  else existing.assistant = next
  await atomicWrite(jsonPath, `${JSON.stringify(existing, null, 2)}\n`)
}

export type AssistantConfig = { dir: string; name?: string }

export async function readAssistants(path?: string): Promise<AssistantConfig[]> {
  const { existing } = await readRawConfig(path)
  const raw = existing.assistant
  const entries = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? [raw]
      : []
  return entries.filter(
    (entry): entry is AssistantConfig =>
      !!entry &&
      typeof entry === 'object' &&
      typeof (entry as { dir?: unknown }).dir === 'string',
  )
}

export async function upsertAssistant(
  dir: string,
  path?: string,
  name?: string,
): Promise<'added' | 'updated'> {
  const { jsonPath, existing } = await readRawConfig(path)
  const raw = existing.assistant
  const entries = (Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? [raw]
      : []
  ).filter(
    (entry): entry is Record<string, unknown> =>
      !!entry &&
      typeof entry === 'object' &&
      typeof (entry as { dir?: unknown }).dir === 'string',
  )
  const next = name ? { dir, name } : { dir }
  const index = entries.findIndex(entry => entry.dir === dir)
  const result = index >= 0 ? 'updated' : 'added'
  if (index >= 0) entries[index] = { ...entries[index], ...next }
  else entries.push(next)
  existing.assistant = entries
  await atomicWrite(jsonPath, `${JSON.stringify(existing, null, 2)}\n`)
  return result
}

export type ParsedSchedule = {
  cron?: string
  human?: string
  error?: string
}

/** Parse the daemon UI/CLI shorthand accepted by 2.1.119. */
export function parseSchedule(value: string): ParsedSchedule {
  const input = value.trim()
  if (input === '') return { error: 'required' }
  const interval = input.match(/^(\d+)\s*([smhd])$/i)
  if (interval) {
    const count = Number.parseInt(interval[1]!, 10)
    const unit = interval[2]!.toLowerCase()
    if (count < 1) return { error: 'interval must be at least 1' }
    let cron: string
    switch (unit) {
      case 's':
        return { error: 'minimum interval is 1 minute' }
      case 'm':
        if (count > 59) {
          return { error: 'minute interval must be 1–59 (use hours instead)' }
        }
        cron = count === 1 ? '* * * * *' : `*/${count} * * * *`
        break
      case 'h':
        if (count > 23) {
          return { error: 'hour interval must be 1–23 (use days instead)' }
        }
        cron = count === 1 ? '0 * * * *' : `0 */${count} * * *`
        break
      case 'd':
        if (count === 1) cron = '0 0 * * *'
        else {
          if (count > 28) {
            return {
              error: 'day interval must be 1–28 (use a cron expression)',
            }
          }
          cron = `0 0 */${count} * *`
        }
        break
      default:
        return { error: 'unknown interval unit' }
    }
    return { cron, human: cronToHuman(cron) }
  }
  if (parseCronExpression(input) !== null) {
    return { cron: input, human: cronToHuman(input) }
  }
  return {
    error:
      'use an interval (5m, 2h, 1d) or 5-field cron (*/5 * * * *)',
  }
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export function deriveScheduledTaskId(dir: string, prompt: string): string {
  const directory = slug(basename(dir))
  const description = slug(prompt.split(/\s+/).slice(0, 4).join(' '))
  return [directory, description].filter(Boolean).join('-') || 'task'
}
