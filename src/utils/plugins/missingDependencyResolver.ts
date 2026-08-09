import type { PluginError } from '../../types/plugin.js'
import { logForDebugging } from '../debug.js'
import { errorMessage } from '../errors.js'
import { getSettingsForSource } from '../settings/settings.js'
import { installResolvedPlugin } from './pluginInstallationHelpers.js'
import {
  getMarketplaceCacheOnly,
  getPluginById,
  loadKnownMarketplacesConfig,
} from './marketplaceManager.js'
import { parsePluginIdentifier } from './pluginIdentifier.js'

type InstallScope = 'user' | 'project' | 'local'

function inferScope(declaringPlugins: ReadonlySet<string>): InstallScope {
  const candidates: Array<
    [Parameters<typeof getSettingsForSource>[0], InstallScope]
  > = [
    ['userSettings', 'user'],
    ['projectSettings', 'project'],
    ['localSettings', 'local'],
  ]
  for (const [source, scope] of candidates) {
    const enabled = getSettingsForSource(source)?.enabledPlugins ?? {}
    if ([...declaringPlugins].some(pluginId => enabled[pluginId])) return scope
  }
  return 'user'
}

export async function resolveMissingDependencies(
  errors: readonly PluginError[],
): Promise<{ installed: string[]; stillUnresolved: string[] }> {
  const missing = new Map<string, Set<string>>()
  for (const error of errors) {
    if (
      error.type !== 'dependency-unsatisfied' ||
      error.reason !== 'not-found'
    ) {
      continue
    }
    let declaringPlugins = missing.get(error.dependency)
    if (!declaringPlugins) {
      declaringPlugins = new Set()
      missing.set(error.dependency, declaringPlugins)
    }
    declaringPlugins.add(error.source)
  }

  if (missing.size === 0) return { installed: [], stillUnresolved: [] }

  const knownMarketplaces = await loadKnownMarketplacesConfig()
  const installed: string[] = []
  const stillUnresolved: string[] = []
  for (const [dependency, declaringPlugins] of missing) {
    const dependencyMarketplace = parsePluginIdentifier(dependency).marketplace
    if (
      !dependencyMarketplace ||
      !knownMarketplaces[dependencyMarketplace]
    ) {
      stillUnresolved.push(dependency)
      continue
    }

    let trusted = false
    for (const declaringPlugin of declaringPlugins) {
      const declaringMarketplace =
        parsePluginIdentifier(declaringPlugin).marketplace
      if (declaringMarketplace === dependencyMarketplace) {
        trusted = true
        break
      }
      if (!declaringMarketplace) continue
      const allowed = (await getMarketplaceCacheOnly(declaringMarketplace))
        ?.allowCrossMarketplaceDependenciesOn
      if (allowed?.includes(dependencyMarketplace)) {
        trusted = true
        break
      }
    }
    if (!trusted) {
      logForDebugging(
        `resolveMissingDependencies: skipping "${dependency}" — cross-marketplace dependency not in any declaring marketplace's allowlist`,
      )
      stillUnresolved.push(dependency)
      continue
    }

    try {
      const info = await getPluginById(dependency)
      if (!info) {
        stillUnresolved.push(dependency)
        continue
      }
      const result = await installResolvedPlugin({
        pluginId: dependency,
        entry: info.entry,
        marketplaceInstallLocation: info.marketplaceInstallLocation,
        scope: inferScope(declaringPlugins),
        trigger: 'dependency-resolution',
      })
      if (!result.ok) {
        logForDebugging(
          `resolveMissingDependencies: install of "${dependency}" did not complete (${result.reason})`,
          { level: 'warn' },
        )
        stillUnresolved.push(dependency)
        continue
      }
      for (const installedPlugin of result.closure) {
        if (!installed.includes(installedPlugin)) installed.push(installedPlugin)
      }
    } catch (caught) {
      logForDebugging(
        `resolveMissingDependencies: install of "${dependency}" threw: ${errorMessage(caught)}`,
        { level: 'warn' },
      )
      stillUnresolved.push(dependency)
    }
  }
  return { installed, stillUnresolved }
}
