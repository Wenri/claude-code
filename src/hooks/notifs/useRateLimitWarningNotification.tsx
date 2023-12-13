import { useEffect, useMemo, useRef, useState } from 'react'
import { useNotifications } from 'src/context/notifications.js'
import { Text } from 'src/ink.js'
import { logEvent } from 'src/services/analytics/index.js'
import {
  getRateLimitLeverHint,
  getRateLimitWarning,
  getUsingOverageText,
} from 'src/services/claudeAiLimits.js'
import { useClaudeAiLimits } from 'src/services/claudeAiLimitsHook.js'
import { useAppState } from 'src/state/AppState.js'
import { getSubscriptionType } from 'src/utils/auth.js'
import { hasClaudeAiBillingAccess } from 'src/utils/billing.js'
import { getIsRemoteMode } from '../../bootstrap/state.js'

export function useRateLimitWarningNotification(model: string): void {
  const { addNotification } = useNotifications()
  const claudeAiLimits = useClaudeAiLimits()
  const effortValue = useAppState(state => state.effortValue)
  const rateLimitWarning = useMemo(
    () => getRateLimitWarning(claudeAiLimits, model),
    [claudeAiLimits, model],
  )
  const leverHint = useMemo(
    () => getRateLimitLeverHint(claudeAiLimits, model, effortValue),
    [claudeAiLimits, effortValue, model],
  )
  const usingOverageText = useMemo(
    () => getUsingOverageText(claudeAiLimits),
    [claudeAiLimits],
  )
  const shownWarningRef = useRef<string | null>(null)
  const subscriptionType = getSubscriptionType()
  const hasBillingAccess = hasClaudeAiBillingAccess()
  const isTeamOrEnterprise =
    subscriptionType === 'team' || subscriptionType === 'enterprise'
  const [hasShownOverageNotification, setHasShownOverageNotification] =
    useState(false)

  useEffect(() => {
    if (getIsRemoteMode()) return
    if (
      claudeAiLimits.isUsingOverage &&
      !hasShownOverageNotification &&
      (!isTeamOrEnterprise || hasBillingAccess)
    ) {
      addNotification({
        key: 'limit-reached',
        text: usingOverageText,
        priority: 'immediate',
      })
      setHasShownOverageNotification(true)
    } else if (
      !claudeAiLimits.isUsingOverage &&
      hasShownOverageNotification
    ) {
      setHasShownOverageNotification(false)
    }
  }, [
    claudeAiLimits.isUsingOverage,
    usingOverageText,
    hasShownOverageNotification,
    addNotification,
    hasBillingAccess,
    isTeamOrEnterprise,
  ])

  useEffect(() => {
    if (getIsRemoteMode()) return
    if (
      rateLimitWarning &&
      rateLimitWarning !== shownWarningRef.current
    ) {
      shownWarningRef.current = rateLimitWarning
      addNotification({
        key: 'rate-limit-warning',
        jsx: (
          <Text>
            <Text color="warning">{rateLimitWarning}</Text>
            {leverHint && <Text dimColor> · {leverHint.text}</Text>}
          </Text>
        ),
        priority: 'high',
      })
      if (leverHint) {
        logEvent('tengu_rate_limit_lever_hint', { lever: leverHint.lever })
      }
    }
  }, [rateLimitWarning, leverHint, addNotification])
}
