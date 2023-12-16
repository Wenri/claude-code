const CASE_NAME = '2.1.117-to-2.1.118'

export const TARGET118_LOAD_INITIAL_MESSAGES_INHERITED_EVIDENCE_IDS =
  Object.freeze([
    'target118-load-initial-messages-authenticated-units',
    'target118-load-initial-messages-deletion-subsequence',
    'target118-load-initial-messages-source-boundary',
  ])

export const TARGET118_LOAD_INITIAL_MESSAGES_INHERITED_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20848`,
      targetIndex: 20848,
      paths: Object.freeze(['src/cli/print.ts']),
      declarations: Object.freeze(['loadInitialMessages']),
      evidenceIds: TARGET118_LOAD_INITIAL_MESSAGES_INHERITED_EVIDENCE_IDS,
      behavior:
        'The complete authenticated Target118 loadInitialMessages canonical token stream is an exact subsequence of Target117, deleting only the seven-token post_turn_summary callback call. Each of the four strict dirname, modified, accessToken, and dirname tokens maps to an exact raw-equal Target117 predecessor inside an identical seventeen-token canonical neighborhood. The Target117 and Target118 historical source declarations are byte-identical, and the packaged declaration remains exact after unrelated case supplements. These are inherited whole-function rows, not new Target118 behavior, and the proof authorizes no replay.',
    }),
  ])
