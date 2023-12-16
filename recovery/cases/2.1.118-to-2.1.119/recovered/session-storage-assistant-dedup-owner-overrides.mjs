const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_SESSION_STORAGE_ASSISTANT_DEDUP_EVIDENCE_IDS =
  Object.freeze([
    'target119-session-storage-authenticated-initializer-proof',
    'target119-session-storage-retained-policy-object-proof',
    'target119-session-storage-assistant-occurrence-order-proof',
    'target119-session-storage-source-boundary-proof',
    'target119-session-storage-cross-release-policy-lineage-proof',
    'target119-session-storage-static-replay-blocker',
  ])

export const TARGET119_SESSION_STORAGE_ASSISTANT_DEDUP_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:18951`,
      targetIndex: 18951,
      paths: Object.freeze(['src/utils/sessionStorage.ts']),
      declarations: Object.freeze([
        'Project',
        'appendEntry',
        'isTranscriptMessage',
      ]),
      evidenceIds: TARGET119_SESSION_STORAGE_ASSISTANT_DEDUP_EVIDENCE_IDS,
      behavior:
        'The authenticated Target119 session-storage module initializer is alpha-canonically identical to its Target118 predecessor after replacing only VERSION, BUILD_TIME, and GIT_SHA. Its complete 25-entry append-policy object, including assistant:"dedup-transcript", is byte-identical to Target118 and retained unchanged through Target120; Target121 only adds frame-link:"always". The apparent target-added assistant property is therefore global occurrence-order drift, not new Target119 behavior. The exact Target119 Project.appendEntry source and isTranscriptMessage guard independently bind assistant messages to the UUID-deduplicated transcript path, but that source uses explicit branches rather than the bundle table, so this is a static whole-unit owner proof and never authorizes a source replay.',
    }),
  ])
