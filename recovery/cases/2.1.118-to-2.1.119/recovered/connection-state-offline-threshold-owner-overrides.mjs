const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_CONNECTION_STATE_OFFLINE_THRESHOLD_EVIDENCE_IDS =
  Object.freeze([
    'target119-connection-state-offline-constants-whole-unit-proof',
    'target119-connection-state-offline-class-consumer-boundary-proof',
    'target119-connection-state-exact-authored-source-proof',
    'target119-connection-state-false-session-background-hint-owner-proof',
    'target119-connection-state-cross-release-lineage-proof',
    'target119-connection-state-static-owner-only-proof',
  ])

export const TARGET119_CONNECTION_STATE_OFFLINE_THRESHOLD_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20809`,
      targetIndex: 20809,
      paths: Object.freeze(['src/services/api/connectionState.ts']),
      declarations: Object.freeze([
        'OFFLINE_FAILURE_WINDOW_MS',
        'OFFLINE_FAILURE_THRESHOLD',
        'ConnectionLifecycleTracker',
      ]),
      evidenceIds: TARGET119_CONNECTION_STATE_OFFLINE_THRESHOLD_EVIDENCE_IDS,
      behavior:
        'The complete authenticated u20809 declaration defines the 60000 millisecond failure window and threshold 2 consumed by the adjacent ConnectionLifecycleTracker class. The new exact Target119 src/services/api/connectionState.ts source names those two constants as OFFLINE_FAILURE_WINDOW_MS and OFFLINE_FAILURE_THRESHOLD and uses them only in the failure-window filter and offline threshold comparison; the identical source blob and matched constant unit persist through Target121. The generated src/components/SessionBackgroundHint.tsx owner cannot own this API lifecycle unit. This evidence corrects the whole unit statically and never authorizes source replay.',
    }),
  ])
