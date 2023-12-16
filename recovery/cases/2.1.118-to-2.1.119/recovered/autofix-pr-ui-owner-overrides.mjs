const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_AUTOFIX_PR_UI_EVIDENCE_IDS = Object.freeze([
  'target119-autofix-pr-ui-authenticated-whole-unit-proof',
  'target119-autofix-pr-ui-runtime-wrapper-boundary-proof',
  'target119-autofix-pr-ui-cross-release-stability-proof',
  'target119-autofix-pr-ui-source-lineage-replay-blocker',
])

export const TARGET119_AUTOFIX_PR_UI_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:15473`,
    targetIndex: 15473,
    paths: Object.freeze(['src/commands/autofix-pr/autofix-pr.tsx']),
    declarations: Object.freeze(['AutofixPr', 'call']),
    evidenceIds: TARGET119_AUTOFIX_PR_UI_EVIDENCE_IDS,
    behavior:
      'The authenticated Target119 AutofixPr UI is a complete compiler-cached unit that delegates once to the separately proved autofix-pr async runtime, projects checking/prInfo progress, handles ok/error/cancelled results, adds the Remote Control view hint, aborts on cleanup/cancel, and renders the confirmation and loading/error states. Its export registration, call adapter, module initializer, and command lazy-loader bind it to src/commands/autofix-pr/autofix-pr.tsx. The packaged source still inlines the stale Target118 runtime and omits the extracted wrapper/result contract, so this is a static whole-unit admission and never a source replay.',
  }),
])
