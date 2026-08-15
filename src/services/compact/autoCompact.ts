import { feature } from 'bun:bundle'
import {
  getIsNonInteractiveSession,
  getLastInteractionTime,
  markPostCompaction,
} from 'src/bootstrap/state.js'
import { getSdkBetas } from '../../bootstrap/state.js'
import type { QuerySource } from '../../constants/querySource.js'
import type { ToolUseContext } from '../../Tool.js'
import type { Message } from '../../types/message.js'
import { getConfigValue } from '../../utils/settings/configSettings.js'
import { getContextWindowForModel } from '../../utils/context.js'
import { logForDebugging } from '../../utils/debug.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { validateBoundedIntEnvVar } from '../../utils/envValidation.js'
import { hasExactErrorMessage } from '../../utils/errors.js'
import { formatTokens } from '../../utils/format.js'
import type { CacheSafeParams } from '../../utils/forkedAgent.js'
import { formatTokens } from '../../utils/format.js'
import { logError } from '../../utils/log.js'
import { getCanonicalName } from '../../utils/model/model.js'
import { tokenCountWithEstimation } from '../../utils/tokens.js'
import { resetToolResultDedupState } from '../../utils/toolErrors.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../analytics/growthbook.js'
import { getMaxOutputTokensForModel } from '../api/claude.js'
import {
  notifyCompaction,
  shouldTrackPromptCacheBreaks,
} from '../api/promptCacheBreakDetection.js'
import { setLastSummarizedMessageId } from '../SessionMemory/sessionMemoryUtils.js'
import {
  type CompactionResult,
  compactConversation,
  ERROR_MESSAGE_COMPACTION_BLOCKED,
  ERROR_MESSAGE_USER_ABORT,
  type RecompactionInfo,
} from './compact.js'
import { runPostCompactCleanup } from './postCompactCleanup.js'
import { trySessionMemoryCompaction } from './sessionMemoryCompact.js'

// Reserve this many tokens for output during compaction
// Based on p99.99 of compact summary output being 17,387 tokens.
const MAX_OUTPUT_TOKENS_FOR_SUMMARY = 20_000
const COLD_COMPACT_IDLE_MS = 5_400_000

// Returns the context window size minus the max output tokens for the model
export type AutoCompactWindowSource = 'env' | 'settings' | 'auto'

export type AutoCompactWindowResolution = {
  window: number
  configured: number
  source: AutoCompactWindowSource
}

export function isColdCompact(): boolean {
  return Date.now() - getLastInteractionTime() >= COLD_COMPACT_IDLE_MS
}

const MIN_AUTO_COMPACT_WINDOW = 100_000
const MAX_AUTO_COMPACT_WINDOW = 1_000_000

export function parseAutoCompactWindow(
  value: string,
): number | 'auto' | undefined {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'auto') return 'auto'
  let parsed: number
  if (normalized.endsWith('m')) {
    parsed = Number.parseFloat(normalized) * 1_000_000
  } else if (normalized.endsWith('k')) {
    parsed = Number.parseFloat(normalized) * 1_000
  } else {
    const raw = Number.parseInt(normalized, 10)
    parsed = raw >= 100 && raw <= 1_000 ? raw * 1_000 : raw
  }

  if (
    !Number.isFinite(parsed) ||
    parsed < MIN_AUTO_COMPACT_WINDOW ||
    parsed > MAX_AUTO_COMPACT_WINDOW
  ) {
    return undefined
  }
  return Math.round(parsed)
}

export function isAutoCompactConfigurationEnabled(): boolean {
  if (getIsNonInteractiveSession()) return false
  return !!getFeatureValue_CACHED_MAY_BE_STALE('tengu_amber_redwood2', '')
}

export function getAutoCompactExperimentWindow(
  model: string,
): number | undefined {
  if (!isAutoCompactEnabled()) return undefined
  if (getCanonicalName(model) !== 'claude-opus-4-7') return undefined

  const experimentValue = getFeatureValue_CACHED_MAY_BE_STALE(
    'tengu_amber_redwood2',
    '',
  )
  if (!experimentValue) return undefined

  const parsed = parseAutoCompactWindow(experimentValue)
  return typeof parsed === 'number' ? parsed : undefined
}

/**
 * Reactive compaction is deliberately restricted to interactive sessions on
 * the full 1M context window. The auto-window experiment owns the same Opus
 * cohort, so do not let the two context-management experiments overlap.
 */
export function isReactiveCompactEligible(model: string): boolean {
  if (getIsNonInteractiveSession()) return false
  if (getContextWindowForModel(model, getSdkBetas()) !== 1_000_000) return false
  if (getAutoCompactExperimentWindow(getCanonicalName(model)) !== undefined) {
    return false
  }
  return getFeatureValue_CACHED_MAY_BE_STALE(
    'tengu_cobalt_raccoon',
    false,
  )
}

export function isAutoCompactWindowOverridden(
  model: string,
  setting?: number,
): boolean {
  const { source } = resolveAutoCompactWindow(model, setting)
  return source === 'env' || source === 'settings'
}

export function resolveAutoCompactWindow(
  model: string,
  setting?: number,
): AutoCompactWindowResolution {
  const modelWindow = getContextWindowForModel(model, getSdkBetas())
  const envValue = process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW
  if (envValue) {
    const result = validateBoundedIntEnvVar(
      'CLAUDE_CODE_AUTO_COMPACT_WINDOW',
      envValue,
      MIN_AUTO_COMPACT_WINDOW,
      MAX_AUTO_COMPACT_WINDOW,
    )
    if (result.status !== 'invalid') {
      const configured = Math.max(MIN_AUTO_COMPACT_WINDOW, result.effective)
      return {
        window: Math.min(modelWindow, configured),
        configured,
        source: 'env',
      }
    }
  }
  if (setting !== undefined) {
    return {
      window: Math.min(modelWindow, setting),
      configured: setting,
      source: 'settings',
    }
  }
  const configured = getAutoCompactExperimentWindow(model) ?? modelWindow
  return {
    window: Math.min(modelWindow, configured),
    configured,
    source: 'auto',
  }
}

function getAutoCompactWindowHint(
  model: string,
  setting?: number,
): string | null {
  if (getAutoCompactExperimentWindow(model) === undefined) return null

  const { source, configured } = resolveAutoCompactWindow(model, setting)
  const fullWindow = getContextWindowForModel(model, getSdkBetas())
  if (source !== 'auto' || configured >= fullWindow) return null

  return `Compacting at auto window (${formatTokens(configured)} tokens) · /autocompact to configure`
}

export function getEffectiveContextWindowSize(
  model: string,
  autoCompactWindow?: number,
): number {
  const reservedTokensForSummary = Math.min(
    getMaxOutputTokensForModel(model),
    MAX_OUTPUT_TOKENS_FOR_SUMMARY,
  )
  const { window: contextWindow } = resolveAutoCompactWindow(
    model,
    isAutoCompactEnabled() ? autoCompactWindow : undefined,
  )

  return contextWindow - reservedTokensForSummary
}

function notifyAutoCompactExperimentWindow(
  context: ToolUseContext,
  model: string,
  setting?: number,
): void {
  const { source, configured } = resolveAutoCompactWindow(model, setting)
  if (source !== 'experiment') return
  context.addNotification?.({
    key: 'autocompact-experiment-hint',
    text: `compacted at ${formatTokens(configured)} · override with CLAUDE_CODE_AUTO_COMPACT_WINDOW=1000000`,
    priority: 'medium',
  })
}

export type AutoCompactTrackingState = {
  compacted: boolean
  turnCounter: number
  // Unique ID per turn
  turnId: string
  // Consecutive autocompact failures. Reset on success.
  // Used as a circuit breaker to stop retrying when the context is
  // irrecoverably over the limit (e.g., prompt_too_long).
  consecutiveFailures?: number
  // Number of consecutive compactions whose context refilled in fewer than
  // RAPID_REFILL_TURN_THRESHOLD turns.
  consecutiveRapidRefills?: number
}

export const AUTOCOMPACT_BUFFER_TOKENS = 13_000
export const WARNING_THRESHOLD_BUFFER_TOKENS = 20_000
export const ERROR_THRESHOLD_BUFFER_TOKENS = 20_000
export const MANUAL_COMPACT_BUFFER_TOKENS = 3_000

// Stop trying autocompact after this many consecutive failures.
// BQ 2026-03-10: 1,279 sessions had 50+ consecutive failures (up to 3,272)
// in a single session, wasting ~250K API calls/day globally.
const MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3
const RAPID_REFILL_TURN_THRESHOLD = 3
const MAX_CONSECUTIVE_RAPID_REFILLS = 3

export const RAPID_REFILL_BREAKER_ERROR =
  `Autocompact is thrashing: the context refilled to the limit within ${RAPID_REFILL_TURN_THRESHOLD} turns of the previous compact, ${MAX_CONSECUTIVE_RAPID_REFILLS} times in a row. A file being read or a tool output is likely too large for the context window. Try reading in smaller chunks, or use /clear to start fresh.`

export function getNextConsecutiveRapidRefills(
  tracking: AutoCompactTrackingState | undefined,
): number {
  return tracking?.compacted === true &&
    tracking.turnCounter < RAPID_REFILL_TURN_THRESHOLD
    ? (tracking.consecutiveRapidRefills ?? 0) + 1
    : 0
}

export function getAutoCompactThreshold(
  model: string,
  autoCompactWindow?: number,
): number {
  const effectiveContextWindow = getEffectiveContextWindowSize(
    model,
    autoCompactWindow,
  )

  const autocompactThreshold =
    effectiveContextWindow - AUTOCOMPACT_BUFFER_TOKENS

  // Override for easier testing of autocompact
  const envPercent = process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE
  if (envPercent) {
    const parsed = parseFloat(envPercent)
    if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
      const percentageThreshold = Math.floor(
        effectiveContextWindow * (parsed / 100),
      )
      return Math.min(percentageThreshold, autocompactThreshold)
    }
  }

  return autocompactThreshold
}

export function calculateTokenWarningState(
  tokenUsage: number,
  model: string,
  autoCompactWindow?: number,
): {
  percentLeft: number
  isAboveWarningThreshold: boolean
  isAboveErrorThreshold: boolean
  isAboveAutoCompactThreshold: boolean
  isAtBlockingLimit: boolean
} {
  const autoCompactThreshold = getAutoCompactThreshold(model, autoCompactWindow)
  const threshold = isAutoCompactEnabled()
    ? autoCompactThreshold
    : getEffectiveContextWindowSize(model, autoCompactWindow)

  const percentLeft = Math.max(
    0,
    Math.round(((threshold - tokenUsage) / threshold) * 100),
  )

  const warningThreshold = threshold - WARNING_THRESHOLD_BUFFER_TOKENS
  const errorThreshold = threshold - ERROR_THRESHOLD_BUFFER_TOKENS

  const isAboveWarningThreshold = tokenUsage >= warningThreshold
  const isAboveErrorThreshold = tokenUsage >= errorThreshold

  const isAboveAutoCompactThreshold =
    isAutoCompactEnabled() && tokenUsage >= autoCompactThreshold

  const actualContextWindow = getEffectiveContextWindowSize(
    model,
    autoCompactWindow,
  )
  const defaultBlockingLimit =
    actualContextWindow - MANUAL_COMPACT_BUFFER_TOKENS

  // Allow override for testing
  const blockingLimitOverride = process.env.CLAUDE_CODE_BLOCKING_LIMIT_OVERRIDE
  const parsedOverride = blockingLimitOverride
    ? parseInt(blockingLimitOverride, 10)
    : NaN
  const blockingLimit =
    !isNaN(parsedOverride) && parsedOverride > 0
      ? parsedOverride
      : defaultBlockingLimit

  const isAtBlockingLimit = tokenUsage >= blockingLimit

  return {
    percentLeft,
    isAboveWarningThreshold,
    isAboveErrorThreshold,
    isAboveAutoCompactThreshold,
    isAtBlockingLimit,
  }
}

export function isAutoCompactEnabled(): boolean {
  if (isEnvTruthy(process.env.DISABLE_COMPACT)) {
    return false
  }
  // Allow disabling just auto-compact (keeps manual /compact working)
  if (isEnvTruthy(process.env.DISABLE_AUTO_COMPACT)) {
    return false
  }
  // Check if user has disabled auto-compact in their settings
  return getConfigValue('autoCompactEnabled', true).value
}

export async function shouldAutoCompact(
  messages: Message[],
  model: string,
  autoCompactWindow?: number,
  querySource?: QuerySource,
  // Snip removes messages but the surviving assistant's usage still reflects
  // pre-snip context, so tokenCountWithEstimation can't see the savings.
  // Subtract the rough-delta that snip already computed.
  snipTokensFreed = 0,
): Promise<boolean> {
  // Recursion guards. session_memory and compact are forked agents that
  // would deadlock.
  if (querySource === 'session_memory' || querySource === 'compact') {
    return false
  }
  // marble_origami is the ctx-agent — if ITS context blows up and
  // autocompact fires, runPostCompactCleanup calls resetContextCollapse()
  // which destroys the MAIN thread's committed log (module-level state
  // shared across forks). Inside feature() so the string DCEs from
  // external builds (it's in excluded-strings.txt).
  if (feature('CONTEXT_COLLAPSE')) {
    if (querySource === 'marble_origami') {
      return false
    }
  }

  if (!isAutoCompactEnabled()) {
    return false
  }

  // Reactive-only mode: suppress proactive autocompact and let the API's
  // prompt-too-long response drive compaction. Explicit env/settings windows
  // continue to use proactive compaction; they are user-owned overrides.
  if (
    isReactiveCompactEligible(model) &&
    !isAutoCompactWindowOverridden(model, autoCompactWindow)
  ) {
    return false
  }

  // Context-collapse mode: same suppression. Collapse IS the context
  // management system when it's on — the 90% commit / 95% blocking-spawn
  // flow owns the headroom problem. Autocompact firing at effective-13k
  // (~93% of effective) sits right between collapse's commit-start (90%)
  // and blocking (95%), so it would race collapse and usually win, nuking
  // granular context that collapse was about to save. Gating here rather
  // than in isAutoCompactEnabled() keeps reactiveCompact alive as the 413
  // fallback (it consults isAutoCompactEnabled directly) and leaves
  // sessionMemory + manual /compact working.
  //
  // Consult isContextCollapseEnabled (not the raw gate) so the
  // CLAUDE_CONTEXT_COLLAPSE env override is honored here too. require()
  // inside the block breaks the init-time cycle (this file exports
  // getEffectiveContextWindowSize which collapse's index imports).
  if (feature('CONTEXT_COLLAPSE')) {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { isContextCollapseEnabled } =
      require('../contextCollapse/index.js') as typeof import('../contextCollapse/index.js')
    /* eslint-enable @typescript-eslint/no-require-imports */
    if (isContextCollapseEnabled()) {
      return false
    }
  }

  const tokenCount = tokenCountWithEstimation(messages) - snipTokensFreed
  const threshold = getAutoCompactThreshold(model, autoCompactWindow)
  const effectiveWindow = getEffectiveContextWindowSize(
    model,
    autoCompactWindow,
  )

  logForDebugging(
    `autocompact: tokens=${tokenCount} threshold=${threshold} effectiveWindow=${effectiveWindow}${snipTokensFreed > 0 ? ` snipFreed=${snipTokensFreed}` : ''}`,
  )

  const { isAboveAutoCompactThreshold } = calculateTokenWarningState(
    tokenCount,
    model,
    autoCompactWindow,
  )

  return isAboveAutoCompactThreshold
}

export async function autoCompactIfNeeded(
  messages: Message[],
  toolUseContext: ToolUseContext,
  cacheSafeParams: CacheSafeParams,
  querySource?: QuerySource,
  tracking?: AutoCompactTrackingState,
  snipTokensFreed?: number,
): Promise<{
  wasCompacted: boolean
  compactionResult?: CompactionResult
  consecutiveFailures?: number
  consecutiveRapidRefills?: number
  rapidRefillBreakerTripped?: boolean
}> {
  if (isEnvTruthy(process.env.DISABLE_COMPACT)) {
    return { wasCompacted: false }
  }

  // Circuit breaker: stop retrying after N consecutive failures.
  // Without this, sessions where context is irrecoverably over the limit
  // hammer the API with doomed compaction attempts on every turn.
  if (
    tracking?.consecutiveFailures !== undefined &&
    tracking.consecutiveFailures >= MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES
  ) {
    return { wasCompacted: false }
  }

  const model = toolUseContext.options.mainLoopModel
  const autoCompactWindow = toolUseContext.getAppState().autoCompactWindow
  const shouldCompact = await shouldAutoCompact(
    messages,
    model,
    autoCompactWindow,
    querySource,
    snipTokensFreed,
  )

  if (!shouldCompact) {
    return { wasCompacted: false }
  }

  const consecutiveRapidRefills = getNextConsecutiveRapidRefills(tracking)
  if (consecutiveRapidRefills >= MAX_CONSECUTIVE_RAPID_REFILLS) {
    logForDebugging(
      `autocompact: rapid-refill breaker tripped — ${consecutiveRapidRefills} consecutive refills within <${RAPID_REFILL_TURN_THRESHOLD} turns each (last was ${tracking?.turnCounter} turns)`,
      { level: 'warn' },
    )
    return { wasCompacted: false, rapidRefillBreakerTripped: true }
  }

  const recompactionInfo: RecompactionInfo = {
    isRecompactionInChain: tracking?.compacted === true,
    turnsSincePreviousCompact: tracking?.turnCounter ?? -1,
    previousCompactTurnId: tracking?.turnId,
    autoCompactThreshold: getAutoCompactThreshold(model, autoCompactWindow),
    querySource,
  }

  const stripNonEssential =
    isColdCompact() &&
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_cold_compact', false)

  const compactingHintText = getAutoCompactWindowHint(
    model,
    autoCompactWindow,
  )

  // EXPERIMENT: Try session memory compaction first
  const sessionMemoryResult = await trySessionMemoryCompaction(
    messages,
    toolUseContext.agentId,
    recompactionInfo.autoCompactThreshold,
  )
  if (sessionMemoryResult) {
    notifyAutoCompactExperimentWindow(
      toolUseContext,
      model,
      autoCompactWindow,
    )
    // Reset lastSummarizedMessageId since session memory compaction prunes messages
    // and the old message UUID will no longer exist after the REPL replaces messages
    setLastSummarizedMessageId(undefined)
    runPostCompactCleanup(querySource, toolUseContext.resultDedupState)
    // Reset cache read baseline so the post-compact drop isn't flagged as a
    // break. compactConversation does this internally; SM-compact doesn't.
    // BQ 2026-03-01: missing this made 20% of tengu_prompt_cache_break events
    // false positives (systemPromptChanged=true, timeSinceLastAssistantMsg=-1).
    if (shouldTrackPromptCacheBreaks()) {
      notifyCompaction(querySource ?? 'compact', toolUseContext.agentId)
    }
    markPostCompaction()
    resetToolResultDedupState(toolUseContext.resultDedupState)
    return {
      wasCompacted: true,
      compactionResult: sessionMemoryResult,
      consecutiveFailures: 0,
      consecutiveRapidRefills,
    }
  }

  const stripNonEssential = shouldUseColdCompaction()
  try {
    const compactionResult = await compactConversation(
      messages,
      toolUseContext,
      cacheSafeParams,
      true, // Suppress user questions for autocompact
      undefined, // No custom instructions for autocompact
      true, // isAutoCompact
      recompactionInfo,
      stripNonEssential,
      compactingHintText,
    )
    // Reset lastSummarizedMessageId since legacy compaction replaces all messages
    // and the old message UUID will no longer exist in the new messages array
    setLastSummarizedMessageId(undefined)
    runPostCompactCleanup(querySource, toolUseContext.resultDedupState)

    return {
      wasCompacted: true,
      compactionResult,
      // Reset failure count on success
      consecutiveFailures: 0,
      consecutiveRapidRefills,
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith(ERROR_MESSAGE_COMPACTION_BLOCKED)
    ) {
      return { wasCompacted: false }
    }
    if (!hasExactErrorMessage(error, ERROR_MESSAGE_USER_ABORT)) {
      logError(error)
    }
    // Increment consecutive failure count for circuit breaker.
    // The caller threads this through autoCompactTracking so the
    // next query loop iteration can skip futile retry attempts.
    const prevFailures = tracking?.consecutiveFailures ?? 0
    const nextFailures = prevFailures + 1
    if (nextFailures >= MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES) {
      logForDebugging(
        `autocompact: circuit breaker tripped after ${nextFailures} consecutive failures — skipping future attempts this session`,
        { level: 'warn' },
      )
    }
    return { wasCompacted: false, consecutiveFailures: nextFailures }
  }
}
