import type { TaskState } from './types.js'
import { isLocalShellTask } from './LocalShellTask/guards.js'
import { logError } from '../utils/log.js'
import { emitTaskTerminatedSdk } from '../utils/sdkEventQueue.js'
import { evictTaskOutput } from '../utils/task/diskOutput.js'

export function killAllRunningTasks(tasks: Record<string, TaskState>): void {
  for (const task of Object.values(tasks)) {
    if (task.status !== 'running') continue
    try {
      if (isLocalShellTask(task)) {
        task.shellCommand?.kill()
        task.shellCommand?.cleanup()
      } else if ('abortController' in task) {
        task.abortController?.abort()
      }
      emitTaskTerminatedSdk(task.id, 'stopped', {
        toolUseId: task.toolUseId,
        summary: task.description,
      })
      void evictTaskOutput(task.id)
    } catch (error) {
      logError(error)
    }
  }
}
