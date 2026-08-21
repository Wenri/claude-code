const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_MCP_CLIENT_MIXED_EVIDENCE_IDS = Object.freeze([
  'target117-mcp-client-authenticated-mixed-unit-test',
  'target117-mcp-client-build-metadata-object-test',
  'target117-mcp-client-ensure-connected-companion-test',
  'target117-mcp-client-source-declaration-test',
])

export const TARGET117_MCP_CLIENT_MIXED_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:14619`,
    targetIndex: 14619,
    paths: Object.freeze(['src/services/mcp/client.ts']),
    declarations: Object.freeze(['ensureConnectedClient']),
    evidenceIds: TARGET117_MCP_CLIENT_MIXED_EVIDENCE_IDS,
    behavior:
      'The complete authenticated Target117 MCP client initializer owns three exact build-metadata literals and the ensureConnectedClient export registration. The export value resolves to an exact matched companion function whose SDK bypass, reconnect, connected-state check, telemetry-safe error, and return flow are independently present in the exact ff0339 ensureConnectedClient declaration.',
  }),
])
