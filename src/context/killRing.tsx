import React, { createContext, useContext, useRef } from 'react'

const KILL_RING_MAX_SIZE = 10

type KillRingMode =
  | { type: 'idle' }
  | { type: 'killing' }
  | { type: 'yanked'; start: number; length: number; index: number }

export type KillRingState = {
  ring: string[]
  mode: KillRingMode
}

export type KillRingAction =
  | { type: 'kill'; text: string; direction: 'prepend' | 'append' }
  | { type: 'yank'; start: number; length: number }
  | { type: 'yankPop' }
  | { type: 'updateYankLength'; length: number }
  | { type: 'interrupt' }

export type KillRingStore = {
  readonly state: KillRingState
  dispatch: (action: KillRingAction) => void
}

const INITIAL_KILL_RING_STATE: KillRingState = {
  ring: [],
  mode: { type: 'idle' },
}

export function reduceKillRing(
  state: KillRingState,
  action: KillRingAction,
): KillRingState {
  switch (action.type) {
    case 'kill': {
      if (action.text.length === 0) return state
      const ring =
        state.mode.type === 'killing' && state.ring.length > 0
          ? [
              action.direction === 'prepend'
                ? action.text + state.ring[0]
                : state.ring[0] + action.text,
              ...state.ring.slice(1),
            ]
          : [action.text, ...state.ring].slice(0, KILL_RING_MAX_SIZE)
      return { ring, mode: { type: 'killing' } }
    }
    case 'yank':
      return {
        ...state,
        mode: {
          type: 'yanked',
          start: action.start,
          length: action.length,
          index: 0,
        },
      }
    case 'yankPop': {
      if (state.mode.type !== 'yanked' || state.ring.length <= 1) return state
      return {
        ...state,
        mode: {
          ...state.mode,
          index: (state.mode.index + 1) % state.ring.length,
        },
      }
    }
    case 'updateYankLength':
      if (state.mode.type !== 'yanked') return state
      return {
        ...state,
        mode: { ...state.mode, length: action.length },
      }
    case 'interrupt':
      if (state.mode.type === 'idle') return state
      return { ...state, mode: { type: 'idle' } }
  }
}

export function getLatestKill(state: KillRingState): string {
  return state.ring[0] ?? ''
}

export function getNextYank(
  state: KillRingState,
): { text: string; start: number; length: number } | null {
  if (state.mode.type !== 'yanked' || state.ring.length <= 1) return null
  const index = (state.mode.index + 1) % state.ring.length
  return {
    text: state.ring[index] ?? '',
    start: state.mode.start,
    length: state.mode.length,
  }
}

export function createKillRingStore(): KillRingStore {
  let state = INITIAL_KILL_RING_STATE
  return {
    get state() {
      return state
    },
    dispatch(action) {
      state = reduceKillRing(state, action)
    },
  }
}

const KillRingContext = createContext<KillRingStore>(createKillRingStore())

export function KillRingProvider({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode {
  const storeRef = useRef<KillRingStore | null>(null)
  if (storeRef.current === null) storeRef.current = createKillRingStore()
  return (
    <KillRingContext.Provider value={storeRef.current}>
      {children}
    </KillRingContext.Provider>
  )
}

export function useKillRing(): KillRingStore {
  return useContext(KillRingContext)
}
