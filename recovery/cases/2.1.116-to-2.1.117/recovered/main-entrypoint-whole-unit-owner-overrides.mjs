const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_MAIN_ENTRYPOINT_WHOLE_UNIT_EVIDENCE_IDS = Object.freeze([
  'target117-main-entrypoint-authenticated-whole-unit-proof',
  'target117-main-entrypoint-complete-token-edit-proof',
  'target117-main-entrypoint-retained-residue-correspondence-proof',
  'target117-main-entrypoint-source-lineage-replay-blocker',
])

export const TARGET117_MAIN_ENTRYPOINT_WHOLE_UNIT_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20785`,
      targetIndex: 20785,
      paths: Object.freeze(['src/main.tsx']),
      declarations: Object.freeze(['run']),
      evidenceIds: TARGET117_MAIN_ENTRYPOINT_WHOLE_UNIT_EVIDENCE_IDS,
      behavior:
        'The authenticated Target116/117 run units have a complete, bounded 17-hunk normalized-token edit proof. Six added-owner rows are retained at exact paired token positions, five are genuine Target117 runtime changes, and six are release metadata. The recovered main.tsx snapshot omits retained Target117 contracts as well as all three genuine source additions, so this admission is a static whole-unit proof and never a partial source replay.',
    }),
  ])
