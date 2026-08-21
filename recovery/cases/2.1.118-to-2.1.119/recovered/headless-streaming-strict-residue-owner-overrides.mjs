const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_HEADLESS_STREAMING_STRICT_RESIDUE_EVIDENCE_IDS =
  Object.freeze([
    'target119-headless-streaming-complete-unit-predecessor-diff-proof',
    'target119-headless-streaming-production-strict-partition-proof',
    'target119-headless-streaming-build-version-macro-source-proof',
    'target119-headless-streaming-inherited-control-contract-proof',
    'target119-headless-streaming-caller-schema-source-graph-proof',
    'target119-headless-streaming-static-no-replay-proof',
  ])

export const TARGET119_HEADLESS_STREAMING_STRICT_RESIDUE_DEPENDENCY_TARGET_INDICES =
  Object.freeze([20928, 21741])

export const TARGET119_HEADLESS_STREAMING_STRICT_RESIDUE_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:21742`,
      targetIndex: 21742,
      paths: Object.freeze(['src/cli/print.ts']),
      declarations: Object.freeze(['runHeadlessStreaming']),
      dependencyTargetIndices:
        TARGET119_HEADLESS_STREAMING_STRICT_RESIDUE_DEPENDENCY_TARGET_INDICES,
      evidenceIds: TARGET119_HEADLESS_STREAMING_STRICT_RESIDUE_EVIDENCE_IDS,
      behavior:
        "Target119 u21742 is the complete runHeadlessStreaming successor of Target118 u20836. Its frozen fifteen-row production-strict partition splits into seven rows inside the exact thirteen-hunk complete-unit canonical diff—the new pluginSource exclusion and two macro-expanded VERSION/BUILD_TIME/GIT_SHA triplets—and eight retained callback, synthetic-response, and message-rating rows, each with one unique raw-equal predecessor inside an identical 121-token canonical neighborhood. Exact Target119 cli/print.ts and its fresh package contain the get_binary_version branch and unchanged OAuth callback branch; u21741 is the authenticated runHeadless caller, while u20928 supplies the SDK control-schema endpoint. The plugin-source exclusion is absent from exact Target119 source and only corroborated by the current later source reconstruction, while the synthetic-response and message-rating generated contracts are inherited from the compiled predecessor and are not jointly present in any exact source state. The large function retains twenty unknown free identifiers and dynamic bridge imports, so this is static complete-unit, predecessor, caller, schema, and source-graph owner evidence only; no source replay is authorized.",
    }),
  ])
