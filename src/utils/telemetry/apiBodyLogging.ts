import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import { join, resolve } from 'path'
import type { AssistantMessage } from '../../types/message.js'
import type { QuerySource } from '../../constants/querySource.js'
import { logForDebugging } from '../debug.js'
import { isEnvTruthy } from '../envUtils.js'
import { isENOENT } from '../errors.js'
import { jsonStringify } from '../slowOperations.js'
import { logOTelEvent } from './events.js'

const MAX_RAW_BODY_LENGTH = 60 * 1024

type RawAPIBodyLoggingConfig =
  | { mode: 'disabled' }
  | { mode: 'inline' }
  | { mode: 'file'; dir: string }

let cachedRawAPIBodyLoggingConfig:
  | { raw: string | undefined; config: RawAPIBodyLoggingConfig }
  | undefined

function parseRawAPIBodyLoggingConfig(
  raw: string | undefined,
): RawAPIBodyLoggingConfig {
  if (raw?.startsWith('file:')) {
    const directory = raw.slice('file:'.length)
    return directory
      ? { mode: 'file', dir: resolve(directory) }
      : { mode: 'disabled' }
  }
  return isEnvTruthy(raw) ? { mode: 'inline' } : { mode: 'disabled' }
}

function getRawAPIBodyLoggingConfig(): RawAPIBodyLoggingConfig {
  const raw = process.env.OTEL_LOG_RAW_API_BODIES
  if (
    !cachedRawAPIBodyLoggingConfig ||
    cachedRawAPIBodyLoggingConfig.raw !== raw
  ) {
    cachedRawAPIBodyLoggingConfig = {
      raw,
      config: parseRawAPIBodyLoggingConfig(raw),
    }
  }
  return cachedRawAPIBodyLoggingConfig.config
}

function isRawAPIBodyLoggingEnabled(): boolean {
  return getRawAPIBodyLoggingConfig().mode !== 'disabled'
}

async function writeRawAPIBodyFile(
  directory: string,
  filePath: string,
  body: string,
): Promise<void> {
  try {
    await writeFile(filePath, body)
  } catch (error) {
    if (!isENOENT(error)) throw error
    await mkdir(directory, { recursive: true })
    await writeFile(filePath, body)
  }
}

function logBody(
  eventName: 'api_request_body' | 'api_response_body',
  value: unknown,
  metadata: Record<string, string | undefined>,
): void {
  const config = getRawAPIBodyLoggingConfig()
  if (config.mode === 'disabled') return
  const serialized = jsonStringify(value)
  if (config.mode === 'file') {
    const direction = eventName === 'api_request_body' ? 'request' : 'response'
    const requestedId = metadata.request_id ?? randomUUID()
    const safeId = /^[A-Za-z0-9_-]+$/.test(requestedId)
      ? requestedId
      : randomUUID()
    const bodyPath = join(config.dir, `${safeId}.${direction}.json`)
    void writeRawAPIBodyFile(config.dir, bodyPath, serialized).catch(error => {
      logForDebugging(`OTEL raw body file write failed: ${error}`, {
        level: 'error',
      })
    })
    void logOTelEvent(eventName, {
      body_ref: bodyPath,
      body_length: String(Buffer.byteLength(serialized)),
      ...metadata,
    })
    return
  }
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
