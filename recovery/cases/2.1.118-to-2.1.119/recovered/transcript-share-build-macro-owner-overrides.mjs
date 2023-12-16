const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_TRANSCRIPT_SHARE_BUILD_MACRO_EVIDENCE_IDS =
  Object.freeze([
    'target119-transcript-share-authenticated-paired-unit',
    'target119-transcript-share-historical-source-file-proof',
    'target119-transcript-share-source-ast-owner-proof',
    'target119-transcript-share-build-macro-proof',
    'target119-transcript-share-complete-unit-test',
  ])

export const TARGET119_TRANSCRIPT_SHARE_BUILD_MACRO_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20814`,
      targetIndex: 20814,
      paths: Object.freeze([
        'src/components/FeedbackSurvey/submitTranscriptShare.ts',
      ]),
      declarations: Object.freeze(['submitTranscriptShare']),
      evidenceIds: TARGET119_TRANSCRIPT_SHARE_BUILD_MACRO_EVIDENCE_IDS,
      behavior:
        'The complete authenticated Target119 submitTranscriptShare unit is identical to its complete Target118 predecessor after only bundle-local identifier and exact VERSION, BUILD_TIME, and GIT_SHA normalization. The exact historical declaration directly owns size/stat/readFile and the transcript-share call path, while the complete paired units prove split/map/join are retained pipeline operations rather than Target119 additions. The remaining three strict rows are the Target119 build identity inlined by the declaration\'s sole MACRO.VERSION access. The source file is byte-identical across the authenticated Target118, Target119, and Target120 source commits, so this is a complete static source-and-build proof and authorizes no replay.',
    }),
  ])
