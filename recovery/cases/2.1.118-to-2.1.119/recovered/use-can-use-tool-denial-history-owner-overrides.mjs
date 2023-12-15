const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_USE_CAN_USE_TOOL_DENIAL_HISTORY_EVIDENCE_IDS =
  Object.freeze([
    'target119-use-can-use-tool-denial-history-authenticated-whole-unit-proof',
    'target119-use-can-use-tool-denial-history-historical-source-delta-proof',
    'target119-use-can-use-tool-denial-history-semantic-contract-test',
    'target119-use-can-use-tool-denial-history-source-topology-replay-blocker',
  ])

export const TARGET119_USE_CAN_USE_TOOL_DENIAL_HISTORY_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20652`,
      targetIndex: 20652,
      paths: Object.freeze(['src/hooks/useCanUseTool.tsx']),
      declarations: Object.freeze(['useCanUseTool']),
      evidenceIds:
        TARGET119_USE_CAN_USE_TOOL_DENIAL_HISTORY_EVIDENCE_IDS,
      behavior:
        'The complete authenticated Target119 useCanUseTool unit extends its exact Target118 predecessor with denial input identity, context-backed denial lookup, inputKey recording, and one allow-only subsequent-approval telemetry/removal continuation. The two scanner-added properties are an indivisible part of that complete unit. Historical Target119 source independently authors the same behavioral contract through direct module-global get/remove functions, but the authenticated runtime instead consumes AutoModeDenialsProvider/useAutoModeDenials. Target119 source has no provider or context hook and carries an unchanged stale inline map, so the proof is static and cannot authorize source replay.',
    }),
  ])
