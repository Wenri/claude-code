import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../services/analytics/index.js'

const KEYBINDING_TELEMETRY_DEBOUNCE_MS = 1000
const lastFiredAt = new Map<string, number>()

/** Record a keybinding action at most once per second per normalized action. */
export function recordKeybindingFired(action: string): void {
  const actionId = action.startsWith('command:') ? 'command:custom' : action
  const now = Date.now()
  const previous = lastFiredAt.get(actionId)
  if (
    previous !== undefined &&
    now - previous < KEYBINDING_TELEMETRY_DEBOUNCE_MS
  ) {
    return
  }
  lastFiredAt.set(actionId, now)
  logEvent('tengu_keybinding_fired', {
    action_id:
      actionId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })
}
