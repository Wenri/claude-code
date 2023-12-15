import type { UUID } from 'crypto'
import { stat, writeFile } from 'fs/promises'
import figures from 'figures'
import { join } from 'path'
import React, { useEffect, useState } from 'react'
import { getSessionId } from '../bootstrap/state.js'
import { useRegisterOverlay } from '../context/overlayContext.js'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
import type { KeyboardEvent } from '../ink/events/keyboard-event.js'
import type { WheelEvent } from '../ink/events/wheel-event.js'
import wrapText from '../ink/wrap-text.js'
import { Box, Text } from '../ink.js'
import type { ResultDedupState } from '../services/tools/resultDedup.js'
import type { MemorySelector } from '../memdir/findRelevantMemories.js'
import { useSetAppState } from '../state/AppState.js'
import type { AppState } from '../state/AppStateStore.js'
import type { RemoteAgentTaskState } from '../tasks/RemoteAgentTask/RemoteAgentTask.js'
import type { Message } from '../types/message.js'
import type { ReplIsolationLatch } from '../tools/REPLTool/types.js'
import { clearConversation } from '../commands/clear/conversation.js'
import type { FileStateCache } from '../utils/fileStateCache.js'
import { getDisplayPath } from '../utils/file.js'
import { enqueue, enqueuePendingNotification } from '../utils/messageQueueManager.js'
import { createSystemMessage } from '../utils/messages.js'
import { getPlansDirectory } from '../utils/plans.js'
import { getCurrentSessionFile } from '../utils/sessionStorage.js'
import { updateTaskState } from '../utils/task/framework.js'
import { archiveRemoteSession } from '../utils/teleport.js'
import { generateWordSlug } from '../utils/words.js'
import { Select } from './CustomSelect/select.js'
import { Dialog } from './design-system/Dialog.js'

const MAX_VISIBLE_PLAN_LINES = 24
const RESERVED_TERMINAL_ROWS = 11

type UltraplanChoice = 'here' | 'fresh' | 'cancel'

type Props = {
  plan: string
  sessionId: string
  taskId: string
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  readFileState: FileStateCache
  discoveredSkillNames?: Set<string>
  loadedNestedMemoryPaths?: Set<string>
  memorySelector?: MemorySelector
  getAppState: () => AppState
  setConversationId: (id: UUID) => void
  resultDedupState: ResultDedupState
  isolationLatch: ReplIsolationLatch
}

async function currentTranscriptExists(): Promise<boolean> {
  const sessionFile = getCurrentSessionFile()
  if (!sessionFile) return false
  return stat(sessionFile).then(
    () => true,
    () => false,
  )
}

export function UltraplanChoiceDialog({
  plan,
  sessionId,
  taskId,
  setMessages,
  readFileState,
  discoveredSkillNames,
  loadedNestedMemoryPaths,
  memorySelector,
  getAppState,
  setConversationId,
  resultDedupState,
  isolationLatch,
}: Props): React.ReactNode {
  useRegisterOverlay('ultraplan-choice')
  const setAppState = useSetAppState()

  const handleChoice = async (choice: UltraplanChoice): Promise<void> => {
    switch (choice) {
      case 'here': {
        enqueuePendingNotification({
          value: [
            'Ultraplan approved in browser. Here is the plan:',
            '',
            '<ultraplan>',
            plan,
            '</ultraplan>',
            '',
            'The user approved this plan in the remote session. Give them a brief summary, then start implementing.',
          ].join('\n'),
          mode: 'task-notification',
        })
        break
      }
      case 'fresh': {
        const previousSessionId = getSessionId()
        const hadSessionFile = await currentTranscriptExists()
        await clearConversation({
          setMessages,
          readFileState,
          discoveredSkillNames,
          loadedNestedMemoryPaths,
          memorySelector,
          getAppState,
          setAppState,
          setConversationId,
          resultDedupState,
          isolationLatch,
        })
        if (hadSessionFile) {
          setMessages(previous => [
            ...previous,
            createSystemMessage(
              `Previous session saved · resume with: claude --resume ${previousSessionId}`,
              'suggestion',
            ),
          ])
        }
        enqueue({
          value: `Here is the approved implementation plan:\n\n${plan}\n\nImplement this plan.`,
          mode: 'prompt',
        })
        break
      }
      case 'cancel': {
        const planPath = join(
          getPlansDirectory(),
          `${generateWordSlug()}-ultraplan.md`,
        )
        await writeFile(planPath, plan, { encoding: 'utf-8' })
        setMessages(previous => [
          ...previous,
          createSystemMessage(
            `Ultraplan rejected · Plan saved to ${getDisplayPath(planPath)}`,
            'suggestion',
          ),
        ])
      }
    }

    updateTaskState<RemoteAgentTaskState>(taskId, setAppState, task =>
      task.status !== 'running'
        ? task
        : { ...task, status: 'completed', endTime: Date.now() },
    )
    setAppState(current =>
      current.ultraplanPendingChoice
        ? {
            ...current,
            ultraplanPendingChoice: undefined,
            ultraplanSessionUrl: undefined,
          }
        : current,
    )
    void archiveRemoteSession(sessionId)
  }

  const { rows, columns } = useTerminalSize()
  const visibleLineCount = Math.min(
    MAX_VISIBLE_PLAN_LINES,
    Math.max(1, Math.floor(rows / 2) - RESERVED_TERMINAL_ROWS),
  )
  const lines = wrapText(plan, Math.max(1, columns - 4), 'wrap').split('\n')
  const maxOffset = Math.max(0, lines.length - visibleLineCount)
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    setOffset(current => Math.min(current, maxOffset))
  }, [maxOffset])

  const canScroll = lines.length > visibleLineCount
  const scrollBy = (amount: number): void => {
    if (!canScroll) return
    setOffset(current => Math.max(0, Math.min(current + amount, maxOffset)))
  }
  const handleKeyDown = (event: KeyboardEvent): void => {
    if (!event.ctrl || event.meta) return
    const halfPage = Math.max(1, Math.floor(visibleLineCount / 2))
    if (event.key === 'd') {
      event.preventDefault()
      scrollBy(halfPage)
    } else if (event.key === 'u') {
      event.preventDefault()
      scrollBy(-halfPage)
    }
  }
  const handleWheel = (event: WheelEvent): void => {
    event.preventDefault()
    scrollBy(event.deltaY > 0 ? 3 : -3)
  }
  const visiblePlan = lines
    .slice(offset, offset + visibleLineCount)
    .join('\n')

  return (
    <Dialog
      title="Ultraplan approved"
      subtitle="How should the plan be implemented?"
      onCancel={() => {}}
      isCancelActive={false}
      hideInputGuide
    >
      <Box
        flexDirection="column"
        marginBottom={1}
        onKeyDown={handleKeyDown}
        onWheel={handleWheel}
      >
        <Box flexDirection="column" marginBottom={1}>
          <Text>{visiblePlan}</Text>
          {canScroll && (
            <Text dimColor>
              {offset > 0 ? figures.arrowUp : ' '}
              {offset < maxOffset ? figures.arrowDown : ' '} {offset + 1}–
              {Math.min(offset + visibleLineCount, lines.length)} of{' '}
              {lines.length} · ctrl+u/ctrl+d to scroll
            </Text>
          )}
        </Box>
        <Select
          options={[
            {
              label: 'Implement here',
              value: 'here' as const,
              description: 'Inject plan into the current conversation',
            },
            {
              label: 'Start new session',
              value: 'fresh' as const,
              description: 'Clear conversation and start with only the plan',
            },
            {
              label: 'Cancel',
              value: 'cancel' as const,
              description: "Don't implement — save plan and return",
            },
          ]}
          onChange={choice => void handleChoice(choice)}
        />
      </Box>
    </Dialog>
  )
}
