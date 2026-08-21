const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_SESSION_STATE_INTERNAL_METADATA_EVIDENCE_IDS =
  Object.freeze([
    'target121-session-state-manager-authenticated-whole-class',
    'target121-session-state-internal-metadata-callback-delta',
    'target121-session-state-internal-metadata-consumer-graph',
    'target121-session-state-manager-source-architecture-gap',
  ])

export const TARGET121_SESSION_STATE_INTERNAL_METADATA_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:21128`,
      targetIndex: 21128,
      paths: Object.freeze(['src/utils/sessionState.ts']),
      declarations: Object.freeze(['SessionStateManager']),
      evidenceIds: TARGET121_SESSION_STATE_INTERNAL_METADATA_EVIDENCE_IDS,
      behavior:
        'The authenticated Target121 SessionStateManager class is its complete Target120 predecessor plus one onInternalMetadataChanged callback field and one notifyInternalMetadataChanged forwarding method. Exact compiled consumers publish background-task and session-rule changes, wire the callback to CCR internal metadata, and clear restored background tasks after restart. Target121 sessionState.ts independently authenticates the internal metadata types and listener semantics, but recovered sessionState.ts and StructuredIO retain the superseded process-global/two-argument architecture and omit SessionStateManager entirely. This is a static complete-class owner proof; no isolated source replay is admitted.',
    }),
  ])
