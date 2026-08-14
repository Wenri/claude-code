import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'fs/promises'
import { connect } from 'net'
import { dirname } from 'path'
import { logError } from '../utils/log.js'
import { processStartTokenMatches } from '../utils/genericProcessUtils.js'
import { encodeControlFrame } from './framing.js'
import {
  getPtyDir,
  getPtyErrorPath,
  getPtyPidDir,
  getPtyPidPath,
  getPtySocketPath,
  getRosterPath,
} from './paths.js'
import {
  ManifestSchema,
  PROTOCOL_VERSION,
  type Manifest,
} from './protocol.js'

type OrphanCandidate = {
  pid: number
  procStart?: string
  ptySock?: string
}

function emptyRoster(): Manifest {
  return {
    proto: PROTOCOL_VERSION,
    supervisorPid: process.pid,
    updatedAt: Date.now(),
    workers: {},
  }
}

export async function readRosterSilently(): Promise<Manifest> {
  try {
    const parsed = ManifestSchema().safeParse(
      JSON.parse(await readFile(getRosterPath(), 'utf8')),
    )
    return parsed.success ? parsed.data : emptyRoster()
  } catch {
    return emptyRoster()
  }
}

let rosterUpdate = Promise.resolve()

function removeRosterWorkers(shorts: Iterable<string>): Promise<void> {
  const remove = new Set(shorts)
  const next = rosterUpdate.then(async () => {
    const manifest = await readRosterSilently()
    for (const short of remove) delete manifest.workers[short]
    manifest.supervisorPid = process.pid
    manifest.updatedAt = Date.now()
    const path = getRosterPath()
    const temporary = `${path}.tmp.${process.pid}.${Date.now()}`
    await mkdir(dirname(path), { recursive: true, mode: 0o700 })
    await writeFile(temporary, JSON.stringify(manifest, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    })
    await rename(temporary, path)
  })
  rosterUpdate = next.catch(() => {})
  return next
}

async function killByPid(
  pid: number,
  procStart: string | undefined,
): Promise<boolean> {
  if (procStart !== undefined) {
    if (!(await processStartTokenMatches(pid, procStart))) return false
  } else {
    try {
      process.kill(pid, 0)
      return false
    } catch {}
  }
  try {
    process.kill(-pid, 'SIGTERM')
    return true
  } catch {
    try {
      process.kill(pid, 'SIGTERM')
      return true
    } catch {
      return false
    }
  }
}

export function killWorkerThroughPty(socketPath: string): Promise<boolean> {
  return new Promise(resolve => {
    let settled = false
    const finish = (killed: boolean) => {
      if (settled) return
      settled = true
      resolve(killed)
    }
    const socket = connect(socketPath)
    socket.unref()
    socket.setTimeout(2_000, () => {
      socket.destroy()
      finish(false)
    })
    socket.on('error', () => {
      void unlink(socketPath).catch(() => {})
      void unlink(getPtyErrorPath(socketPath)).catch(() => {})
      finish(false)
    })
    socket.once('connect', () => {
      socket.resume()
      socket.write(encodeControlFrame({ t: 'kill', sig: 'SIGTERM' }))
      socket.end()
      finish(true)
    })
  })
}

export async function reapOrphanWorkers(): Promise<{ reaped: number }> {
  const roster = await readRosterSilently()
  const candidates = new Map<string, OrphanCandidate>()
  for (const [short, worker] of Object.entries(roster.workers)) {
    candidates.set(short, {
      pid: worker.pid,
      procStart: worker.procStart,
      ptySock: worker.ptySock,
    })
  }

  const windows = process.platform === 'win32'
  const directory = windows ? getPtyPidDir() : getPtyDir()
  const suffix = windows ? '.pid' : '.sock'
  const entries = await readdir(directory).catch(() => [])
  for (const entry of entries) {
    if (!entry.endsWith(suffix)) continue
    const short = entry.slice(0, -suffix.length)
    if (candidates.has(short)) continue
    const pid = windows
      ? Number(await readFile(getPtyPidPath(short), 'utf8').catch(() => '0'))
      : 0
    candidates.set(short, { pid, ptySock: getPtySocketPath(short) })
  }

  let reaped = 0
  await Promise.all(
    [...candidates.entries()].map(async ([short, candidate]) => {
      if (
        (candidate.ptySock && (await killWorkerThroughPty(candidate.ptySock))) ||
        (candidate.pid &&
          (await killByPid(candidate.pid, candidate.procStart)))
      ) {
        reaped++
      }
      if (windows) await unlink(getPtyPidPath(short)).catch(() => {})
    }),
  )
  if (candidates.size > 0) {
    await removeRosterWorkers(candidates.keys()).catch(error => logError(error))
  }
  return { reaped }
}
