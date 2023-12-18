const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_REMOTE_IO_INTERNAL_METADATA_EVIDENCE_IDS =
  Object.freeze([
    'target121-remote-io-authenticated-whole-initializer',
    'target121-remote-io-exact-internal-metadata-callback-delta',
    'target121-remote-io-source-owner-lineage',
    'target121-remote-io-source-architecture-blocker',
  ])

export const TARGET121_REMOTE_IO_INTERNAL_METADATA_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:21913`,
      targetIndex: 21913,
      paths: Object.freeze(['src/cli/remoteIO.ts']),
      declarations: Object.freeze(['RemoteIO', 'constructor']),
      evidenceIds: TARGET121_REMOTE_IO_INTERNAL_METADATA_EVIDENCE_IDS,
      behavior:
        'The authenticated Target121 RemoteIO module initializer is exactly its adjacent unmatched Target120 predecessor after removing one onInternalMetadataChanged assignment from the constructor CCR callback sequence. Target121 remoteIO.ts independently adds the equivalent setSessionInternalMetadataChangedListener-to-ccrClient.reportInternalMetadata edge and otherwise reconstructs byte-for-byte to Target120 source. The bundle uses a four-parameter RemoteIO constructor, a three-argument StructuredIO super call, and per-instance sessionState callbacks, while recovered source retains a three-parameter/two-argument process-global listener graph and omits another compiled class member. The authenticated u21128 SessionStateManager proof pins the same callback and the missing per-instance dependency. This is a static complete-initializer owner proof; no partial source replay is admitted.',
    }),
  ])
