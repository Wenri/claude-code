import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useInterval } from 'usehooks-ts'
import { getRuntimeCapabilities } from '../../bootstrap/state.js'
import { Markdown } from '../../components/Markdown.js'
import { SpinnerGlyph } from '../../components/Spinner/SpinnerGlyph.js'
import { Byline } from '../../components/design-system/Byline.js'
import { KeyboardShortcutHint } from '../../components/design-system/KeyboardShortcutHint.js'
import { DOWN_ARROW, UP_ARROW } from '../../constants/figures.js'
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
import { truncateToWidth } from '../../utils/format.js'
import {
  createAssistantMessage,
  createUserMessage,
  getMessagesAfterCompactBoundary,
} from '../../utils/messages.js'
import type { ProcessUserInputContext } from '../../utils/processUserInput/processUserInput.js'
import {
  appendSideQuestionHistory,
  clearSideQuestionHistory,
  getSideQuestionHistory,
  runSideQuestion,
  setSideQuestionHistory,
  type SideQuestionRetry,
} from '../../utils/sideQuestion.js'
import { asSystemPrompt } from '../../utils/systemPromptType.js'

type BtwComponentProps = {
  question: string
  context: ProcessUserInputContext
  onDone: LocalJSXCommandOnDone
}

type RetryState = SideQuestionRetry & {
  retryAt: number
}

type RemoteSideQuestionResult = {
  response: string | null
  synthetic?: boolean
}

const CHROME_ROWS = 5
const OUTER_CHROME_ROWS = 6
const SCROLL_LINES = 3
const VISIBLE_HISTORY_ENTRIES = 5

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
  const forkingRef = useRef(false)
  const [isForking, setIsForking] = useState(false)
  const scrollRef = useRef<ScrollBoxHandle | null>(null)
  const { rows, columns } = useModalOrTerminalSize(useTerminalSize())
  const remote = getRuntimeCapabilities().remote

  useInterval(
    () => setFrame(current => current + 1),
    response || error ? null : 80,
  )

  function handleKeyDown(event: KeyboardEvent): void {
    if (forkingRef.current) {
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

    if (event.key === 'f' && response && !synthetic && !remote) {
      event.preventDefault()
      forkingRef.current = true
      setIsForking(true)

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
            customTitle: truncateSummary(`btw: ${question}`, 80),
            extraMessages,
          }).then(success => {
            if (success) {
              clearSideQuestionHistory()
            } else {
              forkingRef.current = false
              setIsForking(false)
            }
          }),
        )
        .catch(reason => {
          forkingRef.current = false
          setIsForking(false)
          onDone(`Failed to branch conversation: ${errorMessage(reason)}`)
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
    const parentController = createAbortController()

    async function fetchResponse(): Promise<void> {
      try {
        const activeRemote = getRuntimeCapabilities().remote
        const result: RemoteSideQuestionResult = activeRemote
          ? await activeRemote.sendControlRequest<RemoteSideQuestionResult>({
              subtype: 'side_question',
              question,
            })
          : await runSideQuestion({
              question,
              cacheSafeParams: await buildCacheSafeParams(context),
              parentController,
              onRetry: nextRetry => {
                if (parentController.signal.aborted) return
                setRetry({
                  ...nextRetry,
                  retryAt: Date.now() + nextRetry.retryInMs,
                })
              },
            })

        if (parentController.signal.aborted) return
        if (result.response) {
          setResponse(result.response)
          setSynthetic(result.synthetic ?? false)
          if (activeRemote && !result.synthetic) {
            appendSideQuestionHistory(question, result.response)
          }
        } else {
          setError('No response received')
        }
      } catch (reason) {
        if (!parentController.signal.aborted) {
          setError(errorMessage(reason) || 'Failed to get response')
        }
      }
    }

    void fetchResponse()
    return () => {
      parentController.abort()
    }
  }, [question, context])

  const visibleHistory = history.slice(-VISIBLE_HISTORY_ENTRIES)
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
      autoFocus={true}
      onKeyDown={handleKeyDown}
    >
      {earlierCount > 0 && (
        <Text dimColor={true}>(+{earlierCount} earlier /btw)</Text>
      )}
      {visibleHistory.map((entry, index) => (
        <Text key={earlierCount + index} dimColor={true}>
          /btw {truncateSummary(entry.question, questionWidth)}
        </Text>
      ))}
      <Text>
        <Text color="warning" bold={true}>
          /btw{' '}
        </Text>
        <Text dimColor={true}>{truncateSummary(question, questionWidth)}</Text>
      </Text>
      <Box marginTop={1} marginLeft={2} maxHeight={maxContentHeight}>
        <ScrollBox
          ref={scrollRef}
          flexDirection="column"
          flexGrow={1}
        >
          {error ? (
            <Text color="error">{errorMessage(error)}</Text>
          ) : response ? (
            <Markdown>{response}</Markdown>
          ) : (
            <LoadingState frame={frame} retry={retry} />
          )}
        </ScrollBox>
      </Box>
      <Box marginTop={1}>
        {isForking ? (
          <Text dimColor={true}>Forking into a new session…</Text>
        ) : (
          <Text dimColor={true}>
            <Byline>
              {(response || error) && (
                <KeyboardShortcutHint
                  shortcut={`${UP_ARROW}/${DOWN_ARROW}`}
                  action="scroll"
                />
              )}
              {response && !synthetic && !remote && (
                <KeyboardShortcutHint shortcut="f" action="fork" />
              )}
              {history.length > 0 && (
                <KeyboardShortcutHint shortcut="x" action="clear history" />
              )}
              <KeyboardShortcutHint shortcut="escape" action="dismiss" />
            </Byline>
          </Text>
        )}
      </Box>
    </Box>
  )
}

function truncateSummary(text: string, width: number): string {
  return truncateToWidth(text.replace(/\s+/g, ' ').trim(), width)
}

function LoadingState({
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

  const seconds = Math.max(
    0,
    Math.ceil((retry.retryAt - Date.now()) / 1000),
  )
  return (
    <Box>
      <SpinnerGlyph frame={frame} messageColor="warning" />
      <Text color="warning">{getRetryStatus(retry.status)}</Text>
      <Text dimColor={true}>
        {' · retrying in '}
        {seconds}s · attempt {retry.retryAttempt}/{retry.maxRetries}
      </Text>
    </Box>
  )
}

function getRetryStatus(status: number | undefined): string {
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

/**
 * Build CacheSafeParams for the side question fork.
 *
 * The preferred source is getLastCacheSafeParams — the exact
 * systemPrompt/userContext/systemContext bytes the main thread sent on its
 * last request (captured in stopHooks). Reusing them guarantees a byte-
 * identical prefix and thus a prompt cache hit. We pair these with the
 * current toolUseContext (for thinkingConfig/tools) and current messages
 * (for up-to-date context).
 */
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
    <BtwSideQuestion
      question={question}
      context={context}
      onDone={onDone}
    />
  )
}
