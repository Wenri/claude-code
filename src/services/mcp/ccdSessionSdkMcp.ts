import {
  logEvent,
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
} from 'src/services/analytics/index.js'
import type { MCPServerConnection } from './types.js'
import { LogEventNotificationSchema } from './vscodeSdkMcp.js'

const ALLOWED_CCD_SESSION_EVENTS = new Set(['tengu_message_rated'])

/**
 * Relays the narrow set of analytics notifications emitted by the internal
 * ccd_session SDK MCP server. Never forward arbitrary event names or payloads
 * from the transport into analytics.
 */
export function setupCcdSessionSdkMcp(
  sdkClients: MCPServerConnection[],
): void {
  const connection = sdkClients.find(client => client.name === 'ccd_session')
  if (!connection || connection.type !== 'connected') return

  connection.client.setNotificationHandler(
    LogEventNotificationSchema(),
    async notification => {
      const { eventName, eventData } = notification.params
      if (!ALLOWED_CCD_SESSION_EVENTS.has(eventName)) return

      const data = eventData as Record<string, unknown>
      const optionalString = (value: unknown) =>
        value == null
          ? undefined
          : (String(
              value,
            ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS)

      logEvent(eventName, {
        message_uuid: optionalString(data.message_uuid),
        sentiment: optionalString(data.sentiment),
        surface: optionalString(data.surface),
        cleared: data.cleared === true,
      })
    },
  )
}
