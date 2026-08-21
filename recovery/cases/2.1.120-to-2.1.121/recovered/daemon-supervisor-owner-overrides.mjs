const CASE_NAME = '2.1.120-to-2.1.121'

const EVIDENCE_IDS = Object.freeze([
  'target121-daemon-supervisor-authenticated-target-fragment',
  'target121-daemon-supervisor-exact-source-owner-test',
  'target121-daemon-supervisor-compiler-normalization-test',
  'target121-daemon-supervisor-build-macro-test',
])

function override(targetIndex, behavior) {
  return Object.freeze({
    key: `${CASE_NAME}:${targetIndex}`,
    targetIndex,
    paths: Object.freeze(['src/daemon/supervisor.ts']),
    evidenceIds: EVIDENCE_IDS,
    behavior,
  })
}

export const TARGET121_DAEMON_SUPERVISOR_OWNER_OVERRIDES = Object.freeze([
  override(
    22136,
    'The authenticated unit is the complete daemon control-socket server: it creates and removes the socket path, authenticates peer credentials, frames the first JSON line, tracks leases and sockets, dispatches control messages, and closes all resources. Its authored owner is daemon/supervisor.ts, not the CLI main entrypoint.',
  ),
  override(
    22140,
    'The authenticated unit is the complete daemon supervisor control-message handler: it validates protocol and schemas and implements ping, nudge, yield, lease, shutdown, list, dispatch, attach, resize, input, signal, permission, and subscription operations.',
  ),
  override(
    22151,
    'The authenticated unit is the complete background supervisor lifecycle: it prewarms and claims spare workers, dispatches and adopts handles, maintains runtime sockets and the roster, reaps orphans, escalates stalled retirement, and shuts down deterministically.',
  ),
])

export const TARGET121_DAEMON_SUPERVISOR_EVIDENCE_IDS = EVIDENCE_IDS
