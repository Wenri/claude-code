const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_TEAM_FILE_LOCK_OPTIONS_EVIDENCE_IDS = Object.freeze([
  'target119-team-file-lock-options-target-fragment',
  'target119-team-file-lock-options-temporal-lineage',
  'target119-team-file-lock-options-stale-source-graph-blocker',
])

export const TARGET119_TEAM_FILE_LOCK_OPTIONS_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:14123`,
    targetIndex: 14123,
    paths: Object.freeze(['src/utils/swarm/teamHelpers.ts']),
    declarations: Object.freeze([
      'inputSchema',
      'TEAM_FILE_LOCK_OPTIONS',
      'updateTeamFile',
    ]),
    evidenceIds: TARGET119_TEAM_FILE_LOCK_OPTIONS_EVIDENCE_IDS,
    behavior:
      'The complete Target119 teamHelpers initializer retains the Target118 team-file retry policy and adds exactly a no-op onCompromised callback. Matched updateTeamFile and removeTeamMember units consume the same options binding, while the current authored tree is pinned as stale; this is a whole-unit temporal proof and never a partial source replay.',
  }),
])
