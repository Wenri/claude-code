/**
 * User-Agent string helpers.
 *
 * Kept dependency-free so SDK-bundled code (bridge, cli/transports) can
 * import without pulling in auth.ts and its transitive dependency tree.
 */

export function getClaudeCodeUserAgent(): string {
  return `claude-code/${MACRO.VERSION}`
}

export function getClaudeCodeAgentUserAgent(agent: string): string {
  return `${getClaudeCodeUserAgent()}/${agent}`
}

export function initializeAiAgentEnvironment(): void {
  if (
    !process.env.AI_AGENT ||
    process.env.AI_AGENT.startsWith('claude-code/')
  ) {
    process.env.AI_AGENT = getClaudeCodeAgentUserAgent('harness')
  }
}
