/**
 * MDM (Mobile Device Management) profile enforcement for Claude Code managed settings.
 *
 * Reads enterprise settings from OS-level MDM configuration:
 * - macOS: `com.anthropic.claudecode` preference domain
 *   (MDM profiles at /Library/Managed Preferences/ only — not user-writable ~/Library/Preferences/)
 * - Windows: `HKLM\SOFTWARE\Policies\ClaudeCode` (admin-only)
 *   and `HKCU\SOFTWARE\Policies\ClaudeCode` (user-writable, lowest priority)
 * - Linux: No MDM equivalent (uses /etc/claude-code/managed-settings.json instead)
 *
 * Policy settings use "first source wins" — the highest-priority source that exists
 * provides all policy settings. Priority (highest to lowest):
 *   remote → HKLM/plist → managed-settings.json → HKCU
 *
 * Architecture:
 *   constants.ts — shared constants and plist path builder (zero heavy imports)
 *   rawRead.ts   — subprocess I/O only (zero heavy imports, fires at main.tsx evaluation)
 *   settings.ts  — parsing, caching, first-source-wins logic (this file)
 */

import { join } from 'path'
import { logForDebugging } from '../../debug.js'
import { logForDiagnosticsNoPII } from '../../diagLogs.js'
import { readFileSync } from '../../fileRead.js'
import { getFsImplementation } from '../../fsOperations.js'
import { safeParseJSON } from '../../json.js'
import { profileCheckpoint } from '../../startupProfiler.js'
import {
  getManagedFilePath,
} from '../managedPath.js'
import { type SettingsJson, SettingsSchema } from '../types.js'
import {
  filterInvalidPermissionRules,
  formatZodError,
  type ValidationError,
} from '../validation.js'
import {
  WINDOWS_REGISTRY_KEY_PATH_HKCU,
  WINDOWS_REGISTRY_KEY_PATH_HKLM,
  WINDOWS_REGISTRY_VALUE_NAME,
  WSL_WINDOWS_MANAGED_SETTINGS_PATH,
} from './constants.js'
import {
  fireRawRead,
  getMdmRawReadPromise,
  type RawReadResult,
} from './rawRead.js'

// ---------------------------------------------------------------------------
// Types and cache
// ---------------------------------------------------------------------------

type MdmResult = { settings: SettingsJson; errors: ValidationError[] }
const EMPTY_RESULT: MdmResult = Object.freeze({ settings: {}, errors: [] })
let mdmCache: MdmResult | null = null
let hkcuCache: MdmResult | null = null
let wslInheritsCache = false
let mdmLoadPromise: Promise<void> | null = null

// ---------------------------------------------------------------------------
// Startup load — fires early, awaited before first settings read
// ---------------------------------------------------------------------------

/**
 * Kick off async MDM/HKCU reads. Call this as early as possible in
 * startup so the subprocess runs in parallel with module loading.
 */
export function startMdmSettingsLoad(): void {
  if (mdmLoadPromise) return
  mdmLoadPromise = (async () => {
    profileCheckpoint('mdm_load_start')
    const startTime = Date.now()

    // Use the startup raw read if cli.tsx fired it, otherwise fire a fresh one.
    // Both paths produce the same RawReadResult; consumeRawReadResult parses it.
    const rawPromise = getMdmRawReadPromise() ?? fireRawRead()
    const { mdm, hkcu, wslInherits } = consumeRawReadResult(await rawPromise)
    mdmCache = mdm
    hkcuCache = hkcu
    wslInheritsCache = wslInherits
    profileCheckpoint('mdm_load_end')

    const duration = Date.now() - startTime
    logForDebugging(`MDM settings load completed in ${duration}ms`)
    if (Object.keys(mdm.settings).length > 0) {
      logForDebugging(
        `MDM settings found: ${Object.keys(mdm.settings).join(', ')}`,
      )
      try {
        logForDiagnosticsNoPII('info', 'mdm_settings_loaded', {
          duration_ms: duration,
          key_count: Object.keys(mdm.settings).length,
          error_count: mdm.errors.length,
        })
      } catch {
        // Diagnostic logging is best-effort
      }
    }
  })()
}

/**
 * Await the in-flight MDM load. Call this before the first settings read.
 * If startMdmSettingsLoad() was called early enough, this resolves immediately.
 */
export async function ensureMdmSettingsLoaded(): Promise<void> {
  if (!mdmLoadPromise) {
    startMdmSettingsLoad()
  }
  await mdmLoadPromise
}

// ---------------------------------------------------------------------------
// Sync cache readers — used by the settings pipeline (loadSettingsFromDisk)
// ---------------------------------------------------------------------------

/**
 * Read admin-controlled MDM settings from the session cache.
 *
 * Returns settings from admin-only sources:
 * - macOS: /Library/Managed Preferences/ (requires root)
 * - Windows: HKLM registry (requires admin)
 *
 * Does NOT include HKCU (user-writable) — use getHkcuSettings() for that.
 */
export function getMdmSettings(): MdmResult {
  return mdmCache ?? EMPTY_RESULT
}

/**
 * Read HKCU registry settings (user-writable, lowest policy priority).
 * Only relevant on Windows — returns empty on other platforms.
 */
export function getHkcuSettings(): MdmResult {
  return hkcuCache ?? EMPTY_RESULT
}

export function getWslInheritsWindowsSettings(): boolean {
  return wslInheritsCache
}

// ---------------------------------------------------------------------------
// Cache management
// ---------------------------------------------------------------------------

/**
 * Clear the MDM and HKCU settings caches, forcing a fresh read on next load.
 */
export function clearMdmSettingsCache(): void {
  mdmCache = null
  hkcuCache = null
  wslInheritsCache = false
  mdmLoadPromise = null
}

/**
 * Update the session caches directly. Used by the change detector poll.
 */
export function setMdmSettingsCache(
  mdm: MdmResult,
  hkcu: MdmResult,
  wslInherits = false,
): void {
  mdmCache = mdm
  hkcuCache = hkcu
  wslInheritsCache = wslInherits
}

// ---------------------------------------------------------------------------
// Refresh — fires a fresh raw read, parses, returns results.
// Used by the 30-minute poll in changeDetector.ts.
// ---------------------------------------------------------------------------

/**
 * Fire a fresh MDM subprocess read and parse the results.
 * Does NOT update the cache — caller decides whether to apply.
 */
export async function refreshMdmSettings(): Promise<{
  mdm: MdmResult
  hkcu: MdmResult
  wslInherits: boolean
}> {
  const raw = await fireRawRead()
  return consumeRawReadResult(raw)
}

// ---------------------------------------------------------------------------
// Parsing — converts raw subprocess output to validated MdmResult
// ---------------------------------------------------------------------------

/**
 * Parse JSON command output (plutil stdout or registry JSON value) into SettingsJson.
 * Filters invalid permission rules before schema validation so one bad rule
 * doesn't cause the entire MDM settings to be rejected.
 */
export function parseCommandOutputAsSettings(
  stdout: string,
  sourcePath: string,
): { settings: SettingsJson; errors: ValidationError[] } {
  const data = safeParseJSON(stdout, false)
  if (!data || typeof data !== 'object') {
    return { settings: {}, errors: [] }
  }

  const ruleWarnings = filterInvalidPermissionRules(data, sourcePath)
  const parseResult = SettingsSchema().safeParse(data)
  if (!parseResult.success) {
    const errors = formatZodError(parseResult.error, sourcePath)
    return { settings: {}, errors: [...ruleWarnings, ...errors] }
  }
  return { settings: parseResult.data, errors: ruleWarnings }
}

/**
 * Parse reg query stdout to extract a registry string value.
 * Matches both REG_SZ and REG_EXPAND_SZ, case-insensitive.
 *
 * Expected format:
 *     Settings    REG_SZ    {"json":"value"}
 */
export function parseRegQueryStdout(
  stdout: string,
  valueName = 'Settings',
): string | null {
  const lines = stdout.split(/\r?\n/)
  const escaped = valueName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`^\\s+${escaped}\\s+REG_(?:EXPAND_)?SZ\\s+(.*)$`, 'i')
  for (const line of lines) {
    const match = line.match(re)
    if (match && match[1]) {
      return match[1].trimEnd()
    }
  }
  return null
}

/**
 * Convert raw subprocess output into parsed MDM and HKCU results,
 * applying the first-source-wins policy.
 */
function consumeRawReadResult(raw: RawReadResult): {
  mdm: MdmResult
  hkcu: MdmResult
  wslInherits: boolean
} {
  // macOS: plist result (first source wins — already filtered in mdmRawRead)
  if (raw.plistStdouts && raw.plistStdouts.length > 0) {
    const { stdout, label } = raw.plistStdouts[0]!
    const result = parseCommandOutputAsSettings(stdout, label)
    const { wslInheritsWindowsSettings: _, ...settings } = result.settings
    if (Object.keys(settings).length > 0) {
      return { mdm: result, hkcu: EMPTY_RESULT, wslInherits: false }
    }
  }

  // Windows: HKLM result
  let hklm: MdmResult | null = null
  const accumulatedErrors: ValidationError[] = []
  if (raw.hklmStdout) {
    const jsonString = parseRegQueryStdout(raw.hklmStdout)
    if (jsonString) {
      hklm = parseCommandOutputAsSettings(
        jsonString,
        `Registry: ${WINDOWS_REGISTRY_KEY_PATH_HKLM}\\${WINDOWS_REGISTRY_VALUE_NAME}`,
      )
    }
  }
  if (hklm) accumulatedErrors.push(...hklm.errors)
  const emptyMdm =
    accumulatedErrors.length > 0
      ? { settings: {}, errors: accumulatedErrors }
      : EMPTY_RESULT

  const isWsl = isWslEnvironment()
  const wslInherits = isWsl
    ? hklm?.settings.wslInheritsWindowsSettings === true ||
      windowsManagedFilesEnableInheritance()
    : false
  if (isWsl && !wslInherits) {
    return { mdm: emptyMdm, hkcu: EMPTY_RESULT, wslInherits: false }
  }

  if (hklm) {
    const { wslInheritsWindowsSettings: _, ...settings } = hklm.settings
    if (Object.keys(settings).length > 0) {
      return { mdm: hklm, hkcu: EMPTY_RESULT, wslInherits }
    }
  }

  // No admin MDM — check managed-settings.json before using HKCU
  if (hasManagedSettingsFile(wslInherits)) {
    return { mdm: emptyMdm, hkcu: EMPTY_RESULT, wslInherits }
  }

  // Fall through to HKCU (already read in parallel)
  if (raw.hkcuStdout) {
    const jsonString = parseRegQueryStdout(raw.hkcuStdout)
    if (jsonString) {
      const result = parseCommandOutputAsSettings(
        jsonString,
        `Registry: ${WINDOWS_REGISTRY_KEY_PATH_HKCU}\\${WINDOWS_REGISTRY_VALUE_NAME}`,
      )
      if (!isWsl || result.settings.wslInheritsWindowsSettings === true) {
        const { wslInheritsWindowsSettings: _, ...settings } = result.settings
        return {
          mdm: emptyMdm,
          hkcu: { settings, errors: result.errors },
          wslInherits,
        }
      }
      if (result.errors.length > 0) {
        return {
          mdm: emptyMdm,
          hkcu: { settings: {}, errors: result.errors },
          wslInherits,
        }
      }
    }
  }

  return { mdm: emptyMdm, hkcu: EMPTY_RESULT, wslInherits }
}

function isWslEnvironment(): boolean {
  if (process.env.WSL_DISTRO_NAME) return true
  try {
    const version = require('fs')
      .readFileSync('/proc/version', 'utf8')
      .toLowerCase()
    return version.includes('microsoft') || version.includes('wsl')
  } catch {
    return false
  }
}

function windowsManagedFilesEnableInheritance(): boolean {
  const hasFlag = (path: string): boolean => {
    try {
      const data = safeParseJSON(readFileSync(path), false)
      return (
        !!data &&
        typeof data === 'object' &&
        'wslInheritsWindowsSettings' in data &&
        data.wslInheritsWindowsSettings === true
      )
    } catch {
      return false
    }
  }
  if (
    hasFlag(join(WSL_WINDOWS_MANAGED_SETTINGS_PATH, 'managed-settings.json'))
  ) {
    return true
  }
  try {
    const dir = join(WSL_WINDOWS_MANAGED_SETTINGS_PATH, 'managed-settings.d')
    for (const entry of getFsImplementation().readdirSync(dir)) {
      if (
        (entry.isFile() || entry.isSymbolicLink()) &&
        entry.name.endsWith('.json') &&
        !entry.name.startsWith('.') &&
        hasFlag(join(dir, entry.name))
      ) {
        return true
      }
    }
  } catch {
    // directory is optional
  }
  return false
}

/**
 * Check if file-based managed settings (managed-settings.json or any
 * managed-settings.d/*.json) exist and have content. Cheap sync check
 * used to skip HKCU when a higher-priority file-based source exists.
 */
function hasManagedSettingsFile(wslInherits: boolean): boolean {
  if (
    wslInherits &&
    hasManagedSettingsFileAt(WSL_WINDOWS_MANAGED_SETTINGS_PATH)
  ) {
    return true
  }
  return hasManagedSettingsFileAt(getManagedFilePath())
}

function hasManagedSettingsFileAt(root: string): boolean {
  try {
    const filePath = join(root, 'managed-settings.json')
    const content = readFileSync(filePath)
    const data = safeParseJSON(content, false)
    if (settingsObjectHasPolicyContent(data)) {
      return true
    }
  } catch {
    // fall through to drop-in check
  }
  try {
    const dropInDir = join(root, 'managed-settings.d')
    const entries = getFsImplementation().readdirSync(dropInDir)
    for (const d of entries) {
      if (
        !(d.isFile() || d.isSymbolicLink()) ||
        !d.name.endsWith('.json') ||
        d.name.startsWith('.')
      ) {
        continue
      }
      try {
        const content = readFileSync(join(dropInDir, d.name))
        const data = safeParseJSON(content, false)
        if (settingsObjectHasPolicyContent(data)) {
          return true
        }
      } catch {
        // skip unreadable/malformed file
      }
    }
  } catch {
    // drop-in dir doesn't exist
  }
  return false
}

function settingsObjectHasPolicyContent(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false
  const { wslInheritsWindowsSettings: _, ...settings } = data as Record<
    string,
    unknown
  >
  return Object.keys(settings).length > 0
}

export function getWslWindowsManagedSettingsFingerprint(): string {
  if (!isWslEnvironment() || !wslInheritsCache) return ''
  const chunks: string[] = []
  try {
    chunks.push(
      readFileSync(
        join(WSL_WINDOWS_MANAGED_SETTINGS_PATH, 'managed-settings.json'),
      ),
    )
  } catch {
    chunks.push('')
  }
  try {
    const dir = join(WSL_WINDOWS_MANAGED_SETTINGS_PATH, 'managed-settings.d')
    const entries = getFsImplementation()
      .readdirSync(dir)
      .filter(
        entry =>
          (entry.isFile() || entry.isSymbolicLink()) &&
          entry.name.endsWith('.json') &&
          !entry.name.startsWith('.'),
      )
      .map(entry => entry.name)
      .sort()
    for (const name of entries) {
      try {
        chunks.push(`${name}\0${readFileSync(join(dir, name))}`)
      } catch {
        chunks.push(`${name}\0`)
      }
    }
  } catch {
    // directory is optional
  }
  return chunks.join('\x01')
}
