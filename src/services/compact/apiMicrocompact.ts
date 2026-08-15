import { APIError } from '@anthropic-ai/sdk'
import {
  getThinkingClearLatched,
  setThinkingClearLatched,
} from 'src/bootstrap/state.js'
import type { QuerySource } from 'src/constants/querySource.js'
import type { Message } from 'src/types/message.js'
import { logForDebugging } from 'src/utils/debug.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../analytics/growthbook.js'
import { logEvent } from '../analytics/index.js'
import {
  applyContextHintMicrocompact,
  collectCompactableToolIds,
  estimateMessageTokens,
  resetMicrocompactState,
} from './microCompact.js'

// Context management strategy types matching API documentation
export type ContextEditStrategy = {
  type: 'clear_thinking_20251015'
  keep: 'all'
}

// Context management configuration wrapper
export type ContextManagementConfig = {
  edits: ContextEditStrategy[]
}

// API-based microcompact implementation that uses native context management
export function getAPIContextManagement(options?: {
  hasThinking?: boolean
}): ContextManagementConfig | undefined {
  const { hasThinking = false } = options ?? {}

  const strategies: ContextEditStrategy[] = []
  if (hasThinking) {
    strategies.push({
      type: 'clear_thinking_20251015',
      keep: 'all',
    })
  }

  return strategies.length > 0 ? { edits: strategies } : undefined
}

const CONTEXT_HINT_BETA_HEADER = 'context-hint-2026-04-09'
const CONTEXT_HINT_KEEP_RECENT = 5
const EMPTY_CLEARED_IDS = new Set<string>()

type HintEditResult = {
  messages: Message[]
  clearedIds: Set<string>
  thinkingCleared: boolean
}

type ContextHintControllerOptions = {
  querySource: QuerySource
  includeFirstPartyBetas: boolean
  is529Error: (error: unknown) => boolean
}

export type ContextHintController = {
  active: boolean
  logThinkingClearLatched: (
    trigger: 'context_hint' | 'ttl',
    estimatedThinkingTokens: number,
  ) => void
  buildRequestParams: (messages: Message[]) => {
    betaHeader: typeof CONTEXT_HINT_BETA_HEADER
    body: { context_hint: { enabled: true } } | null
  } | null
  onRequestError: (
    error: unknown,
    messages: Message[],
  ) => HintEditResult | null
  classifyStreamError: (error: unknown) => boolean
  onStreamFallback: (
    messages: Message[],
    requestId: string | undefined,
  ) => HintEditResult | null
  strip: () => void
}

function isContextHintEnabled(): boolean {
  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_hazel_osprey', false)
}

function isContextHintReject(error: unknown): boolean {
  return (
    error instanceof APIError &&
    (error.status === 422 || error.status === 424)
  )
}

function isContextHintStreamReject(error: unknown): boolean {
  if (!(error instanceof APIError)) return false
  if (error.status !== undefined) return false
  return (
    (error.error as { error?: { type?: string } } | undefined)?.error?.type ===
    'invalid_request_error'
  )
}

function isContextHintBusy(error: unknown): boolean {
  return error instanceof APIError && error.status === 409
}

function isUnsupportedContextHintBeta(error: unknown): boolean {
  if (!(error instanceof APIError) || error.status !== 400) return false
  const message = error.message ?? ''
  return (
    message.includes('Unexpected value') && message.includes('anthropic-beta')
  )
}

function getRequestId(error: unknown): string | undefined {
  return error instanceof APIError ? (error.requestID ?? undefined) : undefined
}

function logContextHintReject(values: {
  requestId: string | undefined
  preCompactTokenEstimate: number
  postCompactTokenEstimate: number
  tokensSaved: number
  thinkingCleared: boolean
  mcApplied: boolean
  mcTokensSaved: number
}): void {
  logEvent('tengu_context_hint_reject', values)
}

function logContextHintBusyFallback(
  requestId: string | undefined,
  status: 400 | 409 | 529,
): void {
  logEvent('tengu_context_hint_busy_fallback', { requestId, status })
}

function logThinkingClearLatched(
  trigger: 'context_hint' | 'ttl',
  estimatedThinkingTokens: number,
): void {
  logEvent('tengu_thinking_clear_latched', {
    trigger,
    estimatedThinkingTokens,
  })
}

export function applyHintEdits(
  messages: Message[],
  querySource: QuerySource,
): {
  messages: Message[]
  clearedIds: Set<string>
  applied: {
    thinkingCleared: boolean
    mcApplied: boolean
    mcTokensSaved: number
  }
  preCompactTokenEstimate: number
  postCompactTokenEstimate: number
} {
  const preCompactTokenEstimate = estimateMessageTokens(messages)
  let thinkingCleared = false

  if (getThinkingClearLatched() !== true) {
    setThinkingClearLatched(true)
    thinkingCleared = true
    let thinkingCharacters = 0
    for (const message of messages) {
      if (
        message.type !== 'assistant' ||
        !Array.isArray(message.message.content)
      ) {
        continue
      }
      for (const block of message.message.content) {
        if (block.type === 'thinking') {
          thinkingCharacters += block.thinking.length
        } else if (block.type === 'redacted_thinking') {
          thinkingCharacters += block.data.length
        }
      }
    }
    logThinkingClearLatched(
      'context_hint',
      Math.round(thinkingCharacters / 4),
    )
  }

  const microcompact = applyContextHintMicrocompact(messages, querySource, {
    keepRecent: CONTEXT_HINT_KEEP_RECENT,
  })
  if (!microcompact) resetMicrocompactState()
  const editedMessages = microcompact?.messages ?? messages
  const postCompactTokenEstimate = estimateMessageTokens(editedMessages)

  logForDebugging(
    `[CONTEXT_HINT_REJECT] thinkingCleared=${thinkingCleared} mc=${Boolean(microcompact)} tokensSaved=${microcompact?.tokensSaved ?? 0}`,
  )
  return {
    messages: editedMessages,
    clearedIds: microcompact?.clearedIds ?? EMPTY_CLEARED_IDS,
    applied: {
      thinkingCleared,
      mcApplied: Boolean(microcompact),
      mcTokensSaved: microcompact?.tokensSaved ?? 0,
    },
    preCompactTokenEstimate,
    postCompactTokenEstimate,
  }
}

export function handleHintReject(values: {
  messages: Message[]
  querySource: QuerySource
  requestId: string | undefined
}): HintEditResult {
  const result = applyHintEdits(values.messages, values.querySource)
  logContextHintReject({
    requestId: values.requestId,
    preCompactTokenEstimate: result.preCompactTokenEstimate,
    postCompactTokenEstimate: result.postCompactTokenEstimate,
    tokensSaved:
      result.preCompactTokenEstimate - result.postCompactTokenEstimate,
    thinkingCleared: result.applied.thinkingCleared,
    mcApplied: result.applied.mcApplied,
    mcTokensSaved: result.applied.mcTokensSaved,
  })
  return {
    messages: result.messages,
    clearedIds: result.clearedIds,
    thinkingCleared: result.applied.thinkingCleared,
  }
}

export function createContextHintController(
  options: ContextHintControllerOptions,
): ContextHintController | null {
  if (!options.includeFirstPartyBetas) return null
  if (!options.querySource.startsWith('repl_main_thread')) return null

  const active = isContextHintEnabled()
  let stripped = false
  let requestIncludedBeta = false
  let streamReject = false

  return {
    active,
    logThinkingClearLatched,
    buildRequestParams(messages) {
      requestIncludedBeta = false
      if (!active || stripped) return null
      requestIncludedBeta = true
      const hasEnoughToolUses =
        collectCompactableToolIds(messages).length > CONTEXT_HINT_KEEP_RECENT
      return {
        betaHeader: CONTEXT_HINT_BETA_HEADER,
        body: hasEnoughToolUses ? { context_hint: { enabled: true } } : null,
      }
    },
    onRequestError(error, messages) {
      if (!requestIncludedBeta || stripped) return null
      const requestId = getRequestId(error)
      if (isContextHintReject(error)) {
        stripped = true
        return handleHintReject({
          messages,
          querySource: options.querySource,
          requestId,
        })
      }
      if (isUnsupportedContextHintBeta(error)) {
        stripped = true
        logContextHintBusyFallback(requestId, 400)
        return {
          messages,
          clearedIds: EMPTY_CLEARED_IDS,
          thinkingCleared: false,
        }
      }
      if (isContextHintBusy(error)) {
        stripped = true
        logContextHintBusyFallback(requestId, 409)
        return null
      }
      if (options.is529Error(error)) {
        stripped = true
        logContextHintBusyFallback(requestId, 529)
        return null
      }
      return null
    },
    classifyStreamError(error) {
      streamReject = false
      if (!requestIncludedBeta || stripped) return false
      if (!isContextHintStreamReject(error)) return false
      streamReject = true
      return true
    },
    onStreamFallback(messages, requestId) {
      const shouldApply = streamReject
      stripped = true
      if (!shouldApply) return null
      return handleHintReject({
        messages,
        querySource: options.querySource,
        requestId,
      })
    },
    strip() {
      stripped = true
    },
  }
}
