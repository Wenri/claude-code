import type { Message } from '../types/message.js'
import {
  getLastCacheSafeParams,
  runForkedAgent,
} from '../utils/forkedAgent.js'
import { logForDebugging } from '../utils/debug.js'
import { createUserMessage } from '../utils/messages.js'

const AWAY_SUMMARY_PROMPT =
  'The user stepped away and is coming back. Recap in under 40 words, 1-2 plain sentences, no markdown. Lead with the overall goal and current task, then the one next action. Skip root-cause narrative, fix internals, secondary to-dos, and em-dash tangents.'

export type AwaySummaryResult =
  | { kind: 'no-turn' | 'aborted' | 'failed' }
  | { kind: 'ok' | 'api-error'; text: string }

function extractAssistantText(
  messages: readonly Message[],
  includeApiErrors: boolean,
): string {
  return messages
    .flatMap(message => {
      if (
        message.type !== 'assistant' ||
        (!includeApiErrors && message.isApiErrorMessage)
      ) {
        return []
      }
      return Array.isArray(message.message.content)
        ? message.message.content
        : []
    })
    .filter(block => block.type === 'text')
    .map(block => ('text' in block ? block.text : ''))
    .join('')
    .trim()
}

/** Run the recap as a cache-sharing, tool-denied, transcript-free fork. */
export async function generateAwaySummary(
  signal: AbortSignal,
): Promise<AwaySummaryResult> {
  const cacheSafeParams = getLastCacheSafeParams()
  if (!cacheSafeParams) {
    logForDebugging('[awaySummary] no CacheSafeParams saved, skipping')
    return { kind: 'no-turn' }
  }

  const controller = new AbortController()
  signal.addEventListener('abort', () => controller.abort(), { once: true })
  try {
    const { messages } = await runForkedAgent({
      promptMessages: [
        createUserMessage({ content: AWAY_SUMMARY_PROMPT }),
      ],
      cacheSafeParams,
      overrides: { abortController: controller },
      canUseTool: async () => ({
        behavior: 'deny' as const,
        message: 'Away summary cannot use tools',
        decisionReason: {
          type: 'other' as const,
          reason: 'away_summary',
        },
      }),
      querySource: 'away_summary',
      forkLabel: 'away_summary',
      maxTurns: 1,
      skipCacheWrite: true,
      skipTranscript: true,
    })
    if (signal.aborted) return { kind: 'aborted' }
    const apiError = messages.find(
      message => message.type === 'assistant' && message.isApiErrorMessage,
    )
    if (apiError) {
      return {
        kind: 'api-error',
        text: extractAssistantText([apiError], true),
      }
    }
    const text = extractAssistantText(messages, false)
    return text ? { kind: 'ok', text } : { kind: 'failed' }
  } catch (error) {
    if (signal.aborted) return { kind: 'aborted' }
    logForDebugging(`[awaySummary] generation failed: ${error}`)
    return { kind: 'failed' }
  }
}
