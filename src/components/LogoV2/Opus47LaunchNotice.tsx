import * as React from 'react'
import { useState } from 'react'
import { Text } from '../../ink.js'
import { stringWidth } from '../../ink/stringWidth.js'
import { truncate } from '../../utils/format.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { logEvent } from '../../services/analytics/index.js'
import { getAPIProvider } from '../../utils/model/providers.js'

const MAX_SEEN_COUNT = 5
const ON_OPUS_COPY = 'Welcome to Opus 4.7 xhigh!'
const AVAILABLE_COPY = 'Opus 4.7 xhigh is now available!'

export function shouldShowOpus47LaunchNotice(): boolean {
  if (getAPIProvider() !== 'firstParty') return false
  const config = getGlobalConfig()
  if (config.unpinOpus47LaunchEffort) return false
  return (config.opus47LaunchSeenCount ?? 0) < MAX_SEEN_COUNT
}

export function useShowOpus47LaunchNotice(): boolean {
  const [show] = useState(shouldShowOpus47LaunchNotice)
  return show
}

export function incrementOpus47LaunchSeenCount(): void {
  saveGlobalConfig(config => ({
    ...config,
    opus47LaunchSeenCount: (config.opus47LaunchSeenCount ?? 0) + 1,
  }))
  logEvent('tengu_opus47_launch_shown', {})
}

export function Opus47LaunchNotice({
  isOnOpus47,
  maxWidth,
}: {
  isOnOpus47: boolean
  maxWidth?: number
}): React.ReactNode {
  const headline = isOnOpus47 ? ON_OPUS_COPY : AVAILABLE_COPY
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

  return (
    <Text dimColor>
      <Text color="claude" bold>
        {headline}
      </Text>
      {maxWidth ? truncate(suffix, maxWidth - headlineWidth) : suffix}
    </Text>
  )
}
