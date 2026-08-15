import React from 'react'
import { Text } from '../../ink.js'
import { useAppState } from '../../state/AppState.js'
import type { MemoryEvaluation } from '../../state/AppStateStore.js'
import { truncateToLines } from '../../utils/stringUtils.js'
import { FeedbackSurveyView } from './FeedbackSurveyView.js'
import type { FeedbackSurveyResponse } from './utils.js'

const FOLLOW_UP_MESSAGE = 'Did this help? (optional)'
const MAX_SUMMARY_LINES = 4

export function MemoryEvaluationSurveyView({
  evaluation,
  onSelect,
  inputValue,
  setInputValue,
  mountDelayMs,
}: {
  evaluation: MemoryEvaluation
  onSelect: (selected: FeedbackSurveyResponse) => void
  inputValue: string
  setInputValue: (value: string) => void
  mountDelayMs?: number
}): React.ReactNode {
  const verbose = useAppState(state => state.verbose)
  const rawSummary = evaluation.memory_impact_summary?.trim()
  const summary = rawSummary && !verbose
    ? truncateToLines(rawSummary, MAX_SUMMARY_LINES)
    : rawSummary
  const message = summary
    ? <>{summary} <Text dimColor>{FOLLOW_UP_MESSAGE}</Text></>
    : FOLLOW_UP_MESSAGE

  return <FeedbackSurveyView
    onSelect={onSelect}
    inputValue={inputValue}
    setInputValue={setInputValue}
    message={message}
    messageBold={false}
    mountDelayMs={mountDelayMs}
    showNotSure={true}
  />
}
