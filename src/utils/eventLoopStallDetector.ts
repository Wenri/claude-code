import instances from '../ink/instances.js'
import { logEvent } from '../services/analytics/index.js'
import { logForDebugging } from './debug.js'

const EXPECTED_INTERVAL_MS = 200
const STALL_THRESHOLD_MS = 500
const LIKELY_SLEEP_THRESHOLD_MS = 5_000

let detector: NodeJS.Timeout | null = null
let lastTickAt = 0
let totalStalls = 0
let cumulativeStallMs = 0
let totalTicks = 0

function getMemoryUsageMb(): {
  rss_mb: number
  heap_used_mb: number
  ext_mb: number
} {
  const usage = process.memoryUsage()
  return {
    rss_mb: Math.round(usage.rss / 1024 / 1024),
    heap_used_mb: Math.round(usage.heapUsed / 1024 / 1024),
    ext_mb: Math.round(usage.external / 1024 / 1024),
  }
}

export function startEventLoopStallDetector(): void {
  if (detector !== null) return

  lastTickAt = Date.now()
  logForDebugging(
    `[event-loop-stall] detector started (interval=${EXPECTED_INTERVAL_MS}ms, threshold=${STALL_THRESHOLD_MS}ms)`,
  )
  detector = setInterval(() => {
    const now = Date.now()
    const actualIntervalMs = now - lastTickAt
    const stallDurationMs = actualIntervalMs - EXPECTED_INTERVAL_MS
    totalTicks++

    if (stallDurationMs > STALL_THRESHOLD_MS) {
      totalStalls++
      cumulativeStallMs += stallDurationMs
      const likelySleep = stallDurationMs > LIKELY_SLEEP_THRESHOLD_MS
      const memory = getMemoryUsageMb()

      logForDebugging(
        `[event-loop-stall] blocked for ${stallDurationMs}ms (expected ${EXPECTED_INTERVAL_MS}ms, actual ${actualIntervalMs}ms). Total stalls: ${totalStalls}, cumulative: ${cumulativeStallMs}ms${likelySleep ? ' [likely sleep/wake]' : ''} rss=${memory.rss_mb}MB heap=${memory.heap_used_mb}MB ext=${memory.ext_mb}MB`,
        { level: 'warn' },
      )
      logEvent('tengu_event_loop_stall', {
        stall_duration_ms: stallDurationMs,
        expected_interval_ms: EXPECTED_INTERVAL_MS,
        actual_interval_ms: actualIntervalMs,
        total_stalls: totalStalls,
        cumulative_stall_ms: cumulativeStallMs,
        likely_sleep: likelySleep,
        ...memory,
      })

      if (likelySleep) {
        instances.get(process.stdout)?.reassertTerminalModes(true)
      }
    }

    lastTickAt = now
  }, EXPECTED_INTERVAL_MS)
  detector.unref()
}
