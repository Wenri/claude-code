const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_TIP_REGISTRY_DAY_WINDOW_EVIDENCE_IDS = Object.freeze([
  'target119-tip-registry-day-window-authenticated-paired-unit',
  'target119-tip-registry-day-window-historical-source-file-proof',
  'target119-tip-registry-day-window-source-ast-constant-fold-proof',
  'target119-tip-registry-day-window-occurrence-shift-proof',
  'target119-tip-registry-day-window-complete-unit-test',
])

export const TARGET119_TIP_REGISTRY_DAY_WINDOW_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20919`,
      targetIndex: 20919,
      paths: Object.freeze(['src/services/tips/tipRegistry.ts']),
      declarations: Object.freeze(['externalTips']),
      evidenceIds: TARGET119_TIP_REGISTRY_DAY_WINDOW_EVIDENCE_IDS,
      behavior:
        'The complete authenticated Target119 externalTips initialization unit has the same unique coarse structural hash, token count, byte length, property-preserving identifier-normalized AST, and two day-window literal offsets as its complete Target118 predecessor. The exact historical externalTips declaration contains exactly two ordered (1000 * 60 * 60 * 24) divisors, in plan-mode-for-complex-tasks and opusplan-mode-reminder, which each evaluate to 86400000 and compile to those two literals. Three unrelated earlier Target119 occurrences only shift the inherited literals from global ordinals 19/20 to 22/23; they are not new runtime behavior. The remaining eligible owner row is directly authored by the same exact declaration and referral dependency. Raw and supplemented Target119 source retain the exact externalTips declaration, so this complete static source/AST proof authorizes no replay.',
    }),
  ])
