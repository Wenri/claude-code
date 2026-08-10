import { useEffect, useRef } from 'react'
import { getIsRemoteMode } from '../../bootstrap/state.js'
import { useNotifications } from '../../context/notifications.js'
import { useAppState } from '../../state/AppState.js'
import {
  isAdvisorEnabled,
  modelSupportsAdvisor,
} from '../../utils/advisor.js'
import { useMainLoopModel } from '../useMainLoopModel.js'

export function useAdvisorNotification(): void {
  const { addNotification } = useNotifications()
  const advisorModel = useAppState(state => state.advisorModel)
  const mainLoopModel = useMainLoopModel()
  const shownRef = useRef(false)

  useEffect(() => {
    if (getIsRemoteMode() || !isAdvisorEnabled()) return
    if (!advisorModel) {
      shownRef.current = false
      return
    }
    if (!modelSupportsAdvisor(mainLoopModel) || shownRef.current) return
    shownRef.current = true
    addNotification({
      key: 'advisor-experimental',
      text: 'Advisor Tool (experimental) is on and may use more tokens · /advisor',
      priority: 'medium',
    })
  }, [advisorModel, mainLoopModel, addNotification])
}
