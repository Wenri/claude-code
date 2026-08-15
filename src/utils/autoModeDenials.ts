/**
 * Tracks commands recently denied by the auto mode classifier.
 * Populated from useCanUseTool.ts, read from RecentDenialsTab.tsx in /permissions.
 */

import { feature } from 'bun:bundle'
import type * as React from 'react'
import { createContext, createElement, useContext, useRef } from 'react'

export type AutoModeDenial = {
  toolName: string
  /** Human-readable description of the denied command (e.g. bash command string) */
  display: string
  /** Stable input identity used to correlate a later user approval. */
  inputKey: string
  reason: string
  timestamp: number
}

const MAX_DENIALS = 20

type AutoModeDenialsApi = {
  getDenials: () => readonly AutoModeDenial[]
  recordDenial: (denial: AutoModeDenial) => void
}

const AutoModeDenialsContext = createContext<AutoModeDenialsApi>({
  getDenials: () => [],
  recordDenial: () => {},
})

export function AutoModeDenialsProvider({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode {
  const denials = useRef<readonly AutoModeDenial[]>([])
  const api = useRef<AutoModeDenialsApi>({
    getDenials: () => denials.current,
    recordDenial: denial => {
      if (!feature('TRANSCRIPT_CLASSIFIER')) return
      denials.current = [denial, ...denials.current.slice(0, MAX_DENIALS - 1)]
    },
  }).current

  return createElement(AutoModeDenialsContext.Provider, { value: api }, children)
}

export function useAutoModeDenials(): AutoModeDenialsApi {
  return useContext(AutoModeDenialsContext)
}

export function removeAutoModeDenial(denial: AutoModeDenial): void {
  DENIALS = DENIALS.filter(candidate => candidate !== denial)
}
