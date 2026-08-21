const CASE_NAME = '2.1.117-to-2.1.118'

export const TARGET118_REPL_RUNTIME_EVIDENCE_IDS = Object.freeze([
  'target118-repl-runtime-authenticated-whole-unit',
  'target118-repl-runtime-complete-transition',
  'target118-repl-runtime-source-boundary',
  'target118-repl-runtime-source-replay-blocker',
])

export const TARGET118_REPL_RUNTIME_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:20268`,
    targetIndex: 20268,
    paths: Object.freeze(['src/screens/REPL.tsx']),
    declarations: Object.freeze(['REPL']),
    evidenceIds: TARGET118_REPL_RUNTIME_EVIDENCE_IDS,
    behavior:
      'The complete authenticated Target118 REPL unit evolves the already-proved Target117 REPL through one exact twenty-hunk normalized transition. Its retained debounce cancel, background-ID reducer, session dirname, transcript focus/capture, preventDefault, handler, and tabIndex rows remain inside the same complete unit, while the new ccr-api/local-jsonl transcript-source effect is the only strict-value family added within the unit. Exact historical REPL declarations authenticate the owner, but no recovered source generation contains this complete runtime tuple, so the lane is admitted statically without a partial replay.',
  }),
])
