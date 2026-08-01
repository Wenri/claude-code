import { readdir } from 'fs/promises'
import { logForDebugging } from '../debug.js'
import { isENOENT } from '../errors.js'
import { execFileNoThrowWithCwd } from '../execFileNoThrow.js'

const PLUGIN_DEPENDENCY_INSTALL_TIMEOUT_MS = 60_000

const SUPPORTED_INSTALLERS = [
  {
    lockfile: 'bun.lock',
    command: 'bun',
    args: ['install', '--frozen-lockfile', '--ignore-scripts'],
  },
  {
    lockfile: 'bun.lockb',
    command: 'bun',
    args: ['install', '--frozen-lockfile', '--ignore-scripts'],
  },
  {
    lockfile: 'npm-shrinkwrap.json',
    command: 'npm',
    args: ['ci', '--ignore-scripts'],
  },
  {
    lockfile: 'package-lock.json',
    command: 'npm',
    args: ['ci', '--ignore-scripts'],
  },
] as const

export type PluginDependencyInstallResult = {
  ran: boolean
  error?: string
}

/**
 * Install a plugin's JavaScript dependencies only when a reproducible bun or
 * npm lockfile is present. Lifecycle scripts are disabled because this runs
 * while materializing marketplace content.
 */
export async function installPluginDependencies(
  pluginPath: string,
): Promise<PluginDependencyInstallResult> {
  let entries: string[]
  try {
    entries = await readdir(pluginPath)
  } catch (error) {
    if (isENOENT(error)) return { ran: false }
    throw error
  }

  const files = new Set(entries)
  if (!files.has('package.json')) return { ran: false }

  for (const installer of SUPPORTED_INSTALLERS) {
    if (!files.has(installer.lockfile)) continue

    logForDebugging(
      `Installing plugin dependencies: ${installer.command} ${installer.args.join(' ')} in ${pluginPath}`,
    )
    const result = await execFileNoThrowWithCwd(
      installer.command,
      [...installer.args],
      {
        cwd: pluginPath,
        timeout: PLUGIN_DEPENDENCY_INSTALL_TIMEOUT_MS,
      },
    )
    if (result.code !== 0) {
      return {
        ran: true,
        error: `Plugin dependency install failed (${installer.command}): ${result.stderr || result.stdout || result.error || 'no output'}`.slice(
          0,
          500,
        ),
      }
    }

    logForDebugging(
      `Plugin dependency install succeeded (${installer.command}) in ${pluginPath}`,
    )
    return { ran: true }
  }

  if (files.has('yarn.lock') || files.has('pnpm-lock.yaml')) {
    return {
      ran: false,
      error:
        'Skipped: yarn/pnpm lockfiles are not supported (resolution-time hooks bypass --ignore-scripts). Use bun or npm.',
    }
  }

  return { ran: false }
}
