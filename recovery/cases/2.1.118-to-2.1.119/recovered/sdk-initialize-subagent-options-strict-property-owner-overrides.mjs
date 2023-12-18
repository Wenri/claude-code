const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_SDK_INITIALIZE_SUBAGENT_OPTIONS_STRICT_PROPERTY_EVIDENCE_IDS =
  Object.freeze([
    'target119-sdk-initialize-subagent-options-complete-unit-predecessor-proof',
    'target119-sdk-initialize-subagent-options-six-row-strict-partition-proof',
    'target119-sdk-initialize-subagent-options-inherited-append-prompt-proof',
    'target119-sdk-initialize-subagent-options-forward-transfer-diff-proof',
    'target119-sdk-initialize-subagent-options-schema-streaming-graph-proof',
    'target119-sdk-initialize-subagent-options-exact-source-gap-proof',
    'target119-sdk-initialize-subagent-options-static-no-replay-proof',
  ])

export const TARGET119_SDK_INITIALIZE_SUBAGENT_OPTIONS_STRICT_PROPERTY_DEPENDENCY_TARGET_INDICES =
  Object.freeze([20928, 21742])

export const TARGET119_SDK_INITIALIZE_SUBAGENT_OPTIONS_STRICT_PROPERTY_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:21747`,
      targetIndex: 21747,
      paths: Object.freeze(['src/cli/print.ts']),
      declarations: Object.freeze(['handleInitializeRequest']),
      dependencyTargetIndices:
        TARGET119_SDK_INITIALIZE_SUBAGENT_OPTIONS_STRICT_PROPERTY_DEPENDENCY_TARGET_INDICES,
      evidenceIds:
        TARGET119_SDK_INITIALIZE_SUBAGENT_OPTIONS_STRICT_PROPERTY_EVIDENCE_IDS,
      behavior:
        'Target119 u21747 is the complete handleInitializeRequest successor of Target118 u20841. Its six-row production-strict partition contains three appendSubagentSystemPrompt occurrences that are byte-identical at the same canonical-token indices in the predecessor and three forwardSubagentText occurrences inside the sole new 17-token option-transfer statement. The only other complete-unit change is a 15-token command-alias response field. u20928 is the authenticated SDK initialize-schema endpoint and u21742 is the authenticated runHeadlessStreaming consumer; the compiled Target119 bundle carries the full 16-occurrence forwardSubagentText graph. Exact historical and fresh-package Target119 cli/print.ts omit both subagent transfers, while the later source reconstruction corroborates them but still omits the compiled alias and SDK-init telemetry contracts. The declaration also has twenty-three direct identifier-call dependencies, so this is static complete-unit, predecessor, schema, consumer, and source-gap owner evidence only; no source replay is authorized.',
    }),
  ])
