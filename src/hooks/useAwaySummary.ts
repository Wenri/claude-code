import { feature } from 'bun:bundle'
import { unlink } from 'fs/promises'
import { join } from 'path'
import { useEffect, useRef, type RefObject } from 'react'
import {
  getTerminalFocusState,
  subscribeTerminalFocus,
} from '../ink/terminal-focus-state.js'
import { getDynamicConfig_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { should1hCacheTTL } from '../services/api/claude.js'
import { generateAwaySummary } from '../services/awaySummary.js'
import { logEvent } from '../services/analytics/index.js'
import { useAppState } from '../state/AppState.js'
import type { Message } from '../types/message.js'
import { isBgSession } from '../utils/concurrentSessions.js'
import { logForDebugging } from '../utils/debug.js'
import { isFullscreenEnvEnabled } from '../utils/fullscreen.js'
import { createAwaySummaryMessage } from '../utils/messages.js'

const DEFAULT_DELAY_MS = 180_000
const MIN_CONFIGURED_DELAY_MS = 30_000
const RETURN_TELEMETRY_BLUR_MS = 300_000
const FIVE_MINUTE_CACHE_TTL_MS = 300_000
const ONE_HOUR_CACHE_TTL_MS = 3_600_000
const MIN_TOTAL_USER_TURNS = 3
const MIN_USER_TURNS_SINCE_RECAP = 2
const RECAP_TRIGGER_POLL_MS = 500
const RECAP_TRIGGER_FILENAME = 'recap.trigger'

type SetMessages = (updater: (prev: Message[]) => Message[]) => void
type GenerateOptions = { force?: boolean }

function isHumanUserMessage(message: Message): boolean {
  return (
    message.type === 'user' &&
    !message.isMeta &&
    !message.isCompactSummary &&
    !message.isVirtual
  )
}

/** The latest meaningful message is a recap (a trailing API metrics row is ignored). */
function hasLatestRecap(messages: readonly Message[]): boolean {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!
    if (message.type === 'system' && message.subtype === 'api_metrics') continue
    return message.type === 'system' && message.subtype === 'away_summary'
  }
  return false
}

function isEligibleForAutomaticRecap(messages: readonly Message[]): boolean {
  let totalUserTurns = 0
  let latestRecapIndex = -1
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index]!
    if (isHumanUserMessage(message)) totalUserTurns++
    if (message.type === 'system' && message.subtype === 'away_summary') {
      latestRecapIndex = index
    }
  }
  if (totalUserTurns < MIN_TOTAL_USER_TURNS) return false
  if (latestRecapIndex === -1) return true
  let turnsSinceRecap = 0
  for (let index = latestRecapIndex + 1; index < messages.length; index++) {
    if (isHumanUserMessage(messages[index]!)) turnsSinceRecap++
  }
  return turnsSinceRecap >= MIN_USER_TURNS_SINCE_RECAP
}

/**
 * Generate recaps while the terminal is away without forfeiting the main
 * thread's prompt-cache entry. The timer is based on the most recent completed
 * turn and its actual cache TTL, not merely wall-clock blur duration.
 */
export function useAwaySummary(
  messages: readonly Message[],
  setMessages: SetMessages,
  isLoading: boolean,
  lastUserScrollAtRef: RefObject<number>,
  enabled = true,
  draftInputRef?: RefObject<string>,
): void {
  const abortRef = useRef<AbortController | null>(null)
  const recapCountRef = useRef(0)
  const messagesRef = useRef(messages)
  const isLoadingRef = useRef(isLoading)
  const generateRef = useRef<
    ((options?: GenerateOptions) => Promise<void>) | null
  >(null)
  const cacheCompletedAtRef = useRef<number | null>(null)
  const cacheTtlRef = useRef<number | null>(null)
  const delayRef = useRef(DEFAULT_DELAY_MS)
  const blurStartedAtRef = useRef<number | null>(null)
  const focusedAtRef = useRef<number | null>(null)
  const blurDurationRef = useRef<number | null>(null)
  const returnTelemetryPendingRef = useRef(false)
  const hadRecapOnReturnRef = useRef(false)

  messagesRef.current = messages
  if (isLoadingRef.current && !isLoading) {
    cacheCompletedAtRef.current = Date.now()
    cacheTtlRef.current = should1hCacheTTL('repl_main_thread')
      ? ONE_HOUR_CACHE_TTL_MS
      : FIVE_MINUTE_CACHE_TTL_MS
  }
  isLoadingRef.current = isLoading

  const awaySummaryEnabled = useAppState(state => state.awaySummaryEnabled)
  const recapEnabled = feature('AWAY_SUMMARY')
    ? enabled && Boolean(awaySummaryEnabled)
    : false
  const configuredDelay = getDynamicConfig_CACHED_MAY_BE_STALE<{
    delayMs?: number
  }>('tengu_sedge_lantern_config', { delayMs: DEFAULT_DELAY_MS }).delayMs
  delayRef.current =
    typeof configuredDelay === 'number' && Number.isFinite(configuredDelay)
      ? Math.max(MIN_CONFIGURED_DELAY_MS, configuredDelay)
      : DEFAULT_DELAY_MS

  useEffect(() => {
    if (!recapEnabled) return

    function abortInFlight(): void {
      abortRef.current?.abort()
      abortRef.current = null
    }

    async function generate(options?: GenerateOptions): Promise<void> {
      const cacheCompletedAt = cacheCompletedAtRef.current
      const cacheTtl = cacheTtlRef.current
      if (cacheCompletedAt === null || cacheTtl === null) {
        logForDebugging('[awaySummary] skipped: cache age unknown')
        return
      }
      if (Date.now() - cacheCompletedAt > cacheTtl * 0.9) {
        logForDebugging('[awaySummary] skipped: cache stale')
        return
      }
      if (!options?.force && (draftInputRef?.current ?? '') !== '') {
        logForDebugging('[awaySummary] skipped: draft input present')
        return
      }
      if (!options?.force && !isEligibleForAutomaticRecap(messagesRef.current)) {
        return
      }
      if (hasLatestRecap(messagesRef.current)) return

      abortInFlight()
      const controller = new AbortController()
      abortRef.current = controller
      const result = await generateAwaySummary(controller.signal)
      if (controller.signal.aborted || result.kind !== 'ok') return
      const content =
        recapCountRef.current < 3
          ? `${result.text} (disable recaps in /config)`
          : result.text
      recapCountRef.current++
      setMessages(previous => {
        const recap = createAwaySummaryMessage(content)
        const last = previous.at(-1)
        if (last?.type === 'system' && last.subtype === 'api_metrics') {
          return [...previous.slice(0, -1), recap, last]
        }
        return [...previous, recap]
      })
    }

    function onFocusChange(): void {
      const focus = getTerminalFocusState()
      if (focus === 'blurred') {
        blurStartedAtRef.current = Date.now()
        const cacheCompletedAt = cacheCompletedAtRef.current
        const cacheTtl = cacheTtlRef.current ?? ONE_HOUR_CACHE_TTL_MS
        if (
          cacheCompletedAt !== null &&
          Date.now() - cacheCompletedAt >=
            Math.min(delayRef.current, cacheTtl * 0.8) &&
          !isLoadingRef.current
        ) {
          void generate()
        }
      } else if (focus === 'focused') {
        abortInFlight()
        if (blurStartedAtRef.current !== null) {
          const now = Date.now()
          const blurDuration = now - blurStartedAtRef.current
          if (blurDuration >= RETURN_TELEMETRY_BLUR_MS) {
            focusedAtRef.current = now
            blurDurationRef.current = blurDuration
            returnTelemetryPendingRef.current = true
            hadRecapOnReturnRef.current = hasLatestRecap(messagesRef.current)
          }
          blurStartedAtRef.current = null
        }
      }
    }

    const unsubscribe = subscribeTerminalFocus(onFocusChange)
    generateRef.current = generate
    onFocusChange()
    return () => {
      unsubscribe()
      abortInFlight()
      generateRef.current = null
      blurStartedAtRef.current = null
      focusedAtRef.current = null
      blurDurationRef.current = null
      returnTelemetryPendingRef.current = false
      hadRecapOnReturnRef.current = false
    }
  }, [recapEnabled, setMessages, draftInputRef])

  useEffect(() => {
    if (isLoading || !recapEnabled) return
    const cacheCompletedAt = cacheCompletedAtRef.current
    if (cacheCompletedAt === null) return
    const cacheTtl = cacheTtlRef.current ?? ONE_HOUR_CACHE_TTL_MS
    const delay = Math.min(delayRef.current, cacheTtl * 0.8)
    const remaining = Math.max(0, delay - (Date.now() - cacheCompletedAt))
    const timer = setTimeout(() => {
      if (getTerminalFocusState() === 'blurred' && !isLoadingRef.current) {
        void generateRef.current?.()
      }
    }, remaining)
    return () => clearTimeout(timer)
  }, [isLoading, recapEnabled])

  useEffect(() => {
    if (!recapEnabled || !returnTelemetryPendingRef.current) return
    const latest = messages.at(-1)
    if (!latest || !isHumanUserMessage(latest)) return
    const focusedAt = focusedAtRef.current
    if (focusedAt === null) return
    logEvent('tengu_return_to_session', {
      msSinceFocus: Date.now() - focusedAt,
      blurDurationMs: blurDurationRef.current ?? 0,
      hadRecap: hadRecapOnReturnRef.current,
      scrolledBeforeSubmit: (lastUserScrollAtRef.current ?? 0) > focusedAt,
      isFullscreen: isFullscreenEnvEnabled(),
    })
    returnTelemetryPendingRef.current = false
    focusedAtRef.current = null
    blurStartedAtRef.current = null
    blurDurationRef.current = null
    hadRecapOnReturnRef.current = false
  }, [messages, recapEnabled, lastUserScrollAtRef])

  useEffect(() => {
    if (!recapEnabled || !isBgSession()) return
    const jobDir = process.env.CLAUDE_JOB_DIR
    if (!jobDir) return
    const trigger = join(jobDir, RECAP_TRIGGER_FILENAME)
    const interval = setInterval(async () => {
      if (isLoadingRef.current) return
      try {
        await unlink(trigger)
      } catch {
        return
      }
      void generateRef.current?.({ force: true })
    }, RECAP_TRIGGER_POLL_MS)
    return () => clearInterval(interval)
  }, [recapEnabled])
}
