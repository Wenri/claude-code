import { useEffect } from 'react'
import { useNotifications } from '../../context/notifications.js'
import { useAppState } from '../../state/AppState.js'

/**
 * Retain the external-build hook shape for skill-truncation notifications.
 * The notification body is internal-only and compiles to a no-op externally.
 */
export function useSkillTruncationNotification(): void {
  const { addNotification, removeNotification } = useNotifications()
  const skillTruncationStats = useAppState(state => state.skillTruncationStats)

  useEffect(() => {}, [
    skillTruncationStats,
    addNotification,
    removeNotification,
  ])
}
