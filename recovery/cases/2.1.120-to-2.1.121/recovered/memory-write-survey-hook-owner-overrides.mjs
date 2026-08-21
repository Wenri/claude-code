const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_MEMORY_WRITE_SURVEY_HOOK_EVIDENCE_IDS = Object.freeze([
  'target121-memory-write-survey-hook-authenticated-whole-unit',
  'target121-memory-write-survey-hook-width-and-reject-graph',
  'target121-memory-write-survey-hook-source-gap-blocker',
])

export const TARGET121_MEMORY_WRITE_SURVEY_HOOK_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:21015`,
      targetIndex: 21015,
      paths: Object.freeze([
        'src/components/FeedbackSurvey/useMemoryWriteSurvey.ts',
      ]),
      declarations: Object.freeze([
        'useMemoryWriteSurvey',
        'width-aware memory-write row count and post-reject state',
      ]),
      evidenceIds: TARGET121_MEMORY_WRITE_SURVEY_HOOK_EVIDENCE_IDS,
      behavior:
        'The authenticated Target121 unit is the complete useMemoryWriteSurvey hook: it reads terminal columns, derives the shared content width, passes that width to the visual-row counter, and carries a postReject state slot through its open-state contract. Target120 u20919 is the direct whole-hook predecessor. Recovered Target120, Target121, and fresh-package hook source are byte-identical and retain the one-argument logical-line counter, lineCount return field, immediate record removal, and no postReject state or type member. The compiled postReject setter has no reference, its timer ref is cleanup-only, and the related closed-state and UI units remain distinct obligations, so ownership is static and no partial source replay is admitted.',
    }),
  ])
