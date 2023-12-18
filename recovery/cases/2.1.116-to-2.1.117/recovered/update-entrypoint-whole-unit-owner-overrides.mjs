const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_UPDATE_ENTRYPOINT_WHOLE_UNIT_EVIDENCE_IDS =
  Object.freeze([
    'target117-update-entrypoint-authenticated-paired-whole-unit',
    'target117-update-entrypoint-build-metadata-component-proof',
    'target117-update-entrypoint-retained-occurrence-proof',
    'target117-update-entrypoint-source-snapshot-proof',
  ])

export const TARGET117_UPDATE_ENTRYPOINT_WHOLE_UNIT_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20768`,
      targetIndex: 20768,
      paths: Object.freeze(['src/cli/update.ts']),
      declarations: Object.freeze(['update']),
      evidenceIds: TARGET117_UPDATE_ENTRYPOINT_WHOLE_UNIT_EVIDENCE_IDS,
      behavior:
        'The authenticated Target116 and Target117 update entrypoint units are identical after all 23 embedded copies of VERSION, BUILD_TIME, and GIT_SHA plus minifier bindings are normalized. The two remaining added-owner dot residues are retained global occurrence shifts inside that exact paired unit. Target117 source authenticates the update owner and MACRO.VERSION behavior but is not rewritten; this is a static paired whole-unit proof and never a source replay.',
    }),
  ])
