import type { Tool, ToolUseContext } from '../../Tool.js'
import type { Message } from '../../types/message.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../analytics/growthbook.js'
import { isPolicyEnforced } from '../policyLimits/index.js'
import { normalizeNameForMCP } from '../mcp/normalization.js'

export type ToolIsolationClass = 'web' | 'connectors'

const ISOLATION_POLICY = 'enforce_web_search_mcp_isolation'
const ISOLATION_GATE = 'tengu_doorbell_agave'
const EXCLUDED_CONNECTOR_SERVERS = new Set([
  'cowork',
  'workspace',
  'session-info',
  'mcp-registry',
  'plugins',
  'scheduled-tasks',
  'dispatch',
  'ide',
])

export type ToolIsolationResult = {
  denyMessage: string | null
  classifiedAs: ToolIsolationClass | null
  activeLatch: ToolIsolationClass | null
}

const NO_ISOLATION: ToolIsolationResult = {
  denyMessage: null,
  classifiedAs: null,
  activeLatch: null,
}

export function createToolIsolationLatch(
  current: ToolIsolationClass | null = null,
): { current: ToolIsolationClass | null } {
  return { current }
}

function isToolIsolationEnabled(): boolean {
  return (
    getFeatureValue_CACHED_MAY_BE_STALE(ISOLATION_GATE, false) &&
    isPolicyEnforced(ISOLATION_POLICY)
  )
}

function classifyToolName(
  toolName: string,
  mcpServerName?: string,
): ToolIsolationClass | null {
  if (toolName === 'WebSearch' || toolName === 'WebFetch') return 'web'
  if (toolName === 'McpSearch' || toolName === 'McpFetch') return 'connectors'
  if (
    mcpServerName &&
    !EXCLUDED_CONNECTOR_SERVERS.has(normalizeNameForMCP(mcpServerName))
  ) {
    return 'connectors'
  }
  return null
}

export function classifyToolIsolation(
  tool: Pick<Tool, 'name' | 'mcpInfo'>,
): ToolIsolationClass | null {
  return classifyToolName(tool.name, tool.mcpInfo?.serverName)
}

export function getIsolationClassFromMessages(
  messages: readonly Message[],
  tools: readonly Tool[],
): ToolIsolationClass | null {
  if (!getFeatureValue_CACHED_MAY_BE_STALE(ISOLATION_GATE, false)) return null
  const toolsByName = new Map(tools.map(tool => [tool.name, tool]))
  for (const message of messages) {
    if (message.type !== 'assistant') continue
    const content = message.message.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (block.type !== 'tool_use') continue
      const tool = toolsByName.get(block.name)
      const classification = tool
        ? classifyToolIsolation(tool)
        : classifyToolName(
            block.name,
            block.name.startsWith('mcp__')
              ? block.name.split('__')[1]
              : undefined,
          )
      if (classification !== null) return classification
    }
  }
  return null
}

function isolationDenial(active: ToolIsolationClass): string {
  return active === 'web'
    ? "Connectors are unavailable in this session under your organization's web search / connector isolation policy. Start a new session to use connectors."
    : "Web search is unavailable in this session under your organization's web search / connector isolation policy. Start a new session to use web search."
}

export function checkToolIsolation(
  tool: Tool,
  context: Pick<ToolUseContext, 'isolationLatch'>,
): ToolIsolationResult {
  const latch = context.isolationLatch
  if (!latch || !isToolIsolationEnabled()) return NO_ISOLATION
  const classifiedAs = classifyToolIsolation(tool)
  if (!classifiedAs) return NO_ISOLATION
  const activeLatch = latch.current
  if (activeLatch && activeLatch !== classifiedAs) {
    return {
      denyMessage: isolationDenial(activeLatch),
      classifiedAs,
      activeLatch,
    }
  }
  if (!activeLatch) latch.current = classifiedAs
  return {
    denyMessage: null,
    classifiedAs,
    activeLatch: classifiedAs,
  }
}
