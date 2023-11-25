import { execa } from 'execa'
import { execFileSync } from 'child_process'
import { dirname, isAbsolute, join, resolve, sep } from 'path'

function filterUnsafeWindowsResults(paths: string[]): string[] {
  const cwd = process.cwd().toLowerCase()
  return paths.filter(path => {
    const resolved = resolve(path).toLowerCase()
    return dirname(resolved).toLowerCase() !== cwd && !resolved.startsWith(cwd + sep)
  })
}

function getWindowsWhereExecutable(): string {
  const systemRoot = process.env.SYSTEMROOT || 'C:\\Windows'
  return join(systemRoot, 'System32', 'where.exe')
}

async function whichNodeAsync(command: string): Promise<string | null> {
  if (process.platform === 'win32') {
    // On Windows, use where.exe and return the first result
    const result = await execa(getWindowsWhereExecutable(), [command], {
      reject: false,
    })
    if (result.exitCode !== 0 || !result.stdout) {
      return null
    }
    // where.exe returns multiple paths separated by newlines, return the first
    const paths = result.stdout.trim().split(/\r?\n/).filter(Boolean)
    return filterUnsafeWindowsResults(paths)[0] || null
  }

  // On POSIX systems (macOS, Linux, WSL), use which
  // Cross-platform safe: Windows is handled above
  // eslint-disable-next-line custom-rules/no-cross-platform-process-issues
  const result = await execa('which', [command], {
    stderr: 'ignore',
    reject: false,
  })
  if (result.exitCode !== 0 || !result.stdout) {
    return null
  }
  return result.stdout.trim()
}

function whichNodeSync(command: string): string | null {
  if (process.platform === 'win32') {
    try {
      const paths = execFileSync(getWindowsWhereExecutable(), [command], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
      return filterUnsafeWindowsResults(paths)[0] || null
    } catch {
      return null
    }
  }

  try {
    return (
      execFileSync('which', [command], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() || null
    )
  } catch {
    return null
  }
}

const bunWhich =
  typeof Bun !== 'undefined' && typeof Bun.which === 'function'
    ? Bun.which
    : null

function whichWithBun(command: string): string | null {
  const result = bunWhich!(command)
  if (!result || process.platform !== 'win32') return result
  if (isAbsolute(command)) return result
  return filterUnsafeWindowsResults([result])[0] ?? null
}

/**
 * Finds the full path to a command executable.
 * Uses Bun.which when running in Bun (fast, no process spawn),
 * otherwise spawns the platform-appropriate command.
 *
 * @param command - The command name to look up
 * @returns The full path to the command, or null if not found
 */
export const which: (command: string) => Promise<string | null> = bunWhich
  ? async command => whichWithBun(command)
  : whichNodeAsync

/**
 * Synchronous version of `which`.
 *
 * @param command - The command name to look up
 * @returns The full path to the command, or null if not found
 */
export const whichSync: (command: string) => string | null =
  bunWhich ? whichWithBun : whichNodeSync
