import { spawn } from 'child_process'
import { closeSync } from 'fs'
import { constants } from 'os'
import { join, sep } from 'path'
import { isatty } from 'tty'
import { isInBundledMode } from '../../utils/bundledMode.js'
import { getUserBinDir, getXDGDataHome } from '../../utils/xdg.js'

function getProviderSetupLauncher(): { cmd: string; prefixArgs: string[] } {
  if (isInBundledMode()) {
    const versionsPrefix = join(getXDGDataHome(), 'claude', 'versions') + sep
    if (process.execPath.startsWith(versionsPrefix)) {
      return { cmd: join(getUserBinDir(), 'claude'), prefixArgs: [] }
    }
    return { cmd: process.execPath, prefixArgs: [] }
  }

  const script = process.argv[1]
  return script
    ? { cmd: process.execPath, prefixArgs: [script] }
    : { cmd: process.execPath, prefixArgs: [] }
}

function severProviderSetupTtyInput(): void {
  for (let fd = 0; fd < 32; fd++) {
    if (fd === 1 || fd === 2) continue
    try {
      if (isatty(fd)) closeSync(fd)
    } catch {
      // Already-closed and non-TTY descriptors are harmless.
    }
  }
}

/** Relaunch with the exact current argv after a provider wizard completes. */
export async function relaunchAfterProviderSetup(): Promise<never> {
  // Let Ink finish the key event that requested app.exit() before the child
  // takes ownership of the terminal.
  await new Promise<void>(resolve => setImmediate(resolve))

  const { cmd, prefixArgs } = getProviderSetupLauncher()
  const child = spawn(cmd, [...prefixArgs, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
  })
  severProviderSetupTtyInput()

  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(signal, () => {
      try {
        child.kill(signal)
      } catch {
        // The child may already have exited.
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
