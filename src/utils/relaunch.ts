import { spawn, type SpawnOptions } from 'child_process'
import { closeSync } from 'fs'
import { stat } from 'fs/promises'
import { constants } from 'os'
import { dirname, join, sep } from 'path'
import { isatty } from 'tty'
import {
  getOriginalCwd,
  getProjectRoot,
  getSessionId,
} from '../bootstrap/state.js'
import { isInBundledMode } from './bundledMode.js'
import { runCleanupFunctions } from './cleanupRegistry.js'
import { stopCapturingEarlyInput } from './earlyInput.js'
import {
  cleanupTerminalForRelaunch,
  markShuttingDownForRelaunch,
} from './gracefulShutdown.js'
import {
  getProjectDir,
  getTranscriptPath,
  flushSessionStorage,
} from './sessionStorage.js'
import { withTimeout } from './sleep.js'
import { getUserBinDir, getXDGDataHome } from './xdg.js'

export type RelaunchLauncher = {
  cmd: string
  prefixArgs: string[]
}

export type RelaunchOptions = {
  launcher?: RelaunchLauncher
  args?: string[]
  env?: NodeJS.ProcessEnv
  dropEnv?: string[]
  freshIfNoTranscript?: boolean
  preSpawn?: () => void
}

/**
 * Resolve the stable launcher. A native version binary relaunches through the
 * user-facing symlink so an update that landed mid-session is picked up.
 */
export function getRelaunchLauncher(): RelaunchLauncher {
  if (isInBundledMode()) {
    const versionsPrefix = join(getXDGDataHome(), 'claude', 'versions') + sep
    if (process.execPath.startsWith(versionsPrefix)) {
      const executable = process.platform === 'win32' ? 'claude.exe' : 'claude'
      return { cmd: join(getUserBinDir(), executable), prefixArgs: [] }
    }
    return { cmd: process.execPath, prefixArgs: [] }
  }

  const script = process.argv[1]
  if (!script) return { cmd: process.execPath, prefixArgs: [] }
  return { cmd: process.execPath, prefixArgs: [script] }
}

/**
 * Close every inherited TTY descriptor in the old process except stdout and
 * stderr. The replacement process owns stdin after spawn; leaving another
 * `/dev/tty` descriptor readable in the parent can steal keystrokes.
 */
export function severTtyInputForRelaunch(): void {
  for (let fd = 0; fd < 32; fd++) {
    if (fd === 1 || fd === 2) continue
    try {
      if (isatty(fd)) closeSync(fd)
    } catch {
      // Descriptors are inherently racy. Already-closed/non-TTY fds are fine.
    }
  }
}

export function getRelaunchCwd(): string {
  const transcriptPath = getTranscriptPath()
  const originalCwd = getOriginalCwd()
  if (
    transcriptPath &&
    dirname(transcriptPath) === getProjectDir(originalCwd)
  ) {
    return originalCwd
  }
  return getProjectRoot()
}

/**
 * Relaunch Claude Code and transfer the current terminal to the child.
 * Resolves only through process exit.
 */
export async function relaunch(options: RelaunchOptions = {}): Promise<never> {
  const { cmd, prefixArgs } = options.launcher ?? getRelaunchLauncher()
  const sessionId = getSessionId()
  const transcriptPath = getTranscriptPath()
  let resume = true

  if (options.freshIfNoTranscript) {
    resume = transcriptPath
      ? await stat(transcriptPath).then(
          result => result.size > 0,
          () => false,
        )
      : false
  }

  stopCapturingEarlyInput()
  markShuttingDownForRelaunch()
  // Keep the parent alive until the replacement exits.
  setInterval(() => {}, 1_073_741_824)

  await withTimeout(flushSessionStorage(), 2_000, 'flush timeout').catch(
    () => {},
  )
  cleanupTerminalForRelaunch()
  await withTimeout(runCleanupFunctions(), 2_000, 'cleanup timeout').catch(
    () => {},
  )
  options.preSpawn?.()

  const childEnv = { ...process.env }
  delete childEnv.CLAUDE_CODE_TUI_JUST_SWITCHED
  Object.assign(childEnv, options.env)
  for (const key of options.dropEnv ?? []) delete childEnv[key]

  const relaunchArgs = options.args ?? (resume ? ['--resume', sessionId] : [])
  const args = [...prefixArgs, ...relaunchArgs]
  const spawnOptions: SpawnOptions = {
    stdio: 'inherit',
    env: childEnv,
    cwd: getRelaunchCwd(),
  }
  const child = spawn(cmd, args, spawnOptions)
  child.ref()
  severTtyInputForRelaunch()

  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.removeAllListeners(signal)
    process.on(signal, () => {})
  }

  return await new Promise<never>(() => {
    child.on('close', (code, signal) => {
      const signalCode = signal ? 128 + (constants.signals[signal] ?? 0) : 0
      process.exit(code ?? signalCode)
    })
    child.on('error', error => {
      process.stderr.write(`Failed to relaunch Claude Code: ${error.message}\n`)
      process.exit(1)
    })
  })
}
