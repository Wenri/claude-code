import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { z } from 'zod/v4'
import {
  SUMMARY_TAG,
  TASK_ID_TAG,
  TASK_NOTIFICATION_TAG,
} from '../../constants/xml.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import type { ToolUseContext } from '../../Tool.js'
import { buildTool, type ToolDef } from '../../Tool.js'
import {
  addAgentKeepaliveReason,
  removeAgentKeepaliveReason,
} from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import { spawnShellTask } from '../../tasks/LocalShellTask/LocalShellTask.js'
import { killTask } from '../../tasks/LocalShellTask/killShellTasks.js'
import { asAgentId, type AgentId } from '../../types/ids.js'
import { getAgentContext } from '../../utils/agentContext.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { enqueuePendingNotification } from '../../utils/messageQueueManager.js'
import { exec } from '../../utils/Shell.js'
import { escapeXml } from '../../utils/xml.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { getConfigValue } from '../../utils/settings/configSettings.js'
import { bashToolHasPermission } from '../BashTool/bashPermissions.js'
import { shouldUseSandbox } from '../BashTool/shouldUseSandbox.js'
import { getMonitorPrompt } from './prompt.js'
import {
  createLineBatcher,
  createTokenBucket,
  SUSTAINED_SUPPRESSION_MS,
  TOKEN_REFILL_INTERVAL_MS,
} from './stream.js'
import {
  getToolUseSummary,
  renderToolResultMessage,
  renderToolUseMessage,
} from './UI.js'

export const MONITOR_TOOL_NAME = 'Monitor'

const MAX_TIMEOUT_MS = 3_600_000
const CCR_MAX_TIMEOUT_MS = 1_800_000
const DEFAULT_TIMEOUT_MS = 300_000

const baseInputFields = () => ({
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
})

const inputSchema = lazySchema(() =>
  z
    .strictObject({
      ...baseInputFields(),
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

export function applyCcrTimeoutCap(
  input: Pick<Input, 'timeout_ms' | 'persistent'>,
): Pick<Input, 'timeout_ms' | 'persistent'> {
  if (!isEnvTruthy(process.env.CLAUDE_CODE_REMOTE)) {
    return { timeout_ms: input.timeout_ms, persistent: input.persistent }
  }
  return {
    timeout_ms: input.persistent
      ? CCR_MAX_TIMEOUT_MS
      : Math.min(input.timeout_ms, CCR_MAX_TIMEOUT_MS),
    persistent: false,
  }
}

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

function isPushNotificationAvailable(): boolean {
  return (
    getFeatureValue_CACHED_MAY_BE_STALE(
      'tengu_kairos_push_notifications',
      false,
    ) && getConfigValue('agentPushNotifEnabled', false).value
  )
}

export function enqueueMonitorEvent(
  description: string,
  event: string,
  taskId?: string,
  options?: { isHousekeeping?: boolean; agentId?: AgentId },
): void {
  const taskIdLine = taskId
    ? `\n<${TASK_ID_TAG}>${escapeXml(taskId)}</${TASK_ID_TAG}>`
    : ''
  const pushGuidance =
    !options?.isHousekeeping && isPushNotificationAvailable()
      ? '\nIf this event is something the user would act on now, send a PushNotification. Routine or benign output doesn\'t need one.'
      : ''
  const message = `<${TASK_NOTIFICATION_TAG}>${taskIdLine}
<${SUMMARY_TAG}>Monitor event: "${escapeXml(description)}"</${SUMMARY_TAG}>
<event>${escapeXml(event)}</event>${pushGuidance}
</${TASK_NOTIFICATION_TAG}>`
  enqueuePendingNotification({
    value: message,
    mode: 'task-notification',
    priority: 'next',
    agentId: options?.agentId,
  })
}

function getOwnerAgentId(context: ToolUseContext): AgentId | undefined {
  if (context.agentId) return context.agentId
  const agentContext = getAgentContext()
  return agentContext ? asAgentId(agentContext.agentId) : undefined
}

async function runMonitor(
  command: string,
  input: Input,
  context: ToolUseContext,
): Promise<{ data: Output }> {
  const { description } = input
  const { timeout_ms: timeoutMs, persistent } = applyCcrTimeoutCap(input)
  const { abortController, toolUseId } = context
  const setTaskState = context.setAppStateForTasks ?? context.setAppState
  const ownerAgentId = getOwnerAgentId(context)
  const taskRef: { id?: string } = {}
  let suppressedEvents = 0
  let suppressionStartedAt: number | undefined
  let lastSuppressedAt: number | undefined
  let stopped = false
  const bucket = createTokenBucket()

  const batcher = createLineBatcher(event => {
    if (stopped) return
    if (bucket.tryConsume()) {
      if (suppressedEvents > 0) {
        enqueueMonitorEvent(
          description,
          `[${suppressedEvents} events suppressed — output rate too high. Consider using TaskStop to restart this monitor with a more selective filter.]`,
          taskRef.id,
          { isHousekeeping: true, agentId: ownerAgentId },
        )
        suppressedEvents = 0
        if (
          lastSuppressedAt !== undefined &&
          Date.now() - lastSuppressedAt > TOKEN_REFILL_INTERVAL_MS * 3
        ) {
          suppressionStartedAt = undefined
        }
      }
      enqueueMonitorEvent(description, event, taskRef.id, {
        agentId: ownerAgentId,
      })
      return
    }

    suppressedEvents++
    lastSuppressedAt = Date.now()
    if (suppressionStartedAt === undefined) suppressionStartedAt = Date.now()
    if (Date.now() - suppressionStartedAt > SUSTAINED_SUPPRESSION_MS) {
      stopped = true
      enqueueMonitorEvent(
        description,
        `[Monitor stopped — your script produced too much output (${suppressedEvents} events suppressed over ${Math.round((Date.now() - suppressionStartedAt) / 1000)}s). Write a new monitor command that filters more aggressively — pipe through grep --line-buffered, awk, or a wrapper script that only emits the specific events you need.]`,
        taskRef.id,
        { isHousekeeping: true, agentId: ownerAgentId },
      )
      if (taskRef.id) killTask(taskRef.id, setTaskState)
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
      agentId: ownerAgentId,
      kind: 'monitor',
    },
    {
      abortController,
      getAppState: context.getAppState,
      setAppState: setTaskState,
    },
  )
  taskRef.id = handle.taskId
  addAgentKeepaliveReason(
    ownerAgentId,
    `monitor:${handle.taskId}`,
    setTaskState,
  )

  const timeout = persistent
    ? undefined
    : setTimeout(() => {
        if (stopped) return
        enqueueMonitorEvent(
          description,
          '[Monitor timed out — re-arm if needed.]',
          handle.taskId,
          { isHousekeeping: true, agentId: ownerAgentId },
        )
        killTask(handle.taskId, setTaskState)
      }, timeoutMs)

  void shellCommand.result.then(() => {
    if (timeout) clearTimeout(timeout)
    batcher.flush(true)
    stopped = true
    removeAgentKeepaliveReason(
      ownerAgentId,
      `monitor:${handle.taskId}`,
      setTaskState,
    )
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
  userFacingName: () => 'Monitor',
  getToolUseSummary,
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
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  async description() {
    return getMonitorPrompt()
  },
  async prompt() {
    return getMonitorPrompt()
  },
  toAutoClassifierInput(input) {
    return input.command
  },
  async checkPermissions(input, context) {
    return bashToolHasPermission(input, context)
  },
  async call(input, context) {
    return runMonitor(input.command, input, context)
  },
  renderToolUseMessage,
  renderToolResultMessage,
  mapToolResultToToolResultBlockParam(output, toolUseID): ToolResultBlockParam {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `Monitor started (task ${output.taskId}, ${
        output.persistent
          ? 'persistent — runs until TaskStop or session end'
          : `timeout ${output.timeoutMs}ms`
      }). You will be notified on each event. Keep working — do not poll or sleep. Events may arrive while you are waiting for the user — an event is not their reply.`,
    }
  },
} satisfies ToolDef<InputSchema, Output>)
