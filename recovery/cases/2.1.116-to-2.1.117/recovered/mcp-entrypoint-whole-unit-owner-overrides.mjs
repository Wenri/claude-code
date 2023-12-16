const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_MCP_ENTRYPOINT_WHOLE_UNIT_EVIDENCE_IDS = Object.freeze([
  'target117-mcp-entrypoint-authenticated-paired-whole-unit',
  'target117-mcp-entrypoint-build-metadata-component-proof',
  'target117-mcp-entrypoint-retained-tool-context-contract-proof',
  'target117-mcp-entrypoint-source-snapshot-blocker',
])

export const TARGET117_MCP_ENTRYPOINT_WHOLE_UNIT_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20680`,
      targetIndex: 20680,
      paths: Object.freeze(['src/entrypoints/mcp.ts']),
      declarations: Object.freeze(['startMCPServer']),
      evidenceIds: TARGET117_MCP_ENTRYPOINT_WHOLE_UNIT_EVIDENCE_IDS,
      behavior:
        'The authenticated Target116 and Target117 MCP entrypoint units are identical after release build metadata and minifier bindings are normalized. Target117 therefore retains the taskRegistry and agentLifecycle ToolUseContext contracts while embedding the exact Target117 VERSION, BUILD_TIME, and GIT_SHA values. The available Target117 source owns startMCPServer and its MACRO.VERSION use but is an older ToolUseContext snapshot, so this is a static paired whole-unit proof and never a source replay.',
    }),
  ])
