import type { Message } from '../types/message.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { estimateMessageTokens } from '../services/compact/microCompact.js'
import { getGlobalConfig } from './config.js'

export type ResumeReturnInfo = {
  sessionAgeMinutes: number
  estimatedTokens: number
}

function positiveEnvNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function getResumeReturnInfo(
  messages: Message[],
): ResumeReturnInfo | null {
  if (
    !getFeatureValue_CACHED_MAY_BE_STALE('tengu_gleaming_fair', false) ||
    getGlobalConfig().resumeReturnDismissed
  ) {
    return null
  }

  const ageThresholdMinutes = positiveEnvNumber(
    process.env.CLAUDE_CODE_RESUME_THRESHOLD_MINUTES,
    70,
  )
  const tokenThreshold = positiveEnvNumber(
    process.env.CLAUDE_CODE_RESUME_TOKEN_THRESHOLD,
    100_000,
  )
  const oneMinuteAgo = Date.now() - 60_000
  const lastTimestamp = messages.findLast(
    message =>
      (message.type === 'user' || message.type === 'assistant') &&
      Date.parse(message.timestamp) < oneMinuteAgo,
  )?.timestamp

  if (!lastTimestamp) return null

  const sessionAgeMinutes =
    (Date.now() - Date.parse(lastTimestamp)) / (60 * 1000)
  if (sessionAgeMinutes < ageThresholdMinutes) return null

  const estimatedTokens = estimateMessageTokens(messages)
  if (estimatedTokens < tokenThreshold) return null

  return { sessionAgeMinutes, estimatedTokens }
}
