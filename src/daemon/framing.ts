export const FRAME_KIND_DATA = 0
export const FRAME_KIND_CONTROL = 1
export const PTY_RING_BYTES = 262_144
export const FRAME_HEADER_BYTES = 5
export const MAX_FRAME_BYTES = 1_048_576

export type PtyFrame =
  | { kind: typeof FRAME_KIND_DATA; payload: Buffer }
  | { kind: typeof FRAME_KIND_CONTROL; ctrl: unknown }

export function encodeDataFrame(value: string | Buffer): Buffer {
  const payload = typeof value === 'string' ? Buffer.from(value, 'utf8') : value
  const frame = Buffer.allocUnsafe(FRAME_HEADER_BYTES + payload.length)
  frame.writeUInt32BE(payload.length, 0)
  frame.writeUInt8(FRAME_KIND_DATA, 4)
  payload.copy(frame, FRAME_HEADER_BYTES)
  return frame
}

export function encodeControlFrame(value: unknown): Buffer {
  const payload = Buffer.from(JSON.stringify(value), 'utf8')
  const frame = Buffer.allocUnsafe(FRAME_HEADER_BYTES + payload.length)
  frame.writeUInt32BE(payload.length, 0)
  frame.writeUInt8(FRAME_KIND_CONTROL, 4)
  payload.copy(frame, FRAME_HEADER_BYTES)
  return frame
}

export function createFrameDecoder(
  onFrame: (frame: PtyFrame) => void,
  onError: (message: string) => void,
): (chunk: Buffer) => void {
  let buffered = Buffer.alloc(0)
  let failed = false
  return (chunk) => {
    if (failed) return
    buffered = buffered.length === 0 ? chunk : Buffer.concat([buffered, chunk])
    while (buffered.length >= FRAME_HEADER_BYTES) {
      const length = buffered.readUInt32BE(0)
      if (length > MAX_FRAME_BYTES) {
        failed = true
        onError(`frame too large (${length} > ${MAX_FRAME_BYTES})`)
        return
      }
      const frameLength = FRAME_HEADER_BYTES + length
      if (buffered.length < frameLength) return
      const kind = buffered.readUInt8(4)
      const payload = buffered.subarray(FRAME_HEADER_BYTES, frameLength)
      buffered = buffered.subarray(frameLength)
      if (kind === FRAME_KIND_DATA) {
        onFrame({ kind: FRAME_KIND_DATA, payload: Buffer.from(payload) })
      } else if (kind === FRAME_KIND_CONTROL) {
        try {
          onFrame({
            kind: FRAME_KIND_CONTROL,
            ctrl: JSON.parse(payload.toString('utf8')),
          })
        } catch {
          failed = true
          onError('bad ctrl json')
          return
        }
      } else {
        failed = true
        onError(`unknown frame kind ${kind}`)
        return
      }
    }
  }
}
