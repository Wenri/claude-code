/**
 * User keybinding configuration loader with hot-reload support.
 *
 * Loads keybindings from ~/.claude/keybindings.json and watches
 * for changes to reload them automatically.
 *
 * NOTE: User keybinding customization is currently only available for
 * Anthropic employees (USER_TYPE === 'ant'). External users always
 * use the default bindings.
 */

import chokidar, { type FSWatcher } from 'chokidar'
import { readFileSync } from 'fs'
import { readFile, stat } from 'fs/promises'
import { dirname, join } from 'path'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { logEvent } from '../services/analytics/index.js'
import { registerCleanup } from '../utils/cleanupRegistry.js'
import { logForDebugging } from '../utils/debug.js'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import { errorMessage, isENOENT } from '../utils/errors.js'
import { createSignal } from '../utils/signal.js'
import { jsonParse } from '../utils/slowOperations.js'
import { DEFAULT_BINDINGS } from './defaultBindings.js'
import { parseBindings } from './parser.js'
import { KeybindingBlockSchema } from './schema.js'
import type { KeybindingBlock, ParsedBinding } from './types.js'
import {
  checkDuplicateKeysInJson,
  type KeybindingWarning,
  validateBindings,
} from './validate.js'

/**
 * Check if keybinding customization is enabled.
 *
 * Returns true if the tengu_keybinding_customization_release GrowthBook gate is enabled.
 *
 * This function is exported so other parts of the codebase (e.g., /doctor)
 * can check the same condition consistently.
 */
export function isKeybindingCustomizationEnabled(): boolean {
  return getFeatureValue_CACHED_MAY_BE_STALE(
    'tengu_keybinding_customization_release',
    true,
  )
}

/**
 * Time in milliseconds to wait for file writes to stabilize.
 */
const FILE_STABILITY_THRESHOLD_MS = 500

/**
 * Polling interval for checking file stability.
 */
const FILE_STABILITY_POLL_INTERVAL_MS = 200

/**
 * Result of loading keybindings, including any validation warnings.
 */
export type KeybindingsLoadResult = {
  bindings: ParsedBinding[]
  warnings: KeybindingWarning[]
}

type KeybindingLoaderState = {
  bindings: ParsedBinding[] | null
  warnings: KeybindingWarning[]
  watcher: FSWatcher | null
  initialized: boolean
  disposed: boolean
  lastCustomBindingsLogDate: string | null
  changed: ReturnType<
    typeof createSignal<[result: KeybindingsLoadResult]>
  >
}

function createKeybindingLoaderState(): KeybindingLoaderState {
  return {
    bindings: null,
    warnings: [],
    watcher: null,
    initialized: false,
    disposed: false,
    lastCustomBindingsLogDate: null,
    changed: createSignal<[result: KeybindingsLoadResult]>(),
  }
}

const keybindingLoaderState = createKeybindingLoaderState()

/**
 * Tracks the date (YYYY-MM-DD) when we last logged a custom keybindings load event.
 * Used to ensure we fire the event at most once per day.
 */
/**
 * Log a telemetry event when custom keybindings are loaded, at most once per day.
 * This lets us estimate the percentage of users who customize their keybindings.
 */
function logCustomBindingsLoadedOncePerDay(
  state: KeybindingLoaderState,
  userBindingCount: number,
): void {
  const today = new Date().toISOString().slice(0, 10)
  if (state.lastCustomBindingsLogDate === today) return
  state.lastCustomBindingsLogDate = today
  logEvent('tengu_custom_keybindings_loaded', {
    user_binding_count: userBindingCount,
  })
}

/**
 * Type guard to check if an object is a valid KeybindingBlock.
 */
function isKeybindingBlock(obj: unknown): obj is KeybindingBlock {
  return KeybindingBlockSchema().safeParse(obj).success
}

/**
 * Type guard to check if an array contains only valid KeybindingBlocks.
 */
function isKeybindingBlockArray(arr: unknown): arr is KeybindingBlock[] {
  return Array.isArray(arr) && arr.every(isKeybindingBlock)
}

/**
 * Get the path to the user keybindings file.
 */
export function getKeybindingsPath(): string {
  return join(getClaudeConfigHomeDir(), 'keybindings.json')
}

/**
 * Parse default bindings (cached for performance).
 */
function getDefaultParsedBindings(): ParsedBinding[] {
  return parseBindings(DEFAULT_BINDINGS)
}

/**
 * Load and parse keybindings from user config file.
 * Returns merged default + user bindings along with validation warnings.
 *
 * For external users, always returns default bindings only.
 * User customization is currently gated to Anthropic employees.
 */
export async function loadKeybindings(
  state: KeybindingLoaderState = keybindingLoaderState,
): Promise<KeybindingsLoadResult> {
  const defaultBindings = getDefaultParsedBindings()

  // Skip user config loading for external users
  if (!isKeybindingCustomizationEnabled()) {
    return { bindings: defaultBindings, warnings: [] }
  }

  const userPath = getKeybindingsPath()

  try {
    const content = await readFile(userPath, 'utf-8')
    const parsed: unknown = jsonParse(content)

    // Extract bindings array from object wrapper format: { "bindings": [...] }
    let userBlocks: unknown
    if (typeof parsed === 'object' && parsed !== null && 'bindings' in parsed) {
      userBlocks = (parsed as { bindings: unknown }).bindings
    } else {
      // Invalid format - missing bindings property
      const errorMessage = 'keybindings.json must have a "bindings" array'
      const suggestion = 'Use format: { "bindings": [ ... ] }'
      logForDebugging(`[keybindings] Invalid keybindings.json: ${errorMessage}`)
      return {
        bindings: defaultBindings,
        warnings: [
          {
            type: 'parse_error',
            severity: 'error',
            message: errorMessage,
            suggestion,
          },
        ],
      }
    }

    // Validate structure - bindings must be an array of valid keybinding blocks
    if (!isKeybindingBlockArray(userBlocks)) {
      const errorMessage = !Array.isArray(userBlocks)
        ? '"bindings" must be an array'
        : 'keybindings.json contains invalid block structure'
      const suggestion = !Array.isArray(userBlocks)
        ? 'Set "bindings" to an array of keybinding blocks'
        : 'Each block must have "context" (string) and "bindings" (object mapping keys to a string action or null)'
      logForDebugging(`[keybindings] Invalid keybindings.json: ${errorMessage}`)
      return {
        bindings: defaultBindings,
        warnings: [
          {
            type: 'parse_error',
            severity: 'error',
            message: errorMessage,
            suggestion,
          },
        ],
      }
    }

    const userParsed = parseBindings(userBlocks)
    logForDebugging(
      `[keybindings] Loaded ${userParsed.length} user bindings from ${userPath}`,
    )

    // User bindings come after defaults, so they override
    const mergedBindings = [...defaultBindings, ...userParsed]

    logCustomBindingsLoadedOncePerDay(state, userParsed.length)

    // Run validation on user config
    // First check for duplicate keys in raw JSON (JSON.parse silently drops earlier values)
    const duplicateKeyWarnings = checkDuplicateKeysInJson(content)
    const warnings = [
      ...duplicateKeyWarnings,
      ...validateBindings(userBlocks, mergedBindings),
    ]

    if (warnings.length > 0) {
      logForDebugging(
        `[keybindings] Found ${warnings.length} validation issue(s)`,
      )
    }

    return { bindings: mergedBindings, warnings }
  } catch (error) {
    // File doesn't exist - use defaults (user can run /keybindings to create)
    if (isENOENT(error)) {
      return { bindings: defaultBindings, warnings: [] }
    }

    // Other error - log and return defaults with warning
    logForDebugging(
      `[keybindings] Error loading ${userPath}: ${errorMessage(error)}`,
    )
    return {
      bindings: defaultBindings,
      warnings: [
        {
          type: 'parse_error',
          severity: 'error',
          message: `Failed to parse keybindings.json: ${errorMessage(error)}`,
        },
      ],
    }
  }
}

/**
 * Load keybindings synchronously (for initial render).
 * Uses cached value if available.
 */
export function loadKeybindingsSync(
  state: KeybindingLoaderState = keybindingLoaderState,
): ParsedBinding[] {
  if (state.bindings) {
    return state.bindings
  }

  const result = loadKeybindingsSyncWithWarnings(state)
  return result.bindings
}

/**
 * Load keybindings synchronously with validation warnings.
 * Uses cached values if available.
 *
 * For external users, always returns default bindings only.
 * User customization is currently gated to Anthropic employees.
 */
export function loadKeybindingsSyncWithWarnings(
  state: KeybindingLoaderState = keybindingLoaderState,
): KeybindingsLoadResult {
  if (state.bindings) {
    return { bindings: state.bindings, warnings: state.warnings }
  }

  const defaultBindings = getDefaultParsedBindings()

  // Skip user config loading for external users
  if (!isKeybindingCustomizationEnabled()) {
    state.bindings = defaultBindings
    state.warnings = []
    return { bindings: state.bindings, warnings: state.warnings }
  }

  const userPath = getKeybindingsPath()

  try {
    // sync IO: called from sync context (React useState initializer)
    const content = readFileSync(userPath, 'utf-8')
    const parsed: unknown = jsonParse(content)

    // Extract bindings array from object wrapper format: { "bindings": [...] }
    let userBlocks: unknown
    if (typeof parsed === 'object' && parsed !== null && 'bindings' in parsed) {
      userBlocks = (parsed as { bindings: unknown }).bindings
    } else {
      // Invalid format - missing bindings property
      state.bindings = defaultBindings
      state.warnings = [
        {
          type: 'parse_error',
          severity: 'error',
          message: 'keybindings.json must have a "bindings" array',
          suggestion: 'Use format: { "bindings": [ ... ] }',
        },
      ]
      return { bindings: state.bindings, warnings: state.warnings }
    }

    // Validate structure - bindings must be an array of valid keybinding blocks
    if (!isKeybindingBlockArray(userBlocks)) {
      const errorMessage = !Array.isArray(userBlocks)
        ? '"bindings" must be an array'
        : 'keybindings.json contains invalid block structure'
      const suggestion = !Array.isArray(userBlocks)
        ? 'Set "bindings" to an array of keybinding blocks'
        : 'Each block must have "context" (string) and "bindings" (object mapping keys to a string action or null)'
      state.bindings = defaultBindings
      state.warnings = [
        {
          type: 'parse_error',
          severity: 'error',
          message: errorMessage,
          suggestion,
        },
      ]
      return { bindings: state.bindings, warnings: state.warnings }
    }

    const userParsed = parseBindings(userBlocks)
    logForDebugging(
      `[keybindings] Loaded ${userParsed.length} user bindings from ${userPath}`,
    )
    state.bindings = [...defaultBindings, ...userParsed]

    logCustomBindingsLoadedOncePerDay(state, userParsed.length)

    // Run validation - check for duplicate keys in raw JSON first
    const duplicateKeyWarnings = checkDuplicateKeysInJson(content)
    state.warnings = [
      ...duplicateKeyWarnings,
      ...validateBindings(userBlocks, state.bindings),
    ]
    if (state.warnings.length > 0) {
      logForDebugging(
        `[keybindings] Found ${state.warnings.length} validation issue(s)`,
      )
    }

    return { bindings: state.bindings, warnings: state.warnings }
  } catch {
    // File doesn't exist or error - use defaults (user can run /keybindings to create)
    state.bindings = defaultBindings
    state.warnings = []
    return { bindings: state.bindings, warnings: state.warnings }
  }
}

/**
 * Initialize file watching for keybindings.json.
 * Call this once when the app starts.
 *
 * For external users, this is a no-op since user customization is disabled.
 */
export async function initializeKeybindingWatcher(
  state: KeybindingLoaderState = keybindingLoaderState,
): Promise<void> {
  if (state.initialized || state.disposed) return

  // Skip file watching for external users
  if (!isKeybindingCustomizationEnabled()) {
    logForDebugging(
      '[keybindings] Skipping file watcher - user customization disabled',
    )
    return
  }

  const userPath = getKeybindingsPath()
  const watchDir = dirname(userPath)

  // Only watch if parent directory exists
  try {
    const stats = await stat(watchDir)
    if (!stats.isDirectory()) {
      logForDebugging(
        `[keybindings] Not watching: ${watchDir} is not a directory`,
      )
      return
    }
  } catch {
    logForDebugging(`[keybindings] Not watching: ${watchDir} does not exist`)
    return
  }

  // Set initialized only after we've confirmed we can watch
  state.initialized = true

  logForDebugging(`[keybindings] Watching for changes to ${userPath}`)

  state.watcher = chokidar.watch(userPath, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: FILE_STABILITY_THRESHOLD_MS,
      pollInterval: FILE_STABILITY_POLL_INTERVAL_MS,
    },
    ignorePermissionErrors: true,
    usePolling: false,
    atomic: true,
  })

  watcher.on('error', error =>
    logForDebugging(`[keybindings] watcher error: ${errorMessage(error)}`, {
      level: 'warn',
    }),
  )
  watcher.on('add', handleChange)
  watcher.on('change', handleChange)
  watcher.on('unlink', handleDelete)

  // Register cleanup
  registerCleanup(async () => disposeKeybindingWatcher(state))
}

/**
 * Clean up the file watcher.
 */
export function disposeKeybindingWatcher(
  state: KeybindingLoaderState = keybindingLoaderState,
): void {
  state.disposed = true
  if (state.watcher) {
    void state.watcher.close()
    state.watcher = null
  }
  state.changed.clear()
}

/**
 * Subscribe to keybinding changes.
 * The listener receives the new parsed bindings when the file changes.
 */
export const subscribeToKeybindingChanges = keybindingLoaderState.changed.subscribe

async function handleChange(
  state: KeybindingLoaderState,
  path: string,
): Promise<void> {
  logForDebugging(`[keybindings] Detected change to ${path}`)

  try {
    const result = await loadKeybindings(state)
    state.bindings = result.bindings
    state.warnings = result.warnings

    // Notify all listeners with the full result
    state.changed.emit(result)
  } catch (error) {
    logForDebugging(`[keybindings] Error reloading: ${errorMessage(error)}`)
  }
}

function handleDelete(state: KeybindingLoaderState, path: string): void {
  logForDebugging(`[keybindings] Detected deletion of ${path}`)

  // Reset to defaults when file is deleted
  const defaultBindings = getDefaultParsedBindings()
  state.bindings = defaultBindings
  state.warnings = []

  state.changed.emit({ bindings: defaultBindings, warnings: [] })
}

/**
 * Get the cached keybinding warnings.
 * Returns empty array if no warnings or bindings haven't been loaded yet.
 */
export function getCachedKeybindingWarnings(): KeybindingWarning[] {
  return keybindingLoaderState.warnings
}

/**
 * Reset internal state for testing.
 */
export function resetKeybindingLoaderForTesting(): void {
  keybindingLoaderState.initialized = false
  keybindingLoaderState.disposed = false
  keybindingLoaderState.bindings = null
  keybindingLoaderState.warnings = []
  keybindingLoaderState.lastCustomBindingsLogDate = null
  if (keybindingLoaderState.watcher) {
    void keybindingLoaderState.watcher.close()
    keybindingLoaderState.watcher = null
  }
  keybindingLoaderState.changed.clear()
}
