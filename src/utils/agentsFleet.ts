import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'

export function isAgentsFleetEnabled(): boolean {
  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_slate_meadow', false)
}

export function isFgLeftArrowAgentsAvailable(): boolean {
  return (
    isAgentsFleetEnabled() &&
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_fg_left_arrow_agents', false)
  )
}

/** The daemon management CLI is compiled out of this external release. */
export function isDaemonCliEnabled(): boolean {
  return false
}

export function fleetGateRejected(operation: string): never {
  process.stderr.write(`'${operation}' is not available in this release.\n`)
  process.exit(1)
}
