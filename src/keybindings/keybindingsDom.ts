import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'

export function isKeybindingsDomEnabled(): boolean {
  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_keybindings_dom', true)
}
