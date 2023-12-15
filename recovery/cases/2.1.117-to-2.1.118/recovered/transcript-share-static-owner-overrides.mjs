const CASE_NAME = '2.1.117-to-2.1.118'

export const TARGET118_TRANSCRIPT_SHARE_STATIC_EVIDENCE_IDS = Object.freeze([
  'target118-transcript-share-authenticated-paired-unit',
  'target118-transcript-share-source-ast-test',
  'target118-transcript-share-build-metadata-test',
])

export const TARGET118_TRANSCRIPT_SHARE_STATIC_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:19909`,
    targetIndex: 19909,
    paths: Object.freeze([
      'src/components/FeedbackSurvey/submitTranscriptShare.ts',
    ]),
    declarations: Object.freeze(['submitTranscriptShare']),
    evidenceIds: TARGET118_TRANSCRIPT_SHARE_STATIC_EVIDENCE_IDS,
    behavior:
      'The authenticated Target118 submitTranscriptShare unit is identical to its complete Target117 predecessor after only bundle-local identifier and exact VERSION, BUILD_TIME, and GIT_SHA normalization. Its remaining target-added size occurrence is the authored stat-result destructure and size guard already present in the exact recovered source declaration. This is a direct static source-owner proof and requires no replay.',
  }),
])
