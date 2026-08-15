import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useInterval } from 'usehooks-ts'
import type { CommandResultDisplay } from '../../commands.js'
import { Markdown } from '../../components/Markdown.js'
import { Byline } from '../../components/design-system/Byline.js'
import { KeyboardShortcutHint } from '../../components/design-system/KeyboardShortcutHint.js'
import { SpinnerGlyph } from '../../components/Spinner/SpinnerGlyph.js'
import { getSystemPrompt } from '../../constants/prompts.js'
import { useModalOrTerminalSize } from '../../context/modalContext.js'
import { getSystemContext, getUserContext } from '../../context.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import ScrollBox, {
  type ScrollBoxHandle,
} from '../../ink/components/ScrollBox.js'
import type { KeyboardEvent } from '../../ink/events/keyboard-event.js'
import { Box, Text } from '../../ink.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import type { Message } from '../../types/message.js'
import { createAbortController } from '../../utils/abortController.js'
import { saveGlobalConfig } from '../../utils/config.js'
import { errorMessage } from '../../utils/errors.js'
import {
  type CacheSafeParams,
  getLastCacheSafeParams,
} from '../../utils/forkedAgent.js'
import {
  createAssistantMessage,
  createUserMessage,
  getMessagesAfterCompactBoundary,
} from '../../utils/messages.js'
import type { ProcessUserInputContext } from '../../utils/processUserInput/processUserInput.js'
import {
  clearSideQuestionHistory,
  getSideQuestionHistory,
  runSideQuestion,
  setSideQuestionHistory,
  type SideQuestionRetry,
} from '../../utils/sideQuestion.js'
import { asSystemPrompt } from '../../utils/systemPromptType.js'
import { truncate } from '../../utils/truncate.js'

type BtwComponentProps = {
  question: string
  context: ProcessUserInputContext
  onDone: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
}

type RetryState = SideQuestionRetry & { retryAt: number }

const CHROME_ROWS = 5
const OUTER_CHROME_ROWS = 6
const SCROLL_LINES = 3
const VISIBLE_HISTORY_ROWS = 5

function retryLabel(status: number | undefined): string {
  switch (status) {
    case 429:
      return 'Rate limited'
    case 529:
      return 'API overloaded'
    case 401:
    case 403:
      return 'Authentication failed'
    default:
      return 'API error'
  }
}

function Answering({
  frame,
  retry,
}: {
  frame: number
  retry: RetryState | null
}): React.ReactNode {
  if (!retry) {
    return (
      <Box>
        <SpinnerGlyph frame={frame} messageColor="warning" />
        <Text color="warning">Answering…</Text>
      </Box>
    )
  }
  const seconds = Math.max(0, Math.ceil((retry.retryAt - Date.now()) / 1000))
  return (
    <Box>
      <SpinnerGlyph frame={frame} messageColor="warning" />
      <Text color="warning">{retryLabel(retry.status)}</Text>
      <Text dimColor>
        {' · retrying in '}
        {seconds}s · attempt {retry.retryAttempt}/{retry.maxRetries}
      </Text>
    </Box>
  )
}

function singleLine(value: string, width: number): string {
  return truncate(value.replace(/\s+/g, ' ').trim(), width)
}

function BtwSideQuestion({
  question,
  context,
  onDone,
}: BtwComponentProps): React.ReactNode {
  const [response, setResponse] = useState<string | null>(null)
  const [synthetic, setSynthetic] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState<RetryState | null>(null)
  const [frame, setFrame] = useState(0)
  const [history, setHistory] = useState(() => getSideQuestionHistory())
  const historyRef = useRef(history)
  const branchingRef = useRef(false)
  const [branching, setBranching] = useState(false)
  const scrollRef = useRef<ScrollBoxHandle>(null)
  const { rows, columns } = useModalOrTerminalSize(useTerminalSize())

  useInterval(() => setFrame(value => value + 1), response || error ? null : 80)

  function handleKeyDown(event: KeyboardEvent): void {
    if (branchingRef.current) {
      event.preventDefault()
      return
    }
    if (
      event.key === 'escape' ||
      event.key === 'return' ||
      event.key === ' ' ||
      (event.ctrl && (event.key === 'c' || event.key === 'd'))
    ) {
      event.preventDefault()
      onDone(undefined, { display: 'skip' })
      return
    }
    if (event.key === 'x' && historyRef.current.length > 0) {
      event.preventDefault()
      setSideQuestionHistory(
        response && !synthetic ? [{ question, response }] : [],
      )
      historyRef.current = []
      setHistory([])
      return
    }
    if (event.key === 'f' && response && !synthetic) {
      event.preventDefault()
      branchingRef.current = true
      setBranching(true)
      const extraMessages = [
        ...historyRef.current.flatMap(entry => [
          createUserMessage({ content: entry.question }),
          createAssistantMessage({ content: entry.response }),
        ]),
        createUserMessage({ content: question }),
        createAssistantMessage({ content: response }),
      ]
      void import('../branch/branch.js')
        .then(({ branchAndResume }) =>
          branchAndResume(context, onDone, {
            customTitle: singleLine(`btw: ${question}`, 80),
            extraMessages,
          }),
        )
        .then(success => {
          if (success) clearSideQuestionHistory()
          else {
            branchingRef.current = false
            setBranching(false)
          }
        })
        .catch(cause => {
          branchingRef.current = false
          setBranching(false)
          onDone(`Failed to branch conversation: ${errorMessage(cause)}`)
        })
      return
    }
    if (event.key === 'up' || (event.ctrl && event.key === 'p')) {
      event.preventDefault()
      scrollRef.current?.scrollBy(-SCROLL_LINES)
    }
    if (event.key === 'down' || (event.ctrl && event.key === 'n')) {
      event.preventDefault()
      scrollRef.current?.scrollBy(SCROLL_LINES)
    }
  }

  useEffect(() => {
    const abortController = createAbortController()
    async function fetchResponse(): Promise<void> {
      try {
        const cacheSafeParams = await buildCacheSafeParams(context)
        const result = await runSideQuestion({
          question,
          cacheSafeParams,
          parentController: abortController,
          onRetry: next => {
            if (!abortController.signal.aborted) {
              setRetry({ ...next, retryAt: Date.now() + next.retryInMs })
            }
          },
        })
        if (!abortController.signal.aborted) {
          if (result.response) {
            setResponse(result.response)
            setSynthetic(result.synthetic)
          } else {
            setError('No response received')
          }
        }
      } catch (cause) {
        if (!abortController.signal.aborted) {
          setError(errorMessage(cause) || 'Failed to get response')
        }
      }
    }
    void fetchResponse()
    return () => abortController.abort()
  }, [question, context])

  const visibleHistory = history.slice(-VISIBLE_HISTORY_ROWS)
  const earlierCount = history.length - visibleHistory.length
  const historyRows = visibleHistory.length + (earlierCount > 0 ? 1 : 0)
  const questionWidth = Math.max(20, columns - 7)
  const maxContentHeight = Math.max(
    5,
    rows - CHROME_ROWS - OUTER_CHROME_ROWS - historyRows,
  )

  return (
    <Box
      flexDirection="column"
      paddingLeft={2}
      marginTop={1}
      tabIndex={0}
      autoFocus
      onKeyDown={handleKeyDown}
    >
      {earlierCount > 0 && <Text dimColor>(+{earlierCount} earlier /btw)</Text>}
      {visibleHistory.map((entry, index) => (
        <Text key={earlierCount + index} dimColor>
          /btw {singleLine(entry.question, questionWidth)}
        </Text>
      ))}
      <Text>
        <Text color="warning" bold>/btw{' '}</Text>
        <Text dimColor>{singleLine(question, questionWidth)}</Text>
      </Text>
      <Box marginTop={1} marginLeft={2} maxHeight={maxContentHeight}>
        <ScrollBox ref={scrollRef} flexDirection="column" flexGrow={1}>
          {error ? (
            <Text color="error">{error}</Text>
          ) : response ? (
            <Markdown>{response}</Markdown>
          ) : (
            <Answering frame={frame} retry={retry} />
          )}
        </ScrollBox>
      </Box>
      <Box marginTop={1}>
        {branching ? (
          <Text dimColor>Forking into a new session…</Text>
        ) : (
          <Text dimColor>
            <Byline>
              {(response || error) && (
                <KeyboardShortcutHint chord={['up', 'down']} action="scroll" />
              )}
              {response && !synthetic && (
                <KeyboardShortcutHint chord="f" action="fork" />
              )}
              {history.length > 0 && (
                <KeyboardShortcutHint chord="x" action="clear history" />
              )}
              <KeyboardShortcutHint chord="escape" action="dismiss" />
            </Byline>
          </Text>
        )}
      </Box>
    </Box>
  )
}

function stripInProgressAssistantMessage(messages: Message[]): Message[] {
  const last = messages.at(-1)
  if (last?.type === 'assistant' && last.message.stop_reason === null) {
    return messages.slice(0, -1)
  }
  return messages
}

async function buildCacheSafeParams(
  context: ProcessUserInputContext,
): Promise<CacheSafeParams> {
  const forkContextMessages = getMessagesAfterCompactBoundary(
    stripInProgressAssistantMessage(context.messages),
  )
  const saved = getLastCacheSafeParams()
  if (saved) {
    return {
      systemPrompt: saved.systemPrompt,
      userContext: saved.userContext,
      systemContext: saved.systemContext,
      toolUseContext: context,
      forkContextMessages,
    }
  }
  const [rawSystemPrompt, userContext, systemContext] = await Promise.all([
    getSystemPrompt(
      context.options.tools,
      context.options.mainLoopModel,
      [],
      context.options.mcpClients,
    ),
    getUserContext(),
    getSystemContext(),
  ])
  return {
    systemPrompt: asSystemPrompt(rawSystemPrompt),
    userContext,
    systemContext,
    toolUseContext: context,
    forkContextMessages,
  }
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: ProcessUserInputContext,
  args: string,
): Promise<React.ReactNode> {
  const question = args?.trim()
  if (!question) {
    onDone('Usage: /btw <your question>', { display: 'system' })
    return null
  }
  saveGlobalConfig(current => ({
    ...current,
    btwUseCount: current.btwUseCount + 1,
  }))
  return (
    <BtwSideQuestion question={question} context={context} onDone={onDone} />
  )
}
