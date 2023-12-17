const CASE_NAME = '2.1.117-to-2.1.118'
const OWNER_PATH = 'src/utils/sessionStorage.ts'

export const TARGET118_SESSION_STORAGE_ENTRY_POLICY_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:18104`,
      targetIndex: 18104,
      paths: Object.freeze([OWNER_PATH]),
      declarations: Object.freeze(['ENTRY_APPEND_POLICY', 'appendEntry']),
      evidenceIds: Object.freeze([
        'target118-session-storage-entry-policy-target-fragments',
        'target118-session-storage-entry-policy-source-ast-test',
        'target118-session-storage-entry-policy-semantic-test',
      ]),
      behavior:
        'The authenticated Target118 ENTRY_APPEND_POLICY route-by-agent value is the table-driven form of historical Project.appendEntry routing: content-replacement entries use an agent transcript only when agentId exists, fork-context-ref entries use their required agent transcript, and both otherwise preserve the session-file route. The exact target policy/switch and historical source branches are state-equivalent; this is not incidental text or missing session-storage behavior.',
    }),
  ])
