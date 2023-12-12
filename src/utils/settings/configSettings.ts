import {
  DEFAULT_GLOBAL_CONFIG,
  getGlobalConfig,
  type GlobalConfig,
} from '../config.js'
import { getEnabledSettingSources, type SettingSource } from './constants.js'
import {
  getSettingsForSource,
  updateSettingsForSource,
} from './settings.js'
import type { SettingsJson } from './types.js'

/**
 * Settings formerly stored in ~/.claude.json that now live in settings.json.
 * The legacy values remain readable so existing installations migrate without
 * an eager rewrite.
 */
export const SETTINGS_BACKED_CONFIG_KEYS = [
  'theme',
  'editorMode',
  'verbose',
  'preferredNotifChannel',
  'autoCompactEnabled',
  'autoScrollEnabled',
  'fileCheckpointingEnabled',
  'showTurnDuration',
  'showMessageTimestamps',
  'terminalProgressBarEnabled',
  'todoFeatureEnabled',
  'teammateMode',
  'remoteControlAtStartup',
  'autoUploadSessions',
  'inputNeededNotifEnabled',
  'agentPushNotifEnabled',
] as const satisfies readonly (keyof GlobalConfig & keyof SettingsJson)[]

export type SettingsBackedConfigKey =
  (typeof SETTINGS_BACKED_CONFIG_KEYS)[number]

export type ConfigValueSource =
  | SettingSource
  | 'legacyGlobalConfig'
  | 'default'

export function getConfigValue<K extends SettingsBackedConfigKey>(
  key: K,
  defaultValue: NonNullable<GlobalConfig[K]>,
): {
  value: NonNullable<GlobalConfig[K]>
  source: ConfigValueSource
} {
  const enabledSources = getEnabledSettingSources()
  for (let index = enabledSources.length - 1; index >= 0; index--) {
    const source = enabledSources[index]!
    const value = getSettingsForSource(source)?.[key]
    if (value !== undefined) {
      return {
        value: value as NonNullable<GlobalConfig[K]>,
        source,
      }
    }
  }

  const legacyValue = getGlobalConfig()[key]
  if (
    legacyValue !== undefined &&
    legacyValue !== DEFAULT_GLOBAL_CONFIG[key]
  ) {
    return {
      value: legacyValue as NonNullable<GlobalConfig[K]>,
      source: 'legacyGlobalConfig',
    }
  }

  return { value: defaultValue, source: 'default' }
}

export function setConfigValue<K extends SettingsBackedConfigKey>(
  key: K,
  value: SettingsJson[K] | undefined,
): void {
  updateSettingsForSource('userSettings', { [key]: value })
}
