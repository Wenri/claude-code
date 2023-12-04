import type { AssistantMessage } from '../../types/message.js'
import type { QuerySource } from '../../constants/querySource.js'
import { isEnvTruthy } from '../envUtils.js'
import { jsonStringify } from '../slowOperations.js'
import { logOTelEvent } from './events.js'

const MAX_RAW_BODY_LENGTH = 60 * 1024

function isRawAPIBodyLoggingEnabled(): boolean {
  return isEnvTruthy(process.env.OTEL_LOG_RAW_API_BODIES)
}

function logBody(
  eventName: 'api_request_body' | 'api_response_body',
  value: unknown,
  metadata: Record<string, string | undefined>,
): void {
  const serialized = jsonStringify(value)
  const truncated = serialized.length > MAX_RAW_BODY_LENGTH
  void logOTelEvent(eventName, {
    body: truncated
      ? `${serialized.slice(0, MAX_RAW_BODY_LENGTH)}\n\n[TRUNCATED - Content exceeds 60KB limit]`
      : serialized,
    body_length: String(serialized.length),
    ...(truncated ? { body_truncated: 'true' } : {}),
    ...metadata,
  })
}

function redactThinkingBlocks<T>(blocks: T[]): T[] {
  return blocks.map(block => {
    if (!block || typeof block !== 'object' || !('type' in block)) return block
    if (block.type === 'thinking') {
      return { ...block, thinking: '<REDACTED>' }
    }
    if (block.type === 'redacted_thinking') {
      return { ...block, data: '<REDACTED>' }
    }
    return block
  })
}

export function logRawAPIRequestBody(
  params: {
    model?: string
    messages?: Array<{ role?: string; content?: unknown }>
    [key: string]: unknown
  },
  querySource: QuerySource,
): void {
  if (!isRawAPIBodyLoggingEnabled()) return
  const redacted = {
    ...params,
    messages: (params.messages ?? []).map(message =>
      message.role === 'assistant' && Array.isArray(message.content)
        ? { ...message, content: redactThinkingBlocks(message.content) }
        : message,
    ),
  }
  logBody('api_request_body', redacted, {
    model: params.model,
    query_source: querySource,
  })
}

export function logRawAPIResponseBody(
  messages: AssistantMessage[],
  metadata: {
    model: string
    querySource: string
    requestId?: string
  },
): void {
  if (!isRawAPIBodyLoggingEnabled() || messages.length === 0) return
  const lastMessage = messages.at(-1)!
  const content = messages.flatMap(message => message.message.content)
  const body = {
    ...lastMessage.message,
    content: redactThinkingBlocks(content),
  }
  logBody('api_response_body', body, {
    model: metadata.model,
    query_source: metadata.querySource,
    request_id: metadata.requestId,
  })
}
