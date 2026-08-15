import chalk from 'chalk'
import figures from 'figures'
import * as React from 'react'
import { useEffect, useMemo, useState } from 'react'
import type { SettingSource } from 'src/utils/settings/constants.js'
import { useExitOnCtrlCDWithKeybindings } from '../../hooks/useExitOnCtrlCDWithKeybindings.js'
import { useMergedTools } from '../../hooks/useMergedTools.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import type { KeyboardEvent } from '../../ink/events/keyboard-event.js'
import { Box, Text } from '../../ink.js'
import { useKeybinding } from '../../keybindings/useKeybinding.js'
import { useAppState, useSetAppState } from '../../state/AppState.js'
import { enterTeammateView } from '../../state/teammateViewHelpers.js'
import type { LocalAgentTaskState } from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import type { Tools, ToolUseContext } from '../../Tool.js'
import {
  type ResolvedAgent,
  resolveAgentOverrides,
} from '../../tools/AgentTool/agentDisplay.js'
import {
  type AgentDefinition,
  getActiveAgentsFromList,
} from '../../tools/AgentTool/loadAgentsDir.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import { toError } from '../../utils/errors.js'
import { formatDuration, formatNumber, truncateToWidth } from '../../utils/format.js'
import { logError } from '../../utils/log.js'
import { Select } from '../CustomSelect/select.js'
import TextInput from '../TextInput.js'
import { Dialog } from '../design-system/Dialog.js'
import { Pane } from '../design-system/Pane.js'
import { StatusIcon } from '../design-system/StatusIcon.js'
import {
  Tab,
  Tabs,
  useTabHeaderFocus,
} from '../design-system/Tabs.js'
import { BackgroundTasksDialog } from '../tasks/BackgroundTasksDialog.js'
import { AgentDetail } from './AgentDetail.js'
import { AgentEditor } from './AgentEditor.js'
import { AgentsList } from './AgentsList.js'
import { deleteAgentFromFile } from './agentFileUtils.js'
import { CreateAgentWizard } from './new-agent-creation/CreateAgentWizard.js'
import type { ModeState } from './types.js'

type Props = {
  tools: Tools
  onExit: LocalJSXCommandOnDone
  toolUseContext: ToolUseContext
}

function isRunningAgent(task: LocalAgentTaskState): boolean {
  return (
    task.type === 'local_agent' &&
    task.agentType !== 'main-session' &&
    task.status !== 'completed' &&
    task.status !== 'failed' &&
    task.status !== 'killed'
  )
}

function isRecentlyCompletedAgent(task: LocalAgentTaskState): boolean {
  return (
    task.type === 'local_agent' &&
    task.agentType !== 'main-session' &&
    (task.status === 'completed' ||
      task.status === 'failed' ||
      task.status === 'killed')
  )
}

function taskResultSummary(task: LocalAgentTaskState): string {
  const value =
    task.result?.content?.[0]?.text ?? task.error ?? task.description
  return truncateToWidth(String(value).split('\n')[0] ?? '', 60)
}

function RunningAgentRow({
  task,
  name,
  selected,
}: {
  task: LocalAgentTaskState
  name?: string
  selected: boolean
}): React.ReactNode {
  const summary = truncateToWidth(
    task.progress?.summary || task.description,
    50,
  )
  const elapsed = formatDuration(
    Math.max(0, Date.now() - task.startTime - (task.totalPausedMs ?? 0)),
  )
  const tokens = task.progress?.tokenCount
  const color = selected ? 'suggestion' : undefined
  return (
    <Box>
      <Text color={color}>
        {selected ? `${figures.pointer} ` : '  '}
        <Text color="success">▶</Text>{' '}
        <Text bold>{name || task.agentType}</Text>
        {name && <Text dimColor> · {task.agentType}</Text>}
        <Text dimColor> · {summary}</Text>
        <Text dimColor> · {elapsed}</Text>
        {tokens !== undefined && tokens > 0 && (
          <Text dimColor> · {formatNumber(tokens)} tokens</Text>
        )}
        {selected && <Text dimColor> · x to stop</Text>}
      </Text>
    </Box>
  )
}

function RecentAgentRow({
  task,
  name,
  selected,
}: {
  task: LocalAgentTaskState
  name?: string
  selected: boolean
}): React.ReactNode {
  return (
    <Box>
      <Text color={selected ? 'suggestion' : undefined} dimColor={!selected}>
        {selected ? `${figures.pointer} ` : '  '}
        <StatusIcon
          status={task.status === 'completed' ? 'success' : 'error'}
          withSpace
        />
        <Text bold>{name || task.agentType}</Text>
        <Text dimColor> · {taskResultSummary(task)}</Text>
      </Text>
    </Box>
  )
}

function RunningAgents({ onExit }: { onExit: () => void }): React.ReactNode {
  const tasks = useAppState(state => state.tasks)
  const agentNameRegistry = useAppState(state => state.agentNameRegistry)
  const setAppState = useSetAppState()
  const { headerFocused, focusHeader } = useTabHeaderFocus()
  const [selectedTaskId, setSelectedTaskId] = useState<string>()
  const [, forceTick] = useState(0)

  const namesById = useMemo(() => {
    const names = new Map<string, string>()
    for (const [name, id] of agentNameRegistry) names.set(id, name)
    return names
  }, [agentNameRegistry])
  const running = useMemo(
    () =>
      (Object.values(tasks) as LocalAgentTaskState[])
        .filter(isRunningAgent)
        .sort((left, right) => left.startTime - right.startTime),
    [tasks],
  )
  const recent = useMemo(
    () =>
      (Object.values(tasks) as LocalAgentTaskState[])
        .filter(isRecentlyCompletedAgent)
        .sort((left, right) => (right.endTime ?? 0) - (left.endTime ?? 0))
        .slice(0, 5),
    [tasks],
  )
  const all = useMemo(() => [...running, ...recent], [running, recent])

  useEffect(() => {
    if (running.length === 0) return
    const timer = setInterval(() => forceTick(value => value + 1), 1000)
    return () => clearInterval(timer)
  }, [running.length])

  const selectedIndex = all.findIndex(task => task.id === selectedTaskId)
  const selectedTask =
    selectedIndex >= 0
      ? all[selectedIndex]
      : selectedTaskId === undefined
        ? all[0]
        : undefined

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
        setSelectedTaskId(all[0]?.id)
      }
      return
    }
    const index = selectedIndex < 0 ? 0 : selectedIndex
    if (event.key === 'up') {
      event.preventDefault()
      if (index === 0 || all.length === 0) focusHeader()
      else setSelectedTaskId(all[index - 1]?.id)
      return
    }
    if (event.key === 'down') {
      event.preventDefault()
      setSelectedTaskId(all[Math.min(index + 1, all.length - 1)]?.id)
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

  return (
    <Box
      flexDirection="column"
      tabIndex={0}
      autoFocus
      onKeyDown={handleKeyDown}
    >
      {all.length === 0 && (
        <Text>No subagents are currently running.</Text>
      )}
      {running.map(task => (
        <RunningAgentRow
          key={task.id}
          task={task}
          name={namesById.get(task.id)}
          selected={task.id === selectedTask?.id && !headerFocused}
        />
      ))}
      {recent.length > 0 && (
        <>
          <Box marginTop={running.length > 0 ? 1 : 0}>
            <Text bold dimColor>
              Recently completed
            </Text>
          </Box>
          {recent.map(task => (
            <RecentAgentRow
              key={task.id}
              task={task}
              name={namesById.get(task.id)}
              selected={task.id === selectedTask?.id && !headerFocused}
            />
          ))}
        </>
      )}
    </Box>
  )
}

export function AgentsMenu({
  tools,
  onExit,
  toolUseContext,
}: Props): React.ReactNode {
  const [modeState, setModeState] = useState<ModeState>({
    mode: 'list-agents',
    source: 'all',
  })
  const [selectedTab, setSelectedTab] = useState('running')
  const agentDefinitions = useAppState(state => state.agentDefinitions)
  const mcpTools = useAppState(state => state.mcp.tools)
  const toolPermissionContext = useAppState(
    state => state.toolPermissionContext,
  )
  const tasks = useAppState(state => state.tasks)
  const usedThisSession = useAppState(
    state => state.agentTypesInvokedThisSession,
  )
  const setAppState = useSetAppState()
  const { columns } = useTerminalSize()
  const { allAgents, activeAgents: agents } = agentDefinitions
  const [changes, setChanges] = useState<string[]>([])
  const [runPrompt, setRunPrompt] = useState('')
  const [runPromptCursor, setRunPromptCursor] = useState(0)
  const mergedTools = useMergedTools(tools, mcpTools, toolPermissionContext)
  const exitState = useExitOnCtrlCDWithKeybindings(
    undefined,
    undefined,
    modeState.mode === 'list-agents',
  )

  const { runningByType, runningCount } = useMemo(() => {
    const byType = new Map<string, number>()
    let count = 0
    for (const task of Object.values(tasks)) {
      if (
        task.type !== 'local_agent' ||
        task.agentType === 'main-session' ||
        task.status === 'completed' ||
        task.status === 'failed' ||
        task.status === 'killed'
      ) {
        continue
      }
      byType.set(task.agentType, (byType.get(task.agentType) ?? 0) + 1)
      count++
    }
    return { runningByType: byType, runningCount: count }
  }, [tasks])

  const agentsBySource = useMemo<
    Record<
      SettingSource | 'all' | 'built-in' | 'plugin',
      AgentDefinition[]
    >
  >(
    () => ({
      'built-in': allAgents.filter(agent => agent.source === 'built-in'),
      userSettings: allAgents.filter(agent => agent.source === 'userSettings'),
      projectSettings: allAgents.filter(
        agent => agent.source === 'projectSettings',
      ),
      policySettings: allAgents.filter(
        agent => agent.source === 'policySettings',
      ),
      localSettings: allAgents.filter(agent => agent.source === 'localSettings'),
      flagSettings: allAgents.filter(agent => agent.source === 'flagSettings'),
      plugin: allAgents.filter(agent => agent.source === 'plugin'),
      all: allAgents,
    }),
    [allAgents],
  )

  const handleAgentCreated = (message: string): void => {
    setChanges(previous => [...previous, message])
    setModeState({ mode: 'list-agents', source: 'all' })
  }

  const handleAgentDeleted = async (agent: AgentDefinition): Promise<void> => {
    try {
      await deleteAgentFromFile(agent)
      setAppState(state => {
        const remaining = state.agentDefinitions.allAgents.filter(
          current =>
            !(
              current.agentType === agent.agentType &&
              current.source === agent.source
            ),
        )
        return {
          ...state,
          agentDefinitions: {
            ...state.agentDefinitions,
            allAgents: remaining,
            activeAgents: getActiveAgentsFromList(remaining),
          },
        }
      })
      setChanges(previous => [
        ...previous,
        `Deleted agent: ${chalk.bold(agent.agentType)}`,
      ])
      setModeState({ mode: 'list-agents', source: 'all' })
    } catch (error) {
      logError(toError(error))
    }
  }

  switch (modeState.mode) {
    case 'task-detail':
      return (
        <BackgroundTasksDialog
          toolUseContext={toolUseContext}
          initialDetailTaskId={modeState.taskId}
          onBack={() =>
            setModeState({ mode: 'list-agents', source: 'all' })
          }
          onDone={result => {
            if (result === 'Viewing teammate' || result === 'Viewing leader') {
              onExit(undefined, { display: 'skip' })
            } else {
              setModeState({ mode: 'list-agents', source: 'all' })
            }
          }}
        />
      )

    case 'list-agents': {
      const agentsToShow =
        modeState.source === 'all'
          ? [
              ...agentsBySource['built-in'],
              ...agentsBySource.userSettings,
              ...agentsBySource.projectSettings,
              ...agentsBySource.localSettings,
              ...agentsBySource.policySettings,
              ...agentsBySource.flagSettings,
              ...agentsBySource.plugin,
            ]
          : agentsBySource[modeState.source]
      const resolvedAgents: ResolvedAgent[] = resolveAgentOverrides(
        agentsToShow,
        agents,
      )
      const close = (): void => {
        const exitMessage =
          changes.length > 0
            ? `Agent changes:\n${changes.join('\n')}`
            : undefined
        onExit(exitMessage ?? 'Agents dialog dismissed', {
          display: changes.length === 0 ? 'system' : undefined,
        })
      }
      const runningTitle =
        runningCount > 0 ? `Running (${runningCount})` : 'Running'
      const footer = exitState.pending
        ? `Press ${exitState.keyName} again to exit`
        : '←/→ switch tabs · ↑↓ navigate · Enter select · Esc close'
      return (
        <>
          <Pane color="permission">
            <Tabs
              title="Agents"
              color="permission"
              navFromContent
              selectedTab={selectedTab}
              onTabChange={setSelectedTab}
            >
              <Tab title={runningTitle} id="running">
                <RunningAgents
                  onExit={() => onExit(undefined, { display: 'skip' })}
                />
              </Tab>
              <Tab title="Library" id="definitions">
                <AgentsList
                  source={modeState.source}
                  agents={resolvedAgents}
                  runningByType={runningByType}
                  usedThisSession={usedThisSession}
                  onSelect={agent =>
                    setModeState({
                      mode: 'agent-menu',
                      agent,
                      previousMode: modeState,
                    })
                  }
                  onCreateNew={() => setModeState({ mode: 'create-agent' })}
                  changes={changes}
                />
              </Tab>
            </Tabs>
            <Box marginTop={1}>
              <Text dimColor>{footer}</Text>
            </Box>
          </Pane>
          <CancelBinding onCancel={close} />
        </>
      )
    }

    case 'create-agent':
      return (
        <CreateAgentWizard
          tools={mergedTools}
          existingAgents={agents}
          onComplete={handleAgentCreated}
          onCancel={() => setModeState({ mode: 'list-agents', source: 'all' })}
        />
      )

    case 'agent-menu': {
      const freshAgent = allAgents.find(
        agent =>
          agent.agentType === modeState.agent.agentType &&
          agent.source === modeState.agent.source,
      )
      const agent = freshAgent || modeState.agent
      const isEditable =
        agent.source !== 'built-in' &&
        agent.source !== 'plugin' &&
        agent.source !== 'flagSettings'
      const activeCount = runningByType.get(agent.agentType) ?? 0
      const menuItems = [
        { label: 'Run agent', value: 'run' },
        ...(activeCount > 0
          ? [{ label: 'View running instance', value: 'view-running' }]
          : []),
        { label: 'View agent', value: 'view' },
        ...(isEditable
          ? [
              { label: 'Edit agent', value: 'edit' },
              { label: 'Delete agent', value: 'delete' },
            ]
          : []),
        { label: 'Back', value: 'back' },
      ]
      const handleSelect = (value: string): void => {
        switch (value) {
          case 'run':
            setRunPrompt('')
            setRunPromptCursor(0)
            setModeState({
              mode: 'run-agent',
              agent,
              previousMode: modeState,
            })
            break
          case 'view-running': {
            const runningTask = Object.values(tasks).find(
              task =>
                task.type === 'local_agent' &&
                task.agentType === agent.agentType &&
                task.status !== 'completed' &&
                task.status !== 'failed' &&
                task.status !== 'killed',
            )
            if (runningTask) {
              enterTeammateView(runningTask.id, setAppState)
              onExit(undefined, { display: 'skip' })
            }
            break
          }
          case 'view':
            setModeState({
              mode: 'view-agent',
              agent,
              previousMode: modeState.previousMode,
            })
            break
          case 'edit':
            setModeState({ mode: 'edit-agent', agent, previousMode: modeState })
            break
          case 'delete':
            setModeState({
              mode: 'delete-confirm',
              agent,
              previousMode: modeState,
            })
            break
          case 'back':
            setModeState(modeState.previousMode)
        }
      }
      return (
        <>
          <Dialog
            title={agent.agentType}
            onCancel={() => setModeState(modeState.previousMode)}
            hideInputGuide
          >
            <Box flexDirection="column">
              <Select
                options={menuItems}
                onChange={handleSelect}
                onCancel={() => setModeState(modeState.previousMode)}
              />
              {changes.length > 0 && (
                <Box marginTop={1}>
                  <Text dimColor>{changes.at(-1)}</Text>
                </Box>
              )}
            </Box>
          </Dialog>
          <NavigationFooter />
        </>
      )
    }

    case 'view-agent': {
      const freshAgent = allAgents.find(
        agent =>
          agent.agentType === modeState.agent.agentType &&
          agent.source === modeState.agent.source,
      )
      const agent = freshAgent || modeState.agent
      const back = (): void =>
        setModeState({
          mode: 'agent-menu',
          agent,
          previousMode: modeState.previousMode,
        })
      return (
        <>
          <Dialog title={agent.agentType} onCancel={back} hideInputGuide>
            <AgentDetail
              agent={agent}
              tools={mergedTools}
              allAgents={allAgents}
              onBack={back}
            />
          </Dialog>
          <Box marginLeft={2} marginTop={1}>
            <Text dimColor>Press Enter or Esc to go back</Text>
          </Box>
        </>
      )
    }

    case 'delete-confirm': {
      const back = (): void => setModeState(modeState.previousMode)
      return (
        <>
          <Dialog title="Delete agent" onCancel={back} color="error">
            <Text>
              Are you sure you want to delete the agent{' '}
              <Text bold>{modeState.agent.agentType}</Text>?
            </Text>
            <Box marginTop={1}>
              <Text dimColor>Source: {modeState.agent.source}</Text>
            </Box>
            <Box marginTop={1}>
              <Select
                options={[
                  { label: 'Yes, delete', value: 'yes' },
                  { label: 'No, cancel', value: 'no' },
                ]}
                onChange={value => {
                  if (value === 'yes') void handleAgentDeleted(modeState.agent)
                  else back()
                }}
                onCancel={back}
              />
            </Box>
          </Dialog>
          <NavigationFooter instructions="Press ↑↓ to navigate, Enter to select, Esc to cancel" />
        </>
      )
    }

    case 'run-agent': {
      const agent = modeState.agent
      const back = (): void => setModeState(modeState.previousMode)
      const submit = (value: string): void => {
        const prompt = value.trim()
        if (!prompt) return
        onExit(undefined, {
          display: 'skip',
          nextInput: `@agent-${agent.agentType} ${prompt}`,
          submitNextInput: true,
        })
      }
      return (
        <>
          <Dialog
            title={`Run ${agent.agentType}`}
            subtitle="Enter a prompt for this subagent"
            onCancel={back}
            isCancelActive={false}
            hideInputGuide
          >
            <Box marginTop={1}>
              <TextInput
                value={runPrompt}
                onChange={setRunPrompt}
                onSubmit={submit}
                onExit={back}
                focus
                showCursor
                columns={columns}
                cursorOffset={runPromptCursor}
                onChangeCursorOffset={setRunPromptCursor}
                placeholder="Describe the task…"
              />
            </Box>
          </Dialog>
          <Box marginLeft={2} marginTop={1}>
            <Text dimColor>Enter to run · Esc to go back</Text>
          </Box>
        </>
      )
    }

    case 'edit-agent': {
      const freshAgent = allAgents.find(
        agent =>
          agent.agentType === modeState.agent.agentType &&
          agent.source === modeState.agent.source,
      )
      const agent = freshAgent || modeState.agent
      return (
        <>
          <Dialog
            title={`Edit agent: ${agent.agentType}`}
            onCancel={() => setModeState(modeState.previousMode)}
            hideInputGuide
          >
            <AgentEditor
              agent={agent}
              tools={mergedTools}
              onSaved={message => {
                handleAgentCreated(message)
                setModeState(modeState.previousMode)
              }}
              onBack={() => setModeState(modeState.previousMode)}
            />
          </Dialog>
          <NavigationFooter />
        </>
      )
    }

    default:
      return null
  }
}

function CancelBinding({ onCancel }: { onCancel: () => void }): null {
  // Dialog is intentionally not used around the tab surface; retain the same
  // configurable confirm:no binding the target menu installs alongside Tabs.
  useKeybinding('confirm:no', onCancel, { context: 'Confirmation' })
  return null
}

function NavigationFooter({
  instructions = 'Press ↑↓ to navigate · Enter to select · Esc to go back',
}: {
  instructions?: string
}): React.ReactNode {
  return (
    <Box marginLeft={2} marginTop={1}>
      <Text dimColor>{instructions}</Text>
    </Box>
  )
}
