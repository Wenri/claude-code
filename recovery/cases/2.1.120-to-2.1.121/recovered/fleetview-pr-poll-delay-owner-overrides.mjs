const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_FLEETVIEW_PR_POLL_DELAY_EVIDENCE_IDS = Object.freeze([
  'target121-fleetview-pr-poll-delay-authenticated-whole-unit',
  'target121-fleetview-pr-poll-delay-exact-call-graph',
  'target121-fleetview-pr-poll-delay-source-gap-blocker',
])

export const TARGET121_FLEETVIEW_PR_POLL_DELAY_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20874`,
      targetIndex: 20874,
      paths: Object.freeze(['src/components/FleetView.tsx']),
      declarations: Object.freeze([
        'FleetView',
        'adaptive PR refresh delay selector',
      ]),
      evidenceIds: TARGET121_FLEETVIEW_PR_POLL_DELAY_EVIDENCE_IDS,
      behavior:
        'The authenticated Target121 FleetView helper selects PR-refresh delays from terminal focus and time since the last interaction: focused sessions use 15s, 60s, then 3m; unfocused sessions use 60s, 5m, 15m, then 30m. Its sole call is inside the complete FleetView runtime, where a dedicated timestamp ref and focus-change reset gate the PR batch. Target120 has no unit at the exact module insertion boundary, while recovered Target120, Target121, and fresh-package FleetView source all retain the old unconditional activeUrls.length fetch and omit the helper, ref, reset, and getTerminalFocused import, so ownership is static and no partial source replay is admitted.',
    }),
  ])
