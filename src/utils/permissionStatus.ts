import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { ToolUseConfirm } from '../components/permissions/PermissionRequest.js'
import { ASK_USER_QUESTION_TOOL_NAME } from '../tools/AskUserQuestionTool/prompt.js'
import { EXIT_PLAN_MODE_TOOL_NAME } from '../tools/ExitPlanModeTool/constants.js'
import { isBgSession } from './concurrentSessions.js'
import { createSignal } from './signal.js'

export type PermissionStatusSource =
  | 'sandbox'
  | 'permission'
  | 'hook-prompt'
  | 'worker-sandbox'
  | 'elicitation'

const STATUS_PRIORITY: PermissionStatusSource[] = [
  'sandbox',
  'permission',
  'hook-prompt',
  'worker-sandbox',
  'elicitation',
]

const changed = createSignal<[status: string | null]>()
const statusBySource: Record<PermissionStatusSource, string | null> = {
  sandbox: null,
  permission: null,
  'hook-prompt': null,
  'worker-sandbox': null,
  elicitation: null,
}
let currentStatus: string | null = null

function recomputePermissionStatus(): void {
  let nextStatus: string | null = null
  for (const source of STATUS_PRIORITY) {
    if (statusBySource[source]) {
      nextStatus = statusBySource[source]
      break
    }
  }
  if (nextStatus === currentStatus) return
  currentStatus = nextStatus
  changed.emit(nextStatus)
}

export const subscribePermissionStatus = changed.subscribe

export function emitPermissionStatus(
  status: string | null,
  source: PermissionStatusSource = 'permission',
): void {
  if (statusBySource[source] === status) return
  statusBySource[source] = status
  recomputePermissionStatus()
}

function truncatePermissionDetail(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > 120
    ? `${normalized.slice(0, 119)}…`
    : normalized
}

export function formatPermissionStatus(item: ToolUseConfirm): string {
  const input = item.input as {
    questions?: unknown
    command?: unknown
    file_path?: unknown
    url?: unknown
  }
  if (item.tool.name === ASK_USER_QUESTION_TOOL_NAME) {
    const firstQuestion = Array.isArray(input?.questions)
      ? (input.questions[0] as { question?: unknown; header?: unknown } | undefined)
      : undefined
    const question =
      typeof firstQuestion?.question === 'string'
        ? firstQuestion.question
        : typeof firstQuestion?.header === 'string'
          ? firstQuestion.header
          : ''
    return question
      ? `answer: ${truncatePermissionDetail(question)}`
      : 'answer question'
  }
  if (item.tool.name === EXIT_PLAN_MODE_TOOL_NAME) return 'approve plan'

  const userFacingName = item.tool.userFacingName(item.input as never).trim()
  const context =
    typeof input?.command === 'string'
      ? input.command
      : typeof input?.file_path === 'string'
        ? input.file_path
        : typeof input?.url === 'string'
          ? input.url
          : ''
  const name = userFacingName || item.tool.name
  return context && !name.includes(context)
    ? `approve ${name}: ${truncatePermissionDetail(context)}`
    : `approve ${name}`
}

export function createPermissionQueueSetter(
  setQueue: Dispatch<SetStateAction<ToolUseConfirm[]>>,
): Dispatch<SetStateAction<ToolUseConfirm[]>> {
  return action => {
    setQueue(previous => {
      const next = typeof action === 'function' ? action(previous) : action
      emitPermissionStatus(next[0] ? formatPermissionStatus(next[0]) : null)
      return next
    })
  }
}

export function usePermissionStatus({
  sandboxHost,
  promptTitle,
  elicitationServer,
  workerSandboxHost,
}: {
  sandboxHost?: string
  promptTitle?: string
  elicitationServer?: string
  workerSandboxHost?: string
}): void {
  const enabled = isBgSession()
  useEffect(() => {
    if (!enabled) return
    emitPermissionStatus(
      sandboxHost ? `allow network: ${sandboxHost}` : null,
      'sandbox',
    )
  }, [enabled, sandboxHost])
  useEffect(() => {
    if (!enabled) return
    emitPermissionStatus(
      promptTitle ? `respond: ${promptTitle}` : null,
      'hook-prompt',
    )
  }, [enabled, promptTitle])
  useEffect(() => {
    if (!enabled) return
    emitPermissionStatus(
      workerSandboxHost ? `allow network: ${workerSandboxHost}` : null,
      'worker-sandbox',
    )
  }, [enabled, workerSandboxHost])
  useEffect(() => {
    if (!enabled) return
    emitPermissionStatus(
      elicitationServer ? `MCP input: ${elicitationServer}` : null,
      'elicitation',
    )
  }, [enabled, elicitationServer])
}
