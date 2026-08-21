const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_REMOTE_SESSION_ACTION_DISPATCH_EVIDENCE_IDS =
  Object.freeze([
    'target119-remote-session-authenticated-whole-unit-proof',
    'target119-remote-session-action-residue-partition-proof',
    'target119-remote-session-preflight-clear-proof',
    'target119-remote-session-dispatch-caller-boundary-proof',
    'target119-remote-session-cross-release-lineage-proof',
    'target119-remote-session-source-graph-replay-blocker',
  ])

export const TARGET119_REMOTE_SESSION_ACTION_DISPATCH_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20541`,
      targetIndex: 20541,
      paths: Object.freeze(['src/hooks/useRemoteSession.ts']),
      declarations: Object.freeze(['useRemoteSession']),
      evidenceIds: TARGET119_REMOTE_SESSION_ACTION_DISPATCH_EVIDENCE_IDS,
      behavior:
        'The complete authenticated Target119 useRemoteSession unit owns both action literals. The apparent added remove action is retained from Target118 under identifier and global-occurrence drift; the added clear is the fourth local clear and belongs to the new preflight-failure teardown, which disconnects, clears connection/task state, and clears in-progress tool-use IDs. Target118 and Target119 callers both provide the same canonical add/remove/clear dispatcher, and the Target119 unit continues unchanged through Target121. Authored Target119/120 source instead types and passes a React state updater, while Target121 only partially migrates four sites and leaves the preflight site, hook type, and caller stale. This evidence therefore admits a static whole-unit owner proof only and never authorizes source replay.',
    }),
  ])
