import {
  addSessionCronTask,
  deleteLoopChainStartedAt,
  getLoopChainStartedAt,
  getSessionCronTasks,
  removeSessionCronTasks,
  setLoopChainStartedAt,
  setScheduledTasksEnabled,
} from '../bootstrap/state.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { logEvent } from '../services/analytics/index.js'
import { getCronJitterConfig } from './cronJitterConfig.js'
import { PROMPT_CACHE_TTL_MS } from './cronTasks.js'
import { logForDebugging } from './debug.js'

export const MIN_LOOP_DELAY_SECONDS = 60
export const MAX_LOOP_DELAY_SECONDS = 3600

export function isLoopDynamicEnabled(): boolean {
  return getFeatureValue_CACHED_MAY_BE_STALE(
    'tengu_kairos_loop_dynamic',
    false,
  )
}

export type LoopWakeupResult = {
  scheduledFor: number
  clampedDelaySeconds: number
  wasClamped: boolean
}

export function scheduleLoopWakeup(
  delaySeconds: number,
  prompt: string,
  reason?: string,
): LoopWakeupResult | null {
  cancelPendingForPrompt(prompt)

  const now = Date.now()
  const chain = getLoopChainStartedAt(prompt)
  const isStale =
    chain !== undefined &&
    now > chain.lastScheduledFor + MAX_LOOP_DELAY_SECONDS * 1000
  const startedAt = chain === undefined || isStale ? now : chain.startedAt
  const maxAgeMs = getCronJitterConfig().recurringMaxAgeMs

  if (maxAgeMs > 0 && now - startedAt >= maxAgeMs) {
    if (!chain?.agedOut) {
      setLoopChainStartedAt(prompt, {
        startedAt,
        lastScheduledFor:
          now -
          (MAX_LOOP_DELAY_SECONDS - MIN_LOOP_DELAY_SECONDS) * 1000,
        agedOut: true,
      })
      logEvent('tengu_loop_dynamic_wakeup_aged_out', {
        loop_age_ms: now - startedAt,
        max_age_ms: maxAgeMs,
      })
    }
    return null
  }

  const { clamped, wasClamped, targetMs, createdAt, target } =
    calculateLoopSchedule(delaySeconds)
  const cron = `${target.getMinutes()} ${target.getHours()} * * *`

  addSessionCronTask({
    id: makeLoopShortId(),
    cron,
    prompt,
    createdAt,
    kind: 'loop',
  })
  setLoopChainStartedAt(prompt, {
    startedAt,
    lastScheduledFor: targetMs,
  })
  setScheduledTasksEnabled(true)
  logEvent('tengu_loop_dynamic_wakeup_scheduled', {
    chosen_delay_seconds: Number.isFinite(delaySeconds) ? delaySeconds : 0,
    clamped_delay_seconds: clamped,
    was_clamped: wasClamped,
    reason: reason !== undefined ? reason.slice(0, 200) : undefined,
  })

  return {
    scheduledFor: targetMs,
    clampedDelaySeconds: clamped,
    wasClamped,
  }
}

function calculateLoopSchedule(delaySeconds: number): {
  clamped: number
  wasClamped: boolean
  targetMs: number
  createdAt: number
  target: Date
} {
  let rounded: number
  if (Number.isNaN(delaySeconds)) rounded = MIN_LOOP_DELAY_SECONDS
  else if (delaySeconds === Infinity) rounded = MAX_LOOP_DELAY_SECONDS
  else if (delaySeconds === -Infinity) rounded = MIN_LOOP_DELAY_SECONDS
  else rounded = Math.round(delaySeconds)

  const clamped = Math.max(
    MIN_LOOP_DELAY_SECONDS,
    Math.min(MAX_LOOP_DELAY_SECONDS, rounded),
  )
  const wasClamped = !Number.isFinite(delaySeconds) || rounded !== clamped
  const now = Date.now()
  const rawTargetMs = now + clamped * 1000
  let targetMs = ceilToMinute(rawTargetMs)
  const cacheLeadMs = getCronJitterConfig().cacheLeadMs

  if (cacheLeadMs > 0 && clamped * 1000 <= PROMPT_CACHE_TTL_MS) {
    const maxWarmDelayMs = PROMPT_CACHE_TTL_MS - cacheLeadMs
    while (
      targetMs - now > maxWarmDelayMs &&
      targetMs - 60_000 >= now + MIN_LOOP_DELAY_SECONDS * 1000
    ) {
      targetMs -= 60_000
    }
  }

  const target = new Date(targetMs)
  const createdAt = rawTargetMs < targetMs ? rawTargetMs : targetMs - 1
  return { clamped, wasClamped, targetMs, createdAt, target }
}

function ceilToMinute(ms: number): number {
  const date = new Date(ms)
  if (date.getSeconds() > 0 || date.getMilliseconds() > 0) {
    date.setMinutes(date.getMinutes() + 1)
  }
  date.setSeconds(0, 0)
  return date.getTime()
}

export function makeLoopShortId(): string {
  return Math.floor(Math.random() * 4_294_967_295)
    .toString(16)
    .padStart(8, '0')
}

function cancelPendingForPrompt(prompt: string): void {
  const ids = getSessionCronTasks()
    .filter(task => task.kind === 'loop' && task.prompt === prompt)
    .map(task => task.id)
  if (ids.length === 0) return
  removeSessionCronTasks(ids)
}

export function cancelAllPendingLoopSessionCrons(): number {
  const tasks = getSessionCronTasks().filter(task => task.kind === 'loop')
  if (tasks.length === 0) return 0

  removeSessionCronTasks(tasks.map(task => task.id))
  for (const task of tasks) deleteLoopChainStartedAt(task.prompt)
  logForDebugging(
    `[loop/dynamic] cancelled ${tasks.length} pending loop wakeup(s) on user abort`,
  )
  return tasks.length
}
