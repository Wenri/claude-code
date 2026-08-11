import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useAppStateStore } from '../state/AppState.js'
import {
  getAgentKeepaliveReasons,
  isLocalAgentTask,
} from '../tasks/LocalAgentTask/LocalAgentTask.js'
import type { QueuedCommand } from '../types/textInputTypes.js'
import { logForDebugging } from '../utils/debug.js'
import { logError } from '../utils/log.js'
import {
  getCommandQueueSnapshot,
  remove,
  subscribeToCommandQueue,
} from '../utils/messageQueueManager.js'

const WAKE_DISPATCH_TIMEOUT_MS = 60_000

type WakeDispatch = {
  agentId: string
  prompt: string
  consumedCommands: QueuedCommand[]
}

/**
 * Select task notifications that belong to completed local agents which are
 * parked by a keepalive (for example a monitor). These agents need another
 * turn so the notification can be observed before their keepalive releases.
 */
export function selectWakeDispatches(
  commands: readonly QueuedCommand[],
  tasks: ReturnType<ReturnType<typeof useAppStateStore>['getState']>['tasks'],
): WakeDispatch[] {
  if (!tasks || commands.length === 0) return []

  const eligibleTasks = new Map<string, unknown>()
  const groupedCommands = new Map<string, QueuedCommand[]>()

  for (const command of commands) {
    if (!command.agentId || command.mode !== 'task-notification') continue

    let task = eligibleTasks.get(command.agentId)
    if (!task) {
      const candidate = tasks[command.agentId]
      if (
        !isLocalAgentTask(candidate) ||
        candidate.status !== 'completed' ||
        candidate.retain ||
        getAgentKeepaliveReasons(candidate).size === 0
      ) {
        continue
      }
      task = candidate
      eligibleTasks.set(command.agentId, task)
    }

    const group = groupedCommands.get(command.agentId) ?? []
    group.push(command)
    groupedCommands.set(command.agentId, group)
  }

  return Array.from(groupedCommands, ([agentId, consumedCommands]) => ({
    agentId,
    prompt: consumedCommands
      .map(command =>
        typeof command.value === 'string' ? command.value : '',
      )
      .filter(Boolean)
      .join('\n\n'),
    consumedCommands,
  }))
}

function releaseTimedOutDispatch({
  agentId,
  inFlight,
}: {
  agentId: string
  inFlight: Set<string>
}): void {
  logForDebugging(
    `[wakeRouter] dispatch for ${agentId} exceeded ${WAKE_DISPATCH_TIMEOUT_MS}ms; releasing inFlight reservation`,
    { level: 'warn' },
  )
  inFlight.delete(agentId)
}

export function useWakeRouter(
  dispatch: (agentId: string, prompt: string) => Promise<unknown>,
): void {
  const store = useAppStateStore()
  const commands = useSyncExternalStore(
    subscribeToCommandQueue,
    getCommandQueueSnapshot,
  )
  const inFlight = useRef(new Set<string>())

  useEffect(() => {
    if (commands.length === 0) return

    const candidates = selectWakeDispatches(commands, store.getState().tasks)
    if (candidates.length === 0) return

    const consumed: QueuedCommand[] = []
    const selected: WakeDispatch[] = []
    for (const candidate of candidates) {
      if (inFlight.current.has(candidate.agentId)) continue
      inFlight.current.add(candidate.agentId)
      consumed.push(...candidate.consumedCommands)
      selected.push(candidate)
    }

    if (consumed.length > 0) remove(consumed)

    const reservations = inFlight.current
    for (const candidate of selected) {
      const timeout = setTimeout(
        releaseTimedOutDispatch,
        WAKE_DISPATCH_TIMEOUT_MS,
        { agentId: candidate.agentId, inFlight: reservations },
      )
      dispatch(candidate.agentId, candidate.prompt)
        .catch(logError)
        .finally(() => {
          clearTimeout(timeout)
          reservations.delete(candidate.agentId)
        })
    }
  }, [commands, store, dispatch])
}
