import { dirname, sep } from 'path'
import { query as runQuery } from '../query.js'
import { getDefaultAppState } from '../state/AppStateStore.js'
import type { Message } from '../types/message.js'
import type { LogOption } from '../types/logs.js'
import type { ToolUseContext } from '../Tool.js'
import { FileReadTool } from '../tools/FileReadTool/FileReadTool.js'
import { GrepTool } from '../tools/GrepTool/GrepTool.js'
import { createAbortController } from './abortController.js'
import { NOOP_AGENT_LIFECYCLE } from './agentLifecycle.js'
import { createFileStateCacheWithSizeLimit } from './fileStateCache.js'
import { logForDebugging } from './debug.js'
import { getLogDisplayTitle, logError } from './log.js'
import { createUserMessage } from './messages.js'
import { getSmallFastModel } from './model/model.js'
import { hasPermissionsToUseTool } from './permissions/permissions.js'
import { expandPath } from './path.js'
import { getSessionIdFromLog } from './sessionStorage.js'
import { jsonParse } from './slowOperations.js'
import { asSystemPrompt } from './systemPromptType.js'
import type { CanUseToolFn } from '../hooks/useCanUseTool.js'

const MAX_TURNS = 20
const MAX_RECENT_SESSIONS = 50
const SEARCH_TOOLS = [FileReadTool, GrepTool]

const SESSION_SEARCH_SYSTEM_PROMPT = `You are searching for past Claude Code conversation sessions on behalf of the user.

Session transcripts are stored as .jsonl files under the projects directory. Each line is a JSON message; user and assistant messages contain a "content" field with the conversation text. The filename (without .jsonl) is the session ID.

You have Grep and Read tools. Use Grep with files_with_matches mode to scan transcript content efficiently before reading individual files.

When you have identified the matching sessions, end with ONLY a JSON object on its own line:
{"session_ids": ["<uuid>", ...]}

Return session IDs ordered by relevance (most relevant first). Return an empty array if nothing matches.`

function buildRecentSessionMetadata(logs: LogOption[]): string {
  return logs
    .slice(0, MAX_RECENT_SESSIONS)
    .map(log => {
      const sessionId = getSessionIdFromLog(log) ?? '?'
      const parts = [sessionId, getLogDisplayTitle(log)]
      if (log.tag) parts.push(`[tag: ${log.tag}]`)
      if (log.gitBranch) parts.push(`[branch: ${log.gitBranch}]`)
      if (log.projectPath) parts.push(`[path: ${log.projectPath}]`)
      return parts.join(' ')
    })
    .join('\n')
}

function createSearchContext(
  initialMessages: Message[],
  abortController: AbortController,
  transcriptDirectories: string[],
): ToolUseContext {
  const initialState = getDefaultAppState()
  const additionalWorkingDirectories = new Map(
    transcriptDirectories.map(directory => [
      directory,
      { path: directory, source: 'session' as const },
    ]),
  )
  const appState = {
    ...initialState,
    toolPermissionContext: {
      ...initialState.toolPermissionContext,
      additionalWorkingDirectories,
    },
  }
  return {
    options: {
      commands: [],
      debug: false,
      mainLoopModel: getSmallFastModel(),
      tools: SEARCH_TOOLS,
      verbose: false,
      thinkingConfig: { type: 'disabled' },
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: true,
      agentDefinitions: { activeAgents: [], allAgents: [] },
    },
    abortController,
    readFileState: createFileStateCacheWithSizeLimit(100),
    getAppState: () => appState,
    setAppState: () => {},
    getToolPermissionContext: () => appState.toolPermissionContext,
    setReplContext: () => {},
    agentLifecycle: NOOP_AGENT_LIFECYCLE,
    messages: initialMessages,
    turnStartIndex: 0,
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    updateFileHistoryState: () => {},
    updateAttributionState: () => {},
  }
}

function scopedCanUseTool(transcriptDirectories: string[]): CanUseToolFn {
  const deny = (message: string) => ({
    behavior: 'deny' as const,
    message,
    decisionReason: {
      type: 'other' as const,
      reason: 'session_search_out_of_scope',
    },
  })
  return async (tool, input, ...rest) => {
    const decision = await hasPermissionsToUseTool(tool, input, ...rest)
    if (decision.behavior === 'ask') return deny(decision.message)
    if (decision.behavior === 'allow') {
      const toolPath = tool.getPath?.(input)
      const absolutePath = toolPath ? expandPath(toolPath) : undefined
      if (
        absolutePath &&
        !transcriptDirectories.some(
          directory =>
            absolutePath === directory ||
            absolutePath.startsWith(directory + sep),
        )
      ) {
        return deny(
          `${absolutePath} is outside the session transcript directories`,
        )
      }
    }
    return decision
  }
}

function finalAssistantText(messages: Message[]): string {
  const finalAssistant = messages.findLast(message => message.type === 'assistant')
  if (!finalAssistant || finalAssistant.type !== 'assistant') return ''
  return finalAssistant.message.content
    .filter(block => block.type === 'text')
    .map(block => (block.type === 'text' ? block.text : ''))
    .join('\n')
}

export async function agenticSessionSearch(
  searchQuery: string,
  logs: LogOption[],
  signal?: AbortSignal,
): Promise<LogOption[]> {
  if (!searchQuery.trim() || logs.length === 0) return []

  const transcriptDirectories = Array.from(
    new Set(
      logs
        .map(log => (log.fullPath ? dirname(log.fullPath) : undefined))
        .filter((directory): directory is string => directory !== undefined),
    ),
  )
  if (transcriptDirectories.length === 0) return []

  const prompt = `Search query: "${searchQuery}"

Search ONLY these transcript directories (other paths are out of scope):
${transcriptDirectories.join('\n')}

Recent sessions (id title metadata) — partial list, the match may not be here:
${buildRecentSessionMetadata(logs)}

Find sessions whose transcript content matches the query by grepping the .jsonl files under the directories above.`
  const initialMessages: Message[] = [createUserMessage({ content: prompt })]
  if (signal?.aborted) return []

  const abortController = createAbortController()
  const abort = () => abortController.abort()
  signal?.addEventListener('abort', abort)
  const toolUseContext = createSearchContext(
    initialMessages,
    abortController,
    transcriptDirectories,
  )
  const messages = [...initialMessages]
  logForDebugging(
    `Agentic search: querying ${logs.length} logs for "${searchQuery}" across ${transcriptDirectories.length} dirs`,
  )

  try {
    for await (const message of runQuery({
      messages: initialMessages,
      systemPrompt: asSystemPrompt([SESSION_SEARCH_SYSTEM_PROMPT]),
      userContext: {},
      systemContext: {},
      canUseTool: scopedCanUseTool(transcriptDirectories),
      toolUseContext,
      querySource: 'session_search',
      maxTurns: MAX_TURNS,
    })) {
      if (
        message.type === 'stream_event' ||
        message.type === 'stream_request_start'
      ) {
        continue
      }
      if (message.type === 'assistant' || message.type === 'user') {
        messages.push(message)
      }
    }
  } catch (error) {
    if (abortController.signal.aborted) return []
    logError(error as Error)
    return []
  } finally {
    signal?.removeEventListener('abort', abort)
    toolUseContext.readFileState.clear()
  }

  const response = finalAssistantText(messages)
  logForDebugging(`Agentic search response: ${response}`)
  const encodedIds = Array.from(
    response.matchAll(/"session_ids"\s*:\s*(\[[^\]]*\])/g),
  ).at(-1)?.[1]
  if (!encodedIds) {
    logForDebugging('Agentic search: no session_ids array in final response')
    return []
  }

  let sessionIds: string[]
  try {
    const parsed = jsonParse(encodedIds)
    sessionIds = Array.from(
      new Set(
        Array.isArray(parsed)
          ? parsed.filter((value): value is string => typeof value === 'string')
          : [],
      ),
    )
  } catch (error) {
    logError(error as Error)
    return []
  }

  const logsById = new Map<string, LogOption>()
  for (const log of logs) {
    const sessionId = getSessionIdFromLog(log)
    if (sessionId) logsById.set(sessionId, log)
  }
  const matchingLogs = sessionIds
    .map(sessionId => logsById.get(sessionId))
    .filter((log): log is LogOption => log !== undefined)
  logForDebugging(
    `Agentic search found ${matchingLogs.length}/${sessionIds.length} resumable sessions`,
  )
  return matchingLogs
}
