import { logEvent } from '../services/analytics/index.js'

const RATE_LIMIT_MS = 1000
const lastFiredByAction = new Map<string, number>()

export function logKeybindingFired(action: string): void {
  const actionId = action.startsWith('command:') ? 'command:custom' : action
  const now = Date.now()
  const lastFiredAt = lastFiredByAction.get(actionId)
  if (lastFiredAt !== undefined && now - lastFiredAt < RATE_LIMIT_MS) return
  lastFiredByAction.set(actionId, now)
  logEvent('tengu_keybinding_fired', { action_id: actionId })
}
