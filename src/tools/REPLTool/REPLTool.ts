import { randomUUID } from 'node:crypto'
import { inspect } from 'node:util'
import * as vm from 'node:vm'
import { isAbsolute, resolve } from 'node:path'
import { z } from 'zod/v4'
import {
  buildTool,
  type Tool,
  type ToolCallProgress,
  type ToolDef,
  type ToolUseContext,
  type Tools,
} from '../../Tool.js'
import { queryHaiku } from '../../services/api/claude.js'
import { logEvent } from '../../services/analytics/index.js'
import { sanitizeToolNameForAnalytics } from '../../services/analytics/metadata.js'
import {
  resolveHookPermissionDecision,
  runPostToolUseFailureHooks,
  runPostToolUseHooks,
  runPreToolUseHooks,
} from '../../services/tools/toolHooks.js'
import { getCwd } from '../../utils/cwd.js'
import { ShellError } from '../../utils/errors.js'
import { getFileModificationTime, readFileSafe } from '../../utils/file.js'
import { getGithubRepo } from '../../utils/git.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { logForDebugging } from '../../utils/log.js'
import {
  createAssistantMessage,
  createUserMessage,
  extractTextContent,
} from '../../utils/messages.js'
import { asSystemPrompt } from '../../utils/systemPromptType.js'
import { SandboxManager } from '../../utils/sandbox/sandbox-adapter.js'
import { expandPath } from '../../utils/path.js'
import { formatZodValidationError } from '../../utils/toolErrors.js'
import { evaluateToolIsolation } from '../../utils/toolIsolation.js'
import { BASH_TOOL_NAME } from '../BashTool/toolName.js'
import { FILE_EDIT_TOOL_NAME } from '../FileEditTool/constants.js'
import { FILE_WRITE_TOOL_NAME } from '../FileWriteTool/prompt.js'
import { TOOL_SEARCH_TOOL_NAME } from '../ToolSearchTool/constants.js'
import { REPL_TOOL_NAME, isReplModeEnabled } from './constants.js'
import { getReplPrimitiveTools } from './primitiveTools.js'
import { getReplDescription, getReplPrompt } from './prompt.js'
import type {
  RegisteredReplTool,
  ReplCall,
  ReplReplayBlock,
  ReplRuntimeContext,
} from './types.js'

const DEFAULT_SCRIPT_TIMEOUT_MS = 30_000
const MAX_SCRIPT_TIMEOUT_MS = 600_000
const MAX_CONSOLE_BYTES = 52_428_800
const MAX_READ_BYTES = 268_435_456
const MAX_GLOB_RESULTS = 25_000
const REGISTERED_TOOL_NAME_RE = /^[a-zA-Z0-9_-]{1,111}$/
const MODULE_LOADING_RE = /\b(import|require)\s*\(/
const GH_REPO_SUBCOMMAND_RE = /^(pr|issue|run|workflow|release|label|cache)\b/
const GH_REPO_OPTION_RE = /(^|\s)(-R|--repo\b)/

export type { ReplReplayBlock, ReplRuntimeContext } from './types.js'

type InnerCallState = {
  type: 'repl_tool_call'
  toolUseId: string
  toolName: string
  toolInput: Record<string, unknown>
  phase: 'start' | 'complete' | 'error'
  result?: unknown
  error?: string
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
      .describe('Optional timeout in milliseconds (default 30000, max 600000)'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    code: z.string().describe('The code that was executed'),
    result: z.unknown().describe('Return value from the code execution'),
    stdout: z.string().describe('Captured console.log output'),
    stderr: z.string().describe('Captured console.error output'),
    error: z.string().optional().describe('Error message if execution failed'),
    registeredTools: z
      .array(z.string())
      .optional()
      .describe('Names of tools registered during this execution'),
    innerToolCalls: z
      .array(z.object({ name: z.string(), input: z.unknown() }))
      .optional()
      .describe('File-mutating inner tool calls — consumed by verificationInterceptor'),
  }),
)

type ReplOutput = z.infer<ReturnType<typeof outputSchema>>

function createCapturedConsole() {
  const stdout: string[] = []
  const stderr: string[] = []
  let bytes = 0
  const append = (target: string[], value: string) => {
    if (bytes >= MAX_CONSOLE_BYTES) return
    bytes += value.length
    target.push(value)
    if (bytes >= MAX_CONSOLE_BYTES) {
      target.push('[console output truncated at 50MB]')
    }
  }
  const format = (values: unknown[]) =>
    values
      .map(value => {
        if (typeof value === 'string') return value
        try {
          return JSON.stringify(value, null, 2)
        } catch {
          return String(value)
        }
      })
      .join(' ')
  return {
    log: (...values: unknown[]) => append(stdout, format(values)),
    info: (...values: unknown[]) => append(stdout, format(values)),
    debug: (...values: unknown[]) => append(stdout, format(values)),
    error: (...values: unknown[]) => append(stderr, format(values)),
    warn: (...values: unknown[]) => append(stderr, format(values)),
    getStdout: () => stdout.join('\n'),
    getStderr: () => stderr.join('\n'),
    clear: () => {
      stdout.length = 0
      stderr.length = 0
      bytes = 0
    },
  }
}

function nullPrototype<T extends object>(value: T): T {
  Object.setPrototypeOf(value, null)
  try {
    delete (value as { constructor?: unknown }).constructor
    delete (value as { prototype?: unknown }).prototype
  } catch {
    // Some callable host objects expose non-configurable properties.
  }
  return value
}

function createRealmSealers(context: vm.Context): ReplRuntimeContext['sealers'] {
  const realm = vm.runInContext(
    `({
      arr: () => [],
      obj: () => ({}),
      wrap: (hostFn, cloneFn) => async (input) => {
        try { return cloneFn(await hostFn(input)) }
        catch (e) {
          if (e?.name === 'ReplayCacheExhausted') throw e
          return { error: typeof e?.message === 'string' ? e.message : String(e) }
        }
      },
      wrapN: (hostFn, cloneFn) => async (...args) => {
        try { return cloneFn(await hostFn(...args)) }
        catch (e) {
          if (e?.name === 'ReplayCacheExhausted') throw e
          return { error: typeof e?.message === 'string' ? e.message : String(e) }
        }
      },
      wrapPropagate: (hostFn, cloneFn, Err) => async (input) => {
        try { return cloneFn(await hostFn(input)) }
        catch (e) {
          const err = new Err(typeof e?.message === 'string' ? e.message : String(e))
          if (typeof e?.name === 'string') err.name = e.name
          throw err
        }
      },
      Err: Error,
    })`,
    context,
  ) as {
    arr(): unknown[]
    obj(): Record<string, unknown>
    wrap(
      hostFn: (input: Record<string, unknown>) => Promise<unknown>,
      cloneFn: (value: unknown) => unknown,
    ): (input: Record<string, unknown>) => Promise<unknown>
    wrapN(
      hostFn: (...input: unknown[]) => Promise<unknown>,
      cloneFn: (value: unknown) => unknown,
    ): (...input: unknown[]) => Promise<unknown>
    wrapPropagate(
      hostFn: (input: Record<string, unknown>) => Promise<unknown>,
      cloneFn: (value: unknown) => unknown,
      ErrorCtor: ErrorConstructor,
    ): (input: Record<string, unknown>) => Promise<unknown>
    Err: ErrorConstructor
  }

  const clone = (
    value: unknown,
    seen = new WeakMap<object, unknown>(),
  ): unknown => {
    if (typeof value === 'function') return undefined
    if (value === null || typeof value !== 'object') return value
    const existing = seen.get(value)
    if (existing !== undefined) return existing
    if (Array.isArray(value)) {
      const result = realm.arr()
      seen.set(value, result)
      for (let index = 0; index < value.length; index++) {
        result[index] = clone(value[index], seen)
      }
      return result
    }
    const result = realm.obj()
    seen.set(value, result)
    for (const key of Object.keys(value)) {
      result[key] = clone((value as Record<string, unknown>)[key], seen)
    }
    return result
  }
  const throwRealmError = (error: unknown): never => {
    let message: string
    try {
      message =
        typeof (error as { message?: unknown })?.message === 'string'
          ? (error as { message: string }).message
          : String(error)
    } catch {
      message = '<unprintable thrown value>'
    }
    throw new realm.Err(message)
  }
  return {
    fn: value =>
      nullPrototype((...args: never[]) => {
        try {
          return value(...args)
        } catch (error) {
          return throwRealmError(error)
        }
      }) as typeof value,
    clone,
    throwVM(message: string): never {
      throw new realm.Err(message)
    },
    asyncData: value => {
      const host = nullPrototype((input: Record<string, unknown>) => value(input))
      return realm.wrap(host, clone)
    },
    asyncDataN: value => {
      const host = nullPrototype((...input: unknown[]) => value(...input))
      return realm.wrapN(host, clone)
    },
    asyncDataPropagate: value => {
      const host = nullPrototype((input: Record<string, unknown>) => value(input))
      return realm.wrapPropagate(host, clone, realm.Err)
    },
  }
}

function formatToolError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const details = (error instanceof ShellError
    ? [
        `Exit code ${error.code}`,
        error.interrupted ? 'Interrupted by user' : '',
        error.stderr,
        error.stdout,
      ]
    : [
        error.message,
        'stderr' in error && typeof error.stderr === 'string' ? error.stderr : '',
        'stdout' in error && typeof error.stdout === 'string' ? error.stdout : '',
      ])
    .filter(Boolean)
    .join('\n')
    .trim()
  const value = details || 'Command failed with no output'
  if (value.length <= 10_000) return value
  return `${value.slice(0, 5_000)}\n\n... [${value.length - 10_000} characters truncated] ...\n\n${value.slice(-5_000)}`
}

let replTranspiler: Bun.Transpiler | undefined

function transpile(code: string): string {
  if (typeof Bun === 'undefined') throw new Error('unreachable: Bun required')
  const transformed = (replTranspiler ??= new Bun.Transpiler({
    loader: 'js',
    replMode: true,
  })).transformSync(code)
  const moduleLoading = MODULE_LOADING_RE.exec(transformed)
  if (moduleLoading) {
    const keyword = moduleLoading[1]
    throw new Error(
      `Module loading (${keyword}) is not available in REPL — the vm context is sealed. ` +
        "Use the tool globals instead: await Bash({command: '...'}), await Read({file_path: '...'}), await Glob({pattern: '...'}), etc.",
    )
  }
  return transformed
}

function unwrapReplValue(value: unknown): unknown {
  return value !== null && typeof value === 'object' && 'value' in value
    ? (value as { value: unknown }).value
    : value
}

function createPausableDeadline(timeoutMs: number, reject: (error: Error) => void) {
  let activeTools = 0
  let remaining = timeoutMs
  let startedAt = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  const start = () => {
    if (stopped || timer || activeTools > 0) return
    if (remaining <= 0) {
      stopped = true
      reject(
        new Error(
          `REPL execution timed out after ${timeoutMs}ms of script time (inner tool calls excluded). Script may still be running — avoid unbounded awaits.`,
        ),
      )
      return
    }
    startedAt = Date.now()
    timer = setTimeout(() => {
      stopped = true
      reject(
        new Error(
          `REPL execution timed out after ${timeoutMs}ms of script time (inner tool calls excluded). Script may still be running — avoid unbounded awaits.`,
        ),
      )
    }, remaining)
    timer.unref?.()
  }
  const pause = () => {
    if (!timer) return
    clearTimeout(timer)
    timer = undefined
    remaining -= Date.now() - startedAt
  }
  return {
    start,
    onToolStart: () => {
      if (activeTools++ === 0) pause()
    },
    onToolEnd: () => {
      if (--activeTools === 0) start()
    },
    cancel: () => {
      stopped = true
      pause()
    },
  }
}

function normalizeJsonSchema(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(normalizeJsonSchema)
  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    result[key] = normalizeJsonSchema(item)
  }
  if (result.type === 'object' && !('additionalProperties' in result)) {
    result.additionalProperties = false
  }
  return result
}

async function sampleWithHaiku(
  context: ToolUseContext,
  prompt: unknown,
  schema?: unknown,
  onState?: (state: InnerCallState) => void,
): Promise<unknown> {
  if (typeof prompt !== 'string') throw new Error('haiku: prompt must be a string')
  let outputFormat: { type: 'json_schema'; schema: Record<string, unknown> } | undefined
  if (schema !== undefined) {
    let serialized: unknown
    try {
      serialized = JSON.parse(JSON.stringify(schema))
    } catch {
      throw new Error('haiku: schema must be JSON-serializable')
    }
    if (serialized === null || typeof serialized !== 'object' || Array.isArray(serialized)) {
      throw new Error('haiku: schema must be an object')
    }
    outputFormat = {
      type: 'json_schema',
      schema: normalizeJsonSchema(serialized) as Record<string, unknown>,
    }
  }
  const toolUseId = `repl_${randomUUID()}`
  const toolInput = { prompt: prompt.slice(0, 200) }
  onState?.({
    type: 'repl_tool_call',
    toolUseId,
    toolName: 'haiku',
    toolInput,
    phase: 'start',
  })
  try {
    const result = await queryHaiku({
      systemPrompt: asSystemPrompt([]),
      userPrompt: prompt,
      outputFormat,
      signal: context.abortController.signal,
      options: {
        querySource: 'repl_sampling',
        agents: [],
        isNonInteractiveSession: context.options.isNonInteractiveSession,
        hasAppendSystemPrompt: false,
        mcpTools: [],
        enablePromptCaching: false,
      } as never,
    })
    const text = extractTextContent(result.message.content)
    const sampled = outputFormat ? JSON.parse(text) : text
    onState?.({
      type: 'repl_tool_call',
      toolUseId,
      toolName: 'haiku',
      toolInput,
      phase: 'complete',
      result: sampled,
    })
    return sampled
  } catch (error) {
    onState?.({
      type: 'repl_tool_call',
      toolUseId,
      toolName: 'haiku',
      toolInput,
      phase: 'error',
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

function findTools(context: ToolUseContext): Tools {
  const direct = context.options.refreshTools?.() ?? context.options.tools
  const names = new Set(direct.map(tool => tool.name))
  const result = direct.filter(
    tool =>
      tool.name !== REPL_TOOL_NAME && tool.name !== TOOL_SEARCH_TOOL_NAME,
  )
  for (const primitive of getReplPrimitiveTools()) {
    if (!names.has(primitive.name)) result.push(primitive)
  }
  return result
}

function createInnerToolWrapper(
  tool: Tool,
  context: ToolUseContext,
  canUseTool: Parameters<Tool['call']>[2],
  parentMessage: Parameters<Tool['call']>[3],
  onProgress: ToolCallProgress | undefined,
  calls: Map<string, InnerCallState>,
  deadline: ReturnType<typeof createPausableDeadline>,
) {
  const invoke = async (
    rawInput: Record<string, unknown>,
    options?: { toolUseID?: string },
  ): Promise<unknown> => {
    const toolUseId = options?.toolUseID ?? `repl_${randomUUID()}`
    const state: InnerCallState = {
      type: 'repl_tool_call',
      toolUseId,
      toolName: tool.name,
      toolInput: rawInput,
      phase: 'start',
    }
    calls.set(toolUseId, state)
    onProgress?.({ toolUseID: toolUseId, data: state as never })
    const fail = (message: string) => {
      state.phase = 'error'
      state.error = message
      onProgress?.({ toolUseID: toolUseId, data: state as never })
      return { error: message }
    }
    deadline.onToolStart()
    let processedInput: Record<string, unknown> = rawInput
    try {
      const parsed = tool.inputSchema.safeParse(rawInput)
      if (!parsed.success) {
        return fail(formatZodValidationError(tool.name, parsed.error))
      }
      processedInput = parsed.data
      const isolation = evaluateToolIsolation(tool, context)
      if (isolation.denyMessage) {
        logEvent('tengu_tool_use_isolation_latch_denied', {
          toolName: sanitizeToolNameForAnalytics(tool.name),
          toolUseID: toolUseId,
          isMcp: tool.isMcp ?? false,
          isolationLatch: isolation.activeLatch,
          isolationClassifiedAs: isolation.classifiedAs,
          replInnerCall: true,
        })
        return fail(isolation.denyMessage)
      }
      let hookPermissionResult
      let stopReason: string | undefined
      for await (const result of runPreToolUseHooks(
        context,
        tool,
        processedInput,
        toolUseId,
        parentMessage.message.id,
        (parentMessage as typeof parentMessage & { requestId?: string }).requestId,
        undefined,
        undefined,
      )) {
        if (result.type === 'hookPermissionResult') {
          hookPermissionResult = result.hookPermissionResult
        } else if (result.type === 'hookUpdatedInput') {
          processedInput = result.updatedInput
        } else if (result.type === 'stopReason') {
          stopReason = result.stopReason
        } else if (result.type === 'stop') {
          return fail(stopReason ?? 'Blocked by PreToolUse hook')
        }
      }
      const resolved = await resolveHookPermissionDecision(
        hookPermissionResult,
        tool,
        processedInput,
        context,
        canUseTool,
        parentMessage,
        toolUseId,
      )
      const permission = resolved.decision
      processedInput = resolved.input
      if (permission.behavior !== 'allow') {
        context.onPermissionDenial?.(tool, toolUseId, processedInput)
        return fail(
          `Permission denied for ${tool.name}: ${
            permission.behavior === 'deny'
              ? permission.message ?? 'Permission denied'
              : 'Permission denied'
          }`,
        )
      }
      let input = permission.updatedInput ?? processedInput
      if (
        tool.name === BASH_TOOL_NAME &&
        input !== null &&
        typeof input === 'object' &&
        '_simulatedSedEdit' in input
      ) {
        const { _simulatedSedEdit: _discarded, ...rest } = input
        input = rest
      }
      const result = await tool.call(
        input,
        {
          ...context,
          toolUseId,
          userModified: permission.userModified ?? false,
          fileReadingLimits: {
            maxTokens: Infinity,
            maxSizeBytes: MAX_READ_BYTES,
          },
          globLimits: { maxResults: MAX_GLOB_RESULTS },
        },
        canUseTool,
        parentMessage,
      )
      let output = result.data
      let postHookRan = false
      for await (const hookResult of runPostToolUseHooks(
        context,
        tool,
        toolUseId,
        parentMessage.message.id,
        input,
        result.data,
        (parentMessage as typeof parentMessage & { requestId?: string }).requestId,
        undefined,
        undefined,
      )) {
        postHookRan = true
        if ('updatedMCPToolOutput' in hookResult) {
          output = hookResult.updatedMCPToolOutput
        }
      }
      if (postHookRan) {
        resyncReadFileStateAfterHooks(
          tool.name,
          toolUseId,
          input,
          context,
        )
      }
      if (tool.isMcp && Array.isArray(output)) {
        const textBlocks = output.filter(
          block =>
            block !== null &&
            typeof block === 'object' &&
            'type' in block &&
            block.type === 'text' &&
            'text' in block &&
            typeof block.text === 'string',
        ) as { type: 'text'; text: string }[]
        if (textBlocks.length === output.length && textBlocks.length > 0) {
          const text = textBlocks.map(block => block.text).join('\n')
          try {
            output = JSON.parse(text)
          } catch {
            output = text
          }
        }
      }
      state.phase = 'complete'
      state.result = output
      onProgress?.({
        toolUseID: toolUseId,
        data: { ...state, result: undefined } as never,
      })
      return output
    } catch (error) {
      const message = formatToolError(error)
      for await (const _hookResult of runPostToolUseFailureHooks(
        context,
        tool,
        toolUseId,
        parentMessage.message.id,
        processedInput,
        message,
        false,
        (parentMessage as typeof parentMessage & { requestId?: string }).requestId,
        undefined,
        undefined,
      )) {
        // The hook side effect is authoritative; the virtual result below
        // carries the inner call's user-visible failure.
      }
      state.phase = 'error'
      state.error = message
      onProgress?.({ toolUseID: toolUseId, data: state as never })
      if (
        tool.name === BASH_TOOL_NAME &&
        error instanceof ShellError &&
        error.hadSandboxViolation &&
        rawInput.dangerouslyDisableSandbox !== true &&
        SandboxManager.isSandboxingEnabled() &&
        SandboxManager.areUnsandboxedCommandsAllowed()
      ) {
        logForDebugging('REPL Bash sandbox violation — auto-retrying unsandboxed')
        return invoke(
          { ...rawInput, dangerouslyDisableSandbox: true },
          { toolUseID: toolUseId },
        )
      }
      return { error: message }
    } finally {
      deadline.onToolEnd()
    }
  }
  return invoke
}

function resyncReadFileStateAfterHooks(
  toolName: string,
  toolUseId: string,
  input: Record<string, unknown>,
  context: ToolUseContext,
): void {
  if (toolName !== FILE_EDIT_TOOL_NAME && toolName !== FILE_WRITE_TOOL_NAME) {
    return
  }
  if (typeof input.file_path !== 'string') return
  try {
    const filename = expandPath(input.file_path)
    const cached = context.readFileState.get(filename)
    if (!cached || cached.offset !== undefined || cached.limit !== undefined) {
      return
    }
    const timestamp = getFileModificationTime(filename)
    if (timestamp <= cached.timestamp) return
    const content = readFileSafe(filename)
    if (content === null) return
    context.readFileState.set(filename, {
      content,
      timestamp,
      offset: undefined,
      limit: undefined,
    })
    if (cached.content !== content) {
      logForDebugging(
        `PostToolUse hook modified ${filename} after ${toolName} — re-synced readFileState`,
        { level: 'info' },
      )
      void toolUseId
    }
  } catch {
    // The cache is an optimization; a stat/read race must not fail the tool.
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function installConvenienceHelpers(
  runtime: ReplRuntimeContext,
  wrappers: Record<string, (input: Record<string, unknown>) => Promise<unknown>>,
  context: ToolUseContext,
  onSamplingState: (state: InnerCallState) => void,
) {
  const target = runtime.vmContext as Record<string, unknown>
  const call = async (name: string, input: Record<string, unknown>) => {
    const wrapper = wrappers[name]
    if (!wrapper) throw new Error(`${name} tool is not available in this REPL context`)
    return wrapper(input)
  }
  const absolute = (value: unknown) => {
    const filename = String(value)
    return isAbsolute(filename)
      ? filename
      : resolve(runtime.helperState.cwd, filename)
  }
  const object = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {}
  const text = (value: unknown, key: string) => {
    const item = object(value)[key]
    return typeof item === 'string' ? item : ''
  }
  const pathInput = (value?: unknown) =>
    value !== undefined
      ? { path: absolute(value) }
      : runtime.helperState.cwd !== getCwd()
        ? { path: runtime.helperState.cwd }
        : {}

  const sh = async (command: unknown, timeout?: unknown) => {
    const cwdCommand =
      runtime.helperState.cwd === getCwd()
        ? String(command)
        : `cd ${shellQuote(runtime.helperState.cwd)} && ${String(command)}`
    const result = object(
      await call('Bash', {
        command: cwdCommand,
        ...(typeof timeout === 'number' ? { timeout } : {}),
      }),
    )
    return [
      text(result, 'stdout'),
      text(result, 'stderr') && `[stderr]\n${text(result, 'stderr')}`,
      text(result, 'error') && `[error] ${text(result, 'error')}`,
    ]
      .filter(Boolean)
      .join('\n')
  }

  target.sh = runtime.sealers.asyncDataN(sh)
  target.gh = runtime.sealers.asyncDataN(async (args: unknown) => {
    let value = String(args).trim()
    const repo = runtime.helperState.repo
    if (repo && !GH_REPO_OPTION_RE.test(value)) {
      if (GH_REPO_SUBCOMMAND_RE.test(value)) value = `${value} -R ${repo}`
      value = value.replaceAll('repos/:owner/:repo', `repos/${repo}`)
    }
    return sh(`gh ${value}`)
  })
  target.cat = runtime.sealers.asyncDataN(async (
    filename: unknown,
    offset?: unknown,
    limit?: unknown,
  ) => {
    const result = object(
      await call('Read', {
        file_path: absolute(filename),
        ...(typeof offset === 'number' ? { offset } : {}),
        ...(typeof limit === 'number' ? { limit } : {}),
      }),
    )
    return text(object(result.file), 'content') || text(result, 'error')
  })
  target.rg = runtime.sealers.asyncDataN(async (
    pattern: unknown,
    searchPath?: unknown,
    rawOptions?: unknown,
  ) => {
    const options = object(rawOptions)
    const result = object(
      await call('Grep', {
        pattern: String(pattern),
        output_mode: 'content',
        '-n': true,
        ...pathInput(searchPath),
        ...(options.A !== undefined ? { '-A': options.A } : {}),
        ...(options.B !== undefined ? { '-B': options.B } : {}),
        ...(options.C !== undefined ? { '-C': options.C } : {}),
        ...(options.glob !== undefined ? { glob: options.glob } : {}),
        ...(options.head !== undefined ? { head_limit: options.head } : {}),
        ...(options.type !== undefined ? { type: options.type } : {}),
        ...(options.i !== undefined ? { '-i': options.i } : {}),
      }),
    )
    return text(result, 'content') || text(result, 'error')
  })
  target.rgf = runtime.sealers.asyncDataN(async (
    pattern: unknown,
    searchPath?: unknown,
    glob?: unknown,
  ) => {
    const result = object(
      await call('Grep', {
        pattern: String(pattern),
        output_mode: 'files_with_matches',
        ...pathInput(searchPath),
        ...(typeof glob === 'string' ? { glob } : {}),
      }),
    )
    return Array.isArray(result.filenames) ? result.filenames : []
  })
  target.gl = runtime.sealers.asyncDataN(async (
    pattern: unknown,
    searchPath?: unknown,
  ) => {
    const result = object(
      await call('Glob', {
        pattern: String(pattern),
        ...pathInput(searchPath),
      }),
    )
    return Array.isArray(result.filenames) ? result.filenames : []
  })
  target.put = runtime.sealers.asyncDataN(async (
    filename: unknown,
    content: unknown,
  ) => {
    const result = object(
      await call('Write', {
        file_path: absolute(filename),
        content: String(content),
      }),
    )
    return text(result, 'error') ? `[error] ${text(result, 'error')}` : ''
  })
  target.chdir = runtime.sealers.fn((value: unknown) => {
    runtime.helperState.cwd = absolute(value)
  })
  target.log = runtime.console.log
  target.str = runtime.sealers.fn((
    value: unknown,
    replacer?: unknown,
    spacing?: unknown,
  ) => {
    if (typeof replacer === 'function') {
      runtime.sealers.throwVM('str: function replacer not supported')
    }
    return JSON.stringify(value, replacer as never, spacing as never)
  })
  target.shQuote = runtime.sealers.fn((value: unknown) => shellQuote(String(value)))
  target.haiku = runtime.sealers.asyncDataN((prompt: unknown, schema?: unknown) =>
    sampleWithHaiku(context, prompt, schema, onSamplingState),
  )
  target.opus = target.haiku
  target.sonnet = target.haiku
}

function installRegisteredToolHelpers(runtime: ReplRuntimeContext) {
  const target = runtime.vmContext as Record<string, unknown>
  target.registerTool = runtime.sealers.fn((
    name: unknown,
    description: unknown,
    schema: unknown,
    handler: unknown,
    options?: { displayName?: unknown },
  ) => {
    if (typeof name !== 'string' || !REGISTERED_TOOL_NAME_RE.test(name)) {
      runtime.sealers.throwVM(
        `registerTool: name must match ^[a-zA-Z0-9_-]{1,111}$ (wire name is prefixed with 'eval_registered__'), got ${typeof name}: ${String(name).slice(0, 50)}`,
      )
    }
    if (runtime.reservedGlobals.has(name) && !runtime.registeredTools.has(name)) {
      runtime.sealers.throwVM(
        `registerTool: '${name}' collides with a built-in global; choose a different name`,
      )
    }
    if (typeof handler !== 'function') {
      runtime.sealers.throwVM('registerTool handler must be a function')
    }
    runtime.registeredTools.set(name, {
      name,
      description: String(description),
      schema: objectSchema(schema),
        handler: handler as RegisteredReplTool['handler'],
      ...(typeof options?.displayName === 'string'
        ? { displayName: options.displayName }
        : {}),
    })
    target[name] = runtime.sealers.asyncData(handler as RegisteredReplTool['handler'])
  })
  target.unregisterTool = runtime.sealers.fn((name: unknown) => {
    const value = String(name)
    if (!runtime.registeredTools.has(value)) return false
    delete target[value]
    return runtime.registeredTools.delete(value)
  })
  target.listTools = runtime.sealers.fn(() =>
    runtime.sealers.clone([...runtime.registeredTools.keys()]),
  )
  target.getTool = runtime.sealers.fn((name: unknown) => {
    const tool = runtime.registeredTools.get(String(name))
    if (!tool) return undefined
    return runtime.sealers.clone({
      name: tool.name,
      description: tool.description,
      schema: tool.schema,
      displayName: tool.displayName,
    })
  })
}

function objectSchema(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function createRuntime(): ReplRuntimeContext {
  const captured = createCapturedConsole()
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const vmContext = vm.createContext(Object.create(null), {
    codeGeneration: { strings: true, wasm: false },
  })
  vm.runInContext(
    `Object.defineProperty(Error, 'prepareStackTrace', {
      value: (err, sites) => String(err.stack ?? err),
      writable: false, configurable: false,
    });
    delete globalThis.ShadowRealm;
    delete globalThis.WebAssembly;`,
    vmContext,
  )
  const sealers = createRealmSealers(vmContext)
  const target = vmContext as Record<string, unknown>
  target.console = {
    __proto__: null,
    log: sealers.fn(captured.log),
    info: sealers.fn(captured.info),
    debug: sealers.fn(captured.debug),
    error: sealers.fn(captured.error),
    warn: sealers.fn(captured.warn),
  }
  target.setTimeout = sealers.fn((callback: () => void, delay: number) => {
    const timer = Number(setTimeout(callback, delay))
    timers.add(timer)
    return timer
  })
  target.clearTimeout = sealers.fn((timer: ReturnType<typeof setTimeout>) => {
    clearTimeout(timer)
    timers.delete(timer)
  })
  target.setInterval = sealers.fn((callback: () => void, delay: number) => {
    const timer = Number(setInterval(callback, delay))
    timers.add(timer)
    return timer
  })
  target.clearInterval = sealers.fn((timer: ReturnType<typeof setTimeout>) => {
    clearInterval(timer)
    timers.delete(timer)
  })
  target.atob = sealers.fn((value: string) => atob(value))
  target.btoa = sealers.fn((value: string) => btoa(value))

  const reservedGlobals = new Set([
    'sh',
    'cat',
    'rg',
    'rgf',
    'gl',
    'put',
    'gh',
    'chdir',
    'log',
    'str',
    'o',
    'REPO',
    '__proto__',
  ])
  try {
    for (const name of vm.runInContext('Object.getOwnPropertyNames(globalThis)', vmContext)) {
      reservedGlobals.add(name)
    }
  } catch {
    for (const name of ['JSON', 'Array', 'Object', 'Promise', 'globalThis']) {
      reservedGlobals.add(name)
    }
  }
  return {
    vmContext,
    registeredTools: new Map(),
    reservedGlobals,
    toolWrapperNames: new Set(),
    boundaryUuid: null,
    console: captured,
    sealers,
    clearAllTimers() {
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
    },
    replayLog: [],
    helperState: { cwd: getCwd() },
  }
}

function refreshRuntime(
  runtime: ReplRuntimeContext,
  context: ToolUseContext,
  canUseTool: Parameters<Tool['call']>[2],
  parentMessage: Parameters<Tool['call']>[3],
  onProgress: ToolCallProgress | undefined,
  calls: Map<string, InnerCallState>,
  deadline: ReturnType<typeof createPausableDeadline>,
) {
  const wrappers: Record<string, (input: Record<string, unknown>) => Promise<unknown>> = {}
  for (const tool of findTools(context)) {
    const wrapper = createInnerToolWrapper(
      tool,
      context,
      canUseTool,
      parentMessage,
      onProgress,
      calls,
      deadline,
    )
    wrappers[tool.name] = wrapper
    ;(runtime.vmContext as Record<string, unknown>)[tool.name] =
      runtime.sealers.asyncData(wrapper)
    runtime.toolWrapperNames.add(tool.name)
  }
  installConvenienceHelpers(runtime, wrappers, context, state => {
    const previous = calls.get(state.toolUseId)
    calls.set(
      state.toolUseId,
      previous
        ? { ...previous, ...state }
        : state,
    )
    if (state.phase === 'start') deadline.onToolStart()
    else deadline.onToolEnd()
    onProgress?.({
      toolUseID: state.toolUseId,
      data:
        state.result === undefined
          ? (state as never)
          : ({ ...state, result: undefined } as never),
    })
  })
  installRegisteredToolHelpers(runtime)
  for (const name of Object.keys(runtime.vmContext)) {
    runtime.reservedGlobals.add(name)
  }
  runtime.reservedGlobals.add('__proto__')
}

function toVirtualMessages(calls: Map<string, InnerCallState>) {
  const messages = []
  for (const call of calls.values()) {
    if (call.phase === 'start') continue
    messages.push(
      createAssistantMessage({
        content: [
          {
            type: 'tool_use',
            id: call.toolUseId,
            name: call.toolName,
            input: call.toolInput,
          },
        ] as never,
        isVirtual: true,
      }),
      createUserMessage({
        content: [
          {
            type: 'tool_result',
            tool_use_id: call.toolUseId,
            content: call.phase === 'error' ? call.error ?? '' : '',
            is_error: call.phase === 'error',
          },
        ],
        toolUseResult: call.result,
        isVirtual: true,
      }),
    )
  }
  return messages
}

function formatResult(value: unknown, depth: number): string {
  if (typeof value === 'string' && value.trim() !== '') return value
  try {
    return inspect(value, { colors: false, depth, customInspect: false })
  } catch {
    return '[non-serializable value]'
  }
}

function registeredToolDefinitions(runtime: ReplRuntimeContext): Tools {
  return [...runtime.registeredTools.values()].map(definition =>
    buildTool({
      name: `eval_registered__${definition.name}`,
      maxResultSizeChars: 100_000,
      async prompt() {
        return definition.description
      },
      async description() {
        return definition.description
      },
      inputSchema: z.object({}).passthrough(),
      inputJSONSchema: definition.schema as never,
      isEnabled: () => true,
      isConcurrencySafe: () => false,
      isReadOnly: () => false,
      toAutoClassifierInput: input =>
        Object.keys(input).length > 0
          ? `${definition.name}(${Object.keys(input).join(', ')})`
          : definition.name,
      async checkPermissions() {
        return {
          behavior: 'ask',
          message: `Execute registered tool "${definition.name}"`,
        }
      },
      async call(input) {
        return { data: await definition.handler(input) }
      },
      userFacingName: () => definition.displayName ?? definition.name,
      getToolUseSummary: () => null,
      mapToolResultToToolResultBlockParam(value, toolUseID) {
        let content: string
        try {
          content = JSON.stringify(value)
        } catch {
          content = String(value)
        }
        return { type: 'tool_result', tool_use_id: toolUseID, content }
      },
      renderToolUseMessage(input) {
        try {
          return `${definition.name}(${JSON.stringify(input, null, 2)})`
        } catch {
          return `${definition.name}(...)`
        }
      },
      renderToolResultMessage: () => null,
      renderToolUseRejectedMessage: () => 'Rejected',
      renderToolUseErrorMessage: value =>
        typeof value === 'string' ? value : 'Error',
      renderToolUseProgressMessage: () => null,
    } as never),
  )
}

function extractReplayBlocks(messages: ToolUseContext['messages']): ReplReplayBlock[] {
  const blocks: ReplReplayBlock[] = []
  let current:
    | (ReplReplayBlock & { replId: string; pendingToolName?: string })
    | undefined
  const finish = () => {
    if (!current) return
    blocks.push({ code: current.code, calls: current.calls, threw: current.threw })
    current = undefined
  }
  for (const message of messages) {
    if (message.type !== 'assistant' && message.type !== 'user') continue
    const content = message.message.content
    if (message.isVirtual) {
      if (!current || !Array.isArray(content)) continue
      const first = content[0]
      if (message.type === 'assistant' && first?.type === 'tool_use') {
        current.pendingToolName = first.name
        continue
      }
      if (
        message.type === 'user' &&
        first?.type === 'tool_result' &&
        current.pendingToolName
      ) {
        current.calls.push(
          first.is_error
            ? {
                kind: 'err',
                toolName: current.pendingToolName,
                error: typeof first.content === 'string' ? first.content : '',
              }
            : {
                kind: 'ok',
                toolName: current.pendingToolName,
                result: message.toolUseResult,
              },
        )
        current.pendingToolName = undefined
      }
      continue
    }
    if (message.type === 'assistant' && Array.isArray(content)) {
      const calls = content.filter(
        block => block.type === 'tool_use' && block.name === REPL_TOOL_NAME,
      )
      if (calls.length > 0) {
        for (const call of calls) {
          finish()
          const input =
            call.input !== null && typeof call.input === 'object'
              ? (call.input as Record<string, unknown>)
              : {}
          current = {
            replId: call.id,
            code: typeof input.code === 'string' ? input.code : '',
            calls: [],
            threw: false,
          }
        }
        continue
      }
    }
    if (current && message.type === 'user' && Array.isArray(content)) {
      const result = content.find(
        block => block.type === 'tool_result' && block.tool_use_id === current?.replId,
      )
      if (result?.type === 'tool_result') {
        const value = message.toolUseResult
        current.threw =
          value !== null &&
          typeof value === 'object' &&
          'error' in value &&
          typeof value.error === 'string' &&
          value.error.length > 0
      }
    }
  }
  finish()
  return blocks
}

function createReplayWrappers(
  calls: ReplCall[],
  toolNames: string[],
): {
  wrappers: Record<string, () => Promise<unknown>>
  diagnostics(): { consumed: number; total: number; drift: string[] }
} {
  let position = 0
  const drift: string[] = []
  const recordDrift = (value: string) => {
    if (drift.length < 100) drift.push(value)
  }
  const consume = (toolName: string) => {
    const call = calls[position]
    if (!call) throw new ReplayCacheExhausted(toolName, calls.length)
    position++
    if (call.toolName !== toolName) {
      recordDrift(
        `position ${position - 1}: expected ${call.toolName}, invoked ${toolName}`,
      )
    }
    return call
  }
  return {
    wrappers: Object.fromEntries(
      toolNames.map(toolName => [
        toolName,
        async () => {
          await new Promise<void>(resolveImmediate => setImmediate(resolveImmediate))
          const call = consume(toolName)
          return call.kind === 'ok' ? call.result : { error: call.error }
        },
      ]),
    ),
    diagnostics: () => ({ consumed: position, total: calls.length, drift }),
  }
}

async function withReplayTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs)
        timer.unref?.()
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function resolveObjectPromises(
  runtime: ReplRuntimeContext,
  value: unknown,
): Promise<unknown> {
  const result = value === undefined
    ? (runtime.vmContext as Record<string, unknown>).o
    : value
  if (result === null || typeof result !== 'object' || Array.isArray(result)) {
    return result
  }
  try {
    for (const key of Object.keys(result)) {
      try {
        const item = (result as Record<string, unknown>)[key]
        if (
          item !== null &&
          typeof item === 'object' &&
          typeof (item as PromiseLike<unknown>).then === 'function'
        ) {
          ;(result as Record<string, unknown>)[key] = await item
        }
      } catch (error) {
        const message = (error as { message?: unknown })?.message
        ;(result as Record<string, unknown>)[key] = {
          error: typeof message === 'string' ? message : String(error),
        }
      }
    }
  } catch {
    // A hostile proxy should not make REPL result collection fail.
  }
  return result
}

type ReplayResult =
  | { kind: 'ok'; consumed: number; total: number }
  | { kind: 'drift'; reason: string; consumed: number; total: number }
  | { kind: 'threw'; error: string }

async function replayBlock(
  runtime: ReplRuntimeContext,
  block: ReplReplayBlock,
): Promise<ReplayResult> {
  const toolNames = [...runtime.toolWrapperNames]
  const { wrappers, diagnostics } = createReplayWrappers(block.calls, toolNames)
  const originals = toolNames.map(
    name => [name, (runtime.vmContext as Record<string, unknown>)[name]] as const,
  )
  for (const name of toolNames) {
    ;(runtime.vmContext as Record<string, unknown>)[name] =
      runtime.sealers.asyncDataPropagate(wrappers[name]!)
  }
  runtime.helperState.cwd = getCwd()
  ;(runtime.vmContext as Record<string, unknown>).REPO =
    runtime.helperState.repo ?? ''
  ;(runtime.vmContext as Record<string, unknown>).o = runtime.sealers.clone({})
  try {
    const code = transpile(block.code)
    const evaluated = new vm.Script(code, { filename: 'repl-replay.js' }).runInContext(
      runtime.vmContext,
      { timeout: DEFAULT_SCRIPT_TIMEOUT_MS },
    )
    const value = await withReplayTimeout(
      Promise.resolve(evaluated),
      DEFAULT_SCRIPT_TIMEOUT_MS,
      `REPL replay timed out after ${DEFAULT_SCRIPT_TIMEOUT_MS}ms`,
    )
    await resolveObjectPromises(runtime, unwrapReplValue(value))
    const state = diagnostics()
    if (block.threw) {
      return {
        kind: 'drift',
        reason: 'original threw, replay succeeded',
        consumed: state.consumed,
        total: state.total,
      }
    }
    if (state.drift.length > 0 || state.consumed !== state.total) {
      return {
        kind: 'drift',
        reason:
          state.drift[0] ??
          `consumed ${state.consumed}/${state.total} cached calls`,
        consumed: state.consumed,
        total: state.total,
      }
    }
    return { kind: 'ok', consumed: state.consumed, total: state.total }
  } catch (error) {
    const state = diagnostics()
    const message =
      typeof (error as { message?: unknown })?.message === 'string'
        ? (error as { message: string }).message
        : String(error)
    if (block.threw) {
      if (state.drift.length > 0 || state.consumed !== state.total) {
        return {
          kind: 'drift',
          reason:
            state.drift[0] ??
            `consumed ${state.consumed}/${state.total} before expected throw`,
          consumed: state.consumed,
          total: state.total,
        }
      }
      return { kind: 'ok', consumed: state.consumed, total: state.total }
    }
    return { kind: 'threw', error: message }
  } finally {
    for (const [name, original] of originals) {
      ;(runtime.vmContext as Record<string, unknown>)[name] = original
    }
    runtime.console.clear()
  }
}

async function hydrateRuntime(
  runtime: ReplRuntimeContext,
  blocks: ReplReplayBlock[],
): Promise<ReplayResult[]> {
  const results: ReplayResult[] = []
  for (const block of blocks) {
    const result = await replayBlock(runtime, block)
    results.push(result)
    if (result.kind !== 'ok') {
      logForDebugging(
        `REPL replay ${result.kind} at block ${results.length}/${blocks.length}: ${
          result.kind === 'threw' ? result.error : result.reason
        }`,
        { level: 'warn' },
      )
    }
  }
  return results
}

export const REPLTool = buildTool({
  name: REPL_TOOL_NAME,
  searchHint: 'execute JavaScript with programmatic tool access',
  get maxResultSizeChars() {
    const match = process.env.TASK_MAX_OUTPUT_LENGTH?.match(/trim(\d+)k/)
    return match ? Number(match[1]) * 1_000 : 100_000
  },
  async prompt() {
    return getReplPrompt()
  },
  async description() {
    return getReplDescription()
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
    return { behavior: 'allow' }
  },
  async call(input, context, canUseTool, parentMessage, onProgress) {
    const agentId = context.agentId ?? ('main' as never)
    const appState = context.getAppState() as typeof context.getAppState extends () => infer T
      ? T & { replContexts?: Record<string, ReplRuntimeContext> }
      : never
    let runtime = appState.replContexts?.[agentId]
    const previousRuntime = runtime
    const firstMessage = context.messages[0]
    const boundaryUuid = firstMessage?.uuid ?? null
    let rejectExecution: (error: Error) => void = () => {}
    const rejection = new Promise<never>((_, reject) => {
      rejectExecution = reject
    })
    const timeout = Math.min(
      input.timeout ?? DEFAULT_SCRIPT_TIMEOUT_MS,
      MAX_SCRIPT_TIMEOUT_MS,
    )
    const linkedAbort = new AbortController()
    const forwardAbort = () =>
      linkedAbort.abort(context.abortController.signal.reason)
    if (context.abortController.signal.aborted) forwardAbort()
    else {
      context.abortController.signal.addEventListener('abort', forwardAbort, {
        once: true,
      })
    }
    const executionContext = { ...context, abortController: linkedAbort }
    const deadline = createPausableDeadline(timeout, rejectExecution)
    const calls = new Map<string, InnerCallState>()
    if (!runtime || runtime.boundaryUuid !== boundaryUuid) {
      runtime?.clearAllTimers()
      runtime?.console.clear()
      runtime = createRuntime()
      runtime.boundaryUuid = boundaryUuid
      runtime.helperState.repo = await getGithubRepo().catch(() => null)
      refreshRuntime(
        runtime,
        executionContext,
        canUseTool,
        parentMessage,
        onProgress,
        calls,
        deadline,
      )
      const requestedHydration = context.replHydration ?? { kind: 'fresh' }
      const hydration =
        requestedHydration.kind === 'fork' && previousRuntime
          ? ({ kind: 'fresh' } as const)
          : requestedHydration
      try {
        const replayBlocks =
          hydration.kind === 'fork'
            ? hydration.log
            : hydration.kind === 'resume'
              ? extractReplayBlocks(context.messages)
              : []
        if (replayBlocks.length > 0) {
          const startedAt = performance.now()
          const results = await hydrateRuntime(runtime, replayBlocks)
          const durationMs = Math.round(performance.now() - startedAt)
          logForDebugging(
            `REPL state hydrated from ${hydration.kind} in ${durationMs}ms: ${summarizeReplay(results)}`,
            { level: 'info' },
          )
          if (hydration.kind === 'resume') runtime.replayLog = [...replayBlocks]
        }
      } catch (error) {
        logForDebugging(
          `REPL state hydration failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { level: 'warn' },
        )
      }
      runtime.clearAllTimers()
      context.setReplContext?.(agentId, runtime)
      if (!context.setReplContext) {
        context.setAppState(previous => ({
          ...previous,
          replContexts: {
            ...((previous as typeof previous & {
              replContexts?: Record<string, ReplRuntimeContext>
            }).replContexts ?? {}),
            [agentId]: runtime!,
          },
        }))
      }
    } else {
      runtime.console.clear()
      runtime.clearAllTimers()
      refreshRuntime(
        runtime,
        executionContext,
        canUseTool,
        parentMessage,
        onProgress,
        calls,
        deadline,
      )
    }
    runtime.helperState.cwd = getCwd()
    ;(runtime.vmContext as Record<string, unknown>).o = runtime.sealers.clone({})
    ;(runtime.vmContext as Record<string, unknown>).REPO =
      runtime.helperState.repo ?? ''

    const registeredBefore = new Set(runtime.registeredTools.keys())
    const abort = () => rejectExecution(new Error('REPL execution interrupted'))
    if (context.abortController.signal.aborted) abort()
    else context.abortController.signal.addEventListener('abort', abort, {
      once: true,
    })

    try {
      const code = transpile(input.code)
      const evaluated = new vm.Script(code, {
        filename: 'repl-tool-code.js',
      }).runInContext(runtime.vmContext, { timeout })
      deadline.start()
      const hardTimer = setTimeout(
        () =>
          rejectExecution(
            new Error(
              `REPL execution exceeded hard wall-clock limit of ${MAX_SCRIPT_TIMEOUT_MS}ms. An inner tool call may be hung — try a shorter timeout on the tool itself, or split the work.`,
            ),
          ),
        MAX_SCRIPT_TIMEOUT_MS,
      )
      hardTimer.unref?.()
      const rawResult = await Promise.race([
        Promise.resolve(evaluated),
        rejection,
      ]).finally(() => clearTimeout(hardTimer))
      const resolvedResult = await resolveObjectPromises(
        runtime,
        unwrapReplValue(rawResult),
      )
      const result = runtime.sealers.clone(resolvedResult)
      const newlyRegistered = [...runtime.registeredTools.keys()].filter(
        name => !registeredBefore.has(name),
      )
      const data: ReplOutput = {
        code: input.code,
        result,
        stdout: runtime.console.getStdout(),
        stderr: runtime.console.getStderr(),
        ...(newlyRegistered.length > 0
          ? { registeredTools: newlyRegistered }
          : {}),
      }
      runtime.replayLog.push({
        code: input.code,
        calls: [...calls.values()]
          .filter(call => call.phase !== 'start')
          .map(call =>
            call.phase === 'error'
              ? {
                  kind: 'err' as const,
                  toolName: call.toolName,
                  error: call.error ?? '',
                }
              : {
                  kind: 'ok' as const,
                  toolName: call.toolName,
                  result: call.result,
                },
          ),
        threw: false,
      })
      return {
        data,
        newMessages: toVirtualMessages(calls),
        ...(newlyRegistered.length > 0
          ? { newTools: registeredToolDefinitions(runtime) }
          : {}),
      } as never
    } catch (error) {
      if (error instanceof Error && error.stack) {
        logForDebugging(`REPL error stack trace:\n${error.stack}`, {
          level: 'error',
        })
      }
      const failures = [...calls.values()].filter(call => call.phase === 'error')
      const base = formatToolError(error)
      const message = failures.length
        ? `${base}\n\nInner tool errors (likely root cause):\n${failures
            .map(call => `- ${call.toolName}: ${call.error}`)
            .join('\n')}`
        : base
      const data: ReplOutput = {
        code: input.code,
        result: null,
        stdout: runtime.console.getStdout(),
        stderr: runtime.console.getStderr(),
        error: message,
      }
      runtime.replayLog.push({
        code: input.code,
        calls: [...calls.values()]
          .filter(call => call.phase !== 'start')
          .map(call =>
            call.phase === 'error'
              ? {
                  kind: 'err' as const,
                  toolName: call.toolName,
                  error: call.error ?? '',
                }
              : {
                  kind: 'ok' as const,
                  toolName: call.toolName,
                  result: call.result,
                },
          ),
        threw: true,
      })
      return { data, newMessages: toVirtualMessages(calls) }
    } finally {
      linkedAbort.abort()
      context.abortController.signal.removeEventListener('abort', forwardAbort)
      deadline.cancel()
      runtime.clearAllTimers()
      context.abortController.signal.removeEventListener('abort', abort)
    }
  },
  userFacingName() {
    return 'REPL'
  },
  isTransparentWrapper() {
    return true
  },
  getToolUseSummary(input) {
    if (!input?.code) return null
    const firstLine = input.code.trim().split('\n', 1)[0]
    return firstLine.length > 50 ? `${firstLine.slice(0, 49)}…` : firstLine
  },
  renderToolUseMessage() {
    return ''
  },
  renderToolUseRejectedMessage() {
    return 'Rejected'
  },
  renderToolUseErrorMessage(value) {
    return typeof value === 'string' ? value : 'Error'
  },
  renderToolUseProgressMessage(progress) {
    const latest = progress.at(-1)?.data as InnerCallState | undefined
    return latest ? `Running ${latest.toolName}…` : 'Working…'
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    let content = ''
    if (
      !output.stdout &&
      !output.stderr &&
      !output.error &&
      output.result !== undefined &&
      !output.registeredTools?.length
    ) {
      content = formatResult(output.result, 10)
    } else {
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
      content = sections.join('\n\n')
    }
    return {
      type: 'tool_result',
      tool_use_id: toolUseID,
      content,
      is_error: Boolean(output.error),
    }
  },
} satisfies ToolDef<ReturnType<typeof inputSchema>, ReplOutput>)

// Keep the exact target replay diagnostics source-owned even when hydration is
// not needed in a fresh session. These functions are exercised by resume/fork
// callers as those paths are recovered.
export class ReplayCacheExhausted extends Error {
  constructor(toolName: string, cachedCalls: number) {
    super(
      `REPL replay: ${toolName} invoked but only ${cachedCalls} calls were cached. ` +
        'The replayed code is making more tool calls than the original — ' +
        'likely nondeterminism (Date.now, Math.random) took a different branch.',
    )
    this.name = 'ReplayCacheExhausted'
  }
}

export function summarizeReplay(
  results: Array<{ kind: 'ok' | 'drift' | 'threw' }>,
): string {
  const ok = results.filter(result => result.kind === 'ok').length
  const drift = results.filter(result => result.kind === 'drift').length
  const threw = results.filter(result => result.kind === 'threw').length
  return threw > 0 || drift > 0
    ? `${ok}/${results.length} blocks replayed cleanly (${drift} drifted, ${threw} threw)`
    : `${ok} blocks replayed`
}

export const REPL_REPLAY_FILENAME = 'repl-replay.js'
export const REPL_REPLAY_TIMEOUT_MESSAGE = 'REPL replay timed out after '
export const REPL_REPLAY_DRIFT_REASONS = [
  'original threw, replay succeeded',
  'consumed ',
  ' cached calls',
  ' before expected throw',
] as const
