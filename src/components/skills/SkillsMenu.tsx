import figures from 'figures'
import * as React from 'react'
import { useMemo, useState } from 'react'
import {
  type Command,
  type CommandBase,
  type CommandResultDisplay,
  getCommandName,
  type PromptCommand,
} from '../../commands.js'
import { useModalOrTerminalSize } from '../../context/modalContext.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import { Box, Text } from '../../ink.js'
import { getShortcutDisplay } from '../../keybindings/shortcutFormat.js'
import { useKeybindings } from '../../keybindings/useKeybinding.js'
import { estimateSkillFrontmatterTokens } from '../../skills/loadSkillsDir.js'
import { formatTokens } from '../../utils/format.js'
import {
  getSettingSourceName,
  type SettingSource,
} from '../../utils/settings/constants.js'
import { getSettingsForSource } from '../../utils/settings/settings.js'
import { plural } from '../../utils/stringUtils.js'
import { Dialog } from '../design-system/Dialog.js'

type SkillCommand = CommandBase & PromptCommand
type SkillOverride = 'on' | 'name-only' | 'user-invocable-only' | 'off'
type SkillSettings = {
  skillOverrides?: Record<string, SkillOverride>
}
type LockedOverride = {
  value: SkillOverride
  source: 'policy' | 'flag' | 'author' | 'plugin'
}
type Props = {
  onExit: (
    result?: string,
    options?: { display?: CommandResultDisplay; nextInput?: string },
  ) => void
  commands: Command[]
}

const SKILL_OVERRIDE_STYLES = {
  on: { glyph: figures.tick, label: 'on', color: 'success' },
  'name-only': { glyph: figures.bullet, label: 'name-only' },
  'user-invocable-only': {
    glyph: figures.circle,
    label: 'user-only',
    color: 'warning',
  },
  off: { glyph: figures.cross, label: 'off', color: 'error' },
} as const

function getSkillOverrides(
  source: SettingSource,
): Record<string, SkillOverride> | undefined {
  return (getSettingsForSource(source) as SkillSettings | null | undefined)
    ?.skillOverrides
}

function getLockedOverride(
  skill: SkillCommand,
  name: string,
): LockedOverride | undefined {
  const policyOverride = getSkillOverrides('policySettings')?.[name]
  if (policyOverride) {
    return { value: policyOverride, source: 'policy' }
  }
  const flagOverride = getSkillOverrides('flagSettings')?.[name]
  if (flagOverride) {
    return { value: flagOverride, source: 'flag' }
  }
  if (skill.disableModelInvocation) {
    return { value: 'user-invocable-only', source: 'author' }
  }
  if (skill.source === 'plugin') {
    return { value: 'on', source: 'plugin' }
  }
  return undefined
}

function getInheritedOverride(name: string): SkillOverride | undefined {
  return (
    getSkillOverrides('projectSettings')?.[name] ??
    getSkillOverrides('userSettings')?.[name]
  )
}

function getSkillSourceLabel(source: SkillCommand['source']): string {
  switch (source) {
    case 'mcp':
    case 'plugin':
      return source
    case 'bundled':
    case 'builtin':
      return 'built-in'
    default:
      return getSettingSourceName(source as SettingSource)
  }
}

function clamp(value: number, minimum?: number, maximum?: number): number {
  if (minimum !== undefined && value < minimum) return minimum
  if (maximum !== undefined && value > maximum) return maximum
  return value
}

export function SkillsMenu({ onExit, commands }: Props): React.ReactNode {
  const [sortByTokens, setSortByTokens] = useState(false)
  const skills = useMemo(() => {
    const filtered = commands.filter(
      (command): command is SkillCommand =>
        command.type === 'prompt' &&
        (command.loadedFrom === 'skills' ||
          command.loadedFrom === 'commands_DEPRECATED' ||
          command.loadedFrom === 'plugin' ||
          command.loadedFrom === 'mcp'),
    )
    if (sortByTokens) {
      const estimates = new Map(
        filtered.map(skill => [skill, estimateSkillFrontmatterTokens(skill)]),
      )
      return filtered.sort(
        (a, b) =>
          (estimates.get(b) ?? 0) - (estimates.get(a) ?? 0) ||
          getCommandName(a).localeCompare(getCommandName(b)),
      )
    }
    return filtered.sort(
      (a, b) =>
        String(a.source).localeCompare(String(b.source)) ||
        getCommandName(a).localeCompare(getCommandName(b)),
    )
  }, [commands, sortByTokens])
  const localOverrides = getSkillOverrides('localSettings') ?? {}
  const inheritedOverrides = useMemo(() => {
    const result = new Map<string, SkillOverride>()
    for (const skill of skills) {
      const override = getInheritedOverride(skill.name)
      if (override) result.set(skill.name, override)
    }
    return result
  }, [skills])
  const lockedOverrides = useMemo(() => {
    const result = new Map<SkillCommand, LockedOverride>()
    for (const skill of skills) {
      const override = getLockedOverride(skill, skill.name)
      if (override) result.set(skill, override)
    }
    return result
  }, [skills])
  const [overrides] = useState<Record<string, SkillOverride>>(() => {
    const result: Record<string, SkillOverride> = {}
    for (const skill of skills) {
      if (skill.name in result) continue
      result[skill.name] =
        lockedOverrides.get(skill)?.value ??
        localOverrides[skill.name] ??
        inheritedOverrides.get(skill.name) ??
        'on'
    }
    return result
  })
  const [selectedIndex, setSelectedIndex] = useState(0)
  const { rows } = useModalOrTerminalSize(useTerminalSize())
  const visibleCount = clamp(rows - 10, 4, skills.length)
  const windowStart = clamp(
    selectedIndex - visibleCount + 1,
    0,
    Math.max(0, skills.length - visibleCount),
  )
  const visibleSkills = skills.slice(
    windowStart,
    windowStart + visibleCount,
  )
  const hiddenAbove = windowStart
  const hiddenBelow = skills.length - (windowStart + visibleCount)

  const handleToggle = (): void => {
    return
  }
  const handleClose = (): void => {
    onExit('Skills dialog dismissed', { display: 'system' })
  }
  const handleUse = (): void => {
    const selectedSkill = skills[selectedIndex]
    if (!selectedSkill) {
      handleClose()
      return
    }
    const nextInput =
      selectedSkill.userInvocable !== false
        ? `/${selectedSkill.name} `
        : `use the ${selectedSkill.name} skill `
    onExit(undefined, { display: 'skip', nextInput })
  }

  const toggleShortcut = getShortcutDisplay(
    'select:accept',
    'Settings',
    'space',
  )
  const saveShortcut = getShortcutDisplay(
    'settings:close',
    'Settings',
    'enter',
  )
  const closeShortcut = getShortcutDisplay(
    'confirm:no',
    'Settings',
    'esc',
  )
  const sortShortcut = getShortcutDisplay(
    'settings:sortByTokens',
    'Settings',
    't',
  )
  void toggleShortcut
  void saveShortcut

  useKeybindings(
    {
      'select:previous': () =>
        setSelectedIndex(
          index => (index - 1 + skills.length) % skills.length,
        ),
      'select:next': () =>
        setSelectedIndex(index => (index + 1) % skills.length),
      'select:accept': handleToggle,
      'settings:close': handleUse,
      'settings:sortByTokens': () => {
        setSortByTokens(value => !value)
        setSelectedIndex(0)
      },
      'confirm:no': handleClose,
    },
    {
      context: 'Settings',
      isActive: skills.length > 0,
    },
  )

  if (skills.length === 0) {
    return (
      <Dialog
        title="Skills"
        subtitle="No skills found"
        onCancel={handleClose}
        hideInputGuide
      >
        <Text dimColor>
          Create skills in .claude/skills/ or ~/.claude/skills/
        </Text>
      </Dialog>
    )
  }

  return (
    <Dialog
      title="Skills"
      subtitle={`${skills.length} ${plural(skills.length, 'skill')}${sortByTokens ? ' · sorted by tokens' : ''} · ${saveShortcut} to use, ${sortShortcut} to sort, ${closeShortcut} to close`}
      onCancel={handleClose}
      hideInputGuide
    >
      <Box flexDirection="column">
        {hiddenAbove > 0 && (
          <Text dimColor>
            {'  '}
            {figures.arrowUp} {hiddenAbove} more above
          </Text>
        )}
        {visibleSkills.map((skill, visibleIndex) => {
          const actualIndex = windowStart + visibleIndex
          const locked = lockedOverrides.get(skill)
          const value = locked
            ? locked.value
            : (overrides[skill.name] ?? 'on')
          const style = SKILL_OVERRIDE_STYLES[value]
          const tokenDisplay = `~${formatTokens(
            estimateSkillFrontmatterTokens(skill),
          )} tok`
          const isSelected = actualIndex === selectedIndex
          return (
            <Box key={`${skill.name}-${skill.source}`}>
              <Text color={isSelected ? 'suggestion' : undefined}>
                {isSelected ? figures.pointer : ' '}
                {' '}
              </Text>
              {locked ? (
                <Text dimColor>{`🔒 ${style.label.padEnd(9)}`}</Text>
              ) : (
                <Text color={'color' in style ? style.color : undefined}>
                  {style.glyph} {style.label.padEnd(9)}
                </Text>
              )}
              <Text>{'  '}</Text>
              <Text color={isSelected ? 'suggestion' : undefined}>
                {skill.name}
              </Text>
              <Text dimColor>
                {' '}
                · {getSkillSourceLabel(skill.source)} · {tokenDisplay}
                {locked ? ` · locked by ${locked.source}` : ''}
              </Text>
            </Box>
          )
        })}
        {hiddenBelow > 0 && (
          <Text dimColor>
            {'  '}
            {figures.arrowDown} {hiddenBelow} more below
          </Text>
        )}
      </Box>
      {skills.some(skill => skill.source === 'plugin') && (
        <Box marginTop={1}>
          <Text dimColor>Plugin skills are managed via /plugin</Text>
        </Box>
      )}
    </Dialog>
  )
}
