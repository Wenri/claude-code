import { feature } from 'bun:bundle'
import { getMainThreadAgentType, getSessionId } from '../bootstrap/state.js'
import { getReplBridgeHandle } from '../bridge/replBridgeHandle.js'
import { getShortcutDisplay } from '../keybindings/shortcutFormat.js'
import { isExtractModeActive } from '../memdir/paths.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../services/analytics/index.js'
import { toolMatchesName, type ToolUseContext } from '../Tool.js'
import type { HookProgress } from '../types/hooks.js'
import type {
  AssistantMessage,
  Message,
  RequestStartEvent,
  StopHookInfo,
  StreamEvent,
  TombstoneMessage,
  ToolUseSummaryMessage,
} from '../types/message.js'
import { createAttachmentMessage } from '../utils/attachments.js'
import { logForDebugging } from '../utils/debug.js'
import { errorMessage } from '../utils/errors.js'
import type { REPLHookContext } from '../utils/hooks/postSamplingHooks.js'
import {
  executeStopHooks,
  executeTaskCompletedHooks,
  executeTeammateIdleHooks,
  getStopHookMessage,
  getTaskCompletedHookMessage,
  getTeammateIdleHookMessage,
} from '../utils/hooks.js'
import {
  createStopHookSummaryMessage,
  createSystemMessage,
  createUserInterruptionMessage,
  createUserMessage,
} from '../utils/messages.js'
import { enqueueSdkEvent } from '../utils/sdkEventQueue.js'
import type { SystemPrompt } from '../utils/systemPromptType.js'
import { getTaskListId, listTasks } from '../utils/tasks.js'
import { getAgentName, getTeamName, isTeammate } from '../utils/teammate.js'

/* eslint-disable @typescript-eslint/no-require-imports */
const extractMemoriesModule = feature('EXTRACT_MEMORIES')
  ? (require('../services/extractMemories/extractMemories.js') as typeof import('../services/extractMemories/extractMemories.js'))
  : null
const jobClassifierModule = feature('TEMPLATES')
  ? (require('../jobs/classifier.js') as typeof import('../jobs/classifier.js'))
  : null
const taskSummaryModule = feature('BG_SESSIONS')
  ? (require('../utils/taskSummary.js') as typeof import('../utils/taskSummary.js'))
  : null
const briefToolModule =
  feature('KAIROS') || feature('KAIROS_BRIEF')
    ? (require('../tools/BriefTool/BriefTool.js') as typeof import('../tools/BriefTool/BriefTool.js'))
    : null
const briefPromptModule =
  feature('KAIROS') || feature('KAIROS_BRIEF')
    ? (require('../tools/BriefTool/prompt.js') as typeof import('../tools/BriefTool/prompt.js'))
    : null

/* eslint-enable @typescript-eslint/no-require-imports */

import type { QuerySource } from '../constants/querySource.js'
import { executeAutoDream } from '../services/autoDream/autoDream.js'
import { executePromptSuggestion } from '../services/PromptSuggestion/promptSuggestion.js'
import {
  isBareMode,
  isEnvDefinedFalsy,
  isEnvTruthy,
} from '../utils/envUtils.js'
import {
  createCacheSafeParams,
  saveCacheSafeParams,
} from '../utils/forkedAgent.js'

type StopHookResult = {
  blockingErrors: Message[]
  preventContinuation: boolean
}

type ClassifierJobState = import('../jobs/classifier.js').ClassifierJobState

const classifierTaskTypes = new Set([
  'local_agent',
  'remote_agent',
  'in_process_teammate',
  'local_workflow',
])

function hasActiveClassifierTasks(
  tasks: Readonly<Record<string, { type: string; status: string }>>,
): boolean {
  for (const task of Object.values(tasks ?? {}) as Array<{
    type: string
    status: string
  }>) {
    if (
      classifierTaskTypes.has(task.type) &&
      task.status !== 'completed' &&
      task.status !== 'failed' &&
      task.status !== 'killed'
    ) {
      return true
    }
  }
  return false
}

function isMainQuerySource(querySource: QuerySource): boolean {
  return querySource.startsWith('repl_main_thread') || querySource === 'sdk'
}

export async function* handleStopHooks(
  messagesForQuery: Message[],
  assistantMessages: AssistantMessage[],
  systemPrompt: SystemPrompt,
  userContext: { [k: string]: string },
  systemContext: { [k: string]: string },
  toolUseContext: ToolUseContext,
  querySource: QuerySource,
  stopHookActive?: boolean,
  classifierState?: ClassifierJobState | null,
): AsyncGenerator<
  | StreamEvent
  | RequestStartEvent
  | Message
  | TombstoneMessage
  | ToolUseSummaryMessage,
  StopHookResult
> {
  const hookStartTime = Date.now()

  const stopHookContext: REPLHookContext = {
    messages: [...messagesForQuery, ...assistantMessages],
    systemPrompt,
    userContext,
    systemContext,
    toolUseContext,
    querySource,
  }
  // Only save params for main session queries — subagents must not overwrite.
  // Outside the prompt-suggestion gate: the REPL /btw command and the
  // side_question SDK control_request both read this snapshot, and neither
  // depends on prompt suggestions being enabled.
  if (querySource.startsWith('repl_main_thread') || querySource === 'sdk') {
    saveCacheSafeParams(createCacheSafeParams(stopHookContext))
  }

  const classifierSinks = taskSummaryModule
    ? taskSummaryModule.sinksFor(taskSummaryModule.detectSurfaces())
    : null
  const classifierEngine = classifierSinks
    ? taskSummaryModule!.engineFor(classifierSinks)
    : null
  if (
    classifierState &&
    classifierEngine &&
    isMainQuerySource(querySource) &&
    !toolUseContext.agentId
  ) {
    classifierState.lastEmittedDetail = ''
    if (classifierSinks!.has('summary')) {
      toolUseContext.setAppState(state =>
        state.postTurnSummary === null
          ? state
          : { ...state, postTurnSummary: null },
      )
    }
    classifierState.onClassified = (classification, midturn) => {
      if (midturn || !classifierSinks!.has('summary')) return
      const summary = taskSummaryModule!.classifiedToPostTurnSummary(
        classification,
      )
      toolUseContext.setAppState(state =>
        state.postTurnSummary?.status_category === summary.status_category &&
        state.postTurnSummary.status_detail === summary.status_detail
          ? state
          : { ...state, postTurnSummary: summary },
      )
      toolUseContext.sessionState?.notifyMetadataChanged({
        post_turn_summary: summary,
      })
      getReplBridgeHandle()?.reportMetadata({ post_turn_summary: summary })
      enqueueSdkEvent({
        type: 'system',
        subtype: 'post_turn_summary',
        summarizes_uuid: assistantMessages.at(-1)?.uuid ?? '',
        ...summary,
      })
    }
    const mainThreadAgentType = getMainThreadAgentType()
    const mainThreadAgent = mainThreadAgentType
      ? toolUseContext.options.agentDefinitions.activeAgents.find(
          agent => agent.agentType === mainThreadAgentType,
        )
      : undefined
    const turnAssistantMessages = stopHookContext.messages.filter(
      (m): m is AssistantMessage => m.type === 'assistant',
    )
    const latestUserMessage = stopHookContext.messages.findLast(
      message =>
        message.type === 'user' &&
        !message.isMeta &&
        typeof message.message.content === 'string',
    )
    if (
      latestUserMessage?.type === 'user' &&
      typeof latestUserMessage.message.content === 'string'
    ) {
      jobClassifierModule!.captureLatestAsk(
        classifierState,
        latestUserMessage.message.content,
      )
    }
    const classification = jobClassifierModule!
      .classifyAndPush(
        classifierState,
        getSessionId().slice(0, 8),
        mainThreadAgent?.agentType ?? 'bg',
        '',
        turnAssistantMessages,
        hasActiveClassifierTasks(toolUseContext.getAppState().tasks),
        classifierEngine,
      )
      .catch(err => {
        logForDebugging(`[classifier] error: ${errorMessage(err)}`, {
          level: 'error',
        })
      })
    if (process.env.CLAUDE_CODE_SESSION_KIND === 'bg' || querySource === 'sdk') {
      await Promise.race([
        classification,
        // eslint-disable-next-line no-restricted-syntax -- timer must not block exit
        new Promise<void>(resolve => setTimeout(resolve, 60_000).unref()),
      ])
    }
  }
  // --bare / SIMPLE: skip background bookkeeping (prompt suggestion,
  // memory extraction, auto-dream). Scripted -p calls don't want auto-memory
  // or forked agents contending for resources during shutdown.
  if (!isBareMode()) {
    // Inline env check for dead code elimination in external builds
    if (!isEnvDefinedFalsy(process.env.CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION)) {
      void executePromptSuggestion(stopHookContext)
    }
    if (
      feature('EXTRACT_MEMORIES') &&
      !toolUseContext.agentId &&
      isExtractModeActive()
    ) {
      // Fire-and-forget in both interactive and non-interactive. For -p/SDK,
      // print.ts drains the in-flight promise after flushing the response
      // but before gracefulShutdownSync (see drainPendingExtraction).
      void extractMemoriesModule!.executeExtractMemories(
        stopHookContext,
        toolUseContext.appendSystemMessage,
      )
    }
    if (!toolUseContext.agentId) {
      void executeAutoDream(stopHookContext, toolUseContext.appendSystemMessage)
    }
  }

  // chicago MCP: auto-unhide + lock release at turn end.
  // Main thread only — the CU lock is a process-wide module-level variable,
  // so a subagent's stopHooks releasing it leaves the main thread's cleanup
  // seeing isLockHeldLocally()===false → no exit notification, and unhides
  // mid-turn. Subagents don't start CU sessions so this is a pure skip.
  if (feature('CHICAGO_MCP') && !toolUseContext.agentId) {
    try {
      const { cleanupComputerUseAfterTurn } = await import(
        '../utils/computerUse/cleanup.js'
      )
      await cleanupComputerUseAfterTurn(toolUseContext)
    } catch {
      // Failures are silent — this is dogfooding cleanup, not critical path
    }
  }

  let briefEnforcementError: Message | null = null
  if (
    isMainQuerySource(querySource) &&
    briefToolModule?.isBriefEnabled() &&
    !isEnvTruthy(process.env.DISABLE_BRIEF_MODE_STOP_HOOK) &&
    briefPromptModule &&
    !toolUseContext.agentId &&
    toolUseContext.options.tools.some(tool =>
      toolMatchesName(tool, briefPromptModule.BRIEF_TOOL_NAME),
    )
  ) {
    try {
      const latestUserIndex = messagesForQuery.findLastIndex(
        message =>
          message.type === 'user' &&
          !message.isMeta &&
          !message.toolUseResult,
      )
      const messagesSinceLatestUser = messagesForQuery.slice(
        latestUserIndex + 1,
      )
      const calledBrief =
        messagesSinceLatestUser.some(
          message =>
            message.type === 'assistant' &&
            message.message.content.some(
              block =>
                block.type === 'tool_use' &&
                (block.name === briefPromptModule.BRIEF_TOOL_NAME ||
                  block.name === briefPromptModule.LEGACY_BRIEF_TOOL_NAME),
            ),
        ) ||
        assistantMessages.some(message =>
          message.message.content.some(
            block =>
              block.type === 'tool_use' &&
              (block.name === briefPromptModule.BRIEF_TOOL_NAME ||
                block.name === briefPromptModule.LEGACY_BRIEF_TOOL_NAME),
          ),
        )
      const alreadyEnforced =
        !calledBrief &&
        messagesSinceLatestUser.some(
          message =>
            message.type === 'user' &&
            message.isMeta &&
            typeof message.message.content === 'string' &&
            message.message.content.includes(
              briefPromptModule.BRIEF_ENFORCE_SENTINEL,
            ),
        )
      if (!calledBrief && !alreadyEnforced) {
        briefEnforcementError = createUserMessage({
          content: getStopHookMessage({
            blockingError: `You ended the turn without calling ${briefPromptModule.BRIEF_TOOL_NAME}. ${briefPromptModule.BRIEF_ENFORCE_SENTINEL}`,
            command: 'brief-mode-enforce',
          }),
          isMeta: true,
        })
        yield briefEnforcementError
      }
    } catch (error) {
      logForDebugging(
        `Brief mode enforcement failed: ${errorMessage(error)}`,
        { level: 'error' },
      )
    }
  }

  try {
    const blockingErrors: Message[] = []
    if (briefEnforcementError) blockingErrors.push(briefEnforcementError)
    const appState = toolUseContext.getAppState()
    const permissionMode = appState.toolPermissionContext.mode

    const generator = executeStopHooks(
      permissionMode,
      toolUseContext.abortController.signal,
      undefined,
      stopHookActive ?? false,
      toolUseContext.agentId,
      toolUseContext,
      [...messagesForQuery, ...assistantMessages],
      toolUseContext.agentType,
    )

    // Consume all progress messages and get blocking errors
    let stopHookToolUseID = ''
    let hookCount = 0
    let preventedContinuation = false
    let stopReason = ''
    let hasOutput = false
    const hookErrors: string[] = []
    const hookInfos: StopHookInfo[] = []

    for await (const result of generator) {
      if (result.message) {
        yield result.message
        // Track toolUseID from progress messages and count hooks
        if (result.message.type === 'progress' && result.message.toolUseID) {
          stopHookToolUseID = result.message.toolUseID
          hookCount++
          // Extract hook command and prompt text from progress data
          const progressData = result.message.data as HookProgress
          if (progressData.command) {
            hookInfos.push({
              command: progressData.command,
              promptText: progressData.promptText,
            })
          }
        }
        // Track errors and output from attachments
        if (result.message.type === 'attachment') {
          const attachment = result.message.attachment
          if (
            'hookEvent' in attachment &&
            (attachment.hookEvent === 'Stop' ||
              attachment.hookEvent === 'SubagentStop')
          ) {
            if (attachment.type === 'hook_non_blocking_error') {
              hookErrors.push(
                attachment.stderr || `Exit code ${attachment.exitCode}`,
              )
              // Non-blocking errors always have output
              hasOutput = true
            } else if (attachment.type === 'hook_error_during_execution') {
              hookErrors.push(attachment.content)
              hasOutput = true
            } else if (attachment.type === 'hook_success') {
              // Check if successful hook produced any stdout/stderr
              if (
                (attachment.stdout && attachment.stdout.trim()) ||
                (attachment.stderr && attachment.stderr.trim())
              ) {
                hasOutput = true
              }
            }
            // Extract per-hook duration for timing visibility.
            // Hooks run in parallel; match by command + first unassigned entry.
            if ('durationMs' in attachment && 'command' in attachment) {
              const info = hookInfos.find(
                i =>
                  i.command === attachment.command &&
                  i.durationMs === undefined,
              )
              if (info) {
                info.durationMs = attachment.durationMs
              }
            }
          }
        }
      }
      if (result.blockingError) {
        const userMessage = createUserMessage({
          content: getStopHookMessage(result.blockingError),
          isMeta: true, // Hide from UI (shown in summary message instead)
        })
        blockingErrors.push(userMessage)
        yield userMessage
        hasOutput = true
        // Add to hookErrors so it appears in the summary
        hookErrors.push(result.blockingError.blockingError)
      }
      // Check if hook wants to prevent continuation
      if (result.preventContinuation) {
        preventedContinuation = true
        stopReason = result.stopReason || 'Stop hook prevented continuation'
        // Create attachment to track the stopped continuation (for structured data)
        yield createAttachmentMessage({
          type: 'hook_stopped_continuation',
          message: stopReason,
          hookName: 'Stop',
          toolUseID: stopHookToolUseID,
          hookEvent: 'Stop',
        })
      }

      // Check if we were aborted during hook execution
      if (toolUseContext.abortController.signal.aborted) {
        logEvent('tengu_pre_stop_hooks_cancelled', {
          queryChainId: toolUseContext.queryTracking
            ?.chainId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,

          queryDepth: toolUseContext.queryTracking?.depth,
        })
        yield createUserInterruptionMessage({
          toolUse: false,
        })
        return { blockingErrors: [], preventContinuation: true }
      }
    }

    // Create summary system message if hooks ran
    if (hookCount > 0) {
      yield createStopHookSummaryMessage(
        hookCount,
        hookInfos,
        hookErrors,
        preventedContinuation,
        stopReason,
        hasOutput,
        'suggestion',
        stopHookToolUseID,
      )

      // Send notification about errors (shown in verbose/transcript mode via ctrl+o)
      if (hookErrors.length > 0) {
        const expandShortcut = getShortcutDisplay(
          'app:toggleTranscript',
          'Global',
          'ctrl+o',
        )
        toolUseContext.addNotification?.({
          key: 'stop-hook-error',
          text: `Stop hook error occurred \u00b7 ${expandShortcut} to see`,
          priority: 'immediate',
        })
        if (!(stopHookActive ?? false)) {
          enqueueSdkEvent({
            type: 'system',
            subtype: 'notification',
            key: 'stop-hook-error',
            text: 'Stop hook error occurred',
            priority: 'immediate',
          })
        }
      }
    }

    if (preventedContinuation) {
      return { blockingErrors: [], preventContinuation: true }
    }

    // Collect blocking errors from stop hooks
    if (blockingErrors.length > 0) {
      return { blockingErrors, preventContinuation: false }
    }

    // After Stop hooks pass, run TeammateIdle and TaskCompleted hooks if this is a teammate
    if (isTeammate()) {
      const teammateName = getAgentName() ?? ''
      const teamName = getTeamName() ?? ''
      const teammateBlockingErrors: Message[] = []
      let teammatePreventedContinuation = false
      let teammateStopReason: string | undefined
      // Each hook executor generates its own toolUseID — capture from progress
      // messages (same pattern as stopHookToolUseID at L142), not the Stop ID.
      let teammateHookToolUseID = ''

      // Run TaskCompleted hooks for any in-progress tasks owned by this teammate
      const taskListId = getTaskListId()
      const tasks = await listTasks(taskListId)
      const inProgressTasks = tasks.filter(
        t => t.status === 'in_progress' && t.owner === teammateName,
      )

      for (const task of inProgressTasks) {
        const taskCompletedGenerator = executeTaskCompletedHooks(
          task.id,
          task.subject,
          task.description,
          teammateName,
          teamName,
          permissionMode,
          toolUseContext.abortController.signal,
          undefined,
          toolUseContext,
        )

        for await (const result of taskCompletedGenerator) {
          if (result.message) {
            if (
              result.message.type === 'progress' &&
              result.message.toolUseID
            ) {
              teammateHookToolUseID = result.message.toolUseID
            }
            yield result.message
          }
          if (result.blockingError) {
            const userMessage = createUserMessage({
              content: getTaskCompletedHookMessage(result.blockingError),
              isMeta: true,
            })
            teammateBlockingErrors.push(userMessage)
            yield userMessage
          }
          // Match Stop hook behavior: allow preventContinuation/stopReason
          if (result.preventContinuation) {
            teammatePreventedContinuation = true
            teammateStopReason =
              result.stopReason || 'TaskCompleted hook prevented continuation'
            yield createAttachmentMessage({
              type: 'hook_stopped_continuation',
              message: teammateStopReason,
              hookName: 'TaskCompleted',
              toolUseID: teammateHookToolUseID,
              hookEvent: 'TaskCompleted',
            })
          }
          if (toolUseContext.abortController.signal.aborted) {
            return { blockingErrors: [], preventContinuation: true }
          }
        }
      }

      // Run TeammateIdle hooks
      const teammateIdleGenerator = executeTeammateIdleHooks(
        teammateName,
        teamName,
        permissionMode,
        toolUseContext.abortController.signal,
        undefined,
        toolUseContext,
      )

      for await (const result of teammateIdleGenerator) {
        if (result.message) {
          if (result.message.type === 'progress' && result.message.toolUseID) {
            teammateHookToolUseID = result.message.toolUseID
          }
          yield result.message
        }
        if (result.blockingError) {
          const userMessage = createUserMessage({
            content: getTeammateIdleHookMessage(result.blockingError),
            isMeta: true,
          })
          teammateBlockingErrors.push(userMessage)
          yield userMessage
        }
        // Match Stop hook behavior: allow preventContinuation/stopReason
        if (result.preventContinuation) {
          teammatePreventedContinuation = true
          teammateStopReason =
            result.stopReason || 'TeammateIdle hook prevented continuation'
          yield createAttachmentMessage({
            type: 'hook_stopped_continuation',
            message: teammateStopReason,
            hookName: 'TeammateIdle',
            toolUseID: teammateHookToolUseID,
            hookEvent: 'TeammateIdle',
          })
        }
        if (toolUseContext.abortController.signal.aborted) {
          return { blockingErrors: [], preventContinuation: true }
        }
      }

      if (teammatePreventedContinuation) {
        return { blockingErrors: [], preventContinuation: true }
      }

      if (teammateBlockingErrors.length > 0) {
        return {
          blockingErrors: teammateBlockingErrors,
          preventContinuation: false,
        }
      }
    }

    return { blockingErrors: [], preventContinuation: false }
  } catch (error) {
    const durationMs = Date.now() - hookStartTime
    logEvent('tengu_stop_hook_error', {
      duration: durationMs,

      queryChainId: toolUseContext.queryTracking
        ?.chainId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      queryDepth: toolUseContext.queryTracking?.depth,
    })
    // Yield a system message that is not visible to the model for the user
    // to debug their hook.
    yield createSystemMessage(
      `Stop hook failed: ${errorMessage(error)}`,
      'warning',
    )
    return {
      blockingErrors: briefEnforcementError ? [briefEnforcementError] : [],
      preventContinuation: false,
    }
  }
}
