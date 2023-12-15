import { inspect } from 'util'
import { Script } from 'vm'
import { z } from 'zod/v4'
import { Box, Text } from '../../ink.js'
import {
  buildTool,
  type Tool,
  type ToolCallProgress,
  type ToolResult,
  type ToolUseContext,
  toolMatchesName,
} from '../../Tool.js'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import type { AssistantMessage, Message } from '../../types/message.js'
import { createChildAbortController } from '../../utils/abortController.js'
import { logForDebugging } from '../../utils/debug.js'
import { detectCurrentRepository } from '../../utils/detectRepository.js'
import { errorMessage } from '../../utils/errors.js'
import { lazySchema } from '../../utils/lazySchema.js'
import {
  createAssistantMessage,
  createUserMessage,
  isCompactBoundaryMessage,
} from '../../utils/messages.js'
import { getDenyRuleForTool } from '../../utils/permissions/permissions.js'
import { firstLineOf } from '../../utils/stringUtils.js'
import { AGENT_TOOL_NAME } from '../AgentTool/constants.js'
import { REPL_TOOL_NAME, isReplModeEnabled } from './constants.js'
import {
  getREPLToolDescription,
  getREPLToolPrompt,
} from './prompt.js'
import { getReplPrimitiveTools } from './primitiveTools.js'
import {
  extractReplReplayEntries,
  hydrateReplContext,
  summarizeReplay,
} from './replay.js'
import { registeredToolsToTools } from './toolWrappers.js'
import { transpileReplCode, unwrapReplResult } from './transpile.js'
import type {
  ReplCallResult,
  ReplContext,
  ReplProgressEvent,
  ReplProgressRecord,
} from './types.js'
import {
  awaitObjectPromises,
  createReplContext,
  refreshReplContext,
  resetReplHelpers,
} from './vm.js'

const DEFAULT_TIMEOUT_MS = 30_000
const MAX_TIMEOUT_MS = 600_000
const MAX_REPL_IMAGES = 8
const STRING_OBJECT_RESERVED_KEYS = new Set([
  'stdout',
  'stderr',
  'error',
  'result',
])
const MAIN_THREAD_AGENT_ID = 'main'

function getMaxResultSizeChars(): number {
  const match = process.env.CLAUDE_REPL_VARIANT?.match(/trim(\d+)k/)
  return match ? Number.parseInt(match[1]!, 10) * 1_000 : 100_000
}

const inputSchema = lazySchema(() =>
  z.strictObject({
    code: z
      .string()
      .describe(
        'JavaScript code to execute. Supports top-level await. State persists across calls.',
      ),
    description: z
      .string()
      .optional()
      .describe(
        'Clear, concise description of what this script does in active voice (5-10 words). E.g. "Trace upgrade message to its GrowthBook flag"',
      ),
    timeout: z
      .number()
      .optional()
      .describe(
        'Optional timeout in milliseconds (default 30000, max 600000)',
      ),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    code: z.string().describe('The code that was executed'),
    result: z.unknown().describe('Return value from the code execution'),
    stdout: z.string().describe('Captured console.log output'),
    stderr: z.string().describe('Captured console.error output'),
    error: z
      .string()
      .optional()
      .describe('Error message if execution failed'),
    registeredTools: z
      .array(z.string())
      .optional()
      .describe('Names of tools registered during this execution'),
    innerToolCalls: z
      .array(z.object({ name: z.string(), input: z.unknown() }))
      .optional()
      .describe(
        'File-mutating inner tool calls — consumed by verificationInterceptor',
      ),
    images: z
      .array(z.object({ base64: z.string(), mediaType: z.string() }))
      .optional()
      .describe(
        'Images returned by inner Read calls — surfaced as image content blocks',
      ),
  }),
)

type Input = z.infer<ReturnType<typeof inputSchema>>
type Output = z.infer<ReturnType<typeof outputSchema>>

function buildInnerToolSet(context: ToolUseContext): Tool[] {
  const permissionContext = context.getToolPermissionContext()
  const primitiveTools = getReplPrimitiveTools().filter(
    tool => !getDenyRuleForTool(permissionContext, tool),
  )
  const existingNames = new Set(context.options.tools.map(tool => tool.name))
  const tools = context.options.tools.filter(
    tool =>
      !toolMatchesName(tool, AGENT_TOOL_NAME) &&
      !toolMatchesName(tool, REPL_TOOL_NAME),
  ) as Tool[]
  for (const tool of primitiveTools) {
    if (!existingNames.has(tool.name)) tools.push(tool)
  }
  return tools
}

function updateProgressRecord(
  records: Map<string, ReplProgressRecord>,
  event: ReplProgressEvent,
): void {
  const current = records.get(event.toolUseId)
  if (current) {
    current.phase = event.phase
    current.result = event.result
    current.error = event.error
    return
  }
  const { type: _, ...record } = event
  records.set(event.toolUseId, record)
}

function replayCalls(records: Map<string, ReplProgressRecord>): ReplCallResult[] {
  return Array.from(records.values())
    .filter(record => record.phase !== 'start')
    .map(record =>
      record.phase === 'error'
        ? {
            kind: 'err' as const,
            toolName: record.toolName,
            error: record.error ?? '',
          }
        : {
            kind: 'ok' as const,
            toolName: record.toolName,
            result: record.result,
          },
    )
}

function collectImages(
  records: Map<string, ReplProgressRecord>,
): { base64: string; mediaType: string }[] {
  const images: { base64: string; mediaType: string }[] = []
  for (const record of records.values()) {
    if (record.phase !== 'complete') continue
    const result = record.result
    const imageResult = result as {
      type?: unknown
      file?: { base64?: unknown; type?: unknown }
    }
    if (
      result !== null &&
      typeof result === 'object' &&
      imageResult.type === 'image' &&
      imageResult.file !== null &&
      typeof imageResult.file === 'object' &&
      typeof imageResult.file.base64 === 'string' &&
      imageResult.file.base64.length > 0 &&
      typeof imageResult.file.type === 'string'
    ) {
      images.push({
        base64: imageResult.file.base64,
        mediaType: imageResult.file.type,
      })
    }
  }
  return images.slice(0, MAX_REPL_IMAGES)
}

function virtualMessages(records: Map<string, ReplProgressRecord>): Message[] {
  const messages: Message[] = []
  for (const record of records.values()) {
    if (record.phase === 'start') continue
    messages.push(
      createAssistantMessage({
        content: [
          {
            type: 'tool_use',
            id: record.toolUseId,
            name: record.toolName,
            input: record.toolInput,
          },
        ],
        isVirtual: true,
      }),
    )
    messages.push(
      createUserMessage({
        content: [
          {
            type: 'tool_result',
            tool_use_id: record.toolUseId,
            content: record.phase === 'error' ? record.error ?? '' : '',
            is_error: record.phase === 'error',
          },
        ],
        toolUseResult: record.result,
        isVirtual: true,
      }),
    )
  }
  return messages
}

function createRejectable(): {
  promise: Promise<never>
  reject: (error: Error) => void
} {
  let reject!: (error: Error) => void
  return {
    promise: new Promise((_, rejectPromise) => {
      reject = rejectPromise
    }),
    reject,
  }
}

function createScriptTimer(timeoutMs: number, onTimeout: () => void) {
  let innerCalls = 0
  let remaining = timeoutMs
  let startedAt = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let cancelled = false

  const start = () => {
    if (cancelled || timer !== undefined || innerCalls > 0) return
    if (remaining <= 0) {
      cancelled = true
      onTimeout()
      return
    }
    startedAt = Date.now()
    timer = setTimeout(() => {
      cancelled = true
      onTimeout()
    }, remaining)
    timer.unref?.()
  }
  const pause = () => {
    if (timer === undefined) return
    clearTimeout(timer)
    timer = undefined
    remaining -= Date.now() - startedAt
  }
  return {
    start,
    onToolStart: () => {
      if (innerCalls++ === 0) pause()
    },
    onToolEnd: () => {
      if (--innerCalls === 0) start()
    },
    cancel: () => {
      cancelled = true
      pause()
    },
  }
}

function firstMessageUuid(messages: readonly Message[]): string | null {
  const first = messages[0]
  return first !== undefined && isCompactBoundaryMessage(first)
    ? String(first.uuid)
    : null
}

function formatSimpleStringObject(value: unknown): string | undefined {
  try {
    if (
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      (value as { constructor?: { name?: string } }).constructor?.name !==
        'Object'
    ) {
      return undefined
    }
    const entries = Object.entries(value)
    if (
      entries.length === 0 ||
      entries.some(
        ([key, entry]) =>
          typeof entry !== 'string' || STRING_OBJECT_RESERVED_KEYS.has(key),
      )
    ) {
      return undefined
    }
    return entries.map(([key, entry]) => `${key}:\n${entry}`).join('\n\n')
  } catch {
    return undefined
  }
}

function formatResult(value: unknown, depth: number): string {
  if (typeof value === 'string' && value.trim() !== '') return value
  const simple = formatSimpleStringObject(value)
  if (simple !== undefined) return simple
  try {
    return inspect(value, { colors: false, depth, customInspect: false })
  } catch {
    return '[non-serializable value]'
  }
}

function formatOutput(output: Output): string {
  if (
    !output.stdout &&
    !output.stderr &&
    !output.error &&
    output.result !== undefined &&
    !output.registeredTools?.length
  ) {
    return formatResult(output.result, 10)
  }
  const sections: string[] = []
  if (output.stdout) sections.push(`stdout:\n${output.stdout}`)
  if (output.stderr) sections.push(`stderr:\n${output.stderr}`)
  if (output.error) sections.push(`error: ${output.error}`)
  if (output.result !== undefined) {
    sections.push(`result: ${formatResult(output.result, 10)}`)
  }
  if (output.registeredTools?.length) {
    sections.push(`Registered tools: ${output.registeredTools.join(', ')}`)
  }
  return sections.join('\n\n') || ''
}

async function executeRepl(
  input: Input,
  context: ToolUseContext,
  canUseTool: CanUseToolFn,
  parentMessage: AssistantMessage,
  onProgress?: ToolCallProgress<ReplProgressEvent>,
): Promise<ToolResult<Output>> {
  const agentId = context.agentId ?? MAIN_THREAD_AGENT_ID
  const previous = context.getAppState().replContexts[agentId] as
    | ReplContext
    | undefined
  const timeoutMs = Math.min(input.timeout ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS)
  const childController = createChildAbortController(context.abortController)
  const childContext = { ...context, abortController: childController }
  const progress = new Map<string, ReplProgressRecord>()
  const rejection = createRejectable()
  const scriptTimer = createScriptTimer(timeoutMs, () =>
    rejection.reject(
      Error(
        `REPL execution timed out after ${timeoutMs}ms of script time (inner tool calls excluded). Script may still be running — avoid unbounded awaits.`,
      ),
    ),
  )
  const handleProgress: ToolCallProgress<ReplProgressEvent> = event => {
    updateProgressRecord(progress, event.data)
    if (event.data.phase === 'start') scriptTimer.onToolStart()
    else scriptTimer.onToolEnd()
    onProgress?.(
      event.data.result === undefined
        ? event
        : {
            toolUseID: event.toolUseID,
            data: { ...event.data, result: undefined },
          },
    )
  }

  const boundaryUuid = firstMessageUuid(context.messages)
  let replContext: ReplContext
  const tools = buildInnerToolSet(context)
  if (previous && previous.boundaryUuid === boundaryUuid) {
    replContext = previous
    replContext.console.clear()
    replContext.clearAllTimers()
    refreshReplContext(
      replContext,
      tools,
      childContext,
      canUseTool,
      parentMessage,
      handleProgress,
    )
  } else {
    previous?.clearAllTimers()
    previous?.console.clear()
    replContext = createReplContext(
      tools,
      childContext,
      canUseTool,
      parentMessage,
      handleProgress,
    )
    replContext.boundaryUuid = boundaryUuid
    replContext.helperState.repo = await detectCurrentRepository().catch(() => null)
    const requestedHydration = context.replHydration ?? { kind: 'fresh' as const }
    const hydration =
      requestedHydration.kind === 'fork' && previous
        ? { kind: 'fresh' as const }
        : requestedHydration
    try {
      const entries =
        hydration.kind === 'fork'
          ? hydration.log
          : hydration.kind === 'resume'
            ? extractReplReplayEntries(context.messages)
            : []
      if (entries.length > 0) {
        const startedAt = performance.now()
        const results = await hydrateReplContext(replContext, entries)
        const elapsed = Math.round(performance.now() - startedAt)
        const { summary } = summarizeReplay(results)
        logForDebugging(
          `REPL state hydrated from ${hydration.kind} in ${elapsed}ms: ${summary}`,
          { level: 'info' },
        )
        if (hydration.kind === 'resume') replContext.replayLog = [...entries]
      }
    } catch (error) {
      logForDebugging(
        `REPL state hydration failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { level: 'warn' },
      )
    }
    replContext.clearAllTimers()
    context.setReplContext(agentId, replContext)
  }

  const { vmContext, registeredTools, console: replConsole } = replContext
  const initialRegistered = new Set(registeredTools.keys())
  resetReplHelpers(replContext)

  try {
    const code = transpileReplCode(input.code)
    const pending = new Script(code, {
      filename: 'repl-tool-code.js',
    }).runInContext(vmContext, { timeout: timeoutMs })
    const signal = context.abortController.signal
    const onAbort = () => rejection.reject(Error('REPL execution interrupted'))
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })

    scriptTimer.start()
    const hardTimer = setTimeout(
      (reject: (error: Error) => void) =>
        reject(
          Error(
            `REPL execution exceeded hard wall-clock limit of ${MAX_TIMEOUT_MS}ms. An inner tool call may be hung — try a shorter timeout on the tool itself, or split the work.`,
          ),
        ),
      MAX_TIMEOUT_MS,
      rejection.reject,
    )
    hardTimer.unref?.()
    const result = await Promise.race([
      Promise.resolve(pending).then(value =>
        awaitObjectPromises(replContext, unwrapReplResult(value)),
      ),
      rejection.promise,
    ]).finally(() => {
      clearTimeout(hardTimer)
      signal.removeEventListener('abort', onAbort)
    })
    const newRegistered = [...registeredTools.keys()].filter(
      name => !initialRegistered.has(name),
    )
    const images = collectImages(progress)
    const output: Output = {
      code: input.code,
      result,
      stdout: replConsole.getStdout(),
      stderr: replConsole.getStderr(),
      ...(newRegistered.length > 0
        ? { registeredTools: newRegistered }
        : {}),
      ...(images.length > 0 ? { images } : {}),
    }
    replContext.replayLog.push({
      code: input.code,
      calls: replayCalls(progress),
      threw: false,
    })
    const newTools =
      newRegistered.length > 0
        ? registeredToolsToTools(registeredTools)
        : undefined
    return {
      data: output,
      newMessages: virtualMessages(progress),
      ...(newTools ? { newTools } : {}),
    }
  } catch (error) {
    if (error instanceof Error && error.stack) {
      logForDebugging(`REPL error stack trace:\n${error.stack}`, {
        level: 'error',
      })
    }
    const innerErrors = Array.from(progress.values()).filter(
      record => record.phase === 'error',
    )
    const base = errorMessage(error)
    const renderedError = innerErrors.length
      ? `${base}\n\nInner tool errors (likely root cause):\n${innerErrors
          .map(record => `- ${record.toolName}: ${record.error}`)
          .join('\n')}`
      : base
    const output: Output = {
      code: input.code,
      result: null,
      stdout: replConsole.getStdout(),
      stderr: replConsole.getStderr(),
      error: renderedError,
    }
    replContext.replayLog.push({
      code: input.code,
      calls: replayCalls(progress),
      threw: true,
    })
    return { data: output, newMessages: virtualMessages(progress) }
  } finally {
    childController.abort()
    scriptTimer.cancel()
    replContext.clearAllTimers()
  }
}

export const REPLTool = buildTool({
  name: REPL_TOOL_NAME,
  searchHint: 'execute JavaScript with programmatic tool access',
  get maxResultSizeChars() {
    return getMaxResultSizeChars()
  },
  async prompt() {
    return getREPLToolPrompt()
  },
  async description() {
    return getREPLToolDescription()
  },
  get inputSchema() {
    return inputSchema()
  },
  get outputSchema() {
    return outputSchema()
  },
  isEnabled() {
    return isReplModeEnabled()
  },
  isConcurrencySafe() {
    return false
  },
  isReadOnly() {
    return false
  },
  toAutoClassifierInput(input) {
    return input.code
  },
  async checkPermissions() {
    return { behavior: 'allow' as const }
  },
  async call(input, context, canUseTool, parentMessage, onProgress) {
    return executeRepl(
      input,
      context,
      canUseTool,
      parentMessage,
      onProgress as ToolCallProgress<ReplProgressEvent> | undefined,
    )
  },
  userFacingName() {
    return 'REPL'
  },
  isTransparentWrapper() {
    return true
  },
  getToolUseSummary(input) {
    if (!input?.code) return null
    const line = firstLineOf(input.code)
    return line.length > 50 ? line.slice(0, 49) + '…' : line || null
  },
  renderToolUseMessage() {
    return ''
  },
  renderToolUseRejectedMessage() {
    return (
      <Box>
        <Text color="warning">Rejected</Text>
      </Box>
    )
  },
  renderToolUseErrorMessage(error) {
    return (
      <Box>
        <Text color="error">
          {typeof error === 'string' ? error : 'Error'}
        </Text>
      </Box>
    )
  },
  renderToolUseProgressMessage(progressMessages) {
    const progress = progressMessages.at(-1)?.data as
      | ReplProgressEvent
      | undefined
    return (
      <Box>
        <Text dimColor>
          {progress ? `Running ${progress.toolName}…` : 'Working…'}
        </Text>
      </Box>
    )
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    const text = formatOutput(output)
    if (output.images?.length) {
      const maxResultSizeChars = getMaxResultSizeChars()
      const boundedText =
        text.length > maxResultSizeChars
          ? text.slice(0, maxResultSizeChars) +
            `\n[… ${text.length - maxResultSizeChars} more chars truncated — image-bearing REPL results are capped at ${maxResultSizeChars} chars of text]`
          : text || '(no text output)'
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: [
          { type: 'text', text: boundedText },
          ...output.images.map(image => ({
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: image.mediaType,
              data: image.base64,
            },
          })),
        ],
      }
    }
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: text,
      is_error: !!output.error,
    }
  },
})
