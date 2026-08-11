/**
 * Tracks commands recently denied by the auto mode classifier.
 * Populated from useCanUseTool.ts, read from RecentDenialsTab.tsx in /permissions.
 */

import { feature } from 'bun:bundle'

export type AutoModeDenial = {
  toolName: string
  /** Human-readable description of the denied command (e.g. bash command string) */
  display: string
  /** Stable input identity used to correlate a later user approval. */
  inputKey: string
  reason: string
  timestamp: number
}

let DENIALS: readonly AutoModeDenial[] = []
const MAX_DENIALS = 20

export function recordAutoModeDenial(denial: AutoModeDenial): void {
  if (!feature('TRANSCRIPT_CLASSIFIER')) return
  DENIALS = [denial, ...DENIALS.slice(0, MAX_DENIALS - 1)]
}

export function getAutoModeDenials(): readonly AutoModeDenial[] {
  return DENIALS
}

export function removeAutoModeDenial(denial: AutoModeDenial): void {
  DENIALS = DENIALS.filter(candidate => candidate !== denial)
}
