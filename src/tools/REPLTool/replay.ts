import { Script } from 'vm'
import type { Message } from '../../types/message.js'
import { logForDebugging } from '../../utils/debug.js'
import { REPL_TOOL_NAME } from './constants.js'
import { transpileReplCode, unwrapReplResult } from './transpile.js'
import type {
  ReplCallResult,
  ReplContext,
  ReplReplayEntry,
} from './types.js'
import { awaitObjectPromises, resetReplHelpers } from './vm.js'

const MAX_REPLAY_DRIFT = 100
const REPLAY_TIMEOUT_MS = 30_000

type ReplayResult =
  | { kind: 'ok'; consumed: number; total: number }
  | {
      kind: 'drift'
      reason: string
      consumed: number
      total: number
    }
  | { kind: 'threw'; error: string }

class ReplayCacheExhausted extends Error {
  constructor(toolName: string, callCount: number) {
    super(
      `REPL replay: ${toolName} invoked but only ${callCount} calls were cached. ` +
        'The replayed code is making more tool calls than the original — ' +
        'likely nondeterminism (Date.now, Math.random) took a different branch.',
    )
    this.name = 'ReplayCacheExhausted'
  }
}

function field(value: unknown, key: string): string {
  if (value === null || typeof value !== 'object') return ''
  const result = (value as Record<string, unknown>)[key]
  return typeof result === 'string' ? result : ''
}

function replToolUses(message: Message): { id: string; code: string }[] {
  if (message.type !== 'assistant' || message.isVirtual) return []
  const content = message.message.content
  if (!Array.isArray(content)) return []
  return content
    .filter(
      block => block.type === 'tool_use' && block.name === REPL_TOOL_NAME,
    )
    .map(block => ({ id: block.id, code: field(block.input, 'code') }))
}

function virtualToolName(message: Message): string | undefined {
  if (message.type !== 'assistant' || !message.isVirtual) return undefined
  const content = message.message.content
  if (!Array.isArray(content)) return undefined
  const first = content[0]
  return first?.type === 'tool_use' ? first.name : undefined
}

function virtualToolResult(
  message: Message,
  toolName: string,
): ReplCallResult | undefined {
  if (message.type !== 'user' || !message.isVirtual) return undefined
  const content = message.message.content
  if (!Array.isArray(content)) return undefined
  const first = content[0]
  if (first?.type !== 'tool_result') return undefined
  return first.is_error
    ? {
        kind: 'err',
        toolName,
        error: typeof first.content === 'string' ? first.content : '',
      }
    : { kind: 'ok', toolName, result: message.toolUseResult }
}

function replThrew(message: Message, replId: string): boolean | undefined {
  if (message.type !== 'user' || message.isVirtual) return undefined
  const content = message.message.content
  if (!Array.isArray(content)) return undefined
  if (
    !content.some(
      block => block.type === 'tool_result' && block.tool_use_id === replId,
    )
  ) {
    return undefined
  }
  return field(message.toolUseResult, 'error').length > 0
}

export function extractReplReplayEntries(messages: readonly Message[]): ReplReplayEntry[] {
  const entries: ReplReplayEntry[] = []
  let current:
    | (ReplReplayEntry & { replId: string; pendingName?: string })
    | undefined
  const finish = () => {
    if (!current) return
    entries.push({
      code: current.code,
      calls: current.calls,
      threw: current.threw,
    })
    current = undefined
  }

  for (const message of messages) {
    if (message.type !== 'assistant' && message.type !== 'user') continue
    if (message.isVirtual) {
      if (!current) continue
      const name = virtualToolName(message)
      if (name !== undefined) {
        current.pendingName = name
        continue
      }
      if (current.pendingName === undefined) continue
      const result = virtualToolResult(message, current.pendingName)
      if (!result) continue
      current.calls.push(result)
      current.pendingName = undefined
      continue
    }

    const uses = replToolUses(message)
    if (uses.length > 0) {
      for (const use of uses) {
        finish()
        current = {
          replId: use.id,
          code: use.code,
          calls: [],
          threw: false,
        }
      }
      continue
    }
    if (current) {
      const threw = replThrew(message, current.replId)
      if (threw !== undefined) current.threw = threw
    }
  }
  finish()
  return entries
}

function createReplayWrappers(calls: ReplCallResult[], toolNames: string[]) {
  let consumed = 0
  const drift: string[] = []
  const record = (message: string) => {
    if (drift.length < MAX_REPLAY_DRIFT) drift.push(message)
  }
  const next = (toolName: string) => {
    const call = calls[consumed]
    if (!call) throw new ReplayCacheExhausted(toolName, calls.length)
    consumed++
    if (call.toolName !== toolName) {
      record(
        `position ${consumed - 1}: expected ${call.toolName}, invoked ${toolName}`,
      )
    }
    return call
  }
  const wrappers = Object.fromEntries(
    toolNames.map(toolName => [
      toolName,
      async () => {
        await new Promise(resolve => setImmediate(resolve))
        const call = next(toolName)
        return call.kind === 'ok' ? call.result : { error: call.error }
      },
    ]),
  )
  return {
    wrappers,
    diagnostics: () => ({ consumed, total: calls.length, drift }),
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(Error(message)), timeoutMs)
        timer.unref?.()
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function replayEntry(
  context: ReplContext,
  entry: ReplReplayEntry,
): Promise<ReplayResult> {
  const toolNames = [...context.toolWrapperNames]
  const { wrappers, diagnostics } = createReplayWrappers(
    entry.calls,
    toolNames,
  )
  const originals = toolNames.map(
    name => [name, context.vmContext[name]] as const,
  )
  for (const name of toolNames) {
    context.vmContext[name] = context.sealers.asyncDataPropagate(
      wrappers[name]!,
    )
  }
  resetReplHelpers(context)

  try {
    const code = transpileReplCode(entry.code)
    const value = new Script(code, { filename: 'repl-replay.js' }).runInContext(
      context.vmContext,
      { timeout: REPLAY_TIMEOUT_MS },
    )
    const result = await withTimeout(
      Promise.resolve(value),
      REPLAY_TIMEOUT_MS,
      `REPL replay timed out after ${REPLAY_TIMEOUT_MS}ms`,
    )
    await awaitObjectPromises(context, unwrapReplResult(result))
    const state = diagnostics()
    if (entry.threw) {
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
    if (entry.threw) {
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
    for (const [name, value] of originals) context.vmContext[name] = value
    context.console.clear()
  }
}

export async function hydrateReplContext(
  context: ReplContext,
  entries: readonly ReplReplayEntry[],
): Promise<ReplayResult[]> {
  const results: ReplayResult[] = []
  for (const entry of entries) {
    const result = await replayEntry(context, entry)
    results.push(result)
    if (result.kind !== 'ok') {
      logForDebugging(
        `REPL replay ${result.kind} at block ${results.length}/${entries.length}: ${
          'error' in result ? result.error : result.reason
        }`,
        { level: 'warn' },
      )
    }
  }
  return results
}

export function summarizeReplay(results: readonly ReplayResult[]): {
  ok: number
  drifted: number
  threw: number
  summary: string
} {
  const ok = results.filter(result => result.kind === 'ok').length
  const drifted = results.filter(result => result.kind === 'drift').length
  const threw = results.filter(result => result.kind === 'threw').length
  const summary =
    threw > 0 || drifted > 0
      ? `${ok}/${results.length} blocks replayed cleanly (${drifted} drifted, ${threw} threw)`
      : `${ok} blocks replayed`
  return { ok, drifted, threw, summary }
}
