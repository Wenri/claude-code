import { readdir, readFile, unlink } from 'fs/promises'
import { connect } from 'net'
import { join } from 'path'
import { getClaudeConfigHomeDir } from './envUtils.js'
import {
  isProcessRunning,
  processStartTokenMatches,
} from './genericProcessUtils.js'
import { logForDebugging } from './debug.js'
import { getPlatform } from './platform.js'
import { jsonParse, jsonStringify } from './slowOperations.js'

export type LiveSessionKind =
  | 'interactive'
  | 'bg'
  | 'daemon'
  | 'daemon-worker'
export type LiveSessionStatus = 'busy' | 'idle' | 'waiting'

export interface LivePeerSession {
  sock: string
  cwd: string
  startedAt: number
  name?: string
  kind?: LiveSessionKind
  sessionId?: string
  bridgeSessionId?: string
  logPath?: string
  status?: LiveSessionStatus
  waitingFor?: string
  updatedAt?: number
  entrypoint?: string
  agent?: string
  state?: string
  detail?: string
  tempo?: 'active' | 'idle' | 'blocked'
  needs?: string
  peerProtocol?: number
  tmux?: string
  pid: number
}

export interface UdsControlMessage {
  action: string
  [key: string]: unknown
}

export function sendToUdsSocket(socketPath: string, message: string): Promise<void> {
  const content = `<cross-session-message>\n${message}\n</cross-session-message>`
  logForDebugging(
    `[uds-client] Sending ${message.length} chars to ${socketPath}`,
  )
  return sendPayload(socketPath, {
    type: 'user',
    message: { role: 'user', content },
    priority: 'next',
    from: undefined,
  })
}

export function sendControlToUdsSocket(
  socketPath: string,
  message: UdsControlMessage,
): Promise<void> {
  logForDebugging(
    `[uds-client] Sending control:${message.action} to ${socketPath}`,
  )
  return sendPayload(socketPath, { type: 'control', ...message })
}

function sendPayload(socketPath: string, payload: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = connect({ path: socketPath })
    let failed = false
    socket.setTimeout(5_000, () => {
      failed = true
      socket.destroy()
      reject(new Error(`Timed out sending to ${socketPath}`))
    })
    socket.on('error', error => {
      failed = true
      reject(error)
    })
    socket.on('connect', () => {
      socket.end(`${jsonStringify(payload)}\n`)
    })
    socket.on('close', () => {
      if (!failed) logForDebugging(`[uds-client] Sent to ${socketPath}`)
      resolve()
    })
  })
}

function probeSocket(socketPath: string): Promise<boolean> {
  return new Promise(resolve => {
    const socket = connect({ path: socketPath })
    const settle = (value: boolean) => {
      socket.destroy()
      resolve(value)
    }
    socket.on('connect', () => settle(true))
    socket.on('error', () => settle(false))
    socket.setTimeout(250, () => settle(false))
  })
}

interface RegistryCandidate extends LivePeerSession {
  procStart?: string
  file: string
}

function sessionKind(value: unknown): LiveSessionKind | undefined {
  return value === 'interactive' ||
    value === 'bg' ||
    value === 'daemon' ||
    value === 'daemon-worker'
    ? value
    : undefined
}

function sessionStatus(value: unknown): LiveSessionStatus | undefined {
  return value === 'busy' || value === 'idle' || value === 'waiting'
    ? value
    : undefined
}

async function readRegistry(): Promise<RegistryCandidate[]> {
  const directory = join(getClaudeConfigHomeDir(), 'sessions')
  let files: string[]
  try {
    files = await readdir(directory)
  } catch {
    return []
  }
  const values = await Promise.all(
    files
      .filter(file => /^\d+\.json$/.test(file))
      .map(async file => {
        try {
          const pid = Number(file.slice(0, -5))
          if (Number.isNaN(pid)) return null
          const path = join(directory, file)
          const raw = jsonParse(await readFile(path, 'utf8')) as Record<
            string,
            unknown
          >
          return {
            sock:
              typeof raw.messagingSocketPath === 'string'
                ? raw.messagingSocketPath
                : '',
            cwd: typeof raw.cwd === 'string' ? raw.cwd : '?',
            startedAt: typeof raw.startedAt === 'number' ? raw.startedAt : 0,
            procStart:
              typeof raw.procStart === 'string' ? raw.procStart : undefined,
            name: typeof raw.name === 'string' ? raw.name : undefined,
            kind: sessionKind(raw.kind),
            sessionId:
              typeof raw.sessionId === 'string' ? raw.sessionId : undefined,
            bridgeSessionId:
              typeof raw.bridgeSessionId === 'string'
                ? raw.bridgeSessionId
                : undefined,
            logPath:
              typeof raw.logPath === 'string' ? raw.logPath : undefined,
            status: sessionStatus(raw.status),
            waitingFor:
              typeof raw.waitingFor === 'string' ? raw.waitingFor : undefined,
            updatedAt:
              typeof raw.updatedAt === 'number' ? raw.updatedAt : undefined,
            entrypoint:
              typeof raw.entrypoint === 'string' ? raw.entrypoint : undefined,
            agent: typeof raw.agent === 'string' ? raw.agent : undefined,
            state: typeof raw.state === 'string' ? raw.state : undefined,
            detail: typeof raw.detail === 'string' ? raw.detail : undefined,
            tempo:
              raw.tempo === 'active' ||
              raw.tempo === 'idle' ||
              raw.tempo === 'blocked'
                ? raw.tempo
                : undefined,
            needs: typeof raw.needs === 'string' ? raw.needs : undefined,
            peerProtocol:
              typeof raw.peerProtocol === 'number' ? raw.peerProtocol : undefined,
            tmux: typeof raw.tmux === 'string' ? raw.tmux : undefined,
            pid,
            file: path,
          } satisfies RegistryCandidate
        } catch {
          return null
        }
      }),
  )
  return values.filter((value): value is RegistryCandidate => value !== null)
}

export async function listAllLiveSessions(): Promise<LivePeerSession[]> {
  const candidates = await readRegistry()
  const processAlive = candidates.map(candidate => isProcessRunning(candidate.pid))
  const birthsMatch = await Promise.all(
    candidates.map((candidate, index) =>
      processAlive[index]
        ? processStartTokenMatches(candidate.pid, candidate.procStart)
        : Promise.resolve(false),
    ),
  )
  const canSweep = getPlatform() !== 'wsl'
  const live: LivePeerSession[] = []
  for (let index = 0; index < candidates.length; index++) {
    const { file, procStart: _procStart, ...session } = candidates[index]!
    if (birthsMatch[index]) live.push(session)
    else if (canSweep && !processAlive[index]) void unlink(file).catch(() => {})
  }
  return live
}

export async function listLivePeerSessions(): Promise<LivePeerSession[]> {
  const candidates = (await readRegistry()).filter(candidate => candidate.sock)
  const socketAlive = await Promise.all(
    candidates.map(candidate => probeSocket(candidate.sock)),
  )
  const canSweep = getPlatform() !== 'wsl'
  const live: LivePeerSession[] = []
  for (let index = 0; index < candidates.length; index++) {
    const { file, procStart: _procStart, ...session } = candidates[index]!
    if (socketAlive[index]) live.push(session)
    else if (canSweep && !isProcessRunning(session.pid)) {
      void unlink(file).catch(() => {})
    }
  }
  return live
}
