import { useEffect } from 'react'
import { getRuntimeCapabilities } from './bootstrap/state.js'
import { formatTotalCost, saveCurrentSessionCosts } from './cost-tracker.js'
import { hasConsoleBillingAccess } from './utils/billing.js'
import {
  getCurrentProjectConfig,
  saveCurrentProjectConfig,
} from './utils/config.js'
import type { FpsMetrics } from './utils/fpsTracker.js'
import { isShuttingDown } from './utils/gracefulShutdown.js'

export function useCostSummary(
  getFpsMetrics?: () => FpsMetrics | undefined,
): void {
  useEffect(() => {
    if (getRuntimeCapabilities().workspace === 'remote') return
    if (getCurrentProjectConfig().lastGracefulShutdown !== false) {
      saveCurrentProjectConfig(current => ({
        ...current,
        lastGracefulShutdown: false,
      }))
    }
    const f = () => {
      if (hasConsoleBillingAccess()) {
        process.stdout.write('\n' + formatTotalCost() + '\n')
      }

      saveCurrentSessionCosts(getFpsMetrics?.())
    }
    process.on('exit', f)
    return () => {
      if (isShuttingDown()) saveCurrentSessionCosts(getFpsMetrics?.())
      process.off('exit', f)
    }
  }, [])
}
