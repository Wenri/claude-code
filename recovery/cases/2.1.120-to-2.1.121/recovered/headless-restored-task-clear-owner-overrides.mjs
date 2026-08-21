const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_HEADLESS_RESTORED_TASK_CLEAR_EVIDENCE_IDS =
  Object.freeze([
    'target121-headless-authenticated-whole-runner',
    'target121-headless-restored-task-recovery-block',
    'target121-headless-internal-metadata-clear-consumer',
    'target121-headless-source-architecture-blocker',
  ])

export const TARGET121_HEADLESS_RESTORED_TASK_CLEAR_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:21958`,
      targetIndex: 21958,
      paths: Object.freeze(['src/cli/print.ts']),
      declarations: Object.freeze(['runHeadless']),
      evidenceIds: TARGET121_HEADLESS_RESTORED_TASK_CLEAR_EVIDENCE_IDS,
      behavior:
        'The authenticated Target121 runHeadless function is exactly its adjacent unmatched Target120 predecessor after removing one contiguous restart-recovery block. That block reads restoredWorkerState.internal.running_background_tasks, emits the orphaned-task reminder, and clears the restored list through sessionState.notifyInternalMetadataChanged. Target121 print.ts independently authenticates the same recovery block and empty-array payload through notifySessionInternalMetadataChanged, while the u21128 proof pins the compiled per-instance consumer and proves recovered sessionState.ts/StructuredIO retain the process-global architecture. This is a static complete-function owner proof; no isolated per-instance source replay is admitted.',
    }),
  ])
