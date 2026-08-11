// Leaf config module — intentionally minimal imports so UI components
// can read the auto-dream enabled state without dragging in the forked
// agent / task registry / message builder chain that autoDream.ts pulls in.

import { getInitialSettings } from '../../utils/settings/settings.js'
import { isTeamMemoryActiveForCwd } from '../../memdir/teamMemPaths.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../analytics/growthbook.js'

type AutoDreamFeatureConfig = {
  enabled?: unknown
  available?: unknown
}

function getAutoDreamFeatureConfig(): AutoDreamFeatureConfig | null {
  return getFeatureValue_CACHED_MAY_BE_STALE<AutoDreamFeatureConfig | null>(
    'tengu_onyx_plover',
    null,
  )
}

export function isAutoDreamAvailable(): boolean {
  const config = getAutoDreamFeatureConfig()
  if (config?.enabled === true || config?.available === true) return true
  return isTeamMemoryActiveForCwd()
}

/**
 * Whether background memory consolidation should run. User setting
 * (autoDreamEnabled in settings.json) overrides the GrowthBook default
 * when explicitly set; otherwise falls through to tengu_onyx_plover.
 */
export function isAutoDreamEnabled(): boolean {
  if (!isAutoDreamAvailable()) return false
  const setting = getInitialSettings().autoDreamEnabled
  if (setting !== undefined) return setting
  if (getAutoDreamFeatureConfig()?.enabled === true) return true
  return isTeamMemoryActiveForCwd()
}
