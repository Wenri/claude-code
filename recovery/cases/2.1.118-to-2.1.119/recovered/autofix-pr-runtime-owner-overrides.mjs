const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_AUTOFIX_PR_RUNTIME_EVIDENCE_IDS = Object.freeze([
  'target119-autofix-pr-runtime-authenticated-wrapper-core-proof',
  'target119-autofix-pr-runtime-ui-consumer-module-boundary-proof',
  'target119-autofix-pr-runtime-cross-release-stability-proof',
  'target119-autofix-pr-runtime-source-lineage-replay-blocker',
])

const behavior =
  'The authenticated Target119 autofix-pr runtime is the atomic async wrapper/core pair consumed by the autofix-pr JSX command. The pair owns the freeformPrompt request shape, start telemetry including has_pr_number/has_repo_path, repository-aware PR resolution, progress events, Remote Control and remote-session result contracts, and all 18 target-added owner residues. Target120 and Target121 preserve the complete pair under canonical AST equality. Historical autofix-pr.tsx is the public owning implementation boundary but remains a stale inline implementation; the exact authored filename of the extracted internal core module is not source-authenticated, so this admission is static and never authorizes a partial replay.'

export const TARGET119_AUTOFIX_PR_RUNTIME_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:15463`,
    targetIndex: 15463,
    paths: Object.freeze(['src/commands/autofix-pr/autofix-pr.tsx']),
    declarations: Object.freeze(['AutofixPr', 'call']),
    evidenceIds: TARGET119_AUTOFIX_PR_RUNTIME_EVIDENCE_IDS,
    behavior,
  }),
  Object.freeze({
    key: `${CASE_NAME}:15464`,
    targetIndex: 15464,
    paths: Object.freeze(['src/commands/autofix-pr/autofix-pr.tsx']),
    declarations: Object.freeze(['AutofixPr', 'call']),
    evidenceIds: TARGET119_AUTOFIX_PR_RUNTIME_EVIDENCE_IDS,
    behavior,
  }),
])
