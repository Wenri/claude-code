import { randomUUID } from 'crypto'
import type { HookEvent } from 'src/entrypoints/agentSdkTypes.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import { queryModelWithoutStreaming } from '../../services/api/claude.js'
import { groupMessagesByApiRound } from '../../services/compact/grouping.js'
import { roughTokenCountEstimationForMessage } from '../../services/tokenEstimation.js'
import type { ToolUseContext } from '../../Tool.js'
import type { Message } from '../../types/message.js'
import { createAttachmentMessage } from '../attachments.js'
import { createCombinedAbortSignal } from '../combinedAbortSignal.js'
import {
  has1mContext,
  MODEL_CONTEXT_WINDOW_DEFAULT,
} from '../context.js'
import { logForDebugging } from '../debug.js'
import { errorMessage } from '../errors.js'
import type { HookResult } from '../hooks.js'
import { safeParseJSON } from '../json.js'
import {
  createUserMessage,
  extractTextContent,
  SYNTHETIC_MODEL,
} from '../messages.js'
import { getSmallFastModel } from '../model/model.js'
import type { PromptHook } from '../settings/types.js'
import { jsonStringify } from '../slowOperations.js'
import { asSystemPrompt } from '../systemPromptType.js'
import { addArgumentsToPrompt, hookResponseSchema } from './hookHelpers.js'

const STOP_HOOK_TRANSCRIPT_BUDGET_RATIO = 0.7

function estimateMessageGroupTokens(group: Message[]): number {
  let total = 0
  for (const message of group) {
    total +=
      message.type === 'assistant' || message.type === 'user'
        ? roughTokenCountEstimationForMessage(message)
        : jsonStringify(message).length / 4
  }
  return Math.ceil(total)
}

function lastResponseTokenCount(messages: Message[]): number {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (
      message?.type === 'assistant' &&
      'usage' in message.message &&
      message.message.model !== SYNTHETIC_MODEL
    ) {
      const usage = message.message.usage
      return (
        usage.input_tokens +
        (usage.cache_creation_input_tokens ?? 0) +
        (usage.cache_read_input_tokens ?? 0) +
        usage.output_tokens
      )
    }
  }
  return 0
}

function truncateStopHookTranscript(
  messages: Message[],
  evaluatorModel: string,
): Message[] {
  const contextWindow = has1mContext(evaluatorModel)
    ? 1_000_000
    : MODEL_CONTEXT_WINDOW_DEFAULT
  const budget = Math.floor(
    contextWindow * STOP_HOOK_TRANSCRIPT_BUDGET_RATIO,
  )
  if (lastResponseTokenCount(messages) <= budget) return messages

  const groups = groupMessagesByApiRound(messages)
  let selectedTokens = 0
  let suffixStart = groups.length
  for (let index = groups.length - 1; index >= 0; index--) {
    const group = groups[index]
    if (!group) continue
    const groupTokens = estimateMessageGroupTokens(group)
    // Always retain at least the newest complete API-round group, even when
    // that group alone exceeds the evaluator budget.
    if (
      suffixStart < groups.length &&
      selectedTokens + groupTokens > budget
    ) {
      break
    }
    selectedTokens += groupTokens
    suffixStart = index
  }

  const suffix = groups.slice(suffixStart).flat()
  const droppedMessages = messages.length - suffix.length
  if (droppedMessages <= 0) return messages

  logForDebugging(
    `Hooks: truncated Stop transcript ${messages.length}→${suffix.length} msgs (budget ${budget}, model ${evaluatorModel})`,
  )
  logEvent('tengu_hook_prompt_transcript_truncated', {
    droppedMessages,
    keptMessages: suffix.length,
    budget,
    evaluatorModel:
      evaluatorModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })
  return [
    createUserMessage({
      content: `[Earlier conversation truncated to fit the hook evaluator's context window — ${droppedMessages} earlier messages omitted. Evaluate the condition against the recent transcript below; if the required evidence may be in the omitted prefix, return {"ok": false, "reason": "insufficient evidence in transcript"}.]`,
    }),
    ...suffix,
  ]
}

/**
 * Execute a prompt-based hook using an LLM
 */
export async function execPromptHook(
  hook: PromptHook,
  hookName: string,
  hookEvent: HookEvent,
  jsonInput: string,
  signal: AbortSignal,
  toolUseContext: ToolUseContext,
  messages?: Message[],
  toolUseID?: string,
): Promise<HookResult> {
  // Use provided toolUseID or generate a new one
  const effectiveToolUseID = toolUseID || `hook-${randomUUID()}`
  const isStopHook = hookEvent === 'Stop' || hookEvent === 'SubagentStop'
  try {
    // Replace $ARGUMENTS with the JSON input
    const prompt = isStopHook
      ? `Based on the conversation transcript above, has the following stopping condition been satisfied? Answer based on transcript evidence only.

Condition: ${hook.prompt}`
      : hook.prompt
    const processedPrompt = addArgumentsToPrompt(prompt, jsonInput)
    logForDebugging(
      `Hooks: Processing prompt hook with prompt: ${processedPrompt}`,
    )

    // Create user message directly - no need for processUserInput which would
    // trigger UserPromptSubmit hooks and cause infinite recursion
    const userMessage = createUserMessage({ content: processedPrompt })
    const evaluatorModel = hook.model ?? getSmallFastModel()

    // Prepend conversation history if provided
    const messagesToQuery =
      messages && messages.length > 0
        ? [
            ...truncateStopHookTranscript(messages, evaluatorModel),
            userMessage,
          ]
        : [userMessage]

    logForDebugging(
      `Hooks: Querying model with ${messagesToQuery.length} messages`,
    )

    // Query the model with Haiku
    const hookTimeoutMs = hook.timeout ? hook.timeout * 1000 : 30000

    // Combined signal: aborts if either the hook signal or timeout triggers
    const { signal: combinedSignal, cleanup: cleanupSignal } =
      createCombinedAbortSignal(signal, { timeoutMs: hookTimeoutMs })

    try {
      const response = await queryModelWithoutStreaming({
        messages: messagesToQuery,
        systemPrompt: asSystemPrompt([
          isStopHook
            ? `You are evaluating a stop-condition hook in Claude Code. Read the conversation transcript carefully, then judge whether the user-provided condition is satisfied.

Your response must be a JSON object with one of these shapes:
- {"ok": true, "reason": "<quote evidence from the transcript that satisfies the condition>"}
- {"ok": false, "reason": "<quote what is missing or what blocks the condition>"}

Always include a "reason" field, quoting specific text from the transcript whenever possible. If the transcript does not contain clear evidence that the condition is satisfied, return {"ok": false, "reason": "insufficient evidence in transcript"}.`
            : `You are evaluating a hook condition in Claude Code. Judge whether the user-provided condition is met.

Your response must be a JSON object with one of these shapes:
- {"ok": true, "reason": "<reason the condition is met>"}
- {"ok": false, "reason": "<reason the condition is not met>"}

Always include a "reason" field.`,
        ]),
        thinkingConfig: { type: 'disabled' as const },
        tools: [],
        signal: combinedSignal,
        options: {
          async getToolPermissionContext() {
            const appState = toolUseContext.getAppState()
            return appState.toolPermissionContext
          },
          model: evaluatorModel,
          toolChoice: undefined,
          isNonInteractiveSession: true,
          hasAppendSystemPrompt: false,
          agents: [],
          querySource: 'hook_prompt',
          mcpTools: [],
          agentId: toolUseContext.agentId,
          outputFormat: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                ok: { type: 'boolean' },
                reason: { type: 'string' },
              },
              required: ['ok', 'reason'],
              additionalProperties: false,
            },
          },
        },
      })

      cleanupSignal()

      if (response.isApiErrorMessage) {
        const apiError = extractTextContent(response.message.content).trim()
        logForDebugging(
          `Hooks: prompt-hook evaluator API error: ${apiError}`,
          { level: 'error' },
        )
        return {
          hook,
          outcome: 'non_blocking_error',
          message: createAttachmentMessage({
            type: 'hook_non_blocking_error',
            hookName,
            toolUseID: effectiveToolUseID,
            hookEvent,
            stderr: `Hook evaluator API error: ${apiError}`,
            stdout: '',
            exitCode: 1,
          }),
        }
      }

      // Extract text content from response
      const content = extractTextContent(response.message.content)

      // Update response length for spinner display
      toolUseContext.setResponseLength(length => length + content.length)

      const fullResponse = content.trim()
      logForDebugging(`Hooks: Model response: ${fullResponse}`)

      const json = safeParseJSON(fullResponse)
      if (!json) {
        logForDebugging(
          `Hooks: error parsing response as JSON: ${fullResponse}`,
        )
        return {
          hook,
          outcome: 'non_blocking_error',
          message: createAttachmentMessage({
            type: 'hook_non_blocking_error',
            hookName,
            toolUseID: effectiveToolUseID,
            hookEvent,
            stderr: 'JSON validation failed',
            stdout: fullResponse,
            exitCode: 1,
          }),
        }
      }

      const parsed = hookResponseSchema().safeParse(json)
      if (!parsed.success) {
        logForDebugging(
          `Hooks: model response does not conform to expected schema: ${parsed.error.message}`,
        )
        return {
          hook,
          outcome: 'non_blocking_error',
          message: createAttachmentMessage({
            type: 'hook_non_blocking_error',
            hookName,
            toolUseID: effectiveToolUseID,
            hookEvent,
            stderr: `Schema validation failed: ${parsed.error.message}`,
            stdout: fullResponse,
            exitCode: 1,
          }),
        }
      }

      // Failed to meet condition
      if (!parsed.data.ok) {
        logForDebugging(
          `Hooks: Prompt hook condition was not met: ${parsed.data.reason}`,
        )
        return {
          hook,
          outcome: 'blocking',
          blockingError: {
            blockingError: `[${hook.prompt}]: ${parsed.data.reason}`,
            command: hook.prompt,
          },
          preventContinuation: !isStopHook,
          stopReason: parsed.data.reason,
        }
      }

      // Condition was met
      logForDebugging(
        `Hooks: Prompt hook condition was met: ${parsed.data.reason}`,
      )
      return {
        hook,
        outcome: 'success',
        message: createAttachmentMessage({
          type: 'hook_success',
          hookName,
          toolUseID: effectiveToolUseID,
          hookEvent,
          content: '',
        }),
      }
    } catch (error) {
      cleanupSignal()

      if (combinedSignal.aborted) {
        return {
          hook,
          outcome: 'cancelled',
        }
      }
      throw error
    }
  } catch (error) {
    const errorMsg = errorMessage(error)
    logForDebugging(`Hooks: Prompt hook error: ${errorMsg}`)
    return {
      hook,
      outcome: 'non_blocking_error',
      message: createAttachmentMessage({
        type: 'hook_non_blocking_error',
        hookName,
        toolUseID: effectiveToolUseID,
        hookEvent,
        stderr: `Error executing prompt hook: ${errorMsg}`,
        stdout: '',
        exitCode: 1,
      }),
    }
  }
}
