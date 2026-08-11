import {
  isPluginDependencyError,
  type PluginError,
} from '../../types/plugin.js'
import { logForDebugging } from '../debug.js'
import { errorMessage } from '../errors.js'
import { installResolvedPlugin } from './pluginInstallationHelpers.js'
import {
  formatDependencyCountSuffix,
  formatUnresolvedDependencySuffix,
  getEnabledPluginIdsForScope,
} from './dependencyResolver.js'
import {
  getMarketplaceCacheOnly,
  getPluginById,
  loadKnownMarketplacesConfig,
} from './marketplaceManager.js'
import { isSourceAllowedByPolicy } from './marketplaceHelpers.js'
import {
  parsePluginIdentifier,
  scopeToSettingSource,
} from './pluginIdentifier.js'
import { loadAllPlugins } from './pluginLoader.js'

type InstallScope = 'user' | 'project' | 'local'

function inferScope(
  declaringPlugins: ReadonlySet<string>,
  candidates: ReadonlyArray<readonly [InstallScope, ReadonlySet<string>]>,
): InstallScope | undefined {
  for (const [scope, enabled] of candidates) {
    if ([...declaringPlugins].some(pluginId => enabled.has(pluginId))) {
      return scope
    }
  }
  return undefined
}

export async function resolveMissingDependencies(
  errors: readonly PluginError[],
): Promise<{
  installed: string[]
  stillUnresolved: string[]
  marketplaceMissing: string[]
}> {
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

  if (missing.size === 0)
    return { installed: [], stillUnresolved: [], marketplaceMissing: [] }

  const knownMarketplaces = await loadKnownMarketplacesConfig()
  const scopeCandidates = (['user', 'project', 'local'] as const).map(
    scope =>
      [
        scope,
        getEnabledPluginIdsForScope(scopeToSettingSource(scope)),
      ] as const,
  )
  const installed: string[] = []
  const stillUnresolved: string[] = []
  const marketplaceMissing: string[] = []
  for (const [dependency, declaringPlugins] of missing) {
    const dependencyMarketplace = parsePluginIdentifier(dependency).marketplace
    if (
      !dependencyMarketplace ||
      !knownMarketplaces[dependencyMarketplace]
    ) {
      stillUnresolved.push(dependency)
      marketplaceMissing.push(dependency)
      continue
    }

    if (
      !isSourceAllowedByPolicy(
        knownMarketplaces[dependencyMarketplace]!.source,
      )
    ) {
      logForDebugging(
        `resolveMissingDependencies: skipping "${dependency}" — marketplace "${dependencyMarketplace}" is blocked by enterprise policy`,
      )
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
      const inferredScope = inferScope(declaringPlugins, scopeCandidates)
      const result = await installResolvedPlugin({
        pluginId: dependency,
        entry: info.entry,
        marketplaceInstallLocation: info.marketplaceInstallLocation,
        scope: inferredScope ?? 'user',
        trigger: 'dependency-resolution',
        auto: inferredScope !== undefined,
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
  return { installed, stillUnresolved, marketplaceMissing }
}

export async function recoverInstalledPluginDependencies(
  pluginId: string,
): Promise<{ suffix: string } | null> {
  const { errors } = await loadAllPlugins()
  const dependencyErrors = errors
    .filter(isPluginDependencyError)
    .filter(error => error.source === pluginId)
  if (dependencyErrors.length === 0) return null

  const { installed, marketplaceMissing } =
    await resolveMissingDependencies(dependencyErrors)
  const installedSet = new Set(installed)
  const unresolved = [
    ...new Set(dependencyErrors.map(error => error.dependency)),
  ].filter(dependency => !installedSet.has(dependency))
  return {
    suffix:
      formatDependencyCountSuffix(installed) +
      formatUnresolvedDependencySuffix(unresolved, marketplaceMissing),
  }
}
