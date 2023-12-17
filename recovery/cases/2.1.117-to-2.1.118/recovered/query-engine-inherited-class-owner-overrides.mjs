const CASE_NAME = '2.1.117-to-2.1.118'

export const TARGET118_QUERY_ENGINE_INHERITED_CLASS_EVIDENCE_IDS =
  Object.freeze([
    'target118-query-engine-inherited-class-authenticated-units',
    'target118-query-engine-inherited-class-token-subsequence',
    'target118-query-engine-inherited-class-source-boundary',
  ])

export const TARGET118_QUERY_ENGINE_INHERITED_CLASS_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20802`,
      targetIndex: 20802,
      paths: Object.freeze(['src/QueryEngine.ts']),
      declarations: Object.freeze(['QueryEngine']),
      evidenceIds: TARGET118_QUERY_ENGINE_INHERITED_CLASS_EVIDENCE_IDS,
      behavior:
        'The complete authenticated Target117 QueryEngine class canonical token stream is an exact subsequence of the complete Target118 class. Every one of the sixteen strict Target118 residues maps deterministically to an exact raw-equal Target117 predecessor token inside an identical seventeen-token canonical neighborhood. The exact historical Target118 QueryEngine source and packaged source pin the sole class declaration boundary. These rows are inherited whole-class occurrences, not new Target118 behavior, and the proof authorizes no source replay.',
    }),
  ])
