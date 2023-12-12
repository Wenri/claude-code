import { readFile, stat } from 'fs/promises'
import { getRunningDaemon } from './lock.js'
import {
  getControlSocketPath,
  getDaemonRuntimeDir,
  getRosterPath,
} from './paths.js'
import { ManifestSchema, PROTOCOL_VERSION } from './protocol.js'
import { requestControl } from './client.js'
import {
  getDefaultDaemonConfigPath,
  getDefaultDaemonLogPath,
  isDaemonServiceInstalled,
} from './service.js'

export type BgDaemonStatus = {
  supervisor: { pid: number; version: string; uptimeSec: number } | null
  sockDir: string
  controlSock: string
  controlReachable: boolean
  controlError?: string
  workersLive: number | null
  workersSkewed: number | null
  workersRoster: number
  rosterAgeSec: number | null
  logPath: string
  logSizeBytes: number | null
  serviceInstalled: boolean
  configuredWorkers: number
}

async function rosterWorkerCount(): Promise<number> {
  try {
    const parsed = ManifestSchema().safeParse(
      JSON.parse(await readFile(getRosterPath(), 'utf8')),
    )
    return parsed.success ? Object.keys(parsed.data.workers).length : 0
  } catch {
    return 0
  }
}

async function configuredWorkerCount(path: string): Promise<number> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 0
    let count = 0
    for (const [key, value] of Object.entries(parsed)) {
      if (key === '$schema') continue
      count += Array.isArray(value) ? value.length : 1
    }
    return count
  } catch {
    return 0
  }
}

export async function getBgDaemonStatus(): Promise<BgDaemonStatus> {
  const supervisor = await getRunningDaemon().catch(() => null)
  const logPath = supervisor?.logPath ?? getDefaultDaemonLogPath()
  const [ping, rosterCount, rosterStat, logStat, serviceInstalled, configuredWorkers] =
    await Promise.all([
      requestControl(
        { op: 'ping', proto: PROTOCOL_VERSION },
        { timeoutMs: 1_000 },
      ).catch(error => ({
        ok: false as const,
        code: 'ENOCONN',
        error: String(error),
      })),
      rosterWorkerCount(),
      stat(getRosterPath()).catch(() => null),
      stat(logPath).catch(() => null),
      isDaemonServiceInstalled().catch(() => false),
      configuredWorkerCount(getDefaultDaemonConfigPath()),
    ])
  let workersLive: number | null = null
  let workersSkewed: number | null = null
  if (ping.ok) {
    const listed = await requestControl(
      { op: 'list', proto: PROTOCOL_VERSION },
      { timeoutMs: 1_000 },
    ).catch(() => null)
    if (listed?.ok && Array.isArray(listed.jobs)) {
      const jobs = listed.jobs.filter(
        job => job && typeof job === 'object' && !('outcome' in job && job.outcome),
      ) as Array<{ cliVersion?: string }>
      workersLive = jobs.length
      workersSkewed = jobs.filter(
        job => job.cliVersion !== undefined && job.cliVersion !== MACRO.VERSION,
      ).length
    }
  }
  return {
    supervisor: supervisor
      ? {
          pid: supervisor.pid,
          version: supervisor.version,
          uptimeSec: Math.floor((Date.now() - supervisor.startedAt) / 1_000),
        }
      : null,
    sockDir:
      process.platform === 'win32'
        ? '\\\\.\\pipe\\cc-daemon-*'
        : getDaemonRuntimeDir(),
    controlSock: getControlSocketPath(),
    controlReachable: ping.ok,
    controlError: ping.ok ? undefined : ping.error,
    workersLive,
    workersSkewed,
    workersRoster: rosterCount,
    rosterAgeSec: rosterStat
      ? Math.floor((Date.now() - rosterStat.mtimeMs) / 1_000)
      : null,
    logPath,
    logSizeBytes: logStat?.size ?? null,
    serviceInstalled,
    configuredWorkers,
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes}B`
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)}KB`
  return `${(bytes / 1_024 / 1_024).toFixed(1)}MB`
}

export function formatBgDaemonStatus(status: BgDaemonStatus): string {
  const lines = ['', 'bg daemon:']
  lines.push(`  sock dir:     ${status.sockDir}`)
  lines.push(
    `  control.sock: ${status.controlReachable ? 'reachable' : `unreachable (${status.controlError ?? 'unknown'})`}`,
  )
  if (status.workersLive !== null) {
    const skew =
      status.workersSkewed && status.workersSkewed > 0
        ? ` — ${status.workersSkewed} on different binary`
        : ''
    lines.push(
      `  bg workers:   ${status.workersLive} live (control), ${status.workersRoster} in roster${skew}`,
    )
  } else {
    lines.push(
      `  bg workers:   ${status.workersRoster} in roster (${status.controlReachable ? 'live count unavailable' : 'control unreachable'})`,
    )
  }
  lines.push(
    `  roster.json:  ${status.rosterAgeSec === null ? 'absent' : `updated ${status.rosterAgeSec}s ago`}`,
  )
  lines.push(
    `  daemon.log:   ${status.logSizeBytes === null ? 'absent' : `${formatBytes(status.logSizeBytes)} at ${status.logPath}`}`,
  )
  return lines.join('\n')
}
