import axios from 'axios'
import { randomUUID } from '../utils/crypto.js'
import { onInteraction } from '../bootstrap/state.js'
import { logForDebugging } from '../utils/debug.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { isEssentialTrafficOnly } from '../utils/privacyLevel.js'

const PULSE_INTERVAL_MS = 5_000
const clientId = randomUUID()

type PresenceSession = {
  sessionId: string
  baseUrl: string
  getAuthHeaders: () => Record<string, string>
}

let session: PresenceSession | null = null
let unsubscribeInteraction: (() => void) | null = null
let connectedAt: string | null = null
let lastPulseAt = 0

export function wireBridgeClientPresence(
  sessionId: string,
  baseUrl: string,
  getAuthHeaders: () => Record<string, string>,
): void {
  cleanupBridgeClientPresence()
  if (isEssentialTrafficOnly()) return
  if (
    !getFeatureValue_CACHED_MAY_BE_STALE(
      'tengu_bridge_client_presence_enabled',
      false,
    )
  ) {
    return
  }

  session = { sessionId, baseUrl, getAuthHeaders }
  lastPulseAt = 0
  unsubscribeInteraction = onInteraction(pulseBridgeClientPresence)
  logForDebugging(`[presence] wired for session ${sessionId}`)
}

export function cleanupBridgeClientPresence(): void {
  unsubscribeInteraction?.()
  unsubscribeInteraction = null
  session = null
  connectedAt = null
}

function pulseBridgeClientPresence(): void {
  if (!session) return

  const now = Date.now()
  if (now - lastPulseAt < PULSE_INTERVAL_MS) return
  lastPulseAt = now
  connectedAt ??= new Date(now).toISOString()

  const url = `${session.baseUrl}/v1/code/sessions/${session.sessionId}/client/presence`
  logForDebugging(`[presence] pulse → ${url}`)
  void axios
    .post(
      url,
      { client_id: clientId, connected_at: connectedAt },
      {
        headers: {
          ...session.getAuthHeaders(),
          'anthropic-version': '2023-06-01',
          'anthropic-client-platform': 'cli',
        },
        timeout: PULSE_INTERVAL_MS,
        validateStatus: () => true,
      },
    )
    .then(
      response => {
        if (response.status >= 400) {
          logForDebugging(`[presence] pulse got ${response.status}`)
        }
      },
      () => {},
    )
}
