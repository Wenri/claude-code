export const TOKEN_BUCKET_CAPACITY = 10
export const TOKEN_REFILL_INTERVAL_MS = 2_000
export const SUSTAINED_SUPPRESSION_MS = 30_000
export const MAX_LINE_CHARS = 500
export const MAX_BATCH_CHARS = 3_000
export const BATCH_FLUSH_MS = 200
export const MAX_PARTIAL_BUFFER_CHARS = 1_048_576

export function createTokenBucket(
  capacity = TOKEN_BUCKET_CAPACITY,
  refillIntervalMs = TOKEN_REFILL_INTERVAL_MS,
  now = Date.now,
): { tryConsume(): boolean } {
  let tokens = capacity
  let lastRefill = now()

  function refill(): void {
    const current = now()
    const steps = Math.floor((current - lastRefill) / refillIntervalMs)
    if (steps > 0) {
      tokens = Math.min(capacity, tokens + steps)
      lastRefill += steps * refillIntervalMs
    }
  }

  return {
    tryConsume(): boolean {
      refill()
      if (tokens > 0) {
        tokens--
        return true
      }
      return false
    },
  }
}

export function createLineBatcher(
  onBatch: (batch: string) => void,
  schedule: (callback: () => void) => () => void = callback => {
    const timer = setTimeout(callback, BATCH_FLUSH_MS)
    return () => clearTimeout(timer)
  },
): { onData(data: string): void; flush(includePartial?: boolean): void } {
  let partial = ''
  let lines: string[] = []
  let cancelScheduledFlush: (() => void) | null = null

  function appendLine(line: string): void {
    let bounded = line
    if (bounded.length > MAX_LINE_CHARS) {
      bounded = bounded.slice(0, MAX_LINE_CHARS) + '...(truncated)'
    }
    lines.push(bounded)
  }

  function flush(includePartial?: boolean): void {
    if (cancelScheduledFlush) {
      cancelScheduledFlush()
      cancelScheduledFlush = null
    }
    if (includePartial && partial.trim()) {
      appendLine(partial.trim())
      partial = ''
    }
    if (lines.length === 0) return
    let batch = lines.join('\n')
    if (batch.length > MAX_BATCH_CHARS) {
      batch = batch.slice(0, MAX_BATCH_CHARS) + '\n...(truncated)'
    }
    lines = []
    onBatch(batch)
  }

  function onData(data: string): void {
    partial += data
    if (partial.length > MAX_PARTIAL_BUFFER_CHARS) {
      partial = partial.slice(-MAX_PARTIAL_BUFFER_CHARS)
    }
    let newlineIndex: number
    while ((newlineIndex = partial.indexOf('\n')) !== -1) {
      const line = partial.slice(0, newlineIndex).trim()
      partial = partial.slice(newlineIndex + 1)
      if (line) appendLine(line)
    }
    if (lines.length > 0 && !cancelScheduledFlush) {
      cancelScheduledFlush = schedule(flush)
    }
  }

  return { onData, flush }
}
