import * as React from 'react'
import { useState } from 'react'
import { Text } from '../../ink.js'
import { stringWidth } from '../../ink/stringWidth.js'
import { logEvent } from '../../services/analytics/index.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { truncate } from '../../utils/format.js'
import { getAPIProvider } from '../../utils/model/providers.js'

const MAX_IMPRESSIONS = 5
const ON_OPUS_HEADLINE = 'Welcome to Opus 4.7 xhigh!'
const AVAILABLE_HEADLINE = 'Opus 4.7 xhigh is now available!'

export function shouldShowOpus47LaunchUpsell(): boolean {
  if (getAPIProvider() !== 'firstParty') return false
  const config = getGlobalConfig()
  if (config.unpinOpus47LaunchEffort) return false
  if ((config.opus47LaunchSeenCount ?? 0) >= MAX_IMPRESSIONS) return false
  return true
}

export function useShowOpus47LaunchUpsell(): boolean {
  const [show] = useState(shouldShowOpus47LaunchUpsell)
  return show
}

export function incrementOpus47LaunchSeenCount(): void {
  saveGlobalConfig(previous => ({
    ...previous,
    opus47LaunchSeenCount: (previous.opus47LaunchSeenCount ?? 0) + 1,
  }))
  logEvent('tengu_opus47_launch_shown', {})
}

export function Opus47LaunchUpsell({
  maxWidth,
  isOnOpus47,
}: {
  maxWidth?: number
  isOnOpus47: boolean
}): React.ReactNode {
  const headline = isOnOpus47 ? ON_OPUS_HEADLINE : AVAILABLE_HEADLINE
  const suffix = isOnOpus47
    ? ' · /effort to tune speed vs. intelligence'
    : ' · /model to switch'
  const headlineWidth = stringWidth(headline)

  if (maxWidth && maxWidth <= headlineWidth) {
    return (
      <Text color="claude" bold>
        {truncate(headline, maxWidth)}
      </Text>
    )
  }

  const visibleSuffix = maxWidth
    ? truncate(suffix, maxWidth - headlineWidth)
    : suffix
  return (
    <Text dimColor>
      <Text color="claude" bold>
        {headline}
      </Text>
      {visibleSuffix}
    </Text>
  )
}
