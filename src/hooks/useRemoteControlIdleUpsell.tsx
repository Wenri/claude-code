import React, { useEffect, useRef } from 'react'
import { getRuntimeCapabilities } from '../bootstrap/state.js'
import { isBridgeEnabled } from '../bridge/bridgeEnabled.js'
import { useNotifications } from '../context/notifications.js'
import { Text } from '../ink.js'
import { logEvent } from '../services/analytics/index.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { useAppState } from '../state/AppState.js'
import {
  getGlobalConfig,
  getRemoteControlAtStartup,
  saveGlobalConfig,
} from '../utils/config.js'

const MAX_REMOTE_CONTROL_UPSELLS = 3
const MAX_PUSH_NOTIFICATION_UPSELLS = 3
const IDLE_UPSELL_DELAY_MINUTES = 20
const RC_IDLE_UPSELL_KEY = 'rc-idle-upsell'
const PUSH_IDLE_UPSELL_KEY = 'push-idle-upsell'

export function shouldShowRemoteControlIdleUpsell(): boolean {
  if (!isBridgeEnabled()) return false
  const config = getGlobalConfig()
  return (
    !config.hasUsedRemoteControl &&
    !getRemoteControlAtStartup() &&
    (config.remoteControlUpsellSeenCount ?? 0) < MAX_REMOTE_CONTROL_UPSELLS
  )
}

export function incrementRemoteControlUpsellSeenCount(): void {
  const next = (getGlobalConfig().remoteControlUpsellSeenCount ?? 0) + 1
  saveGlobalConfig(config =>
    (config.remoteControlUpsellSeenCount ?? 0) >= next
      ? config
      : { ...config, remoteControlUpsellSeenCount: next },
  )
}

function hasUsedOrStartsWithRemoteControl(): boolean {
  return (
    getGlobalConfig().hasUsedRemoteControl === true ||
    getRemoteControlAtStartup()
  )
}

export function shouldShowPushNotificationIdleUpsell(): boolean {
  if (!isBridgeEnabled()) return false
  if (
    !getFeatureValue_CACHED_MAY_BE_STALE(
      'tengu_kairos_push_notifications',
      false,
    )
  ) {
    return false
  }
  const config = getGlobalConfig()
  return (
    hasUsedOrStartsWithRemoteControl() &&
    config.agentPushNotifEnabled !== true &&
    (config.pushNotifUpsellSeenCount ?? 0) <
      MAX_PUSH_NOTIFICATION_UPSELLS
  )
}

export function incrementPushNotificationUpsellSeenCount(): void {
  const next = (getGlobalConfig().pushNotifUpsellSeenCount ?? 0) + 1
  saveGlobalConfig(config =>
    (config.pushNotifUpsellSeenCount ?? 0) >= next
      ? config
      : { ...config, pushNotifUpsellSeenCount: next },
  )
}

export function useRemoteControlIdleUpsell(
  lastQueryCompletionTime: number,
  isLoading: boolean,
): void {
  const { addNotification, removeNotification } = useNotifications()
  const bridgeActive = useAppState(
    state => state.replBridgeEnabled && !state.replBridgeOutboundOnly,
  )
  const bridgeActiveRef = useRef(bridgeActive)
  bridgeActiveRef.current = bridgeActive
  const shownRef = useRef(false)

  useEffect(() => {
    if (
      getRuntimeCapabilities().workspace === 'remote' ||
      lastQueryCompletionTime === 0 ||
      isLoading ||
      shownRef.current
    ) {
      return
    }

    const kind =
      !bridgeActiveRef.current && shouldShowRemoteControlIdleUpsell()
        ? 'rc'
        : shouldShowPushNotificationIdleUpsell()
          ? 'push'
          : null
    if (kind === null) return

    const elapsed = Date.now() - lastQueryCompletionTime
    const remaining = IDLE_UPSELL_DELAY_MINUTES * 60_000 - elapsed
    const timer = setTimeout(() => {
      if (shownRef.current) return
      const idleMinutes = Math.round(
        (Date.now() - lastQueryCompletionTime) / 60_000,
      )

      if (kind === 'rc') {
        if (
          bridgeActiveRef.current ||
          !shouldShowRemoteControlIdleUpsell()
        ) {
          return
        }
        shownRef.current = true
        incrementRemoteControlUpsellSeenCount()
        addNotification({
          key: RC_IDLE_UPSELL_KEY,
          jsx: (
            <>
              <Text dimColor>control this session from your phone · </Text>
              <Text color="suggestion">/remote-control</Text>
            </>
          ),
          priority: 'medium',
          timeoutMs: 0x7fffffff,
        })
        logEvent('tengu_rc_upsell_notification_shown', { idleMinutes })
        return
      }

      if (!shouldShowPushNotificationIdleUpsell()) return
      shownRef.current = true
      incrementPushNotificationUpsellSeenCount()
      addNotification({
        key: PUSH_IDLE_UPSELL_KEY,
        jsx: (
          <>
            <Text dimColor>
              get pinged when Claude finishes · enable push notifications in{' '}
            </Text>
            <Text color="suggestion">/config</Text>
          </>
        ),
        priority: 'medium',
        timeoutMs: 0x7fffffff,
      })
      logEvent('tengu_push_notif_upsell_notification_shown', { idleMinutes })
    }, Math.max(0, remaining))

    return () => {
      clearTimeout(timer)
      removeNotification(RC_IDLE_UPSELL_KEY)
      removeNotification(PUSH_IDLE_UPSELL_KEY)
    }
  }, [
    lastQueryCompletionTime,
    isLoading,
    addNotification,
    removeNotification,
  ])
}
