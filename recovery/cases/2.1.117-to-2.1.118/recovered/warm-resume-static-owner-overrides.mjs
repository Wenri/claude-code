const CASE_NAME = '2.1.117-to-2.1.118'
const OWNER_PATH = 'src/components/WarmResumeHint.tsx'
const EVIDENCE_IDS = Object.freeze([
  'target118-warm-resume-static-target-fragment',
  'target118-warm-resume-static-source-ast-test',
])

export const TARGET118_WARM_RESUME_STATIC_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:16625`,
    targetIndex: 16625,
    paths: Object.freeze([OWNER_PATH]),
    declarations: Object.freeze(['isEligibleLog']),
    evidenceIds: EVIDENCE_IDS,
    behavior:
      'The authenticated Target118 isEligibleLog function accepts only launches with no session kind that are not teammate sessions. The exact historical WarmResumeHint.tsx declaration owns the complete unit; the provisional LogoV2 attribution is rejected.',
  }),
  Object.freeze({
    key: `${CASE_NAME}:16630`,
    targetIndex: 16630,
    paths: Object.freeze([OWNER_PATH]),
    declarations: Object.freeze(['VARIANTS']),
    evidenceIds: EVIDENCE_IDS,
    behavior:
      "The authenticated Target118 WarmResumeHint module initializes the exact four experiment variants ['0', '1', '2', '3']. The exact historical WarmResumeHint.tsx VARIANTS declaration owns the complete unit; the provisional LogoV2 attribution is rejected.",
  }),
])
