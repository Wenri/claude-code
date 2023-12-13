import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { isEnvTruthy } from './envUtils.js'
import { isEssentialTrafficOnly } from './privacyLevel.js'

function isUnsupportedProviderEnvironment(): boolean {
  return (
    isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK) ||
    isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX) ||
    isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY) ||
    isEnvTruthy(process.env.CLAUDE_CODE_USE_ANTHROPIC_AWS) ||
    isEnvTruthy(process.env.CLAUDE_CODE_USE_MANTLE)
  )
}

export function isAgentsFleetEnabled(): boolean {
  return (
    !isUnsupportedProviderEnvironment() &&
    !isEssentialTrafficOnly() &&
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_slate_meadow', false)
  )
}

export function isFgLeftArrowAgentsAvailable(): boolean {
  return (
    isAgentsFleetEnabled() &&
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_fg_left_arrow_agents', false)
  )
}

export function isDaemonCliEnabled(): boolean {
  return isAgentsFleetEnabled()
}

export function isDaemonWorkerRegistryEnabled(): boolean {
  return false
}

export function isDaemonServiceInstallEnabled(): boolean {
  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_amber_anchor', false)
}

export function daemonColdStartGbDefault(): 'transient' | 'ask' {
  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_quiet_harbor', false)
    ? 'ask'
    : 'transient'
}

export function daemonHint(command: string): string {
  return isDaemonCliEnabled() ? ` — run 'claude daemon ${command}'` : ''
}

export function fleetGateRejected(operation: string): never {
  process.stderr.write(`'${operation}' is not available in this release.\n`)
  process.exit(1)
}
