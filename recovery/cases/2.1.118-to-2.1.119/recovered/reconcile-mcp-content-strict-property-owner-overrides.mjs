const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_RECONCILE_MCP_CONTENT_STRICT_PROPERTY_EVIDENCE_IDS =
  Object.freeze([
    'target119-reconcile-mcp-content-complete-unit-manual-predecessor-proof',
    'target119-reconcile-mcp-content-four-row-strict-partition-proof',
    'target119-reconcile-mcp-content-matched-caller-boundary-proof',
    'target119-reconcile-mcp-content-exact-source-command-resource-graph-proof',
    'target119-reconcile-mcp-content-imported-runtime-dependency-graph-proof',
    'target119-reconcile-mcp-content-static-no-replay-proof',
  ])

export const TARGET119_RECONCILE_MCP_CONTENT_DEPENDENCY_TARGET_INDICES =
  Object.freeze([21758])

export const TARGET119_RECONCILE_MCP_CONTENT_STRICT_PROPERTY_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:21759`,
      targetIndex: 21759,
      paths: Object.freeze(['src/cli/print.ts']),
      declarations: Object.freeze(['reconcileMcpServers']),
      dependencyTargetIndices:
        TARGET119_RECONCILE_MCP_CONTENT_DEPENDENCY_TARGET_INDICES,
      evidenceIds:
        TARGET119_RECONCILE_MCP_CONTENT_STRICT_PROPERTY_EVIDENCE_IDS,
      behavior:
        'Target119 u21759 is the complete reconcileMcpServers successor of Target118 u20853, reached through matched caller u21758/u20852 handleMcpSetServers. All four production-strict rows are genuine additions inside the successor: the predecessor has no cmds or res occurrence, while Target119 first stores fetched command/resource results and then projects both into AppState.mcp. The nonzero global Target118 res count is only an occurrence-ordinal baseline and is absent from u20853. Exact historical, raw, and fresh-package Target119 src/cli/print.ts carry the same complete 8,895-byte declaration, including command/resource fetch, local/remote pMap batching, policy-rule reconciliation, command deduplication, and resource replacement; the exact Target118 declaration lacks that graph. The declaration reaches imported MCP clients, cache, transport, permission, collection, and state-update dependencies, so this is static complete-unit, predecessor, caller, and exact-source owner evidence only; no source replay is authorized.',
    }),
  ])
