import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import type { ZodError } from 'zod/v4'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { logEvent } from '../services/analytics/index.js'
import { sanitizeToolNameForAnalytics } from '../services/analytics/metadata.js'
import type { Message } from '../types/message.js'
import { FILE_EDIT_TOOL_NAME } from '../tools/FileEditTool/constants.js'
import { FILE_WRITE_TOOL_NAME } from '../tools/FileWriteTool/prompt.js'
import { createAttachmentMessage } from './attachments.js'
import { logForDebugging } from './debug.js'
import { AbortError, ShellError } from './errors.js'
import { getFileModificationTime } from './file.js'
import { readFileSyncWithMetadata } from './fileRead.js'
import {
  fileStateMatchesContent,
  type FileStateCache,
} from './fileStateCache.js'
import { INTERRUPT_MESSAGE_FOR_TOOL_USE } from './messages.js'
import { expandPath } from './path.js'
import { getPersistenceThreshold } from './toolResultStorage.js'

export type ToolResultDedupState = {
  seen: Map<string, { shortId: string; toolName: string }>
  counter: number
}

const MIN_TOOL_RESULT_DEDUP_CHARS = 256
const RESULT_ID_SUFFIX_MAX_CHARS = 26
const RESULT_ID_PATTERN = /\[result-id: r(\d+)\]$/

export function createToolResultDedupState(): ToolResultDedupState {
  return { seen: new Map(), counter: 0 }
}

export function restoreToolResultDedupState(
  messages: Message[],
): ToolResultDedupState {
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

export function resetToolResultDedupState(
  state: ToolResultDedupState | undefined,
): void {
  state?.seen.clear()
  if (state) state.counter = 0
}

function hashToolResult(content: string): string {
  if (typeof Bun !== 'undefined') return Bun.hash(content).toString(36)
  let hash = 5381
  for (let index = 0; index < content.length; index++) {
    hash = ((hash << 5) + hash + content.charCodeAt(index)) | 0
  }
  return (hash >>> 0).toString(36)
}

export function applyToolResultDedup(
  block: ToolResultBlockParam,
  toolName: string,
  state: ToolResultDedupState | undefined,
  maxResultSizeChars: number,
): ToolResultBlockParam {
  if (!getFeatureValue_CACHED_MAY_BE_STALE('tengu_onyx_basin_m1k', false)) {
    return block
  }
  if (!state || block.is_error || typeof block.content !== 'string') {
    return block
  }
  const originalBytes = block.content.length
  if (originalBytes <= MIN_TOOL_RESULT_DEDUP_CHARS) return block
  const persistenceThreshold = getPersistenceThreshold(
    toolName,
    maxResultSizeChars,
  )
  if (originalBytes + RESULT_ID_SUFFIX_MAX_CHARS > persistenceThreshold) {
    return block
  }

  const hash = hashToolResult(block.content)
  const previous = state.seen.get(hash)
  if (previous) {
    const content = `<identical to result [${previous.shortId}] from your ${previous.toolName} call earlier — refer to that output>`
    logEvent('tengu_tool_result_dedup', {
      hit: true,
      toolName: sanitizeToolNameForAnalytics(toolName),
      originalBytes,
      savedBytes: originalBytes - content.length,
    })
    return { ...block, content }
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
  return { ...block, content: `${block.content}\n[result-id: ${shortId}]` }
}

export function resyncReadFileStateAfterPostToolUse(
  toolName: string,
  toolUseID: string,
  input: unknown,
  readFileState: FileStateCache,
) {
  if (toolName !== FILE_EDIT_TOOL_NAME && toolName !== FILE_WRITE_TOOL_NAME) {
    return null
  }
  if (
    typeof input !== 'object' ||
    input === null ||
    !('file_path' in input) ||
    typeof input.file_path !== 'string'
  ) {
    return null
  }
  try {
    const filename = expandPath(input.file_path)
    const previous = readFileState.get(filename)
    if (
      !previous ||
      previous.offset !== undefined ||
      previous.limit !== undefined
    ) {
      return null
    }
    const timestamp = getFileModificationTime(filename)
    if (timestamp <= previous.timestamp) return null
    const current = readFileSyncWithMetadata(filename)
    readFileState.set(filename, {
      content: current.content,
      timestamp,
      offset: undefined,
      limit: undefined,
    })
    if (fileStateMatchesContent(previous, current.content)) return null
    logForDebugging(
      `PostToolUse hook modified ${filename} after ${toolName} — re-synced readFileState`,
      { level: 'info' },
    )
    return createAttachmentMessage({
      type: 'hook_additional_context',
      content: [
        `PostToolUse hook modified ${filename} after your edit (likely a formatter). Your next Edit will not fail with a stale-file error, but if its old_string targets a region the hook reformatted, Read the file first.`,
      ],
      hookName: `PostToolUse:${toolName}`,
      toolUseID,
      hookEvent: 'PostToolUse',
    })
  } catch {
    return null
  }
}

export function formatError(error: unknown): string {
  if (error instanceof AbortError) {
    return error.message || INTERRUPT_MESSAGE_FOR_TOOL_USE
  }
  if (!(error instanceof Error)) {
    return String(error)
  }
  const parts = getErrorParts(error)
  const fullMessage =
    parts.filter(Boolean).join('\n').trim() || 'Command failed with no output'
  if (fullMessage.length <= 10000) {
    return fullMessage
  }
  const halfLength = 5000
  const start = fullMessage.slice(0, halfLength)
  const end = fullMessage.slice(-halfLength)
  return `${start}\n\n... [${fullMessage.length - 10000} characters truncated] ...\n\n${end}`
}

export function getErrorParts(error: Error): string[] {
  if (error instanceof ShellError) {
    return [
      `Exit code ${error.code}`,
      error.interrupted ? INTERRUPT_MESSAGE_FOR_TOOL_USE : '',
      error.stderr,
      error.stdout,
    ]
  }
  const parts = [error.message]
  if ('stderr' in error && typeof error.stderr === 'string') {
    parts.push(error.stderr)
  }
  if ('stdout' in error && typeof error.stdout === 'string') {
    parts.push(error.stdout)
  }
  return parts
}

/**
 * Formats a Zod validation path into a readable string
 * e.g., ['todos', 0, 'activeForm'] => 'todos[0].activeForm'
 */
function formatValidationPath(path: PropertyKey[]): string {
  if (path.length === 0) return ''

  return path.reduce((acc, segment, index) => {
    const segmentStr = String(segment)
    if (typeof segment === 'number') {
      return `${String(acc)}[${segmentStr}]`
    }
    return index === 0 ? segmentStr : `${String(acc)}.${segmentStr}`
  }, '') as string
}

/**
 * Converts Zod validation errors into a human-readable and LLM friendly error message
 *
 * @param toolName The name of the tool that failed validation
 * @param error The Zod error object
 * @returns A formatted error message string
 */
export function formatZodValidationError(
  toolName: string,
  error: ZodError,
): string {
  const missingParams = error.issues
    .filter(
      err =>
        err.code === 'invalid_type' &&
        err.message.includes('received undefined'),
    )
    .map(err => formatValidationPath(err.path))

  const unexpectedParams = error.issues
    .filter(err => err.code === 'unrecognized_keys')
    .flatMap(err => err.keys)

  const typeMismatchParams = error.issues
    .filter(
      err =>
        err.code === 'invalid_type' &&
        !err.message.includes('received undefined'),
    )
    .map(err => {
      const typeErr = err as { expected: string }
      const receivedMatch = err.message.match(/received (\w+)/)
      const received = receivedMatch ? receivedMatch[1] : 'unknown'
      return {
        param: formatValidationPath(err.path),
        expected: typeErr.expected,
        received,
      }
    })

  // Default to original error message if we can't create a better one
  let errorContent = error.message

  // Build a human-readable error message
  const errorParts = []

  if (missingParams.length > 0) {
    const missingParamErrors = missingParams.map(
      param => `The required parameter \`${param}\` is missing`,
    )
    errorParts.push(...missingParamErrors)
  }

  if (unexpectedParams.length > 0) {
    const unexpectedParamErrors = unexpectedParams.map(
      param => `An unexpected parameter \`${param}\` was provided`,
    )
    errorParts.push(...unexpectedParamErrors)
  }

  if (typeMismatchParams.length > 0) {
    const typeErrors = typeMismatchParams.map(
      ({ param, expected, received }) =>
        `The parameter \`${param}\` type is expected as \`${expected}\` but provided as \`${received}\``,
    )
    errorParts.push(...typeErrors)
  }

  if (errorParts.length > 0) {
    errorContent = `${toolName} failed due to the following ${errorParts.length > 1 ? 'issues' : 'issue'}:\n${errorParts.join('\n')}`
  }

  return errorContent
}
