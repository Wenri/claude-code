import { feature } from 'bun:bundle'
import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import {
  AUTONOMOUS_LOOP_DYNAMIC_SENTINEL,
  AUTONOMOUS_LOOP_SENTINEL,
  DESCRIPTION,
  PROMPT,
  SCHEDULE_WAKEUP_TOOL_NAME,
} from './prompt.js'

/* eslint-disable @typescript-eslint/no-require-imports */
const loopDynamicModule = feature('AGENT_TRIGGERS')
  ? (require('../../utils/loopDynamic.js') as typeof import('../../utils/loopDynamic.js'))
  : null
/* eslint-enable @typescript-eslint/no-require-imports */

const inputSchema = lazySchema(() =>
  z.strictObject({
    delaySeconds: z
      .number()
      .describe(
        'Seconds from now to wake up. Clamped to [60, 3600] by the runtime.',
      ),
    reason: z
      .string()
      .describe(
        'One short sentence explaining the chosen delay. Goes to telemetry and is shown to the user. Be specific.',
      ),
    prompt: z
      .string()
      .describe(
        `The /loop input to fire on wake-up. Pass the same /loop input verbatim each turn so the next firing re-enters the skill and continues the loop. For autonomous /loop (no user prompt), pass the literal sentinel \`${AUTONOMOUS_LOOP_DYNAMIC_SENTINEL}\` instead (the dynamic-pacing variant, not the CronCreate-mode \`${AUTONOMOUS_LOOP_SENTINEL}\`).`,
      ),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    scheduledFor: z
      .number()
      .describe('Epoch ms timestamp when the next wakeup will fire'),
    clampedDelaySeconds: z
      .number()
      .describe('Actual delay used after clamping to runtime bounds'),
    wasClamped: z
      .boolean()
      .describe(
        'True if the requested delaySeconds was outside [60, 3600]',
      ),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
type Output = z.infer<OutputSchema>

export const ScheduleWakeupTool = buildTool({
  name: SCHEDULE_WAKEUP_TOOL_NAME,
  searchHint:
    'self-pace next iteration: pick a delay before resuming work or running the next /loop tick',
  maxResultSizeChars: 1_000,
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return PROMPT
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  userFacingName() {
    return ''
  },
  shouldDefer: true,
  async checkPermissions(input) {
    return { behavior: 'allow', updatedInput: input }
  },
  renderToolUseMessage() {
    return null
  },
  async call({ delaySeconds, reason, prompt }) {
    const result =
      loopDynamicModule !== null && !loopDynamicModule.isLoopDynamicEnabled()
        ? null
        : (loopDynamicModule?.scheduleLoopWakeup(
            delaySeconds,
            prompt,
            reason,
          ) ?? null)
    if (result === null) {
      return {
        data: {
          scheduledFor: 0,
          clampedDelaySeconds: 0,
          wasClamped: false,
        },
      }
    }
    return {
      data: {
        scheduledFor: result.scheduledFor,
        clampedDelaySeconds: result.clampedDelaySeconds,
        wasClamped: result.wasClamped,
      },
    }
  },
  mapToolResultToToolResultBlockParam(
    { scheduledFor, clampedDelaySeconds, wasClamped },
    toolUseID,
  ) {
    if (scheduledFor === 0) {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content:
          'Wakeup not scheduled. Either the /loop dynamic runtime gate is off or the loop reached its maximum duration — the loop has ended; do not re-issue.',
      }
    }
    const time = new Date(scheduledFor).toTimeString().slice(0, 8)
    const remaining = Math.max(
      0,
      Math.round((scheduledFor - Date.now()) / 1000),
    )
    const suffix = wasClamped
      ? ` (clamped to ${clampedDelaySeconds}s from your requested value)`
      : ''
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `Next wakeup scheduled for ${time} (in ${remaining}s)${suffix}.`,
    }
  },
} satisfies ToolDef<InputSchema, Output>)
