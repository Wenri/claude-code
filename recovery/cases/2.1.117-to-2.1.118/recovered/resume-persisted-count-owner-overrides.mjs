const CASE_NAME = '2.1.117-to-2.1.118'

export const TARGET118_RESUME_PERSISTED_COUNT_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:13759`,
    targetIndex: 13759,
    paths: Object.freeze(['src/tools/AgentTool/runAgent.ts']),
    evidenceIds: Object.freeze([
      'target118-resume-persisted-count-target-binding',
      'target118-resume-persisted-count-source-ast-test',
      'target118-resume-persisted-count-source-transition-test',
    ]),
    behavior:
      'Target118 resumeAgentBackground passes the authenticated resumed-message count into runAgent as resumePersistedCount. The exact historical runAgent declaration slices the already-persisted prefix and retains the preceding UUID as the resumed sidechain parent before recording new messages.',
  }),
])
