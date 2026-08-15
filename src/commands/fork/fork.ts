import type { LocalJSXCommandContext } from '../../commands.js'
import { getSystemPrompt } from '../../constants/prompts.js'
import { FORK_GLYPH } from '../../constants/figures.js'
import {
  registerAsyncAgent,
} from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import type { ToolUseContext } from '../../Tool.js'
import { asAgentId } from '../../types/ids.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import { runWithAgentContext } from '../../utils/agentContext.js'
import { extractReplReplayEntries } from '../../tools/REPLTool/replay.js'
import { hasPermissionsToUseTool } from '../../utils/permissions/permissions.js'
import { getQuerySourceForAgent } from '../../utils/promptCategory.js'
import { createUserMessage } from '../../utils/messages.js'
import { getAgentModel } from '../../utils/model/agent.js'
import { getParentSessionId } from '../../utils/teammate.js'
import { buildEffectiveSystemPrompt } from '../../utils/systemPrompt.js'
import { createAgentId } from '../../utils/uuid.js'
import {
  buildChildMessage,
  FORK_AGENT,
} from '../../tools/AgentTool/forkSubagent.js'
import { runAsyncAgentLifecycle } from '../../tools/AgentTool/agentToolUtils.js'
import { isBuiltInAgent } from '../../tools/AgentTool/loadAgentsDir.js'
import { runAgent } from '../../tools/AgentTool/runAgent.js'

function getForkName(directive: string): string {
  return (
    directive
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .join('-')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24) || 'fork'
  )
}

async function getRenderedSystemPrompt(
  context: ToolUseContext,
): Promise<ToolUseContext['renderedSystemPrompt']> {
  if (context.renderedSystemPrompt) return context.renderedSystemPrompt

  const appState = context.getAppState()
  const mainThreadAgentDefinition = appState.agent
    ? appState.agentDefinitions.activeAgents.find(
        agent => agent.agentType === appState.agent,
      )
    : undefined
  const additionalWorkingDirectories = Array.from(
    appState.toolPermissionContext.additionalWorkingDirectories.keys(),
  )
  const defaultSystemPrompt = await getSystemPrompt(
    context.options.tools,
    context.options.mainLoopModel,
    additionalWorkingDirectories,
  )

  return buildEffectiveSystemPrompt({
    mainThreadAgentDefinition,
    toolUseContext: context,
    customSystemPrompt: context.options.customSystemPrompt,
    defaultSystemPrompt,
    appendSystemPrompt: context.options.appendSystemPrompt,
  })
}

async function spawnFork(
  directive: string,
  context: ToolUseContext & LocalJSXCommandContext,
): Promise<{ agentId: string; name: string } | null> {
  const systemPrompt = await getRenderedSystemPrompt(context)
  if (!systemPrompt) return null

  const replHydration = {
    kind: 'fork' as const,
    log: (() => {
      const id = context.agentId ?? 'main'
      const replayLog = context.getAppState().replContexts[id]?.replayLog
      if (replayLog) return [...replayLog]
      if (context.replHydration?.kind === 'resume') {
        return extractReplReplayEntries(context.messages)
      }
      return []
    })(),
  }
  const name = getForkName(directive)
  const description =
    directive.length > 50 ? `${directive.slice(0, 49)}…` : directive
  const agentId = createAgentId(name)
  const rootSetAppState = context.setAppStateForTasks ?? context.setAppState
  const startTime = Date.now()
  const task = registerAsyncAgent({
    agentId,
    description,
    prompt: directive,
    selectedAgent: FORK_AGENT,
    setAppState: rootSetAppState,
    toolUseId: context.toolUseId,
  })

  rootSetAppState(previous => {
    const agentNameRegistry = new Map(previous.agentNameRegistry)
    agentNameRegistry.set(name, asAgentId(agentId))
    return { ...previous, agentNameRegistry }
  })

  const metadata = {
    prompt: directive,
    resolvedAgentModel: getAgentModel(
      FORK_AGENT.model,
      context.options.mainLoopModel,
      undefined,
      context.getToolPermissionContext().mode,
    ),
    isBuiltInAgent: isBuiltInAgent(FORK_AGENT),
    startTime,
    agentType: FORK_AGENT.agentType,
    isAsync: false,
  }

  void runWithAgentContext(
    {
      agentId,
      parentSessionId: getParentSessionId(),
      agentType: 'subagent',
      subagentName: FORK_AGENT.agentType,
      isBuiltIn: true,
      invocationKind: 'spawn',
      invocationEmitted: false,
    },
    () =>
      runAsyncAgentLifecycle({
        taskId: task.agentId,
        abortController: task.abortController!,
        makeStream: (onCacheSafeParams, onProgress) =>
          runAgent({
            onQueryProgress: onProgress,
            agentDefinition: FORK_AGENT,
            promptMessages: [
              createUserMessage({
                content: [
                  { type: 'text', text: buildChildMessage(directive) },
                ],
              }),
            ],
            toolUseContext: context,
            canUseTool: context.canUseTool ?? hasPermissionsToUseTool,
            isAsync: false,
            querySource: getQuerySourceForAgent(FORK_AGENT.agentType, true),
            spawnedBySkill:
              context.options.spawnedBySkill ?? context.options.activeSkill,
            model: undefined,
            override: {
              systemPrompt,
              agentId: asAgentId(task.agentId),
              abortController: task.abortController!,
              replHydration,
            },
            availableTools: context.options.tools,
            forkContextMessages: context.messages,
            useExactTools: true,
            onCacheSafeParams,
            description,
            name,
          }),
        metadata,
        description,
        toolUseContext: context,
        rootSetAppState,
        agentIdForCleanup: agentId,
        enableSummarization: false,
        getWorktreeResult: async () => ({}),
      }),
  )

  return { agentId, name }
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<null> {
  const directive = args.trim()
  if (!directive) {
    onDone('Usage: /fork \\<directive\\>', { display: 'system' })
    return null
  }

  const fork = await spawnFork(directive, context)
  if (!fork) {
    onDone('Cannot fork before the first conversation turn', {
      display: 'system',
    })
    return null
  }

  onDone(`${FORK_GLYPH} forked ${fork.name} (${fork.agentId.slice(-4)})`, {
    display: 'system',
  })
  return null
}
