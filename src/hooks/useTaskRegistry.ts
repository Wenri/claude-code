import { useMemo } from 'react'
import { useAppStateStore, useSetAppState } from '../state/AppState.js'
import {
  createTaskRegistry,
  type TaskRegistry,
} from '../utils/task/framework.js'

export function useTaskRegistry(): TaskRegistry {
  const store = useAppStateStore()
  const setAppState = useSetAppState()
  return useMemo(
    () => createTaskRegistry(store.getState, setAppState),
    [store, setAppState],
  )
}
