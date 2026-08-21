const CASE_NAME = '2.1.120-to-2.1.121'

const EVIDENCE_IDS = Object.freeze([
  'target121-daemon-spare-authenticated-target-fragment',
  'target121-daemon-spare-exact-source-owner-test',
  'target121-daemon-spare-build-macro-test',
])

export const TARGET121_DAEMON_SPARE_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:22119`,
    targetIndex: 22119,
    paths: Object.freeze(['src/daemon/spare.ts']),
    evidenceIds: EVIDENCE_IDS,
    behavior:
      'The authenticated unit is the complete prewarmed spare-worker launcher: it creates private claim and PTY sockets, spawns the detached background PTY host with the spare protocol, exposes its pinned CLI version and lifecycle, removes socket artifacts on exit, and reports the spawned PID. Its authored owner is daemon/spare.ts, not the top-level CLI main entrypoint.',
  }),
])

export const TARGET121_DAEMON_SPARE_EVIDENCE_IDS = EVIDENCE_IDS
