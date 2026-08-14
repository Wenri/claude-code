import React, { useEffect, useRef, useState } from 'react'
import { getSessionId } from '../bootstrap/state.js'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
import { stringWidth } from '../ink/stringWidth.js'
import { Box, Text } from '../ink.js'
import {
  getAllGrowthBookFeatures,
  getFeatureValue_CACHED_MAY_BE_STALE,
  getGrowthBookConfigOverrides,
  hasGrowthBookEnvOverride,
} from '../services/analytics/growthbook.js'
import { logEvent } from '../services/analytics/index.js'
import type { LogOption } from '../types/logs.js'
import {
  getGlobalConfig,
  saveGlobalConfig,
  type GlobalConfig,
} from '../utils/config.js'
import { env } from '../utils/env.js'
import { formatRelativeTimeAgo, truncateToWidth } from '../utils/format.js'
import { isTeammate } from '../utils/teammate.js'

const WARM_RESUME_GATE = 'tengu_ember_trail'
const MAX_STARTUPS = 30
const VARIANTS = ['0', '1', '3'] as const
type Variant = (typeof VARIANTS)[number]

type HintLog = Pick<
  LogOption,
  'sessionId' | 'modified' | 'firstPrompt' | 'customTitle' | 'summary'
>

type Hint = {
  last: HintLog
  variant: Variant
}

function getVariant(): Variant {
  const value = getFeatureValue_CACHED_MAY_BE_STALE<unknown>(
    WARM_RESUME_GATE,
    '0',
  )
  if (value === '2') return '1'
  return typeof value === 'string' && VARIANTS.includes(value as Variant)
    ? (value as Variant)
    : '0'
}

function isLaunchEligible(): boolean {
  if (process.argv.length > 2) return false
  if (
    process.env.CLAUDE_CODE_SESSION_KIND === 'bg' ||
    process.env.CLAUDE_CODE_SESSION_KIND === 'daemon' ||
    process.env.CLAUDE_CODE_SESSION_KIND === 'daemon-worker'
  ) {
    return false
  }
  if (isTeammate()) return false
  if (env.isCI) return false
  return true
}

function isConfigEligible(config: GlobalConfig): boolean {
  if (config.warmResumeHintShown) return false
  if (config.numStartups > MAX_STARTUPS) return false
  return isLaunchEligible()
}

function getLogTitle(log: HintLog): string {
  if (log.customTitle) return log.customTitle
  if (log.summary && log.summary !== 'No prompt') return log.summary
  return log.firstPrompt
}

function markWarmResumeHintShown(config: GlobalConfig): GlobalConfig {
  return config.warmResumeHintShown
    ? config
    : { ...config, warmResumeHintShown: true }
}

function isGateRegistered(): boolean {
  return (
    hasGrowthBookEnvOverride(WARM_RESUME_GATE) ||
    WARM_RESUME_GATE in getGrowthBookConfigOverrides() ||
    WARM_RESUME_GATE in getAllGrowthBookFeatures()
  )
}

function getHint(eligible: boolean): Hint | null {
  if (!eligible || !isGateRegistered()) return null
  const config = getGlobalConfig()
  const sessionId = config.lastHintSessionId
  const modified = config.lastSessionModified
  const firstPrompt = config.lastSessionFirstPrompt
  if (!sessionId || !modified || !firstPrompt || sessionId === getSessionId()) {
    return null
  }
  return {
    last: {
      sessionId,
      modified: new Date(modified),
      firstPrompt,
    },
    variant: getVariant(),
  }
}

export function WarmResumeHint(): React.ReactNode {
  const [hint] = useState<Hint | null>(() =>
    getHint(isConfigEligible(getGlobalConfig())),
  )
  const { columns } = useTerminalSize()
  const selected = useRef(false)

  useEffect(() => {
    if (!hint || selected.current) return
    selected.current = true
    logEvent('tengu_warm_resume_hint_eligible', {
      with_fork_session: hint.variant === '1',
    })
    saveGlobalConfig(markWarmResumeHintShown)
  }, [hint])

  if (!hint || hint.variant === '0') return null
  const { last, variant } = hint
  const relativeTime = formatRelativeTimeAgo(last.modified)
  const prefix = `last here ${relativeTime} · `
  const availableTitleWidth = (showFork: boolean): number =>
    columns -
    2 -
    stringWidth(prefix) -
    stringWidth(' · /resume to continue') -
    (showFork
      ? stringWidth(' · claude --resume --fork-session to branch')
      : 0)
  const showFork =
    variant === '1' && availableTitleWidth(true) >= 50
  const titleWidth = Math.min(availableTitleWidth(showFork), 50)
  const title =
    titleWidth >= 12 ? truncateToWidth(getLogTitle(last), titleWidth) : null

  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Text dimColor>
        last here {relativeTime}
        {title !== null && ` · ${title}`} · <Text color="claude">/resume</Text>{' '}
        to continue
        {showFork && (
          <>
            {' · '}
            <Text color="claude">claude --resume --fork-session</Text> to branch
          </>
        )}
      </Text>
    </Box>
  )
}
