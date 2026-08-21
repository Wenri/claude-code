const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_AGENT_MCP_CONFIG_EVIDENCE_IDS = Object.freeze([
  'target117-agent-mcp-config-authenticated-whole-unit',
  'target117-agent-mcp-config-exact-source-declaration',
  'target117-agent-mcp-config-positional-owner-correction',
])

export const TARGET117_AGENT_MCP_CONFIG_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:20260`,
    targetIndex: 20260,
    paths: Object.freeze(['src/services/mcp/agentConfig.ts']),
    declarations: Object.freeze(['mergeMainAgentMcpServers']),
    evidenceIds: TARGET117_AGENT_MCP_CONFIG_EVIDENCE_IDS,
    behavior:
      'Authenticated Target117 mergeMainAgentMcpServers filters agent-scoped MCP servers through enterprise policy, reports blocked names through onBlocked, and lets explicit dynamic configs win. The exact raw/package source declaration proves this owner and rejects the positional TeleportRepoMismatchDialog assignment.',
  }),
])
