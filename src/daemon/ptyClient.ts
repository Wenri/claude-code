import { readFile, unlink } from 'fs/promises'
import { Socket } from 'net'
import { StringDecoder } from 'string_decoder'
import { logForDebugging } from '../utils/debug.js'
import {
  createFrameDecoder,
  encodeControlFrame,
  encodeDataFrame,
  FRAME_KIND_CONTROL,
  FRAME_KIND_DATA,
  MAX_FRAME_BYTES,
} from './framing.js'
import { getPtyErrorPath } from './paths.js'

type Disposable = { dispose(): void }

function createSignal<T>() {
  const listeners = new Set<(value: T) => void>()
  return {
    emit(value: T) {
      for (const listener of listeners) listener(value)
    },
    subscribe(listener: (value: T) => void): Disposable {
      listeners.add(listener)
      return { dispose: () => listeners.delete(listener) }
    },
  }
}

export interface PtyClient {
  pid: number
  replPid(): number | undefined
  replVersion(): string | undefined
  onResume(callback: () => void): void
  write(value: string): void
  resize(cols: number, rows: number): void
  kill(signal: NodeJS.Signals): void
  dispose(): void
  onData(callback: (data: string) => void): Disposable
  onExit(callback: (event: { exitCode: number }) => void): Disposable
}

export function connectPtyHost(
  socketPath: string,
  hostPid: number,
  expectedProcessStart?: string,
): PtyClient {
  const dataSignal = createSignal<string>()
  const exitSignal = createSignal<{ exitCode: number }>()
  const decoder = new StringDecoder('utf8')
  let socket: Socket | undefined
  let stopped = false
  let exited = false
  let attempts = 0
  let reconnectTimer: NodeJS.Timeout | undefined
  let replPid: number | undefined
  let replVersion: string | undefined
  let onResume: (() => void) | undefined
  let gotHello = false
  let suppressReplay = false
  let connected = false
  const pending: Buffer[] = []
  let pendingBytes = 0
  const backoff = [50, 100, 250, 500, 1_000, 2_000]

  const finish = (exitCode: number) => {
    if (exited) return
    exited = true
    stopped = true
    if (reconnectTimer) clearTimeout(reconnectTimer)
    socket?.destroy()
    const tail = decoder.end()
    if (tail) dataSignal.emit(tail)
    exitSignal.emit({ exitCode })
  }
  const hostAlive = () => {
    try {
      process.kill(hostPid, 0)
      return true
    } catch {
      return false
    }
  }
  const hostCrashed = () => {
    if (process.platform !== 'win32') {
      void readFile(getPtyErrorPath(socketPath), 'utf8')
        .then((text) =>
          logForDebugging(`[bg-pty] host crash: ${text.trim()}`, {
            level: 'warn',
          }),
        )
        .catch(() => {})
    }
    try {
      process.kill(-hostPid, 'SIGTERM')
    } catch {
      if (replPid) {
        try {
          process.kill(replPid, 'SIGTERM')
        } catch {}
      }
    }
    finish(-1)
  }
  const schedule = () => {
    if (stopped || reconnectTimer) return
    if (!hostAlive()) return hostCrashed()
    if (attempts >= 30) {
      logForDebugging(
        `[bg-pty] ${socketPath}: ${attempts} connect attempts failed; treating host as dead`,
        { level: 'warn' },
      )
      // expectedProcessStart is retained as the PID-reuse guard contract. A
      // caller that cannot resolve it still gets best-effort termination.
      void expectedProcessStart
      try {
        process.kill(-hostPid, 'SIGKILL')
      } catch {
        try {
          process.kill(hostPid, 'SIGKILL')
        } catch {}
      }
      return finish(-1)
    }
    const wait = backoff[Math.min(attempts, backoff.length - 1)]
    attempts++
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined
      open()
    }, wait)
    reconnectTimer.unref()
  }
  const send = (frame: Buffer) => {
    if (socket && !socket.destroyed) {
      socket.write(frame)
      return true
    }
    if (pendingBytes < 2 * MAX_FRAME_BYTES) {
      pending.push(frame)
      pendingBytes += frame.length
    }
    return false
  }
  const open = () => {
    if (stopped) return
    const candidate = new Socket()
    let didConnect = false
    candidate.on('error', schedule)
    candidate.once('close', () => {
      if (socket === candidate) socket = undefined
      if (stopped) return
      if (didConnect && !exited) {
        if (hostAlive()) {
          logForDebugging('[bg-pty] dropped by host; reconnecting', {
            level: 'debug',
          })
          attempts = 0
          schedule()
        } else {
          hostCrashed()
        }
        return
      }
      schedule()
    })
    candidate.once('connect', () => {
      didConnect = true
      attempts = 0
      socket = candidate
      if (process.platform !== 'win32') {
        void unlink(getPtyErrorPath(socketPath)).catch(() => {})
      }
      for (const frame of pending.splice(0)) candidate.write(frame)
      pendingBytes = 0
      const decode = createFrameDecoder(
        (frame) => {
          if (frame.kind === FRAME_KIND_DATA) {
            if (!suppressReplay) dataSignal.emit(decoder.write(frame.payload))
            return
          }
          if (frame.kind !== FRAME_KIND_CONTROL) return
          const ctrl = frame.ctrl as Record<string, unknown>
          if (ctrl.t === 'hello') {
            if (gotHello) {
              suppressReplay = true
              decoder.end()
            }
            gotHello = true
            replPid = typeof ctrl.replPid === 'number' ? ctrl.replPid : replPid
            replVersion =
              typeof ctrl.version === 'string' ? ctrl.version : replVersion
          } else if (ctrl.t === 'live') {
            if (suppressReplay) suppressReplay = false
            onResume?.()
          } else if (ctrl.t === 'exit') {
            finish(typeof ctrl.code === 'number' ? ctrl.code : -1)
          }
        },
        (message) => {
          logForDebugging(`[bg-pty] frame error: ${message}`, { level: 'warn' })
          candidate.destroy()
        },
      )
      candidate.on('data', decode)
      connected = true
    })
    candidate.connect(socketPath)
  }
  open()

  return {
    pid: hostPid,
    replPid: () => replPid,
    replVersion: () => replVersion,
    onResume(callback) {
      onResume = callback
    },
    write(value) {
      if (exited) return
      const bytes = Buffer.from(value, 'utf8')
      const chunkSize = MAX_FRAME_BYTES - 1
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        send(encodeDataFrame(bytes.subarray(offset, offset + chunkSize)))
      }
    },
    resize(cols, rows) {
      send(encodeControlFrame({ t: 'resize', cols, rows }))
    },
    kill(signal) {
      const normalized = signal === 'SIGKILL' ? 'SIGKILL' : 'SIGTERM'
      const delivered = send(encodeControlFrame({ t: 'kill', sig: normalized }))
      if (process.platform === 'win32' && normalized === 'SIGTERM' && delivered) {
        const timer = setTimeout(() => {
          try {
            process.kill(hostPid, 'SIGKILL')
          } catch {
            finish(-1)
          }
        }, 5_000)
        timer.unref()
        return
      }
      try {
        process.kill(-hostPid, normalized)
      } catch {
        try {
          process.kill(hostPid, normalized)
        } catch {
          finish(-1)
        }
      }
    },
    dispose() {
      stopped = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      socket?.destroy()
      socket = undefined
    },
    onData: dataSignal.subscribe,
    onExit: exitSignal.subscribe,
  }
}
