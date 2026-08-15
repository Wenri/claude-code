import * as React from 'react'
import { useState } from 'react'
import { getRuntimeCapabilities } from '../../bootstrap/state.js'
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js'
import { Box, Text, useAnimationFrame, useInput } from '../../ink.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import { useAppState, useSetAppState } from '../../state/AppState.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import { saveGlobalConfig } from '../../utils/config.js'
import {
  type EffortLevel,
  type EffortValue,
  getDisplayedEffortLevel,
  getEffortEnvOverride,
  getEffortValueDescription,
  isEffortLevel,
  toPersistableEffort,
} from '../../utils/effort.js'
import { updateSettingsForSource } from '../../utils/settings/settings.js'
import { getRainbowColor } from '../../utils/thinking.js'
import { logError } from '../../utils/log.js'

const COMMON_HELP_ARGS = ['help', '-h', '--help']
export const HELP =
  'Usage: /effort [low|medium|high|xhigh|max|auto]\n\nEffort levels:\n- low: Quick, straightforward implementation\n- medium: Balanced approach with standard testing\n- high: Comprehensive implementation with extensive testing\n- xhigh: Extended reasoning with thorough analysis (Opus 4.7 only)\n- max: Maximum capability with deepest reasoning (Opus 4.6/4.7 only)\n- auto: Use the default effort level for your model'

type EffortCommandResult = {
  message: string
  effortUpdate?: { value: EffortValue | undefined }
}

function applyRemoteEffort(
  effortLevel: ReturnType<typeof toPersistableEffort>,
): string | null {
  const remote = getRuntimeCapabilities().remote
  if (!remote) return null
  if (remote.kind !== 'ccr' || remote.viewerOnly) {
    return ' (applied locally — this remote transport can’t change server effort)'
  }
  remote
    .sendControlRequest({
      subtype: 'apply_flag_settings',
      settings: { effortLevel: effortLevel ?? null },
    })
    .catch(logError)
  return null
}

function unpinLaunchEffort(): void {
  saveGlobalConfig(config =>
    config.unpinOpus47LaunchEffort
      ? config
      : { ...config, unpinOpus47LaunchEffort: true },
  )
}

function setEffortValue(effortValue: EffortValue): EffortCommandResult {
  const persistable = toPersistableEffort(effortValue)
  const remote = getRuntimeCapabilities().remote
  if (
    remote?.kind === 'ccr' &&
    !remote.viewerOnly &&
    persistable === undefined
  ) {
    return {
      message: `${effortValue} is session-scoped and won't reach the remote process. Use low, medium, high, or xhigh for remote sessions.`,
    }
  }
  const remoteSuffix = applyRemoteEffort(persistable)
  if (persistable !== undefined) {
    const result = updateSettingsForSource('userSettings', {
      effortLevel: persistable,
    })
    if (result.error) {
      return {
        message: `Failed to set effort level: ${result.error.message}`,
      }
    }
  }
  logEvent('tengu_effort_command', {
    effort:
      effortValue as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })
  unpinLaunchEffort()

  const envOverride = remote ? undefined : getEffortEnvOverride()
  if (envOverride !== undefined && envOverride !== effortValue) {
    const envRaw = process.env.CLAUDE_CODE_EFFORT_LEVEL
    if (persistable === undefined) {
      return {
        message: `Not applied: CLAUDE_CODE_EFFORT_LEVEL=${envRaw} overrides effort this session, and ${effortValue} is session-only (nothing saved)`,
        effortUpdate: { value: effortValue },
      }
    }
    return {
      message: `CLAUDE_CODE_EFFORT_LEVEL=${envRaw} overrides this session — clear it and ${effortValue} takes over`,
      effortUpdate: { value: effortValue },
    }
  }
  const description = getEffortValueDescription(effortValue)
  const suffix = persistable !== undefined ? '' : ' (this session only)'
  return {
    message: `Set effort level to ${effortValue}${suffix}: ${description}${remoteSuffix ?? ''}`,
    effortUpdate: { value: effortValue },
  }
}

export function showCurrentEffort(
  appStateEffort: EffortValue | undefined,
  model: string,
): EffortCommandResult {
  const envOverride = getRuntimeCapabilities().remote
    ? undefined
    : getEffortEnvOverride()
  const effectiveValue =
    envOverride === null ? undefined : (envOverride ?? appStateEffort)
  if (effectiveValue === undefined) {
    const level = getDisplayedEffortLevel(model, appStateEffort)
    return { message: `Effort level: auto (currently ${level})` }
  }
  const description = getEffortValueDescription(effectiveValue)
  return {
    message: `Current effort level: ${effectiveValue} (${description})`,
  }
}

function unsetEffortLevel(): EffortCommandResult {
  const remoteSuffix = applyRemoteEffort(undefined)
  const result = updateSettingsForSource('userSettings', {
    effortLevel: undefined,
  })
  if (result.error) {
    return { message: `Failed to set effort level: ${result.error.message}` }
  }
  logEvent('tengu_effort_command', {
    effort:
      'auto' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })
  unpinLaunchEffort()
  const envOverride = getRuntimeCapabilities().remote
    ? undefined
    : getEffortEnvOverride()
  if (envOverride !== undefined && envOverride !== null) {
    const envRaw = process.env.CLAUDE_CODE_EFFORT_LEVEL
    return {
      message: `Cleared effort from settings, but CLAUDE_CODE_EFFORT_LEVEL=${envRaw} still controls this session`,
      effortUpdate: { value: undefined },
    }
  }
  return {
    message: `Effort level set to max${remoteSuffix ?? ''}`,
    effortUpdate: { value: undefined },
  }
}

export function executeEffort(args: string): EffortCommandResult {
  const normalized = args.toLowerCase()
  if (normalized === 'auto' || normalized === 'unset') {
    return unsetEffortLevel()
  }
  if (!isEffortLevel(normalized)) {
    return {
      message: `Invalid argument: ${args}. Valid options are: low, medium, high, xhigh, max, auto`,
    }
  }
  return setEffortValue(normalized)
}

function ShowCurrentEffort({
  onDone,
}: {
  onDone: (result: string) => void
}): React.ReactNode {
  const effortValue = useAppState(state => state.effortValue)
  const model = useMainLoopModel()
  const { message } = showCurrentEffort(effortValue, model)
  onDone(message)
  return null
}

function ApplyEffortAndClose({
  result,
  onDone,
}: {
  result: EffortCommandResult
  onDone: (result: string) => void
}): React.ReactNode {
  const setAppState = useSetAppState()
  const { effortUpdate, message } = result
  React.useEffect(() => {
    if (effortUpdate) {
      setAppState(previous => ({
        ...previous,
        effortValue: effortUpdate.value,
      }))
    }
    onDone(message)
  }, [setAppState, effortUpdate, message, onDone])
  return null
}

const EFFORT_OPTIONS = [
  { value: 'low', color: 'warning' },
  { value: 'medium', color: 'success' },
  { value: 'high', color: 'permission' },
  { value: 'xhigh', color: 'autoAccept-shimmer' },
  { value: 'max', color: 'rainbow-animated' },
] as const
const DEFAULT_INDEX = 3
const SLIDER_WIDTH = 42
const POSITIONS = [1, 10, 20, 30, 40] as const
const LABEL_SPACING = [5, 5, 5, 6] as const
const XHIGH_COLOR = '#d0b4ff'

function EffortLabel({
  option,
  selected,
  time,
}: {
  option: (typeof EFFORT_OPTIONS)[number]
  selected: boolean
  time: number
}): React.ReactNode {
  if (!selected) return <Text dimColor>{option.value}</Text>
  if (option.value === 'max') {
    const phase = Math.floor(time / 100)
    return (
      <Text bold>
        {[...option.value].map((character, index) => (
          <Text key={index} color={getRainbowColor(index + phase)}>
            {character}
          </Text>
        ))}
      </Text>
    )
  }
  if (option.value === 'xhigh') {
    const phase = Math.floor(time / 100) % (option.value.length + 4)
    return (
      <Text>
        {[...option.value].map((character, index) => {
          const active = index === phase
          const neighbor = index === phase - 1 || index === phase + 1
          return (
            <Text
              key={index}
              bold={active || neighbor}
              color={active ? XHIGH_COLOR : 'autoAccept'}
            >
              {character}
            </Text>
          )
        })}
      </Text>
    )
  }
  return (
    <Text bold color={option.color}>
      {option.value}
    </Text>
  )
}

function EffortSlider({
  onDone,
}: {
  onDone: (result: string) => void
}): React.ReactNode {
  const effortValue = useAppState(state => state.effortValue)
  const initialIndex = EFFORT_OPTIONS.findIndex(
    option => option.value === effortValue,
  )
  const [selectedIndex, setSelectedIndex] = useState(
    initialIndex < 0 ? DEFAULT_INDEX : initialIndex,
  )
  const setAppState = useSetAppState()
  const [animationRef, time] = useAnimationFrame(100)

  useInput((input, key) => {
    if (key.leftArrow) {
      setSelectedIndex(index => Math.max(0, index - 1))
      return
    }
    if (key.rightArrow) {
      setSelectedIndex(index => Math.min(EFFORT_OPTIONS.length - 1, index + 1))
      return
    }
    if (key.return) {
      const result = executeEffort(EFFORT_OPTIONS[selectedIndex]!.value)
      if (result.effortUpdate) {
        setAppState(previous => ({
          ...previous,
          effortValue: result.effortUpdate!.value,
        }))
      }
      onDone(result.message)
      return
    }
    if (key.escape || (key.ctrl && (input === 'c' || input === 'd'))) {
      onDone('Cancelled')
    }
  })

  const position = POSITIONS[selectedIndex]!
  return (
    <Box ref={animationRef} flexDirection="column">
      <Box height={1} />
      <Text>
        Speed{' '.repeat(SLIDER_WIDTH - 5 - 12)}Intelligence
      </Text>
      <Box>
        <Text dimColor>{'─'.repeat(position)}</Text>
        <Text bold>▲</Text>
        <Text dimColor>{'─'.repeat(SLIDER_WIDTH - position - 1)}</Text>
      </Box>
      <Box justifyContent="center" width="100%">
        {EFFORT_OPTIONS.map((option, index) => (
          <React.Fragment key={option.value}>
            <EffortLabel
              option={option}
              selected={index === selectedIndex}
              time={time}
            />
            {index < LABEL_SPACING.length && (
              <Text>{' '.repeat(LABEL_SPACING[index]!)}</Text>
            )}
          </React.Fragment>
        ))}
      </Box>
      <Box height={2} />
      <Text dimColor>←/→ to change effort · Enter to confirm</Text>
    </Box>
  )
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: unknown,
  args?: string,
): Promise<React.ReactNode> {
  args = args?.trim() || ''
  if (COMMON_HELP_ARGS.includes(args)) {
    onDone(HELP)
    return
  }
  if (!args) return <EffortSlider onDone={onDone} />
  if (args === 'current' || args === 'status') {
    return <ShowCurrentEffort onDone={onDone} />
  }
  return <ApplyEffortAndClose result={executeEffort(args)} onDone={onDone} />
}
