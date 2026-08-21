const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_JOB_STATE_NAME_SYNC_MODULE_IMPORT_EVIDENCE_IDS =
  Object.freeze([
    'target119-job-state-name-sync-module-initializer-whole-unit-proof',
    'target119-job-state-name-sync-watch-consumer-boundary-proof',
    'target119-job-state-name-sync-exact-authored-source-proof',
    'target119-job-state-name-sync-false-install-messages-owner-proof',
    'target119-job-state-name-sync-baseline-stub-lineage-proof',
    'target119-job-state-name-sync-static-owner-only-proof',
  ])

export const TARGET119_JOB_STATE_NAME_SYNC_MODULE_IMPORT_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20882`,
      targetIndex: 20882,
      paths: Object.freeze(['src/hooks/useJobStateNameSync.ts']),
      declarations: Object.freeze(['useJobStateNameSync']),
      evidenceIds: TARGET119_JOB_STATE_NAME_SYNC_MODULE_IMPORT_EVIDENCE_IDS,
      behavior:
        'The complete authenticated u20882 module initializer assigns the fs module to n24, and the adjacent u20880 useJobStateNameSync runtime consumes that binding only as watch while the paired React binding supplies both useEffect calls. Exact Target119 src/hooks/useJobStateNameSync.ts imports watch and FSWatcher from fs and contains the matching watch/state.json synchronization contract. Target118 retained an alpha-equivalent initializer beside an inert two-effect stub, while the authored file first appears in Target119. The generated src/hooks/notifs/useInstallMessages.tsx owner has no fs import or watch call. This evidence corrects the whole unit statically and never authorizes source replay.',
    }),
  ])
