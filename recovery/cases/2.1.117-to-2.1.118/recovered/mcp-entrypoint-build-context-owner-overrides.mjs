const CASE_NAME = '2.1.117-to-2.1.118'

export const TARGET118_MCP_ENTRYPOINT_BUILD_CONTEXT_EVIDENCE_IDS =
  Object.freeze([
    'target118-mcp-entrypoint-build-context-authenticated-units',
    'target118-mcp-entrypoint-build-context-macro-normalization',
    'target118-mcp-entrypoint-build-context-source-transition',
  ])

export const TARGET118_MCP_ENTRYPOINT_BUILD_CONTEXT_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20870`,
      targetIndex: 20870,
      paths: Object.freeze(['src/entrypoints/mcp.ts']),
      declarations: Object.freeze(['startMCPServer']),
      evidenceIds: TARGET118_MCP_ENTRYPOINT_BUILD_CONTEXT_EVIDENCE_IDS,
      behavior:
        'The complete authenticated Target117 and Target118 MCP entrypoint units have identical 679-token canonical streams after normalizing only the exact VERSION, BUILD_TIME, and GIT_SHA macro values. The remaining four strict arguments, numeric-one, taskRegistry, and agentLifecycle rows are raw-equal same-index predecessor tokens in identical seventeen-token neighborhoods. The exact historical source transition adds only the already-authenticated setReplContext no-op to startMCPServer, and the packaged declaration is the exact Target118 postimage. This is a whole-unit static/source proof and authorizes no replay.',
    }),
  ])
