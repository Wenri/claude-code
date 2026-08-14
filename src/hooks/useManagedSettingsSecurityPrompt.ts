import { useEffect, useState } from 'react'
import {
  setManagedSettingsSecurityPromptHandler,
  type SecurityCheckResult,
} from '../services/remoteManagedSettings/securityCheck.js'
import type { SettingsJson } from '../utils/settings/types.js'

type SecurityPromptResult = Exclude<SecurityCheckResult, 'no_check_needed'>

export type PendingManagedSettingsSecurityPrompt = {
  settings: SettingsJson
  resolve: (result: SecurityPromptResult) => void
}

export function useManagedSettingsSecurityPrompt(): PendingManagedSettingsSecurityPrompt | null {
  const [pending, setPending] =
    useState<PendingManagedSettingsSecurityPrompt | null>(null)

  useEffect(() => {
    setManagedSettingsSecurityPromptHandler(
      settings =>
        new Promise<SecurityPromptResult>(resolve => {
          setPending({
            settings,
            resolve: result => {
              setPending(null)
              resolve(result)
            },
          })
        }),
    )
    return () => setManagedSettingsSecurityPromptHandler(null)
  }, [])

  return pending
}
