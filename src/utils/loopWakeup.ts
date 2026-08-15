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
import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from '../services/analytics/metadata.js'
import { getCronJitterConfig } from './cronJitterConfig.js'
import { logForDebugging } from './debug.js'

export const MIN_LOOP_DELAY_SECONDS = 60
export const MAX_LOOP_DELAY_SECONDS = 3600

const PROMPT_CACHE_TTL_MS = 5 * 60 * 1000

export type LoopWakeup = {
  scheduledFor: number
  clampedDelaySeconds: number
  wasClamped: boolean
}

export function isLoopDynamicEnabled(): boolean {
  return getFeatureValue_CACHED_MAY_BE_STALE(
    'tengu_kairos_loop_dynamic',
    false,
  )
}

function nextMinuteMs(timestamp: number): number {
  const date = new Date(timestamp)
  if (date.getSeconds() > 0 || date.getMilliseconds() > 0) {
    date.setMinutes(date.getMinutes() + 1)
  }
  date.setSeconds(0, 0)
  return date.getTime()
}

function makeSchedule(delaySeconds: number): {
  clamped: number
  wasClamped: boolean
  targetMs: number
  createdAt: number
  target: Date
} {
  let rounded: number
  if (Number.isNaN(delaySeconds)) rounded = MIN_LOOP_DELAY_SECONDS
  else if (delaySeconds === Number.POSITIVE_INFINITY) {
    rounded = MAX_LOOP_DELAY_SECONDS
  } else if (delaySeconds === Number.NEGATIVE_INFINITY) {
    rounded = MIN_LOOP_DELAY_SECONDS
  } else rounded = Math.round(delaySeconds)

  const clamped = Math.max(
    MIN_LOOP_DELAY_SECONDS,
    Math.min(MAX_LOOP_DELAY_SECONDS, rounded),
  )
  const wasClamped = !Number.isFinite(delaySeconds) || rounded !== clamped
  const now = Date.now()
  const requestedTarget = now + clamped * 1000
  let targetMs = nextMinuteMs(requestedTarget)
  const cacheLeadMs = getCronJitterConfig().cacheLeadMs

  // A cron fires on a minute boundary. For short sleeps, prefer the previous
  // boundary when doing so still honors the one-minute minimum and keeps the
  // resumed request safely inside the prompt-cache window.
  if (cacheLeadMs > 0 && clamped * 1000 <= PROMPT_CACHE_TTL_MS) {
    const cacheSafeWindow = PROMPT_CACHE_TTL_MS - cacheLeadMs
    while (
      targetMs - now > cacheSafeWindow &&
      targetMs - 60_000 >= now + MIN_LOOP_DELAY_SECONDS * 1000
    ) {
      targetMs -= 60_000
    }
  }

  return {
    clamped,
    wasClamped,
    targetMs,
    createdAt: requestedTarget < targetMs ? requestedTarget : targetMs - 1,
    target: new Date(targetMs),
  }
}

export function makeLoopShortId(): string {
  return Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, '0')
}

function cancelPendingForPrompt(prompt: string): void {
  const ids = getSessionCronTasks()
    .filter(task => task.kind === 'loop' && task.prompt === prompt)
    .map(task => task.id)
  if (ids.length > 0) removeSessionCronTasks(ids)
}

/**
 * Arm one session-only wakeup for a dynamically paced /loop. Re-arming the
 * same prompt replaces its previous pending wakeup. The loop is bounded by
 * the same maximum age as recurring cron tasks.
 */
export function scheduleLoopWakeup(
  delaySeconds: number,
  prompt: string,
  reason?: string,
): LoopWakeup | null {
  cancelPendingForPrompt(prompt)

  const now = Date.now()
  const previous = getLoopChainStartedAt(prompt)
  const stale =
    previous !== undefined &&
    now > previous.lastScheduledFor + MAX_LOOP_DELAY_SECONDS * 1000
  const startedAt = previous === undefined || stale ? now : previous.startedAt
  const maxAgeMs = getCronJitterConfig().recurringMaxAgeMs

  if (maxAgeMs > 0 && now - startedAt >= maxAgeMs) {
    if (!previous?.agedOut) {
      setLoopChainStartedAt(prompt, {
        startedAt,
        lastScheduledFor:
          now - (MAX_LOOP_DELAY_SECONDS - MIN_LOOP_DELAY_SECONDS) * 1000,
        agedOut: true,
      })
      logEvent('tengu_loop_dynamic_wakeup_aged_out', {
        loop_age_ms: now - startedAt,
        max_age_ms: maxAgeMs,
      })
    }
    return null
  }

  const schedule = makeSchedule(delaySeconds)
  addSessionCronTask({
    id: makeLoopShortId(),
    cron: `${schedule.target.getMinutes()} ${schedule.target.getHours()} * * *`,
    prompt,
    createdAt: schedule.createdAt,
    kind: 'loop',
  })
  setLoopChainStartedAt(prompt, {
    startedAt,
    lastScheduledFor: schedule.targetMs,
  })
  setScheduledTasksEnabled(true)
  logEvent('tengu_loop_dynamic_wakeup_scheduled', {
    chosen_delay_seconds: Number.isFinite(delaySeconds) ? delaySeconds : 0,
    clamped_delay_seconds: schedule.clamped,
    was_clamped: schedule.wasClamped,
    reason:
      reason?.slice(0, 200) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  return {
    scheduledFor: schedule.targetMs,
    clampedDelaySeconds: schedule.clamped,
    wasClamped: schedule.wasClamped,
  }
}

/** Cancel every pending dynamic-loop wakeup after a user interrupt. */
export function cancelAllPendingLoopSessionCrons(): number {
  const pending = getSessionCronTasks().filter(task => task.kind === 'loop')
  if (pending.length === 0) return 0

  removeSessionCronTasks(pending.map(task => task.id))
  for (const task of pending) deleteLoopChainStartedAt(task.prompt)
  logForDebugging(
    `[loop/dynamic] cancelled ${pending.length} pending loop wakeup(s) on user abort`,
  )
  return pending.length
}
