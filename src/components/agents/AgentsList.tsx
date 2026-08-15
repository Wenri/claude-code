import figures from 'figures'
import * as React from 'react'
import type { SettingSource } from 'src/utils/settings/constants.js'
import type { KeyboardEvent } from '../../ink/events/keyboard-event.js'
import { Box, Text } from '../../ink.js'
import type { ResolvedAgent } from '../../tools/AgentTool/agentDisplay.js'
import {
  AGENT_SOURCE_GROUPS,
  compareAgentsByName,
  getOverrideSourceLabel,
  resolveAgentModelDisplay,
} from '../../tools/AgentTool/agentDisplay.js'
import type { AgentDefinition } from '../../tools/AgentTool/loadAgentsDir.js'
import { Divider } from '../design-system/Divider.js'
import { useTabHeaderFocus } from '../design-system/Tabs.js'

type Props = {
  source: SettingSource | 'all' | 'built-in' | 'plugin'
  agents: ResolvedAgent[]
  runningByType?: Map<string, number>
  usedThisSession?: Set<string>
  onSelect: (agent: AgentDefinition) => void
  onCreateNew?: () => void
  changes?: string[]
}

export function AgentsList({
  source,
  agents,
  runningByType,
  usedThisSession,
  onSelect,
  onCreateNew,
  changes,
}: Props): React.ReactNode {
  const [selectedAgent, setSelectedAgent] =
    React.useState<ResolvedAgent | null>(null)
  const [isCreateNewSelected, setIsCreateNewSelected] = React.useState(true)
  const { headerFocused, focusHeader } = useTabHeaderFocus()

  const sortedAgents = React.useMemo(() => {
    const sorted = [...agents].sort(compareAgentsByName)
    if (source !== 'all' || !usedThisSession?.size) return sorted
    return sorted.sort(
      (left, right) =>
        Number(!usedThisSession.has(left.agentType)) -
        Number(!usedThisSession.has(right.agentType)),
    )
  }, [agents, source, usedThisSession])

  const activeSelection =
    headerFocused || isCreateNewSelected ? null : selectedAgent

  const selectableAgentsInOrder = React.useMemo(() => {
    const nonBuiltIn = sortedAgents.filter(agent => agent.source !== 'built-in')
    if (source === 'all') {
      return AGENT_SOURCE_GROUPS.filter(
        group => group.source !== 'built-in',
      ).flatMap(({ source: groupSource }) =>
        nonBuiltIn.filter(agent => agent.source === groupSource),
      )
    }
    return nonBuiltIn
  }, [sortedAgents, source])

  React.useEffect(() => {
    if (
      !selectedAgent &&
      !isCreateNewSelected &&
      selectableAgentsInOrder.length > 0
    ) {
      if (onCreateNew) setIsCreateNewSelected(true)
      else setSelectedAgent(selectableAgentsInOrder[0] ?? null)
    }
  }, [
    selectableAgentsInOrder,
    selectedAgent,
    isCreateNewSelected,
    onCreateNew,
  ])

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (headerFocused) return
    if (event.key === 'return') {
      event.preventDefault()
      if (isCreateNewSelected && onCreateNew) onCreateNew()
      else if (selectedAgent) onSelect(selectedAgent)
      return
    }
    if (event.key !== 'up' && event.key !== 'down') return
    event.preventDefault()

    const hasCreateOption = Boolean(onCreateNew)
    const totalItems =
      selectableAgentsInOrder.length + (hasCreateOption ? 1 : 0)
    if (totalItems === 0) return

    let currentPosition = 0
    if (!isCreateNewSelected && selectedAgent) {
      const index = selectableAgentsInOrder.findIndex(
        agent =>
          agent.agentType === selectedAgent.agentType &&
          agent.source === selectedAgent.source,
      )
      if (index >= 0) currentPosition = hasCreateOption ? index + 1 : index
    }

    if (event.key === 'up' && currentPosition === 0) {
      focusHeader()
      return
    }
    const nextPosition =
      event.key === 'up'
        ? currentPosition - 1
        : Math.min(currentPosition + 1, totalItems - 1)
    if (hasCreateOption && nextPosition === 0) {
      setIsCreateNewSelected(true)
      setSelectedAgent(null)
      return
    }
    const nextAgent =
      selectableAgentsInOrder[hasCreateOption ? nextPosition - 1 : nextPosition]
    if (nextAgent) {
      setIsCreateNewSelected(false)
      setSelectedAgent(nextAgent)
    }
  }

  const renderAgent = (agent: ResolvedAgent): React.ReactNode => {
    const isBuiltIn = agent.source === 'built-in'
    const isSelected =
      !isBuiltIn &&
      activeSelection?.agentType === agent.agentType &&
      activeSelection.source === agent.source
    const overriddenBy = agent.overriddenBy ?? null
    const isOverridden = Boolean(overriddenBy)
    const dimmed = isBuiltIn || isOverridden
    const color = !isBuiltIn && isSelected ? 'suggestion' : undefined
    const model = resolveAgentModelDisplay(agent)
    const running = isOverridden
      ? 0
      : (runningByType?.get(agent.agentType) ?? 0)

    return (
      <Box key={`${agent.agentType}-${agent.source}`}>
        <Text dimColor={dimmed && !isSelected} color={color}>
          {isBuiltIn ? '' : isSelected ? `${figures.pointer} ` : '  '}
        </Text>
        <Text dimColor={dimmed && !isSelected} color={color}>
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
          <Text color="success"> ● {running} running</Text>
        )}
        {overriddenBy && (
          <Text dimColor={!isSelected} color={isSelected ? 'warning' : undefined}>
            {' '}
            {figures.warning} shadowed by {getOverrideSourceLabel(overriddenBy)}
          </Text>
        )}
      </Box>
    )
  }

  const renderBuiltIns = (builtIns: ResolvedAgent[]): React.ReactNode => (
    <Box flexDirection="column" marginBottom={1} paddingLeft={2}>
      <Text bold dimColor>
        Built-in (always available):
      </Text>
      {builtIns.map(renderAgent)}
    </Box>
  )

  const renderGroup = (
    title: string,
    groupAgents: ResolvedAgent[],
  ): React.ReactNode => {
    if (groupAgents.length === 0) return null
    const folderPath = groupAgents[0]?.baseDir
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box paddingLeft={2}>
          <Text bold dimColor>
            {title}
          </Text>
          {folderPath && <Text dimColor> ({folderPath})</Text>}
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

  return (
    <Box
      flexDirection="column"
      gap={hasNoAgents ? 1 : undefined}
      tabIndex={0}
      autoFocus
      onKeyDown={handleKeyDown}
    >
      {changes && changes.length > 0 && (
        <Box marginBottom={1}>
          <Text dimColor>{changes.at(-1)}</Text>
        </Box>
      )}
      {onCreateNew && (
        <Box marginBottom={hasNoAgents ? undefined : 1}>
          <Text color={isCreateNewSelected && !headerFocused ? 'suggestion' : undefined}>
            {isCreateNewSelected && !headerFocused
              ? `${figures.pointer} `
              : '  '}
            Create new agent
          </Text>
        </Box>
      )}
      {hasNoAgents ? (
        <>
          <Text dimColor>
            No agents found. Create specialized subagents that Claude can delegate to.
          </Text>
          <Text dimColor>
            Each subagent has its own context window, custom system prompt, and specific tools.
          </Text>
          <Text dimColor>
            Try creating: Code Reviewer, Code Simplifier, Security Reviewer, Tech Lead, or UX Reviewer.
          </Text>
          {source !== 'built-in' && builtIns.length > 0 && (
            <>
              <Divider />
              {renderBuiltIns(builtIns)}
            </>
          )}
        </>
      ) : source === 'all' ? (
        <>
          {AGENT_SOURCE_GROUPS.filter(
            group => group.source !== 'built-in',
          ).map(({ label, source: groupSource }) => (
            <React.Fragment key={groupSource}>
              {renderGroup(
                label,
                sortedAgents.filter(agent => agent.source === groupSource),
              )}
            </React.Fragment>
          ))}
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
          {sortedAgents
            .filter(agent => agent.source !== 'built-in')
            .map(renderAgent)}
          {builtIns.length > 0 && (
            <>
              <Divider />
              {renderBuiltIns(builtIns)}
            </>
          )}
        </>
      )}
    </Box>
  )
}
