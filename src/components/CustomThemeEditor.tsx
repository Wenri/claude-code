import { sep } from 'path'
import React, { useEffect, useMemo, useState } from 'react'
import { Box, Text, useCustomThemes, useTheme } from '../ink.js'
import {
  getUserThemesDir,
  saveCustomTheme,
  slugifyThemeName,
  toCustomThemeSetting,
} from '../utils/customThemes.js'
import { logForDebugging } from '../utils/debug.js'
import {
  getTheme,
  isValidThemeColor,
  type CustomTheme,
  type Theme,
  type ThemeName,
} from '../utils/theme.js'
import TextInput from './TextInput.js'
import { Byline } from './design-system/Byline.js'
import { FuzzyPicker } from './design-system/FuzzyPicker.js'
import { KeyboardShortcutHint } from './design-system/KeyboardShortcutHint.js'
import { Pane } from './design-system/Pane.js'

type Props = {
  initial?: CustomTheme
  defaultBase: ThemeName
  onDone: (theme: CustomTheme) => void
  onCancel: () => void
}

function withoutOverride(
  overrides: Partial<Theme>,
  key: keyof Theme,
): Partial<Theme> {
  const next = { ...overrides }
  delete next[key]
  return next
}

function uniqueThemeSlug(name: string, themes: CustomTheme[]): string {
  const root = slugifyThemeName(name)
  if (!themes.some(theme => theme.slug === root)) return root
  for (let suffix = 2; ; suffix++) {
    const candidate = `${root}-${suffix}`
    if (!themes.some(theme => theme.slug === candidate)) return candidate
  }
}

function ColorSwatch({ value }: { value: string }): React.ReactNode {
  return <Text color={value}>■■</Text>
}

/** Create, edit, or fork a user custom theme with live color previews. */
export function CustomThemeEditor({
  initial,
  defaultBase,
  onDone,
  onCancel,
}: Props): React.ReactNode {
  const [, setTheme] = useTheme()
  const { customThemes, reloadCustomThemes, setPreviewOverrides } =
    useCustomThemes()
  const isPluginFork = initial !== undefined && initial.source !== 'user'
  const [pane, setPane] = useState<'name' | 'colors'>(
    initial && !isPluginFork ? 'colors' : 'name',
  )
  const [name, setName] = useState(initial?.name ?? '')
  const [nameCursor, setNameCursor] = useState(name.length)
  const [savedSlug, setSavedSlug] = useState(
    isPluginFork ? '' : (initial?.slug ?? ''),
  )
  const [base] = useState<ThemeName>(() => initial?.base ?? defaultBase)
  const baseTheme = useMemo(() => getTheme(base), [base])
  const colorKeys = useMemo(
    () => (Object.keys(baseTheme) as (keyof Theme)[]).sort(),
    [baseTheme],
  )
  const [overrides, setOverrides] = useState<Partial<Theme>>(
    initial?.overrides ?? {},
  )
  const [query, setQuery] = useState('')
  const [selectedColor, setSelectedColor] = useState<keyof Theme | null>(null)
  const [colorValue, setColorValue] = useState('')
  const [colorCursor, setColorCursor] = useState(0)

  const filteredKeys = useMemo(() => {
    const normalized = query.toLowerCase()
    return normalized
      ? colorKeys.filter(key => key.toLowerCase().includes(normalized))
      : colorKeys
  }, [colorKeys, query])
  const slug = savedSlug || uniqueThemeSlug(name, customThemes)
  const customizedCount = Object.keys(overrides).length

  useEffect(
    () => () => {
      setPreviewOverrides(null)
    },
    [setPreviewOverrides],
  )

  const currentValue = (key: keyof Theme): string =>
    overrides[key] ?? baseTheme[key]

  const persistOverrides = (
    nextSlug: string,
    nextOverrides: Partial<Theme>,
  ): void => {
    setOverrides(nextOverrides)
    setPreviewOverrides(nextOverrides)
    void saveCustomTheme({
      slug: nextSlug,
      name: name.trim(),
      base,
      overrides: nextOverrides,
      source: 'user',
    }).catch(error => {
      logForDebugging(`[theme] save ${nextSlug} failed: ${error}`, {
        level: 'warn',
      })
    })
  }

  const beginEditingColor = (key: keyof Theme): void => {
    const value = currentValue(key)
    setColorValue(value)
    setColorCursor(value.length)
    setSelectedColor(key)
  }

  const submitColor = (): void => {
    if (selectedColor === null || !isValidThemeColor(colorValue)) return
    persistOverrides(
      savedSlug,
      colorValue === baseTheme[selectedColor]
        ? withoutOverride(overrides, selectedColor)
        : { ...overrides, [selectedColor]: colorValue },
    )
    setSelectedColor(null)
  }

  const cancelColorEdit = (): void => {
    setPreviewOverrides(overrides)
    setSelectedColor(null)
  }

  const resetColor = (key: keyof Theme): void => {
    if (!(key in overrides)) return
    persistOverrides(savedSlug, withoutOverride(overrides, key))
  }

  const changeColorValue = (value: string): void => {
    setColorValue(value)
    if (selectedColor && isValidThemeColor(value)) {
      setPreviewOverrides({ ...overrides, [selectedColor]: value })
    }
  }

  if (pane === 'name') {
    const trimmedName = name.trim()
    const canContinue = trimmedName.length > 0
    const title = isPluginFork && initial
      ? `Fork ${initial.name} to your themes`
      : 'New custom theme'
    const continueToColors = (): void => {
      if (!canContinue) return
      setSavedSlug(slug)
      setName(trimmedName)
      setPane('colors')
      void saveCustomTheme({
        slug,
        name: trimmedName,
        base,
        overrides,
        source: 'user',
      })
        .then(() => {
          reloadCustomThemes()
          setTheme(toCustomThemeSetting(slug))
        })
        .catch(error => {
          logForDebugging(`[theme] save ${slug} failed: ${error}`, {
            level: 'warn',
          })
        })
    }

    return (
      <Pane color="permission">
        <Box flexDirection="column" gap={1}>
          <Text bold color="permission">{title}</Text>
          <Box flexDirection="column">
            <Box>
              <Text>Name: </Text>
              <TextInput
                value={name}
                onChange={setName}
                onSubmit={continueToColors}
                onExit={onCancel}
                placeholder="my-theme"
                columns={40}
                cursorOffset={nameCursor}
                onChangeCursorOffset={setNameCursor}
                disableCursorMovementForUpDownKeys
                disableEscapeDoublePress
                focus
                showCursor
              />
            </Box>
            <Text dimColor>
              based on {base} · saved to {getUserThemesDir()}{sep}{slug}.json
            </Text>
          </Box>
          <Text dimColor>
            <Byline>
              {canContinue && (
                <KeyboardShortcutHint shortcut="Enter" action="continue" />
              )}
              <KeyboardShortcutHint shortcut="Esc" action="cancel" />
            </Byline>
          </Text>
        </Box>
      </Pane>
    )
  }

  if (selectedColor !== null) {
    const valid = isValidThemeColor(colorValue)
    const displayedValue = valid ? colorValue : baseTheme[selectedColor]
    return (
      <Pane color="permission">
        <Box flexDirection="column" gap={1}>
          <Text bold color="permission">{name}</Text>
          <Box flexDirection="column">
            <Box>
              <ColorSwatch value={displayedValue} /> <Text bold>{selectedColor}</Text>
            </Box>
            <Text dimColor>preset: {baseTheme[selectedColor]}</Text>
          </Box>
          <Box>
            <Text>Value: </Text>
            <TextInput
              value={colorValue}
              onChange={changeColorValue}
              onSubmit={submitColor}
              onExit={cancelColorEdit}
              placeholder="rgb(r,g,b) · #rrggbb · ansi:red"
              columns={40}
              cursorOffset={colorCursor}
              onChangeCursorOffset={setColorCursor}
              disableCursorMovementForUpDownKeys
              disableEscapeDoublePress
              focus
              showCursor
            />
          </Box>
          <Text dimColor>
            {valid ? (
              <Byline>
                <KeyboardShortcutHint shortcut="Enter" action="save" />
                <KeyboardShortcutHint shortcut="Esc" action="cancel" />
              </Byline>
            ) : (
              'Accepts rgb(r,g,b), #rrggbb, ansi256(n), or ansi:name'
            )}
          </Text>
        </Box>
      </Pane>
    )
  }

  const done = (): void => {
    setPreviewOverrides(null)
    onDone({
      slug: savedSlug,
      name,
      base,
      overrides,
      source: 'user',
    })
  }
  const matchLabel =
    customizedCount > 0
      ? `${customizedCount} ${customizedCount === 1 ? 'color' : 'colors'} customized · ${savedSlug}.json`
      : `editing ${savedSlug}.json`

  return (
    <FuzzyPicker
      title={`${name} · based on ${base}`}
      placeholder="Filter color tokens…"
      items={filteredKeys}
      getKey={key => key}
      initialQuery={query}
      onQueryChange={setQuery}
      onSelect={beginEditingColor}
      onTab={{ action: 'reset', handler: resetColor }}
      onCancel={done}
      selectAction="edit"
      cancelAction="done"
      matchLabel={matchLabel}
      renderItem={(key, focused) => (
        <Box>
          <ColorSwatch value={currentValue(key)} />{' '}
          <Text color={focused ? 'suggestion' : undefined}>{key}</Text>
          {overrides[key] !== undefined && <Text> custom</Text>}
        </Box>
      )}
      renderPreview={key => (
        <Box flexDirection="column">
          <Text>
            current: <ColorSwatch value={currentValue(key)} /> {currentValue(key)}
          </Text>
          {overrides[key] !== undefined && (
            <Text dimColor>
              preset: <ColorSwatch value={baseTheme[key]} /> {baseTheme[key]}
            </Text>
          )}
        </Box>
      )}
      emptyMessage={search => `No color named "${search}"`}
    />
  )
}
