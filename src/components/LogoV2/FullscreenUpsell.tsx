import * as React from 'react'
import { useState } from 'react'
import { logEvent } from '../../services/analytics/index.js'
import { getDynamicConfig_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { isFullscreenEnvEnabled } from '../../utils/fullscreen.js'
import { Box, Text } from '../../ink.js'
import { StatusIcon } from '../design-system/StatusIcon.js'

const MAX_FULLSCREEN_UPSELL_VIEWS = 3

function shouldShowFullscreenUpsell(): boolean {
  if (isEnvTruthy(process.env.CLAUDE_CODE_FORCE_FULLSCREEN_UPSELL)) return true
  if (isFullscreenEnvEnabled()) return false
  if (
    !getDynamicConfig_CACHED_MAY_BE_STALE(
      'tengu_ochre_hollow',
      false,
    )
  ) {
    return false
  }
  return (
    (getGlobalConfig().fullscreenUpsellSeenCount ?? 0) <
    MAX_FULLSCREEN_UPSELL_VIEWS
  )
}

export function useShowFullscreenUpsell(): boolean {
  const [show] = useState(shouldShowFullscreenUpsell)
  return show
}

export function incrementFullscreenUpsellSeenCount(): void {
  let seenCount = 0
  saveGlobalConfig(previous => {
    seenCount = (previous.fullscreenUpsellSeenCount ?? 0) + 1
    return { ...previous, fullscreenUpsellSeenCount: seenCount }
  })
  logEvent('tengu_fullscreen_upsell_shown', { seen_count: seenCount })
}

export function FullscreenUpsell(): React.ReactNode {
  return (
    <Box flexDirection="row">
      <Text color="claude">✻ </Text>
      <Text>
        <Text color="autoAccept">Try flicker-free rendering</Text>
        <Text dimColor={true}> · /tui fullscreen</Text>
      </Text>
    </Box>
  )
}

export function TuiSwitchNotice(): React.ReactNode {
  switch (process.env.CLAUDE_CODE_TUI_JUST_SWITCHED) {
    case 'fullscreen':
      return (
        <Box flexDirection="column">
          <Text>
            <StatusIcon status="success" withSpace={true} />
            <Text color="success">Using flicker-free rendering</Text>
            <Text dimColor={true}> · go back with /tui default</Text>
          </Text>
          <Text dimColor={true}>  · Click to move your cursor in the text input</Text>
          <Text dimColor={true}>  · Click to expand collapsed tool results</Text>
          <Text dimColor={true}>
            {'  '}· By default, text auto-copies when you select it (/config
            to change)
          </Text>
        </Box>
      )
    case 'default':
      return <Text dimColor={true}>Switched back to the classic renderer</Text>
    default:
      return null
  }
}
