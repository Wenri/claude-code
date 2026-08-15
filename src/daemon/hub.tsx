import { readFile } from 'fs/promises'
import { basename, resolve } from 'path'
import { homedir } from 'os'
import React, { useEffect, useMemo, useState } from 'react'
import { installAssistant } from '../assistant/install.js'
import { logEvent } from '../services/analytics/index.js'
import { clearTerminal } from '../ink/clearTerminal.js'
import { Box, Text, createRoot, useInput } from '../ink.js'
import { isPathTrusted, setPathTrusted } from '../utils/config.js'
import { computeNextCronRun, cronToHuman, parseCronExpression } from '../utils/cron.js'
import { getCwd } from '../utils/cwd.js'
import { logForDebugging } from '../utils/debug.js'
import { bgSupervisorNoun } from '../utils/agentsFleet.js'
import { formatRelativeTime } from '../utils/format.js'
import { processStartTokenMatches } from '../utils/genericProcessUtils.js'
import { getModelOptions } from '../utils/model/modelOptions.js'
import { getBaseRenderOptions } from '../utils/renderOptions.js'
import {
  deriveScheduledTaskId,
  parseSchedule,
  readDaemonConfig,
  readScheduledTasks,
  removeAssistant,
  removeRemoteControl,
  removeScheduledTask,
  saveScheduledTask,
  upsertAssistant,
  upsertRemoteControl,
  type AssistantConfig,
  type RemoteControlConfig,
  type ScheduledTask,
} from './config.js'
import { getRunningDaemon, type DaemonLock } from './lock.js'
import { getDaemonStatusPath, getRosterPath } from './paths.js'
import { ManifestSchema } from './protocol.js'
import {
  controlDaemonService,
  getDefaultDaemonConfigPath,
  getDefaultDaemonLogPath,
  installDaemonService,
  isDaemonServiceInstalled,
  isServiceInstallSupported,
  uninstallDaemonService,
} from './service.js'
import { readScheduledStatus, type ScheduledWorkerStatus } from './workerRegistry.js'

export type HubData = {
  tasks: ScheduledTask[]
  assistants: AssistantConfig[]
  servers: RemoteControlConfig[]
  lock: DaemonLock | null
  scheduledStatus: ScheduledWorkerStatus | null
  status: DaemonWorkerStatus | null
  bgCount: number
  serviceInstalled: boolean
  serviceSupported: boolean
}

type DaemonWorkerStatus = {
  supervisorPid: number
  supervisorProcStart?: string
  workers: Record<string, { pid: number; startedAt: number }>
}

type HubTab = 'scheduled' | 'remoteControl'
type Screen =
  | { type: 'hub' }
  | { type: 'scheduled-detail'; task: ScheduledTask }
  | { type: 'scheduled-form'; task?: ScheduledTask }
  | { type: 'remote-detail'; server: RemoteControlConfig }
  | { type: 'remote-form' }
  | { type: 'assistant-form' }

async function readBackgroundCount(): Promise<number> {
  try {
    const parsed = ManifestSchema().safeParse(
      JSON.parse(await readFile(getRosterPath(), 'utf8')),
    )
    return parsed.success ? Object.keys(parsed.data.workers).length : 0
  } catch {
    return 0
  }
}

async function readDaemonWorkerStatus(): Promise<DaemonWorkerStatus | null> {
  try {
    const parsed = JSON.parse(
      await readFile(getDaemonStatusPath(), 'utf8'),
    ) as Partial<DaemonWorkerStatus>
    if (
      typeof parsed.supervisorPid !== 'number' ||
      !parsed.workers ||
      typeof parsed.workers !== 'object' ||
      Array.isArray(parsed.workers)
    ) {
      return null
    }
    process.kill(parsed.supervisorPid, 0)
    const supervisorProcStart =
      typeof parsed.supervisorProcStart === 'string'
        ? parsed.supervisorProcStart
        : undefined
    if (
      !(await processStartTokenMatches(
        parsed.supervisorPid,
        supervisorProcStart,
      ))
    ) {
      return null
    }
    return parsed as DaemonWorkerStatus
  } catch {
    return null
  }
}

export async function loadDaemonHubData(
  configPath = getDefaultDaemonConfigPath(),
): Promise<HubData> {
  const [config, tasks, assistants, lock, status, scheduledStatus, bgCount, installed] =
    await Promise.all([
      readDaemonConfig(configPath),
      readScheduledTasks(configPath).catch(() => []),
      // The canonical Linux target retains assistant screens as DCE but does
      // not expose an assistant tab or load assistant rows.
      Promise.resolve([] as AssistantConfig[]),
      getRunningDaemon().catch(() => null),
      readDaemonWorkerStatus(),
      readScheduledStatus().catch(() => null),
      readBackgroundCount(),
      isServiceInstallSupported()
        ? isDaemonServiceInstalled().catch(() => false)
        : Promise.resolve(false),
    ])
  return {
    tasks,
    assistants,
    servers: config.ok ? (config.config.remoteControl ?? []) : [],
    lock,
    status,
    scheduledStatus,
    bgCount,
    serviceInstalled: installed,
    serviceSupported: isServiceInstallSupported(),
  }
}

function serviceActions(data: HubData): Array<'install' | 'uninstall' | 'start' | 'stop' | 'restart'> {
  if (!data.serviceSupported) return []
  if (!data.serviceInstalled) return ['install']
  if (!data.lock) return ['start', 'uninstall']
  return ['restart', 'stop', 'uninstall']
}

function serviceLabel(action: string): string {
  return {
    install: 'Install service',
    uninstall: 'Uninstall service',
    start: 'Start',
    stop: 'Stop',
    restart: 'Restart',
  }[action] ?? action
}

function daemonStatus(data: HubData, message: string | null): string {
  if (message) return message
  if (!data.serviceSupported) return 'not supported on this platform'
  if (!data.lock) return data.serviceInstalled ? 'installed · not running' : 'not installed'
  const pieces = [
    'running',
    `pid ${data.lock.pid}`,
    `v${data.lock.version}`,
    data.bgCount > 0 ? `${data.bgCount} background session${data.bgCount === 1 ? '' : 's'}` : '',
    !data.serviceInstalled ? 'not installed as service' : '',
    data.lock.version !== MACRO.VERSION ? 'restart to update' : '',
  ]
  return pieces.filter(Boolean).join(' · ')
}

function nextRun(task: ScheduledTask, now: Date): string {
  if (!task.enabled) return 'disabled'
  const parsed = parseCronExpression(task.cron)
  const next = parsed ? computeNextCronRun(parsed, now) : null
  return next ? formatRelativeTime(next, { now }) : '—'
}

function resolveUserPath(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '~') return homedir()
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return resolve(homedir(), trimmed.slice(2))
  }
  return resolve(trimmed)
}

function HubList({
  data,
  tab,
  setTab,
  onScreen,
  onDone,
  onService,
  busy,
  message,
}: {
  data: HubData
  tab: HubTab
  setTab: (tab: HubTab) => void
  onScreen: (screen: Screen) => void
  onDone: () => void
  onService: (action: 'install' | 'uninstall' | 'start' | 'stop' | 'restart') => void
  busy: boolean
  message: string | null
}): React.ReactNode {
  const rows = tab === 'scheduled' ? data.tasks : data.servers
  const actions = serviceActions(data)
  const [focus, setFocus] = useState(0)
  const rowCount = rows.length + 1 + actions.length
  useEffect(() => setFocus(value => Math.min(value, Math.max(0, rowCount - 1))), [rowCount])
  useInput((_input, key) => {
    if (busy) return
    if (key.escape) return onDone()
    if (key.leftArrow || key.rightArrow || key.tab) {
      setTab(tab === 'scheduled' ? 'remoteControl' : 'scheduled')
      setFocus(0)
      return
    }
    if (key.upArrow) return setFocus(value => Math.max(0, value - 1))
    if (key.downArrow) return setFocus(value => Math.min(rowCount - 1, value + 1))
    if (!key.return) return
    if (focus < rows.length) {
      if (tab === 'scheduled') {
        onScreen({ type: 'scheduled-detail', task: rows[focus] as ScheduledTask })
      } else {
        onScreen({ type: 'remote-detail', server: rows[focus] as RemoteControlConfig })
      }
      return
    }
    if (focus === rows.length) {
      onScreen(tab === 'scheduled' ? { type: 'scheduled-form' } : { type: 'remote-form' })
      return
    }
    onService(actions[focus - rows.length - 1]!)
  })
  const now = new Date()
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="permission">Claude Daemon</Text>
      <Text>
        <Text inverse={tab === 'scheduled'} bold={tab === 'scheduled'}> Scheduled </Text>{' '}
        <Text inverse={tab === 'remoteControl'} bold={tab === 'remoteControl'}> Remote Control </Text>
      </Text>
      {tab === 'scheduled' ? (
        <>
          <Text dimColor>  Name · Schedule · Next Run · Last Run · PID</Text>
          {data.tasks.length === 0 ? <Text dimColor>  (no scheduled tasks)</Text> : null}
          {data.tasks.map((task, index) => {
            const status = data.scheduledStatus?.tasks[task.id]
            const workerPid =
              data.scheduledStatus?.workerPid ??
              data.status?.workers['scheduled:0']?.pid
            const pid = status?.running ? workerPid : undefined
            return (
              <Text key={task.id} color={focus === index ? 'suggestion' : undefined} bold={focus === index}>
                {focus === index ? '❯' : ' '} {task.id} · {cronToHuman(task.cron)} · {data.lock ? (status?.running ? 'running' : nextRun(task, now)) : 'daemon stopped'} · {status?.lastFiredAt ? formatRelativeTime(new Date(status.lastFiredAt), { now }) : '—'} · {pid ?? '—'}
              </Text>
            )
          })}
        </>
      ) : (
        <>
          <Text dimColor>  Name · Directory · Status · PID</Text>
          {data.servers.length === 0 ? <Text dimColor>  (no remote-control servers)</Text> : null}
          {data.servers.map((server, index) => {
            const pid = data.status?.workers[`remoteControl:${index}`]?.pid
            const running = Boolean(data.lock) && (data.status === null || pid !== undefined)
            return (
              <Text key={server.dir} color={focus === index ? 'suggestion' : undefined} bold={focus === index}>
                {focus === index ? '❯' : ' '} {server.name ?? basename(server.dir)} · {server.dir} · {running ? 'running' : 'stopped'} · {pid ?? (running ? '—' : '')}
              </Text>
            )
          })}
        </>
      )}
      <Text color={focus === rows.length ? 'suggestion' : undefined} bold={focus === rows.length}>
        {focus === rows.length ? '❯' : ' '} + Add new {tab === 'scheduled' ? 'scheduled task' : 'remote-control server'}…
      </Text>
      <Box flexDirection="column" marginTop={1} borderStyle="single" borderDimColor>
        <Text><Text bold>Daemon service</Text> · <Text dimColor>{busy ? 'working…' : daemonStatus(data, message)}</Text></Text>
        {actions.map((action, index) => {
          const at = rows.length + 1 + index
          return <Text key={action} color={focus === at ? (action === 'uninstall' ? 'error' : 'suggestion') : undefined} bold={focus === at}>{focus === at ? '❯' : ' '} {serviceLabel(action)}</Text>
        })}
      </Box>
      <Text dimColor>←→ tabs · ↑↓ move · enter select · esc close</Text>
    </Box>
  )
}

type Field = {
  key: string
  label: string
  placeholder?: string
  required?: boolean
  options?: Array<string | { label: string; value: string; description?: string }>
  validate?: (value: string) => string | null
  hint?: (value: string, values: Record<string, string>) => string | undefined
}

function fieldOptionValue(
  option: NonNullable<Field['options']>[number],
): string {
  return typeof option === 'string' ? option : option.value
}

function fieldOptionLabel(
  option: NonNullable<Field['options']>[number],
): string {
  return typeof option === 'string' ? option : option.label
}

function Form({
  title,
  subtitle,
  fields,
  initial,
  submitLabel,
  onCancel,
  onSubmit,
  onValueChange,
  externalBusyLabel,
}: {
  title: string
  subtitle: string
  fields: Field[]
  initial: Record<string, string>
  submitLabel: string
  onCancel: () => void
  onSubmit: (values: Record<string, string>) => Promise<void>
  onValueChange?: (
    key: string,
    value: string,
    values: Record<string, string>,
  ) => Record<string, string>
  externalBusyLabel?: string
}): React.ReactNode {
  const [values, setValues] = useState(initial)
  const [focus, setFocus] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const updateValue = (key: string, value: string): void => {
    setValues(
      onValueChange?.(key, value, values) ?? { ...values, [key]: value },
    )
  }
  const submit = async () => {
    if (busy || externalBusyLabel) return
    for (const field of fields) {
      const value = values[field.key] ?? ''
      if (field.required && value.trim() === '') return setError(`${field.label} is required`)
      const invalid = field.validate?.(value)
      if (invalid) return setError(invalid)
    }
    setBusy(true)
    setError(null)
    try { await onSubmit(values) } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setBusy(false)
    }
  }
  useInput((input, key) => {
    if (busy || externalBusyLabel) return
    if (key.escape) return onCancel()
    if (key.upArrow) return setFocus(value => Math.max(0, value - 1))
    if (key.downArrow || (key.return && focus < fields.length - 1)) return setFocus(value => Math.min(fields.length - 1, value + 1))
    if (key.return) return void submit()
    const field = fields[focus]!
    if (field.options) {
      if (key.leftArrow || key.rightArrow || key.tab || input === ' ') {
        const current = Math.max(
          0,
          field.options.findIndex(
            option => fieldOptionValue(option) === (values[field.key] ?? ''),
          ),
        )
        const offset = key.leftArrow ? -1 : 1
        const next = (current + field.options.length + offset) % field.options.length
        updateValue(field.key, fieldOptionValue(field.options[next]!))
      }
      return
    }
    if (key.backspace || key.delete) {
      updateValue(field.key, (values[field.key] ?? '').slice(0, -1))
      return
    }
    if (!key.ctrl && !key.meta && input) {
      updateValue(field.key, (values[field.key] ?? '') + input)
    }
  })
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="permission">{title}</Text>
      <Text dimColor>{subtitle}</Text>
      {fields.map((field, index) => {
        const value = values[field.key] ?? ''
        const selectedOption = field.options?.find(
          option => fieldOptionValue(option) === value,
        )
        const shown = selectedOption
          ? fieldOptionLabel(selectedOption)
          : value || field.placeholder || ''
        const optionDescription =
          typeof selectedOption === 'object'
            ? selectedOption.description
            : undefined
        return (
          <Box key={field.key} flexDirection="column">
            <Text color={focus === index ? 'suggestion' : undefined} bold={focus === index}>
              {focus === index ? '❯' : ' '} {field.label}: {shown}{field.options ? '  ←→' : ''}
            </Text>
            {focus === index && (field.hint?.(value, values) ?? optionDescription) ? (
              <Text dimColor>
                {'    '}{field.hint?.(value, values) ?? optionDescription}
              </Text>
            ) : null}
          </Box>
        )
      })}
      {error ? <Text color="error">{error}</Text> : null}
      <Text dimColor>{externalBusyLabel ?? (busy ? `${submitLabel}…` : `↑↓ fields · enter ${submitLabel.toLowerCase()} · esc cancel`)}</Text>
    </Box>
  )
}

function ScheduledForm({ task, existingIds, configPath, onBack, onDone, onSaved }: { task?: ScheduledTask; existingIds: string[]; configPath: string; onBack: () => void; onDone: (message: string) => void; onSaved: () => Promise<void> }): React.ReactNode {
  const [idDirty, setIdDirty] = useState(task !== undefined)
  const conflictingIds = useMemo(
    () => existingIds.filter(id => id !== task?.id),
    [existingIds, task?.id],
  )
  const modelOptions = useMemo(() => {
    const options: Array<{
      label: string
      value: string
      description?: string
    }> = getModelOptions(false).map(option => ({
      label: option.label,
      value: option.value ?? '',
      description: option.description,
    }))
    if (task?.model && !options.some(option => option.value === task.model)) {
      options.push({
        label: task.model,
        value: task.model,
      })
    }
    return options
  }, [task?.model])
  const fields: Field[] = [
    { key: 'prompt', label: 'Prompt', placeholder: '/babysit-prs', required: true, hint: () => 'Sent to Claude on each fire. Slash commands work.' },
    { key: 'schedule', label: 'Schedule', placeholder: '5m, 2h, 1d  or  */15 * * * *', required: true, validate: value => value.trim() ? (parseSchedule(value).error ?? null) : null, hint: value => { const parsed = parseSchedule(value); return parsed.cron ? `${parsed.human} · ${parsed.cron}` : undefined } },
    { key: 'dir', label: 'Directory', placeholder: getCwd() },
    { key: 'id', label: 'Id', validate: value => value.trim() && conflictingIds.includes(value.trim()) ? `id '${value.trim()}' is already in use` : null, hint: () => idDirty ? undefined : 'Auto-generated from prompt and directory.' },
    { key: 'permissionMode', label: 'Permission mode', options: ['dontAsk', 'auto', 'default', 'acceptEdits', 'plan', 'bypassPermissions'] },
    { key: 'model', label: 'Model', options: modelOptions, hint: value => modelOptions.find(option => option.value === value)?.description ?? (value === '' ? 'Uses your configured default model.' : undefined) },
  ]
  return <Form title={task ? `Edit '${task.id}'` : 'New Scheduled Task'} subtitle="Fire a prompt on a recurring schedule" fields={fields} initial={{ prompt: task?.prompt ?? '', schedule: task?.cron ?? '', dir: task?.directory ?? getCwd(), id: task?.id ?? '', permissionMode: task?.permissionMode ?? 'dontAsk', model: task?.model ?? '' }} submitLabel={task ? 'Save changes' : 'Create task'} onCancel={onBack} onValueChange={(key, value, values) => {
    const next = { ...values, [key]: value }
    if (key === 'id') setIdDirty(true)
    else if (!idDirty && (key === 'prompt' || key === 'dir')) {
      next.id = deriveScheduledTaskId(
        resolveUserPath(next.dir?.trim() || getCwd()),
        next.prompt ?? '',
      )
    }
    return next
  }} onSubmit={async values => {
    try {
      const directory = resolveUserPath(values.dir?.trim() || getCwd())
      const parsed = parseSchedule(values.schedule ?? '')
      if (!parsed.cron) throw new Error(parsed.error ?? 'invalid schedule')
      const id = values.id?.trim() || deriveScheduledTaskId(directory, values.prompt?.trim() ?? '')
      if (task && task.id !== id) await removeScheduledTask(task.id, configPath)
      await saveScheduledTask({ id, cron: parsed.cron, prompt: values.prompt!.trim(), directory, enabled: task?.enabled ?? true, permissionMode: values.permissionMode as ScheduledTask['permissionMode'], runTimeoutMinutes: task?.runTimeoutMinutes ?? 30, maxQueued: task?.maxQueued ?? 1, ...(values.model?.trim() ? { model: values.model.trim() } : {}) }, configPath)
      await onSaved()
    } catch (caught) {
      onDone(`Save failed: ${caught instanceof Error ? caught.message : String(caught)}`)
    }
  }} />
}

function ScheduledDetail({ task, configPath, onBack, onEdit, onDone, refresh }: { task: ScheduledTask; configPath: string; onBack: () => void; onEdit: () => void; onDone: (message: string) => void; refresh: () => Promise<void> }): React.ReactNode {
  const actions = [task.enabled ? 'Disable' : 'Enable', 'Edit', 'Remove', 'Back']
  const [focus, setFocus] = useState(0)
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [confirmFocus, setConfirmFocus] = useState<'cancel' | 'confirm'>('cancel')
  const toggle = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await saveScheduledTask({ ...task, enabled: !task.enabled }, configPath)
      await refresh()
      onDone(`${task.enabled ? 'Disabled' : 'Enabled'} scheduled task '${task.id}'.`)
    } catch (caught) {
      onDone(`Toggle failed: ${caught instanceof Error ? caught.message : String(caught)}`)
    }
  }
  const remove = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await removeScheduledTask(task.id, configPath)
      await refresh()
      onDone(`Removed scheduled task '${task.id}'.`)
    } catch (caught) {
      onDone(`Remove failed: ${caught instanceof Error ? caught.message : String(caught)}`)
    }
  }
  useInput((_input, key) => {
    if (busy) return
    if (confirmRemove) {
      if (key.escape) return setConfirmRemove(false)
      if (key.leftArrow || key.rightArrow || key.upArrow || key.downArrow || key.tab) {
        setConfirmFocus(value => value === 'cancel' ? 'confirm' : 'cancel')
        return
      }
      if (key.return) {
        if (confirmFocus === 'confirm') void remove()
        else setConfirmRemove(false)
      }
      return
    }
    if (key.escape) return onBack()
    if (key.upArrow) return setFocus(value => Math.max(0, value - 1))
    if (key.downArrow) return setFocus(value => Math.min(actions.length - 1, value + 1))
    if (!key.return) return
    const action = actions[focus]
    if (action === 'Back') return onBack()
    if (action === 'Edit') return onEdit()
    if (action === 'Remove') {
      setConfirmFocus('cancel')
      setConfirmRemove(true)
      return
    }
    void toggle()
  })
  if (confirmRemove) {
    return <Box flexDirection="column" paddingX={1}><Text bold color="error">Remove task?</Text><Text dimColor>Delete '{task.id}' from daemon.json. The daemon will stop firing it on its next reconcile.</Text><Text bold={confirmFocus === 'cancel'} color={confirmFocus === 'cancel' ? 'suggestion' : undefined}>{confirmFocus === 'cancel' ? '❯ ' : '  '}No, cancel</Text><Text bold={confirmFocus === 'confirm'} color={confirmFocus === 'confirm' ? 'error' : undefined}>{confirmFocus === 'confirm' ? '❯ ' : '  '}Yes, remove</Text></Box>
  }
  return <Box flexDirection="column" paddingX={1}><Text bold color="permission">{task.id}</Text><Text dimColor>Cron {task.cron} ({cronToHuman(task.cron)})</Text><Text dimColor>Directory {task.directory}</Text><Text dimColor>Prompt {task.prompt}</Text><Text dimColor>Status {task.enabled ? 'enabled' : 'disabled'}</Text><Text dimColor>Mode {task.permissionMode}</Text>{task.model ? <Text dimColor>Model {task.model}</Text> : null}<Text dimColor>Timeout {task.runTimeoutMinutes}m</Text><Text dimColor>Max queue {task.maxQueued}</Text>{actions.map((action, index) => <Text key={action} color={focus === index ? (action === 'Remove' ? 'error' : 'suggestion') : undefined} bold={focus === index}>{focus === index ? '❯' : ' '} {action}</Text>)}</Box>
}

function RemoteForm({ configPath, onBack, onSaved }: { configPath: string; onBack: () => void; onSaved: () => Promise<void> }): React.ReactNode {
  const defaultDir = getCwd()
  const [formValues, setFormValues] = useState({
    dir: defaultDir,
    name: basename(defaultDir),
    spawnMode: 'same-dir',
  })
  const [nameDirty, setNameDirty] = useState(false)
  const [adding, setAdding] = useState(false)
  const [trustDir, setTrustDir] = useState<string | null>(null)
  const [pending, setPending] = useState<{ dir: string; name: string; spawnMode: 'same-dir' | 'worktree' } | null>(null)
  const [trustChoice, setTrustChoice] = useState<'cancel' | 'confirm'>('cancel')
  useInput((_input, key) => {
    if (!trustDir || !pending || adding) return
    if (key.escape) {
      setTrustDir(null)
      setPending(null)
      return
    }
    if (key.leftArrow || key.rightArrow || key.upArrow || key.downArrow || key.tab) {
      setTrustChoice(value => value === 'cancel' ? 'confirm' : 'cancel')
      return
    }
    if (key.return) {
      if (trustChoice === 'cancel') {
        setTrustDir(null)
        setPending(null)
        return
      }
      const item = pending
      setPathTrusted(trustDir)
      setTrustDir(null)
      setPending(null)
      setAdding(true)
      void upsertRemoteControl(item, configPath)
        .then(onSaved)
        .catch(caught => {
          logForDebugging(`remote-control add failed: ${String(caught)}`, {
            level: 'error',
          })
          setAdding(false)
          onBack()
        })
    }
  }, { isActive: trustDir !== null })
  if (trustDir && pending) return <Box flexDirection="column" paddingX={1}><Text bold color="permission">Trust this directory?</Text><Text dimColor>{trustDir} hasn't been trusted yet. Trusting allows Claude to read and execute files there.</Text><Text bold={trustChoice === 'cancel'} color={trustChoice === 'cancel' ? 'suggestion' : undefined}>{trustChoice === 'cancel' ? '❯ ' : '  '}No, go back</Text><Text bold={trustChoice === 'confirm'} color={trustChoice === 'confirm' ? 'permission' : undefined}>{trustChoice === 'confirm' ? '❯ ' : '  '}Yes, trust and add server</Text></Box>
  return <Form title="New Remote Control Server" subtitle="Serve a directory to claude.ai" fields={[{ key: 'dir', label: 'Directory', placeholder: defaultDir, required: true, hint: value => isPathTrusted(resolveUserPath(value.trim() || defaultDir)) ? `Exposed to claude.ai/code via the ${bgSupervisorNoun()}.` : `${resolveUserPath(value.trim() || defaultDir)} is not yet trusted — you'll be asked to trust it on submit.` }, { key: 'name', label: 'Name', hint: () => nameDirty ? 'Shown in the claude.ai session picker.' : 'Auto-generated from the directory name.' }, { key: 'spawnMode', label: 'Spawn mode', options: ['same-dir', 'worktree'], hint: value => value === 'worktree' ? 'Each session gets its own git worktree (requires a git repo).' : 'All sessions share the directory.' }]} initial={formValues} submitLabel="Add server" externalBusyLabel={adding ? 'Adding…' : undefined} onCancel={onBack} onValueChange={(key, value, values) => {
    const next = { ...values, [key]: value }
    if (key === 'name') setNameDirty(true)
    else if (key === 'dir' && !nameDirty) {
      next.name = basename(resolveUserPath(value.trim() || defaultDir))
    }
    setFormValues(next as typeof formValues)
    return next
  }} onSubmit={async values => {
    if (adding) return
    const dir = resolveUserPath(values.dir?.trim() || defaultDir)
    const item = { dir, name: values.name?.trim() || basename(dir), spawnMode: (values.spawnMode ?? 'same-dir') as 'same-dir' | 'worktree' }
    if (!isPathTrusted(dir)) {
      setTrustChoice('cancel')
      setTrustDir(dir)
      setPending(item)
      return
    }
    setAdding(true)
    try {
      await upsertRemoteControl(item, configPath)
      await onSaved()
    } catch (caught) {
      logForDebugging(`remote-control add failed: ${String(caught)}`, {
        level: 'error',
      })
      setAdding(false)
      onBack()
    }
  }} />
}

function RemoteDetail({ server, configPath, isRunning, onBack, refresh, onDone }: { server: RemoteControlConfig; configPath: string; isRunning: boolean; onBack: () => void; refresh: () => Promise<void>; onDone: (message: string) => void }): React.ReactNode {
  const actions = ['Restart daemon', 'Remove', 'Back']
  const [focus, setFocus] = useState(0)
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [confirmFocus, setConfirmFocus] = useState<'cancel' | 'confirm'>('cancel')
  const act = async (action: 'restart' | 'remove'): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      if (action === 'remove') {
        await removeRemoteControl(server.dir, configPath)
        await refresh()
        onDone(`Removed remote-control server for ${server.dir}.`)
      } else {
        onDone('The background server picks up config changes automatically — no restart needed.')
      }
    } catch (caught) {
      onDone(`Action failed: ${caught instanceof Error ? caught.message : String(caught)}`)
    }
  }
  useInput((_input, key) => {
    if (busy) return
    if (confirmRemove) {
      if (key.escape) return setConfirmRemove(false)
      if (key.leftArrow || key.rightArrow || key.upArrow || key.downArrow || key.tab) {
        setConfirmFocus(value => value === 'cancel' ? 'confirm' : 'cancel')
        return
      }
      if (key.return) {
        if (confirmFocus === 'confirm') void act('remove')
        else setConfirmRemove(false)
      }
      return
    }
    if (key.escape) return onBack()
    if (key.upArrow) return setFocus(value => Math.max(0, value - 1))
    if (key.downArrow) return setFocus(value => Math.min(actions.length - 1, value + 1))
    if (!key.return) return
    if (focus === 2) return onBack()
    if (focus === 0) return void act('restart')
    setConfirmFocus('cancel')
    setConfirmRemove(true)
  })
  if (confirmRemove) {
    return <Box flexDirection="column" paddingX={1}><Text bold color="error">Remove server?</Text><Text dimColor>Stop serving {server.dir} to claude.ai. The {bgSupervisorNoun()} will stop the worker on its next reconcile.</Text><Text bold={confirmFocus === 'cancel'} color={confirmFocus === 'cancel' ? 'suggestion' : undefined}>{confirmFocus === 'cancel' ? '❯ ' : '  '}No, cancel</Text><Text bold={confirmFocus === 'confirm'} color={confirmFocus === 'confirm' ? 'error' : undefined}>{confirmFocus === 'confirm' ? '❯ ' : '  '}Yes, remove</Text></Box>
  }
  return <Box flexDirection="column" paddingX={1}><Text bold color="permission">{server.name ?? basename(server.dir)}</Text><Text dimColor>Directory {server.dir}</Text><Text dimColor>Spawn mode {server.spawnMode ?? 'same-dir'}</Text><Text dimColor>Status     {isRunning ? 'running' : 'not running'}</Text>{actions.map((action, index) => <Text key={action} color={focus === index ? (action === 'Remove' ? 'error' : 'suggestion') : undefined} bold={focus === index}>{focus === index ? '❯' : ' '} {action}</Text>)}</Box>
}

/** Source-authored assistant installer screen retained behind the target build gate. */
export function AssistantInstallForm({ configPath = getDefaultDaemonConfigPath(), defaultDir = getCwd(), onBack, onSaved }: { configPath?: string; defaultDir?: string; onBack: () => void; onSaved: () => Promise<void> }): React.ReactNode {
  return <Form title="New Assistant" subtitle="Install a daemonized assistant" fields={[{ key: 'dir', label: 'Directory', placeholder: defaultDir, required: true, hint: () => 'Install into a new, empty directory.' }, { key: 'name', label: 'Name', placeholder: 'auto', hint: () => 'Shown in the mobile app and other Claude surfaces.' }, { key: 'permissionMode', label: 'Permission mode', options: ['dontAsk', 'auto', 'default', 'acceptEdits', 'plan', 'bypassPermissions'] }, { key: 'model', label: 'Model', placeholder: 'default' }]} initial={{ dir: defaultDir, name: '', permissionMode: 'auto', model: '' }} submitLabel="Install" onCancel={onBack} onSubmit={async values => {
    const dir = resolveUserPath(values.dir?.trim() || defaultDir)
    if (!isPathTrusted(dir)) throw new Error(`${dir} is not a trusted directory. Run \`claude\` there once and accept the trust dialog, then retry.`)
    const name = values.name?.trim() || basename(dir)
    await installAssistant(dir, { permissionMode: values.permissionMode ?? 'auto', assistantName: name, model: values.model?.trim() || null })
    await upsertAssistant(dir, configPath, name)
    logEvent('tengu_assistant_install', {
      interactive: true,
      permission_mode: values.permissionMode ?? 'auto',
    })
    await onSaved()
  }} />
}

export function DaemonHub({ initialData, configPath, onDone }: { initialData: HubData; configPath: string; onDone: (message?: string) => void }): React.ReactNode {
  const [data, setData] = useState(initialData)
  const [tab, setTab] = useState<HubTab>('scheduled')
  const [screen, setScreen] = useState<Screen>({ type: 'hub' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const refresh = async () => setData(await loadDaemonHubData(configPath))
  useEffect(() => {
    if (screen.type !== 'hub') return
    let ticks = 0
    const timer = setInterval(() => {
      ticks++
      if (ticks % 2 === 0) void refresh()
    }, 1000)
    return () => clearInterval(timer)
  }, [screen.type, configPath])
  const back = () => { void refresh(); setScreen({ type: 'hub' }) }
  if (screen.type === 'scheduled-form') return <ScheduledForm task={screen.task} existingIds={data.tasks.map(task => task.id)} configPath={configPath} onBack={back} onDone={text => onDone(text)} onSaved={async () => { await refresh(); setScreen({ type: 'hub' }) }} />
  if (screen.type === 'scheduled-detail') return <ScheduledDetail task={screen.task} configPath={configPath} onBack={back} onEdit={() => setScreen({ type: 'scheduled-form', task: screen.task })} onDone={text => onDone(text)} refresh={refresh} />
  if (screen.type === 'remote-form') return <RemoteForm configPath={configPath} onBack={back} onSaved={async () => { await refresh(); setScreen({ type: 'hub' }) }} />
  if (screen.type === 'remote-detail') {
    return <RemoteDetail server={screen.server} configPath={configPath} isRunning={Boolean(data.lock)} onBack={back} refresh={refresh} onDone={text => onDone(text)} />
  }
  if (screen.type === 'assistant-form') return <AssistantInstallForm configPath={configPath} onBack={back} onSaved={async () => { await refresh(); setScreen({ type: 'hub' }) }} />
  const performService = async (action: 'install' | 'uninstall' | 'start' | 'stop' | 'restart') => {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      const result = action === 'install'
        ? await installDaemonService({ jsonPath: configPath, logPath: getDefaultDaemonLogPath() })
        : action === 'uninstall'
          ? await uninstallDaemonService()
          : await controlDaemonService(action)
      if (!result.ok) setMessage(`${action} failed: ${result.error}`)
      await refresh()
    } finally { setBusy(false) }
  }
  return <HubList data={data} tab={tab} setTab={setTab} onScreen={setScreen} onDone={() => onDone()} onService={action => void performService(action)} busy={busy} message={message} />
}

export async function renderDaemonHubStandalone(
  configPath = getDefaultDaemonConfigPath(),
): Promise<void> {
  const initialData = await loadDaemonHubData(configPath)
  process.stdout.write(clearTerminal)
  const root = await createRoot(getBaseRenderOptions(false))
  await new Promise<void>(resolveDone => {
    root.render(<DaemonHub initialData={initialData} configPath={configPath} onDone={message => { if (message) process.stdout.write(`${message}\n`); resolveDone() }} />)
  })
  root.unmount()
}

export const daemonHubAssistantMutations = {
  installAssistant,
  upsertAssistant,
  removeAssistant,
}
