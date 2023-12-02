import chalk from 'chalk'
import type { LocalCommandCall } from '../../types/command.js'
import {
  getRelaunchLauncher,
  relaunch,
  type RelaunchLauncher,
} from '../../utils/relaunch.js'
import { which } from '../../utils/which.js'

export async function resolveLauncher(): Promise<RelaunchLauncher> {
  const installedLauncher = await which('claude')
  return installedLauncher
    ? { cmd: installedLauncher, prefixArgs: [] }
    : getRelaunchLauncher()
}

export const call: LocalCommandCall = async (_args, context) => {
  const teamName = context.getAppState().teamContext?.teamName
  const assistantTeamName = teamName?.startsWith('assistant-')
    ? teamName
    : undefined

  return relaunch({
    launcher: await resolveLauncher(),
    env: assistantTeamName
      ? { CLAUDE_INTERNAL_ASSISTANT_TEAM_NAME: assistantTeamName }
      : undefined,
    preSpawn: () => {
      process.stdout.write(
        chalk.dim(
          `\nSwitching from ${MACRO.VERSION} to latest… conversation will continue\n\n`,
        ),
      )
    },
  })
}
