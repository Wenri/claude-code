import {
  execa as execaBase,
  execaSync as execaSyncBase,
  type Options,
  type SyncOptions,
} from 'execa'
import { resolveWindowsExecutable } from './windowsExecutable.js'

function isWindows(): boolean {
  return process.platform === 'win32'
}

/**
 * Run an executable without allowing Windows' current-directory lookup to
 * shadow a command found on PATH.
 */
export async function execa(
  command: string,
  args: readonly string[] = [],
  options?: Options,
) {
  if (isWindows()) {
    const executable = resolveWindowsExecutable(command)
    if (executable === null) {
      throw new Error(
        `Command '${command}' not found or is in an unsafe location (current directory)`,
      )
    }
    return execaBase(executable, args, options)
  }
  return execaBase(command, args, options)
}

/** Synchronous counterpart to {@link execa}. */
export function execaSync(
  command: string,
  args: readonly string[] = [],
  options?: SyncOptions,
) {
  if (isWindows()) {
    const executable = resolveWindowsExecutable(command)
    if (executable === null) {
      throw new Error(
        `Command '${command}' not found or is in an unsafe location (current directory)`,
      )
    }
    return execaSyncBase(executable, args, options)
  }
  return execaSyncBase(command, args, options)
}

/** Explicit shell-command boundary used by the recovered command callers. */
export async function execaCommand(command: string, options?: Options) {
  return execaBase(command, { ...options, shell: true })
}

/** Synchronous counterpart to the shell-command boundary. */
export function execaCommandSync(command: string, options?: SyncOptions) {
  return execaSyncBase(command, { ...options, shell: true })
}
