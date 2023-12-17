const CASE_NAME = '2.1.117-to-2.1.118'

export const TARGET118_AWAY_SUMMARY_RUNTIME_EVIDENCE_IDS = Object.freeze([
  'target118-away-summary-runtime-authenticated-target-fragment',
  'target118-away-summary-runtime-result-contract-test',
  'target118-away-summary-runtime-owner-lineage-test',
  'target118-away-summary-runtime-source-replay-blocker',
])

export const TARGET118_AWAY_SUMMARY_RUNTIME_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:19968`,
    targetIndex: 19968,
    paths: Object.freeze(['src/hooks/useAwaySummary.ts']),
    declarations: Object.freeze(['useAwaySummary']),
    evidenceIds: TARGET118_AWAY_SUMMARY_RUNTIME_EVIDENCE_IDS,
    behavior:
      'The complete authenticated Target118 useAwaySummary unit is its Target117 predecessor with exactly the away-summary result contract changed from a nullable string to the discriminated {kind,text} result. The min and force residues are retained predecessor occurrences; the ok residue is the exact live result guard, and the paired text read feeds the unchanged recap formatting and insertion flow. Exact Target118 and later source snapshots authenticate src/hooks/useAwaySummary.ts as the owner, while their incompatible surrounding cache/fork graphs make this a static whole-unit proof rather than a source replay.',
  }),
])
