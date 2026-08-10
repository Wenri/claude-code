import {
  doesEnterpriseMcpConfigExist,
  filterMcpServersByPolicy,
} from './config.js'
import type { ScopedMcpServerConfig } from './types.js'
import {
  agentMcpSpecsToScopedConfigs,
  type AgentDefinition,
} from '../../tools/AgentTool/loadAgentsDir.js'

export function mergeMainAgentMcpServers(
  explicitDynamicConfigs: Record<string, ScopedMcpServerConfig>,
  agent: AgentDefinition | undefined,
  options?: {
    strictMcpConfig?: boolean
    onBlocked?: (names: string[]) => void
  },
): Record<string, ScopedMcpServerConfig> {
  if (!agent || options?.strictMcpConfig || doesEnterpriseMcpConfigExist()) {
    return explicitDynamicConfigs
  }
  const agentConfigs = agentMcpSpecsToScopedConfigs(agent)
  if (Object.keys(agentConfigs).length === 0) return explicitDynamicConfigs
  const { allowed, blocked } = filterMcpServersByPolicy(agentConfigs)
  if (blocked.length > 0) options?.onBlocked?.(blocked)
  return { ...allowed, ...explicitDynamicConfigs }
}
