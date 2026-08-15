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
import type { Tools } from '../../Tool.js'
import {
  AGENT_SOURCE_GROUPS,
  compareAgentsByName,
  getOverrideSourceLabel,
  type ResolvedAgent,
  resolveAgentModelDisplay,
  resolveAgentOverrides,
} from '../../tools/AgentTool/agentDisplay.js'
import {
  type AgentDefinition,
  getActiveAgentsFromList,
} from '../../tools/AgentTool/loadAgentsDir.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import { toError } from '../../utils/errors.js'
import { logError } from '../../utils/log.js'
import TextInput from '../TextInput.js'
import { Select } from '../CustomSelect/select.js'
import { Dialog } from '../design-system/Dialog.js'
import { Divider } from '../design-system/Divider.js'
import { Pane } from '../design-system/Pane.js'
import { Tab, Tabs, useTabHeaderFocus } from '../design-system/Tabs.js'
import { AgentDetail } from './AgentDetail.js'
import { AgentEditor } from './AgentEditor.js'
import { AgentNavigationFooter } from './AgentNavigationFooter.js'
import { deleteAgentFromFile } from './agentFileUtils.js'
import { CreateAgentWizard } from './new-agent-creation/CreateAgentWizard.js'
import { RunningAgents } from './RunningAgents.js'

type Props = {
  tools: Tools
  onExit: LocalJSXCommandOnDone
}

type ListMode = {
  mode: 'list-agents'
  source: SettingSource | 'all' | 'built-in'
}
type ModeState =
  | ListMode
  | { mode: 'create-agent' }
  | { mode: 'agent-menu'; agent: AgentDefinition; previousMode: ModeState }
  | { mode: 'view-agent'; agent: AgentDefinition; previousMode: ModeState }
  | { mode: 'edit-agent'; agent: AgentDefinition; previousMode: ModeState }
  | { mode: 'delete-confirm'; agent: AgentDefinition; previousMode: ModeState }
  | { mode: 'run-agent'; agent: AgentDefinition; previousMode: ModeState }

type LibraryProps = {
  source: ListMode['source']
  agents: ResolvedAgent[]
  runningByType: Map<string, number>
  usedThisSession: Set<string>
  changes: string[]
  onSelect: (agent: AgentDefinition) => void
  onCreateNew: () => void
}

function ListCancelBinding({ onCancel }: { onCancel: () => void }): null {
  useKeybinding('confirm:no', onCancel, { context: 'Confirmation' })
  return null
}

function AgentsLibrary({
  source,
  agents,
  runningByType,
  usedThisSession,
  changes,
  onSelect,
  onCreateNew,
}: LibraryProps): React.ReactNode {
  const [selectedAgent, setSelectedAgent] = useState<ResolvedAgent | null>(null)
  const [createSelected, setCreateSelected] = useState(true)
  const { headerFocused, focusHeader } = useTabHeaderFocus()

  const sortedAgents = useMemo(() => {
    const sorted = [...agents].sort(compareAgentsByName)
    if (source !== 'all' || usedThisSession.size === 0) return sorted
    return sorted.sort((a, b) => {
      const aUsed = usedThisSession.has(a.agentType) ? 0 : 1
      const bUsed = usedThisSession.has(b.agentType) ? 0 : 1
      return aUsed - bUsed
    })
  }, [agents, source, usedThisSession])

  const selectable = useMemo(() => {
    const nonBuiltIn = sortedAgents.filter(agent => agent.source !== 'built-in')
    if (source !== 'all') return nonBuiltIn
    return AGENT_SOURCE_GROUPS.filter(group => group.source !== 'built-in').flatMap(
      group => nonBuiltIn.filter(agent => agent.source === group.source),
    )
  }, [sortedAgents, source])

  useEffect(() => {
    if (
      selectedAgent === null &&
      !createSelected &&
      selectable.length > 0
    ) {
      setCreateSelected(true)
    }
  }, [createSelected, selectable, selectedAgent])

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (headerFocused) return
    if (event.key === 'return') {
      event.preventDefault()
      if (createSelected) onCreateNew()
      else if (selectedAgent) onSelect(selectedAgent)
      return
    }
    if (event.key !== 'up' && event.key !== 'down') return
    event.preventDefault()
    const itemCount = selectable.length + 1
    let position = 0
    if (!createSelected && selectedAgent) {
      const index = selectable.findIndex(
        agent =>
          agent.agentType === selectedAgent.agentType &&
          agent.source === selectedAgent.source,
      )
      if (index >= 0) position = index + 1
    }
    if (event.key === 'up' && position === 0) {
      focusHeader()
      return
    }
    const next =
      event.key === 'up'
        ? position - 1
        : Math.min(position + 1, itemCount - 1)
    if (next === 0) {
      setCreateSelected(true)
      setSelectedAgent(null)
    } else {
      setCreateSelected(false)
      setSelectedAgent(selectable[next - 1] ?? null)
    }
  }

  const renderAgent = (agent: ResolvedAgent): React.ReactNode => {
    const builtIn = agent.source === 'built-in'
    const selected =
      !builtIn &&
      !headerFocused &&
      !createSelected &&
      selectedAgent?.agentType === agent.agentType &&
      selectedAgent.source === agent.source
    const overridden = agent.overriddenBy !== undefined
    const color = selected ? 'suggestion' : undefined
    const model = resolveAgentModelDisplay(agent)
    const running = overridden ? 0 : (runningByType.get(agent.agentType) ?? 0)
    return (
      <Box key={`${agent.agentType}-${agent.source}`}>
        <Text dimColor={(builtIn || overridden) && !selected} color={color}>
          {builtIn ? '' : selected ? `${figures.pointer} ` : '  '}
        </Text>
        <Text dimColor={(builtIn || overridden) && !selected} color={color}>
          {agent.agentType}
        </Text>
        {model && (
          <Text dimColor color={color}>
            {' · '}
            {model}
          </Text>
        )}
        {agent.memory && (
          <Text dimColor color={color}>
            {' · '}
            {agent.memory} memory
          </Text>
        )}
        {running > 0 && (
          <Text color="success">
            {' '}
            {figures.squareSmallFilled} {running} running
          </Text>
        )}
        {agent.overriddenBy && (
          <Text dimColor={!selected} color={selected ? 'warning' : undefined}>
            {' '}
            {figures.warning} shadowed by{' '}
            {getOverrideSourceLabel(agent.overriddenBy)}
          </Text>
        )}
      </Box>
    )
  }

  const renderCreateNewOption = (): React.ReactNode => {
    const selected = createSelected && !headerFocused
    return (
      <Box>
        <Text color={selected ? 'suggestion' : undefined}>
          {selected ? `${figures.pointer} ` : '  '}
        </Text>
        <Text color={selected ? 'suggestion' : undefined}>
          Create new agent
        </Text>
      </Box>
    )
  }

  const renderGroup = (
    title: string,
    groupAgents: ResolvedAgent[],
  ): React.ReactNode => {
    if (groupAgents.length === 0) return null
    const folder = groupAgents[0]?.baseDir
    return (
      <Box flexDirection="column" marginBottom={1} key={title}>
        <Box paddingLeft={2}>
          <Text bold dimColor>
            {title}
          </Text>
          {folder && <Text dimColor> ({folder})</Text>}
        </Box>
        {groupAgents.map(renderAgent)}
      </Box>
    )
  }

  const builtIns = sortedAgents.filter(agent => agent.source === 'built-in')
  const hasNoAgents =
    sortedAgents.length === 0 ||
    (source !== 'built-in' &&
      !sortedAgents.some(agent => agent.source !== 'built-in'))

  if (hasNoAgents) {
    return (
      <Box
        flexDirection="column"
        gap={1}
        tabIndex={0}
        autoFocus
        onKeyDown={handleKeyDown}
      >
        <Box>{renderCreateNewOption()}</Box>
        <Text dimColor>
          No agents found. Create specialized subagents that Claude can delegate
          to.
        </Text>
        <Text dimColor>
          Each subagent has its own context window, custom system prompt, and
          specific tools.
        </Text>
        <Text dimColor>
          Try creating: Code Reviewer, Code Simplifier, Security Reviewer, Tech
          Lead, or UX Reviewer.
        </Text>
        {source !== 'built-in' && builtIns.length > 0 && (
          <>
            <Divider />
            <Box flexDirection="column" marginBottom={1} paddingLeft={2}>
              <Text bold dimColor>
                Built-in (always available):
              </Text>
              {builtIns.map(renderAgent)}
            </Box>
          </>
        )}
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
      {changes.length > 0 && (
        <Box marginBottom={1}>
          <Text dimColor>{changes.at(-1)}</Text>
        </Box>
      )}
      <Box marginBottom={1}>{renderCreateNewOption()}</Box>
      {source === 'all' ? (
        <>
          {AGENT_SOURCE_GROUPS.filter(group => group.source !== 'built-in').map(
            group =>
              renderGroup(
                group.label,
                sortedAgents.filter(agent => agent.source === group.source),
              ),
          )}
          {builtIns.length > 0 && (
            <Box flexDirection="column" marginBottom={1} paddingLeft={2}>
              <Text dimColor>
                <Text bold>Built-in agents</Text> (always available)
              </Text>
              {builtIns.map(renderAgent)}
            </Box>
          )}
        </>
      ) : source === 'built-in' ? (
        <>
          <Text dimColor italic>
            Built-in agents are provided by default and cannot be modified.
          </Text>
          <Box marginTop={1} flexDirection="column">
            {sortedAgents.map(renderAgent)}
          </Box>
        </>
      ) : (
        <>
          {sortedAgents.filter(agent => agent.source !== 'built-in').map(renderAgent)}
          {builtIns.length > 0 && (
            <>
              <Divider />
              {renderGroup('Built-in (always available):', builtIns)}
            </>
          )}
        </>
      )}
    </Box>
  )
}

export function AgentsMenu({ tools, onExit }: Props): React.ReactNode {
  const [modeState, setModeState] = useState<ModeState>({
    mode: 'list-agents',
    source: 'all',
  })
  const [selectedTab, setSelectedTab] = useState('running')
  const [changes, setChanges] = useState<string[]>([])
  const [runPrompt, setRunPrompt] = useState('')
  const [runCursor, setRunCursor] = useState(0)
  const agentDefinitions = useAppState(state => state.agentDefinitions)
  const mcpTools = useAppState(state => state.mcp.tools)
  const toolPermissionContext = useAppState(state => state.toolPermissionContext)
  const tasks = useAppState(state => state.tasks)
  const usedThisSession = useAppState(
    state => state.agentTypesInvokedThisSession,
  )
  const setAppState = useSetAppState()
  const { columns } = useTerminalSize()
  const { allAgents, activeAgents } = agentDefinitions
  const mergedTools = useMergedTools(tools, mcpTools, toolPermissionContext)
  const exitState = useExitOnCtrlCDWithKeybindings(
    undefined,
    undefined,
    modeState.mode === 'list-agents',
  )

  const runningByType = useMemo(() => {
    const result = new Map<string, number>()
    for (const task of Object.values(tasks)) {
      if (
        task.type === 'local_agent' &&
        task.agentType !== 'main-session' &&
        task.status !== 'completed' &&
        task.status !== 'failed' &&
        task.status !== 'killed'
      ) {
        result.set(task.agentType, (result.get(task.agentType) ?? 0) + 1)
      }
    }
    return result
  }, [tasks])
  const runningCount = [...runningByType.values()].reduce(
    (sum, count) => sum + count,
    0,
  )

  const agentsBySource = useMemo(() => {
    const result = {
      'built-in': [] as AgentDefinition[],
      userSettings: [] as AgentDefinition[],
      projectSettings: [] as AgentDefinition[],
      policySettings: [] as AgentDefinition[],
      localSettings: [] as AgentDefinition[],
      flagSettings: [] as AgentDefinition[],
      plugin: [] as AgentDefinition[],
      all: allAgents,
    }
    for (const agent of allAgents) result[agent.source].push(agent)
    return result
  }, [allAgents])

  const handleAgentCreated = (message: string): void => {
    setChanges(previous => [...previous, message])
    setModeState({ mode: 'list-agents', source: 'all' })
  }

  const handleAgentDeleted = async (agent: AgentDefinition): Promise<void> => {
    try {
      await deleteAgentFromFile(agent)
      setAppState(state => {
        const nextAgents = state.agentDefinitions.allAgents.filter(
          candidate =>
            !(
              candidate.agentType === agent.agentType &&
              candidate.source === agent.source
            ),
        )
        return {
          ...state,
          agentDefinitions: {
            ...state.agentDefinitions,
            allAgents: nextAgents,
            activeAgents: getActiveAgentsFromList(nextAgents),
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

  if (modeState.mode === 'list-agents') {
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
    const resolvedAgents = resolveAgentOverrides(agentsToShow, activeAgents)
    const handleExit = (): void => {
      const message =
        changes.length > 0 ? `Agent changes:\n${changes.join('\n')}` : undefined
      onExit(message ?? 'Agents dialog dismissed', {
        display: changes.length === 0 ? 'system' : undefined,
      })
    }
    const footer = exitState.pending
      ? `Press ${exitState.keyName} again to exit`
      : 'Tab/←/→ switch tabs · ↑↓ navigate · Enter select · Esc close'
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
            <Tab
              title={runningCount > 0 ? `Running (${runningCount})` : 'Running'}
              id="running"
            >
              <RunningAgents
                onExit={() => onExit(undefined, { display: 'skip' })}
              />
            </Tab>
            <Tab title="Library" id="definitions">
              <AgentsLibrary
                source={modeState.source}
                agents={resolvedAgents}
                runningByType={runningByType}
                usedThisSession={usedThisSession}
                changes={changes}
                onSelect={agent =>
                  setModeState({
                    mode: 'agent-menu',
                    agent,
                    previousMode: modeState,
                  })
                }
                onCreateNew={() => setModeState({ mode: 'create-agent' })}
              />
            </Tab>
          </Tabs>
          <Box marginTop={1}>
            <Text dimColor>{footer}</Text>
          </Box>
        </Pane>
        <ListCancelBinding onCancel={handleExit} />
      </>
    )
  }

  if (modeState.mode === 'create-agent') {
    return (
      <CreateAgentWizard
        tools={mergedTools}
        existingAgents={activeAgents}
        onComplete={handleAgentCreated}
        onCancel={() => setModeState({ mode: 'list-agents', source: 'all' })}
      />
    )
  }

  if (modeState.mode === 'agent-menu') {
    const freshAgent = allAgents.find(
      agent =>
        agent.agentType === modeState.agent.agentType &&
        agent.source === modeState.agent.source,
    )
    const agent = freshAgent ?? modeState.agent
    const editable =
      agent.source !== 'built-in' &&
      agent.source !== 'plugin' &&
      agent.source !== 'flagSettings'
    const running = runningByType.get(agent.agentType) ?? 0
    const menuItems = [
      { label: 'Run agent', value: 'run' },
      ...(running > 0
        ? [{ label: 'View running instance', value: 'view-running' }]
        : []),
      { label: 'View agent', value: 'view' },
      ...(editable
        ? [
            { label: 'Edit agent', value: 'edit' },
            { label: 'Delete agent', value: 'delete' },
          ]
        : []),
      { label: 'Back', value: 'back' },
    ]
    const select = (value: string): void => {
      if (value === 'run') {
        setRunPrompt('')
        setRunCursor(0)
        setModeState({
          mode: 'run-agent',
          agent,
          previousMode: modeState,
        })
      } else if (value === 'view-running') {
        const task = Object.values(tasks).find(
          candidate =>
            candidate.type === 'local_agent' &&
            candidate.agentType === agent.agentType &&
            candidate.status !== 'completed' &&
            candidate.status !== 'failed' &&
            candidate.status !== 'killed',
        )
        if (task) {
          enterTeammateView(task.id, setAppState)
          onExit(undefined, { display: 'skip' })
        }
      } else if (value === 'view') {
        setModeState({
          mode: 'view-agent',
          agent,
          previousMode: modeState.previousMode,
        })
      } else if (value === 'edit') {
        setModeState({
          mode: 'edit-agent',
          agent,
          previousMode: modeState,
        })
      } else if (value === 'delete') {
        setModeState({
          mode: 'delete-confirm',
          agent,
          previousMode: modeState,
        })
      } else {
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
              onChange={select}
              onCancel={() => setModeState(modeState.previousMode)}
            />
            {changes.length > 0 && (
              <Box marginTop={1}>
                <Text dimColor>{changes.at(-1)}</Text>
              </Box>
            )}
          </Box>
        </Dialog>
        <AgentNavigationFooter />
      </>
    )
  }

  if (modeState.mode === 'run-agent') {
    const agent = modeState.agent
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
          onCancel={() => setModeState(modeState.previousMode)}
          isCancelActive={false}
          hideInputGuide
        >
          <Box marginTop={1}>
            <TextInput
              value={runPrompt}
              onChange={setRunPrompt}
              onSubmit={submit}
              onExit={() => setModeState(modeState.previousMode)}
              focus
              showCursor
              columns={columns}
              cursorOffset={runCursor}
              onChangeCursorOffset={setRunCursor}
              placeholder="Describe the task…"
            />
          </Box>
        </Dialog>
        <AgentNavigationFooter instructions="Enter to run · Esc to go back" />
      </>
    )
  }

  if (modeState.mode === 'view-agent') {
    const agent =
      allAgents.find(
        candidate =>
          candidate.agentType === modeState.agent.agentType &&
          candidate.source === modeState.agent.source,
      ) ?? modeState.agent
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
        <AgentNavigationFooter instructions="Press Enter or Esc to go back" />
      </>
    )
  }

  if (modeState.mode === 'delete-confirm') {
    return (
      <>
        <Dialog
          title="Delete agent"
          color="error"
          onCancel={() => setModeState(modeState.previousMode)}
        >
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
                else setModeState(modeState.previousMode)
              }}
              onCancel={() => setModeState(modeState.previousMode)}
            />
          </Box>
        </Dialog>
        <AgentNavigationFooter instructions="Press ↑↓ to navigate, Enter to select, Esc to cancel" />
      </>
    )
  }

  const agent =
    allAgents.find(
      candidate =>
        candidate.agentType === modeState.agent.agentType &&
        candidate.source === modeState.agent.source,
    ) ?? modeState.agent
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
      <AgentNavigationFooter />
    </>
  )
}
