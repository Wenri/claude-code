import type { Socket } from 'net'
import { logForDebugging } from '../utils/debug.js'

type NativeFunction = (...args: unknown[]) => number

function openSymbol(
  library: string,
  symbols: Record<string, unknown>,
): Record<string, NativeFunction> | null {
  try {
    const ffi = require('bun:ffi') as typeof import('bun:ffi')
    return ffi.dlopen(library, symbols as never).symbols as unknown as Record<
      string,
      NativeFunction
    >
  } catch (error) {
    logForDebugging(
      `[daemon] dlopen(${library}) failed: ${error instanceof Error ? error.message : String(error)}`,
      { level: 'warn' },
    )
    return null
  }
}

let linuxGetSockOpt: NativeFunction | null | undefined
let macGetPeerEid: NativeFunction | null | undefined

function linuxPeerUid(fd: number): number | null {
  if (linuxGetSockOpt === undefined) {
    linuxGetSockOpt =
      openSymbol('libc.so.6', {
        getsockopt: {
          args: ['int', 'int', 'int', 'ptr', 'ptr'],
          returns: 'int',
        },
      })?.getsockopt ?? null
  }
  if (!linuxGetSockOpt) return null
  const credentials = new Uint8Array(12)
  const size = new Uint32Array([12])
  if (linuxGetSockOpt(fd, 1, 17, credentials, size) !== 0) return null
  return new DataView(credentials.buffer).getUint32(4, true)
}

function macPeerUid(fd: number): number | null {
  if (macGetPeerEid === undefined) {
    macGetPeerEid =
      openSymbol('/usr/lib/libSystem.B.dylib', {
        getpeereid: { args: ['int', 'ptr', 'ptr'], returns: 'int' },
      })?.getpeereid ?? null
  }
  if (!macGetPeerEid) return null
  const uid = new Uint32Array(1)
  const gid = new Uint32Array(1)
  return macGetPeerEid(fd, uid, gid) === 0 ? Number(uid[0]) : null
}

export function getControlPeerUid(socket: Socket): number | null {
  if (process.platform === 'win32' || typeof Bun === 'undefined') return null
  const handle = (socket as Socket & { _handle?: { fd?: number } })._handle
  const fd = typeof handle?.fd === 'number' ? handle.fd : -1
  if (fd < 0) return null
  try {
    return process.platform === 'darwin' ? macPeerUid(fd) : linuxPeerUid(fd)
  } catch (error) {
    logForDebugging(
      `[daemon] peer uid lookup failed: ${error instanceof Error ? error.message : String(error)}`,
      { level: 'warn' },
    )
    return null
  }
}

export function controlPeerMatchesCurrentUser(
  socket: Socket,
  lookup: (socket: Socket) => number | null = getControlPeerUid,
): boolean {
  const uid = process.getuid?.()
  if (uid == null) return true
  const peerUid = lookup(socket)
  if (peerUid == null || peerUid === uid) return true
  logForDebugging(
    `[daemon] rejecting control connection: peer uid ${peerUid} != ${uid}`,
    { level: 'error' },
  )
  return false
}
