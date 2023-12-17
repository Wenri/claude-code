const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_RESUME_RETURN_DECISION_EVIDENCE_IDS = Object.freeze([
  'target119-resume-return-decision-authenticated-whole-unit-proof',
  'target119-resume-return-decision-runtime-dependency-proof',
  'target119-resume-return-decision-cross-release-owner-lineage-proof',
  'target119-resume-return-decision-source-graph-replay-blocker',
])

export const TARGET119_RESUME_RETURN_DECISION_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:19650`,
    targetIndex: 19650,
    paths: Object.freeze(['src/utils/resumeReturn.ts']),
    declarations: Object.freeze(['getResumeReturnInfo']),
    evidenceIds: TARGET119_RESUME_RETURN_DECISION_EVIDENCE_IDS,
    behavior:
      'The authenticated Target119 resume-return decision helper gates on tengu_gleaming_fair and resumeReturnDismissed, parses the age and token thresholds, selects the last user/assistant message older than one minute, computes its age, and invokes the REPL-supplied token estimator only after the cheap gates pass. The complete function is canonically identical from Target118 through Target121 and Target121 source names the extracted declaration getResumeReturnInfo in src/utils/resumeReturn.ts. Target119 source omits that declaration, ResumeReturnDialog, the config field, and every REPL caller/action edge, so this is a static whole-unit admission and never authorizes a partial or later-source replay.',
  }),
])
