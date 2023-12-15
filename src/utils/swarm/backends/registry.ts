import { getIsNonInteractiveSession } from '../../../bootstrap/state.js'
import { logForDebugging } from '../../../utils/debug.js'
import { getPlatform } from '../../../utils/platform.js'
import {
  isInITerm2,
  isInsideTmux,
  isInsideTmuxSync,
  isIt2CliAvailable,
  isTmuxAvailable,
} from './detection.js'
import { createInProcessBackend } from './InProcessBackend.js'
import { getPreferTmuxOverIterm2 } from './it2Setup.js'
import { createPaneBackendExecutor } from './PaneBackendExecutor.js'
import { getTeammateModeFromSnapshot } from './teammateModeSnapshot.js'
import type {
  BackendDetectionResult,
  PaneBackend,
  PaneBackendType,
  TeammateExecutor,
} from './types.js'

export type BackendRegistry = {
  cachedBackend: PaneBackend | null
  cachedDetectionResult: BackendDetectionResult | null
  backendsRegistered: boolean
  cachedInProcessBackend: TeammateExecutor | null
  cachedPaneBackendExecutor: TeammateExecutor | null
  inProcessFallbackActive: boolean
  TmuxBackendClass: (new () => PaneBackend) | null
  ITermBackendClass: (new () => PaneBackend) | null
}

export function createBackendRegistry(): BackendRegistry {
  return {
    cachedBackend: null,
    cachedDetectionResult: null,
    backendsRegistered: false,
    cachedInProcessBackend: null,
    cachedPaneBackendExecutor: null,
    inProcessFallbackActive: false,
    TmuxBackendClass: null,
    ITermBackendClass: null,
  }
}

export const globalBackendRegistry = createBackendRegistry()

/**
 * Ensures backend classes are dynamically imported so getBackendByType() can
 * construct them. Unlike detectAndGetBackend(), this never spawns subprocesses
 * and never throws — it's the lightweight option when you only need class
 * registration (e.g., killing a pane by its stored backendType).
 */
export async function ensureBackendsRegistered(
  registry: BackendRegistry = globalBackendRegistry,
): Promise<void> {
  if (registry.backendsRegistered) return
  await import('./TmuxBackend.js')
  await import('./ITermBackend.js')
  registry.TmuxBackendClass = globalBackendRegistry.TmuxBackendClass
  registry.ITermBackendClass = globalBackendRegistry.ITermBackendClass
  registry.backendsRegistered = true
}

/**
 * Registers the TmuxBackend class with the registry.
 * Called by TmuxBackend.ts to avoid circular dependencies.
 */
export function registerTmuxBackend(
  backendClass: new () => PaneBackend,
  registry: BackendRegistry = globalBackendRegistry,
): void {
  registry.TmuxBackendClass = backendClass
}

/**
 * Registers the ITermBackend class with the registry.
 * Called by ITermBackend.ts to avoid circular dependencies.
 */
export function registerITermBackend(
  backendClass: new () => PaneBackend,
  registry: BackendRegistry = globalBackendRegistry,
): void {
  logForDebugging(
    `[registry] registerITermBackend called, class=${backendClass?.name || 'undefined'}`,
  )
  registry.ITermBackendClass = backendClass
}

/**
 * Creates a TmuxBackend instance.
 * Throws if TmuxBackend hasn't been registered.
 */
function createTmuxBackend(registry: BackendRegistry): PaneBackend {
  if (!registry.TmuxBackendClass) {
    throw new Error(
      'TmuxBackend not registered. Import TmuxBackend.ts before using the registry.',
    )
  }
  return new registry.TmuxBackendClass()
}

/**
 * Creates an ITermBackend instance.
 * Throws if ITermBackend hasn't been registered.
 */
function createITermBackend(registry: BackendRegistry): PaneBackend {
  if (!registry.ITermBackendClass) {
    throw new Error(
      'ITermBackend not registered. Import ITermBackend.ts before using the registry.',
    )
  }
  return new registry.ITermBackendClass()
}

/**
 * Detection priority flow:
 * 1. If inside tmux, always use tmux (even in iTerm2)
 * 2. If in iTerm2 with it2 available, use iTerm2 backend
 * 3. If in iTerm2 without it2, return result indicating setup needed
 * 4. If tmux available, use tmux (creates external session)
 * 5. Otherwise, throw error with instructions
 */
export async function detectAndGetBackend(
  registry: BackendRegistry = globalBackendRegistry,
): Promise<BackendDetectionResult> {
  // Ensure backends are registered before detection
  await ensureBackendsRegistered(registry)

  // Return cached result if available
  if (registry.cachedDetectionResult) {
    logForDebugging(
      `[BackendRegistry] Using cached backend: ${registry.cachedDetectionResult.backend.type}`,
    )
    return registry.cachedDetectionResult
  }

  logForDebugging('[BackendRegistry] Starting backend detection...')

  // Check all environment conditions upfront for logging
  const insideTmux = await isInsideTmux()
  const inITerm2 = isInITerm2()

  logForDebugging(
    `[BackendRegistry] Environment: insideTmux=${insideTmux}, inITerm2=${inITerm2}`,
  )

  // Priority 1: If inside tmux, always use tmux
  if (insideTmux) {
    logForDebugging(
      '[BackendRegistry] Selected: tmux (running inside tmux session)',
    )
    const backend = createTmuxBackend(registry)
    registry.cachedBackend = backend
    registry.cachedDetectionResult = {
      backend,
      isNative: true,
      needsIt2Setup: false,
    }
    return registry.cachedDetectionResult
  }

  // Priority 2: If in iTerm2, try to use native panes
  if (inITerm2) {
    // Check if user previously chose to prefer tmux over iTerm2
    const preferTmux = getPreferTmuxOverIterm2()
    if (preferTmux) {
      logForDebugging(
        '[BackendRegistry] User prefers tmux over iTerm2, skipping iTerm2 detection',
      )
    } else {
      const it2Available = await isIt2CliAvailable()
      logForDebugging(
        `[BackendRegistry] iTerm2 detected, it2 CLI available: ${it2Available}`,
      )

      if (it2Available) {
        logForDebugging(
          '[BackendRegistry] Selected: iterm2 (native iTerm2 with it2 CLI)',
        )
        const backend = createITermBackend(registry)
        registry.cachedBackend = backend
        registry.cachedDetectionResult = {
          backend,
          isNative: true,
          needsIt2Setup: false,
        }
        return registry.cachedDetectionResult
      }
    }

    // In iTerm2 but it2 not available - check if tmux can be used as fallback
    const tmuxAvailable = await isTmuxAvailable()
    logForDebugging(
      `[BackendRegistry] it2 not available, tmux available: ${tmuxAvailable}`,
    )

    if (tmuxAvailable) {
      logForDebugging(
        '[BackendRegistry] Selected: tmux (fallback in iTerm2, it2 setup recommended)',
      )
      // Return tmux as fallback. Only signal it2 setup if the user hasn't already
      // chosen to prefer tmux - otherwise they'd be re-prompted on every spawn.
      const backend = createTmuxBackend(registry)
      registry.cachedBackend = backend
      registry.cachedDetectionResult = {
        backend,
        isNative: false,
        needsIt2Setup: !preferTmux,
      }
      return registry.cachedDetectionResult
    }

    // In iTerm2 with no it2 and no tmux - it2 setup is required
    logForDebugging(
      '[BackendRegistry] ERROR: iTerm2 detected but no it2 CLI and no tmux',
    )
    throw new Error(
      'iTerm2 detected but it2 CLI not installed. Install it2 with: pip install it2',
    )
  }

  // Priority 3: Fall back to tmux external session
  const tmuxAvailable = await isTmuxAvailable()
  logForDebugging(
    `[BackendRegistry] Not in tmux or iTerm2, tmux available: ${tmuxAvailable}`,
  )

  if (tmuxAvailable) {
    logForDebugging('[BackendRegistry] Selected: tmux (external session mode)')
    const backend = createTmuxBackend(registry)
    registry.cachedBackend = backend
    registry.cachedDetectionResult = {
      backend,
      isNative: false,
      needsIt2Setup: false,
    }
    return registry.cachedDetectionResult
  }

  // No backend available - tmux is not installed
  logForDebugging('[BackendRegistry] ERROR: No pane backend available')
  throw new Error(getTmuxInstallInstructions())
}

/**
 * Returns platform-specific tmux installation instructions.
 */
function getTmuxInstallInstructions(): string {
  const platform = getPlatform()

  switch (platform) {
    case 'macos':
      return `To use agent swarms, install tmux:
  brew install tmux
Then start a tmux session with: tmux new-session -s claude`

    case 'linux':
    case 'wsl':
      return `To use agent swarms, install tmux:
  sudo apt install tmux    # Ubuntu/Debian
  sudo dnf install tmux    # Fedora/RHEL
Then start a tmux session with: tmux new-session -s claude`

    case 'windows':
      return `To use agent swarms, you need tmux which requires WSL (Windows Subsystem for Linux).
Install WSL first, then inside WSL run:
  sudo apt install tmux
Then start a tmux session with: tmux new-session -s claude`

    default:
      return `To use agent swarms, install tmux using your system's package manager.
Then start a tmux session with: tmux new-session -s claude`
  }
}

/**
 * Gets a backend by explicit type selection.
 * Useful for testing or when the user has a preference.
 *
 * @param type - The backend type to get
 * @returns The requested backend instance
 * @throws If the requested backend type is not available
 */
export function getBackendByType(
  type: PaneBackendType,
  registry: BackendRegistry = globalBackendRegistry,
): PaneBackend {
  switch (type) {
    case 'tmux':
      return createTmuxBackend(registry)
    case 'iterm2':
      return createITermBackend(registry)
  }
}

/**
 * Gets the currently cached backend, if any.
 * Returns null if no backend has been detected yet.
 */
export function getCachedBackend(
  registry: BackendRegistry = globalBackendRegistry,
): PaneBackend | null {
  return registry.cachedBackend
}

/**
 * Gets the cached backend detection result, if any.
 * Returns null if detection hasn't run yet.
 * Use `isNative` to check if teammates are visible in native panes.
 */
export function getCachedDetectionResult(
  registry: BackendRegistry = globalBackendRegistry,
): BackendDetectionResult | null {
  return registry.cachedDetectionResult
}

/**
 * Records that spawn fell back to in-process mode because no pane backend
 * was available. After this, isInProcessEnabled() returns true and subsequent
 * spawns short-circuit to in-process (the environment won't change mid-session).
 */
export function markInProcessFallback(
  registry: BackendRegistry = globalBackendRegistry,
): void {
  logForDebugging('[BackendRegistry] Marking in-process fallback as active')
  registry.inProcessFallbackActive = true
}

/**
 * Gets the teammate mode for this session.
 * Returns the session snapshot captured at startup, ignoring runtime config changes.
 */
function getTeammateMode(): 'auto' | 'tmux' | 'in-process' {
  return getTeammateModeFromSnapshot()
}

/**
 * Checks if in-process teammate execution is enabled.
 *
 * Logic:
 * - If teammateMode is 'in-process', always enabled
 * - If teammateMode is 'tmux', always disabled (use pane backend)
 * - If teammateMode is 'auto' (default), check environment:
 *   - If inside tmux, use pane backend (return false)
 *   - If inside iTerm2, use pane backend (return false) - detectAndGetBackend()
 *     will pick ITermBackend if it2 is available, or fall back to tmux
 *   - Otherwise, use in-process (return true)
 */
export function isInProcessEnabled(
  registry: BackendRegistry = globalBackendRegistry,
): boolean {
  // Force in-process mode for non-interactive sessions (-p mode)
  // since tmux-based teammates don't make sense without a terminal UI
  if (getIsNonInteractiveSession()) {
    logForDebugging(
      '[BackendRegistry] isInProcessEnabled: true (non-interactive session)',
    )
    return true
  }

  const mode = getTeammateMode()

  let enabled: boolean
  if (mode === 'in-process') {
    enabled = true
  } else if (mode === 'tmux') {
    enabled = false
  } else {
    // 'auto' mode - if a prior spawn fell back to in-process because no pane
    // backend was available, stay in-process (scoped to auto mode only so a
    // mid-session Settings change to explicit 'tmux' still takes effect).
    if (registry.inProcessFallbackActive) {
      logForDebugging(
        '[BackendRegistry] isInProcessEnabled: true (fallback after pane backend unavailable)',
      )
      return true
    }
    // Check if a pane backend environment is available
    // If inside tmux or iTerm2, use pane backend; otherwise use in-process
    const insideTmux = isInsideTmuxSync()
    const inITerm2 = isInITerm2()
    enabled = !insideTmux && !inITerm2
  }

  logForDebugging(
    `[BackendRegistry] isInProcessEnabled: ${enabled} (mode=${mode}, insideTmux=${isInsideTmuxSync()}, inITerm2=${isInITerm2()})`,
  )
  return enabled
}

/**
 * Returns the resolved teammate executor mode for this session.
 * Unlike getTeammateModeFromSnapshot which may return 'auto', this returns
 * what 'auto' actually resolves to given the current environment.
 */
export function getResolvedTeammateMode(
  registry: BackendRegistry = globalBackendRegistry,
): 'in-process' | 'tmux' {
  return isInProcessEnabled(registry) ? 'in-process' : 'tmux'
}

/**
 * Gets the InProcessBackend instance.
 * Creates and caches the instance on first call.
 */
export function getInProcessBackend(
  registry: BackendRegistry = globalBackendRegistry,
): TeammateExecutor {
  if (!registry.cachedInProcessBackend) {
    registry.cachedInProcessBackend = createInProcessBackend()
  }
  return registry.cachedInProcessBackend
}

/**
 * Gets a TeammateExecutor for spawning teammates.
 *
 * Returns either:
 * - InProcessBackend when preferInProcess is true and in-process mode is enabled
 * - PaneBackendExecutor wrapping the detected pane backend otherwise
 *
 * This provides a unified TeammateExecutor interface regardless of execution mode,
 * allowing callers to spawn and manage teammates without knowing the backend details.
 *
 * @param preferInProcess - If true and in-process is enabled, returns InProcessBackend.
 *                          Otherwise returns PaneBackendExecutor.
 * @returns TeammateExecutor instance
 */
export async function getTeammateExecutor(
  preferInProcess: boolean = false,
  registry: BackendRegistry = globalBackendRegistry,
): Promise<TeammateExecutor> {
  if (preferInProcess && isInProcessEnabled(registry)) {
    logForDebugging('[BackendRegistry] Using in-process executor')
    return getInProcessBackend(registry)
  }

  // Return pane backend executor
  logForDebugging('[BackendRegistry] Using pane backend executor')
  return getPaneBackendExecutor(registry)
}

/**
 * Gets the PaneBackendExecutor instance.
 * Creates and caches the instance on first call, detecting the appropriate pane backend.
 */
async function getPaneBackendExecutor(
  registry: BackendRegistry,
): Promise<TeammateExecutor> {
  if (!registry.cachedPaneBackendExecutor) {
    const detection = await detectAndGetBackend(registry)
    registry.cachedPaneBackendExecutor = createPaneBackendExecutor(
      detection.backend,
    )
    logForDebugging(
      `[BackendRegistry] Created PaneBackendExecutor wrapping ${detection.backend.type}`,
    )
  }
  return registry.cachedPaneBackendExecutor
}

/**
 * Resets the backend detection cache.
 * Used for testing to allow re-detection.
 */
export function resetBackendDetection(
  registry: BackendRegistry = globalBackendRegistry,
): void {
  registry.cachedBackend = null
  registry.cachedDetectionResult = null
  registry.cachedInProcessBackend = null
  registry.cachedPaneBackendExecutor = null
  registry.backendsRegistered = false
  registry.inProcessFallbackActive = false
}
