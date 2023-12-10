import axios from 'axios'
import { randomUUID } from 'crypto'
import { onInteraction } from '../bootstrap/state.js'
import {
  getTerminalFocusState,
  subscribeTerminalFocus,
} from '../ink/terminal-focus-state.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { logForDebugging } from '../utils/debug.js'
import { getClientPlatform } from '../utils/http.js'
import { isNonessentialTrafficDisabled } from '../utils/privacyLevel.js'

const PRESENCE_THROTTLE_MS = 5_000
const clientId = randomUUID()

let presence:
  | {
      sessionId: string
      baseUrl: string
      getAuthHeaders: () => Record<string, string>
    }
  | undefined
let connectedAt: string | undefined
let lastPulseAt = 0
let unsubscribeInteraction: (() => void) | undefined
let unsubscribeTerminalFocus: (() => void) | undefined

export function setupBridgeClientPresence(
  sessionId: string,
  baseUrl: string,
  getAuthHeaders: () => Record<string, string>,
): void {
  cleanupBridgeClientPresence()
  if (isNonessentialTrafficDisabled()) return
  if (
    !getFeatureValue_CACHED_MAY_BE_STALE(
      'tengu_bridge_client_presence_enabled',
      false,
    )
  ) {
    return
  }

  presence = { sessionId, baseUrl, getAuthHeaders }
  lastPulseAt = 0
  unsubscribeInteraction = onInteraction(pulseBridgeClientPresence)
  unsubscribeTerminalFocus = subscribeTerminalFocus(() => {
    const focus = getTerminalFocusState()
    logForDebugging(`[presence] terminal focus → ${focus}`)
    if (focus === 'focused') pulseBridgeClientPresence()
  })
  logForDebugging(`[presence] wired for session ${sessionId}`)
  pulseBridgeClientPresence()
}

export function cleanupBridgeClientPresence(): void {
  unsubscribeInteraction?.()
  unsubscribeInteraction = undefined
  unsubscribeTerminalFocus?.()
  unsubscribeTerminalFocus = undefined
  presence = undefined
  connectedAt = undefined
}

function pulseBridgeClientPresence(): void {
  if (!presence) return
  const now = Date.now()
  if (now - lastPulseAt < PRESENCE_THROTTLE_MS) return
  lastPulseAt = now
  connectedAt ??= new Date(now).toISOString()

  const url = `${presence.baseUrl}/v1/code/sessions/${presence.sessionId}/client/presence`
  logForDebugging(`[presence] pulse → ${url}`)
  void axios
    .post(
      url,
      { client_id: clientId, connected_at: connectedAt },
      {
        headers: {
          ...presence.getAuthHeaders(),
          'anthropic-version': '2023-06-01',
          'anthropic-client-platform': getClientPlatform(),
        },
        timeout: PRESENCE_THROTTLE_MS,
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
