import figures from 'figures'
import * as React from 'react'
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  type Command,
  type CommandBase,
  type CommandResultDisplay,
  getCommandName,
  type PromptCommand,
} from '../../commands.js'
import { useModalOrTerminalSize } from '../../context/modalContext.js'
import { useSearchInput } from '../../hooks/useSearchInput.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import type { KeyboardEvent } from '../../ink/events/keyboard-event.js'
import type { PasteEvent } from '../../ink/events/paste-event.js'
import { Box, Text, useTerminalFocus } from '../../ink.js'
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
import { SearchBox } from '../SearchBox.js'

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
  return Math.min(
    Math.max(value, minimum ?? -Infinity),
    maximum ?? Infinity,
  )
}

type SkillRowProps = {
  skill: SkillCommand
  lock: LockedOverride | undefined
  state: SkillOverride
}

function SkillRow({ skill, lock, state }: SkillRowProps): React.ReactNode {
  const isFocused = useSelectItemFocus()
  const style = SKILL_OVERRIDE_STYLES[state]
  const tokenDisplay = `~${formatTokens(
    estimateSkillFrontmatterTokens(skill),
  )} tok`
  const status = lock ? (
    <Text dimColor>{`🔒 ${style.label.padEnd(9)}`}</Text>
  ) : (
    <Text color={'color' in style ? style.color : undefined}>
      {style.glyph} {style.label.padEnd(9)}
    </Text>
  )
  const source = getSkillSourceLabel(skill.source)
  const lockedBy = lock ? ` · locked by ${lock.source}` : ''

  return (
    <Box>
      {status}
      <Text>{'  '}</Text>
      <Text color={isFocused ? 'suggestion' : undefined}>{skill.name}</Text>
      <Text dimColor>
        {' '}
        · {source} · {tokenDisplay}
        {lockedBy}
      </Text>
    </Box>
  )
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
  const localOverrides = useMemo(
    () => getSkillOverrides('localSettings') ?? {},
    [],
  )
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
  const [selectedSkill, setSelectedSkill] = useState<SkillCommand | undefined>(
    skills[0],
  )
  const isTerminalFocused = useTerminalFocus()
  const [isSearching, setIsSearching] = useState(false)
  const isSearchingRef = useRef(isSearching)
  const {
    query,
    setQuery,
    cursorOffset,
    handleKeyDown: handleSearchKeyDown,
    handlePaste: handleSearchPaste,
  } = useSearchInput({
    isActive: isSearching,
    onExit: () => {
      isSearchingRef.current = false
      setIsSearching(false)
    },
    passthroughCtrlKeys: ['c', 'd'],
    useLegacyInput: false,
  })
  const filteredSkills = useMemo(() => {
    if (!query) return skills
    const normalizedQuery = query.toLowerCase()
    return skills.filter(
      skill =>
        skill.name.toLowerCase().includes(normalizedQuery) ||
        (skill.description ?? '').toLowerCase().includes(normalizedQuery) ||
        getSkillSourceLabel(skill.source)
          .toLowerCase()
          .includes(normalizedQuery),
    )
  }, [skills, query])
  const selectedIndex = Math.max(0, filteredSkills.indexOf(selectedSkill!))
  const { rows } = useModalOrTerminalSize(useTerminalSize())
  const visibleCount = clamp(rows - 13, 4, filteredSkills.length)
  const windowStart = clamp(
    selectedIndex - visibleCount + 1,
    0,
    Math.max(0, filteredSkills.length - visibleCount),
  )
  const visibleSkills = filteredSkills.slice(
    windowStart,
    windowStart + visibleCount,
  )
  const hiddenAbove = windowStart
  const hiddenBelow = filteredSkills.length - (windowStart + visibleCount)

  const handleToggle = (): void => {
    return
  }
  const handleClose = (): void => {
    onExit('Skills dialog dismissed', { display: 'system' })
  }
  const handleUse = (): void => {
    if (!selectedSkill || !filteredSkills.includes(selectedSkill)) {
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
        setSelectedSkill(
          filteredSkills[
            (selectedIndex - 1 + filteredSkills.length) %
              filteredSkills.length
          ],
        ),
      'select:next': () =>
        setSelectedSkill(
          filteredSkills[(selectedIndex + 1) % filteredSkills.length],
        ),
      'select:accept': handleToggle,
      'settings:close': handleUse,
      'settings:sortByTokens': () => {
        setSortByTokens(value => !value)
      },
    },
    {
      context: 'Settings',
      isActive: !isSearching && filteredSkills.length > 0,
    },
  )
  useKeybindings(
    { 'confirm:no': handleClose },
    { context: 'Settings', isActive: !isSearching },
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent): void => {
      if (isSearchingRef.current) {
        handleSearchKeyDown(event)
        return
      }
      if (event.ctrl || event.meta) return
      if (event.name === 'backspace') {
        if (!query) return
        event.preventDefault()
        isSearchingRef.current = true
        setIsSearching(true)
        setQuery(query.slice(0, -1))
        return
      }
      if (event.name.length > 1 && event.name !== 'number') return
      if (event.key.length >= 1 && event.key !== ' ') {
        event.preventDefault()
        isSearchingRef.current = true
        setIsSearching(true)
        setQuery(event.key.startsWith('/') ? event.key.slice(1) : event.key)
      }
    },
    [handleSearchKeyDown, query, setQuery],
  )
  const handlePaste = useCallback(
    (event: PasteEvent): void => {
      if (isSearchingRef.current) {
        handleSearchPaste(event)
        return
      }
      const firstLine = event.text.split(/\r\n|\r|\n/, 2)[0] ?? ''
      if (!firstLine) return
      event.preventDefault()
      isSearchingRef.current = true
      setIsSearching(true)
      setQuery(firstLine.startsWith('/') ? firstLine.slice(1) : firstLine)
    },
    [handleSearchPaste, setQuery],
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

  const skillCount = query
    ? `${filteredSkills.length}/${skills.length} ${plural(skills.length, 'skill')}`
    : `${skills.length} ${plural(skills.length, 'skill')}`
  const inputGuide = isSearching
    ? 'type to filter · ↓/enter to select · esc to clear'
    : filteredSkills.length === 0
      ? `/ to search, ${closeShortcut} to cancel`
      : `${saveShortcut} to use, / to search, ${sortShortcut} to sort, ${closeShortcut} to close`

  return (
    <Dialog
      title="Skills"
      subtitle={`${skillCount}${sortByTokens ? ' · sorted by tokens' : ''} · ${inputGuide}`}
      onCancel={handleClose}
      isCancelActive={false}
      hideInputGuide
    >
      <Box
        flexDirection="column"
        tabIndex={0}
        autoFocus
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
      >
        <SearchBox
          query={query}
          isFocused={isSearching}
          isTerminalFocused={isTerminalFocused}
          cursorOffset={cursorOffset}
          placeholder="Search skills…"
        />
        {filteredSkills.length === 0 ? (
          <Box marginTop={1}>
            <Text>{`No skills match "${query}"`}</Text>
          </Box>
        ) : (
          <>
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
          return (
            <Select.Item key={`${skill.name}-${skill.source}`}>
              <SkillRow skill={skill} lock={locked} state={value} />
            </Select.Item>
          )
        })}
        {hiddenBelow > 0 && (
          <Text dimColor>
            {'  '}
            {figures.arrowDown} {hiddenBelow} more below
          </Text>
        )}
          </>
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
