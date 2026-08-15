import figures from 'figures'
import * as React from 'react'
import { useEffect, useMemo, useState } from 'react'
import stripAnsi from 'strip-ansi'
import type { KeyboardEvent } from '../../ink/events/keyboard-event.js'
import { Box, Text } from '../../ink.js'
import { useAppState, useSetAppState } from '../../state/AppState.js'
import { enterTeammateView } from '../../state/teammateViewHelpers.js'
import type { LocalAgentTaskState } from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import { formatDuration, formatTokens } from '../../utils/format.js'
import { truncateToWidth } from '../../utils/truncate.js'
import { StatusIcon } from '../design-system/StatusIcon.js'
import { useTabHeaderFocus } from '../design-system/Tabs.js'

type Props = {
  onExit: () => void
}

function isActiveAgent(task: LocalAgentTaskState): boolean {
  return (
    task.agentType !== 'main-session' &&
    task.status !== 'completed' &&
    task.status !== 'failed' &&
    task.status !== 'killed'
  )
}

function isCompletedAgent(task: LocalAgentTaskState): boolean {
  return (
    task.agentType !== 'main-session' &&
    (task.status === 'completed' ||
      task.status === 'failed' ||
      task.status === 'killed')
  )
}

function taskSummary(task: LocalAgentTaskState): string {
  const first = task.result?.content?.[0]
  const resultText =
    first && typeof first === 'object' && 'text' in first
      ? String(first.text)
      : undefined
  return truncateToWidth(
    stripAnsi(resultText ?? task.error ?? task.description),
    60,
  )
}

export function RunningAgents({ onExit }: Props): React.ReactNode {
  const tasks = useAppState(state => state.tasks)
  const agentNameRegistry = useAppState(state => state.agentNameRegistry)
  const setAppState = useSetAppState()
  const { headerFocused, focusHeader } = useTabHeaderFocus()
  const [selectedTaskId, setSelectedTaskId] = useState<string>()
  const [, forceDurationRefresh] = useState(0)

  const namesByTaskId = useMemo(() => {
    const result = new Map<string, string>()
    for (const [name, taskId] of agentNameRegistry) {
      result.set(taskId, name)
    }
    return result
  }, [agentNameRegistry])

  const agentTasks = Object.values(tasks).filter(
    (task): task is LocalAgentTaskState => task.type === 'local_agent',
  )
  const running = agentTasks
    .filter(isActiveAgent)
    .sort((a, b) => a.startTime - b.startTime)
  const recentlyCompleted = agentTasks
    .filter(isCompletedAgent)
    .sort((a, b) => (b.endTime ?? 0) - (a.endTime ?? 0))
    .slice(0, 5)
  const displayed = [...running, ...recentlyCompleted]
  const selectedIndex = displayed.findIndex(task => task.id === selectedTaskId)
  const selectedTask =
    selectedIndex >= 0
      ? displayed[selectedIndex]
      : selectedTaskId === undefined
        ? displayed[0]
        : undefined

  useEffect(() => {
    if (running.length === 0) return
    const timer = setInterval(() => forceDurationRefresh(value => value + 1), 1000)
    return () => clearInterval(timer)
  }, [running.length])

  useEffect(() => {
    if (selectedTask && selectedTask.id !== selectedTaskId) {
      setSelectedTaskId(selectedTask.id)
    }
  }, [selectedTask, selectedTaskId])

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (headerFocused) return
    if (selectedTaskId !== undefined && selectedIndex < 0) {
      if (event.key === 'up' || event.key === 'down') {
        event.preventDefault()
        setSelectedTaskId(displayed[0]?.id)
      }
      return
    }

    const index = selectedIndex < 0 ? 0 : selectedIndex
    if (event.key === 'up') {
      event.preventDefault()
      if (index === 0 || displayed.length === 0) focusHeader()
      else setSelectedTaskId(displayed[index - 1]?.id)
      return
    }
    if (event.key === 'down') {
      event.preventDefault()
      setSelectedTaskId(displayed[Math.min(index + 1, displayed.length - 1)]?.id)
      return
    }
    if (!selectedTask) return
    if (event.key === 'return') {
      event.preventDefault()
      enterTeammateView(selectedTask.id, setAppState)
      onExit()
      return
    }
    if (event.key === 'x' && selectedTask.status === 'running') {
      event.preventDefault()
      selectedTask.abortController?.abort()
    }
  }

  const renderRunning = (task: LocalAgentTaskState): React.ReactNode => {
    const selected = task.id === selectedTask?.id && !headerFocused
    const name = namesByTaskId.get(task.id)
    const summary = truncateToWidth(
      task.progress?.summary || task.description,
      50,
    )
    const duration = formatDuration(
      Math.max(0, Date.now() - task.startTime - (task.totalPausedMs ?? 0)),
    )
    const tokens = task.progress?.tokenCount
    return (
      <Box key={task.id}>
        <Text color={selected ? 'suggestion' : undefined}>
          {selected ? `${figures.pointer} ` : '  '}
          <Text color="success">{figures.squareSmallFilled}</Text>{' '}
          <Text bold>{name || task.agentType}</Text>
          {name && <Text dimColor> · {task.agentType}</Text>}
          <Text dimColor> · {summary}</Text>
          <Text dimColor> · {duration}</Text>
          {tokens !== undefined && tokens > 0 && (
            <Text dimColor> · {formatTokens(tokens)} tokens</Text>
          )}
          {selected && <Text dimColor> · x to stop</Text>}
        </Text>
      </Box>
    )
  }

  const renderCompleted = (task: LocalAgentTaskState): React.ReactNode => {
    const selected = task.id === selectedTask?.id && !headerFocused
    const name = namesByTaskId.get(task.id)
    return (
      <Box key={task.id}>
        <Text color={selected ? 'suggestion' : undefined} dimColor={!selected}>
          {selected ? `${figures.pointer} ` : '  '}
          <StatusIcon
            status={task.status === 'completed' ? 'success' : 'error'}
            withSpace
          />
          <Text bold>{name || task.agentType}</Text>
          <Text dimColor> · {taskSummary(task)}</Text>
        </Text>
      </Box>
    )
  }

  return (
    <Box
      flexDirection="column"
      tabIndex={0}
      autoFocus
      onKeyDown={handleKeyDown}
    >
      {displayed.length === 0 && (
        <Text dimColor>No subagents are currently running.</Text>
      )}
      {running.map(renderRunning)}
      {recentlyCompleted.length > 0 && (
        <>
          <Box marginTop={running.length > 0 ? 1 : 0}>
            <Text bold dimColor>
              Recently completed
            </Text>
          </Box>
          {recentlyCompleted.map(renderCompleted)}
        </>
      )}
    </Box>
  )
}
