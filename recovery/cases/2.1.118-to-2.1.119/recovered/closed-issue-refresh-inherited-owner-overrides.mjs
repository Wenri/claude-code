const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_CLOSED_ISSUE_REFRESH_EVIDENCE_IDS = Object.freeze([
  'target119-closed-issue-refresh-authenticated-units',
  'target119-closed-issue-refresh-token-identity',
  'target119-closed-issue-refresh-source-owner-lineage',
  'target119-closed-issue-refresh-replay-blocker',
])

export const TARGET119_CLOSED_ISSUE_REFRESH_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:20137`,
    targetIndex: 20137,
    paths: Object.freeze(['src/components/ClosedIssueNotice.tsx']),
    declarations: Object.freeze(['refreshClosedIssues']),
    evidenceIds: TARGET119_CLOSED_ISSUE_REFRESH_EVIDENCE_IDS,
    behavior:
      'The complete Target119 refreshClosedIssues unit is alpha-token identical to its authenticated Target118 predecessor and remains identical through Targets120 and 121. It gates interactive and essential-traffic modes, rate-limits the GitHub CLI query, retains only COMPLETED issues, writes the cache atomically enough for this read path, prunes stale acknowledgements, persists the check timestamp, and returns elapsed time. Every apparent target-added literal is therefore global occurrence-order drift. Target120 source authenticates src/components/ClosedIssueNotice.tsx as the owner, while the Target119 source tree lacks the module, its Notifications import, and its config type fields; this static proof deliberately authorizes no later-source replay at the Target119 boundary.',
  }),
])
