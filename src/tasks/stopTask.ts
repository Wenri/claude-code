// Shared logic for stopping a running task.
// Used by TaskStopTool (LLM-invoked) and SDK stop_task control request.

import {
  STATUS_TAG,
  SUMMARY_TAG,
  TASK_ID_TAG,
  TASK_NOTIFICATION_TAG,
  TOOL_USE_ID_TAG,
} from '../constants/xml.js'
import type { SetAppState } from '../Task.js'
import { getTaskByType } from '../tasks.js'
import { asAgentId, type AgentId } from '../types/ids.js'
import { getAgentContext } from '../utils/agentContext.js'
import { enqueuePendingNotification } from '../utils/messageQueueManager.js'
import { emitTaskTerminatedSdk } from '../utils/sdkEventQueue.js'
import type { TaskRegistry } from '../utils/task/framework.js'
import { escapeXml } from '../utils/xml.js'
import { isLocalShellTask } from './LocalShellTask/guards.js'

export class StopTaskError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'not_found'
      | 'not_running'
      | 'not_owner'
      | 'unsupported_type',
  ) {
    super(message)
    this.name = 'StopTaskError'
  }
}

type StopTaskContext = {
  taskRegistry: TaskRegistry
  setAppState: SetAppState
  callerAgentId?: AgentId
}

type StopTaskResult = {
  taskId: string
  taskType: string
  command: string | undefined
}

export function getTaskStopCallerAgentId(context: {
  agentId?: AgentId
}): AgentId | undefined {
  if (context.agentId) return context.agentId
  const agentContext = getAgentContext()
  return agentContext ? asAgentId(agentContext.agentId) : undefined
}

function canStopTask(
  callerAgentId: AgentId | undefined,
  ownerAgentId: string | undefined,
): boolean {
  if (callerAgentId === undefined) return true
  return callerAgentId === ownerAgentId
}

function formatStopper(agentId: string | undefined): string {
  return agentId ?? 'main session'
}

function enqueueTaskStoppedForOwner({
  taskId,
  toolUseId,
  description,
  ownerAgentId,
  stopperAgentId,
}: {
  taskId: string
  toolUseId?: string
  description: string
  ownerAgentId: string
  stopperAgentId?: AgentId
}): void {
  const summary = `Task "${description}" was stopped by ${formatStopper(stopperAgentId)}`
  const toolUseIdLine = toolUseId
    ? `\n<${TOOL_USE_ID_TAG}>${escapeXml(toolUseId)}</${TOOL_USE_ID_TAG}>`
    : ''
  const message = `<${TASK_NOTIFICATION_TAG}>
<${TASK_ID_TAG}>${escapeXml(taskId)}</${TASK_ID_TAG}>${toolUseIdLine}
<${STATUS_TAG}>stopped</${STATUS_TAG}>
<${SUMMARY_TAG}>${escapeXml(summary)}</${SUMMARY_TAG}>
</${TASK_NOTIFICATION_TAG}>`
  enqueuePendingNotification({
    value: message,
    mode: 'task-notification',
    priority: 'next',
    agentId: asAgentId(ownerAgentId),
  })
}

/**
 * Look up a task by ID, validate it is running, kill it, and mark it as notified.
 *
 * Throws {@link StopTaskError} when the task cannot be stopped (not found,
 * not running, or unsupported type). Callers can inspect `error.code` to
 * distinguish the failure reason.
 */
export async function stopTask(
  taskId: string,
  context: StopTaskContext,
): Promise<StopTaskResult> {
  const { taskRegistry, setAppState, callerAgentId } = context
  const task = taskRegistry.get(taskId)

  if (!task) {
    throw new StopTaskError(`No task found with ID: ${taskId}`, 'not_found')
  }

  if (task.status !== 'running') {
    throw new StopTaskError(
      `Task ${taskId} is not running (status: ${task.status})`,
      'not_running',
    )
  }

  if (!canStopTask(callerAgentId, task.agentId)) {
    throw new StopTaskError(
      `Task ${taskId} is owned by ${formatStopper(task.agentId)}; agent ${callerAgentId} cannot stop it.`,
      'not_owner',
    )
  }

  const taskImpl = getTaskByType(task.type)
  if (!taskImpl) {
    throw new StopTaskError(
      `Unsupported task type: ${task.type}`,
      'unsupported_type',
    )
  }

  await taskImpl.kill(taskId, taskRegistry, setAppState)

  // Bash: suppress the "exit code 137" notification (noise). Agent tasks: don't
  // suppress — the AbortError catch sends a notification carrying
  // extractPartialResult(agentMessages), which is the payload not noise.
  if (isLocalShellTask(task)) {
    let suppressed = false
    taskRegistry.update(taskId, prevTask => {
      if (prevTask.notified) return prevTask
      suppressed = true
      return { ...prevTask, notified: true }
    })
    // Suppressing the XML notification also suppresses print.ts's parsed
    // task_notification SDK event — emit it directly so SDK consumers see
    // the task close.
    if (suppressed) {
      emitTaskTerminatedSdk(taskId, 'stopped', {
        toolUseId: task.toolUseId,
        summary: task.description,
      })
    }
  }
  if (
    isLocalShellTask(task) &&
    task.agentId !== undefined &&
    callerAgentId !== task.agentId
  ) {
    enqueueTaskStoppedForOwner({
      taskId,
      toolUseId: task.toolUseId,
      description: task.description,
      ownerAgentId: task.agentId,
    })
  }

  const command = isLocalShellTask(task) ? task.command : task.description

  return { taskId, taskType: task.type, command }
}
