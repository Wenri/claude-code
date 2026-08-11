import { APIError } from '@anthropic-ai/sdk/error'
import type { Message } from '../../types/message.js'
import { FILE_READ_TOOL_NAME } from '../../tools/FileReadTool/prompt.js'
import { logForDebugging } from '../../utils/debug.js'
import {
  isPersistError,
  persistToolResult,
  PERSISTED_OUTPUT_CLOSING_TAG,
  PERSISTED_OUTPUT_TAG,
} from '../../utils/toolResultStorage.js'
import { tokenCountWithEstimation } from '../../utils/tokens.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../analytics/growthbook.js'
import { logEvent } from '../analytics/index.js'
import {
  keepRecentMicrocompact,
  resetMicrocompactState,
  selectKeepRecentToolResults,
} from './microCompact.js'

const CONTEXT_HINT_BETA = 'context-hint-2026-04-09'
const KEEP_RECENT = 5
const MIN_TOKENS_SAVED = 20_000
const DEFAULT_TARGET_TOKENS_SAVED = 75_000

const EMPTY_IDS = new Set<string>()
const EMPTY_CONTENT = new Map<string, string>()

export type ContextHintClearResult = {
  messages: Message[]
  clearedIds: Set<string>
  clearedContent: Map<string, string>
}

type AppliedContextHintClear = ContextHintClearResult & {
  applied: {
    mcApplied: boolean
    mcTokensSaved: number
  }
  preCompactTokenEstimate: number
  postCompactTokenEstimate: number
}

async function persistHintToolResult(
  content: Parameters<typeof persistToolResult>[0],
  toolUseId: string,
): Promise<string | null> {
  const result = await persistToolResult(content, toolUseId)
  if (isPersistError(result)) return null
  return `${PERSISTED_OUTPUT_TAG}Tool result saved to: ${result.filepath}\n\nUse ${FILE_READ_TOOL_NAME} to view${PERSISTED_OUTPUT_CLOSING_TAG}`
}

export async function applyHintEdits(
  messages: Message[],
  querySource: string,
): Promise<AppliedContextHintClear> {
  const preCompactTokenEstimate = tokenCountWithEstimation(messages)
  const compacted = await keepRecentMicrocompact(messages, querySource, {
    keepRecent: KEEP_RECENT,
    persist: persistHintToolResult,
  })
  if (!compacted) {
    resetMicrocompactState()
  }
  const nextMessages = compacted?.messages ?? messages
  const postCompactTokenEstimate = tokenCountWithEstimation(nextMessages)
  logForDebugging(
    `[CONTEXT_HINT_REJECT] mc=${!!compacted} tokensSaved=${compacted?.tokensSaved ?? 0}`,
  )
  return {
    messages: nextMessages,
    clearedIds: compacted?.clearedIds ?? EMPTY_IDS,
    clearedContent: compacted?.clearedContent ?? EMPTY_CONTENT,
    applied: {
      mcApplied: !!compacted,
      mcTokensSaved: compacted?.tokensSaved ?? 0,
    },
    preCompactTokenEstimate,
    postCompactTokenEstimate,
  }
}

export async function handleHintReject({
  messages,
  querySource,
  requestId,
}: {
  messages: Message[]
  querySource: string
  requestId?: string
}): Promise<ContextHintClearResult> {
  const result = await applyHintEdits(messages, querySource)
  logEvent('tengu_context_hint_reject', {
    requestId,
    preCompactTokenEstimate: result.preCompactTokenEstimate,
    postCompactTokenEstimate: result.postCompactTokenEstimate,
    tokensSaved:
      result.preCompactTokenEstimate - result.postCompactTokenEstimate,
    mcApplied: result.applied.mcApplied,
    mcTokensSaved: result.applied.mcTokensSaved,
  })
  return {
    messages: result.messages,
    clearedIds: result.clearedIds,
    clearedContent: result.clearedContent,
  }
}

function logBusyFallback(requestId: string | undefined, status: number): void {
  logEvent('tengu_context_hint_busy_fallback', { requestId, status })
}

function requestIdFromError(error: unknown): string | undefined {
  return error instanceof APIError ? (error.requestID ?? undefined) : undefined
}

function isHintRejected(error: unknown): boolean {
  return (
    error instanceof APIError &&
    (error.status === 422 || error.status === 424)
  )
}

function isStreamHintRejection(error: unknown): boolean {
  if (!(error instanceof APIError) || error.status !== undefined) return false
  return (
    (error.error as { error?: { type?: string } } | undefined)?.error?.type ===
    'invalid_request_error'
  )
}

function isHintBusy(error: unknown): boolean {
  return error instanceof APIError && error.status === 409
}

function isHintBetaRejected(error: unknown): boolean {
  const message = error instanceof APIError ? (error.message ?? '') : ''
  return (
    error instanceof APIError &&
    error.status === 400 &&
    message.includes('Unexpected value') &&
    message.includes('anthropic-beta')
  )
}

export type ContextHintController = {
  active: boolean
  buildRequestParams(messages: Message[]): {
    betaHeader: string
    body: { context_hint: { enabled: true; target_tokens_saved?: number } } | null
  } | null
  onRequestError(
    error: unknown,
    messages: Message[],
  ): Promise<ContextHintClearResult | null>
  classifyStreamError(error: unknown): boolean
  onStreamFallback(
    messages: Message[],
    requestId?: string,
  ): Promise<ContextHintClearResult | null>
  strip(): void
}

export function createContextHintController(options: {
  querySource: string
  includeFirstPartyBetas: boolean
  is529Error(error: unknown): boolean
}): ContextHintController | null {
  if (!options.includeFirstPartyBetas) return null
  if (!options.querySource.startsWith('repl_main_thread')) return null

  const active = getFeatureValue_CACHED_MAY_BE_STALE(
    'tengu_hazel_osprey',
    false,
  )
  let stripped = false
  let hintWasSent = false
  let streamHintRejected = false

  return {
    active,
    buildRequestParams(messages) {
      hintWasSent = false
      if (!active || stripped) return null
      hintWasSent = true
      const shouldRequestHint =
        selectKeepRecentToolResults(messages, KEEP_RECENT).tokensSaved >=
        MIN_TOKENS_SAVED
      const targetTokensSaved = getFeatureValue_CACHED_MAY_BE_STALE(
        'tengu_hazel_osprey_floor',
        DEFAULT_TARGET_TOKENS_SAVED,
      )
      return {
        betaHeader: CONTEXT_HINT_BETA,
        body: shouldRequestHint
          ? {
              context_hint: {
                enabled: true,
                ...(targetTokensSaved > 0 && {
                  target_tokens_saved: targetTokensSaved,
                }),
              },
            }
          : null,
      }
    },
    async onRequestError(error, messages) {
      if (!hintWasSent || stripped) return null
      const requestId = requestIdFromError(error)
      if (isHintRejected(error)) {
        stripped = true
        return handleHintReject({
          messages,
          querySource: options.querySource,
          requestId,
        })
      }
      if (isHintBetaRejected(error)) {
        stripped = true
        logBusyFallback(requestId, 400)
        return {
          messages,
          clearedIds: EMPTY_IDS,
          clearedContent: EMPTY_CONTENT,
        }
      }
      if (isHintBusy(error)) {
        stripped = true
        logBusyFallback(requestId, 409)
        return null
      }
      if (options.is529Error(error)) {
        stripped = true
        logBusyFallback(requestId, 529)
        return null
      }
      return null
    },
    classifyStreamError(error) {
      streamHintRejected = false
      if (!hintWasSent || stripped) return false
      if (!isStreamHintRejection(error)) return false
      streamHintRejected = true
      return true
    },
    async onStreamFallback(messages, requestId) {
      const rejected = streamHintRejected
      stripped = true
      if (!rejected) return null
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
