import { randomBytes } from 'crypto'
import {
  copyFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import {
  copyFile,
  rename,
  unlink,
  writeFile,
} from 'fs/promises'
import { getErrnoCode } from './errors.js'

const RENAME_FALLBACK_CODES = new Set([
  'EXDEV',
  'EPERM',
  'EEXIST',
  'EBUSY',
])

const DESTINATION_CLEANUP_CODES = new Set([
  'ENOSPC',
  'EIO',
  'EDQUOT',
  'EFBIG',
])

export async function atomicWriteFile(
  target: string,
  content: string,
  mode?: number,
): Promise<void> {
  const temporary = `${target}.tmp.${randomBytes(4).toString('hex')}`
  try {
    await writeFile(temporary, content, { encoding: 'utf8', mode })
    try {
      await rename(temporary, target)
    } catch (error) {
      if (!RENAME_FALLBACK_CODES.has(getErrnoCode(error) ?? '')) throw error
      try {
        await copyFile(temporary, target)
      } catch (copyError) {
        if (DESTINATION_CLEANUP_CODES.has(getErrnoCode(copyError) ?? '')) {
          await unlink(target).catch(() => {})
        }
        throw copyError
      }
      await unlink(temporary).catch(() => {})
    }
  } catch (error) {
    await unlink(temporary).catch(() => {})
    throw error
  }
}

export function atomicWriteFileSync(
  target: string,
  content: string,
  mode?: number,
): void {
  const temporary = `${target}.tmp.${randomBytes(4).toString('hex')}`
  try {
    writeFileSync(temporary, content, { encoding: 'utf8', mode })
    try {
      renameSync(temporary, target)
    } catch (error) {
      if (!RENAME_FALLBACK_CODES.has(getErrnoCode(error) ?? '')) throw error
      try {
        copyFileSync(temporary, target)
      } catch (copyError) {
        if (DESTINATION_CLEANUP_CODES.has(getErrnoCode(copyError) ?? '')) {
          try {
            unlinkSync(target)
          } catch {}
        }
        throw copyError
      }
      try {
        unlinkSync(temporary)
      } catch {}
    }
  } catch (error) {
    try {
      unlinkSync(temporary)
    } catch {}
    throw error
  }
}
