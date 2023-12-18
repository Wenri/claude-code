const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_ULTRAPLAN_CHOICE_MODULE_IMPORT_EVIDENCE_IDS =
  Object.freeze([
    'target119-ultraplan-choice-module-initializer-whole-unit-proof',
    'target119-ultraplan-choice-import-consumer-boundary-proof',
    'target119-ultraplan-choice-authored-source-import-proof',
    'target119-ultraplan-choice-false-session-background-hint-owner-proof',
    'target119-ultraplan-choice-retained-runtime-lineage-proof',
    'target119-ultraplan-choice-static-owner-only-proof',
  ])

export const TARGET119_ULTRAPLAN_CHOICE_MODULE_IMPORT_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20804`,
      targetIndex: 20804,
      paths: Object.freeze(['src/components/UltraplanChoiceDialog.tsx']),
      declarations: Object.freeze([
        'currentTranscriptExists',
        'UltraplanChoiceDialog',
      ]),
      evidenceIds: TARGET119_ULTRAPLAN_CHOICE_MODULE_IMPORT_EVIDENCE_IDS,
      behavior:
        'The complete authenticated u20804 module initializer assigns fs/promises and path to the two bindings consumed by the exact retained UltraplanChoiceDialog runtime as stat, writeFile, and join. Target119 adds the exact authored src/components/UltraplanChoiceDialog.tsx source, whose named imports and three call sites authenticate that boundary; Target120 and Target121 retain the same source blob and initializer AST. The generated src/components/SessionBackgroundHint.tsx owner has neither module import and cannot own this unit. This evidence corrects the whole unit statically and never authorizes source replay.',
    }),
  ])
