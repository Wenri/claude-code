import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { normalizeNameForMCP } from '../services/mcp/normalization.js'
import { isPolicyAllowed } from '../services/policyLimits/index.js'
import type { Tool } from '../Tool.js'
import { LIST_MCP_RESOURCES_TOOL_NAME } from '../tools/ListMcpResourcesTool/prompt.js'
import { WEB_FETCH_TOOL_NAME } from '../tools/WebFetchTool/prompt.js'
import { WEB_SEARCH_TOOL_NAME } from '../tools/WebSearchTool/prompt.js'

const ENFORCE_WEB_SEARCH_MCP_ISOLATION =
  'enforce_web_search_mcp_isolation'
const WEB_SEARCH_MCP_ISOLATION_FLAG = 'tengu_doorbell_agave'
const READ_MCP_RESOURCE_TOOL_NAME = 'ReadMcpResourceTool'

const ISOLATION_EXEMPT_MCP_SERVERS = new Set([
  'cowork',
  'workspace',
  'session-info',
  'mcp-registry',
  'plugins',
  'scheduled-tasks',
  'dispatch',
  'ide',
])

export type ToolIsolationClass = 'web' | 'connectors'

export type ToolIsolationLatch = {
  current: ToolIsolationClass | null
}

export type ToolIsolationResult = {
  denyMessage: string | null
  classifiedAs: ToolIsolationClass | null
  activeLatch: ToolIsolationClass | null
}

const EMPTY_ISOLATION_RESULT: ToolIsolationResult = {
  denyMessage: null,
  classifiedAs: null,
  activeLatch: null,
}

export function createToolIsolationLatch(): ToolIsolationLatch {
  return { current: null }
}

export function isToolIsolationEnabled(): boolean {
  return (
    getFeatureValue_CACHED_MAY_BE_STALE(
      WEB_SEARCH_MCP_ISOLATION_FLAG,
      false,
    ) && isPolicyAllowed(ENFORCE_WEB_SEARCH_MCP_ISOLATION)
  )
}

function getMcpServerName(tool: Tool): string | undefined {
  return (
    tool.mcpInfo?.serverName ??
    (tool.name.startsWith('mcp__') ? tool.name.split('__')[1] : undefined)
  )
}

export function classifyToolForIsolation(
  tool: Tool,
): ToolIsolationClass | null {
  if (tool.name === WEB_SEARCH_TOOL_NAME || tool.name === WEB_FETCH_TOOL_NAME) {
    return 'web'
  }
  if (
    tool.name === LIST_MCP_RESOURCES_TOOL_NAME ||
    tool.name === READ_MCP_RESOURCE_TOOL_NAME
  ) {
    return 'connectors'
  }
  const serverName = getMcpServerName(tool)
  if (
    serverName &&
    !ISOLATION_EXEMPT_MCP_SERVERS.has(normalizeNameForMCP(serverName))
  ) {
    return 'connectors'
  }
  return null
}

export function getToolIsolationDenialMessage(
  activeLatch: ToolIsolationClass,
): string {
  return activeLatch === 'web'
    ? "Connectors are unavailable in this session under your organization's web search / connector isolation policy. Start a new session to use connectors."
    : "Web search is unavailable in this session under your organization's web search / connector isolation policy. Start a new session to use web search."
}

export function evaluateToolIsolation(
  tool: Tool,
  context: { isolationLatch?: ToolIsolationLatch },
): ToolIsolationResult {
  const latch = context.isolationLatch
  if (!latch || !isToolIsolationEnabled()) return EMPTY_ISOLATION_RESULT

  const classifiedAs = classifyToolForIsolation(tool)
  if (!classifiedAs) return EMPTY_ISOLATION_RESULT

  const activeLatch = latch.current
  if (activeLatch && activeLatch !== classifiedAs) {
    return {
      denyMessage: getToolIsolationDenialMessage(activeLatch),
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
