import { useEffect, useRef } from 'react'
import {
  getPanelAgentTasks,
} from '../components/CoordinatorAgentStatus.js'
import { useTerminalSize } from './useTerminalSize.js'
import {
  useAppState,
  useAppStateStore,
  useSetAppState,
} from '../state/AppState.js'
import { logForDebugging } from '../utils/debug.js'
import {
  executeSubagentStatusLine,
  updateSubagentTokenSamples,
  type SubagentTaskDecorations,
} from '../utils/subagentStatusLine.js'

export const SUBAGENT_STATUS_LINE_INITIAL_DELAY_MS = 300
export const SUBAGENT_STATUS_LINE_REFRESH_MS = 5_000
export const SUBAGENT_STATUS_LINE_INDENT_COLUMNS = 4

export function areTaskDecorationsEqual(
  left: SubagentTaskDecorations,
  right: SubagentTaskDecorations,
): boolean {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  for (const key of leftKeys) {
    if (left[key]?.content !== right[key]?.content) return false
  }
  return true
}

/** Keep AppState task decorations synchronized with the configured command. */
export function useSubagentStatusLine(): void {
  const store = useAppStateStore()
  const setAppState = useSetAppState()
  const enabled = useAppState(
    state => state.settings?.subagentStatusLine?.command !== undefined,
  )
  const taskCount = useAppState(state =>
    enabled ? getPanelAgentTasks(state.tasks).length : 0,
  )
  const { columns } = useTerminalSize()
  const runningRef = useRef(false)
  const tokenSamplesRef = useRef(new Map<string, number[]>())

  useEffect(() => {
    if (!enabled) {
      setAppState(state =>
        Object.keys(state.taskDecorations).length === 0
          ? state
          : { ...state, taskDecorations: {} },
      )
      return
    }

    let cancelled = false
    const tick = () => {
      if (runningRef.current) return
      const state = store.getState()
      const tasks = getPanelAgentTasks(state.tasks)
      updateSubagentTokenSamples(
        tokenSamplesRef.current,
        tasks.map(task => ({
          id: task.id,
          tokenCount: task.progress?.tokenCount ?? 0,
        })),
      )

      if (tasks.length === 0) {
        setAppState(current =>
          Object.keys(current.taskDecorations).length === 0
            ? current
            : { ...current, taskDecorations: {} },
        )
        return
      }

      runningRef.current = true
      const namesByTaskId = new Map<string, string>()
      for (const [name, taskId] of state.agentNameRegistry) {
        namesByTaskId.set(taskId, name)
      }

      executeSubagentStatusLine(
        tasks,
        Math.max(0, columns - SUBAGENT_STATUS_LINE_INDENT_COLUMNS),
        namesByTaskId,
        tokenSamplesRef.current,
      )
        .then(decorations => {
          if (cancelled) return
          setAppState(current => {
            const currentTaskIds = new Set(tasks.map(task => task.id))
            const filtered: SubagentTaskDecorations = {}
            for (const [taskId, decoration] of Object.entries(decorations)) {
              if (currentTaskIds.has(taskId)) filtered[taskId] = decoration
            }
            return areTaskDecorationsEqual(
              current.taskDecorations,
              filtered,
            )
              ? current
              : { ...current, taskDecorations: filtered }
          })
        })
        .catch(error => {
          logForDebugging(`subagentStatusLine tick failed: ${error}`, {
            level: 'error',
          })
        })
        .finally(() => {
          runningRef.current = false
          if (getPanelAgentTasks(store.getState().tasks).length === 0) tick()
        })
    }

    if (taskCount === 0) {
      tick()
      return
    }
    const initialTimer = setTimeout(
      tick,
      SUBAGENT_STATUS_LINE_INITIAL_DELAY_MS,
    )
    const interval = setInterval(tick, SUBAGENT_STATUS_LINE_REFRESH_MS)
    return () => {
      cancelled = true
      clearTimeout(initialTimer)
      clearInterval(interval)
    }
  }, [enabled, taskCount, columns, store, setAppState])
}
