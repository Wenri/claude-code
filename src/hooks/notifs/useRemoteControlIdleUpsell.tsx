import { useEffect, useRef } from 'react'
import { getIsRemoteMode } from '../../bootstrap/state.js'
import { useNotifications } from '../../context/notifications.js'
import { Text } from '../../ink.js'
import { logEvent } from '../../services/analytics/index.js'
import { useAppState } from '../../state/AppState.js'
import {
  markRemoteControlUpsellShown,
  REMOTE_CONTROL_UPSELL_IDLE_MINUTES,
  shouldShowRemoteControlUpsell,
} from '../../utils/remoteControlUpsell.js'

const REMOTE_CONTROL_IDLE_UPSELL_KEY = 'rc-idle-upsell'

export function useRemoteControlIdleUpsell(
  lastQueryCompletionTime: number,
  isLoading: boolean,
): void {
  const { addNotification, removeNotification } = useNotifications()
  const isRemoteControlActive = useAppState(
    state => state.replBridgeEnabled && !state.replBridgeOutboundOnly,
  )
  const shownRef = useRef(false)

  useEffect(() => {
    if (
      getIsRemoteMode() ||
      lastQueryCompletionTime === 0 ||
      isLoading ||
      isRemoteControlActive ||
      shownRef.current ||
      !shouldShowRemoteControlUpsell()
    ) {
      return
    }

    const elapsed = Date.now() - lastQueryCompletionTime
    const remaining =
      REMOTE_CONTROL_UPSELL_IDLE_MINUTES * 60_000 - elapsed
    const timer = setTimeout(
      showRemoteControlIdleUpsell,
      Math.max(0, remaining),
      lastQueryCompletionTime,
      addNotification,
      shownRef,
    )

    return () => {
      clearTimeout(timer)
      removeNotification(REMOTE_CONTROL_IDLE_UPSELL_KEY)
    }
  }, [
    lastQueryCompletionTime,
    isLoading,
    isRemoteControlActive,
    addNotification,
    removeNotification,
  ])
}

function showRemoteControlIdleUpsell(
  lastQueryCompletionTime: number,
  addNotification: ReturnType<typeof useNotifications>['addNotification'],
  shownRef: { current: boolean },
): void {
  if (shownRef.current || !shouldShowRemoteControlUpsell()) return
  shownRef.current = true
  markRemoteControlUpsellShown()
  addNotification({
    key: REMOTE_CONTROL_IDLE_UPSELL_KEY,
    jsx: (
      <>
        <Text dimColor>control this session from your phone · </Text>
        <Text color="suggestion">/remote-control</Text>
      </>
    ),
    priority: 'medium',
    timeoutMs: 2_147_483_647,
  })
  logEvent('tengu_rc_upsell_notification_shown', {
    idleMinutes: Math.round(
      (Date.now() - lastQueryCompletionTime) / 60_000,
    ),
  })
}
