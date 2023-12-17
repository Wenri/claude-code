import type { Buffer } from 'buffer'
import { isInBundledMode } from '../../utils/bundledMode.js'

export type SharpInstance = {
  metadata(): Promise<{ width: number; height: number; format: string }>
  resize(
    width: number,
    height: number,
    options?: { fit?: string; withoutEnlargement?: boolean },
  ): SharpInstance
  jpeg(options?: { quality?: number }): SharpInstance
  png(options?: {
    compressionLevel?: number
    palette?: boolean
    colors?: number
  }): SharpInstance
  webp(options?: { quality?: number }): SharpInstance
  toBuffer(): Promise<Buffer>
}

export type SharpFunction = (input: Buffer) => SharpInstance

type SharpCreatorOptions = {
  create: {
    width: number
    height: number
    channels: 3 | 4
    background: { r: number; g: number; b: number }
  }
}

type SharpCreator = (options: SharpCreatorOptions) => SharpInstance

export type ParsedImageDimensions = { width: number; height: number }

/** Read image dimensions directly from common image container headers. */
export function getImageDimensionsFromBuffer(
  buffer: Buffer,
): ParsedImageDimensions | null {
  if (
    buffer.length >= 24 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a &&
    buffer.toString('ascii', 12, 16) === 'IHDR'
  ) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  }

  if (
    buffer.length >= 10 &&
    (buffer.toString('ascii', 0, 6) === 'GIF87a' ||
      buffer.toString('ascii', 0, 6) === 'GIF89a')
  ) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) }
  }

  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2
    while (offset + 1 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset++
        continue
      }
      while (offset < buffer.length && buffer[offset] === 0xff) offset++
      if (offset >= buffer.length) break
      const marker = buffer[offset]
      if (marker === undefined) break
      if (
        marker === 0xd8 ||
        marker === 0xd9 ||
        marker === 0x01 ||
        (marker >= 0xd0 && marker <= 0xd7)
      ) {
        offset++
        continue
      }
      if (offset + 2 >= buffer.length) break
      const segmentLength = buffer.readUInt16BE(offset + 1)
      const isStartOfFrame =
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      if (isStartOfFrame && offset + 7 < buffer.length) {
        return {
          width: buffer.readUInt16BE(offset + 6),
          height: buffer.readUInt16BE(offset + 4),
        }
      }
      if (segmentLength < 2) break
      offset += 1 + segmentLength
    }
  }

  if (
    buffer.length >= 30 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    const chunk = buffer.toString('ascii', 12, 16)
    if (
      chunk === 'VP8 ' &&
      buffer[23] === 0x9d &&
      buffer[24] === 0x01 &&
      buffer[25] === 0x2a
    ) {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      }
    }
    if (chunk === 'VP8L' && buffer[20] === 0x2f) {
      const b1 = buffer[21] ?? 0
      const b2 = buffer[22] ?? 0
      const b3 = buffer[23] ?? 0
      const b4 = buffer[24] ?? 0
      return {
        width: 1 + (((b2 & 0x3f) << 8) | b1),
        height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)),
      }
    }
    if (chunk === 'VP8X') {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3),
      }
    }
  }

  return null
}

let imageProcessorModule: { default: SharpFunction } | null = null
let imageCreatorModule: { default: SharpCreator } | null = null

export async function getImageProcessor(): Promise<SharpFunction> {
  if (imageProcessorModule) {
    return imageProcessorModule.default
  }

  if (isInBundledMode()) {
    // Try to load the native image processor first
    try {
      // Use the native image processor module
      const imageProcessor = await import('image-processor-napi')
      const sharp = imageProcessor.sharp || imageProcessor.default
      imageProcessorModule = { default: sharp }
      return sharp
    } catch {
      // Fall back to sharp if native module is not available
      // biome-ignore lint/suspicious/noConsole: intentional warning
      console.warn(
        'Native image processor not available, falling back to sharp',
      )
    }
  }

  // Use sharp for non-bundled builds or as fallback.
  // Single structural cast: our SharpFunction is a subset of sharp's actual type surface.
  const imported = (await import(
    'sharp'
  )) as unknown as MaybeDefault<SharpFunction>
  const sharp = unwrapDefault(imported)
  imageProcessorModule = { default: sharp }
  return sharp
}

/**
 * Get image creator for generating new images from scratch.
 * Note: image-processor-napi doesn't support image creation,
 * so this always uses sharp directly.
 */
export async function getImageCreator(): Promise<SharpCreator> {
  if (imageCreatorModule) {
    return imageCreatorModule.default
  }

  const imported = (await import(
    'sharp'
  )) as unknown as MaybeDefault<SharpCreator>
  const sharp = unwrapDefault(imported)
  imageCreatorModule = { default: sharp }
  return sharp
}

// Dynamic import shape varies by module interop mode — ESM yields { default: fn }, CJS yields fn directly.
type MaybeDefault<T> = T | { default: T }

function unwrapDefault<T extends (...args: never[]) => unknown>(
  mod: MaybeDefault<T>,
): T {
  return typeof mod === 'function' ? mod : mod.default
}
