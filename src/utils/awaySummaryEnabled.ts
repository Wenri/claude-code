import { getIsNonInteractiveSession } from '../bootstrap/state.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { isEnvDefinedFalsy, isEnvTruthy } from './envUtils.js'
import { getInitialSettings } from './settings/settings.js'

export function isAwaySummaryEnabled(): boolean {
  const envValue = process.env.CLAUDE_CODE_ENABLE_AWAY_SUMMARY
  if (isEnvDefinedFalsy(envValue)) return false
  if (isEnvTruthy(envValue)) return true
  if (
    !getFeatureValue_CACHED_MAY_BE_STALE('tengu_sedge_lantern', true)
  ) {
    return false
  }
  if (getIsNonInteractiveSession()) return false
  return getInitialSettings()?.awaySummaryEnabled !== false
}
