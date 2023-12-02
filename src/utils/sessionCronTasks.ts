import {
  addSessionCronTask,
  getSessionCronTasks,
  setScheduledTasksEnabled,
} from '../bootstrap/state.js'
import {
  CRON_CREATE_TOOL_NAME,
  CRON_DELETE_TOOL_NAME,
  isKairosCronEnabled,
} from '../tools/ScheduleCronTool/prompt.js'
import type { Message } from '../types/message.js'
import { getCronJitterConfig } from './cronJitterConfig.js'
import { oneShotJitteredNextCronRunMs } from './cronTasks.js'
import { logForDebugging } from './debug.js'
import { logError } from './log.js'

type UnknownRecord = Record<string, unknown>

type ResumedCronCall = {
  toolUseId: string
  input: UnknownRecord
  createdAt: number
}

type ResumedCronState = {
  calls: ResumedCronCall[]
  results: Map<string, UnknownRecord>
  deletedCronIds: Set<string>
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null
}

/**
 * Reconstruct the successful session-only CronCreate calls in a transcript.
 *
 * CronCreate's output is stored on the matching user tool-result message,
 * while the schedule and prompt remain on the assistant tool-use block.
 * CronDelete IDs are collected independently so a later deletion wins.
 */
function extractResumedCronState(messages: Message[]): ResumedCronState {
  const calls: ResumedCronCall[] = []
  const results = new Map<string, UnknownRecord>()
  const deletedCronIds = new Set<string>()

  for (const message of messages) {
    if (message.type === 'assistant') {
      const content = message.message.content
      if (!Array.isArray(content)) continue

      const createdAt = Date.parse(message.timestamp)
      for (const block of content) {
        if (block.type !== 'tool_use') continue
        const input = isRecord(block.input) ? block.input : {}

        if (block.name === CRON_CREATE_TOOL_NAME) {
          calls.push({
            toolUseId: block.id,
            input,
            createdAt,
          })
        } else if (
          block.name === CRON_DELETE_TOOL_NAME &&
          typeof input.id === 'string'
        ) {
          deletedCronIds.add(input.id)
        }
      }
    } else if (message.type === 'user') {
      const content = message.message.content
      if (!Array.isArray(content)) continue
      const result =
        'toolUseResult' in message && isRecord(message.toolUseResult)
          ? message.toolUseResult
          : null
      if (!result) continue

      for (const block of content) {
        if (block.type === 'tool_result' && !block.is_error) {
          results.set(block.tool_use_id, result)
        }
      }
    }
  }

  return { calls, results, deletedCronIds }
}

function resurrectSessionCronTasks({
  calls,
  results,
  deletedCronIds,
}: ResumedCronState): void {
  if (!isKairosCronEnabled()) return

  const now = Date.now()
  const jitterConfig = getCronJitterConfig()
  const activeIds = new Set(getSessionCronTasks().map(task => task.id))
  let resurrected = 0

  for (const call of calls) {
    const result = results.get(call.toolUseId)
    if (!result || typeof result.id !== 'string') continue
    if (result.durable === true) continue
    if (deletedCronIds.has(result.id) || activeIds.has(result.id)) continue

    const cron = call.input.cron
    const prompt = call.input.prompt
    if (typeof cron !== 'string' || typeof prompt !== 'string') continue

    const recurring = result.recurring !== false
    if (recurring) {
      if (
        jitterConfig.recurringMaxAgeMs !== 0 &&
        now - call.createdAt >= jitterConfig.recurringMaxAgeMs
      ) {
        continue
      }
    } else {
      const nextRun = oneShotJitteredNextCronRunMs(
        cron,
        call.createdAt,
        result.id,
        jitterConfig,
      )
      if (nextRun === null || nextRun < now) continue
    }

    addSessionCronTask({
      id: result.id,
      cron,
      prompt,
      createdAt: call.createdAt,
      recurring,
    })
    activeIds.add(result.id)
    resurrected++
  }

  if (resurrected > 0) {
    setScheduledTasksEnabled(true)
    logForDebugging(
      `resume: resurrected ${resurrected} session cron task(s)`,
    )
  }
}

/**
 * Best-effort recovery of session-only scheduled tasks when a transcript is
 * resumed in the same way that user messages and task state are restored.
 */
export function restoreSessionCronTasks(messages: Message[]): void {
  try {
    resurrectSessionCronTasks(extractResumedCronState(messages))
  } catch (error) {
    logError(error instanceof Error ? error : new Error(String(error)))
  }
}
