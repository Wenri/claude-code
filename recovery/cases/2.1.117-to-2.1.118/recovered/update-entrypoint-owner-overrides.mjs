const CASE_NAME = '2.1.117-to-2.1.118'

export const TARGET118_UPDATE_ENTRYPOINT_EVIDENCE_IDS = Object.freeze([
  'target118-update-entrypoint-authenticated-units',
  'target118-update-entrypoint-build-metadata-normalization',
  'target118-update-entrypoint-inherited-residue-contexts',
  'target118-update-entrypoint-source-transition',
])

export const TARGET118_UPDATE_ENTRYPOINT_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:20954`,
    targetIndex: 20954,
    paths: Object.freeze(['src/cli/update.ts']),
    declarations: Object.freeze(['update']),
    evidenceIds: TARGET118_UPDATE_ENTRYPOINT_EVIDENCE_IDS,
    behavior:
      'The complete authenticated Target118 update unit is the complete Target117 unit plus exactly two canonical token insertions: the DISABLE_UPDATES administrator guard and the Homebrew claude-code@latest tip. Exact historical source proves those two declaration additions and the sole supporting isEnvTruthy import. All sixty-nine release-metadata rows are the exact twenty-three VERSION, BUILD_TIME, and GIT_SHA transitions, while catch and both dot rows map to raw-equal Target117 predecessor tokens in identical seventeen-token canonical neighborhoods. This is a whole-unit static/source proof and authorizes no replay.',
  }),
])
