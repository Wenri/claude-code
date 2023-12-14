import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'

/** Server-controlled suppression for Max upgrade entry points. */
export function isUpgradeSuppressed(): boolean {
  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_idle_amber_finch', false)
}

/** Server-controlled suppression for Pro subscription-switch notices. */
export function isProSwitchSuppressed(): boolean {
  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_quiet_slate_wren', false)
}
