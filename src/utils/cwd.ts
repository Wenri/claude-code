import { AsyncLocalStorage } from 'async_hooks'
import {
  getCwdState,
  getOriginalCwd,
  setCwdState,
} from '../bootstrap/state.js'

type CwdOverride = { cwd: string }

const cwdOverrideStorage = new AsyncLocalStorage<CwdOverride>()

/**
 * Run a function with an overridden working directory for the current async context.
 * All calls to pwd()/getCwd() within the function (and its async descendants) will
 * return the overridden cwd instead of the global one. This enables concurrent
 * agents to each see their own working directory without affecting each other.
 */
export function runWithCwdOverride<T>(
  cwd: string | undefined,
  fn: () => T,
): T {
  return cwdOverrideStorage.run(
    { cwd: (cwd ?? getCwd()).normalize('NFC') },
    fn,
  )
}

/** Whether the current async context owns an isolated working directory. */
export function hasCwdOverride(): boolean {
  return cwdOverrideStorage.getStore() !== undefined
}

/**
 * Update the current async context's cwd, falling back to the process-wide
 * session cwd when no override is active.
 */
export function setCwdForContext(cwd: string): void {
  const override = cwdOverrideStorage.getStore()
  if (override) {
    override.cwd = cwd.normalize('NFC')
  } else {
    setCwdState(cwd)
  }
}

/**
 * Get the current working directory
 */
export function pwd(): string {
  return cwdOverrideStorage.getStore()?.cwd ?? getCwdState()
}

/**
 * Get the current working directory or the original working directory if the current one is not available
 */
export function getCwd(): string {
  try {
    return pwd()
  } catch {
    return getOriginalCwd()
  }
}
