const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_AUTOCOMPACT_DIALOG_EVIDENCE_IDS = Object.freeze([
  'target119-autocompact-dialog-authenticated-whole-unit-proof',
  'target119-autocompact-dialog-caller-loader-boundary-proof',
  'target119-autocompact-dialog-source-owner-proof',
  'target119-autocompact-dialog-temporal-evolution-proof',
  'target119-autocompact-dialog-source-replay-blocker',
])

export const TARGET119_AUTOCOMPACT_DIALOG_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:15690`,
    targetIndex: 15690,
    paths: Object.freeze([
      'src/commands/autocompact/autocompact.tsx',
    ]),
    declarations: Object.freeze(['AutoCompactDialog', 'call']),
    evidenceIds: TARGET119_AUTOCOMPACT_DIALOG_EVIDENCE_IDS,
    behavior:
      'The authenticated Target119 AutoCompactDialog is a complete 49-slot compiler-cached UI unit. It resolves the configured and model-capped window, implements cyclic auto/100k-1M selection, binds Select and Tabs actions, applies or cancels through the autocompact command adapter, and renders the exact warning and configuration states. Its export registration, call adapter, module initializer, and local-jsx command loader bind the unit to src/commands/autocompact/autocompact.tsx. The recovered source is the correct semantic owner for the residues but is not a replay preimage: it renders two ConfigurableShortcutHint children while the target renders three chord-aware KeyboardShortcutHint children, and the packaged KeyboardShortcutHint Props still lacks the target chord API. Admission is static and never authorizes a source replay.',
  }),
])
