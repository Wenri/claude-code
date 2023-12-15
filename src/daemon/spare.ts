import { randomBytes } from 'crypto'
import { unlinkSync } from 'fs'
import { mkdir, readdir, unlink } from 'fs/promises'
import { connect, createServer } from 'net'
import { join } from 'path'
import {
  setCwdState,
  setOriginalCwd,
  setProjectRoot,
  switchSession,
  resetStartTime,
} from '../bootstrap/state.js'
import { isInBundledMode } from '../utils/bundledMode.js'
import { logForDebugging } from '../utils/debug.js'
import { getErrnoCode } from '../utils/errors.js'
import { canonicalizePath } from '../utils/sessionStoragePortable.js'
import { resetSettingsCache } from '../utils/settings/settingsCache.js'
import { sleep } from '../utils/sleep.js'
import { encodeControlFrame } from './framing.js'
import type { Dispatch } from './protocol.js'
import {
  getPtyErrorPath,
  getSpareClaimSocketPath,
  getSpareDir,
  getSparePtySocketPath,
} from './paths.js'
import {
  BackgroundHandle,
  type AuthSnapshot,
  type SpawnPty,
} from './supervisor.js'

const STRIPPED_SPARE_ENV = [
  'CLAUDE_CODE_QUESTION_PREVIEW_FORMAT',
  'GITHUB_ACTIONS',
  'CLAUDECODE',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_EXECPATH',
  'TERM_PROGRAM',
  'TERM_PROGRAM_VERSION',
  '__CFBundleIdentifier',
  'KITTY_WINDOW_ID',
  'WT_SESSION',
  'KONSOLE_VERSION',
  'VTE_VERSION',
  'ZED_TERM',
  'ZELLIJ',
  'TMUX',
  'STY',
]

export interface SpareProcess {
  hostPid: number
  ptySock: string
  claimSock: string
  startedAt: number
  cliVersion: string
  dispose(): void
}

interface ClaimFrame {
  cwd: string
  env: NodeJS.ProcessEnv
  argv: string[]
  sessionId: string
}

function spareEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const key of STRIPPED_SPARE_ENV) delete env[key]
  return Object.assign(env, {
    CLAUDE_CODE_SESSION_KIND: 'bg',
    CLAUDE_BG_BACKEND: 'daemon',
    CLAUDE_ENABLE_STREAM_WATCHDOG: '1',
    FORCE_COLOR: '3',
    COLORTERM: 'truecolor',
    BROWSER: 'true',
  })
}

function invocation(): string[] {
  return isInBundledMode()
    ? [process.execPath]
    : [process.execPath, process.argv[1]!]
}

export async function spawnSpare(options: {
  log: (message: string) => void
  onExit: () => void
}): Promise<SpareProcess | null> {
  if (process.platform === 'win32' || typeof Bun === 'undefined') return null
  const id = randomBytes(4).toString('hex')
  const ptySock = getSparePtySocketPath(id)
  const claimSock = getSpareClaimSocketPath(id)
  await mkdir(getSpareDir(), { recursive: true, mode: 0o700 }).catch(() => {})
  await Promise.all([unlink(ptySock).catch(() => {}), unlink(claimSock).catch(() => {})])
  const [command, ...prefixArgs] = invocation()
  const child = Bun.spawn(
    [
      command!,
      ...prefixArgs,
      '--bg-pty-host',
      ptySock,
      '200',
      '50',
      '--',
      command!,
      ...prefixArgs,
      '--bg-spare',
      claimSock,
    ],
    {
      cwd: getSpareDir(),
      env: spareEnvironment(),
      stdio: ['ignore', 'ignore', 'ignore'],
      detached: true,
    },
  )
  child.unref()
  const result: SpareProcess = {
    hostPid: child.pid,
    ptySock,
    claimSock,
    startedAt: Date.now(),
    cliVersion: MACRO.VERSION,
    dispose() {
      try {
        child.kill('SIGTERM')
      } catch {}
    },
  }
  void child.exited.then(() => {
    void unlink(ptySock).catch(() => {})
    void unlink(claimSock).catch(() => {})
    void unlink(getPtyErrorPath(ptySock)).catch(() => {})
    options.onExit()
  })
  options.log(`bg spare spawned host pid=${child.pid}`)
  return result
}

function sendClaimOnce(path: string, frame: ClaimFrame): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = connect(path)
    socket.once('error', reject)
    socket.once('connect', () => {
      socket.end(`${JSON.stringify(frame)}\n`, resolve)
    })
  })
}

export async function sendSpareClaim(
  path: string,
  frame: ClaimFrame,
): Promise<void> {
  const startedAt = Date.now()
  const backoff = [50, 100, 150, 200, 250, 300, 400, 500, 500, 500]
  for (let attempt = 0; ; attempt++) {
    if (Date.now() - startedAt > 5_000) throw new Error('send-claim timeout')
    try {
      await sendClaimOnce(path, frame)
      return
    } catch (error) {
      const code = getErrnoCode(error)
      if (
        (code !== 'ENOENT' && code !== 'ECONNREFUSED') ||
        attempt >= backoff.length
      ) {
        throw error
      }
      await sleep(backoff[attempt] ?? 500)
    }
  }
}

export function claimSpare(
  dispatch: Dispatch,
  spare: SpareProcess,
  spawnPty: SpawnPty | undefined,
  getAuthSnapshot?: () => AuthSnapshot | undefined,
): BackgroundHandle {
  const handle = BackgroundHandle.claim(dispatch, {
    pid: spare.hostPid,
    ptySockPath: spare.ptySock,
    spawnPty,
    getAuthSnapshot,
  })
  void sendSpareClaim(
    spare.claimSock,
    buildSpareClaimFrame(dispatch, getAuthSnapshot),
  ).catch(error => {
    logForDebugging(`[bg-spare] send-claim failed: ${String(error)}`, {
      level: 'warn',
    })
    killSparePty(spare.ptySock)
  })
  return handle
}

function buildSpareClaimFrame(
  dispatch: Dispatch,
  getAuthSnapshot?: () => AuthSnapshot | undefined,
): ClaimFrame {
  const frame = BackgroundHandle.buildClaimFrame(
    dispatch,
    getAuthSnapshot?.(),
  )
  return {
    cwd: dispatch.cwd,
    env: frame.env,
    argv: frame.argv,
    sessionId: dispatch.sessionId,
  }
}

function receiveClaim(path: string): Promise<ClaimFrame> {
  return new Promise((resolve, reject) => {
    const server = createServer((socket) => {
      let buffered = ''
      socket.setEncoding('utf8')
      socket.on('data', (data) => {
        buffered += data
        const newline = buffered.indexOf('\n')
        if (newline < 0) return
        try {
          const frame = JSON.parse(buffered.slice(0, newline)) as ClaimFrame
          server.close()
          resolve(frame)
        } catch (error) {
          reject(error)
        }
      })
      socket.on('error', reject)
    })
    server.on('error', reject)
    server.listen(path)
  })
}

export async function runBgSpare(args: string[]): Promise<void> {
  const claimSock = args[0]
  if (!claimSock) {
    process.stderr.write('[bg-spare] missing claim sock path\n')
    process.exit(2)
  }
  const mainModule = import('../main.js')
  const cleanupSocket = () => {
    try {
      unlinkSync(claimSock)
    } catch {}
  }
  const exit = () => {
    cleanupSocket()
    process.exit(0)
  }
  const fail = (error: unknown) => {
    cleanupSocket()
    process.stderr.write(
      `[bg-spare] uncaughtException: ${error instanceof Error ? error.message : String(error)}\n`,
    )
    process.exit(1)
  }
  const parentPid = process.ppid
  const parentWatch = setInterval(() => {
    if (process.ppid !== parentPid) exit()
  }, 2_000)
  parentWatch.unref()
  for (const signal of ['SIGTERM', 'SIGHUP', 'SIGINT'] as const) {
    process.on(signal, exit)
  }
  process.on('uncaughtException', fail)

  let frame: ClaimFrame
  try {
    frame = await receiveClaim(claimSock)
  } catch (error) {
    cleanupSocket()
    process.stderr.write(
      `[bg-spare] claim recv failed: ${error instanceof Error ? error.message : String(error)}\n`,
    )
    process.exit(1)
  }
  clearInterval(parentWatch)
  for (const signal of ['SIGTERM', 'SIGHUP', 'SIGINT'] as const) {
    process.off(signal, exit)
  }
  process.off('uncaughtException', fail)

  const cwd = await canonicalizePath(frame.cwd)
  process.chdir(cwd)
  setOriginalCwd(cwd)
  setProjectRoot(cwd)
  setCwdState(cwd)
  switchSession(frame.sessionId as never)
  resetStartTime()
  resetSettingsCache()
  Object.assign(process.env, frame.env)
  process.argv = [process.argv[0]!, process.argv[1]!, ...frame.argv]
  const { main } = await mainModule
  await main()
}

export async function reapOrphanSpares(
  handles: Map<string, BackgroundHandle>,
  log: (message: string) => void,
): Promise<void> {
  if (process.platform === 'win32') return
  const active = new Set<string>()
  for (const handle of handles.values()) {
    const ptySock = handle.rosterEntry().ptySock
    if (ptySock) active.add(ptySock)
  }
  const entries = await readdir(getSpareDir()).catch(() => [])
  let reaped = 0
  for (const entry of entries) {
    if (!entry.endsWith('.pty.sock')) continue
    const path = join(getSpareDir(), entry)
    if (active.has(path)) continue
    reaped++
    const socket = connect(path)
    socket.on('error', () => void unlink(path).catch(() => {}))
    socket.once('connect', () => {
      socket.resume()
      socket.write(encodeControlFrame({ t: 'kill', sig: 'SIGTERM' }))
      socket.end()
      setTimeout(() => socket.destroy(), 2_000).unref()
    })
  }
  for (const entry of entries) {
    if (entry.endsWith('.pty.sock.err')) {
      const socketName = entry.slice(0, -4)
      if (!entries.includes(socketName)) {
        void unlink(join(getSpareDir(), entry)).catch(() => {})
      }
    } else if (entry.endsWith('.claim.sock')) {
      void unlink(join(getSpareDir(), entry)).catch(() => {})
    }
  }
  if (reaped) log(`bg orphan-spare reap: ${reaped}`)
}

export function killSparePty(path: string): void {
  const socket = connect(path)
  socket.on('error', () => {})
  socket.once('connect', () => {
    socket.write(encodeControlFrame({ t: 'kill', sig: 'SIGTERM' }))
    socket.end()
  })
}
