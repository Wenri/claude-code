import { spawn, spawnSync, type SpawnOptions } from 'child_process'
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
 * Re-exec the current command line without applying the session-oriented
 * relaunch policy. Startup model upgrades use this exact path so the new
 * process sees the same flags and provider environment.
 */
export async function execRelaunch(): Promise<never> {
  await new Promise<void>(resolve => setImmediate(resolve))
  const { cmd, prefixArgs } = getRelaunchLauncher()
  const args = process.argv.slice(2)
  const child = spawn(cmd, [...prefixArgs, ...args], {
    stdio: 'inherit',
    env: process.env,
  })

  severTtyInputForRelaunch()

  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(signal, () => {
      try {
        child.kill(signal)
      } catch {
        // The replacement may already have exited.
      }
    })
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

/**
 * Relaunch Claude Code and transfer the current terminal to the child.
 * Resolves only through process exit.
 */
export async function relaunch(options: RelaunchOptions = {}): Promise<never> {
  const { cmd, prefixArgs } = options.launcher ?? getRelaunchLauncher()
  const sessionId = getSessionId()
  const transcriptPath = getTranscriptPath()
  let relaunchArgs: string[]

  if (options.args) {
    relaunchArgs = options.args
  } else if (
    options.freshIfNoTranscript &&
    (!transcriptPath ||
      !(await stat(transcriptPath).then(
        result => result.size > 0,
        () => false,
      )))
  ) {
    relaunchArgs = []
  } else {
    relaunchArgs = ['--resume', sessionId]
  }

  markShuttingDownForRelaunch()
  cleanupTerminalForRelaunch()
  await Promise.all([
    withTimeout(
      flushSessionStorage(),
      30_000,
      'flush timeout (relaunch)',
    ).catch(() => {}),
    withTimeout(runCleanupFunctions(), 2_000, 'cleanup timeout').catch(
      () => {},
    ),
  ])
  options.preSpawn?.()

  const childEnv = { ...process.env }
  delete childEnv.CLAUDE_CODE_TUI_JUST_SWITCHED
  delete childEnv.CLAUDE_BRIDGE_REATTACH_SESSION
  delete childEnv.CLAUDE_BRIDGE_REATTACH_SEQ
  Object.assign(childEnv, options.env)
  for (const key of options.dropEnv ?? []) delete childEnv[key]

  const args = [...prefixArgs, ...relaunchArgs]
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.removeAllListeners(signal)
    process.on(signal, () => {})
  }

  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    env: childEnv,
    cwd: getRelaunchCwd(),
  })

  process.removeAllListeners('beforeExit')
  process.removeAllListeners('exit')

  if (result.error) {
    process.stderr.write(`Failed to relaunch Claude Code: ${result.error.message}\n`)
    process.exit(1)
  }
  if (result.signal) {
    process.removeAllListeners(result.signal)
    process.kill(process.pid, result.signal)
    process.exit(128 + (constants.signals[result.signal] ?? 0))
  }
  process.exit(result.status ?? (result.signal ? 1 : 0))
}
