import { open, type FileHandle } from 'fs/promises'
import memoize from 'lodash-es/memoize.js'
import { isInBundledMode } from '../bundledMode.js'
import { logForDebugging } from '../debug.js'

/** File descriptor inherited by sandboxed children for the embedded filter. */
export const SECCOMP_CHILD_FD = 3

function canUseEmbeddedSeccomp(): boolean {
  return process.platform === 'linux' && isInBundledMode()
}

const openExecutableForSeccomp = memoize(
  async (): Promise<FileHandle | undefined> => {
    if (!canUseEmbeddedSeccomp()) return undefined
    try {
      return await open('/proc/self/exe', 'r')
    } catch (error) {
      logForDebugging(`seccomp: failed to open /proc/self/exe: ${error}`)
      return undefined
    }
  },
)

export async function getEmbeddedSeccompFileDescriptor(): Promise<
  number | undefined
> {
  return (await openExecutableForSeccomp())?.fd
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
