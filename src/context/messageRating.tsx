import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useDebouncedDigitInput } from '../components/FeedbackSurvey/useDebouncedDigitInput.js'
import { useNotifications } from './notifications.js'
import { logEvent } from '../services/analytics/index.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { isFullscreenEnvEnabled } from '../utils/fullscreen.js'

export type MessageRatingSentiment = 'positive' | 'negative'
export type MessageRatingSurface =
  | 'tool_use'
  | 'assistant_text'
  | 'tiny_memory'

export type MessageRatingMetadata = Record<string, unknown>

type RateMessage = (
  messageUuid: string,
  sentiment: MessageRatingSentiment,
  surface?: MessageRatingSurface,
  metadata?: MessageRatingMetadata,
) => void

const RateMessageContext = createContext<RateMessage | null>(null)
const RatingsContext = createContext<
  ReadonlyMap<string, MessageRatingSentiment>
>(new Map())
const HoveredMessageContext = createContext<string | null>(null)
const HoveredToolUseContext = createContext<string | null>(null)
const SetHoveredMessageContext = createContext<(uuid: string | null) => void>(
  () => {},
)
const SetHoveredToolUseContext = createContext<
  React.Dispatch<React.SetStateAction<string | null>>
>(() => {})

/**
 * Shared rating state for the transcript surfaces. Hover clear is delayed so
 * the pointer can move from a message row into its controls without making
 * the controls disappear.
 */
export function MessageRatingProvider({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode {
  const [hoveredMessage, setHoveredMessageNow] = useState<string | null>(null)
  const [hoveredToolUse, setHoveredToolUse] = useState<string | null>(null)
  const [ratings, setRatings] = useState<
    Map<string, MessageRatingSentiment>
  >(() => new Map())
  const ratingsRef = useRef(ratings)
  ratingsRef.current = ratings
  const { addNotification } = useNotifications()
  const hoverClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (hoverClearTimer.current !== null) clearTimeout(hoverClearTimer.current)
    },
    [],
  )

  const setHoveredMessage = useCallback((uuid: string | null) => {
    if (hoverClearTimer.current !== null) {
      clearTimeout(hoverClearTimer.current)
      hoverClearTimer.current = null
    }
    if (uuid === null) {
      hoverClearTimer.current = setTimeout(() => {
        hoverClearTimer.current = null
        setHoveredMessageNow(null)
      }, 500)
    } else {
      setHoveredMessageNow(uuid)
    }
  }, [])

  const rateMessage = useCallback<RateMessage>(
    (messageUuid, sentiment, surface = 'tool_use', metadata) => {
      const cleared = ratingsRef.current.get(messageUuid) === sentiment
      setRatings(previous => {
        const next = new Map(previous)
        if (cleared) next.delete(messageUuid)
        else next.set(messageUuid, sentiment)
        return next
      })
      logEvent('tengu_message_rated', {
        ...metadata,
        message_uuid: messageUuid,
        sentiment,
        surface,
        cleared,
      })
      if (!cleared) {
        addNotification({
          key: 'message-rated',
          text: 'thanks for improving claude!',
          color: 'success',
          priority: 'immediate',
        })
      }
    },
    [addNotification],
  )

  return (
    <RateMessageContext.Provider value={rateMessage}>
      <RatingsContext.Provider value={ratings}>
        <HoveredToolUseContext.Provider value={hoveredToolUse}>
          <HoveredMessageContext.Provider value={hoveredMessage}>
            <SetHoveredMessageContext.Provider value={setHoveredMessage}>
              <SetHoveredToolUseContext.Provider value={setHoveredToolUse}>
                {children}
              </SetHoveredToolUseContext.Provider>
            </SetHoveredMessageContext.Provider>
          </HoveredMessageContext.Provider>
        </HoveredToolUseContext.Provider>
      </RatingsContext.Provider>
    </RateMessageContext.Provider>
  )
}

export function useRateMessage(): RateMessage | null {
  return useContext(RateMessageContext)
}

export function useMessageRating(
  messageUuid: string | undefined,
): MessageRatingSentiment | undefined {
  const ratings = useContext(RatingsContext)
  return messageUuid ? ratings.get(messageUuid) : undefined
}

export function useHoveredMessage(): string | null {
  return useContext(HoveredMessageContext)
}

export function useHoveredToolUse(): string | null {
  return useContext(HoveredToolUseContext)
}

export function useSetHoveredMessage(): (uuid: string | null) => void {
  return useContext(SetHoveredMessageContext)
}

export function useSetHoveredToolUse(): React.Dispatch<
  React.SetStateAction<string | null>
> {
  return useContext(SetHoveredToolUseContext)
}

const SYNTHESIS_PATH = /^<synthesis:(.+)>$/
const SOURCES_SEPARATOR = '\n\nSources: '

type RelevantMemory = { path: string; content: string }
type RelevantMemoryMessage = {
  type: 'attachment'
  uuid: string
  attachment: {
    type: 'relevant_memories'
    memories: RelevantMemory[]
  }
}

export function getRelevantMemoryRatingMetadata(
  memories: RelevantMemory[],
): { cited_team_count: number; cited_private_count: number } {
  let citedTeamCount = 0
  let citedPrivateCount = 0
  for (const memory of memories) {
    const separator = memory.content.lastIndexOf(SOURCES_SEPARATOR)
    if (separator === -1) continue
    for (const source of memory.content
      .slice(separator + SOURCES_SEPARATOR.length)
      .split(', ')
      .filter(Boolean)) {
      if (source.startsWith('team/') || source.startsWith('team\\')) {
        citedTeamCount++
      } else {
        citedPrivateCount++
      }
    }
  }
  return {
    cited_team_count: citedTeamCount,
    cited_private_count: citedPrivateCount,
  }
}

export function isSynthesizedRelevantMemories(
  memories: RelevantMemory[],
): boolean {
  return (
    memories.length > 0 &&
    memories.every(memory => SYNTHESIS_PATH.test(memory.path))
  )
}

export function isTinyMemoryRatingEnabled(): boolean {
  return getFeatureValue_CACHED_MAY_BE_STALE(
    'tengu_billiard_aviary',
    false,
  )
}

/** Accept the experimental +/- shortcut for the most recent synthesized memory. */
export function RelevantMemoryRatingInput({
  messages,
  inputValue,
  setInputValue,
  enabled,
}: {
  messages: readonly unknown[]
  inputValue: string
  setInputValue: (value: string) => void
  enabled: boolean
}): React.ReactNode {
  const rateMessage = useRateMessage()
  let relevant: RelevantMemoryMessage | null = null
  if (enabled) {
    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index] as Partial<RelevantMemoryMessage>
      if (
        message.type === 'attachment' &&
        message.attachment?.type === 'relevant_memories' &&
        isSynthesizedRelevantMemories(message.attachment.memories)
      ) {
        relevant = message as RelevantMemoryMessage
        break
      }
    }
  }

  const onDigit = useCallback(
    (digit: '+' | '-') => {
      if (rateMessage === null || relevant === null) return
      rateMessage(
        relevant.uuid,
        digit === '+' ? 'positive' : 'negative',
        'tiny_memory',
        getRelevantMemoryRatingMetadata(relevant.attachment.memories),
      )
    },
    [rateMessage, relevant],
  )

  useDebouncedDigitInput({
    inputValue,
    setInputValue,
    isValidDigit: (character): character is '+' | '-' =>
      character === '+' || character === '-',
    onDigit,
    enabled:
      enabled &&
      isFullscreenEnvEnabled() &&
      isTinyMemoryRatingEnabled() &&
      rateMessage !== null &&
      relevant !== null,
  })
  return null
}

export function getMemorySynthesis(content: string): string {
  const separator = content.lastIndexOf(SOURCES_SEPARATOR)
  return separator === -1 ? content : content.slice(0, separator)
}
