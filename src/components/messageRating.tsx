import type { ReactNode } from 'react'
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useNotifications } from '../context/notifications.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../services/analytics/index.js'

export type MessageRatingSentiment = 'positive' | 'negative'
export type MessageRatingSurface =
  | 'tool_use'
  | 'assistant_text'
  | 'tool_result'
  | 'tiny_memory'

type RatingTelemetryMetadata = Record<
  string,
  boolean | number | undefined
>
type RateMessage = (
  messageUuid: string,
  sentiment: MessageRatingSentiment,
  surface?: MessageRatingSurface,
  metadata?: RatingTelemetryMetadata,
) => void
type SetHoveredMessageUuid = (messageUuid: string | null) => void

const RateMessageContext = createContext<RateMessage | null>(null)
const EMPTY_RATINGS = new Map<string, MessageRatingSentiment>()
const MessageRatingsContext = createContext<
  ReadonlyMap<string, MessageRatingSentiment>
>(EMPTY_RATINGS)
const HoveredToolUseIdContext = createContext<string | null>(null)
const SetHoveredToolUseIdContext = createContext<
  React.Dispatch<React.SetStateAction<string | null>> | null
>(null)
const HoveredMessageUuidContext = createContext<string | null>(null)
const SetHoveredMessageUuidContext =
  createContext<SetHoveredMessageUuid | null>(null)

export function useMessageRating(
  messageUuid: string | undefined,
): MessageRatingSentiment | undefined {
  const ratings = useContext(MessageRatingsContext)
  return messageUuid ? ratings.get(messageUuid) : undefined
}

export function useHoveredToolUseId(): string | null {
  return useContext(HoveredToolUseIdContext)
}

export function useSetHoveredToolUseId(): React.Dispatch<
  React.SetStateAction<string | null>
> | null {
  return useContext(SetHoveredToolUseIdContext)
}

export function useHoveredMessageUuid(): string | null {
  return useContext(HoveredMessageUuidContext)
}

export function useSetHoveredMessageUuid(): SetHoveredMessageUuid | null {
  return useContext(SetHoveredMessageUuidContext)
}

export function useRateMessage(): RateMessage | null {
  return useContext(RateMessageContext)
}

export function MessageRatingProvider({ children }: { children: ReactNode }) {
  const [hoveredToolUseId, setHoveredToolUseId] = useState<string | null>(null)
  const [hoveredMessageUuid, setHoveredMessageUuid] = useState<string | null>(
    null,
  )
  const [ratings, setRatings] = useState(EMPTY_RATINGS)
  const ratingsRef = useRef(ratings)
  ratingsRef.current = ratings
  const { addNotification } = useNotifications()
  const hoverLeaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (hoverLeaveTimeout.current) clearTimeout(hoverLeaveTimeout.current)
    },
    [],
  )

  const setHoveredMessageUuidWithDelay = useCallback(
    (messageUuid: string | null) => {
      if (hoverLeaveTimeout.current) clearTimeout(hoverLeaveTimeout.current)
      hoverLeaveTimeout.current = null
      if (messageUuid === null) {
        hoverLeaveTimeout.current = setTimeout(setHoveredMessageUuid, 500, null)
      } else {
        setHoveredMessageUuid(messageUuid)
      }
    },
    [],
  )

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
        message_uuid:
          messageUuid as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        sentiment:
          sentiment as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        surface:
          surface as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
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
      <MessageRatingsContext.Provider value={ratings}>
        <SetHoveredToolUseIdContext.Provider value={setHoveredToolUseId}>
          <HoveredToolUseIdContext.Provider value={hoveredToolUseId}>
            <SetHoveredMessageUuidContext.Provider
              value={setHoveredMessageUuidWithDelay}
            >
              <HoveredMessageUuidContext.Provider value={hoveredMessageUuid}>
                {children}
              </HoveredMessageUuidContext.Provider>
            </SetHoveredMessageUuidContext.Provider>
          </HoveredToolUseIdContext.Provider>
        </SetHoveredToolUseIdContext.Provider>
      </MessageRatingsContext.Provider>
    </RateMessageContext.Provider>
  )
}
