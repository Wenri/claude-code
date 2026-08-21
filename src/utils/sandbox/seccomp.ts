import { openSync } from 'fs'
import { isInBundledMode } from '../bundledMode.js'
import { logError } from '../log.js'

/** File descriptor inherited by sandboxed children for the embedded filter. */
export const SECCOMP_CHILD_FD = 3

function canUseEmbeddedSeccomp(): boolean {
  return process.platform === 'linux' && isInBundledMode()
}

export async function getEmbeddedSeccompFileDescriptor(): Promise<
  number | undefined
> {
  if (!canUseEmbeddedSeccomp()) return undefined
  try {
    return openSync('/proc/self/exe', 'r')
  } catch (error) {
    logError(new Error(`seccomp: failed to open /proc/self/exe: ${error}`))
    return undefined
  }
}

export function getEmbeddedSeccompConfig():
  | { applyPath: string; argv0: string }
  | undefined {
  if (!canUseEmbeddedSeccomp()) return undefined
  return {
    applyPath: `/proc/self/fd/${SECCOMP_CHILD_FD}`,
    argv0: 'apply-seccomp',
  }
}
