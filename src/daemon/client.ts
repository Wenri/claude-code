import { spawn } from 'child_process'
import { readFile } from 'fs/promises'
import { connect, type Socket } from 'net'
import { StringDecoder } from 'string_decoder'
import { setTimeout as delay } from 'timers/promises'
import { logEvent } from '../services/analytics/index.js'
import { getPlatform } from '../utils/platform.js'
import { getRelaunchLauncher } from '../utils/relaunch.js'
import { getSecureStorage } from '../utils/secureStorage/index.js'
import { listAllLiveSessions } from '../utils/concurrentSessions.js'
import {
  isProcessRunning,
  processStartTokenMatches,
} from '../utils/genericProcessUtils.js'
import { getControlSocketPath, getRosterPath } from './paths.js'
import { PROTOCOL_VERSION, type ControlMessage } from './protocol.js'
import { getRunningDaemon } from './lock.js'

export type ControlResponse =
  | ({ ok: true; op?: string } & Record<string, unknown>)
  | { ok: false; code: string; error: string }

export function consumeLines(
  stream: NodeJS.EventEmitter,
  onLine: (line: string) => void,
): () => void {
  const decoder = new StringDecoder('utf8')
  let buffered = ''
  let failed = false
  const onData = (chunk: Buffer | string) => {
    if (failed) return
    buffered += typeof chunk === 'string' ? chunk : decoder.write(chunk)
    let newline
    while ((newline = buffered.indexOf('\n')) >= 0) {
      const line = buffered.slice(0, newline)
      buffered = buffered.slice(newline + 1)
      if (line) onLine(line)
    }
    if (buffered.length > 1_048_576) {
      failed = true
      buffered = ''
      if ('destroy' in stream && typeof stream.destroy === 'function') {
        stream.destroy()
      }
    }
  }
  const onEnd = () => {
    if (failed) return
    buffered += decoder.end()
    if (buffered) onLine(buffered)
    buffered = ''
  }
  stream.on('data', onData)
  stream.on('end', onEnd)
  stream.on('close', onEnd)
  return () => {
    stream.off('data', onData)
    stream.off('end', onEnd)
    stream.off('close', onEnd)
  }
}

export async function requestControl(
  message: ControlMessage | Record<string, unknown>,
  options?: { timeoutMs?: number },
): Promise<ControlResponse> {
  const timeoutMs = options?.timeoutMs ?? 5_000
  return new Promise((resolve) => {
    let settled = false
    const socket = connect(getControlSocketPath())
    const finish = (value: ControlResponse) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(timeoutMs, () =>
      finish({ ok: false, code: 'ENOCONN', error: 'control socket timeout' }),
    )
    socket.on('error', (error) =>
      finish({ ok: false, code: 'ENOCONN', error: String(error) }),
    )
    socket.once('connect', () => {
      socket.write(`${JSON.stringify(message)}\n`)
    })
    const decoder = new StringDecoder('utf8')
    let buffered = ''
    socket.on('data', (chunk) => {
      buffered += decoder.write(chunk)
      const newline = buffered.indexOf('\n')
      if (newline < 0) return
      try {
        finish(JSON.parse(buffered.slice(0, newline)) as ControlResponse)
      } catch (error) {
        finish({ ok: false, code: 'ENOCONN', error: String(error) })
      }
    })
    socket.once('close', () => {
      if (!settled) {
        finish({
          ok: false,
          code: 'ENOCONN',
          error:
            'daemon connection dropped mid-request — it may have restarted; retry',
        })
      }
    })
  })
}

export function maintainDaemonLease(): () => void {
  let stopped = false
  let socket: Socket | null = null
  let reconnect: NodeJS.Timeout | null = null
  const open = () => {
    if (stopped) return
    socket = connect(getControlSocketPath())
    socket.on('error', () => socket?.destroy())
    socket.once('connect', () =>
      socket?.write(
        `${JSON.stringify({ proto: PROTOCOL_VERSION, op: 'lease' })}\n`,
      ),
    )
    socket.on('data', () => {})
    socket.once('close', () => {
      socket = null
      if (stopped) return
      reconnect = setTimeout(open, 1_000)
      reconnect.unref()
    })
    socket.unref()
  }
  open()
  return () => {
    stopped = true
    if (reconnect) clearTimeout(reconnect)
    socket?.destroy()
  }
}

export function subscribeToJob(
  short: string,
  tail: number | undefined,
  onMessage: (message: Record<string, unknown>) => void,
  onError: (message: string) => void,
): () => void {
  const socket = connect(getControlSocketPath())
  let done = false
  const fail = (message: string) => {
    if (done) return
    done = true
    onError(message)
  }
  socket.on('error', (error) => fail(String(error)))
  socket.on('close', () => fail('control socket closed'))
  socket.on('connect', () =>
    socket.write(
      `${JSON.stringify({ proto: PROTOCOL_VERSION, op: 'subscribe', short, tail })}\n`,
    ),
  )
  const stopLines = consumeLines(socket, (line) => {
    try {
      const message = JSON.parse(line) as Record<string, unknown>
      if (message.ok === false) fail(String(message.error))
      else onMessage(message)
    } catch {}
  })
  return () => {
    done = true
    stopLines()
    socket.destroy()
  }
}

export function daemonSpawnEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env, INVOCATION_ID: '' }
  if (
    getPlatform() !== 'macos' &&
    process.env.CLAUDE_CODE_OAUTH_TOKEN &&
    getSecureStorage().read()?.claudeAiOauth?.refreshToken
  ) {
    delete env.CLAUDE_CODE_OAUTH_TOKEN
    delete env.CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR
  }
  return env
}

async function waitUntilReachable(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (
      (
        await requestControl({ proto: PROTOCOL_VERSION, op: 'ping' })
      ).ok
    ) {
      return true
    }
    await delay(100)
  }
  return false
}

export async function ensureDaemon(
  beforeSpawn?: () => void,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const startedAt = Date.now()
  const nudgeDeadline = Date.now() + 10_000
  let sawNudge = false
  while (Date.now() < nudgeDeadline) {
    const response = await requestControl({ proto: PROTOCOL_VERSION, op: 'nudge' })
    if (response.ok && response.op === 'nudge') {
      sawNudge = true
      if (!response.restarting) {
        if (Date.now() - startedAt > 200) {
          logEvent('tengu_bg_skew_nudge', {
            converged: true,
            duration_ms: Date.now() - startedAt,
          })
        }
        return { ok: true }
      }
      await delay(100)
      continue
    }
    if (!response.ok && response.code === 'ENOCONN' && !sawNudge) break
    if (!response.ok && response.code === 'ENOCONN') {
      await delay(100)
      continue
    }
    return { ok: true }
  }
  if (sawNudge) {
    logEvent('tengu_bg_skew_nudge', { converged: false, restarting: true })
  }

  beforeSpawn?.()
  const running = await getRunningDaemon().catch(() => null)
  if (running && Date.now() - running.startedAt > 5_000) {
    try {
      process.kill(running.pid, 'SIGTERM')
    } catch (error) {
      return {
        ok: false,
        reason: `daemon socket missing; could not restart supervisor (${String(error)})`,
      }
    }
    logEvent('tengu_bg_daemon_zombie_restart', { pid: running.pid })
    const deadline = Date.now() + 2_000
    while (Date.now() < deadline) {
      try {
        process.kill(running.pid, 0)
      } catch {
        break
      }
      await delay(50)
    }
  }
  const { cmd, prefixArgs } = getRelaunchLauncher()
  try {
    spawn(cmd, [...prefixArgs, 'daemon', 'run', '--origin', 'auto'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: daemonSpawnEnv(),
    }).unref()
  } catch (error) {
    return { ok: false, reason: `spawn daemon: ${String(error)}` }
  }
  const reachable = await waitUntilReachable(5_000)
  const platform = getPlatform()
  logEvent('tengu_bg_daemon_install', {
    outcome_ok: reachable,
    via_service: false,
    fresh_install: false,
    duration_ms: Date.now() - startedAt,
    platform_darwin: platform === 'macos',
    platform_linux: platform === 'linux',
    platform_windows: platform === 'windows',
  })
  return reachable
    ? { ok: true }
    : { ok: false, reason: 'daemon did not become reachable within 5s' }
}

export async function listLiveJobs(): Promise<Set<string>> {
  const response = await requestControl({ proto: PROTOCOL_VERSION, op: 'list' })
  if (response.ok && response.op === 'list' && Array.isArray(response.jobs)) {
    return new Set(
      response.jobs
        .filter(
          (job): job is { short: string; outcome?: unknown } =>
            typeof job === 'object' &&
            job !== null &&
            typeof (job as { short?: unknown }).short === 'string' &&
            !(job as { outcome?: unknown }).outcome,
        )
        .map((job) => job.short),
    )
  }

  let decoded: unknown
  try {
    decoded = JSON.parse(await readFile(getRosterPath(), 'utf8'))
  } catch {
    return new Set()
  }
  const workers =
    decoded && typeof decoded === 'object' && !Array.isArray(decoded)
      ? (decoded as { workers?: unknown }).workers
      : undefined
  if (!workers || typeof workers !== 'object' || Array.isArray(workers)) {
    return new Set()
  }
  const entries = Object.entries(workers as Record<string, unknown>)
  const live = await Promise.all(
    entries.map(async ([, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false
      const record = value as { pid?: unknown; procStart?: unknown }
      if (typeof record.pid !== 'number' || !isProcessRunning(record.pid)) {
        return false
      }
      return processStartTokenMatches(
        record.pid,
        typeof record.procStart === 'string' ? record.procStart : undefined,
      )
    }),
  )
  return new Set(entries.filter((_, index) => live[index]).map(([short]) => short))
}

/** Exact common background kill path, including orphan-process fallback. */
export async function killJob(
  short: string,
  state?: { backend?: string },
): Promise<ControlResponse> {
  if (state?.backend === 'peer') {
    return { ok: true, op: 'kill' }
  }
  let response = await requestControl({
    proto: PROTOCOL_VERSION,
    op: 'kill',
    short,
  })
  for (
    let attempt = 0;
    !response.ok && response.code === 'ESTARTING' && attempt < 10;
    attempt++
  ) {
    await delay(200)
    response = await requestControl({
      proto: PROTOCOL_VERSION,
      op: 'kill',
      short,
    })
  }
  if (!response.ok && response.code === 'ENOJOB') {
    const sessions = await listAllLiveSessions().catch(() => [])
    for (const session of sessions) {
      if (session.kind !== 'bg' || !session.sessionId?.startsWith(short)) continue
      try {
        process.kill(session.pid, 'SIGTERM')
      } catch {}
      const deadline = Date.now() + 3_000
      while (isProcessRunning(session.pid) && Date.now() < deadline) {
        await delay(100)
      }
    }
  }
  return response
}
