import { z } from 'zod/v4'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import { spawnShellTask } from '../../tasks/LocalShellTask/LocalShellTask.js'
import { killTask } from '../../tasks/LocalShellTask/killShellTasks.js'
import type { ToolUseContext } from '../../Tool.js'
import { buildTool, type ToolDef } from '../../Tool.js'
import { escapeXml } from '../../utils/xml.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { enqueuePendingNotification } from '../../utils/messageQueueManager.js'
import { isLoopPushNotificationEnabled } from '../../utils/loopSentinels.js'
import { emitTaskTerminatedSdk } from '../../utils/sdkEventQueue.js'
import { exec } from '../../utils/Shell.js'
import { shouldUseSandbox } from '../BashTool/shouldUseSandbox.js'
import { PUSH_NOTIFICATION_TOOL_NAME } from '../PushNotificationTool/prompt.js'
import { MONITOR_PROMPT, MONITOR_TOOL_NAME } from './prompt.js'
import {
  renderToolResultMessage,
  renderToolUseMessage,
  userFacingName,
} from './UI.js'

const MAX_TIMEOUT_MS = 3_600_000
const DEFAULT_TIMEOUT_MS = 300_000
const TOKEN_CAPACITY = 10
const TOKEN_REFILL_MS = 2_000
const FLOOD_DURATION_MS = 30_000
const MAX_LINE_CHARS = 500
const MAX_BATCH_CHARS = 3_000
const BATCH_DELAY_MS = 200
const MAX_BACKING_BUFFER_CHARS = 1_048_576

function getMonitorPrompt(): string {
  if (!isLoopPushNotificationEnabled()) return MONITOR_PROMPT
  return `${MONITOR_PROMPT}

When an event lands that the user would want to act on now — an error appeared, the status they were waiting on flipped — send a ${PUSH_NOTIFICATION_TOOL_NAME}. Not every event is worth a push; the ones that change what they'd do next are.`
}

const inputSchema = lazySchema(() =>
  z
    .strictObject({
      description: z
        .string()
        .describe(
          'Short human-readable description of what you are monitoring (shown in notifications).',
        ),
      timeout_ms: z
        .number()
        .min(1_000)
        .optional()
        .default(DEFAULT_TIMEOUT_MS)
        .describe(
          `Kill the monitor after this deadline. Default ${DEFAULT_TIMEOUT_MS}ms, max ${MAX_TIMEOUT_MS}ms. Ignored when persistent is true.`,
        ),
      persistent: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          'Run for the lifetime of the session (no timeout). Use for session-length watches like PR monitoring or log tails. Stop with TaskStop.',
        ),
      command: z
        .string()
        .describe(
          'Shell command or script. Each stdout line is an event; exit ends the watch.',
        ),
    })
    .refine(input => input.persistent || input.timeout_ms <= MAX_TIMEOUT_MS, {
      message: `timeout_ms must be ≤ ${MAX_TIMEOUT_MS}`,
      path: ['timeout_ms'],
    }),
)
type InputSchema = ReturnType<typeof inputSchema>
export type Input = z.infer<InputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    taskId: z.string().describe('ID of the background monitor task.'),
    timeoutMs: z
      .number()
      .describe('Timeout deadline in milliseconds (0 when persistent).'),
    persistent: z
      .boolean()
      .optional()
      .describe('No timeout — runs until TaskStop or session end.'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
export type Output = z.infer<OutputSchema>

export function enqueueMonitorEvent(
  description: string,
  event: string,
  taskId?: string,
  options?: { isHousekeeping?: boolean; agentId?: string },
): void {
  const id = taskId ? `\n<task-id>${escapeXml(taskId)}</task-id>` : ''
  const pushGuidance =
    !options?.isHousekeeping && isLoopPushNotificationEnabled()
      ? `\nIf this event is something the user would act on now, send a ${PUSH_NOTIFICATION_TOOL_NAME}. Routine or benign output doesn't need one.`
      : ''
  enqueuePendingNotification({
    value: `<task-notification>${id}
<summary>Monitor event: "${escapeXml(description)}"</summary>
<event>${escapeXml(event)}</event>${pushGuidance}
</task-notification>`,
    mode: 'task-notification',
    priority: 'next',
    agentId: options?.agentId,
  })
}

export function createStdoutBatcher(
  emit: (batch: string) => void,
  schedule: (flush: () => void) => () => void = flush => {
    const timer = setTimeout(flush, BATCH_DELAY_MS)
    return () => clearTimeout(timer)
  },
) {
  let backing = ''
  let lines: string[] = []
  let cancelScheduled: (() => void) | null = null

  function flush(includeRemainder = false): void {
    cancelScheduled?.()
    cancelScheduled = null
    if (includeRemainder && backing.trim()) {
      let line = backing.trim()
      if (line.length > MAX_LINE_CHARS) {
        line = `${line.slice(0, MAX_LINE_CHARS)}...(truncated)`
      }
      lines.push(line)
      backing = ''
    }
    if (lines.length === 0) return
    let batch = lines.join('\n')
    if (batch.length > MAX_BATCH_CHARS) {
      batch = `${batch.slice(0, MAX_BATCH_CHARS)}\n...(truncated)`
    }
    lines = []
    emit(batch)
  }

  function onData(chunk: string): void {
    backing += chunk
    if (backing.length > MAX_BACKING_BUFFER_CHARS) {
      backing = backing.slice(-MAX_BACKING_BUFFER_CHARS)
    }
    let newline: number
    while ((newline = backing.indexOf('\n')) !== -1) {
      let line = backing.slice(0, newline).trim()
      backing = backing.slice(newline + 1)
      if (!line) continue
      if (line.length > MAX_LINE_CHARS) {
        line = `${line.slice(0, MAX_LINE_CHARS)}...(truncated)`
      }
      lines.push(line)
    }
    if (lines.length > 0 && !cancelScheduled) {
      cancelScheduled = schedule(flush)
    }
  }

  return { onData, flush }
}

export function createTokenBucket(
  capacity: number,
  refillMs: number,
  now: () => number = Date.now,
) {
  let tokens = capacity
  let lastRefill = now()
  function refill(): void {
    const timestamp = now()
    const count = Math.floor((timestamp - lastRefill) / refillMs)
    if (count > 0) {
      tokens = Math.min(capacity, tokens + count)
      lastRefill += count * refillMs
    }
  }
  return {
    tryConsume(): boolean {
      refill()
      if (tokens <= 0) return false
      tokens--
      return true
    },
  }
}

async function startMonitor(
  command: string,
  input: Input,
  context: ToolUseContext,
) {
  const { description, timeout_ms: timeoutMs, persistent } = input
  const { abortController, toolUseId, agentId, taskRegistry } = context
  const taskIdRef: { id?: string } = {}
  let suppressed = 0
  let lastSuppressedAt: number | undefined
  let floodStartedAt: number | undefined
  let stopped = false
  const bucket = createTokenBucket(TOKEN_CAPACITY, TOKEN_REFILL_MS)
  const batcher = createStdoutBatcher(batch => {
    if (stopped) return
    if (bucket.tryConsume()) {
      if (suppressed > 0) {
        enqueueMonitorEvent(
          description,
          `[${suppressed} events suppressed — output rate too high. Consider using TaskStop to restart this monitor with a more selective filter.]`,
          taskIdRef.id,
        )
        suppressed = 0
        if (
          lastSuppressedAt !== undefined &&
          Date.now() - lastSuppressedAt > TOKEN_REFILL_MS * 3
        ) {
          floodStartedAt = undefined
        }
      }
      enqueueMonitorEvent(description, batch, taskIdRef.id)
      return
    }

    suppressed++
    lastSuppressedAt = Date.now()
    floodStartedAt ??= Date.now()
    if (Date.now() - floodStartedAt > FLOOD_DURATION_MS) {
      stopped = true
      enqueueMonitorEvent(
        description,
        `[Monitor stopped — your script produced too much output (${suppressed} events suppressed over ${Math.round((Date.now() - floodStartedAt) / 1000)}s). Write a new monitor command that filters more aggressively — pipe through grep --line-buffered, awk, or a wrapper script that only emits the specific events you need.]`,
        taskIdRef.id,
      )
      if (taskIdRef.id) {
        emitTaskTerminatedSdk(taskIdRef.id, 'stopped', {
          toolUseId,
          summary: description,
        })
        killTask(taskIdRef.id, taskRegistry)
      }
    }
  })

  const shellCommand = await exec(command, abortController.signal, 'bash', {
    preventCwdChanges: true,
    shouldUseSandbox: shouldUseSandbox({ command }),
    onStdout: batcher.onData,
    sessionEnvVars: context.sessionEnvVars,
    tmuxSocket: context.tmuxSocket,
  })
  const handle = await spawnShellTask(
    {
      command,
      description,
      shellCommand,
      toolUseId,
      agentId,
      kind: 'monitor',
    },
    {
      abortController,
      taskRegistry,
      abortSpeculation: context.abortSpeculation,
    },
  )
  taskIdRef.id = handle.taskId

  const timeout = persistent
    ? undefined
    : setTimeout(() => {
        if (stopped) return
        enqueueMonitorEvent(
          description,
          '[Monitor timed out — re-arm if needed.]',
          handle.taskId,
        )
        emitTaskTerminatedSdk(handle.taskId, 'stopped', {
          toolUseId,
          summary: description,
        })
        killTask(handle.taskId, taskRegistry)
      }, timeoutMs)

  void shellCommand.result.then(() => {
    if (timeout) clearTimeout(timeout)
    batcher.flush(true)
    stopped = true
  })

  return {
    data: {
      taskId: handle.taskId,
      timeoutMs: persistent ? 0 : timeoutMs,
      persistent,
    },
  }
}

export const MonitorTool = buildTool({
  name: MONITOR_TOOL_NAME,
  searchHint: 'stream events from a background script as live notifications',
  maxResultSizeChars: 10_000,
  shouldDefer: true,
  userFacingName,
  getToolUseSummary(input) {
    return input?.description || null
  },
  getActivityDescription(input) {
    return input?.description
      ? `Monitoring: ${input.description}`
      : 'Monitoring'
  },
  isEnabled() {
    return getFeatureValue_CACHED_MAY_BE_STALE(
      'tengu_amber_sentinel',
      false,
    )
  },
  isConcurrencySafe() {
    return true
  },
  renderToolUseMessage,
  renderToolResultMessage,
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  toAutoClassifierInput(input) {
    return input.command
  },
  async checkPermissions(input, context) {
    const { bashToolHasPermission } = await import(
      '../BashTool/bashPermissions.js'
    )
    return bashToolHasPermission(input, context)
  },
  async description() {
    return getMonitorPrompt()
  },
  async prompt() {
    return getMonitorPrompt()
  },
  async call(input, context) {
    return startMonitor(input.command, input, context)
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `Monitor started (task ${output.taskId}, ${output.persistent ? 'persistent — runs until TaskStop or session end' : `timeout ${output.timeoutMs}ms`}). You will be notified on each event. Keep working — do not poll or sleep. Events may arrive while you are waiting for the user — an event is not their reply.`,
    }
  },
} satisfies ToolDef<InputSchema, Output>)
