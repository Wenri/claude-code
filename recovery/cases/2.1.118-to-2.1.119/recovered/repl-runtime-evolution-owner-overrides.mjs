const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_REPL_RUNTIME_EVOLUTION_EVIDENCE_IDS = Object.freeze([
  'target119-repl-runtime-authenticated-complete-transition',
  'target119-repl-runtime-scroll-reason-source-replay',
  'target119-repl-runtime-pro-trial-source-replay',
  'target119-pro-trial-command-enable-transition',
  'target119-repl-runtime-source-ast-test',
  'target119-repl-runtime-adjacency-rejection',
  'target119-repl-runtime-complete-unit-test',
])

export const TARGET119_REPL_RUNTIME_EVOLUTION_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:18089`,
      targetIndex: 18089,
      paths: Object.freeze(['src/commands/pro-trial-expired/index.ts']),
      declarations: Object.freeze(['proTrialExpired']),
      evidenceIds: TARGET119_REPL_RUNTIME_EVOLUTION_EVIDENCE_IDS,
      behavior:
        'The complete Target119 pro-trial-expired command descriptor differs from its exact Target118 predecessor only by isEnabled returning true. Its name, description, hidden flag, and lazy loader are otherwise identifier-normalized byte-identical. The raw and packaged command source still return false, and the provisional commands/upgrade owner is false, so the same atomic replay that restores the REPL auto-open caller also enables this exact command declaration.',
    }),
    Object.freeze({
      key: `${CASE_NAME}:21167`,
      targetIndex: 21167,
      paths: Object.freeze(['src/screens/REPL.tsx']),
      declarations: Object.freeze(['REPL']),
      evidenceIds: TARGET119_REPL_RUNTIME_EVOLUTION_EVIDENCE_IDS,
      behavior:
        'The complete authenticated Target119 REPL evolves the already-proved Target118 REPL through one exact thirty-eight-hunk identifier-normalized transition. Eleven new compiled literals form two closed runtime clusters: scroll re-pin diagnostic reasons across the callback and its six callers, and a guarded one-shot /pro-trial-expired command dispatch; the two useLayoutEffect rows are retained REPL properties shifted only by global occurrence order. An atomic two-file replay restores only these Target119 additions plus the exact false-to-true command enablement, while leaving the inherited cursor-ref optimization absent from both historical source states untouched. The exact helper, command registry, ScrollBox, config, debug, and message-predicate dependencies close the source graph, and immediate adjacent units have no added or strict residues.',
    }),
  ])
