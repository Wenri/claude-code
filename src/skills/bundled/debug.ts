import { getJobsDir } from 'src/daemon/jobs.js'
import { getDaemonLockPath } from 'src/daemon/lock.js'
import { getDaemonStatusPath, getRosterPath } from 'src/daemon/paths.js'
import { getDefaultDaemonLogPath } from 'src/daemon/service.js'
import { CLAUDE_CODE_GUIDE_AGENT_TYPE } from 'src/tools/AgentTool/built-in/claudeCodeGuideAgent.js'
import { tailFile } from 'src/utils/fsOperations.js'
import { getSettingsFilePathForSource } from 'src/utils/settings/settings.js'
import { enableDebugLogging, getDebugLogPath } from '../../utils/debug.js'
import { errorMessage, isENOENT } from '../../utils/errors.js'
import { formatFileSize } from '../../utils/format.js'
import { registerBundledSkill } from '../bundledSkills.js'

const DEFAULT_DEBUG_LINES_READ = 20
const TAIL_READ_BYTES = 64 * 1024
const STATE_READ_BYTES = 8 * 1024

async function readLogTail(logPath: string): Promise<string> {
  try {
    const { content, bytesTotal } = await tailFile(logPath, TAIL_READ_BYTES)
    const tail = content
      .split('\n')
      .slice(-DEFAULT_DEBUG_LINES_READ)
      .join('\n')
    return `Log size: ${formatFileSize(bytesTotal)}\n\n### Last ${DEFAULT_DEBUG_LINES_READ} lines\n\n\`\`\`\n${tail}\n\`\`\``
  } catch (error) {
    return isENOENT(error)
      ? 'No log file exists yet.'
      : `Failed to read last ${DEFAULT_DEBUG_LINES_READ} lines: ${errorMessage(error)}`
  }
}

async function readDaemonState(path: string): Promise<string | null> {
  try {
    return (await tailFile(path, STATE_READ_BYTES)).content
  } catch (error) {
    return isENOENT(error) ? null : `(read error: ${errorMessage(error)})`
  }
}

async function getDaemonDebugContext(): Promise<string> {
  const logPath = getDefaultDaemonLogPath()
  const [lock, status, logTail] = await Promise.all([
    readDaemonState(getDaemonLockPath()),
    readDaemonState(getDaemonStatusPath()),
    readLogTail(logPath),
  ])

  if (lock === null && status === null) {
    return `## Daemon\n\nNo daemon lock or status file found — the background daemon does not appear to be running. If the issue involves background sessions or \`claude agents\`, the daemon log (if any) is at \`${logPath}\`.`
  }

  return `## Daemon

The background daemon manages \`& <prompt>\` jobs and \`claude agents\`. If the issue involves background sessions, look here.

### daemon.lock
\`\`\`json
${lock ?? '(missing)'}
\`\`\`

### daemon.status.json
\`\`\`json
${status ?? '(missing)'}
\`\`\`

### Daemon log (\`${logPath}\`)
${logTail}

Other daemon state on disk (Read if relevant — roster contains user prompts and env vars):
- \`${getRosterPath()}\` — live worker roster
- \`${getJobsDir()}/<short>/state.json\` — per-job state`
}

export function registerDebugSkill(): void {
  registerBundledSkill({
    name: 'debug',
    description:
      process.env.USER_TYPE === 'ant'
        ? 'Debug your current Claude Code session by reading the session debug log. Includes all event logging'
        : 'Enable debug logging for this session and help diagnose issues',
    allowedTools: ['Read', 'Grep', 'Glob'],
    argumentHint: '[issue description]',
    // disableModelInvocation so that the user has to explicitly request it in
    // interactive mode and so the description does not take up context.
    disableModelInvocation: true,
    userInvocable: true,
    async getPromptForCommand(args) {
      // Non-ants don't write debug logs by default — turn logging on now so
      // subsequent activity in this session is captured.
      const wasAlreadyLogging = enableDebugLogging()
      const debugLogPath = getDebugLogPath()
      const [logInfo, daemonContext] = await Promise.all([
        readLogTail(debugLogPath),
        getDaemonDebugContext(),
      ])

      const justEnabledSection = wasAlreadyLogging
        ? ''
        : `
## Debug Logging Just Enabled

Debug logging was OFF for this session until now. Nothing prior to this /debug invocation was captured.

Tell the user that debug logging is now active at \`${debugLogPath}\`, ask them to reproduce the issue, then re-read the log. If they can't reproduce, they can also restart with \`claude --debug\` to capture logs from startup.
`

      const prompt = `# Debug Skill

Help the user debug an issue they're encountering in this current Claude Code session.
${justEnabledSection}
## Session Debug Log

The debug log for the current session is at: \`${debugLogPath}\`

${logInfo}

For additional context, grep for [ERROR] and [WARN] lines across the full file.

${daemonContext}

## Issue Description

${args || 'The user did not describe a specific issue. Read the debug log and summarize any errors, warnings, or notable issues.'}

## Settings

Remember that settings are in:
* user - ${getSettingsFilePathForSource('userSettings')}
* project - ${getSettingsFilePathForSource('projectSettings')}
* local - ${getSettingsFilePathForSource('localSettings')}

## Instructions

1. Review the user's issue description
2. The last ${DEFAULT_DEBUG_LINES_READ} lines show the debug file format. Look for [ERROR] and [WARN] entries, stack traces, and failure patterns across the file
3. Consider launching the ${CLAUDE_CODE_GUIDE_AGENT_TYPE} subagent to understand the relevant Claude Code features
4. Explain what you found in plain language
5. Suggest concrete fixes or next steps
`
      return [{ type: 'text', text: prompt }]
    },
  })
}
