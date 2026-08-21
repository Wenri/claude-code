const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_SDK_CONTROL_INHERITED_SCHEMA_EVIDENCE_IDS =
  Object.freeze([
    'target119-sdk-control-inherited-schema-authenticated-unit',
    'target119-sdk-control-inherited-schema-predecessor-replay-proof',
    'target119-sdk-control-forward-subagent-runtime-graph-proof',
    'target119-sdk-control-source-replay-blocker',
    'target119-sdk-control-inherited-schema-complete-unit-test',
  ])

export const TARGET119_SDK_CONTROL_INHERITED_SCHEMA_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20928`,
      targetIndex: 20928,
      paths: Object.freeze(['src/entrypoints/sdk/controlSchemas.ts']),
      declarations: Object.freeze([
        'SDKControlInitializeRequestSchema',
        'SDKControlMcpCallRequestSchema',
        'SDKControlMcpCallResponseSchema',
        'SDKControlRequestUserDialogRequestSchema',
        'SDKControlRequestUserDialogResponseSchema',
        'SDKControlMessageRatedRequestSchema',
        'SDKControlMessageRatedResponseSchema',
        'SDKControlRequestInnerSchema',
      ]),
      evidenceIds: TARGET119_SDK_CONTROL_INHERITED_SCHEMA_EVIDENCE_IDS,
      behavior:
        'The complete authenticated Target119 SDK control-schema initializer differs from its complete Target118 predecessor in exactly four normalized-token hunks: the forwardSubagentText initialize field and the Target119 get_binary_version request/response declarations and union wiring. The six apparent added arguments, _meta, payload, cancelled, messageUuid, and tool_use rows do not occur in that diff and are authenticated by the exact Target118 MCP-call, user-dialog, and message-rating replay declarations. forwardSubagentText is the Target119 schema endpoint of a 16-occurrence runtime graph spanning eight complete generated units, not an incidental property. Historical Target119 source lacks that graph and the six inherited replay declarations, so a controlSchemas-only replay would expose an unimplemented option and is forbidden; this is a complete static runtime/predecessor proof only.',
    }),
  ])
