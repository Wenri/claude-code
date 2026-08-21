const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_REPL_WHOLE_UNIT_EVIDENCE_IDS = Object.freeze([
  'target117-repl-authenticated-whole-unit',
  'target117-repl-retained-result-dedup-equivalence',
  'target117-repl-temporally-mixed-source-blocker',
])

export const TARGET117_REPL_WHOLE_UNIT_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:20069`,
    targetIndex: 20069,
    paths: Object.freeze(['src/screens/REPL.tsx']),
    declarations: Object.freeze(['REPL']),
    evidenceIds: TARGET117_REPL_WHOLE_UNIT_EVIDENCE_IDS,
    behavior:
      'Authenticated Target117 REPL selects the active SSH, direct, or CCR transport, preserves CCR viewer/session metadata, synchronizes the active remote transport into application state, propagates client-platform metadata into queued prompts and tool-use context, and retains both result-dedup consumers exactly from Target116. The recovered Target117 source is an older REPL snapshot and later source witnesses mix Target118/119 evolution, so this is a static whole-unit owner proof and never a source replay.',
  }),
])
