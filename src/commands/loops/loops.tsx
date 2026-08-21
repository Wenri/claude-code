import figures from 'figures'
import * as React from 'react'
import { useState } from 'react'
import TextInput from '../../components/TextInput.js'
import { Byline } from '../../components/design-system/Byline.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { KeyboardShortcutHint } from '../../components/design-system/KeyboardShortcutHint.js'
import { ListItem } from '../../components/design-system/ListItem.js'
import { getSessionId } from '../../bootstrap/state.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import type { KeyboardEvent } from '../../ink/events/keyboard-event.js'
import { Box, Text } from '../../ink.js'
import { useKeybindings } from '../../keybindings/useKeybinding.js'
import { logEvent } from '../../services/analytics/index.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import { cronToHuman, parseCronExpression } from '../../utils/cron.js'
import {
  addCronTask,
  listAllCronTasks,
  removeCronTasks,
} from '../../utils/cronTasks.js'
import { getSessionHooks } from '../../utils/hooks/sessionHooks.js'
import type { HookCommand } from '../../utils/settings/types.js'

const MAX_LOOP_LABEL_LENGTH = 50
const INTERVAL_PATTERN = /^(\d+)([smhd])$/i

type CronLoop = {
  kind: 'cron'
  id: string
  cron: string
  human: string
  prompt: string
}

type StopHookLoop = {
  kind: 'stophook'
  id: string
  condition: string
}

type Loop = CronLoop | StopHookLoop

type NewLoop =
  | { kind: 'cron'; interval: string; prompt: string }
  | { kind: 'stophook'; condition: string }

function truncateLoopLabel(value: string): string {
  return value.length > MAX_LOOP_LABEL_LENGTH
    ? `${value.slice(0, MAX_LOOP_LABEL_LENGTH - 1)}…`
    : value
}

function toggleField(field: 'interval' | 'text'): 'interval' | 'text' {
  return field === 'interval' ? 'text' : 'interval'
}

function LoopRow({ loop, focused }: { loop: Loop; focused: boolean }) {
  if (loop.kind === 'cron') {
    return (
      <ListItem isFocused={focused}>
        <Text>
          <Text bold>{loop.human}</Text>
          <Text dimColor> · </Text>
          {truncateLoopLabel(loop.prompt)}
          <Text dimColor> · {loop.id}</Text>
        </Text>
      </ListItem>
    )
  }

  return (
    <ListItem isFocused={focused}>
      <Text>
        until <Text bold>{truncateLoopLabel(loop.condition)}</Text>
        <Text dimColor> · stop-hook</Text>
      </Text>
    </ListItem>
  )
}

function LoopsDialog({
  loops,
  onDelete,
  onCreate,
  onCancel,
}: {
  loops: Loop[]
  onDelete: (loop: Loop) => void
  onCreate: (loop: NewLoop) => void
  onCancel: () => void
}): React.ReactNode {
  const [view, setView] = useState<'list' | 'create'>('list')
  const [selected, setSelected] = useState(0)
  const [mode, setMode] = useState<'every' | 'until'>('every')
  const [interval, setInterval] = useState('10m')
  const [intervalCursor, setIntervalCursor] = useState(3)
  const [text, setText] = useState('')
  const [textCursor, setTextCursor] = useState(0)
  const [field, setField] = useState<'interval' | 'text'>(
    mode === 'every' ? 'interval' : 'text',
  )
  const { columns } = useTerminalSize()

  useKeybindings(
    {
      'select:previous': () =>
        setSelected(value => (loops.length ? Math.max(0, value - 1) : 0)),
      'select:next': () =>
        setSelected(value =>
          loops.length ? Math.min(loops.length - 1, value + 1) : 0,
        ),
    },
    { context: 'Select', isActive: view === 'list' },
  )

  const handleListKeyDown = (event: KeyboardEvent): void => {
    if (view !== 'list') return
    if (event.key === 'escape') {
      event.preventDefault()
      onCancel()
      return
    }
    if (event.key === 'd' && loops[selected]) {
      event.preventDefault()
      onDelete(loops[selected])
      setSelected(value =>
        Math.max(0, Math.min(value, loops.length - 2)),
      )
      return
    }
    if (event.key === 'n') {
      event.preventDefault()
      setView('create')
      setField(mode === 'every' ? 'interval' : 'text')
    }
  }

  const switchMode = (): void => {
    const next = mode === 'every' ? 'until' : 'every'
    setMode(next)
    setField(next === 'every' ? 'interval' : 'text')
  }

  const handleCreateKeyDown = (event: KeyboardEvent): void => {
    if (view !== 'create') return
    if (event.key === 'escape') {
      event.preventDefault()
      setView('list')
      return
    }
    if (event.key === 'tab') {
      event.preventDefault()
      switchMode()
      return
    }
    const cursor = field === 'interval' ? intervalCursor : textCursor
    const length = field === 'interval' ? interval.length : text.length
    if (
      (event.key === 'left' && cursor === 0) ||
      (event.key === 'right' && cursor >= length)
    ) {
      event.preventDefault()
      switchMode()
      return
    }
    if (mode === 'every' && (event.key === 'down' || event.key === 'up')) {
      event.preventDefault()
      setField(toggleField)
    }
  }

  const create = (): void => {
    const prompt = text.trim()
    if (mode === 'every') {
      if (!interval.trim() || !prompt) return
      onCreate({ kind: 'cron', interval: interval.trim(), prompt })
      return
    }
    if (prompt) onCreate({ kind: 'stophook', condition: prompt })
  }

  const listGuide = () => (
    <Byline>
      {loops.length > 0 && (
        <KeyboardShortcutHint chord={['up', 'down']} action="select" />
      )}
      {loops.length > 0 && (
        <KeyboardShortcutHint chord="d" action="delete" />
      )}
      <KeyboardShortcutHint chord="n" action="new" />
      <KeyboardShortcutHint chord="escape" action="close" />
    </Byline>
  )

  const createGuide = () => (
    <Byline>
      <KeyboardShortcutHint chord="tab" action="switch mode" />
      {mode === 'every' && (
        <KeyboardShortcutHint chord={['up', 'down']} action="next field" />
      )}
      <KeyboardShortcutHint chord="enter" action="create" />
      <KeyboardShortcutHint chord="escape" action="back" />
    </Byline>
  )

  const createContent = (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        <Text dimColor={mode !== 'every'}>
          {mode === 'every' ? figures.radioOn : figures.radioOff} every
        </Text>
        <Text dimColor>  </Text>
        <Text dimColor={mode !== 'until'}>
          {mode === 'until' ? figures.radioOn : figures.radioOff} until
        </Text>
      </Text>
      {mode === 'every' && (
        <Box flexDirection="row" gap={1} marginTop={1}>
          <Text dimColor={field !== 'interval'}>Interval &gt;</Text>
          <TextInput
            value={interval}
            onChange={setInterval}
            onSubmit={() => setField('text')}
            focus={field === 'interval'}
            showCursor={field === 'interval'}
            multiline={false}
            columns={12}
            cursorOffset={intervalCursor}
            onChangeCursorOffset={setIntervalCursor}
            placeholder="10m"
            disableEscapeDoublePress
          />
        </Box>
      )}
      <Box flexDirection="row" gap={1} marginTop={1}>
        <Text dimColor={mode === 'every' && field !== 'text'}>
          {mode === 'every' ? 'Prompt   >' : 'Condition>'}
        </Text>
        <TextInput
          value={text}
          onChange={setText}
          onSubmit={create}
          focus={mode === 'until' || field === 'text'}
          showCursor={mode === 'until' || field === 'text'}
          multiline={false}
          columns={columns - 16}
          cursorOffset={textCursor}
          onChangeCursorOffset={setTextCursor}
          placeholder={
            mode === 'every'
              ? 'e.g. /babysit-prs'
              : 'e.g. tests pass and PR is merged'
          }
          disableEscapeDoublePress
        />
      </Box>
    </Box>
  )

  const listContent = (
    <Box flexDirection="column" marginTop={1}>
      {loops.length === 0 ? (
        <Text dimColor>No active loops</Text>
      ) : (
        loops.map((loop, index) => (
          <LoopRow key={loop.id} loop={loop} focused={index === selected} />
        ))
      )}
    </Box>
  )

  const keyHandler = view === 'list' ? handleListKeyDown : handleCreateKeyDown
  return (
    <Box
      flexDirection="column"
      tabIndex={0}
      autoFocus
      onKeyDown={keyHandler}
    >
      <Dialog
        title={view === 'list' ? 'Loops' : 'New loop'}
        subtitle={
          view === 'list'
            ? 'Recurring crons and stop-hooks active for this session'
            : undefined
        }
        color="permission"
        onCancel={view === 'list' ? onCancel : () => setView('list')}
        isCancelActive={false}
        inputGuide={view === 'list' ? listGuide : createGuide}
      >
        {view === 'list' ? listContent : createContent}
      </Dialog>
    </Box>
  )
}

export function intervalToCron(value: string): string | null {
  const match = value.match(INTERVAL_PATTERN)
  if (!match) return null
  const amount = parseInt(match[1]!, 10)
  if (amount < 1) return null

  let cron: string
  switch (match[2]!.toLowerCase()) {
    case 's':
      cron = `*/${Math.max(1, Math.ceil(amount / 60))} * * * *`
      break
    case 'm':
      cron =
        amount <= 59
          ? `*/${amount} * * * *`
          : `0 */${Math.round(amount / 60)} * * *`
      break
    case 'h':
      if (amount > 23) return null
      cron = `0 */${amount} * * *`
      break
    case 'd':
      if (amount > 31) return null
      cron = `0 0 */${amount} * *`
      break
    default:
      return null
  }
  return parseCronExpression(cron) ? cron : null
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
): Promise<React.ReactNode> {
  logEvent('tengu_loops_command', {})
  const sessionHooksRegistry = context.sessionHooksRegistry
  if (!sessionHooksRegistry) {
    throw new Error('Session hooks registry is unavailable')
  }
  const sessionId = getSessionId()
  const cronTasks = await listAllCronTasks()
  const stopMatchers =
    getSessionHooks(context.getAppState(), sessionId, 'Stop').get('Stop') ?? []
  const stopHooks: HookCommand[] = []
  for (const matcher of stopMatchers) {
    if (matcher.matcher !== '') continue
    for (const hook of matcher.hooks) {
      if (hook.type === 'prompt') stopHooks.push(hook)
    }
  }

  const loops: Loop[] = [
    ...cronTasks.map(task => ({
      kind: 'cron' as const,
      id: task.id,
      cron: task.cron,
      human: cronToHuman(task.cron),
      prompt: task.prompt,
    })),
    ...stopHooks.map((hook, index) => ({
      kind: 'stophook' as const,
      id: `stophook-${index}`,
      condition: hook.prompt,
    })),
  ]

  async function deleteLoop(loop: Loop): Promise<void> {
    if (loop.kind === 'cron') {
      try {
        await removeCronTasks([loop.id])
        onDone(`Loop ${loop.id} deleted`, { display: 'system' })
      } catch (error) {
        onDone(`Failed to delete loop ${loop.id}: ${error}`, {
          display: 'system',
        })
      }
      return
    }
    const hook = stopHooks.find(candidate => candidate.prompt === loop.condition)
    if (hook) {
      sessionHooksRegistry.remove(sessionId, 'Stop', hook)
      onDone('Stop hook cleared', { display: 'system' })
    } else {
      onDone('Stop hook not found', { display: 'system' })
    }
  }

  async function createLoop(loop: NewLoop): Promise<void> {
    if (loop.kind === 'cron') {
      const cron = intervalToCron(loop.interval)
      if (!cron) {
        onDone(`Invalid interval: ${loop.interval}`, { display: 'system' })
        return
      }
      const id = await addCronTask(cron, loop.prompt, true, false)
      onDone(`Loop ${id} created (${cronToHuman(cron)})`, {
        display: 'system',
      })
      return
    }
    for (const hook of stopHooks) {
      sessionHooksRegistry.remove(sessionId, 'Stop', hook)
    }
    sessionHooksRegistry.add(sessionId, 'Stop', '', {
      type: 'prompt',
      prompt: loop.condition,
    })
    logEvent('tengu_stop_hook_added', {
      promptLength: loop.condition.length,
    })
    onDone('Stop hook set', { display: 'system' })
  }

  return (
    <LoopsDialog
      loops={loops}
      onDelete={loop => void deleteLoop(loop)}
      onCreate={loop => void createLoop(loop)}
      onCancel={() => onDone('', { display: 'skip' })}
    />
  )
}
