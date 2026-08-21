const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_BACKGROUND_EXIT_DIALOG_EVIDENCE_IDS = Object.freeze([
  'target117-background-exit-dialog-authenticated-whole-unit',
  'target117-background-exit-dialog-target118-lineage',
  'target117-background-exit-dialog-stale-source-graph-blocker',
])

export const TARGET117_BACKGROUND_EXIT_DIALOG_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:17463`,
    targetIndex: 17463,
    paths: Object.freeze(['src/components/BackgroundExitDialog.tsx']),
    declarations: Object.freeze(['BackgroundExitDialog']),
    evidenceIds: TARGET117_BACKGROUND_EXIT_DIALOG_EVIDENCE_IDS,
    behavior:
      'Authenticated Target117 BackgroundExitDialog replaces manual hidden-item text with TruncatedCount and the local Select choice adapter with ConfirmationButtons. Exact Target118 structural lineage proves the component name and module path, while the missing Target117 caller/type graph deliberately blocks source replay.',
  }),
])
