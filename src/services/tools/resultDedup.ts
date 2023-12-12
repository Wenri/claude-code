import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../analytics/growthbook.js'
import { logEvent } from '../analytics/index.js'
import { sanitizeToolNameForAnalytics } from '../analytics/metadata.js'
import type { Message } from '../../types/message.js'
import { getPersistenceThreshold } from '../../utils/toolResultStorage.js'

type SeenToolResult = {
  shortId: string
  toolName: string
}

export type ResultDedupState = {
  seen: Map<string, SeenToolResult>
  counter: number
}

const MIN_RESULT_LENGTH = 256
const RESULT_ID_OVERHEAD = 26
const RESULT_ID_PATTERN = /\[result-id: r(\d+)\]$/

export function createResultDedupState(): ResultDedupState {
  return { seen: new Map(), counter: 0 }
}

export function resetResultDedupState(state: ResultDedupState): void {
  state.seen.clear()
}

export function clearResultDedupState(state: ResultDedupState): void {
  state.seen.clear()
  state.counter = 0
}

export function reconstructResultDedupState(
  messages: Message[],
): ResultDedupState {
  let counter = 0
  for (const message of messages) {
    if (message.type !== 'user' || !Array.isArray(message.message.content)) {
      continue
    }
    for (const block of message.message.content) {
      if (block.type !== 'tool_result' || typeof block.content !== 'string') {
        continue
      }
      const match = RESULT_ID_PATTERN.exec(block.content)
      if (match) counter = Math.max(counter, Number(match[1]))
    }
  }
  return { seen: new Map(), counter }
}

export function deduplicateToolResult(
  block: ToolResultBlockParam,
  toolName: string,
  state: ResultDedupState | undefined,
  maxResultSizeChars: number,
): ToolResultBlockParam {
  if (
    !getFeatureValue_CACHED_MAY_BE_STALE(
      'tengu_onyx_basin_m1k',
      false,
    ) ||
    !state ||
    block.is_error
  ) {
    return block
  }

  const content = block.content
  if (typeof content !== 'string') return block
  const originalBytes = content.length
  if (originalBytes <= MIN_RESULT_LENGTH) return block
  const persistenceThreshold = getPersistenceThreshold(
    toolName,
    maxResultSizeChars,
  )
  if (originalBytes + RESULT_ID_OVERHEAD > persistenceThreshold) return block

  const hash = hashToolResult(content)
  const previous = state.seen.get(hash)
  if (previous) {
    const replacement = `<identical to result [${previous.shortId}] from your ${previous.toolName} call earlier — refer to that output>`
    logEvent('tengu_tool_result_dedup', {
      hit: true,
      toolName: sanitizeToolNameForAnalytics(toolName),
      originalBytes,
      savedBytes: originalBytes - replacement.length,
    })
    return { ...block, content: replacement }
  }

  state.counter += 1
  const shortId = `r${state.counter}`
  state.seen.set(hash, { shortId, toolName })
  logEvent('tengu_tool_result_dedup', {
    hit: false,
    toolName: sanitizeToolNameForAnalytics(toolName),
    originalBytes,
    savedBytes: 0,
  })
  return { ...block, content: `${content}\n[result-id: ${shortId}]` }
}

function hashToolResult(content: string): string {
  if (typeof Bun !== 'undefined') return Bun.hash(content).toString(36)
  let hash = 5381
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash + content.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(36)
}
