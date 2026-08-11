import { unlink } from 'fs/promises'
import { createServer, type Server, type Socket } from 'net'
import { StringDecoder } from 'string_decoder'
import { setTimeout as delay } from 'timers/promises'
import { logForDebugging } from '../utils/debug.js'

let server: Server | undefined
let activeSocket: Socket | undefined
let onReply: ((text: string) => void) | undefined
let onRepaint: (() => void) | undefined
let onShutdown: (() => Promise<void>) | undefined

export function configureRendezvousHandlers(handlers: {
  reply?: (text: string) => void
  repaint?: () => void
  shutdown?: () => Promise<void>
}): void {
  onReply = handlers.reply
  onRepaint = handlers.repaint
  onShutdown = handlers.shutdown
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
    void Promise.race([onShutdown?.() ?? Promise.resolve(), delay(2_000)]).finally(
      () => process.exit(0),
    )
  } else if (value.type === 'repaint') {
    onRepaint?.()
  } else if (value.type === 'reply' && typeof value.text === 'string') {
    onReply?.(value.text)
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
