import chalk from 'chalk'
import type { LocalCommandCall } from '../../types/command.js'
import {
  getRelaunchLauncher,
  getRelaunchCwd,
  relaunch,
  type RelaunchLauncher,
} from '../../utils/relaunch.js'
import { getSessionId } from '../../bootstrap/state.js'
import { getProjectDir, getTranscriptPath } from '../../utils/sessionStorage.js'
import { join } from 'path'
import { logEvent } from '../../services/analytics/index.js'
import { which } from '../../utils/which.js'

export async function resolveLauncher(): Promise<RelaunchLauncher> {
  const installedLauncher = await which('claude')
  return installedLauncher
    ? { cmd: installedLauncher, prefixArgs: [] }
    : getRelaunchLauncher()
}

export const call: LocalCommandCall = async (_args, context) => {
  const tasks = context.getAppState().tasks
  if (
    Object.values(tasks).some(
      task => task.status === 'running' || task.status === 'pending',
    )
  ) {
    logEvent('tengu_update_refused', { active_tasks: true })
    return {
      type: 'text',
      value:
        'Cannot /update while background tasks are running — wait for them to finish, then try again.',
    }
  }

  const transcriptPath = getTranscriptPath()
  const expectedTranscriptPath = join(
    getProjectDir(getRelaunchCwd()),
    `${getSessionId()}.jsonl`,
  )
  if (transcriptPath && transcriptPath !== expectedTranscriptPath) {
    logEvent('tengu_update_refused', { transcript_path_drift: true })
    return {
      type: 'text',
      value:
        'Cannot /update — this session was resumed from a different project directory. Restart manually with --resume to continue on the latest version.',
    }
  }

  const teamName = context.getAppState().teamContext?.teamName
  const assistantTeamName = teamName?.startsWith('assistant-')
    ? teamName
    : undefined

  return relaunch({
    launcher: await resolveLauncher(),
    freshIfNoTranscript: true,
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
