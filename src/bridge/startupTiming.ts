import { isEnvTruthy } from '../utils/envUtils.js'

const startupPhases: Record<string, number> = {}
let consumed = false

export function recordRemoteStartupPhase(name: string, durationMs: number): void {
  if (consumed) return
  startupPhases[name] = Math.round(durationMs)
}

export function consumeRemoteStartupTiming():
  | { entrypoint: string; phases: Record<string, number> }
  | undefined {
  if (!isEnvTruthy(process.env.CLAUDE_CODE_REMOTE)) return undefined
  if (consumed || Object.keys(startupPhases).length === 0) return undefined
  consumed = true
  return {
    entrypoint: process.env.CLAUDE_CODE_ENTRYPOINT ?? 'unknown',
    phases: { ...startupPhases },
  }
}
