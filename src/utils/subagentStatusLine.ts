import { z } from 'zod/v4'
import { getProjectRoot } from '../bootstrap/state.js'
import { describeTeammateActivity } from '../components/tasks/taskStatusUtils.js'
import type { LocalAgentTaskState } from '../tasks/LocalAgentTask/LocalAgentTask.js'
import type { TaskState } from '../tasks/types.js'
import { getCwd } from './cwd.js'
import { logForDebugging } from './debug.js'
import { execFileNoThrowWithCwd } from './execFileNoThrow.js'
import { createBaseHookInput, shouldSkipHookDueToTrust } from './hooks.js'
import {
  shouldAllowManagedHooksOnly,
  shouldDisableAllHooksIncludingManaged,
} from './hooks/hooksConfigSnapshot.js'
import { getPlatform } from './platform.js'
import {
  getSettings_DEPRECATED,
  getSettingsForSource,
} from './settings/settings.js'
import { buildPowerShellArgs } from './shell/powershellProvider.js'
import { getCachedPowerShellPath } from './shell/powershellDetection.js'
import { jsonParse, jsonStringify } from './slowOperations.js'
import { subprocessEnv } from './subprocessEnv.js'
import {
  findGitBashPath,
  windowsPathToPosixPath,
} from './windowsPaths.js'

export const SUBAGENT_STATUS_LINE_TIMEOUT_MS = 5_000
export const SUBAGENT_STATUS_LINE_TOKEN_SAMPLE_LIMIT = 16

const SubagentStatusLineOutputSchema = z.object({
  id: z.string(),
  content: z.string(),
})

export type SubagentTaskDecoration = {
  content: string
}

export type SubagentTaskDecorations = Record<
  string,
  SubagentTaskDecoration
>

export type SubagentStatusLineTask = {
  id: string
  name: string | undefined
  type: TaskState['type']
  status: LocalAgentTaskState['status']
  description: string
  label: string
  startTime: number
  tokenCount: number
  tokenSamples: number[]
  cwd: string
}

/**
 * Retain a bounded token-count history for each currently visible agent.
 * Missing task ids are deliberately discarded so a later task cannot inherit
 * samples from an evicted row with the same display position.
 */
export function updateSubagentTokenSamples(
  samples: Map<string, number[]>,
  tasks: ReadonlyArray<{ id: string; tokenCount: number }>,
): void {
  const currentIds = new Set<string>()
  for (const { id, tokenCount } of tasks) {
    currentIds.add(id)
    let history = samples.get(id)
    if (!history) {
      history = []
      samples.set(id, history)
    }
    history.push(tokenCount)
    if (history.length > SUBAGENT_STATUS_LINE_TOKEN_SAMPLE_LIMIT) {
      history.splice(
        0,
        history.length - SUBAGENT_STATUS_LINE_TOKEN_SAMPLE_LIMIT,
      )
    }
  }
  for (const id of samples.keys()) {
    if (!currentIds.has(id)) samples.delete(id)
  }
}

function getTaskLabel(task: TaskState): string | undefined {
  if ('label' in task && typeof task.label === 'string') return task.label
  if (task.type === 'local_agent') return task.progress?.summary
  if (task.type === 'local_bash' && task.kind !== 'monitor') {
    return task.command
  }
  if (task.type === 'local_workflow') {
    const workflow = task as TaskState & {
      workflowName?: string
      summary?: string
    }
    return workflow.workflowName ?? workflow.summary
  }
  if (task.type === 'remote_agent') return task.title
  if (task.type === 'in_process_teammate') {
    return describeTeammateActivity(task)
  }
  return undefined
}

function getSubagentStatusLineCommand(): string | undefined {
  const statusLine = shouldAllowManagedHooksOnly()
    ? getSettingsForSource('policySettings')?.subagentStatusLine
    : getSettings_DEPRECATED()?.subagentStatusLine
  return statusLine?.type === 'command' ? statusLine.command : undefined
}

/**
 * Execute the configured row decorator once. The command receives one JSON
 * document on stdin and emits newline-delimited `{id, content}` documents.
 * Invalid lines are isolated so one malformed task does not suppress valid
 * decorations for the remaining rows.
 */
export async function executeSubagentStatusLine(
  tasks: LocalAgentTaskState[],
  columns: number,
  namesByTaskId: ReadonlyMap<string, string>,
  tokenSamples: ReadonlyMap<string, number[]>,
): Promise<SubagentTaskDecorations> {
  if (shouldDisableAllHooksIncludingManaged()) return {}
  if (shouldSkipHookDueToTrust()) {
    logForDebugging(
      'Skipping subagentStatusLine execution - workspace trust not accepted',
    )
    return {}
  }

  const command = getSubagentStatusLineCommand()
  if (command === undefined || tasks.length === 0) return {}

  const cwd = getCwd()
  const input = {
    ...createBaseHookInput(),
    columns,
    tasks: tasks.map(
      (task): SubagentStatusLineTask => ({
        id: task.id,
        name: namesByTaskId.get(task.id),
        type: task.type,
        status: task.status,
        description: task.description,
        label: getTaskLabel(task) || task.description,
        startTime: task.startTime,
        tokenCount: task.progress?.tokenCount ?? 0,
        tokenSamples: tokenSamples.get(task.id) ?? [],
        cwd: task.cwd ?? cwd,
      }),
    ),
  }

  const isWindows = getPlatform() === 'windows'
  const gitBashPath = isWindows ? findGitBashPath() : null
  const powerShellPath = isWindows && !gitBashPath
    ? await getCachedPowerShellPath()
    : null
  const projectPath = isWindows && gitBashPath
    ? windowsPathToPosixPath(getProjectRoot())
    : getProjectRoot()
  const options = {
    cwd,
    env: {
      ...subprocessEnv(),
      CLAUDE_PROJECT_DIR: projectPath,
    },
    timeout: SUBAGENT_STATUS_LINE_TIMEOUT_MS,
    input: jsonStringify(input),
    preserveOutputOnError: true,
  }

  const result = powerShellPath
    ? await execFileNoThrowWithCwd(
        powerShellPath,
        buildPowerShellArgs(command),
        options,
      )
    : await execFileNoThrowWithCwd(command, [], {
        ...options,
        shell: isWindows ? (gitBashPath ?? true) : true,
      })

  if (result.code !== 0) {
    logForDebugging(
      `subagentStatusLine exited ${result.code}: ${result.error ?? result.stderr}`,
      { level: 'error' },
    )
    return {}
  }

  const decorations: SubagentTaskDecorations = {}
  for (const line of result.stdout.split('\n')) {
    if (!line.trim()) continue
    let parsed: unknown
    try {
      parsed = jsonParse(line)
    } catch {
      logForDebugging(
        `subagentStatusLine emitted non-JSON line: ${line}`,
        { level: 'error' },
      )
      continue
    }
    const validated = SubagentStatusLineOutputSchema.safeParse(parsed)
    if (!validated.success) {
      logForDebugging(
        `subagentStatusLine emitted invalid schema: ${validated.error.message}`,
        { level: 'error' },
      )
      continue
    }
    decorations[validated.data.id] = {
      content: validated.data.content,
    }
  }
  return decorations
}
