import { DIAMOND_FILLED, DIAMOND_OPEN } from '../constants/figures.js'
import { count, uniq } from '../utils/array.js'
import { plural } from '../utils/stringUtils.js'
import {
  getSessionBackgroundExitItems,
  type SessionBackgroundExitItem,
} from '../utils/sessionCronTasks.js'
import { truncate } from '../utils/truncate.js'
import {
  isBackgroundTask,
  type BackgroundTaskState,
  type TaskState,
} from './types.js'

/**
 * Produces the compact footer-pill label for a set of background tasks.
 * Used by both the footer pill and the turn-duration transcript line so the
 * two surfaces agree on terminology.
 */
export function getPillLabel(tasks: BackgroundTaskState[]): string {
  const n = tasks.length
  if (n === 0) return ''
  const allSameType = tasks.every(t => t.type === tasks[0]!.type)

  if (allSameType) {
    switch (tasks[0]!.type) {
      case 'local_bash': {
        const monitors = count(
          tasks,
          t => t.type === 'local_bash' && t.kind === 'monitor',
        )
        const shells = n - monitors
        const parts: string[] = []
        if (shells > 0)
          parts.push(shells === 1 ? '1 shell' : `${shells} shells`)
        if (monitors > 0)
          parts.push(monitors === 1 ? '1 monitor' : `${monitors} monitors`)
        return parts.join(', ')
      }
      case 'in_process_teammate': {
        const teamCount = new Set(
          tasks.map(t =>
            t.type === 'in_process_teammate' ? t.identity.teamName : '',
          ),
        ).size
        return teamCount === 1 ? '1 team' : `${teamCount} teams`
      }
      case 'local_agent':
        return n === 1 ? '1 local agent' : `${n} local agents`
      case 'remote_agent': {
        const first = tasks[0]!
        // Per design mockup: ◇ open diamond while running/needs-input,
        // ◆ filled once ExitPlanMode is awaiting approval.
        if (n === 1 && first.type === 'remote_agent' && first.isUltraplan) {
          switch (first.ultraplanPhase) {
            case 'plan_ready':
              return `${DIAMOND_FILLED} ultraplan ready`
            case 'needs_input':
              return `${DIAMOND_OPEN} ultraplan needs your input`
            default:
              return `${DIAMOND_OPEN} ultraplan`
          }
        }
        return n === 1
          ? `${DIAMOND_OPEN} 1 cloud session`
          : `${DIAMOND_OPEN} ${n} cloud sessions`
      }
      case 'local_workflow':
        return n === 1 ? '1 background workflow' : `${n} background workflows`
      case 'monitor_mcp':
        return n === 1 ? '1 monitor' : `${n} monitors`
      case 'dream':
        return 'dreaming'
    }
  }

  return `${n} background ${n === 1 ? 'task' : 'tasks'}`
}

export type BackgroundTaskSummary = {
  count: number
  kinds: string[]
  summary: string
}

const BACKGROUND_TASK_EXIT_LABELS: Record<BackgroundTaskState['type'], string> = {
  local_agent: 'subagent',
  local_workflow: 'workflow',
  local_bash: 'shell',
  monitor_mcp: 'monitor',
  in_process_teammate: 'teammate',
  dream: 'dream',
  remote_agent: 'cloud session',
}

/** Rows shown when exiting while in-process background work is active. */
export function getBackgroundTaskExitItems(
  tasks: Record<string, TaskState>,
  { includeDream = false }: { includeDream?: boolean } = {},
): SessionBackgroundExitItem[] {
  const items: SessionBackgroundExitItem[] = []
  for (const task of Object.values(tasks)) {
    if (!isBackgroundTask(task) || task.type === 'remote_agent') continue
    if (!includeDream && task.type === 'dream') continue
    items.push({
      label: BACKGROUND_TASK_EXIT_LABELS[task.type],
      detail: truncate(task.description, 50, true),
    })
  }
  items.push(...getSessionBackgroundExitItems())
  return items
}

/** Summarize local background work and session-only cron loops together. */
export function getBackgroundTaskSummary(
  tasks: Record<string, TaskState>,
): BackgroundTaskSummary {
  const active = Object.values(tasks)
    .filter(isBackgroundTask)
    .filter(task => task.type !== 'remote_agent')
  const cronItems = getSessionBackgroundExitItems()
  const kinds: string[] = uniq(active.map(task => task.type))
  if (cronItems.length > 0) kinds.push('session_cron')

  return {
    count: active.length + cronItems.length,
    kinds,
    summary: [
      getPillLabel(active),
      cronItems.length
        ? `${cronItems.length} ${plural(cronItems.length, 'loop')}`
        : '',
    ]
      .filter(Boolean)
      .join(', '),
  }
}

/**
 * True when the pill should show the dimmed " · ↓ to view" call-to-action.
 * Per the state diagram: only the two attention states (needs_input,
 * plan_ready) surface the CTA; plain running shows just the diamond + label.
 */
export function pillNeedsCta(tasks: BackgroundTaskState[]): boolean {
  if (tasks.length !== 1) return false
  const t = tasks[0]!
  return (
    t.type === 'remote_agent' &&
    t.isUltraplan === true &&
    t.ultraplanPhase !== undefined
  )
}
