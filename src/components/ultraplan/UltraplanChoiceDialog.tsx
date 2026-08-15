import { stat, writeFile } from 'fs/promises'
import { join } from 'path'
import React, { useEffect, useState } from 'react'
import { getSessionId } from '../../bootstrap/state.js'
import { clearConversation } from '../../commands/clear/conversation.js'
import { useRegisterOverlay } from '../../context/overlayContext.js'
import { useTaskRegistry } from '../../hooks/useTaskRegistry.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import { Box, Text } from '../../ink.js'
import wrapText from '../../ink/wrap-text.js'
import { useSetAppState } from '../../state/AppState.js'
import type { RemoteAgentTaskState } from '../../tasks/RemoteAgentTask/RemoteAgentTask.js'
import { enqueue, enqueuePendingNotification } from '../../utils/messageQueueManager.js'
import { createSystemMessage } from '../../utils/messages.js'
import { toRelativePath } from '../../utils/path.js'
import { getProjectTempDir } from '../../utils/permissions/filesystem.js'
import { getPlanSlug } from '../../utils/plans.js'
import { getTranscriptPath } from '../../utils/sessionStorage.js'
import { archiveRemoteSession } from '../../utils/teleport.js'
import type { ToolIsolationLatch } from '../../utils/toolIsolation.js'
import { Select } from '../CustomSelect/select.js'
import { Dialog } from '../design-system/Dialog.js'

type Choice = 'here' | 'fresh' | 'cancel'

type Props = {
  plan: string
  sessionId: string
  taskId: string
  setMessages: (updater: (messages: any[]) => any[]) => void
  readFileState: any
  sessionEnvVars?: Map<string, string>
  memorySelector?: any
  getAppState: () => any
  setConversationId?: (id: any) => void
  resultDedupState?: any
  isolationLatch?: ToolIsolationLatch
}

const MAX_VISIBLE_PLAN_ROWS = 24
const RESERVED_DIALOG_ROWS = 11

const transcriptExists = () => stat(getTranscriptPath()).then(
  () => true,
  () => false,
)

const clearPendingChoice = (state: any) =>
  state.ultraplanPendingChoice
    ? {
        ...state,
        ultraplanPendingChoice: undefined,
        ultraplanSessionUrl: undefined,
      }
    : state

export function UltraplanChoiceDialog({
  plan,
  sessionId,
  taskId,
  setMessages,
  readFileState,
  sessionEnvVars,
  memorySelector,
  getAppState,
  setConversationId,
  resultDedupState,
  isolationLatch,
}: Props): React.ReactNode {
  useRegisterOverlay('ultraplan-choice')
  const setAppState = useSetAppState()
  const taskRegistry = useTaskRegistry()

  const choose = async (choice: Choice) => {
    switch (choice) {
      case 'here':
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
      case 'fresh': {
        const priorSessionId = getSessionId()
        const hadTranscript = await transcriptExists()
        await clearConversation({
          setMessages,
          readFileState,
          sessionEnvVars,
          memorySelector,
          getAppState,
          setAppState,
          setConversationId,
          resultDedupState,
          isolationLatch,
        })
        if (hadTranscript) {
          setMessages(messages => [
            ...messages,
            createSystemMessage(
              `Previous session saved · resume with: claude --resume ${priorSessionId}`,
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
        const path = join(getProjectTempDir(), `${getPlanSlug()}-ultraplan.md`)
        await writeFile(path, plan, { encoding: 'utf-8' })
        setMessages(messages => [
          ...messages,
          createSystemMessage(
            `Ultraplan rejected · Plan saved to ${toRelativePath(path)}`,
            'suggestion',
          ),
        ])
        break
      }
    }

    taskRegistry.update<RemoteAgentTaskState>(taskId, task =>
      task.status !== 'running'
        ? task
        : { ...task, status: 'completed', endTime: Date.now() },
    )
    setAppState(clearPendingChoice)
    void archiveRemoteSession(sessionId)
  }

  const { rows, columns } = useTerminalSize()
  const visibleRows = Math.min(
    MAX_VISIBLE_PLAN_ROWS,
    Math.max(1, Math.floor(rows / 2) - RESERVED_DIALOG_ROWS),
  )
  const lines = wrapText(plan, Math.max(1, columns - 4), 'wrap').split('\n')
  const maxOffset = Math.max(0, lines.length - visibleRows)
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    setOffset(value => Math.min(value, maxOffset))
  }, [maxOffset])

  const scrollable = lines.length > visibleRows
  const scroll = (delta: number) => {
    if (!scrollable) return
    setOffset(value => Math.max(0, Math.min(value + delta, maxOffset)))
  }
  const handleKeyDown = (event: any) => {
    if (!event.ctrl || event.meta) return
    const page = Math.max(1, Math.floor(visibleRows / 2))
    if (event.key === 'd') {
      event.preventDefault()
      scroll(page)
    } else if (event.key === 'u') {
      event.preventDefault()
      scroll(-page)
    }
  }
  const handleWheel = (event: any) => {
    event.preventDefault()
    scroll(event.deltaY > 0 ? 3 : -3)
  }

  const shown = lines.slice(offset, offset + visibleRows).join('\n')
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
          <Text>{shown}</Text>
          {scrollable && (
            <Text dimColor>
              {offset > 0 ? '↑' : ' '} {offset < maxOffset ? '↓' : ' '}{' '}
              {offset + 1}–{Math.min(offset + visibleRows, lines.length)} of{' '}
              {lines.length} · ctrl+u/ctrl+d to scroll
            </Text>
          )}
        </Box>
        <Select<Choice>
          options={[
            {
              label: 'Implement here',
              value: 'here',
              description: 'Inject plan into the current conversation',
            },
            {
              label: 'Start new session',
              value: 'fresh',
              description: 'Clear conversation and start with only the plan',
            },
            {
              label: 'Cancel',
              value: 'cancel',
              description: "Don't implement — save plan and return",
            },
          ]}
          onChange={choice => void choose(choice)}
        />
      </Box>
    </Dialog>
  )
}
