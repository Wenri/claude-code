/**
 * Plugin and marketplace subcommand handlers — extracted from main.tsx for lazy loading.
 * These are dynamically imported only when `claude plugin *` or `claude plugin marketplace *` runs.
 */
/* eslint-disable custom-rules/no-process-exit -- CLI subcommand handlers intentionally exit */
import figures from 'figures'
import { basename, dirname } from 'path'
import React from 'react'
import { setUseCoworkPlugins } from '../../bootstrap/state.js'
import { Text, type Root } from '../../ink.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
  logEvent,
} from '../../services/analytics/index.js'
import {
  disableAllPlugins,
  disablePlugin,
  enablePlugin,
  installPlugin,
  prunePlugins,
  uninstallPlugin,
  updatePluginCli,
  VALID_INSTALLABLE_SCOPES,
  VALID_UPDATE_SCOPES,
} from '../../services/plugins/pluginCliCommands.js'
import { getPluginErrorMessage } from '../../types/plugin.js'
import { logForDebugging } from '../../utils/debug.js'
import { errorMessage } from '../../utils/errors.js'
import { gracefulShutdown } from '../../utils/gracefulShutdown.js'
import { logError } from '../../utils/log.js'
import { clearAllCaches } from '../../utils/plugins/cacheUtils.js'
import { formatDependencyCountSuffix } from '../../utils/plugins/dependencyResolver.js'
import { getInstallCounts } from '../../utils/plugins/installCounts.js'
import {
  isPluginInstalled,
  loadInstalledPluginsV2,
} from '../../utils/plugins/installedPluginsManager.js'
import {
  createPluginId,
  loadMarketplacesWithGracefulDegradation,
} from '../../utils/plugins/marketplaceHelpers.js'
import {
  addMarketplaceSource,
  loadKnownMarketplacesConfig,
  refreshAllMarketplaces,
  refreshMarketplace,
  removeMarketplaceSource,
  saveMarketplaceToSettings,
} from '../../utils/plugins/marketplaceManager.js'
import { loadPluginMcpServers } from '../../utils/plugins/mcpPluginIntegration.js'
import { parseMarketplaceInput } from '../../utils/plugins/parseMarketplaceInput.js'
import {
  parsePluginIdentifier,
  scopeToSettingSource,
} from '../../utils/plugins/pluginIdentifier.js'
import { loadAllPlugins } from '../../utils/plugins/pluginLoader.js'
import { resolveMissingDependencies } from '../../utils/plugins/missingDependencyResolver.js'
import type { PluginSource } from '../../utils/plugins/schemas.js'
import {
  type ValidationResult,
  executePluginTag,
  getPluginTagMessage,
  validateManifest,
  validatePluginContents,
  validatePluginRelease,
} from '../../utils/plugins/validatePlugin.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import { plural } from '../../utils/stringUtils.js'
import { RenderOnceAndExit } from '../../utils/staticRender.js'
import { cliError, cliOk } from '../exit.js'

// Re-export for main.tsx to reference in option definitions
export { VALID_INSTALLABLE_SCOPES, VALID_UPDATE_SCOPES }

/**
 * Helper function to handle marketplace command errors consistently.
 */
export function handleMarketplaceError(error: unknown, action: string): never {
  logError(error)
  cliError(`${figures.cross} Failed to ${action}: ${errorMessage(error)}`)
}

function formatValidationResult(result: ValidationResult): string[] {
  const lines: string[] = []
  if (result.errors.length > 0) {
    lines.push(
      `${figures.cross} Found ${result.errors.length} ${plural(result.errors.length, 'error')}:`,
      '',
    )
    result.errors.forEach(error => {
      lines.push(`  ${figures.pointer} ${error.path}: ${error.message}`)
    })
    lines.push('')
  }
  if (result.warnings.length > 0) {
    lines.push(
      `${figures.warning} Found ${result.warnings.length} ${plural(result.warnings.length, 'warning')}:`,
      '',
    )
    result.warnings.forEach(warning => {
      lines.push(`  ${figures.pointer} ${warning.path}: ${warning.message}`)
    })
    lines.push('')
  }
  return lines
}

function PromiseLines({ promise }: { promise: Promise<string[]> }): React.ReactNode {
  return React.createElement(
    Box,
    null,
    React.createElement(Text, null, React.use(promise).join('\n')),
  )
}

function MarketplaceUpdateResult({
  promise,
}: {
  promise: Promise<{ messages: string[]; success: string }>
}): React.ReactNode {
  const { messages, success } = React.use(promise)
  return React.createElement(
    Box,
    null,
    React.createElement(Text, null, [...messages, success].join('\n')),
  )
}

function PluginInstallResult({ promise }: { promise: Promise<string> }): React.ReactNode {
  return React.createElement(
    Box,
    null,
    React.createElement(Text, null, figures.tick, ' ', React.use(promise)),
  )
}

// plugin validate
export async function pluginValidateHandler(
  root: Root,
  manifestPath: string,
  options: { cowork?: boolean },
): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  try {
    const result = await validateManifest(manifestPath)

    // If this is a plugin manifest located inside a .claude-plugin directory,
    // also validate the plugin's content files (skills, agents, commands,
    // hooks). Works whether the user passed a directory or the plugin.json
    // path directly.
    let contentResults: ValidationResult[] = []
    if (result.fileType === 'plugin') {
      const manifestDir = dirname(result.filePath)
      if (basename(manifestDir) === '.claude-plugin') {
        contentResults = await validatePluginContents(dirname(manifestDir))
      }
    }

    const allSuccess = result.success && contentResults.every(r => r.success)
    const hasWarnings =
      result.warnings.length > 0 ||
      contentResults.some(r => r.warnings.length > 0)

    const lines = [
      `Validating ${result.fileType} manifest: ${result.filePath}`,
      '',
      ...formatValidationResult(result),
    ]
    for (const contentResult of contentResults) {
      lines.push(
        `Validating ${contentResult.fileType}: ${contentResult.filePath}`,
        '',
        ...formatValidationResult(contentResult),
      )
    }
    lines.push(
      allSuccess
        ? hasWarnings
          ? `${figures.tick} Validation passed with warnings`
          : `${figures.tick} Validation passed`
        : `${figures.cross} Validation failed`,
    )
    root.render(
      React.createElement(
        Box,
        null,
        React.createElement(Text, null, lines.join('\n')),
      ),
    )
    await root.waitUntilExit()
    process.exit(allSuccess ? 0 : 1)
  } catch (error) {
    logError(error)
    // biome-ignore lint/suspicious/noConsole:: intentional console output
    console.error(
      `${figures.cross} Unexpected error during validation: ${errorMessage(error)}`,
    )
    process.exit(2)
  }
}

export async function pluginTagHandler(
  root: Root,
  pluginPath: string | undefined,
  options: {
    push?: boolean
    dryRun?: boolean
    force?: boolean
    message?: string
    remote?: string
  },
): Promise<void> {
  const result = await validatePluginRelease(pluginPath ?? '.', {
    force: options.force,
  })
  const lines: string[] = []
  for (const warning of result.warnings) {
    lines.push(`${figures.warning} ${warning}`)
  }
  if (!result.ok) {
    lines.push(`${figures.cross} ${result.error}`)
    renderPluginTagResult(root, lines, 1)
    return
  }

  const { plan } = result
  lines.push(
    `Plugin:  ${plan.pluginName}`,
    `Version: ${plan.version} (from ${plan.versionFrom})`,
  )
  if (plan.marketplace) {
    lines.push(
      `Marketplace entry: plugins[${plan.marketplace.entryIndex}] in ${plan.marketplace.path}` +
        (plan.marketplace.entryVersion
          ? ` (version: ${plan.marketplace.entryVersion})`
          : ''),
    )
  }
  lines.push(`Tag:     ${plan.tag}`, '')

  const remote = options.remote ?? 'origin'
  const force = options.force ?? false
  const message = getPluginTagMessage(plan, options.message)
  const pushCommand = `git -C ${plan.gitRoot} push ${force ? '--force ' : ''}${remote} refs/tags/${plan.tag}`
  if (options.dryRun) {
    lines.push(
      `${figures.tick} Dry run — would create tag ${plan.tag} at HEAD in ${plan.gitRoot}`,
      `  git -C ${plan.gitRoot} tag ${force ? '-f ' : ''}-a ${plan.tag} -m ${jsonStringify(message)}`,
      `  ${pushCommand}`,
    )
    renderPluginTagResult(root, lines, 0)
    return
  }

  const execution = await executePluginTag(plan, {
    push: options.push ?? false,
    force,
    message: options.message,
    remote,
  })
  if (!execution.ok) {
    lines.push(`${figures.cross} ${execution.error}`)
    renderPluginTagResult(root, lines, 1)
    return
  }

  lines.push(`${figures.tick} Created tag ${plan.tag}`)
  if (execution.pushed) lines.push(`${figures.tick} Pushed to ${remote}`)
  else lines.push(`  Push with: ${pushCommand}`)
  renderPluginTagResult(root, lines, 0)
}

function renderPluginTagResult(
  root: Root,
  lines: string[],
  exitCode: number,
): void {
  root.render(
    React.createElement(
      RenderOnceAndExit,
      null,
      React.createElement(Text, null, lines.join('\n')),
    ),
  )
  void root.waitUntilExit().then(() => process.exit(exitCode))
}

// plugin list (lines 5217–5416)
export async function pluginListHandler(root: Root, options: {
  json?: boolean
  available?: boolean
  cowork?: boolean
}): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  logEvent('tengu_plugin_list_command', {})

  const installedData = loadInstalledPluginsV2()
  const { getPluginEditableScopes } = await import(
    '../../utils/plugins/pluginStartupCheck.js'
  )
  const enabledPlugins = getPluginEditableScopes()

  const pluginIds = Object.keys(installedData.plugins)

  // Load all plugins once. The JSON and human paths both need:
  //  - loadErrors (to show load failures per plugin)
  //  - inline plugins (session-only via --plugin-dir, source='name@inline')
  //    which are NOT in installedData.plugins (V2 bookkeeping) — they must
  //    be surfaced separately or `plugin list` silently ignores --plugin-dir.
  const {
    enabled: loadedEnabled,
    disabled: loadedDisabled,
    errors: loadErrors,
  } = await loadAllPlugins()
  const allLoadedPlugins = [...loadedEnabled, ...loadedDisabled]
  const inlinePlugins = allLoadedPlugins.filter(p =>
    p.source.endsWith('@inline'),
  )
  // Path-level inline failures (dir doesn't exist, parse error before
  // manifest is read) use source='inline[N]'. Plugin-level errors after
  // manifest read use source='name@inline'. Collect both for the session
  // section — these are otherwise invisible since they have no pluginId.
  const inlineLoadErrors = loadErrors.filter(
    e => e.source.endsWith('@inline') || e.source.startsWith('inline['),
  )

  if (options.json) {
    // Create a map of plugin source to loaded plugin for quick lookup
    const loadedPluginMap = new Map(allLoadedPlugins.map(p => [p.source, p]))

    const plugins: Array<{
      id: string
      version: string
      scope: string
      enabled: boolean
      installPath: string
      installedAt?: string
      lastUpdated?: string
      projectPath?: string
      mcpServers?: Record<string, unknown>
      errors?: string[]
    }> = []

    for (const pluginId of pluginIds.sort()) {
      const installations = installedData.plugins[pluginId]
      if (!installations || installations.length === 0) continue

      // Find loading errors for this plugin
      const pluginName = parsePluginIdentifier(pluginId).name
      const pluginErrors = loadErrors
        .filter(
          e =>
            e.source === pluginId || ('plugin' in e && e.plugin === pluginName),
        )
        .map(getPluginErrorMessage)

      for (const installation of installations) {
        // Try to find the loaded plugin to get MCP servers
        const loadedPlugin = loadedPluginMap.get(pluginId)
        let mcpServers: Record<string, unknown> | undefined

        if (loadedPlugin) {
          // Load MCP servers if not already cached
          const servers =
            loadedPlugin.mcpServers ||
            (await loadPluginMcpServers(loadedPlugin))
          if (servers && Object.keys(servers).length > 0) {
            mcpServers = servers
          }
        }

        plugins.push({
          id: pluginId,
          version: installation.version || 'unknown',
          scope: installation.scope,
          enabled: enabledPlugins.has(pluginId),
          installPath: installation.installPath,
          installedAt: installation.installedAt,
          lastUpdated: installation.lastUpdated,
          projectPath: installation.projectPath,
          mcpServers,
          errors: pluginErrors.length > 0 ? pluginErrors : undefined,
        })
      }
    }

    // Session-only plugins: scope='session', no install metadata.
    // Filter from inlineLoadErrors (not loadErrors) so an installed plugin
    // with the same manifest name doesn't cross-contaminate via e.plugin.
    // The e.plugin fallback catches the dirName≠manifestName case:
    // createPluginFromPath tags errors with `${dirName}@inline` but
    // plugin.source is reassigned to `${manifest.name}@inline` afterward
    // (pluginLoader.ts loadInlinePlugins), so e.source !== p.source when
    // a dev checkout dir like ~/code/my-fork/ has manifest name 'cool-plugin'.
    for (const p of inlinePlugins) {
      const servers = p.mcpServers || (await loadPluginMcpServers(p))
      const pErrors = inlineLoadErrors
        .filter(
          e => e.source === p.source || ('plugin' in e && e.plugin === p.name),
        )
        .map(getPluginErrorMessage)
      plugins.push({
        id: p.source,
        version: p.manifest.version ?? 'unknown',
        scope: 'session',
        enabled: p.enabled !== false,
        installPath: p.path,
        mcpServers:
          servers && Object.keys(servers).length > 0 ? servers : undefined,
        errors: pErrors.length > 0 ? pErrors : undefined,
      })
    }
    // Path-level inline failures (--plugin-dir /nonexistent): no LoadedPlugin
    // exists so the loop above can't surface them. Mirror the human-path
    // handling so JSON consumers see the failure instead of silent omission.
    for (const e of inlineLoadErrors.filter(e =>
      e.source.startsWith('inline['),
    )) {
      plugins.push({
        id: e.source,
        version: 'unknown',
        scope: 'session',
        enabled: false,
        installPath: 'path' in e ? e.path : '',
        errors: [getPluginErrorMessage(e)],
      })
    }

    // If --available is set, also load available plugins from marketplaces
    if (options.available) {
      const available: Array<{
        pluginId: string
        name: string
        description?: string
        marketplaceName: string
        version?: string
        source: PluginSource
        installCount?: number
      }> = []

      try {
        const [config, installCounts] = await Promise.all([
          loadKnownMarketplacesConfig(),
          getInstallCounts(),
        ])
        const { marketplaces } =
          await loadMarketplacesWithGracefulDegradation(config)

        for (const {
          name: marketplaceName,
          data: marketplace,
        } of marketplaces) {
          if (marketplace) {
            for (const entry of marketplace.plugins) {
              const pluginId = createPluginId(entry.name, marketplaceName)
              // Only include plugins that are not already installed
              if (!isPluginInstalled(pluginId)) {
                available.push({
                  pluginId,
                  name: entry.name,
                  description: entry.description,
                  marketplaceName,
                  version: entry.version,
                  source: entry.source,
                  installCount: installCounts?.get(pluginId),
                })
              }
            }
          }
        }
      } catch {
        // Silently ignore marketplace loading errors
      }

      root.render(
        React.createElement(
          Box,
          null,
          React.createElement(
            Text,
            null,
            jsonStringify({ installed: plugins, available }, null, 2),
          ),
        ),
      )
    } else {
      root.render(
        React.createElement(
          Box,
          null,
          React.createElement(Text, null, jsonStringify(plugins, null, 2)),
        ),
      )
    }
    await root.waitUntilExit()
    return
  }

  const lines: string[] = []
  if (pluginIds.length === 0 && inlinePlugins.length === 0) {
    // inlineLoadErrors can exist with zero inline plugins (e.g. --plugin-dir
    // points at a nonexistent path). Don't early-exit over them — fall
    // through to the session section so the failure is visible.
    if (inlineLoadErrors.length === 0) {
      lines.push(
        'No plugins installed. Use `claude plugin install` to install a plugin.',
      )
    }
  }

  if (pluginIds.length > 0) {
    lines.push('Installed plugins:', '')
  }

  for (const pluginId of pluginIds.sort()) {
    const installations = installedData.plugins[pluginId]
    if (!installations || installations.length === 0) continue

    // Find loading errors for this plugin
    const pluginName = parsePluginIdentifier(pluginId).name
    const pluginErrors = loadErrors.filter(
      e => e.source === pluginId || ('plugin' in e && e.plugin === pluginName),
    )

    for (const installation of installations) {
      const isEnabled = enabledPlugins.has(pluginId)
      const status =
        pluginErrors.length > 0
          ? `${figures.cross} failed to load`
          : isEnabled
            ? `${figures.tick} enabled`
            : `${figures.cross} disabled`
      const version = installation.version || 'unknown'
      const scope = installation.scope

      lines.push(`  ${figures.pointer} ${pluginId}`)
      lines.push(`    Version: ${version}`)
      lines.push(`    Scope: ${scope}`)
      lines.push(`    Status: ${status}`)
      for (const error of pluginErrors) {
        lines.push(`    Error: ${getPluginErrorMessage(error)}`)
      }
      lines.push('')
    }
  }

  if (inlinePlugins.length > 0 || inlineLoadErrors.length > 0) {
    lines.push('Session-only plugins (--plugin-dir):', '')
    for (const p of inlinePlugins) {
      // Same dirName≠manifestName fallback as the JSON path above — error
      // sources use the dir basename but p.source uses the manifest name.
      const pErrors = inlineLoadErrors.filter(
        e => e.source === p.source || ('plugin' in e && e.plugin === p.name),
      )
      const status =
        pErrors.length > 0
          ? `${figures.cross} loaded with errors`
          : `${figures.tick} loaded`
      lines.push(`  ${figures.pointer} ${p.source}`)
      lines.push(`    Version: ${p.manifest.version ?? 'unknown'}`)
      lines.push(`    Path: ${p.path}`)
      lines.push(`    Status: ${status}`)
      for (const e of pErrors) {
        lines.push(`    Error: ${getPluginErrorMessage(e)}`)
      }
      lines.push('')
    }
    // Path-level failures: no LoadedPlugin object exists. Show them so
    // `--plugin-dir /typo` doesn't just silently produce nothing.
    for (const e of inlineLoadErrors.filter(e =>
      e.source.startsWith('inline['),
    )) {
      lines.push(
        `  ${figures.pointer} ${e.source}: ${figures.cross} ${getPluginErrorMessage(e)}`,
        '',
      )
    }
  }

  root.render(
    React.createElement(
      Box,
      null,
      React.createElement(Text, null, lines.join('\n')),
    ),
  )
  await root.waitUntilExit()
}

// marketplace add (lines 5433–5487)
export async function marketplaceAddHandler(
  root: Root,
  source: string,
  options: { cowork?: boolean; sparse?: string[]; scope?: string },
): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  let marketplaceSource: MarketplaceSource
  let settingSource: ReturnType<typeof scopeToSettingSource>
  let scope: string
  try {
    const parsed = await parseMarketplaceInput(source)

    if (!parsed) {
      cliError(
        `${figures.cross} Invalid marketplace source format. Try: owner/repo, https://..., or ./path`,
      )
    }

    if ('error' in parsed) {
      cliError(`${figures.cross} ${parsed.error}`)
    }

    // Validate scope
    scope = options.scope ?? 'user'
    if (scope !== 'user' && scope !== 'project' && scope !== 'local') {
      cliError(
        `${figures.cross} Invalid scope '${scope}'. Use: user, project, or local`,
      )
    }
    settingSource = scopeToSettingSource(scope)

    marketplaceSource = parsed

    if (options.sparse && options.sparse.length > 0) {
      if (
        marketplaceSource.source === 'github' ||
        marketplaceSource.source === 'git'
      ) {
        marketplaceSource = {
          ...marketplaceSource,
          sparsePaths: options.sparse,
        }
      } else {
        cliError(
          `${figures.cross} --sparse is only supported for github and git marketplace sources (got: ${marketplaceSource.source})`,
        )
      }
    }

    // biome-ignore lint/suspicious/noConsole:: intentional console output
    console.log('Adding marketplace...')

    const { name, alreadyMaterialized, resolvedSource } =
      await addMarketplaceSource(marketplaceSource, message => {
        // biome-ignore lint/suspicious/noConsole:: intentional console output
        console.log(message)
      })

    // Write intent to settings at the requested scope
    saveMarketplaceToSettings(name, { source: resolvedSource }, settingSource)

    clearAllCaches()

    let sourceType = marketplaceSource.source
    if (marketplaceSource.source === 'github') {
      sourceType =
        marketplaceSource.repo as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
    }
    logEvent('tengu_marketplace_added', {
      source_type:
        sourceType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })

    let resolvedDependencies: string[] = []
    try {
      resolvedDependencies = (
        await resolveMissingDependencies((await loadAllPlugins()).errors)
      ).installed
    } catch (error) {
      logForDebugging(
        `marketplace add: dep auto-resolve skipped: ${errorMessage(error)}`,
        { level: 'warn' },
      )
    }
    const dependencySuffix = formatDependencyCountSuffix(resolvedDependencies)

    cliOk(
      alreadyMaterialized
        ? `${figures.tick} Marketplace '${name}' already on disk — declared in ${scope} settings${dependencySuffix}`
        : `${figures.tick} Successfully added marketplace: ${name} (declared in ${scope} settings)${dependencySuffix}`,
    )
  } catch (error) {
    return handleMarketplaceError(error, 'add marketplace')
  }

  const resultPromise = (async (): Promise<string[]> => {
    try {
      const messages: string[] = []
      const { name, alreadyMaterialized, resolvedSource } =
        await addMarketplaceSource(marketplaceSource, message => {
          messages.push(message)
        })

      saveMarketplaceToSettings(name, { source: resolvedSource }, settingSource)
      clearAllCaches()

      let sourceType = marketplaceSource.source
      if (marketplaceSource.source === 'github') {
        sourceType =
          marketplaceSource.repo as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
      }
      logEvent('tengu_marketplace_added', {
        source_type:
          sourceType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
      messages.push(
        alreadyMaterialized
          ? `${figures.tick} Marketplace '${name}' already on disk — declared in ${scope} settings`
          : `${figures.tick} Successfully added marketplace: ${name} (declared in ${scope} settings)`,
      )
      return messages
    } catch (error) {
      return handleMarketplaceError(error, 'add marketplace')
    }
  })()

  root.render(
    React.createElement(
      React.Suspense,
      { fallback: React.createElement(Text, null, 'Adding marketplace…') },
      React.createElement(PromiseLines, { promise: resultPromise }),
    ),
  )
  await root.waitUntilExit()
  process.exit(0)
}

// marketplace list (lines 5497–5565)
export async function marketplaceListHandler(root: Root, options: {
  json?: boolean
  cowork?: boolean
}): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  try {
    const config = await loadKnownMarketplacesConfig()
    const names = Object.keys(config)

    let output: React.ReactNode
    if (options.json) {
      const marketplaces = names.sort().map(name => {
        const marketplace = config[name]
        const source = marketplace?.source
        return {
          name,
          source: source?.source,
          ...(source?.source === 'github' && { repo: source.repo }),
          ...(source?.source === 'git' && { url: source.url }),
          ...(source?.source === 'url' && { url: source.url }),
          ...(source?.source === 'directory' && { path: source.path }),
          ...(source?.source === 'file' && { path: source.path }),
          installLocation: marketplace?.installLocation,
        }
      })
      output = React.createElement(
        Text,
        null,
        jsonStringify(marketplaces, null, 2),
      )
    } else if (names.length === 0) {
      output = React.createElement(Text, null, 'No marketplaces configured')
    } else {
      const lines = ['Configured marketplaces:', '']
      names.forEach(name => {
        const marketplace = config[name]
        lines.push(`  ${figures.pointer} ${name}`)

        if (marketplace?.source) {
          const src = marketplace.source
          if (src.source === 'github') {
            lines.push(`    Source: GitHub (${src.repo})`)
          } else if (src.source === 'git') {
            lines.push(`    Source: Git (${src.url})`)
          } else if (src.source === 'url') {
            lines.push(`    Source: URL (${src.url})`)
          } else if (src.source === 'directory') {
            lines.push(`    Source: Directory (${src.path})`)
          } else if (src.source === 'file') {
            lines.push(`    Source: File (${src.path})`)
          }
        }
        lines.push('')
      })
      output = React.createElement(Text, null, lines.join('\n'))
    }

    root.render(React.createElement(Box, null, output))
    await root.waitUntilExit()
  } catch (error) {
    handleMarketplaceError(error, 'list marketplaces')
  }
}

// marketplace remove (lines 5576–5598)
export async function marketplaceRemoveHandler(
  root: Root,
  name: string,
  options: { cowork?: boolean },
): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  try {
    await removeMarketplaceSource(name)
    clearAllCaches()

    logEvent('tengu_marketplace_removed', {
      marketplace_name:
        name as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })

    root.render(
      React.createElement(
        Box,
        null,
        React.createElement(
          Text,
          null,
          figures.tick,
          ' Successfully removed marketplace: ',
          name,
        ),
      ),
    )
    await root.waitUntilExit()
  } catch (error) {
    handleMarketplaceError(error, 'remove marketplace')
  }
}

// marketplace update (lines 5609–5672)
export async function marketplaceUpdateHandler(
  root: Root,
  name: string | undefined,
  options: { cowork?: boolean },
): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  let fallback: string
  let resultPromise: Promise<{ messages: string[]; success: string }>
  if (name) {
    fallback = `Updating marketplace: ${name}...`
    const messages: string[] = []
    resultPromise = refreshMarketplace(name, message => {
      messages.push(message)
    })
      .then(() => {
        clearAllCaches()
        logEvent('tengu_marketplace_updated', {
          marketplace_name:
            name as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
        return {
          messages,
          success: `${figures.tick} Successfully updated marketplace: ${name}`,
        }
      })
      .catch(error => handleMarketplaceError(error, 'update marketplace(s)'))
  } else {
    let config: Awaited<ReturnType<typeof loadKnownMarketplacesConfig>>
    try {
      config = await loadKnownMarketplacesConfig()
    } catch (error) {
      return handleMarketplaceError(error, 'update marketplace(s)')
    }
    const marketplaceNames = Object.keys(config)
    if (marketplaceNames.length === 0) {
      root.render(
        React.createElement(
          Box,
          null,
          React.createElement(Text, null, 'No marketplaces configured'),
        ),
      )
      await root.waitUntilExit()
      process.exit(0)
      return
    }
    fallback = `Updating ${marketplaceNames.length} marketplace(s)...`
    resultPromise = refreshAllMarketplaces()
      .then(() => {
        clearAllCaches()
        logEvent('tengu_marketplace_updated_all', {
          count:
            marketplaceNames.length as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
        return {
          messages: [],
          success: `${figures.tick} Successfully updated ${marketplaceNames.length} marketplace(s)`,
        }
      })
      .catch(error => handleMarketplaceError(error, 'update marketplace(s)'))
  }
  root.render(
    React.createElement(
      React.Suspense,
      { fallback: React.createElement(Text, null, fallback) },
      React.createElement(MarketplaceUpdateResult, {
        promise: resultPromise,
      }),
    ),
  )
  await root.waitUntilExit()
  process.exit(0)
}

// plugin install (lines 5690–5721)
export async function pluginInstallHandler(
  root: Root,
  plugin: string,
  options: { scope?: string; cowork?: boolean },
): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  const scope = options.scope || 'user'
  if (options.cowork && scope !== 'user') {
    cliError('--cowork can only be used with user scope')
  }
  if (
    !VALID_INSTALLABLE_SCOPES.includes(
      scope as (typeof VALID_INSTALLABLE_SCOPES)[number],
    )
  ) {
    cliError(
      `Invalid scope: ${scope}. Must be one of: ${VALID_INSTALLABLE_SCOPES.join(', ')}.`,
    )
  }
  // _PROTO_* routes to PII-tagged plugin_name/marketplace_name BQ columns.
  // Unredacted plugin arg was previously logged to general-access
  // additional_metadata for all users — dropped in favor of the privileged
  // column route. marketplace may be undefined (fires before resolution).
  const { name, marketplace } = parsePluginIdentifier(plugin)
  logEvent('tengu_plugin_install_command', {
    _PROTO_plugin_name: name as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    ...(marketplace && {
      _PROTO_marketplace_name:
        marketplace as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    }),
    scope: scope as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  const resultPromise = installPlugin(
    plugin,
    scope as 'user' | 'project' | 'local',
  )
  root.render(
    React.createElement(
      React.Suspense,
      {
        fallback: React.createElement(
          Text,
          null,
          `Installing plugin "${plugin}"...`,
        ),
      },
      React.createElement(PluginInstallResult, { promise: resultPromise }),
    ),
  )
  await root.waitUntilExit()
  await gracefulShutdown(0)
}

// plugin uninstall (lines 5738–5769)
export async function pluginUninstallHandler(
  root: Root,
  plugin: string,
  options: {
    scope?: string
    cowork?: boolean
    keepData?: boolean
    prune?: boolean
    yes?: boolean
  },
): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  const scope = options.scope || 'user'
  if (options.cowork && scope !== 'user') {
    cliError('--cowork can only be used with user scope')
  }
  if (
    !VALID_INSTALLABLE_SCOPES.includes(
      scope as (typeof VALID_INSTALLABLE_SCOPES)[number],
    )
  ) {
    cliError(
      `Invalid scope: ${scope}. Must be one of: ${VALID_INSTALLABLE_SCOPES.join(', ')}.`,
    )
  }
  const { name, marketplace } = parsePluginIdentifier(plugin)
  logEvent('tengu_plugin_uninstall_command', {
    _PROTO_plugin_name: name as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    ...(marketplace && {
      _PROTO_marketplace_name:
        marketplace as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    }),
    scope: scope as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  const message = await uninstallPlugin(
    plugin,
    scope as 'user' | 'project' | 'local',
    options.keepData,
    options.prune,
    options.yes,
  )
  root.render(
    React.createElement(
      Box,
      null,
      React.createElement(Text, null, figures.tick, ' ', message),
    ),
  )
  await root.waitUntilExit()
  process.exit(0)
}

export async function pluginPruneHandler(options: {
  scope?: string
  cowork?: boolean
  dryRun?: boolean
  yes?: boolean
}): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  const scope = options.scope || 'user'
  if (options.cowork && scope !== 'user') {
    cliError('--cowork can only be used with user scope')
  }
  if (
    !VALID_INSTALLABLE_SCOPES.includes(
      scope as (typeof VALID_INSTALLABLE_SCOPES)[number],
    )
  ) {
    cliError(
      `Invalid scope: ${scope}. Must be one of: ${VALID_INSTALLABLE_SCOPES.join(', ')}.`,
    )
  }
  logEvent('tengu_plugin_prune_command', {
    scope: scope as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    dry_run: options.dryRun ?? false,
  })
  await prunePlugins(scope as 'user' | 'project' | 'local', {
    dryRun: options.dryRun,
    yes: options.yes,
  })
}

// plugin enable (lines 5783–5818)
export async function pluginEnableHandler(
  root: Root,
  plugin: string,
  options: { scope?: string; cowork?: boolean },
): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  let scope: (typeof VALID_INSTALLABLE_SCOPES)[number] | undefined
  if (options.scope) {
    if (
      !VALID_INSTALLABLE_SCOPES.includes(
        options.scope as (typeof VALID_INSTALLABLE_SCOPES)[number],
      )
    ) {
      cliError(
        `Invalid scope "${options.scope}". Valid scopes: ${VALID_INSTALLABLE_SCOPES.join(', ')}`,
      )
    }
    scope = options.scope as (typeof VALID_INSTALLABLE_SCOPES)[number]
  }
  if (options.cowork && scope !== undefined && scope !== 'user') {
    cliError('--cowork can only be used with user scope')
  }

  // --cowork always operates at user scope
  if (options.cowork && scope === undefined) {
    scope = 'user'
  }

  const { name, marketplace } = parsePluginIdentifier(plugin)
  logEvent('tengu_plugin_enable_command', {
    _PROTO_plugin_name: name as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    ...(marketplace && {
      _PROTO_marketplace_name:
        marketplace as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    }),
    scope: (scope ??
      'auto') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  const message = await enablePlugin(plugin, scope)
  root.render(
    React.createElement(
      Box,
      null,
      React.createElement(Text, null, figures.tick, ' ', message),
    ),
  )
  await root.waitUntilExit()
}

// plugin disable (lines 5833–5902)
export async function pluginDisableHandler(
  root: Root,
  plugin: string | undefined,
  options: { scope?: string; cowork?: boolean; all?: boolean },
): Promise<void> {
  if (options.all && plugin) {
    cliError('Cannot use --all with a specific plugin')
  }

  if (!options.all && !plugin) {
    cliError('Please specify a plugin name or use --all to disable all plugins')
  }

  if (options.cowork) setUseCoworkPlugins(true)

  if (options.all) {
    if (options.scope) {
      cliError('Cannot use --scope with --all')
    }

    // No _PROTO_plugin_name here — --all disables all plugins.
    // Distinguishable from the specific-plugin branch by plugin_name IS NULL.
    logEvent('tengu_plugin_disable_command', {})

    const message = await disableAllPlugins()
    root.render(
      React.createElement(
        Box,
        null,
        React.createElement(Text, null, message),
      ),
    )
    await root.waitUntilExit()
    process.exit(0)
    return
  }

  let scope: (typeof VALID_INSTALLABLE_SCOPES)[number] | undefined
  if (options.scope) {
    if (
      !VALID_INSTALLABLE_SCOPES.includes(
        options.scope as (typeof VALID_INSTALLABLE_SCOPES)[number],
      )
    ) {
      cliError(
        `Invalid scope "${options.scope}". Valid scopes: ${VALID_INSTALLABLE_SCOPES.join(', ')}`,
      )
    }
    scope = options.scope as (typeof VALID_INSTALLABLE_SCOPES)[number]
  }
  if (options.cowork && scope !== undefined && scope !== 'user') {
    cliError('--cowork can only be used with user scope')
  }

  // --cowork always operates at user scope
  if (options.cowork && scope === undefined) {
    scope = 'user'
  }

  const { name, marketplace } = parsePluginIdentifier(plugin!)
  logEvent('tengu_plugin_disable_command', {
    _PROTO_plugin_name: name as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    ...(marketplace && {
      _PROTO_marketplace_name:
        marketplace as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    }),
    scope: (scope ??
      'auto') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  const message = await disablePlugin(plugin!, scope)
  root.render(
    React.createElement(
      Box,
      null,
      React.createElement(Text, null, message),
    ),
  )
  await root.waitUntilExit()
  process.exit(0)
}

// plugin update (lines 5918–5948)
export async function pluginUpdateHandler(
  plugin: string,
  options: { scope?: string; cowork?: boolean },
): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  const { name, marketplace } = parsePluginIdentifier(plugin)
  logEvent('tengu_plugin_update_command', {
    _PROTO_plugin_name: name as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    ...(marketplace && {
      _PROTO_marketplace_name:
        marketplace as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    }),
  })

  let scope: (typeof VALID_UPDATE_SCOPES)[number] = 'user'
  if (options.scope) {
    if (
      !VALID_UPDATE_SCOPES.includes(
        options.scope as (typeof VALID_UPDATE_SCOPES)[number],
      )
    ) {
      cliError(
        `Invalid scope "${options.scope}". Valid scopes: ${VALID_UPDATE_SCOPES.join(', ')}`,
      )
    }
    scope = options.scope as (typeof VALID_UPDATE_SCOPES)[number]
  }
  if (options.cowork && scope !== 'user') {
    cliError('--cowork can only be used with user scope')
  }

  await updatePluginCli(plugin, scope)
}
