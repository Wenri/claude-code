import figures from 'figures'
import React, { useEffect, useRef, useState } from 'react'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
import { stringWidth } from '../ink/stringWidth.js'
import { Box, Text } from '../ink.js'
import {
  getAllGrowthBookFeatures,
  getFeatureValue_CACHED_MAY_BE_STALE,
  getGrowthBookConfigOverrides,
  hasGrowthBookEnvOverride,
  initializeGrowthBook,
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
import {
  getRecentActivity,
  getRecentActivitySync,
} from '../utils/logoV2Utils.js'
import { listTasks, type Task, type TaskStatus } from '../utils/tasks.js'
import { isTeammate } from '../utils/teammate.js'

const WARM_RESUME_GATE = 'tengu_ember_trail'
const MAX_STARTUPS = 30
const MAX_TASKS = 3
const VARIANTS = ['0', '1', '2', '3'] as const
type Variant = (typeof VARIANTS)[number]

type Hint = {
  last: LogOption
  variant: Variant
}

function getVariant(): Variant {
  const value = getFeatureValue_CACHED_MAY_BE_STALE<unknown>(
    WARM_RESUME_GATE,
    '0',
  )
  return typeof value === 'string' && VARIANTS.includes(value as Variant)
    ? (value as Variant)
    : '0'
}

function isLaunchEligible(): boolean {
  if (process.argv.length > 2) return false
  if (isTeammate()) return false
  if (env.isCI) return false
  return true
}

function isConfigEligible(config: GlobalConfig): boolean {
  if (config.warmResumeHintShown) return false
  if (config.numStartups > MAX_STARTUPS) return false
  return isLaunchEligible()
}

function isEligibleLog(log: LogOption): boolean {
  return log.sessionKind === undefined && !log.isTeammate
}

function getLogTitle(log: LogOption): string {
  if (log.customTitle) return log.customTitle
  if (log.summary && log.summary !== 'No prompt') return log.summary
  return log.firstPrompt
}

function markWarmResumeHintShown(config: GlobalConfig): GlobalConfig {
  return config.warmResumeHintShown
    ? config
    : { ...config, warmResumeHintShown: true }
}

function taskDisplay(status: TaskStatus): {
  icon: string
  color?: 'success' | 'claude'
} {
  switch (status) {
    case 'completed':
      return { icon: figures.tick, color: 'success' }
    case 'in_progress':
      return { icon: figures.squareSmallFilled, color: 'claude' }
    case 'pending':
      return { icon: figures.squareSmall }
  }
}

function unfinishedTaskOrder(left: Task, right: Task): number {
  if (left.status !== right.status) {
    return left.status === 'in_progress' ? -1 : 1
  }
  return Number(left.id) - Number(right.id)
}

export function WarmResumeHint(): React.ReactNode {
  const [hint, setHint] = useState<Hint | null>(null)
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const { columns } = useTerminalSize()
  const selected = useRef(false)

  useEffect(() => {
    if (!isConfigEligible(getGlobalConfig()) || selected.current) return
    let cancelled = false
    void (async () => {
      await initializeGrowthBook().catch(() => null)
      if (cancelled || selected.current) return

      const gateRegistered =
        hasGrowthBookEnvOverride(WARM_RESUME_GATE) ||
        WARM_RESUME_GATE in getGrowthBookConfigOverrides() ||
        WARM_RESUME_GATE in getAllGrowthBookFeatures()
      if (!gateRegistered) return

      const last =
        getRecentActivitySync().find(isEligibleLog) ??
        (await getRecentActivity()).find(isEligibleLog)
      if (cancelled || selected.current || !last) return
      selected.current = true
      const variant = getVariant()
      setHint({ last, variant })
      logEvent('tengu_warm_resume_hint_eligible', {
        with_fork_session: variant === '1' || variant === '2',
        with_todos: variant === '2',
      })
      saveGlobalConfig(markWarmResumeHintShown)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (hint?.variant !== '2' || !hint.last.sessionId) return
    let cancelled = false
    void listTasks(hint.last.sessionId)
      .then(found => {
        if (cancelled) return
        setTasks(
          found
            .filter(task => task.status !== 'completed')
            .sort(unfinishedTaskOrder)
            .slice(0, MAX_TASKS),
        )
      })
      .catch(() => {
        if (!cancelled) setTasks([])
      })
    return () => {
      cancelled = true
    }
  }, [hint?.last.sessionId, hint?.variant])

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
    (variant === '1' || variant === '2') && availableTitleWidth(true) >= 50
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
      {variant === '2' && tasks && tasks.length > 0 && (
        <Box flexDirection="column" paddingLeft={2}>
          {tasks.map(task => {
            const { icon, color } = taskDisplay(task.status)
            return (
              <Text key={task.id} dimColor>
                <Text color={color}>{icon}</Text>{' '}
                {truncateToWidth(
                  task.subject,
                  Math.max(Math.min(columns - 8, 50), 12),
                )}
              </Text>
            )
          })}
        </Box>
      )}
    </Box>
  )
}
