import { c as _c } from "react/compiler-runtime";
import type { ReactNode } from 'react'
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useNotifications } from '../context/notifications.js'
import { type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS, logEvent } from '../services/analytics/index.js'

export type MessageRatingSentiment = 'positive' | 'negative'
type RateMessage = (messageUuid: string, sentiment: MessageRatingSentiment) => void
type SetHoveredMessageUuid = (messageUuid: string | null) => void

const RateMessageContext = createContext<RateMessage | null>(null)
const EMPTY_RATINGS = new Map<string, MessageRatingSentiment>()
const MessageRatingsContext = createContext<ReadonlyMap<string, MessageRatingSentiment>>(EMPTY_RATINGS)
const HoveredToolUseIdContext = createContext<string | null>(null)
const SetHoveredToolUseIdContext = createContext<React.Dispatch<React.SetStateAction<string | null>> | null>(null)
const HoveredMessageUuidContext = createContext<string | null>(null)
const SetHoveredMessageUuidContext = createContext<SetHoveredMessageUuid | null>(null)

export function useMessageRating(messageUuid: string | undefined): MessageRatingSentiment | undefined {
  const $ = _c(3);
  const ratings = useContext(MessageRatingsContext);
  let t0;
  if ($[0] !== messageUuid || $[1] !== ratings) {
    t0 = messageUuid ? ratings.get(messageUuid) : undefined;
    $[0] = messageUuid;
    $[1] = ratings;
    $[2] = t0;
  } else {
    t0 = $[2];
  }
  return t0;
}
export function useHoveredToolUseId(): string | null { return useContext(HoveredToolUseIdContext) }
export function useSetHoveredToolUseId(): React.Dispatch<React.SetStateAction<string | null>> | null { return useContext(SetHoveredToolUseIdContext) }
export function useHoveredMessageUuid(): string | null { return useContext(HoveredMessageUuidContext) }
export function useSetHoveredMessageUuid(): SetHoveredMessageUuid | null { return useContext(SetHoveredMessageUuidContext) }
export function useRateMessage(): RateMessage | null { return useContext(RateMessageContext) }

export function MessageRatingProvider({ children }: { children: ReactNode }) {
  const [hoveredToolUseId, setHoveredToolUseId] = useState<string | null>(null)
  const [hoveredMessageUuid, setHoveredMessageUuid] = useState<string | null>(null)
  const [ratings, setRatings] = useState(EMPTY_RATINGS)
  const ratingsRef = useRef(ratings)
  ratingsRef.current = ratings
  const { addNotification } = useNotifications()
  const hoverLeaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (hoverLeaveTimeout.current) clearTimeout(hoverLeaveTimeout.current) }, [])
  const setHoveredMessageUuidWithDelay = useCallback((messageUuid: string | null) => {
    if (hoverLeaveTimeout.current) {
      clearTimeout(hoverLeaveTimeout.current)
      hoverLeaveTimeout.current = null
    }
    if (messageUuid === null) hoverLeaveTimeout.current = setTimeout((setter: typeof setHoveredMessageUuid) => setter(null), 150, setHoveredMessageUuid)
    else setHoveredMessageUuid(messageUuid)
  }, [])
  const rateMessage = useCallback<RateMessage>((messageUuid, sentiment) => {
    const cleared = ratingsRef.current.get(messageUuid) === sentiment
    setRatings(previous => {
      const updated = new Map(previous)
      if (cleared) updated.delete(messageUuid)
      else updated.set(messageUuid, sentiment)
      return updated
    })
    logEvent('tengu_message_rated', {
      message_uuid: messageUuid as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      sentiment: sentiment as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      cleared,
    })
    if (!cleared) addNotification({ key: 'message-rated', text: 'thanks for improving claude!', color: 'success', priority: 'immediate' })
  }, [addNotification])
  return <RateMessageContext.Provider value={rateMessage}><MessageRatingsContext.Provider value={ratings}><SetHoveredToolUseIdContext.Provider value={setHoveredToolUseId}><HoveredToolUseIdContext.Provider value={hoveredToolUseId}><SetHoveredMessageUuidContext.Provider value={setHoveredMessageUuidWithDelay}><HoveredMessageUuidContext.Provider value={hoveredMessageUuid}>{children}</HoveredMessageUuidContext.Provider></SetHoveredMessageUuidContext.Provider></HoveredToolUseIdContext.Provider></SetHoveredToolUseIdContext.Provider></MessageRatingsContext.Provider></RateMessageContext.Provider>
}
