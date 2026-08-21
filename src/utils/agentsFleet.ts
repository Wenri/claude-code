import {
  getFeatureValue_CACHED_MAY_BE_STALE,
  hasGrowthBookCachedValue,
  hasGrowthBookEnvOverride,
  initializeGrowthBook,
} from '../services/analytics/growthbook.js'
import { getIsRemoteMode } from '../bootstrap/state.js'
import { isEnvTruthy } from './envUtils.js'
import { isEssentialTrafficOnly } from './privacyLevel.js'
import { getSettingsWithErrors } from './settings/settings.js'
import { getSessionSettingsCache } from './settings/settingsCache.js'
import { withTimeout } from './sleep.js'

function isUnsupportedProviderEnvironment(): boolean {
  return (
    isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK) ||
    isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX) ||
    isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY) ||
    isEnvTruthy(process.env.CLAUDE_CODE_USE_ANTHROPIC_AWS) ||
    isEnvTruthy(process.env.CLAUDE_CODE_USE_MANTLE)
  )
}

function isFleetDisabled(): boolean {
  const managed = getSessionSettingsCache()?.settings as
    | { disableBackgroundAgents?: boolean }
    | null
    | undefined
  return (
    typeof Bun === 'undefined' ||
    isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_AGENTS_FLEET) ||
    managed?.disableBackgroundAgents === true ||
    isUnsupportedProviderEnvironment() ||
    isEssentialTrafficOnly()
  )
}

export function isAgentsFleetEnabled(): boolean {
  return (
    !isFleetDisabled() &&
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_slate_meadow', false)
  )
}

/**
 * Hydrate the two synchronous caches consulted by the fleet gate.  Fleet entry
 * points call this before checking isAgentsFleetEnabled(), while render paths
 * keep using the non-blocking cached predicate above.
 */
export async function ensureFleetGateHydrated(): Promise<void> {
  if (getSessionSettingsCache() === null) getSettingsWithErrors()
  if (
    isFleetDisabled() ||
    hasGrowthBookEnvOverride('tengu_slate_meadow') ||
    (hasGrowthBookCachedValue('tengu_slate_meadow') &&
      hasGrowthBookCachedValue('tengu_quiet_harbor'))
  ) {
    return
  }
  await withTimeout(
    initializeGrowthBook(),
    1500,
    'gb-before-fleet-gate',
  ).catch(() => {})
}

export function isFgLeftArrowAgentsAvailable(): boolean {
  return (
    isAgentsFleetEnabled() &&
    !getIsRemoteMode() &&
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

export function isDaemonServiceRecalled(): boolean {
  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_copper_lantern', false)
}

export function daemonColdStartGbDefault(): 'transient' | 'ask' {
  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_quiet_harbor', false)
    ? 'ask'
    : 'transient'
}

export function bgSupervisorNoun(): 'daemon' | 'background service' {
  return isDaemonServiceInstallEnabled() ? 'daemon' : 'background service'
}

export function bgSupervisorNounCap(): 'Daemon' | 'Background service' {
  const noun = bgSupervisorNoun()
  return `${noun[0]!.toUpperCase()}${noun.slice(1)}` as
    | 'Daemon'
    | 'Background service'
}

export function daemonHint(command: string): string {
  return isDaemonCliEnabled() ? ` — run 'claude daemon ${command}'` : ''
}

export function fleetGateRejected(operation: string): never {
  process.stderr.write(
    typeof Bun === 'undefined'
      ? "Background sessions need the native Claude Code build.\nRun 'claude install' to switch.\n"
      : `'${operation}' is not enabled. If this is unexpected, retry in a moment.\n`,
  )
  process.exit(1)
}
