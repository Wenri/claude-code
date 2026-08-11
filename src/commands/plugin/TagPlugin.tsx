import figures from 'figures'
import React, { useEffect } from 'react'
import { Box, Text } from '../../ink.js'
import {
  executePluginTag,
  getPluginTagMessage,
  validatePluginRelease,
} from '../../utils/plugins/validatePlugin.js'

export const PLUGIN_TAG_USAGE = `Usage: /plugin tag [path] [--push] [--dry-run] [-f|--force]

Create a {name}--v{version} git tag for the plugin at <path> (default: .).
Validates plugin.json and any enclosing marketplace entry agree on the version.

For -m/--message and --remote, use the CLI: claude plugin tag --help`

type Props = {
  onComplete: (result?: string) => void
  path?: string
  push: boolean
  dryRun: boolean
  force: boolean
  unknownFlag?: string
}

export function TagPlugin({
  onComplete,
  path,
  push,
  dryRun,
  force,
  unknownFlag,
}: Props): React.ReactNode {
  useEffect(() => {
    void run()

    async function run(): Promise<void> {
      if (unknownFlag !== undefined) {
        onComplete(
          unknownFlag === '--help' || unknownFlag === '-h'
            ? PLUGIN_TAG_USAGE
            : `${figures.cross} Unexpected argument "${unknownFlag}".\n\n${PLUGIN_TAG_USAGE}`,
        )
        return
      }

      const result = await validatePluginRelease(path ?? '.', { force })
      const lines = result.warnings.map(formatPluginReleaseWarning)
      if (!result.ok) {
        lines.push(`${figures.cross} ${result.error}`)
        onComplete(lines.join('\n'))
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

      const pushCommand = `git -C ${plan.gitRoot} push ${force ? '--force ' : ''}origin refs/tags/${plan.tag}`
      if (dryRun) {
        lines.push(
          `${figures.tick} Dry run — would create tag ${plan.tag} at HEAD in ${plan.gitRoot}`,
          `  git -C ${plan.gitRoot} tag ${force ? '-f ' : ''}-a ${plan.tag} -m "${getPluginTagMessage(plan)}"`,
          `  ${pushCommand}`,
        )
        onComplete(lines.join('\n'))
        return
      }

      const execution = await executePluginTag(plan, {
        push,
        force,
        message: undefined,
        remote: 'origin',
      })
      if (!execution.ok) {
        lines.push(`${figures.cross} ${execution.error}`)
        onComplete(lines.join('\n'))
        return
      }

      lines.push(`${figures.tick} Created tag ${plan.tag}`)
      lines.push(
        execution.pushed
          ? `${figures.tick} Pushed to origin`
          : `  Push with: ${pushCommand}`,
      )
      lines.push(
        '',
        'For -m/--message and --remote, use: claude plugin tag --help',
      )
      onComplete(lines.join('\n'))
    }
  }, [onComplete, path, push, dryRun, force, unknownFlag])

  return (
    <Box flexDirection="column">
      <Text>Preparing tag…</Text>
    </Box>
  )
}

function formatPluginReleaseWarning(warning: string): string {
  return `${figures.warning} ${warning}`
}
