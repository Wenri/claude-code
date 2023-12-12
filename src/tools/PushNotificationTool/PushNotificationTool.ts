import { z } from 'zod/v4'
import {
  getIsRemoteMode,
  getLastInteractionTime,
  getTerminalFocus,
  isReplBridgeActive,
  isUserActiveForNotifications,
  NOTIF_ACTIVE_THRESHOLD_MS,
} from '../../bootstrap/state.js'
import { getFeatureValue_CACHED_WITH_REFRESH } from '../../services/analytics/growthbook.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import type { ToolUseContext } from '../../Tool.js'
import { buildTool, type ToolDef } from '../../Tool.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { getConfigValue } from '../../utils/settings/configSettings.js'
import { DESCRIPTION, PROMPT, PUSH_NOTIFICATION_TOOL_NAME } from './prompt.js'
import { renderToolResultMessage, renderToolUseMessage } from './UI.js'

const FEATURE_REFRESH_MS = 300_000

const inputSchema = lazySchema(() =>
  z.strictObject({
    message: z
      .string()
      .min(1)
      .describe(
        'The notification body. Keep it under 200 characters; mobile OSes truncate.',
      ),
    status: z.literal('proactive'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>
export type Input = z.infer<InputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    message: z.string(),
    pushSent: z.boolean().optional(),
    localSent: z.boolean().optional(),
    disabledReason: z
      .enum(['config_off', 'user_present', 'no_transport'])
      .optional(),
    idleSec: z.number().optional(),
    hasFocus: z.boolean().optional(),
    sentAt: z
      .string()
      .optional()
      .describe(
        'ISO timestamp captured at tool execution on the emitting process. Optional — resumed sessions replay pre-sentAt outputs verbatim.',
      ),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
export type Output = z.infer<OutputSchema>
type DisabledReason = NonNullable<Output['disabledReason']>

export const PushNotificationTool = buildTool({
  name: PUSH_NOTIFICATION_TOOL_NAME,
  searchHint: 'send a notification to the user via terminal and optionally mobile',
  maxResultSizeChars: 1_000,
  userFacingName: () => 'PushNotification',
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  shouldDefer: true,
  isEnabled() {
    return getFeatureValue_CACHED_WITH_REFRESH(
      'tengu_kairos_push_notifications',
      false,
      FEATURE_REFRESH_MS,
    )
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
  toAutoClassifierInput(input: Input) {
    return input.message
  },
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return PROMPT
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    let content: string
    if (output.disabledReason === 'config_off') {
      content = 'Push not sent — mobile push is disabled in /config.'
    } else if (output.disabledReason === 'user_present') {
      if (output.hasFocus === true) {
        content = 'Not sent — terminal has focus. Terminal + mobile suppressed.'
      } else {
        const thresholdSec = NOTIF_ACTIVE_THRESHOLD_MS / 1_000
        const idle =
          output.idleSec !== undefined
            ? `${output.idleSec}s`
            : `<${thresholdSec}s`
        content = `Not sent — user active (last keystroke ${idle} ago, threshold ${thresholdSec}s). Terminal + mobile suppressed.`
      }
    } else if (output.disabledReason === 'no_transport') {
      content = output.localSent
        ? 'Terminal notification sent. Mobile push not sent (Remote Control inactive).'
        : 'Mobile push not sent (Remote Control inactive).'
    } else {
      content = output.localSent
        ? 'Terminal notification sent. Mobile push requested.'
        : 'Mobile push requested.'
    }
    return { tool_use_id: toolUseID, type: 'tool_result', content }
  },
  renderToolUseMessage,
  renderToolResultMessage,
  async call({ message }: Input, context: ToolUseContext) {
    const sentAt = new Date().toISOString()
    const isRemote =
      isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) || getIsRemoteMode()
    const hasTransport = isRemote || isReplBridgeActive()
    const logSend = (
      pushSent: boolean,
      localSent: boolean,
      disabledReason?: DisabledReason,
    ) => {
      logEvent('tengu_push_notification_send', {
        message_length: message.length,
        push_sent: pushSent,
        local_sent: localSent,
        is_remote: isRemote,
        disabled_reason:
          disabledReason as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
    }

    if (
      hasTransport &&
      !isRemote &&
      !getConfigValue('agentPushNotifEnabled', false).value
    ) {
      logSend(false, false, 'config_off')
      return {
        data: {
          message,
          pushSent: false,
          localSent: false,
          disabledReason: 'config_off' as const,
          sentAt,
        },
      }
    }

    if (isUserActiveForNotifications()) {
      const idleSec = Math.round(
        (Date.now() - getLastInteractionTime()) / 1_000,
      )
      const hasFocus = getTerminalFocus()
      logSend(false, false, 'user_present')
      return {
        data: {
          message,
          pushSent: false,
          localSent: false,
          disabledReason: 'user_present' as const,
          idleSec,
          ...(hasFocus !== undefined && { hasFocus }),
          sentAt,
        },
      }
    }

    const localSent = context.sendOSNotification !== undefined
    if (localSent) {
      context.sendOSNotification?.({
        message,
        notificationType: 'push_notification',
      })
    }

    if (!hasTransport) {
      logSend(false, localSent, 'no_transport')
      return {
        data: {
          message,
          pushSent: false,
          localSent,
          disabledReason: 'no_transport' as const,
          sentAt,
        },
      }
    }

    logSend(true, localSent)
    return {
      data: { message, pushSent: true, localSent, sentAt },
    }
  },
} satisfies ToolDef<InputSchema, Output>)
