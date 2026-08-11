import { createHash, randomBytes } from 'crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { chmod, lstat, mkdir, readdir, rm, utimes } from 'fs/promises'
import { connect } from 'net'
import { basename, dirname, join } from 'path'
import memoize from 'lodash-es/memoize.js'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import { getErrnoCode, isENOENT } from '../utils/errors.js'

export function getDaemonDir(): string {
  return join(getClaudeConfigHomeDir(), 'daemon')
}

export const getConfigDirHash = memoize(
  () =>
    createHash('sha256')
      .update(getClaudeConfigHomeDir())
      .digest('hex')
      .slice(0, 8),
  () => getClaudeConfigHomeDir(),
)

export const getDaemonRuntimeDir = memoize(
  () => {
    const uid = process.getuid?.() ?? 0
    const tmpDir =
      process.env.TERMUX_VERSION && process.env.PREFIX
        ? join(process.env.PREFIX, 'tmp')
        : '/tmp'
    return join(tmpDir, `cc-daemon-${uid}`, getConfigDirHash())
  },
  () => getClaudeConfigHomeDir(),
)

export const getPipeKey = memoize(
  () => {
    const path = join(getDaemonDir(), 'pipe.key')
    try {
      return readFileSync(path, 'utf8').trim()
    } catch (error) {
      if (!isENOENT(error)) throw error
    }

    const key = randomBytes(8).toString('hex')
    mkdirSync(getDaemonDir(), { recursive: true })
    try {
      writeFileSync(path, key, { flag: 'wx' })
      return key
    } catch (error) {
      if (getErrnoCode(error) !== 'EEXIST') throw error
      return readFileSync(path, 'utf8').trim()
    }
  },
  () => getClaudeConfigHomeDir(),
)

function getNamedPipe(suffix: string): string {
  return `\\\\.\\pipe\\cc-daemon-${getPipeKey()}-${suffix}`
}

export async function ensureDaemonRuntimeDir(): Promise<void> {
  if (process.platform === 'win32') return
  const runtimeDir = getDaemonRuntimeDir()
  await mkdir(runtimeDir, { recursive: true, mode: 0o700 })
  const now = new Date()
  await utimes(runtimeDir, now, now).catch(() => {})
  const uid = process.getuid?.()
  for (const path of [dirname(runtimeDir), runtimeDir]) {
    const stat = await lstat(path)
    if (uid !== undefined && stat.uid !== uid) {
      throw new Error(`refusing to bind: ${path} is owned by uid ${stat.uid}`)
    }
    if ((stat.mode & 0o777) !== 0o700) await chmod(path, 0o700)
  }
}

async function isStaleSocket(path: string): Promise<boolean> {
  let resolve!: (stale: boolean) => void
  const result = new Promise<boolean>((done) => {
    resolve = done
  })
  const socket = connect(path)
  socket.setTimeout(1_000, () => {
    socket.destroy()
    resolve(false)
  })
  socket.on('error', (error) => {
    const code = getErrnoCode(error)
    resolve(code === 'ENOENT' || code === 'ECONNREFUSED' || code === 'ENOTSOCK')
  })
  socket.once('connect', () => {
    socket.destroy()
    resolve(false)
  })
  return result
}

/** Best-effort cleanup of abandoned per-config runtime directories. */
export function cleanupStaleRuntimeDirs(): void {
  if (process.platform === 'win32') return
  const current = getDaemonRuntimeDir()
  const parent = dirname(current)
  const currentName = basename(current)
  void readdir(parent, { withFileTypes: true })
    .then(async (entries) => {
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === currentName) continue
        const candidate = join(parent, entry.name)
        if (!(await isStaleSocket(join(candidate, 'control.sock')))) continue
        const stat = await lstat(candidate).catch(() => null)
        if (!stat || Date.now() - stat.mtimeMs < 10_000) continue
        const rendezvous = await readdir(join(candidate, 'rv')).catch(() => [])
        const ptys = await readdir(join(candidate, 'pty')).catch(() => [])
        if (rendezvous.length || ptys.length) continue
        await rm(candidate, { recursive: true, force: true }).catch(() => {})
      }
    })
    .catch(() => {})
}

export function getDispatchDir(): string {
  return join(getDaemonDir(), 'dispatch')
}

export function getRejectedDispatchDir(): string {
  return join(getDispatchDir(), 'rejected')
}

export function getRosterPath(): string {
  return join(getDaemonDir(), 'roster.json')
}

export function getRendezvousDir(): string {
  return join(getDaemonRuntimeDir(), 'rv')
}

export function getRendezvousSocketPath(short: string): string {
  if (process.platform === 'win32') return getNamedPipe(`rv-${short}`)
  return join(getRendezvousDir(), `${short}.sock`)
}

export function getPtyDir(): string {
  return join(getDaemonRuntimeDir(), 'pty')
}

export function getPtySocketPath(short: string): string {
  if (process.platform === 'win32') return getNamedPipe(`pty-${short}`)
  return join(getPtyDir(), `${short}.sock`)
}

export function getPtyErrorPath(socketPath: string): string {
  return `${socketPath}.err`
}

export function getControlSocketPath(): string {
  if (process.platform === 'win32') return getNamedPipe('control')
  return join(getDaemonRuntimeDir(), 'control.sock')
}

export function getSettledDir(): string {
  return join(getClaudeConfigHomeDir(), 'jobs', 'settled')
}

export function getSettledPath(short: string): string {
  return join(getSettledDir(), `${short}.json`)
}

/** Last-known execution state for the daemon's scheduled worker. */
export function getScheduledStatusPath(): string {
  return join(getClaudeConfigHomeDir(), 'daemon.scheduled.status.json')
}

/** Live configured-worker process state written by the daemon supervisor. */
export function getDaemonStatusPath(): string {
  return join(getClaudeConfigHomeDir(), 'daemon.status.json')
}
