const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_MCP_ENTRYPOINT_TASK_REGISTRY_EVIDENCE_IDS =
  Object.freeze([
    'target119-mcp-entrypoint-target118-lineage-proof',
    'target119-mcp-entrypoint-complete-unit-macro-normalization-proof',
    'target119-mcp-entrypoint-task-registry-retained-occurrence-proof',
    'target119-mcp-entrypoint-build-macro-partition-proof',
    'target119-mcp-entrypoint-export-wrapper-boundary-proof',
    'target119-mcp-entrypoint-byte-identical-source-state-proof',
    'target119-mcp-entrypoint-static-no-replay-proof',
  ])

export const TARGET119_MCP_ENTRYPOINT_TASK_REGISTRY_DEPENDENCY_TARGET_INDICES =
  Object.freeze([21774, 21775])

export const TARGET119_MCP_ENTRYPOINT_TASK_REGISTRY_STRICT_PROPERTY_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:21776`,
      targetIndex: 21776,
      paths: Object.freeze(['src/entrypoints/mcp.ts']),
      declarations: Object.freeze(['startMCPServer']),
      dependencyTargetIndices:
        TARGET119_MCP_ENTRYPOINT_TASK_REGISTRY_DEPENDENCY_TARGET_INDICES,
      evidenceIds: TARGET119_MCP_ENTRYPOINT_TASK_REGISTRY_EVIDENCE_IDS,
      behavior:
        'Target119 u21776 is the complete generated createMCPServer successor of authenticated Target118 u20870. Both units have 679 tokens and become byte-for-byte identical canonical streams after separately normalizing only VERSION, BUILD_TIME, and GIT_SHA. The three corresponding strict string rows are therefore inlined Target119 build identity, not source additions. The remaining strict taskRegistry property is retained at canonical token index 385 in both units with the same 17-token neighborhood and alpha-identical property AST; its report ordinal changes from Target118 global occurrence 85 to Target119 occurrence 86 only because of bundle-global drift. Matched u21774/u20868 exports createMCPServer beside startMCPServer, and matched u21775/u20869 is the wrapper that invokes it. Exact historical, raw, and fresh-package src/entrypoints/mcp.ts are byte-identical across Target118 and Target119 and contain one MACRO.VERSION access in startMCPServer, while omitting the generated task-context fields carried by both compiled units. This is static complete-unit, predecessor, build-macro, export, wrapper, and source-state evidence only; no source replay is authorized.',
    }),
  ])
