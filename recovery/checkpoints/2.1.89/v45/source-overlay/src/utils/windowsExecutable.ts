// Explicit 2.1.89 reconstruction: shared Windows executable resolver.
// Derived from recovered windowsPaths.ts; module identity is reconstructed.
import { execFileSync } from 'child_process'
import { dirname, join, resolve, sep } from 'path'

function isWindows(): boolean {
  return process.platform === 'win32'
}

export function findExecutableOnWindows(executable: string): string | null {
  const systemRoot = process.env.SYSTEMROOT || 'C:\\Windows'
  const whereExecutable = join(systemRoot, 'System32', 'where.exe')
  try {
    const paths = execFileSync(whereExecutable, [executable], {
      stdio: 'pipe',
      encoding: 'utf8',
    })
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
    const cwd = process.cwd().toLowerCase()

    for (const candidatePath of paths) {
      // Normalize and compare paths to ensure we're not in current directory
      const normalizedPath = resolve(candidatePath).toLowerCase()
      const pathDir = dirname(normalizedPath).toLowerCase()

      // Skip if the executable is in the current working directory
      if (pathDir === cwd || normalizedPath.startsWith(cwd + sep)) {
        continue
      }

      // Return the first valid path that's not in the current directory
      return candidatePath
    }

    return null
  } catch {
    return null
  }
}

export function resolveWindowsExecutable(command: string): string | null {
  if (!isWindows()) return command
  if (command.includes('/') || command.includes('\\')) return command
  return findExecutableOnWindows(command)
}
