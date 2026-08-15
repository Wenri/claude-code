import { useEffect } from 'react'
import { useNotifications } from '../../context/notifications.js'
import { useAppState } from '../../state/AppState.js'

/**
 * The external build retains the skill-listing diagnostic subscription while
 * its notification body is disabled. Keeping the subscription preserves the
 * release's AppState call graph without surfacing an internal-only notice.
 */
export function useSkillTruncationNotification(): void {
  const { addNotification, removeNotification } = useNotifications()
  const skillTruncationStats = useAppState(state => state.skillTruncationStats)

  useEffect(() => {}, [skillTruncationStats, addNotification, removeNotification])
}
