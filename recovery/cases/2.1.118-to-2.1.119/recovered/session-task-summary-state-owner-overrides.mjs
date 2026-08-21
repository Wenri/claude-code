const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_SESSION_TASK_SUMMARY_STATE_EVIDENCE_IDS = Object.freeze([
  'target119-session-task-summary-state-authenticated-paired-class',
  'target119-session-task-summary-state-historical-source-delta',
  'target119-session-task-summary-state-source-ast-proof',
  'target119-session-task-summary-state-adjacency-rejection',
  'target119-session-task-summary-state-complete-unit-test',
])

export const TARGET119_SESSION_TASK_SUMMARY_STATE_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20936`,
      targetIndex: 20936,
      paths: Object.freeze(['src/utils/sessionState.ts']),
      declarations: Object.freeze([
        'hasTaskSummary',
        'notifySessionStateChanged',
        'notifySessionMetadataChanged',
      ]),
      evidenceIds: TARGET119_SESSION_TASK_SUMMARY_STATE_EVIDENCE_IDS,
      behavior:
        'The complete authenticated Target119 session-state class differs from its complete Target118 predecessor by the task-summary state machine: a false-initialized hasTaskSummary flag, guarded idle clearing routed through notifySessionMetadataChanged, and metadata-driven task_summary SDK events. The exact Target118-to-Target119 sessionState.ts source transition contains the same closed declaration/function graph, while raw and supplemented Target119 source already equal that authenticated postimage, so no replay is authorized. The provisional PermissionPromptToolResultSchema owner is false. Adjacent u20935 is an unrelated matched regex initializer and u20937 is an initializer-only dependency loader with no task-summary behavior or strict rows, so u20936 remains one standalone complete-unit proof.',
    }),
  ])
