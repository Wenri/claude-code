import { feature } from 'bun:bundle'
import type Anthropic from '@anthropic-ai/sdk'
import { logForDebugging } from '../utils/debug.js'
import { errorMessage } from '../utils/errors.js'
import { getDefaultSonnetModel } from '../utils/model/model.js'
import { sideQuery } from '../utils/sideQuery.js'
import { jsonParse } from '../utils/slowOperations.js'
import {
  formatMemoryManifest,
  type MemoryHeader,
  scanMemoryFiles,
} from './memoryScan.js'

export type RelevantMemory = {
  path: string
  mtimeMs: number
}

type MemorySelectorConversation = {
  memories: MemoryHeader[]
  byFilename: Map<string, MemoryHeader>
  messages: Anthropic.MessageParam[]
}

export type MemorySelectorState = {
  stateByDir: Map<string, MemorySelectorConversation>
  lastUsage: {
    cacheReadInputTokens: number
    cacheCreationInputTokens: number
    turnCount: number
  } | null
}

export function createMemorySelectorState(): MemorySelectorState {
  return { stateByDir: new Map(), lastUsage: null }
}

export function clearMemorySelectorState(
  state: MemorySelectorState | undefined,
): void {
  if (!state) return
  state.stateByDir.clear()
  state.lastUsage = null
}

const SELECT_MEMORIES_SYSTEM_PROMPT = `You are selecting memories that will be useful to Claude Code as it processes a user's query. The first message lists the available memory files with their filenames and descriptions; subsequent messages each contain one user query.

Return a list of filenames for the memories that will clearly be useful to Claude Code as it processes the user's query (up to 5). Only include memories that you are certain will be helpful based on their name and description.
- If you are unsure if a memory will be useful in processing the user's query, then do not include it in your list. Be selective and discerning.
- If there are no memories in the list that would clearly be useful, feel free to return an empty list.
- Be especially conservative with user-profile and project-overview memories ([user], [project]). These describe the user's ongoing focus, not what every question is about. A profile saying "works on DB performance" is NOT relevant to a question that merely contains the word "performance" unless the question is actually about that DB work. Match on what the question IS ABOUT, not on surface keyword overlap with who the user is.
- Do not re-select memories you already returned for an earlier query in this conversation.
`

const SYNTHESIZE_MEMORIES_SYSTEM_PROMPT = `You read persistent memory files for an AI coding assistant and extract facts to help the coding assistant answer queries. The first message lists every available memory file with its frontmatter and full body; each subsequent user message contains one query.

For each query, return a JSON object:
- relevant_facts: an array of facts (max 7) that would be useful for processing the query. Each fact is 1-2 sentences and stands on its own.
- cited_memories: array of filenames (matching the manifest exactly) for the memories you drew from

If no memories are relevant, return relevant_facts: [] and cited_memories: [].

A fact is useful when it lets the assistant do one of these things:
- Avoid re-asking: supply something the user would otherwise have to restate (a path, a name, a config value, a decision already made).
- Apply user preferences: surface conventions, styles, or tooling choices the assistant should follow for this query.
- Maintain continuity: surface the state of an ongoing project, goal, or prior thread that this query is continuing.
- Avoid a known pitfall: surface past corrections or mistakes so the assistant pre-empts repeating them.

Style and length:
- Each fact is 1-2 sentences. State the fact directly, then add the context needed to act on it.
- Name a path, flag, or identifier only when it is the thing the assistant must use or avoid. Drop supporting details like timestamps, byte counts, version numbers, and historical asides.
- Do not answer or solve the query yourself. You are a retrieval step, not the assistant: every fact must be lifted from a memory file body, not derived from general knowledge or your own reasoning about the query. If no memory covers it, return relevant_facts: [].
- Do not restate the query.
- If a prior turn in this conversation already returned the relevant facts for this query, return relevant_facts: [] and cited_memories: [] rather than restating.
`

/**
 * Find memory files relevant to a query by scanning memory file headers
 * and asking Sonnet to select the most relevant ones.
 *
 * Returns absolute file paths + mtime of the most relevant memories
 * (up to 5). Excludes MEMORY.md (already loaded in system prompt).
 * mtime is threaded through so callers can surface freshness to the
 * main model without a second stat.
 *
 * `alreadySurfaced` filters paths shown in prior turns before the
 * Sonnet call, so the selector spends its 5-slot budget on fresh
 * candidates instead of re-picking files the caller will discard.
 */
export async function findRelevantMemories(
  query: string,
  memoryDir: string,
  state: MemorySelectorState,
  signal: AbortSignal,
  alreadySurfaced: ReadonlySet<string> = new Set(),
): Promise<RelevantMemory[]> {
  state.lastUsage = null
  const cacheControl = { type: 'ephemeral' as const }
  let conversation = state.stateByDir.get(memoryDir)
  if (!conversation) {
    const memories = await scanMemoryFiles(memoryDir, signal)
    if (memories.length === 0 || signal.aborted) return []
    conversation = {
      memories,
      byFilename: new Map(memories.map(m => [m.filename, m])),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Available memories:\n${formatMemoryManifest(memories)}`,
              cache_control: cacheControl,
            },
          ],
        },
      ],
    }
    state.stateByDir.set(memoryDir, conversation)
  }
  if (conversation.memories.every(m => alreadySurfaced.has(m.filePath))) {
    return []
  }

  const selectedFilenames = await selectRelevantMemories(
    query,
    memoryDir,
    state,
    conversation.messages,
    conversation.byFilename,
    cacheControl,
    signal,
  )
  const selected = selectedFilenames
    .map(filename => conversation.byFilename.get(filename))
    .filter(
      (m): m is MemoryHeader =>
        m !== undefined && !alreadySurfaced.has(m.filePath),
    )

  // Fires even on empty selection: selection-rate needs the denominator,
  // and -1 ages distinguish "ran, picked nothing" from "never ran".
  if (feature('MEMORY_SHAPE_TELEMETRY')) {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { logMemoryRecallShape } =
      require('./memoryShapeTelemetry.js') as typeof import('./memoryShapeTelemetry.js')
    /* eslint-enable @typescript-eslint/no-require-imports */
    logMemoryRecallShape(conversation.memories, selected)
  }

  return selected.map(m => ({ path: m.filePath, mtimeMs: m.mtimeMs }))
}

async function selectRelevantMemories(
  query: string,
  memoryDir: string,
  state: MemorySelectorState,
  messages: Anthropic.MessageParam[],
  byFilename: Map<string, MemoryHeader>,
  cacheControl: { type: 'ephemeral' },
  signal: AbortSignal,
): Promise<string[]> {
  const prompt = `Select memories relevant to:\n${query}`

  try {
    const result = await sideQuery({
      model: getDefaultSonnetModel(),
      system: [
        {
          type: 'text',
          text: SELECT_MEMORIES_SYSTEM_PROMPT,
          cache_control: cacheControl,
        },
      ],
      skipSystemPromptPrefix: true,
      messages: [
        ...messages,
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt, cache_control: cacheControl },
          ],
        },
      ],
      max_tokens: 256,
      output_format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            selected_memories: { type: 'array', items: { type: 'string' } },
          },
          required: ['selected_memories'],
          additionalProperties: false,
        },
      },
      signal,
      querySource: 'memdir_relevance',
    })

    const textBlock = result.content.find(block => block.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return []
    }

    const parsed: { selected_memories: string[] } = jsonParse(textBlock.text)
    const conversation = state.stateByDir.get(memoryDir)
    if (conversation) {
      state.stateByDir.set(memoryDir, {
        ...conversation,
        messages: [
          ...conversation.messages,
          { role: 'user', content: [{ type: 'text', text: prompt }] },
          {
            role: 'assistant',
            content: [{ type: 'text', text: textBlock.text }],
          },
        ],
      })
    }
    state.lastUsage = {
      cacheReadInputTokens: result.usage.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens:
        result.usage.cache_creation_input_tokens ?? 0,
      turnCount: (messages.length + 1) / 2,
    }
    return parsed.selected_memories.filter(f => byFilename.has(f))
  } catch (e) {
    state.lastUsage = null
    if (signal.aborted) {
      return []
    }
    logForDebugging(
      `[memdir] selectRelevantMemories failed: ${errorMessage(e)}`,
      { level: 'warn' },
    )
    return []
  }
}

export type SynthesizedMemories = {
  synthesis: string
  citedMemories: string[]
}

export async function synthesizeRelevantMemories(
  query: string,
  memoryDir: string,
  state: MemorySelectorState,
  signal: AbortSignal,
): Promise<SynthesizedMemories | null> {
  state.lastUsage = null
  const cacheControl = { type: 'ephemeral' as const }
  let conversation = state.stateByDir.get(memoryDir)
  if (!conversation) {
    const memories = await scanMemoryFiles(memoryDir, signal)
    if (memories.length === 0 || signal.aborted) return null
    conversation = {
      memories,
      byFilename: new Map(memories.map(m => [m.filename, m])),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Available memories:\n${formatMemoryManifest(memories)}`,
              cache_control: cacheControl,
            },
          ],
        },
      ],
    }
    state.stateByDir.set(memoryDir, conversation)
  }

  const prompt = `Extract facts relevant to:\n${query}`
  try {
    const result = await sideQuery({
      model: getDefaultSonnetModel(),
      system: [
        {
          type: 'text',
          text: SYNTHESIZE_MEMORIES_SYSTEM_PROMPT,
          cache_control: cacheControl,
        },
      ],
      skipSystemPromptPrefix: true,
      messages: [
        ...conversation.messages,
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt, cache_control: cacheControl },
          ],
        },
      ],
      max_tokens: 2000,
      output_format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            relevant_facts: { type: 'array', items: { type: 'string' } },
            cited_memories: { type: 'array', items: { type: 'string' } },
          },
          required: ['relevant_facts', 'cited_memories'],
          additionalProperties: false,
        },
      },
      signal,
      querySource: 'memdir_relevance',
    })
    const textBlock = result.content.find(block => block.type === 'text')
    if (!textBlock || textBlock.type !== 'text') return null
    const parsed: { relevant_facts: string[]; cited_memories: string[] } =
      jsonParse(textBlock.text)
    state.stateByDir.set(memoryDir, {
      ...conversation,
      messages: [
        ...conversation.messages,
        { role: 'user', content: [{ type: 'text', text: prompt }] },
        {
          role: 'assistant',
          content: [{ type: 'text', text: textBlock.text }],
        },
      ],
    })
    state.lastUsage = {
      cacheReadInputTokens: result.usage.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens:
        result.usage.cache_creation_input_tokens ?? 0,
      turnCount: (conversation.messages.length + 1) / 2,
    }
    const facts = parsed.relevant_facts
      .map(fact => fact.trim())
      .filter(fact => fact.length > 0)
      .slice(0, 7)
    if (facts.length === 0) return null
    return {
      synthesis: facts.map(fact => `- ${fact}`).join('\n'),
      citedMemories: parsed.cited_memories.filter(filename =>
        conversation.byFilename.has(filename),
      ),
    }
  } catch (error) {
    state.lastUsage = null
    if (signal.aborted) return null
    logForDebugging(
      `[memdir] synthesizeRelevantMemories failed: ${errorMessage(error)}`,
      { level: 'warn' },
    )
    return null
  }
}
