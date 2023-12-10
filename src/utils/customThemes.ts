import chokidar from 'chokidar'
import { readFileSync, readdirSync, statSync } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import { basename, extname, join } from 'path'
import { logForDebugging } from './debug.js'
import { getClaudeConfigHomeDir } from './envUtils.js'
import { getErrnoCode, isENOENT } from './errors.js'
import {
  getTheme,
  isThemeName,
  isValidThemeColor,
  type CustomTheme,
  type CustomThemeSource,
  type Theme,
  type ThemeName,
} from './theme.js'

export const CUSTOM_THEME_PREFIX = 'custom:' as const
export const MAX_THEME_FILE_SIZE = 262_144

let pluginThemes: CustomTheme[] = []
const pluginThemeListeners = new Set<() => void>()

export const pluginThemeStore = {
  getSnapshot: (): CustomTheme[] => pluginThemes,
  subscribe(listener: () => void): () => void {
    pluginThemeListeners.add(listener)
    return () => pluginThemeListeners.delete(listener)
  },
}

export function registerPluginThemeBases(themes: CustomTheme[]): void {
  pluginThemes = themes
  for (const listener of pluginThemeListeners) listener()
}

export function getUserThemesDir(): string {
  return join(getClaudeConfigHomeDir(), 'themes')
}

export function toCustomThemeSetting(slug: string): `custom:${string}` {
  return `${CUSTOM_THEME_PREFIX}${slug}`
}

export function fromCustomThemeSetting(setting: string): string | null {
  return setting.startsWith(CUSTOM_THEME_PREFIX)
    ? setting.slice(CUSTOM_THEME_PREFIX.length)
    : null
}

function parseThemeJson(
  slug: string,
  raw: string,
  source: CustomThemeSource,
): CustomTheme | null {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    logForDebugging(`[theme] ${slug}.json: invalid JSON`, { level: 'warn' })
    return null
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return null
  }

  const value = json as Record<string, unknown>
  const base: ThemeName =
    typeof value.base === 'string' && isThemeName(value.base)
      ? value.base
      : 'dark'
  const baseTheme = getTheme(base)
  const overrides: Partial<Theme> = {}
  if (
    value.overrides &&
    typeof value.overrides === 'object' &&
    !Array.isArray(value.overrides)
  ) {
    for (const [key, color] of Object.entries(value.overrides)) {
      if (
        Object.prototype.hasOwnProperty.call(baseTheme, key) &&
        typeof color === 'string' &&
        isValidThemeColor(color)
      ) {
        overrides[key as keyof Theme] = color
      }
    }
  }
  return {
    slug,
    name: typeof value.name === 'string' ? value.name : slug,
    base,
    overrides,
    source,
  }
}

function readThemeFile(
  filePath: string,
  slug: string,
  source: CustomThemeSource,
): CustomTheme | null {
  let raw: string
  try {
    if (statSync(filePath).size > MAX_THEME_FILE_SIZE) {
      logForDebugging(`[theme] ${filePath} exceeds 256KB; skipping`, {
        level: 'warn',
      })
      return null
    }
    raw = readFileSync(filePath, 'utf8')
  } catch (error) {
    if (!isENOENT(error)) {
      logForDebugging(`[theme] failed to read ${filePath}`, { level: 'warn' })
    }
    return null
  }
  return parseThemeJson(slug, raw, source)
}

export function loadThemePath(
  themePath: string,
  source: CustomThemeSource,
  slugPrefix = '',
): CustomTheme[] {
  let entries: string[]
  try {
    entries = readdirSync(themePath)
  } catch (error) {
    if (getErrnoCode(error) === 'ENOTDIR') {
      const slug = `${slugPrefix}${basename(themePath, '.json')}`
      const theme = readThemeFile(themePath, slug, source)
      return theme ? [theme] : []
    }
    if (!isENOENT(error)) {
      logForDebugging(`[theme] readdir ${themePath} failed`, { level: 'warn' })
    }
    return []
  }

  const themes: CustomTheme[] = []
  for (const entry of entries) {
    if (extname(entry) !== '.json') continue
    const slug = `${slugPrefix}${basename(entry, '.json')}`
    const theme = readThemeFile(join(themePath, entry), slug, source)
    if (theme) themes.push(theme)
  }
  return themes
}

export function loadUserCustomThemes(): CustomTheme[] {
  return loadThemePath(getUserThemesDir(), 'user').sort((a, b) =>
    a.name.localeCompare(b.name),
  )
}

export async function saveCustomTheme(theme: CustomTheme): Promise<void> {
  const dir = getUserThemesDir()
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, `${theme.slug}.json`),
    `${JSON.stringify(
      { name: theme.name, base: theme.base, overrides: theme.overrides },
      null,
      2,
    )}\n`,
    'utf8',
  )
}

export function slugifyThemeName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'theme'
  )
}

export function watchUserThemes(onChange: () => void): () => void {
  const watcher = chokidar.watch(getUserThemesDir(), {
    persistent: true,
    ignoreInitial: true,
    depth: 0,
    ignorePermissionErrors: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  })
  watcher.on('add', onChange).on('change', onChange).on('unlink', onChange)
  return () => void watcher.close()
}
