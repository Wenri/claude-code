const CASE_NAME = '2.1.117-to-2.1.118'

export const TARGET118_HEADLESS_CLASSIFIER_DCE_EVIDENCE_IDS = Object.freeze([
  'target118-headless-classifier-dce-authenticated-units',
  'target118-headless-classifier-dce-transition-proof',
  'target118-headless-classifier-dce-null-binding-proof',
  'target118-headless-classifier-dce-source-boundary',
])

export const TARGET118_HEADLESS_CLASSIFIER_DCE_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20835`,
      targetIndex: 20835,
      paths: Object.freeze(['src/cli/print.ts']),
      declarations: Object.freeze(['runHeadless']),
      evidenceIds: TARGET118_HEADLESS_CLASSIFIER_DCE_EVIDENCE_IDS,
      behavior:
        'The complete Target117 and Target118 runHeadless units differ only at the permission-prompt classifier expression. Target117 calls its live post-turn classifier directly; Target118 replaces that expression with an optional access through a module binding initialized to null and never assigned, so the expression is a no-op. Removing only that expression makes both complete units alpha-identical. The startup tengu_timer event and durationMs properties are exact retained syntax in both units, while the historical and packaged Target118 print.ts declaration already implements the resulting notify-only callback. The runClassifierSummaryForBlocked property is therefore compiler-retained dead structure, not a source gap or authorization to restore the removed classifier implementation.',
    }),
  ])
