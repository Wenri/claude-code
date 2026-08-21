const CASE_NAME = '2.1.120-to-2.1.121'

const EVIDENCE_IDS = Object.freeze([
  'target121-pty-worker-authenticated-target-fragment',
  'target121-pty-worker-exact-source-owner-test',
  'target121-pty-worker-compiler-normalization-test',
  'target121-pty-worker-build-macro-test',
])

function override(targetIndex, ownerPath, behavior) {
  return Object.freeze({
    key: `${CASE_NAME}:${targetIndex}`,
    targetIndex,
    paths: Object.freeze([ownerPath]),
    evidenceIds: EVIDENCE_IDS,
    behavior,
  })
}

export const TARGET121_PTY_WORKER_OWNER_OVERRIDES = Object.freeze([
  override(
    19577,
    'src/daemon/ptyHost.ts',
    'The authenticated unit is the complete background PTY host entrypoint: it validates the private argv protocol, owns the Bun terminal and Unix socket, broadcasts bounded terminal frames, reports the expanded build identity, and closes the child and socket deterministically.',
  ),
  override(
    19592,
    'src/daemon/supervisor.ts',
    'The authenticated unit is the supervisor PTY launcher: it pins the current executable, passes the private --bg-pty-host socket and geometry protocol, detaches and unreferences the child, and returns the socket client.',
  ),
  override(
    19597,
    'src/daemon/supervisor.ts',
    'The authenticated class is the complete background worker handle: it owns spawn, upgrade, retirement, rendezvous, reply serialization, PTY geometry, respawn, and PID-liveness state; compiler-renamed private fields and expanded build macros do not create a Chrome-native-host source obligation.',
  ),
])

export const TARGET121_PTY_WORKER_EVIDENCE_IDS = EVIDENCE_IDS
