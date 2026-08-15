import { markPostCompaction } from '../../bootstrap/state.js'
import { resetMemorySelector } from '../../memdir/findRelevantMemories.js'
import type { QuerySource } from '../../constants/querySource.js'
import type { ToolUseContext } from '../../Tool.js'
import type {
  AttachmentMessage,
  HookResultMessage,
  Message,
} from '../../types/message.js'
import {
  createAttachmentMessage,
  getAgentListingDeltaAttachment,
  getDeferredToolsDeltaAttachment,
  getMcpInstructionsDeltaAttachment,
} from '../../utils/attachments.js'
import { COMPACT_MAX_OUTPUT_TOKENS } from '../../utils/context.js'
import {
  analyzeContext,
  tokenStatsToStatsigMetrics,
} from '../../utils/contextAnalysis.js'
import { logForDebugging } from '../../utils/debug.js'
import { errorMessage } from '../../utils/errors.js'
import { cacheToObject } from '../../utils/fileStateCache.js'
import {
  type CacheSafeParams,
  runForkedAgent,
} from '../../utils/forkedAgent.js'
import {
  executePostCompactHooks,
  executePreCompactHooks,
} from '../../utils/hooks.js'
import { logError } from '../../utils/log.js'
import {
  createCompactBoundaryMessage,
  createUserMessage,
  getAssistantMessageText,
  getLastAssistantMessage,
  normalizeMessagesForAPI,
} from '../../utils/messages.js'
import { processSessionStartHooks } from '../../utils/sessionStart.js'
import {
  getTranscriptPath,
  reAppendSessionMetadata,
} from '../../utils/sessionStorage.js'
import { logOTelEvent } from '../../utils/telemetry/events.js'
import { tokenCountWithEstimation } from '../../utils/tokens.js'
import { extractDiscoveredToolNames } from '../../utils/toolSearch.js'
import { logEvent } from '../analytics/index.js'
import { getMaxOutputTokensForModel } from '../api/claude.js'
import {
  getPromptTooLongTokenGap,
  isMediaSizeErrorMessage,
  isPromptTooLongMessage,
} from '../api/errors.js'
import {
  notifyCompaction,
  shouldTrackPromptCacheBreaks,
} from '../api/promptCacheBreakDetection.js'
import { logPermissionContextForAnts } from '../internalLogging.js'
import { setLastSummarizedMessageId } from '../SessionMemory/sessionMemoryUtils.js'
import { roughTokenCountEstimationForMessages } from '../tokenEstimation.js'
import {
  annotateBoundaryWithPreservedSegment,
  buildPostCompactMessages,
  type CompactionResult,
  createAsyncAgentAttachmentsIfNeeded,
  createCompactCanUseTool,
  createPlanAttachmentIfNeeded,
  createPlanModeAttachmentIfNeeded,
  createPostCompactFileAttachments,
  createSkillAttachmentIfNeeded,
  POST_COMPACT_MAX_FILES_TO_RESTORE,
  stripImagesFromMessages,
} from './compact.js'
import { suppressCompactWarning } from './compactWarningState.js'
import { groupMessagesByApiRound } from './grouping.js'
import { isAutoCompactEnabled, isReactiveCompactEligible } from './autoCompact.js'
import { runPostCompactCleanup } from './postCompactCleanup.js'
import {
  getCompactPrompt,
  getCompactUserSummaryMessage,
} from './prompt.js'

type ReactiveCompactFailureReason =
  | 'too_few_groups'
  | 'aborted'
  | 'exhausted'
  | 'error'
  | 'media_unstrippable'

export type ReactiveCompactOutcome =
  | { ok: true; result: CompactionResult }
  | {
      ok: false
      reason: ReactiveCompactFailureReason
      detail?: string
    }

type SummaryAttempt =
  | {
      ok: true
      summaryText: string
      totalUsage: Awaited<ReturnType<typeof runForkedAgent>>['totalUsage']
      messages: ReturnType<typeof createUserMessage>[]
    }
  | { ok: false; reason: 'aborted' }
  | { ok: false; reason: 'prompt_too_long'; tokenGap?: number }
  | { ok: false; reason: 'media_too_large' }
  | { ok: false; reason: 'error'; detail: string }

type GroupedCompactResult =
  | {
      ok: true
      result: {
        summaryMessages: ReturnType<typeof createUserMessage>[]
        summaryText: string
        messagesToPreserve: Message[]
        attempt: number
        totalUsage: Awaited<ReturnType<typeof runForkedAgent>>['totalUsage']
        groupsPreserved: number
        totalGroups: number
      }
    }
  | {
      ok: false
      reason: ReactiveCompactFailureReason
      attempts: number
      totalGroups: number
      detail?: string
    }

type RetryStep = {
  mode: 'gap_guided' | 'gap_unparseable'
  step: number
}

export function isReactiveCompactEnabled(model: string): boolean {
  return isReactiveCompactEligible(model)
}

export function isReactiveOnlyMode(model: string): boolean {
  return isReactiveCompactEligible(model)
}

export function isWithheldPromptTooLong(
  message: Message | undefined,
): boolean {
  return message?.type === 'assistant' && isPromptTooLongMessage(message)
}

export function isWithheldMediaSizeError(
  message: Message | undefined,
): boolean {
  return message?.type === 'assistant' && isMediaSizeErrorMessage(message)
}

export function recordCompactionTelemetry({
  trigger,
  success,
  durationMs,
  preTokens,
  postTokens,
  error,
}: {
  trigger: 'auto' | 'manual'
  success: boolean
  durationMs: number
  preTokens?: number
  postTokens?: number
  error?: string
}): void {
  void logOTelEvent('compaction', {
    trigger,
    success: String(success),
    duration_ms: String(Math.round(durationMs)),
    ...(preTokens !== undefined ? { pre_tokens: String(preTokens) } : {}),
    ...(postTokens !== undefined ? { post_tokens: String(postTokens) } : {}),
    ...(error ? { error } : {}),
  })
}

async function summarizeMessages(
  messages: Message[],
  cacheSafeParams: CacheSafeParams,
  customInstructions: string | undefined,
  stripMedia: boolean,
): Promise<SummaryAttempt> {
  const summaryRequest = createUserMessage({
    content: getCompactPrompt(customInstructions),
  })

  let forkResult: Awaited<ReturnType<typeof runForkedAgent>>
  try {
    forkResult = await runForkedAgent({
      promptMessages: [summaryRequest],
      cacheSafeParams: {
        ...cacheSafeParams,
        forkContextMessages: stripMedia
          ? stripImagesFromMessages(normalizeMessagesForAPI(messages))
          : normalizeMessagesForAPI(messages),
      },
      canUseTool: createCompactCanUseTool(),
      querySource: 'compact',
      forkLabel: 'reactive-compact',
      maxTurns: 1,
      maxOutputTokens: Math.min(
        COMPACT_MAX_OUTPUT_TOKENS,
        getMaxOutputTokensForModel(
          cacheSafeParams.toolUseContext.options.mainLoopModel,
        ),
      ),
      skipTranscript: true,
      skipCacheWrite: true,
    })
  } catch (error) {
    logError(error)
    return { ok: false, reason: 'error', detail: errorMessage(error) }
  }

  if (cacheSafeParams.toolUseContext.abortController.signal.aborted) {
    return { ok: false, reason: 'aborted' }
  }

  const assistant = getLastAssistantMessage(forkResult.messages)
  if (!assistant) {
    logError(
      new Error(
        `Reactive compact: no assistant message in summarization response (${forkResult.messages.length} messages, types: ${forkResult.messages.map(message => message.type).join(', ')})`,
      ),
    )
    return {
      ok: false,
      reason: 'error',
      detail: 'no assistant message in summarization response',
    }
  }
  if (isPromptTooLongMessage(assistant)) {
    return {
      ok: false,
      reason: 'prompt_too_long',
      tokenGap: getPromptTooLongTokenGap(assistant),
    }
  }
  if (isMediaSizeErrorMessage(assistant)) {
    return { ok: false, reason: 'media_too_large' }
  }
  if (assistant.isApiErrorMessage) {
    const detail = getAssistantMessageText(assistant) ?? 'API error'
    logError(
      new Error(`Reactive compact: summarization returned API error: ${detail}`),
    )
    return { ok: false, reason: 'error', detail }
  }

  const summaryText = getAssistantMessageText(assistant)
  if (!summaryText) {
    logError(
      new Error('Reactive compact: empty summary text in summarization response'),
    )
    return {
      ok: false,
      reason: 'error',
      detail: 'summarization produced empty response',
    }
  }

  return {
    ok: true,
    summaryText,
    totalUsage: forkResult.totalUsage,
    messages: [
      createUserMessage({
        content: getCompactUserSummaryMessage(
          summaryText,
          true,
          getTranscriptPath(),
        ),
        isCompactSummary: true,
        isVisibleInTranscriptOnly: true,
      }),
    ],
  }
}

function groupsNeededFromTail(
  groupTokenCounts: number[],
  summarizableGroupCount: number,
  tokenGap: number,
): number {
  let coveredTokens = 0
  let groups = 0
  for (let i = summarizableGroupCount - 1; i >= 0; i--) {
    coveredTokens += groupTokenCounts[i] ?? 0
    groups++
    if (coveredTokens >= tokenGap) break
  }
  if (groups >= summarizableGroupCount - 1) {
    return Math.max(1, Math.floor(summarizableGroupCount / 2))
  }
  return groups
}

function chooseRetryStep(
  tokenGap: number | undefined,
  groupTokenCounts: number[],
  summarizableGroupCount: number,
): RetryStep {
  if (tokenGap === undefined) {
    return { mode: 'gap_unparseable', step: 1 }
  }
  return {
    mode: 'gap_guided',
    step: groupsNeededFromTail(
      groupTokenCounts,
      summarizableGroupCount,
      tokenGap,
    ),
  }
}

async function compactGroupedMessages(
  messages: Message[],
  cacheSafeParams: CacheSafeParams,
  options?: { customInstructions?: string },
): Promise<GroupedCompactResult> {
  const normalizedMessages = normalizeMessagesForAPI(messages).filter(
    message => message.type !== 'progress',
  )
  const groups = groupMessagesByApiRound(normalizedMessages)
  const totalGroups = groups.length
  if (totalGroups < 2) {
    logForDebugging(
      'Reactive compact: fewer than 2 groups, nothing to compact',
      { level: 'info' },
    )
    return { ok: false, reason: 'too_few_groups', attempts: 0, totalGroups }
  }

  const signal = cacheSafeParams.toolUseContext.abortController.signal
  let groupsToPreserve = 1
  let attempts = 0
  let lastStep:
    | (RetryStep & { tokenGap: number | undefined })
    | undefined
  let groupTokenCounts: number[] | undefined
  let stripMedia = false

  while (groupsToPreserve < totalGroups) {
    if (signal.aborted) {
      return { ok: false, reason: 'aborted', attempts, totalGroups }
    }

    attempts++
    const summarizableGroupCount = totalGroups - groupsToPreserve
    const groupsToSummarize = groups.slice(0, summarizableGroupCount)
    const groupsToKeep = groups.slice(summarizableGroupCount)
    const messagesToSummarize = groupsToSummarize.flat()
    if (!messagesToSummarize.some(message => message.type === 'assistant')) {
      logForDebugging(
        'Reactive compact: no assistant messages in summarize set, bailing',
        { level: 'info' },
      )
      return {
        ok: false,
        reason: attempts > 1 ? 'exhausted' : 'too_few_groups',
        attempts: attempts - 1,
        totalGroups,
      }
    }

    logEvent('tengu_reactive_compact_attempt', {
      attempt: attempts,
      groupsToSummarize: groupsToSummarize.length,
      groupsToPreserve: groupsToKeep.length,
      messagesToSummarize: messagesToSummarize.length,
      strippedMedia: stripMedia,
      stepMode: lastStep?.mode,
      stepSize: lastStep?.step,
      tokenGap: lastStep?.tokenGap,
    })

    const summary = await summarizeMessages(
      messagesToSummarize,
      cacheSafeParams,
      options?.customInstructions,
      stripMedia,
    )
    if (summary.ok) {
      return {
        ok: true,
        result: {
          summaryMessages: summary.messages,
          summaryText: summary.summaryText,
          messagesToPreserve: groupsToKeep.flat(),
          attempt: attempts,
          totalUsage: summary.totalUsage,
          groupsPreserved: groupsToPreserve,
          totalGroups,
        },
      }
    }

    switch (summary.reason) {
      case 'aborted':
        return { ok: false, reason: 'aborted', attempts, totalGroups }
      case 'error':
        return {
          ok: false,
          reason: 'error',
          attempts,
          totalGroups,
          detail: summary.detail,
        }
      case 'media_too_large':
        if (!stripMedia) {
          stripMedia = true
          attempts--
          logForDebugging(
            'Reactive compact: summarize hit media-size error, retrying stripped',
            { level: 'info' },
          )
          continue
        }
        return {
          ok: false,
          reason: 'media_unstrippable',
          attempts,
          totalGroups,
      }
      case 'prompt_too_long': {
        const tokenCounts = (groupTokenCounts ??= groups.map(group =>
          roughTokenCountEstimationForMessages(group),
        ))
        const step = chooseRetryStep(
          summary.tokenGap,
          tokenCounts,
          summarizableGroupCount,
        )
        lastStep = { ...step, tokenGap: summary.tokenGap }
        groupsToPreserve += step.step
        logForDebugging(
          `Reactive compact: attempt ${attempts} hit prompt-too-long (gap=${summary.tokenGap ?? '?'} → ${step.mode} step ${step.step}), next preserves ${groupsToPreserve}/${totalGroups}`,
          { level: 'info' },
        )
        break
      }
    }
  }

  return { ok: false, reason: 'exhausted', attempts, totalGroups }
}

function zeroPreservedAssistantUsage(message: Message): Message {
  if (message.type !== 'assistant') return message
  return {
    ...message,
    message: {
      ...message.message,
      usage: {
        ...message.message.usage,
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    },
  }
}

async function createRestorationState(
  readFileState: ReturnType<typeof cacheToObject>,
  context: ToolUseContext,
  preservedMessages: Message[],
): Promise<{
  attachments: AttachmentMessage[]
  hookResults: HookResultMessage[]
}> {
  const [fileAttachments, asyncAgentAttachments] = await Promise.all([
    createPostCompactFileAttachments(
      readFileState,
      context,
      POST_COMPACT_MAX_FILES_TO_RESTORE,
      preservedMessages,
    ),
    createAsyncAgentAttachmentsIfNeeded(context),
  ])
  const planAttachment = createPlanAttachmentIfNeeded(context.agentId)
  const planModeAttachment = await createPlanModeAttachmentIfNeeded(context)
  const skillAttachment = createSkillAttachmentIfNeeded(context.agentId)
  const deltas = [
    ...getDeferredToolsDeltaAttachment(
      context.options.tools,
      context.options.mainLoopModel,
      preservedMessages,
      { callSite: 'reactive_compact' },
    ),
    ...getAgentListingDeltaAttachment(context, preservedMessages),
    ...getMcpInstructionsDeltaAttachment(
      context.options.mcpClients,
      context.options.tools,
      context.options.mainLoopModel,
      preservedMessages,
    ),
  ].map(createAttachmentMessage)

  context.onCompactProgress?.({
    type: 'hooks_start',
    hookType: 'session_start',
  })
  const hookResults = await processSessionStartHooks('compact', {
    model: context.options.mainLoopModel,
  })

  return {
    attachments: [
      ...fileAttachments,
      ...asyncAgentAttachments,
      ...(planAttachment ? [planAttachment] : []),
      ...(planModeAttachment ? [planModeAttachment] : []),
      ...(skillAttachment ? [skillAttachment] : []),
      ...deltas,
    ],
    hookResults,
  }
}

export async function reactiveCompactOnPromptTooLong(
  messages: Message[],
  cacheSafeParams: CacheSafeParams,
  options?: {
    customInstructions?: string
    trigger?: 'auto' | 'manual'
  },
): Promise<ReactiveCompactOutcome> {
  const preCompactTokenCount = tokenCountWithEstimation(messages)
  const startTime = performance.now()
  const grouped = await compactGroupedMessages(messages, cacheSafeParams, {
    customInstructions: options?.customInstructions,
  })
  if (!grouped.ok) {
    logEvent('tengu_reactive_compact_failed', {
      reason: grouped.reason,
      preCompactTokens: preCompactTokenCount,
      attempts: grouped.attempts,
      totalGroups: grouped.totalGroups,
      durationMs: Math.round(performance.now() - startTime),
    })
    return {
      ok: false,
      reason: grouped.reason,
      detail: grouped.detail,
    }
  }

  const { result: groupedResult } = grouped
  const { toolUseContext } = cacheSafeParams
  const preCompactReadFileState = cacheToObject(toolUseContext.readFileState)
  toolUseContext.readFileState.clear()
  toolUseContext.loadedNestedMemoryPaths?.clear()
  resetMemorySelector(toolUseContext.memorySelector)

  if (shouldTrackPromptCacheBreaks()) {
    notifyCompaction(
      toolUseContext.options.querySource ?? 'compact',
      toolUseContext.agentId,
    )
  }
  markPostCompaction()
  reAppendSessionMetadata()

  const boundaryMarker = createCompactBoundaryMessage(
    options?.trigger ?? 'auto',
    preCompactTokenCount,
    messages.at(-1)?.uuid,
  )
  boundaryMarker.compactMetadata.durationMs = Math.round(
    performance.now() - startTime,
  )
  const discoveredTools = extractDiscoveredToolNames(messages)
  if (discoveredTools.size > 0) {
    boundaryMarker.compactMetadata.preCompactDiscoveredTools = [
      ...discoveredTools,
    ].sort()
  }

  const messagesToKeep = groupedResult.messagesToPreserve.map(
    zeroPreservedAssistantUsage,
  )
  const restoration = await createRestorationState(
    preCompactReadFileState,
    toolUseContext,
    messagesToKeep,
  ).catch(error => {
    logError(error)
    return { attachments: [], hookResults: [] }
  })

  toolUseContext.onCompactProgress?.({
    type: 'hooks_start',
    hookType: 'post_compact',
  })
  const postCompactHookResult = await executePostCompactHooks(
    {
      trigger: options?.trigger ?? 'auto',
      compactSummary: groupedResult.summaryText,
    },
    toolUseContext.abortController.signal,
  )

  const annotatedBoundary = annotateBoundaryWithPreservedSegment(
    boundaryMarker,
    groupedResult.summaryMessages.at(-1)!.uuid,
    messagesToKeep,
  )
  const result: CompactionResult = {
    boundaryMarker: annotatedBoundary,
    summaryMessages: groupedResult.summaryMessages,
    messagesToKeep,
    attachments: restoration.attachments,
    hookResults: restoration.hookResults,
    userDisplayMessage: postCompactHookResult.userDisplayMessage,
    preCompactTokenCount,
  }
  const postCompactTokenCount = roughTokenCountEstimationForMessages(
    buildPostCompactMessages(result),
  )
  annotatedBoundary.compactMetadata.postTokens = postCompactTokenCount

  const contextMetrics = (() => {
    try {
      return tokenStatsToStatsigMetrics(analyzeContext(messages))
    } catch (error) {
      logError(error)
      return {}
    }
  })()
  const usage = groupedResult.totalUsage
  const totalInputTokens =
    usage.input_tokens +
    usage.cache_creation_input_tokens +
    usage.cache_read_input_tokens
  logEvent('tengu_reactive_compact_succeeded', {
    attempts: groupedResult.attempt,
    groupsPreserved: groupedResult.groupsPreserved,
    totalGroups: groupedResult.totalGroups,
    preCompactTokens: preCompactTokenCount,
    postCompactTokens: postCompactTokenCount,
    restoredAttachmentCount:
      restoration.attachments.length + restoration.hookResults.length,
    durationMs: Math.round(performance.now() - startTime),
    compactionInputTokens: usage.input_tokens,
    compactionOutputTokens: usage.output_tokens,
    compactionCacheReadTokens: usage.cache_read_input_tokens,
    compactionCacheCreationTokens: usage.cache_creation_input_tokens,
    compactionTotalTokens: totalInputTokens + usage.output_tokens,
    cacheHitRate:
      totalInputTokens > 0
        ? usage.cache_read_input_tokens / totalInputTokens
        : 0,
    ...contextMetrics,
  })

  return { ok: true, result }
}

export async function tryReactiveCompact({
  hasAttempted,
  querySource,
  aborted,
  messages,
  cacheSafeParams,
}: {
  hasAttempted: boolean
  querySource: QuerySource
  aborted: boolean
  messages: Message[]
  cacheSafeParams: CacheSafeParams
}): Promise<CompactionResult | null> {
  const model = cacheSafeParams.toolUseContext.options.mainLoopModel
  if (
    hasAttempted ||
    querySource === 'compact' ||
    querySource === 'session_memory' ||
    !isAutoCompactEnabled() ||
    aborted ||
    !isReactiveCompactEligible(model)
  ) {
    return null
  }

  const { toolUseContext } = cacheSafeParams
  logEvent('tengu_reactive_compact_triggered', {})
  void logPermissionContextForAnts(
    toolUseContext.getAppState().toolPermissionContext,
    'summary',
  )
  toolUseContext.onCompactProgress?.({
    type: 'hooks_start',
    hookType: 'pre_compact',
  })
  toolUseContext.setSDKStatus?.('compacting')
  const startTime = performance.now()
  const hookResult: {
    blockedBy?: string
    newCustomInstructions?: string
    userDisplayMessage?: string
  } = await executePreCompactHooks(
    { trigger: 'auto', customInstructions: null },
    toolUseContext.abortController.signal,
  ).catch(error => {
    logError(error)
    return {}
  })
  if (hookResult.blockedBy) {
    logForDebugging(
      `Reactive compact blocked by PreCompact hook: ${hookResult.blockedBy}`,
    )
    toolUseContext.onCompactProgress?.({ type: 'compact_end' })
    toolUseContext.setSDKStatus?.(null)
    return null
  }

  toolUseContext.onCompactProgress?.({ type: 'compact_start' })
  const outcome = await reactiveCompactOnPromptTooLong(
    messages,
    cacheSafeParams,
    { customInstructions: hookResult.newCustomInstructions },
  ).catch(error => {
    logError(error)
    return {
      ok: false as const,
      reason: 'error' as const,
      detail: errorMessage(error),
    }
  })
  toolUseContext.onCompactProgress?.({ type: 'compact_end' })

  const preTokens = tokenCountWithEstimation(messages)
  if (!outcome.ok) {
    const detail =
      outcome.reason === 'error'
        ? (outcome.detail ?? outcome.reason)
        : outcome.reason
    recordCompactionTelemetry({
      trigger: 'auto',
      success: false,
      durationMs: performance.now() - startTime,
      preTokens,
      error: detail,
    })
    toolUseContext.setSDKStatus?.(null, {
      compactResult: 'failed',
      compactError: detail,
    })
    return null
  }

  const postTokens =
    outcome.result.boundaryMarker.subtype === 'compact_boundary'
      ? outcome.result.boundaryMarker.compactMetadata.postTokens
      : undefined
  recordCompactionTelemetry({
    trigger: 'auto',
    success: true,
    durationMs: performance.now() - startTime,
    preTokens,
    postTokens,
  })
  toolUseContext.setSDKStatus?.(null, { compactResult: 'success' })
  setLastSummarizedMessageId(undefined)
  runPostCompactCleanup(
    querySource,
    toolUseContext.resultDedupState,
  )
  suppressCompactWarning()

  const userDisplayMessage = [
    hookResult.userDisplayMessage,
    outcome.result.userDisplayMessage,
  ]
    .filter(Boolean)
    .join('\n')
  return {
    ...outcome.result,
    userDisplayMessage: userDisplayMessage || undefined,
  }
}
