import { createWriteStream, mkdirSync, writeFileSync } from 'fs'
import { unlink } from 'fs/promises'
import { createServer, type Socket } from 'net'
import { getPriority, setPriority } from 'os'
import { dirname } from 'path'
import {
  createFrameDecoder,
  encodeControlFrame,
  encodeDataFrame,
  FRAME_KIND_CONTROL,
  FRAME_KIND_DATA,
  PTY_RING_BYTES,
} from './framing.js'
import { getPtyErrorPath } from './paths.js'

const MAX_SOCKET_BACKLOG = 1_048_576

interface BunTerminal {
  write(value: Buffer): void
  resize(cols: number, rows: number): void
  close(): void
}

interface BunSubprocess {
  pid: number
  exited: Promise<number>
  kill(signal: NodeJS.Signals): void
}

interface BunRuntime {
  Terminal: new (options: {
    cols: number
    rows: number
    data(terminal: BunTerminal, value: Uint8Array): void
  }) => BunTerminal
  spawn(
    argv: string[],
    options: {
      cwd: string
      env: NodeJS.ProcessEnv
      terminal: BunTerminal
      detached: false
    },
  ): BunSubprocess
}

export function createRing(limit: number): {
  readonly chunks: Buffer[]
  push(chunk: Buffer): void
} {
  let chunks: Buffer[] = []
  let offset = 0
  let size = 0
  const compact = () => {
    if (offset > 0) {
      chunks = chunks.slice(offset)
      offset = 0
    }
  }
  return {
    get chunks() {
      compact()
      return chunks
    },
    push(chunk) {
      chunks.push(chunk)
      size += chunk.length
      while (size > limit && chunks.length - offset > 1) {
        size -= chunks[offset++].length
        // Never start a retained buffer in the middle of a UTF-8 codepoint.
        for (let trimmed = 0; trimmed < 3; ) {
          const next = chunks[offset]
          let continuation = 0
          while (
            trimmed + continuation < 3 &&
            continuation < next.length &&
            (next[continuation] & 0xc0) === 0x80
          ) {
            continuation++
          }
          if (continuation > 0) {
            chunks[offset] = next.subarray(continuation)
            size -= continuation
            trimmed += continuation
          }
          if (chunks[offset].length > 0 || chunks.length - offset === 1) break
          offset++
        }
      }
      if (offset >= chunks.length - offset) compact()
    },
  }
}

function createRecorder(path: string | undefined, cols: number, rows: number) {
  if (!path) return undefined
  const started = process.hrtime.bigint()
  let stream: ReturnType<typeof createWriteStream> | undefined
  try {
    stream = createWriteStream(path, { flags: 'w' })
  } catch {
    return undefined
  }
  stream.on('error', () => {
    stream?.destroy()
    stream = undefined
  })
  const header = Buffer.allocUnsafe(8)
  header.writeUInt32BE(cols, 0)
  header.writeUInt32BE(rows, 4)
  stream.write(header)
  return {
    write(data: Buffer) {
      if (!stream) return
      const record = Buffer.allocUnsafe(8 + data.length)
      const micros = Number((process.hrtime.bigint() - started) / 1_000n)
      record.writeUInt32BE(micros >>> 0, 0)
      record.writeUInt32BE(data.length, 4)
      data.copy(record, 8)
      stream.write(record)
    },
    close() {
      stream?.end()
    },
  }
}

function fail(socketPath: string | undefined, message: string): never {
  if (socketPath) {
    try {
      mkdirSync(dirname(getPtyErrorPath(socketPath)), { recursive: true })
      writeFileSync(
        getPtyErrorPath(socketPath),
        `${new Date().toISOString()} ${message}\n`,
      )
    } catch {}
  }
  process.exit(1)
}

export async function runPtyHost(args: string[]): Promise<void> {
  const separator = args.indexOf('--')
  if (separator < 3 || separator === args.length - 1) {
    fail(
      undefined,
      'bad argv: --bg-pty-host <sock> <cols> <rows> -- <file> [args...]',
    )
  }
  const socketPath = args[0]
  process.on('uncaughtException', error =>
    fail(socketPath, `uncaught: ${error?.stack ?? String(error)}`),
  )
  process.on('unhandledRejection', error =>
    fail(
      socketPath,
      `unhandledRejection: ${(error as Error)?.stack ?? String(error)}`,
    ),
  )
  const cols = Number(args[1]) || 200
  const rows = Number(args[2]) || 50
  const file = args[separator + 1]
  const childArgs = args.slice(separator + 2)
  const bun = (globalThis as typeof globalThis & { Bun?: BunRuntime }).Bun
  if (!bun) {
    fail(socketPath, 'Bun.Terminal unavailable (running under Node?)')
  }
  if (process.platform !== 'win32') {
    try {
      setPriority(0, Math.min(getPriority(0) + 5, 19))
    } catch {}
  }

  const ring = createRing(PTY_RING_BYTES)
  const clients = new Set<Socket>()
  let exited = false
  const recorder = createRecorder(process.env.CLAUDE_PTY_RECORD, cols, rows)
  const broadcast = (frame: Buffer) => {
    for (const socket of clients) {
      if (socket.destroyed) {
        clients.delete(socket)
      } else if (socket.writableLength > MAX_SOCKET_BACKLOG) {
        socket.destroy()
        clients.delete(socket)
      } else {
        socket.write(frame)
      }
    }
  }

  let terminal: BunTerminal
  let child: BunSubprocess
  try {
    terminal = new bun.Terminal({
      cols,
      rows,
      data(_terminal, bytes) {
        const data = Buffer.from(bytes)
        ring.push(data)
        recorder?.write(data)
        if (clients.size) broadcast(encodeDataFrame(data))
      },
    })
    child = bun.spawn([file, ...childArgs], {
      cwd: process.cwd(),
      env: { ...process.env, TERM: 'xterm-256color' },
      terminal,
      detached: false,
    })
  } catch (error) {
    fail(socketPath, `spawn failed: ${String(error)}`)
  }

  await unlink(socketPath).catch(() => {})
  let exitCode = 0
  const server = createServer((socket) => {
    socket.on('error', () => socket.destroy())
    socket.once('close', () => clients.delete(socket))
    const write = (frame: Buffer) => {
      if (!socket.destroyed) socket.write(frame)
    }
    write(
      encodeControlFrame({
        t: 'hello',
        replPid: child.pid,
        version: MACRO.VERSION,
      }),
    )
    for (const chunk of ring.chunks) write(encodeDataFrame(chunk))
    write(encodeControlFrame({ t: 'live' }))
    clients.add(socket)
    if (exited) {
      write(encodeControlFrame({ t: 'exit', code: exitCode }))
      socket.end()
      return
    }
    const decode = createFrameDecoder(
      (frame) => {
        if (frame.kind === FRAME_KIND_DATA) {
          if (!exited) terminal.write(frame.payload)
          return
        }
        if (frame.kind !== FRAME_KIND_CONTROL) return
        const ctrl = frame.ctrl as Record<string, unknown>
        if (ctrl.t === 'resize') {
          const nextCols = Number(ctrl.cols)
          const nextRows = Number(ctrl.rows)
          if (
            nextCols > 0 &&
            nextCols <= 10_000 &&
            nextRows > 0 &&
            nextRows <= 10_000 &&
            !exited
          ) {
            terminal.resize(nextCols, nextRows)
            if (process.platform !== 'win32') {
              try {
                process.kill(-process.pid, 'SIGWINCH')
              } catch {}
            }
          }
        } else if (ctrl.t === 'kill') {
          try {
            child.kill(ctrl.sig === 'SIGKILL' ? 'SIGKILL' : 'SIGTERM')
          } catch {}
        }
      },
      () => socket.destroy(),
    )
    socket.on('data', decode)
  })
  server.on('error', (error) => {
    try {
      child.kill('SIGTERM')
    } catch {}
    fail(socketPath, `server error: ${String(error)}`)
  })
  server.listen(socketPath)
  server.unref()

  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
    process.on(signal, () => {
      try {
        child.kill(signal === 'SIGHUP' ? 'SIGTERM' : signal)
      } catch {}
    })
  }

  exitCode = await child.exited
  exited = true
  terminal.close()
  recorder?.close()
  broadcast(encodeControlFrame({ t: 'exit', code: exitCode }))
  for (const socket of clients) socket.end()
  await Promise.race([
    new Promise<void>((resolve) => server.close(() => resolve())),
    new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 2_000)
      timeout.unref()
    }),
  ])
  if (process.platform !== 'win32') await unlink(socketPath).catch(() => {})
  process.exit(exitCode)
}
