/**
 * React hook for classifierApprovals store.
 * Split from classifierApprovals.ts so pure-state importers (permissions.ts,
 * toolExecution.ts, postCompactCleanup.ts) do not pull React into print.ts.
 */

import { useAppStateMaybeOutsideOfProvider } from '../state/AppState.js'

export function useIsClassifierChecking(toolUseID: string): boolean {
  return (
    useAppStateMaybeOutsideOfProvider(state =>
      state.classifierApprovals.checking.has(toolUseID),
    ) ?? false
  )
}
