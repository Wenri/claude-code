import { isBridgeEnabled } from '../bridge/bridgeEnabled.js'
import {
  getGlobalConfig,
  getRemoteControlAtStartup,
  saveGlobalConfig,
} from './config.js'

export const REMOTE_CONTROL_UPSELL_MAX_SHOW_COUNT = 3
export const REMOTE_CONTROL_UPSELL_IDLE_MINUTES = 20

export function shouldShowRemoteControlUpsell(): boolean {
  if (!isBridgeEnabled()) return false
  const config = getGlobalConfig()
  return (
    !config.hasUsedRemoteControl &&
    !getRemoteControlAtStartup() &&
    (config.remoteControlUpsellSeenCount ?? 0) <
      REMOTE_CONTROL_UPSELL_MAX_SHOW_COUNT
  )
}

export function markRemoteControlUpsellShown(): void {
  const nextCount = (getGlobalConfig().remoteControlUpsellSeenCount ?? 0) + 1
  saveGlobalConfig(config =>
    (config.remoteControlUpsellSeenCount ?? 0) >= nextCount
      ? config
      : { ...config, remoteControlUpsellSeenCount: nextCount },
  )
}

export function markRemoteControlUsed(): void {
  if (getGlobalConfig().hasUsedRemoteControl) return
  saveGlobalConfig(config =>
    config.hasUsedRemoteControl
      ? config
      : { ...config, hasUsedRemoteControl: true },
  )
}
