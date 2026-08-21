import { useCallback, useEffect, useRef, useState } from 'react'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import { queryWithModel } from '../../services/api/claude.js'
import {
  countMemoryWriteLines,
  describeMemoryWrite,
  getMemoryWriteSurveyConfig,
  isMemoryWriteSurveyEnabled,
  isMemoryWriteSurveyForced,
  type MemoryWriteSurveyRecord,
  removeMemoryWriteRecord,
  undoMemoryWrite,
} from '../../memdir/memoryWriteSurvey.js'
import { useAppState, useSetAppState } from '../../state/AppState.js'
import { logForDebugging } from '../../utils/debug.js'
import { toError } from '../../utils/errors.js'
import { extractTextContent } from '../../utils/messages.js'
import { getModelStrings } from '../../utils/model/modelStrings.js'
import { isEssentialTrafficOnly } from '../../utils/privacyLevel.js'
import { asSystemPrompt } from '../../utils/systemPromptType.js'
import { logOTelEvent } from '../../utils/telemetry/events.js'

const EVENT_NAME = 'tengu_memory_write_survey_event'
const COUNTDOWN_VISIBLE_SECONDS = 5
const SUMMARY_SYSTEM_PROMPT = asSystemPrompt([
  'You write one-sentence confirmation summaries for an Approve/Reject dialog.',
])
const SUMMARY_PROMPT = `Summarize this memory file update in one short sentence (≤120 chars) for a confirmation dialog. State what was recorded or changed; no preamble.

`

export type MemoryWriteSurveyOutcome = 'approve' | 'reject' | 'timeout'

export type MemoryWriteSurveyState = {
  state: 'closed' | 'open'
  record: MemoryWriteSurveyRecord | null
  summary: string | null
  summaryLineThreshold: number
  countdownSec: number | null
  handleOutcome: (outcome: MemoryWriteSurveyOutcome) => void
}

const CLOSED_STATE: MemoryWriteSurveyState = {
  state: 'closed',
  record: null,
  summary: null,
  summaryLineThreshold: 0,
  countdownSec: null,
  handleOutcome: () => {},
}

export function useMemoryWriteSurvey({
  hasActivePrompt,
  otherSurveyActive,
}: {
  hasActivePrompt: boolean
  otherSurveyActive: boolean
}): MemoryWriteSurveyState {
  const nextRecord = useAppState(state => state.memoryWriteQueue?.[0] ?? null)
  const queueDepth = useAppState(state => state.memoryWriteQueue?.length ?? 0)
  const setAppState = useSetAppState()
  const { columns } = useTerminalSize()
  const contentWidth = getMemoryWriteContentWidth(columns)
  const [active, setActive] = useState<{
    record: MemoryWriteSurveyRecord
    lineCount: number
  } | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [countdownSec, setCountdownSec] = useState<number | null>(null)
  const [, rerenderForThrottle] = useState(0)
  const lastClosedAt = useRef(0)
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const summaryController = useRef<AbortController | null>(null)
  const [config] = useState(getMemoryWriteSurveyConfig)
  const [forced] = useState(isMemoryWriteSurveyForced)

  const logOutcome = useCallback(
    (
      eventType: 'appeared' | MemoryWriteSurveyOutcome,
      record: MemoryWriteSurveyRecord,
      details: {
        lineCount: number
        wasSummarized: boolean
        queueDepth: number
      },
    ) => {
      logEvent(EVENT_NAME, {
        event_type:
          eventType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        appearance_id:
          record.id as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        memory_type:
          record.memoryType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        is_edit: record.isEdit,
        line_count: details.lineCount,
        was_summarized: details.wasSummarized,
        queue_depth: details.queueDepth,
      })
      void logOTelEvent('feedback_survey', {
        event_type: eventType,
        appearance_id: record.id,
        survey_type: 'memory_write',
      })
    },
    [],
  )

  const removeRecord = useCallback(
    (id: string) => {
      setAppState(state => {
        const queue = state.memoryWriteQueue ?? []
        const next = removeMemoryWriteRecord(queue, id)
        return next === queue
          ? state
          : { ...state, memoryWriteQueue: [...next] }
      })
    },
    [setAppState],
  )

  const close = useCallback(
    (id: string) => {
      if (countdownInterval.current) clearInterval(countdownInterval.current)
      countdownInterval.current = null
      summaryController.current?.abort()
      summaryController.current = null
      setActive(null)
      setSummary(null)
      setCountdownSec(null)
      lastClosedAt.current = Date.now()
      removeRecord(id)
    },
    [removeRecord],
  )

  const handleOutcome = useCallback(
    (outcome: MemoryWriteSurveyOutcome) => {
      if (!active) return
      logOutcome(outcome, active.record, {
        lineCount: active.lineCount,
        wasSummarized: summary !== null,
        queueDepth,
      })
      if (outcome === 'reject') void undoMemoryWrite(active.record)
      close(active.record.id)
    },
    [active, close, logOutcome, queueDepth, summary],
  )
  const handleOutcomeRef = useRef(handleOutcome)
  handleOutcomeRef.current = handleOutcome

  useEffect(() => {
    if (active || !nextRecord) return
    if (hasActivePrompt || otherSurveyActive) return
    if (!isMemoryWriteSurveyEnabled()) {
      removeRecord(nextRecord.id)
      return
    }
    const sinceLast = Date.now() - lastClosedAt.current
    if (!forced && sinceLast < config.throttleMs) {
      const timeout = setTimeout(
        () => rerenderForThrottle(value => value + 1),
        config.throttleMs - sinceLast,
      )
      return () => clearTimeout(timeout)
    }

    const lineCount = countMemoryWriteLines(nextRecord, contentWidth)
    setActive({ record: nextRecord, lineCount })
    logOutcome('appeared', nextRecord, {
      lineCount,
      wasSummarized: false,
      queueDepth,
    })

    const deadline = Date.now() + config.timeoutMs
    countdownInterval.current = setInterval(() => {
      const seconds = Math.ceil((deadline - Date.now()) / 1_000)
      if (seconds <= 0) {
        handleOutcomeRef.current('timeout')
        return
      }
      if (seconds <= COUNTDOWN_VISIBLE_SECONDS) {
        setCountdownSec(current => (current === seconds ? current : seconds))
      }
    }, 1_000)

    if (lineCount > config.summaryLineThreshold) {
      const controller = new AbortController()
      summaryController.current = controller
      void summarizeMemoryWrite(nextRecord, controller.signal).then(value => {
        if (!controller.signal.aborted && value) setSummary(value)
      })
    }
  }, [
    active,
    nextRecord,
    hasActivePrompt,
    otherSurveyActive,
    queueDepth,
    forced,
    config,
    contentWidth,
    logOutcome,
    removeRecord,
  ])

  useEffect(
    () => () => {
      if (countdownInterval.current) clearInterval(countdownInterval.current)
      summaryController.current?.abort()
    },
    [],
  )

  if (!active) return CLOSED_STATE
  return {
    state: 'open',
    record: active.record,
    summary,
    summaryLineThreshold: config.summaryLineThreshold,
    countdownSec,
    handleOutcome,
  }
}

export function getMemoryWriteContentWidth(columns: number): number {
  return Math.max(20, columns - 6)
}

async function summarizeMemoryWrite(
  record: MemoryWriteSurveyRecord,
  signal: AbortSignal,
): Promise<string | null> {
  if (isEssentialTrafficOnly()) return null
  try {
    const response = await queryWithModel({
      systemPrompt: SUMMARY_SYSTEM_PROMPT,
      userPrompt: SUMMARY_PROMPT + describeMemoryWrite(record),
      signal,
      options: {
        model: getModelStrings().sonnet46,
        querySource: 'memory_write_survey_summarize',
        agents: [],
        isNonInteractiveSession: true,
        hasAppendSystemPrompt: false,
        mcpTools: [],
        maxOutputTokensOverride: 150,
        enablePromptCaching: false,
      },
    })
    return extractTextContent(response.message.content, ' ').trim() || null
  } catch (error) {
    logForDebugging(
      `[memoryWriteSurvey] summarize failed: ${toError(error).message}`,
    )
    return null
  }
}
