import { logEvent } from '../services/analytics/index.js'
import {
  DEFAULT_GLOBAL_CONFIG,
  getGlobalConfig,
} from '../utils/config.js'
import { logError } from '../utils/log.js'
import { SETTINGS_BACKED_CONFIG_KEYS } from '../utils/settings/configSettings.js'
import {
  getSettingsForSource,
  updateSettingsForSource,
} from '../utils/settings/settings.js'
import type { SettingsJson } from '../utils/settings/types.js'

export function migrateUserIntentToSettings(): void {
  const legacyConfig = getGlobalConfig()
  const userSettings = getSettingsForSource('userSettings')
  const migrated: Partial<SettingsJson> = {}

  for (const key of SETTINGS_BACKED_CONFIG_KEYS) {
    const value = legacyConfig[key]
    if (value === undefined) continue
    if (value === DEFAULT_GLOBAL_CONFIG[key]) continue
    if (userSettings?.[key] !== undefined) continue
    ;(migrated as Record<string, unknown>)[key] = value
  }

  if (Object.keys(migrated).length === 0) return

  try {
    updateSettingsForSource('userSettings', migrated)
    logEvent('tengu_migrate_user_intent_to_settings', {
      migrated_count: Object.keys(migrated).length,
    })
  } catch (error) {
    logError(new Error(`Failed to migrate user-intent settings: ${error}`))
  }
}
