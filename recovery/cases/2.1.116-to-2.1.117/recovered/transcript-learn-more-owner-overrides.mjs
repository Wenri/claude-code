const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_TRANSCRIPT_LEARN_MORE_EVIDENCE_IDS = Object.freeze([
  'target117-transcript-learn-more-authenticated-whole-unit',
  'target117-learn-more-link-authenticated-runtime-dependency',
  'target117-transcript-learn-more-source-identity-blocker',
])

export const TARGET117_TRANSCRIPT_LEARN_MORE_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:19751`,
    targetIndex: 19751,
    paths: Object.freeze([
      'src/components/FeedbackSurvey/TranscriptSharePrompt.tsx',
    ]),
    declarations: Object.freeze(['TranscriptSharePrompt']),
    evidenceIds: TARGET117_TRANSCRIPT_LEARN_MORE_EVIDENCE_IDS,
    behavior:
      'Authenticated Target117 TranscriptSharePrompt replaces the manual dim learn-more text with the shared clickable learn-more runtime helper while preserving the rest of the whole unit. Neither historical nor later source authenticates that helper\'s authored name or path, so this is a static whole-unit owner proof and never a guessed source replay.',
  }),
])
