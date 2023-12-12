import { readFile, rename, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import { isENOENT } from '../utils/errors.js'

export interface DaemonLock {
  pid: number
  version: string
  startedAt: number
  jsonPath: string
  logPath: string
  origin?: string
}

export function getDaemonLockPath(): string {
  return join(getClaudeConfigHomeDir(), 'daemon.lock')
}

function temporaryLockPath(lock: DaemonLock): string {
  return join(
    getClaudeConfigHomeDir(),
    `daemon.lock.tmp.${lock.pid}.${lock.startedAt}`,
  )
}

export async function createDaemonLock(lock: DaemonLock): Promise<boolean> {
  try {
    await writeFile(getDaemonLockPath(), JSON.stringify(lock, null, 2), {
      flag: 'wx',
    })
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
    throw error
  }
}

export async function readDaemonLock(): Promise<DaemonLock | null> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(getDaemonLockPath(), 'utf8'))
  } catch (error) {
    if (isENOENT(error)) return null
    throw error
  }
  if (
    parsed &&
    typeof parsed === 'object' &&
    typeof (parsed as Partial<DaemonLock>).pid === 'number' &&
    typeof (parsed as Partial<DaemonLock>).version === 'string'
  ) {
    return parsed as DaemonLock
  }
  return null
}

export async function replaceDaemonLock(lock: DaemonLock): Promise<boolean> {
  const temporary = temporaryLockPath(lock)
  await writeFile(temporary, JSON.stringify(lock, null, 2), { flag: 'wx' })
  try {
    await rename(temporary, getDaemonLockPath())
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EEXIST' || code === 'EPERM') {
      await unlink(getDaemonLockPath()).catch(() => {})
      try {
        await rename(temporary, getDaemonLockPath())
      } catch (nextError) {
        await unlink(temporary).catch(() => {})
        throw nextError
      }
    } else {
      await unlink(temporary).catch(() => {})
      throw error
    }
  }
  const persisted = await readDaemonLock()
  return persisted?.pid === lock.pid && persisted.startedAt === lock.startedAt
}

export async function removeDaemonLock(): Promise<void> {
  try {
    await unlink(getDaemonLockPath())
  } catch (error) {
    if (!isENOENT(error)) throw error
  }
}

export async function processLooksLikeDaemon(pid: number): Promise<boolean> {
  try {
    const cmdline = await readFile(`/proc/${pid}/cmdline`, 'utf8')
    const args = cmdline.split('\0')
    return Boolean(
      args[0]?.includes('claude') &&
        (args[0] === 'claude daemon' || args[1] === 'daemon'),
    )
  } catch {
    return true
  }
}

export async function getRunningDaemon(): Promise<DaemonLock | null> {
  const lock = await readDaemonLock()
  if (!lock) return null
  try {
    process.kill(lock.pid, 0)
  } catch {
    return null
  }
  return (await processLooksLikeDaemon(lock.pid)) ? lock : null
}

export async function daemonVersionDiffers(version: string): Promise<boolean> {
  const lock = await getRunningDaemon().catch(() => null)
  return Boolean(lock && lock.version !== version)
}
