import { useRef, useState } from 'react'
import { useInterval } from 'usehooks-ts'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../services/analytics/index.js'

export type MemoryUsageStatus = 'normal' | 'high' | 'critical'

export type MemoryUsageInfo = {
  heapUsed: number
  status: MemoryUsageStatus
}

const HIGH_MEMORY_THRESHOLD = 1.5 * 1024 * 1024 * 1024 // 1.5GB in bytes
const CRITICAL_MEMORY_THRESHOLD = 2.5 * 1024 * 1024 * 1024 // 2.5GB in bytes
const MEMORY_STATUS_RANK: Record<MemoryUsageStatus, number> = {
  normal: 0,
  high: 1,
  critical: 2,
}

/**
 * Hook to monitor Node.js process memory usage.
 * Polls every 10 seconds; returns null while status is 'normal'.
 */
export function useMemoryUsage(): MemoryUsageInfo | null {
  const [memoryUsage, setMemoryUsage] = useState<MemoryUsageInfo | null>(null)
  const priorStatusRef = useRef<MemoryUsageStatus>('normal')

  useInterval(() => {
    const { heapUsed, rss } = process.memoryUsage()
    const status: MemoryUsageStatus =
      heapUsed >= CRITICAL_MEMORY_THRESHOLD
        ? 'critical'
        : heapUsed >= HIGH_MEMORY_THRESHOLD
          ? 'high'
          : 'normal'
    if (MEMORY_STATUS_RANK[status] > MEMORY_STATUS_RANK[priorStatusRef.current]) {
      logEvent('tengu_memory_threshold_crossed', {
        rss_mb: Math.round(rss / 1024 / 1024),
        heap_used_mb: Math.round(heapUsed / 1024 / 1024),
        status:
          status as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
      priorStatusRef.current = status
    }
    setMemoryUsage(prev => {
      // Bail when status is 'normal' — nothing is shown, so heapUsed is
      // irrelevant and we avoid re-rendering the whole Notifications subtree
      // every 10 seconds for the 99%+ of users who never reach 1.5GB.
      if (status === 'normal') return prev === null ? prev : null
      return { heapUsed, status }
    })
  }, 10_000)

  return memoryUsage
}
