const CASE_NAME = '2.1.120-to-2.1.121'

const EVIDENCE_IDS = Object.freeze([
  'target121-daemon-main-authenticated-target-fragment',
  'target121-daemon-main-exact-source-owner-test',
  'target121-daemon-main-compiler-normalization-test',
  'target121-daemon-main-build-macro-test',
])

export const TARGET121_DAEMON_MAIN_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:22207`,
    targetIndex: 22207,
    paths: Object.freeze(['src/daemon/main.ts']),
    evidenceIds: EVIDENCE_IDS,
    behavior:
      'The authenticated unit is the complete daemon CLI dispatcher: it gates daemon commands, runs and upgrades the supervisor, controls the optional service, stops and reaps workers, reports status and version drift, tails logs, and routes list, hub, scheduled, assistant, and remote-control commands. The authored owner is daemon/main.ts, not the top-level CLI main entrypoint.',
  }),
])

export const TARGET121_DAEMON_MAIN_EVIDENCE_IDS = EVIDENCE_IDS
