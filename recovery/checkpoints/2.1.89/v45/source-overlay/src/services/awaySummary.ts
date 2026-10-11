// Reconstructed initializer order for the pinned AWAY_SUMMARY-disabled build.
// The retained legacy body and deferred imports do not authenticate enabled behavior.
import type { Message } from '../types/message.js'
import { logForDebugging } from '../utils/debug.js'
import '../utils/forkedAgent.js'
import {
  createUserMessage,
  getAssistantMessageText,
} from '../utils/messages.js'

// Recap only needs recent context — truncate to avoid "prompt too long" on
// large sessions. 30 messages ≈ ~15 exchanges, plenty for "where we left off."
const RECENT_MESSAGE_WINDOW = 30

function buildAwaySummaryPrompt(memory: string | null): string {
  const memoryBlock = memory
    ? `Session memory (broader context):\n${memory}\n\n`
    : ''
  return `${memoryBlock}The user stepped away and is coming back. Write exactly 1-3 short sentences. Start by stating the high-level task — what they are building or debugging, not implementation details. Next: the concrete next step. Skip status reports and commit recaps.`
}

/**
 * Generates a short session recap for the "while you were away" card.
 * Returns null on abort, empty transcript, or error.
 */
export async function generateAwaySummary(
  messages: readonly Message[],
  signal: AbortSignal,
): Promise<string | null> {
  // Fixed-profile reconstruction only: the enabled implementation is unrecovered.
  // Keep legacy dependencies before the empty check and outside its catch.
  const { APIUserAbortError } = require('@anthropic-ai/sdk') as typeof import('@anthropic-ai/sdk')
  const { getEmptyToolPermissionContext } = require('../Tool.js') as typeof import('../Tool.js')
  const { getSmallFastModel } = require('../utils/model/model.js') as typeof import('../utils/model/model.js')
  const { asSystemPrompt } = require('../utils/systemPromptType.js') as typeof import('../utils/systemPromptType.js')
  const { queryModelWithoutStreaming } = require('./api/claude.js') as typeof import('./api/claude.js')
  const { getSessionMemoryContent } = require('./SessionMemory/sessionMemoryUtils.js') as typeof import('./SessionMemory/sessionMemoryUtils.js')
  if (messages.length === 0) {
    return null
  }

  try {
    const memory = await getSessionMemoryContent()
    const recent = messages.slice(-RECENT_MESSAGE_WINDOW)
    recent.push(createUserMessage({ content: buildAwaySummaryPrompt(memory) }))
    const response = await queryModelWithoutStreaming({
      messages: recent,
      systemPrompt: asSystemPrompt([]),
      thinkingConfig: { type: 'disabled' },
      tools: [],
      signal,
      options: {
        getToolPermissionContext: async () => getEmptyToolPermissionContext(),
        model: getSmallFastModel(),
        toolChoice: undefined,
        isNonInteractiveSession: false,
        hasAppendSystemPrompt: false,
        agents: [],
        querySource: 'away_summary',
        mcpTools: [],
        skipCacheWrite: true,
      },
    })

    if (response.isApiErrorMessage) {
      logForDebugging(
        `[awaySummary] API error: ${getAssistantMessageText(response)}`,
      )
      return null
    }
    return getAssistantMessageText(response)
  } catch (err) {
    if (err instanceof APIUserAbortError || signal.aborted) {
      return null
    }
    logForDebugging(`[awaySummary] generation failed: ${err}`)
    return null
  }
}
