/**
 * Shared helpers for building the API cache-key prefix (systemPrompt,
 * userContext, systemContext) for query() calls.
 *
 * Lives in its own file because it imports from context.ts and
 * constants/prompts.ts, which are high in the dependency graph. Putting
 * these imports in systemPrompt.ts or sideQuestion.ts (both reachable
 * from commands.ts) would create cycles. Only entrypoint-layer files
 * import from here (QueryEngine.ts, cli/print.ts).
 */

import type { Command } from '../commands.js'
import {
  getExcludedDynamicSectionsContent,
  getSystemPrompt,
} from '../constants/prompts.js'
import { getSystemContext, getUserContext } from '../context.js'
import type { HookEvent } from '../entrypoints/agentSdkTypes.js'
import { abortSpeculation } from '../services/PromptSuggestion/speculation.js'
import type { MCPServerConnection } from '../services/mcp/types.js'
import { makeSetReplContext, type AppState } from '../state/AppStateStore.js'
import type { Tools, ToolUseContext } from '../Tool.js'
import type { AgentDefinition } from '../tools/AgentTool/loadAgentsDir.js'
import type { AgentId } from '../types/ids.js'
import type { Message } from '../types/message.js'
import { createAbortController } from './abortController.js'
import { createClassifierApprovalsSetter } from './classifierApprovals.js'
import type { FileStateCache } from './fileStateCache.js'
import type { CacheSafeParams } from './forkedAgent.js'
import {
  addFunctionHook,
  addSessionHook,
  clearSessionHooks,
  type FunctionHookCallback,
  removeFunctionHook,
  removeSessionHook,
} from './hooks/sessionHooks.js'
import { getMainLoopModel } from './model/model.js'
import type { HookCommand } from './settings/types.js'
import { asSystemPrompt } from './systemPromptType.js'
import { createTaskRegistry } from './task/framework.js'
import {
  shouldEnableThinkingByDefault,
  type ThinkingConfig,
} from './thinking.js'

/**
 * Fetch the three context pieces that form the API cache-key prefix:
 * systemPrompt parts, userContext, systemContext.
 *
 * When customSystemPrompt is set, the default getSystemPrompt build and
 * getSystemContext are skipped — the custom prompt replaces the default
 * entirely, and systemContext would be appended to a default that isn't
 * being used.
 *
 * Callers assemble the final systemPrompt from defaultSystemPrompt (or
 * customSystemPrompt) + optional extras + appendSystemPrompt. QueryEngine
 * injects coordinator userContext and memory-mechanics prompt on top;
 * sideQuestion's fallback uses the base result directly.
 */
export async function fetchSystemPromptParts({
  tools,
  mainLoopModel,
  additionalWorkingDirectories,
  mcpClients,
  customSystemPrompt,
  excludeDynamicSections,
}: {
  tools: Tools
  mainLoopModel: string
  additionalWorkingDirectories: string[]
  mcpClients: MCPServerConnection[]
  customSystemPrompt: string | string[] | undefined
  excludeDynamicSections?: boolean
}): Promise<{
  defaultSystemPrompt: string[]
  userContext: { [k: string]: string }
  systemContext: { [k: string]: string }
}> {
  const [defaultSystemPrompt, userContext, systemContext, excludedSections] =
    await Promise.all([
    customSystemPrompt !== undefined
      ? Promise.resolve([])
      : getSystemPrompt(
          tools,
          mainLoopModel,
          additionalWorkingDirectories,
          mcpClients,
          { excludeDynamicSections },
        ),
    getUserContext(),
    customSystemPrompt !== undefined ? Promise.resolve({}) : getSystemContext(),
    excludeDynamicSections && customSystemPrompt === undefined
      ? getExcludedDynamicSectionsContent(
          mainLoopModel,
          additionalWorkingDirectories,
        )
      : Promise.resolve({}),
  ])
  if (excludeDynamicSections && customSystemPrompt === undefined) {
    return {
      defaultSystemPrompt,
      userContext: { ...systemContext, ...userContext, ...excludedSections },
      systemContext: {},
    }
  }
  return { defaultSystemPrompt, userContext, systemContext }
}

type SetAppState = (updater: (previous: AppState) => AppState) => void

type WebBrowserState = {
  view: unknown
  logs: unknown[]
  unreadErrors: number
  unreadWarnings: number
  cleanupRegistered: boolean
}

function createSessionHooksRegistry(setAppState: SetAppState) {
  return {
    add(
      sessionId: string,
      event: HookEvent,
      matcher: string,
      hook: HookCommand,
      skillRoot?: string,
    ) {
      addSessionHook(
        setAppState,
        sessionId,
        event,
        matcher,
        hook,
        undefined,
        skillRoot,
      )
    },
    addFunction(
      sessionId: string,
      event: HookEvent,
      matcher: string,
      callback: FunctionHookCallback,
      errorMessage: string,
      options?: { timeout?: number; id?: string },
    ) {
      return addFunctionHook(
        setAppState,
        sessionId,
        event,
        matcher,
        callback,
        errorMessage,
        options,
      )
    },
    remove(sessionId: string, event: HookEvent, hook: HookCommand) {
      removeSessionHook(setAppState, sessionId, event, hook)
    },
    removeFunction(sessionId: string, event: HookEvent, hookId: string) {
      removeFunctionHook(setAppState, sessionId, event, hookId)
    },
    clear(sessionId: string) {
      clearSessionHooks(setAppState, sessionId)
    },
  }
}

function createReplContextSetter(setAppState: SetAppState) {
  return (
    agentId: AgentId | string,
    replContext: unknown | undefined,
  ) => {
    setAppState(previous => {
      if (replContext === undefined) {
        if (!(agentId in previous.replContexts)) return previous
        const { [agentId]: _removed, ...replContexts } = previous.replContexts
        return { ...previous, replContexts }
      }
      if (previous.replContexts[agentId] === replContext) return previous
      return {
        ...previous,
        replContexts: { ...previous.replContexts, [agentId]: replContext },
      }
    })
  }
}

function createWebBrowserSliceSetter(setAppState: SetAppState) {
  return (
    updater: (previous: {
      webBrowser: WebBrowserState
      bagelActive?: boolean
      bagelUrl?: string
      bagelPanelVisible?: boolean
    }) => {
      webBrowser: WebBrowserState
      bagelActive?: boolean
      bagelUrl?: string
      bagelPanelVisible?: boolean
    },
  ) => {
    setAppState(previous => {
      const slice = {
        webBrowser: previous.webBrowser,
        bagelActive: previous.bagelActive,
        bagelUrl: previous.bagelUrl,
        bagelPanelVisible: previous.bagelPanelVisible,
      }
      const updated = updater(slice)
      if (updated === slice) return previous
      return { ...previous, ...updated } as AppState
    })
  }
}

function createAgentLifecycle(setAppState: SetAppState) {
  return {
    markTypeInvoked(agentType: string) {
      setAppState(previous =>
        previous.agentTypesInvokedThisSession.has(agentType)
          ? previous
          : {
              ...previous,
              agentTypesInvokedThisSession: new Set(
                previous.agentTypesInvokedThisSession,
              ).add(agentType),
            },
      )
    },
    registerName(name: string, agentId: AgentId) {
      setAppState(previous => {
        if (previous.agentNameRegistry.get(name) === agentId) return previous
        const agentNameRegistry = new Map(previous.agentNameRegistry)
        agentNameRegistry.set(name, agentId)
        return { ...previous, agentNameRegistry }
      })
    },
    clearTodos(agentId: AgentId | string) {
      setAppState(previous => {
        if (!(agentId in previous.todos)) return previous
        const { [agentId]: _removed, ...todos } = previous.todos
        return { ...previous, todos }
      })
    },
  }
}

function createTeammateColors(
  getAppState: () => AppState,
  setAppState: SetAppState,
) {
  return {
    assign(teammateId: string): AgentColorName {
      const colors = getAppState().teammateColors
      const existing = colors.assignments.get(teammateId)
      if (existing) return existing
      const color = AGENT_COLORS[colors.index % AGENT_COLORS.length]!
      setAppState(previous => {
        const previousColors = previous.teammateColors
        if (previousColors.assignments.has(teammateId)) return previous
        const assignments = new Map(previousColors.assignments)
        assignments.set(teammateId, color)
        return {
          ...previous,
          teammateColors: {
            assignments,
            index: previousColors.index + 1,
          },
        } as AppState
      })
      return color
    },
    get(teammateId: string) {
      return getAppState().teammateColors.assignments.get(teammateId)
    },
    clear() {
      setAppState(previous => {
        const colors = previous.teammateColors
        if (colors.assignments.size === 0 && colors.index === 0) return previous
        return {
          ...previous,
          teammateColors: { assignments: new Map(), index: 0 },
        } as AppState
      })
    },
  }
}

/**
 * Build CacheSafeParams from raw inputs when getLastCacheSafeParams() is null.
 *
 * Used by the SDK side_question handler (print.ts) on resume before a turn
 * completes — there's no stopHooks snapshot yet. Mirrors the system prompt
 * assembly in QueryEngine.ts:ask() so the rebuilt prefix matches what the
 * main loop will send, preserving the cache hit in the common case.
 *
 * May still miss the cache if the main loop applies extras this path doesn't
 * know about (coordinator mode, memory-mechanics prompt). That's acceptable —
 * the alternative is returning null and failing the side question entirely.
 */
export async function buildSideQuestionFallbackParams({
  tools,
  commands,
  mcpClients,
  messages,
  readFileState,
  getAppState,
  setAppState,
  customSystemPrompt,
  appendSystemPrompt,
  planModeInstructions,
  thinkingConfig,
  agents,
  excludeDynamicSections,
}: {
  tools: Tools
  commands: Command[]
  mcpClients: MCPServerConnection[]
  messages: Message[]
  readFileState: FileStateCache
  getAppState: () => AppState
  setAppState: (f: (prev: AppState) => AppState) => void
  customSystemPrompt: string | string[] | undefined
  appendSystemPrompt: string | undefined
  planModeInstructions?: string | undefined
  thinkingConfig: ThinkingConfig | undefined
  agents: AgentDefinition[]
  excludeDynamicSections?: boolean
}): Promise<CacheSafeParams> {
  const mainLoopModel = getMainLoopModel()
  const appState = getAppState()

  const { defaultSystemPrompt, userContext, systemContext } =
    await fetchSystemPromptParts({
      tools,
      mainLoopModel,
      additionalWorkingDirectories: Array.from(
        appState.toolPermissionContext.additionalWorkingDirectories.keys(),
      ),
      mcpClients,
      customSystemPrompt,
      excludeDynamicSections,
    })

  const systemPrompt = asSystemPrompt([
    ...(customSystemPrompt !== undefined
      ? typeof customSystemPrompt === 'string'
        ? [customSystemPrompt]
        : customSystemPrompt
      : defaultSystemPrompt),
    ...(appendSystemPrompt ? [appendSystemPrompt] : []),
  ])

  // Strip in-progress assistant message (stop_reason === null) — same guard
  // as btw.tsx. The SDK can fire side_question mid-turn.
  const last = messages.at(-1)
  const forkContextMessages =
    last?.type === 'assistant' && last.message.stop_reason === null
      ? messages.slice(0, -1)
      : messages

  const toolUseContext = {
    options: {
      commands,
      debug: false,
      mainLoopModel,
      tools,
      verbose: false,
      thinkingConfig:
        thinkingConfig ??
        (shouldEnableThinkingByDefault() !== false
          ? { type: 'adaptive' }
          : { type: 'disabled' }),
      mcpClients,
      mcpResources: {},
      isNonInteractiveSession: true,
      agentDefinitions: { activeAgents: agents, allAgents: [] },
      customSystemPrompt,
      appendSystemPrompt,
      excludeDynamicSections,
      planModeInstructions,
    },
    abortController: createAbortController(),
    readFileState,
    getAppState,
    setAppState,
    setReplContext: makeSetReplContext(setAppState),
    messages: forkContextMessages,
    turnStartIndex: 0,
    setInProgressToolUseIDs: () => {},
    addResponseLength: () => {},
    resetResponseLength: () => {},
    getFileHistoryState: () => undefined,
    applyFileHistoryOp: () => {},
    applyAttributionOp: () => {},
    // Compatibility with the older response-length shape.
    setResponseLength: () => {},
  } as unknown as ToolUseContext

  return {
    systemPrompt,
    userContext,
    systemContext,
    toolUseContext,
    forkContextMessages,
  }
}
