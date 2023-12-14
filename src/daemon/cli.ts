import { basename, resolve } from 'path'
import { isPathTrusted } from '../utils/config.js'
import {
  deriveScheduledTaskId,
  parseSchedule,
  readDaemonConfig,
  readScheduledTasks,
  removeAssistant,
  removeRemoteControl,
  removeScheduledTask,
  saveScheduledTask,
  upsertRemoteControl,
  type ScheduledTask,
} from './config.js'
import { isDaemonServiceInstalled } from './service.js'

type CliAction = 'list' | 'add' | 'remove'

export type ParsedKindArgs = {
  action: CliAction
  removeTarget?: string
  flags: Map<string, string>
  json: boolean
}

type DaemonRow = {
  kind: 'assistant' | 'remote-control' | 'scheduled'
  dir: string
  name?: string
  id?: string
  spawnMode?: string
  enabled?: boolean
  cron?: string
}

class DaemonCliFailure extends Error {}

function print(message: string): void {
  process.stdout.write(`${message}\n`)
}

function printError(message: string): void {
  process.stderr.write(`${message}\n`)
}

function fail(message: string): never {
  throw new DaemonCliFailure(message)
}

export function parseKindArgs(
  kind: 'scheduled' | 'assistant' | 'remote-control',
  args: string[],
): ParsedKindArgs {
  let removeTarget: string | undefined
  const flags = new Map<string, string>()
  let json = false
  const actionIndex = args.findIndex(arg => !arg.startsWith('-'))
  const actionArg = actionIndex === -1 ? undefined : args[actionIndex]
  let action: CliAction
  if (actionArg === undefined || actionArg === 'list') action = 'list'
  else if (actionArg === 'add' || actionArg === 'remove') action = actionArg
  else {
    fail(
      `unknown action '${actionArg}' — expected: claude daemon ${kind} <add|remove|list>`,
    )
  }
  const remaining =
    actionIndex === -1
      ? args
      : [...args.slice(0, actionIndex), ...args.slice(actionIndex + 1)]
  for (let index = 0; index < remaining.length; index++) {
    const arg = remaining[index]!
    if (arg === '--json') {
      json = true
      continue
    }
    if (arg.startsWith('--')) {
      const equals = arg.indexOf('=')
      const name = equals !== -1 ? arg.slice(2, equals) : arg.slice(2)
      if (name === 'add' || name === 'remove') {
        fail(
          `'${arg}' is no longer supported — use: claude daemon ${kind} <add|remove|list>`,
        )
      }
      flags.set(
        name,
        equals !== -1 ? arg.slice(equals + 1) : (remaining[++index] ?? ''),
      )
    } else if (action === 'remove' && removeTarget === undefined) {
      removeTarget = arg
    } else {
      fail(
        `unknown option '${arg}' — expected: claude daemon ${kind} <add|remove|list>`,
      )
    }
  }
  return { action, removeTarget, flags, json }
}

async function requireInstalledService(): Promise<void> {
  if (!(await isDaemonServiceInstalled())) {
    fail(
      'daemon service is not installed (service install is disabled in this version; the daemon runs on demand)',
    )
  }
}

async function getConfig(path: string) {
  const result = await readDaemonConfig(path)
  if (!result.ok) fail(result.error)
  return result.config
}

function renderRows(rows: DaemonRow[]): void {
  if (rows.length === 0) {
    print('(no entries)')
    return
  }
  const header = ['kind', 'name/id', 'dir', 'extra']
  const values = rows.map(row => [
    row.kind,
    row.id ?? row.name ?? '',
    row.dir,
    row.kind === 'scheduled'
      ? `${row.cron ?? ''}${row.enabled === false ? ' (disabled)' : ''}`
      : row.kind === 'remote-control'
        ? (row.spawnMode ?? '')
        : '',
  ])
  const widths = header.map((value, index) =>
    Math.max(value.length, ...values.map(row => row[index]!.length)),
  )
  const line = (row: string[]) =>
    row.map((value, index) => value.padEnd(widths[index]!)).join('  ')
  print(line(header))
  print(widths.map(width => '-'.repeat(width)).join('  '))
  for (const row of values) print(line(row))
}

async function listAll(path: string): Promise<DaemonRow[]> {
  const config = await getConfig(path)
  const rows: DaemonRow[] = []
  for (const entry of config.assistant ?? []) {
    rows.push({
      kind: 'assistant',
      dir: entry.dir,
      name: entry.name ?? basename(entry.dir),
    })
  }
  for (const entry of config.remoteControl ?? []) {
    rows.push({
      kind: 'remote-control',
      dir: entry.dir,
      name: entry.name ?? basename(entry.dir),
      spawnMode: entry.spawnMode ?? 'same-dir',
    })
  }
  for (const task of await readScheduledTasks(path)) {
    rows.push({
      kind: 'scheduled',
      id: task.id,
      dir: task.directory,
      enabled: task.enabled,
      cron: task.cron,
    })
  }
  return rows
}

export async function handleListAllKinds(
  json: boolean,
  path: string,
): Promise<void> {
  const rows = await listAll(path)
  if (json) print(JSON.stringify(rows, null, 2))
  else renderRows(rows)
}

async function handleScheduled(
  args: ParsedKindArgs,
  path: string,
): Promise<void> {
  if (args.action === 'list') {
    const tasks = await readScheduledTasks(path)
    if (args.json) print(JSON.stringify(tasks, null, 2))
    else {
      renderRows(
        tasks.map(task => ({
          kind: 'scheduled',
          id: task.id,
          dir: task.directory,
          enabled: task.enabled,
          cron: task.cron,
        })),
      )
    }
    return
  }
  if (args.action === 'remove') {
    if (!args.removeTarget) {
      fail('usage: claude daemon scheduled remove <task-id>')
    }
    await requireInstalledService()
    if (!(await removeScheduledTask(args.removeTarget, path))) {
      fail(`No scheduled task with id "${args.removeTarget}"`)
    }
    print(`removed ${args.removeTarget}`)
    return
  }

  await requireInstalledService()
  if (args.flags.has('id') && !args.flags.get('id')) {
    fail('--id requires a non-empty value')
  }
  if (args.flags.has('model') && !args.flags.get('model')) {
    fail('--model requires a non-empty value')
  }
  const permissionModes = [
    'dontAsk',
    'auto',
    'default',
    'acceptEdits',
    'plan',
    'bypassPermissions',
  ] as const
  const permissionFlag = args.flags.get('permission-mode')
  if (
    args.flags.has('permission-mode') &&
    !permissionModes.includes(permissionFlag as (typeof permissionModes)[number])
  ) {
    fail(`--permission-mode must be one of ${permissionModes.join(', ')}`)
  }
  const promptFlag = args.flags.get('prompt')
  const idFlag = args.flags.get('id')
  const dirFlag = args.flags.get('dir')
  const defaultDir = resolve(dirFlag ?? process.cwd())
  if (!idFlag && !promptFlag) {
    fail('--prompt is required (or pass --id to update an existing task)')
  }
  const id = idFlag ?? deriveScheduledTaskId(defaultDir, promptFlag!)
  const existing = (await readScheduledTasks(path)).find(task => task.id === id)
  const prompt = promptFlag ?? existing?.prompt
  const cronFlag = args.flags.get('cron') ?? existing?.cron
  if (!prompt) fail('--prompt is required')
  if (!cronFlag) fail('--cron is required')
  const parsed = parseSchedule(cronFlag)
  if (parsed.error !== undefined) {
    fail(`invalid --cron '${cronFlag}': ${parsed.error}`)
  }
  const directory = dirFlag
    ? resolve(dirFlag)
    : (existing?.directory ?? resolve(process.cwd()))
  const permissionMode =
    (permissionFlag as ScheduledTask['permissionMode'] | undefined) ??
    existing?.permissionMode ??
    'dontAsk'
  const model = args.flags.get('model') ?? existing?.model ?? undefined
  if (!isPathTrusted(directory)) {
    fail(
      `${directory} is not a trusted directory — run \`claude\` there once and accept the trust dialog.`,
    )
  }
  const task = {
    ...(existing && {
      enabled: existing.enabled,
      runTimeoutMinutes: existing.runTimeoutMinutes,
      maxQueued: existing.maxQueued,
    }),
    id,
    cron: parsed.cron!,
    prompt,
    directory,
    permissionMode,
    ...(model && { model }),
  }
  await saveScheduledTask(task, path)
  print(`${existing ? 'updated' : 'added'} scheduled task '${id}'`)
}

async function resolveNamedEntry(
  target: string,
  entries: Array<{ dir: string; name?: string }>,
  kind: 'assistant' | 'remote-control server',
): Promise<string> {
  const byName = entries.filter(entry => (entry.name ?? basename(entry.dir)) === target)
  if (byName.length === 1) return byName[0]!.dir
  if (byName.length > 1) {
    fail(`ambiguous: multiple ${kind}s match name '${target}'. Use a dir instead.`)
  }
  const absolute = resolve(target)
  const byDir = entries.filter(entry => entry.dir === absolute)
  if (byDir.length === 1) return byDir[0]!.dir
  if (byDir.length > 1) {
    fail(`ambiguous: multiple ${kind}s match dir '${target}'. Use a unique name instead.`)
  }
  fail(`no ${kind} matched '${target}'`)
}

async function handleAssistant(
  args: ParsedKindArgs,
  path: string,
): Promise<void> {
  const config = await getConfig(path)
  const assistants = config.assistant ?? []
  if (args.action === 'list') {
    if (args.json) print(JSON.stringify(assistants, null, 2))
    else {
      renderRows(
        assistants.map(entry => ({
          kind: 'assistant',
          dir: entry.dir,
          name: entry.name ?? basename(entry.dir),
        })),
      )
    }
    return
  }
  if (args.action === 'remove') {
    if (!args.removeTarget) {
      fail('usage: claude daemon assistant remove <name-or-dir>')
    }
    await requireInstalledService()
    const dir = await resolveNamedEntry(
      args.removeTarget,
      assistants,
      'assistant',
    )
    await removeAssistant(dir, path)
    print(`removed ${dir}`)
    return
  }
  await requireInstalledService()
  fail('`claude daemon assistant add` is not available in this build')
}

async function handleRemoteControl(
  args: ParsedKindArgs,
  path: string,
): Promise<void> {
  const config = await getConfig(path)
  const entries = config.remoteControl ?? []
  if (args.action === 'list') {
    if (args.json) print(JSON.stringify(entries, null, 2))
    else {
      renderRows(
        entries.map(entry => ({
          kind: 'remote-control',
          dir: entry.dir,
          name: entry.name ?? basename(entry.dir),
          spawnMode: entry.spawnMode ?? 'same-dir',
        })),
      )
    }
    return
  }
  if (args.action === 'remove') {
    if (!args.removeTarget) {
      fail('usage: claude daemon remote-control remove <name-or-dir>')
    }
    await requireInstalledService()
    const dir = await resolveNamedEntry(
      args.removeTarget,
      entries,
      'remote-control server',
    )
    await removeRemoteControl(dir, path)
    print(`removed ${dir}`)
    return
  }
  await requireInstalledService()
  const dir = resolve(args.flags.get('dir') ?? process.cwd())
  if (!isPathTrusted(dir)) {
    fail(
      `${dir} is not a trusted directory — run \`claude\` there once and accept the trust dialog.`,
    )
  }
  const name = args.flags.get('name')
  const spawnMode = args.flags.get('spawn-mode')
  if (
    spawnMode !== undefined &&
    spawnMode !== 'same-dir' &&
    spawnMode !== 'worktree'
  ) {
    fail(`--spawn-mode must be same-dir or worktree, got '${spawnMode}'`)
  }
  const result = await upsertRemoteControl(
    {
      dir,
      name,
      spawnMode: spawnMode as 'same-dir' | 'worktree' | undefined,
    },
    path,
  )
  print(`${result} remote-control server for ${dir}`)
}

export async function handleCliKind(
  kind: 'scheduled' | 'assistant' | 'remote-control',
  rawArgs: string[],
  path: string,
): Promise<void> {
  try {
    const args = parseKindArgs(kind, rawArgs)
    if (kind === 'scheduled') await handleScheduled(args, path)
    else if (kind === 'assistant') await handleAssistant(args, path)
    else await handleRemoteControl(args, path)
  } catch (error) {
    if (error instanceof DaemonCliFailure) {
      printError(error.message)
      process.exitCode = 1
      return
    }
    throw error
  }
}
