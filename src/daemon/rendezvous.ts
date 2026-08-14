import { unlink } from 'fs/promises'
import { createServer, type Server, type Socket } from 'net'
import { StringDecoder } from 'string_decoder'
import { setTimeout as delay } from 'timers/promises'
import { getReplBridgeHandle } from '../bridge/replBridgeHandle.js'
import instances from '../ink/instances.js'
import { CURSOR_HOME, ERASE_SCREEN } from '../ink/termio/csi.js'
import { runCleanupFunctions } from '../utils/cleanupRegistry.js'
import { logForDebugging } from '../utils/debug.js'
import { enqueue } from '../utils/messageQueueManager.js'
import { readJobState, writeJobState } from './jobs.js'

let server: Server | undefined
let activeSocket: Socket | undefined

async function persistBridgeSequence(jobDir: string, sequence: number) {
  const state = await readJobState(jobDir)
  if (!state || state.bridgeSessionSeq === sequence) return
  await writeJobState(jobDir, {
    ...state,
    bridgeSessionSeq: sequence,
    updatedAt: new Date().toISOString(),
  })
}

function handleLine(line: string): void {
  let message: unknown
  try {
    message = JSON.parse(line)
  } catch {
    return
  }
  if (!message || typeof message !== 'object' || 'role' in message) return
  const value = message as Record<string, unknown>
  if (value.type === 'shutdown') {
    sendRendezvous({ type: 'shutting-down' })
    const bridge = getReplBridgeHandle()
    const pending: Promise<unknown>[] = []
    if (bridge) {
      const sequence = bridge.getLastSequenceNum()
      void bridge.teardown({ skipArchive: true }).catch(() => {})
      const jobDir = process.env.CLAUDE_JOB_DIR
      if (jobDir && sequence > 0) {
        pending.push(persistBridgeSequence(jobDir, sequence).catch(() => {}))
      }
    }
    pending.push(runCleanupFunctions())
    void Promise.race([Promise.all(pending), delay(5_000)]).finally(() => {
      process.exit(0)
    })
    return
  } else if (value.type === 'repaint') {
    if (!instances.get(process.stdout)?.forceRedraw()) {
      process.stdout.write(
        `${ERASE_SCREEN}${CURSOR_HOME}\n  \x1B[2mSession can't redraw right now — Ctrl+B then d to detach\x1B[0m\n`,
      )
    }
  } else if (value.type === 'reply' && typeof value.text === 'string') {
    enqueue({
      mode: 'prompt',
      value: value.text,
      priority: 'next',
      origin: { kind: 'peer', from: 'bg-rendezvous' },
      skipSlashCommands: true,
      isMeta: false,
    })
    logForDebugging(`[bg-rv] enqueued reply: ${value.text.slice(0, 80)}`)
  }
}

export async function startRendezvousServer(): Promise<void> {
  const path = process.env.CLAUDE_BG_RENDEZVOUS_SOCK
  if (!path || server) return
  delete process.env.CLAUDE_BG_RENDEZVOUS_SOCK
  await unlink(path).catch(() => {})
  server = createServer((socket) => {
    activeSocket?.destroy()
    activeSocket = socket
    socket.on('error', () => socket.destroy())
    socket.once('close', () => {
      if (activeSocket === socket) activeSocket = undefined
    })
    let buffered = ''
    const decoder = new StringDecoder('utf8')
    socket.on('data', (chunk) => {
      buffered += decoder.write(chunk)
      let newline
      while ((newline = buffered.indexOf('\n')) >= 0) {
        const line = buffered.slice(0, newline)
        buffered = buffered.slice(newline + 1)
        if (line) handleLine(line)
      }
      if (buffered.length > 1_048_576) {
        buffered = ''
        socket.destroy()
      }
    })
  })
  server.on('error', (error) =>
    logForDebugging(`[bg-rv] server error: ${String(error)}`, { level: 'warn' }),
  )
  server.listen(path)
  server.unref()
}

export function stopRendezvousServer(): void {
  activeSocket?.destroy()
  activeSocket = undefined
  server?.close()
  server = undefined
}

export function sendRendezvous(message: unknown): boolean {
  if (!activeSocket || activeSocket.destroyed) return false
  try {
    activeSocket.write(`${JSON.stringify(message)}\n`)
    return true
  } catch {
    return false
  }
}
