import { jsonStringify } from './slowOperations.js'

type FeedbackPayloadOptions = {
  extraOuterFields?: Record<string, unknown>
}

class EncodedChunkBuffer {
  private readonly chunks: Uint8Array[] = []
  private static readonly encoder = new TextEncoder()

  push(value: string): void {
    if (value.length > 0) {
      this.chunks.push(EncodedChunkBuffer.encoder.encode(value))
    }
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.chunks)
  }
}

/**
 * Builds the feedback request incrementally so large transcripts do not need a
 * second full-size escaped JSON string in memory.
 */
export function buildFeedbackPayload(
  data: Record<string, unknown>,
  arrayFields: ReadonlySet<string>,
  nestedArrayFields: ReadonlySet<string>,
  options?: FeedbackPayloadOptions,
): Buffer {
  const buffer = new EncodedChunkBuffer()
  const pushEscaped = (value: string): void => {
    if (value.length > 0) {
      buffer.push(jsonStringify(value).slice(1, -1))
    }
  }

  buffer.push('{"content":"')
  pushEscaped('{')

  let firstField = true
  const pushFieldName = (name: string): void => {
    if (!firstField) pushEscaped(',')
    firstField = false
    pushEscaped(`${jsonStringify(name)}:`)
  }

  for (const [name, value] of Object.entries(data)) {
    if (value === undefined) continue

    if (arrayFields.has(name) && Array.isArray(value)) {
      pushFieldName(name)
      pushEscaped('[')
      for (let index = 0; index < value.length; index++) {
        if (index > 0) pushEscaped(',')
        pushEscaped(jsonStringify(value[index]))
      }
      pushEscaped(']')
    } else if (
      nestedArrayFields.has(name) &&
      value !== null &&
      typeof value === 'object'
    ) {
      pushFieldName(name)
      pushEscaped('{')
      const entries = Object.entries(value)
      for (let index = 0; index < entries.length; index++) {
        const [nestedName, nestedValue] = entries[index] ?? ['', undefined]
        if (index > 0) pushEscaped(',')
        pushEscaped(`${jsonStringify(nestedName)}:[`)
        if (Array.isArray(nestedValue)) {
          for (let itemIndex = 0; itemIndex < nestedValue.length; itemIndex++) {
            if (itemIndex > 0) pushEscaped(',')
            pushEscaped(jsonStringify(nestedValue[itemIndex]))
          }
        }
        pushEscaped(']')
      }
      pushEscaped('}')
    } else {
      pushFieldName(name)
      pushEscaped(jsonStringify(value))
    }
  }

  pushEscaped('}')
  buffer.push('"')

  const extraOuterFields = options?.extraOuterFields
  if (extraOuterFields) {
    for (const [name, value] of Object.entries(extraOuterFields)) {
      buffer.push(`,${jsonStringify(name)}:${jsonStringify(value)}`)
    }
  }

  buffer.push('}')
  return buffer.toBuffer()
}
