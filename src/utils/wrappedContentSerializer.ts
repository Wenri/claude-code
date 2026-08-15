import { jsonStringify } from './slowOperations.js'

export type WrappedContentOptions = {
  transformInnerChunk?: (chunk: string) => string
  extraOuterFields?: Record<string, unknown>
}

class ByteChunkWriter {
  private readonly chunks: Uint8Array[] = []
  private static readonly encoder = new TextEncoder()

  push(value: string): void {
    if (value.length > 0) {
      this.chunks.push(ByteChunkWriter.encoder.encode(value))
    }
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.chunks)
  }
}

/**
 * Serialize a potentially large report without first constructing its escaped
 * outer `content` string. Array and transcript-map fields are streamed one
 * element at a time so a large transcript does not require another full-size
 * temporary string.
 */
export function serializeWrappedContent(
  value: Record<string, unknown>,
  streamedArrayFields: ReadonlySet<string>,
  streamedArrayMapFields: ReadonlySet<string>,
  options?: WrappedContentOptions,
): Buffer {
  const writer = new ByteChunkWriter()
  const transform = options?.transformInnerChunk ?? ((chunk: string) => chunk)
  const pushInsideOuterString = (chunk: string): void => {
    if (chunk.length > 0) {
      writer.push(jsonStringify(transform(chunk)).slice(1, -1))
    }
  }

  writer.push('{"content":"')
  pushInsideOuterString('{')
  let first = true
  const writeKey = (key: string): void => {
    if (!first) pushInsideOuterString(',')
    first = false
    pushInsideOuterString(`${jsonStringify(key)}:`)
  }

  for (const [key, fieldValue] of Object.entries(value)) {
    if (fieldValue === undefined) continue
    if (streamedArrayFields.has(key) && Array.isArray(fieldValue)) {
      writeKey(key)
      pushInsideOuterString('[')
      for (let index = 0; index < fieldValue.length; index++) {
        if (index > 0) pushInsideOuterString(',')
        pushInsideOuterString(jsonStringify(fieldValue[index]))
      }
      pushInsideOuterString(']')
    } else if (
      streamedArrayMapFields.has(key) &&
      fieldValue !== null &&
      typeof fieldValue === 'object'
    ) {
      writeKey(key)
      pushInsideOuterString('{')
      const entries = Object.entries(fieldValue)
      for (let index = 0; index < entries.length; index++) {
        const [entryKey, entryValue] = entries[index] ?? ['', undefined]
        if (index > 0) pushInsideOuterString(',')
        pushInsideOuterString(`${jsonStringify(entryKey)}:[`)
        if (Array.isArray(entryValue)) {
          for (let item = 0; item < entryValue.length; item++) {
            if (item > 0) pushInsideOuterString(',')
            pushInsideOuterString(jsonStringify(entryValue[item]))
          }
        }
        pushInsideOuterString(']')
      }
      pushInsideOuterString('}')
    } else {
      writeKey(key)
      pushInsideOuterString(jsonStringify(fieldValue))
    }
  }

  pushInsideOuterString('}')
  writer.push('"')
  for (const [key, fieldValue] of Object.entries(
    options?.extraOuterFields ?? {},
  )) {
    writer.push(`,${jsonStringify(key)}:${jsonStringify(fieldValue)}`)
  }
  writer.push('}')
  return writer.toBuffer()
}
