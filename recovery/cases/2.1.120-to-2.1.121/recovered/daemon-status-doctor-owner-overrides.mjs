const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_DAEMON_STATUS_DOCTOR_EVIDENCE_IDS = Object.freeze([
  'target121-daemon-status-doctor-authenticated-whole-units',
  'target121-daemon-status-lease-contract-evolution',
  'target121-doctor-status-consumer-contract',
  'target121-daemon-status-build-macro-expansion',
])

export const TARGET121_DAEMON_STATUS_DOCTOR_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:16363`,
    targetIndex: 16363,
    paths: Object.freeze(['src/daemon/status.ts']),
    declarations: Object.freeze(['BgDaemonStatus', 'getBgDaemonStatus']),
    evidenceIds: TARGET121_DAEMON_STATUS_DOCTOR_EVIDENCE_IDS,
    behavior:
      'The authenticated Target121 getBgDaemonStatus unit concurrently probes daemon jobs and leases, carries validated lease clients into the status result, and compares live job versions with the compile-time MACRO.VERSION expansion. Its direct Target120 predecessor retains the same preflight, job-version, and thirteen-field result skeleton but lacks the lease request, clients branch, and leaseClients result field. Recovered daemon/status.ts proves the owner and source evolution, although its defensive Array.isArray/filter branch is stricter than the authenticated target unit direct clients assignment; therefore this is a static whole-unit owner proof and no source replay is admitted.',
  }),
  Object.freeze({
    key: `${CASE_NAME}:16369`,
    targetIndex: 16369,
    paths: Object.freeze(['src/screens/Doctor.tsx']),
    declarations: Object.freeze([
      'BackgroundServerDetails',
      'BackgroundServer',
    ]),
    evidenceIds: TARGET121_DAEMON_STATUS_DOCTOR_EVIDENCE_IDS,
    behavior:
      'The authenticated Target121 BackgroundServerDetails unit consumes BgDaemonStatus from daemon/status.ts, renders supervisor, worker-roster, control-reachability, service, and configured-worker state, and compares the supervisor version with MACRO.VERSION twice. Its Target120 predecessor is alpha-canonically identical after normalizing only VERSION, BUILD_TIME, and GIT_SHA, and the recovered Doctor.tsx declaration is byte-identical across Target120 and Target121. The six strict strings are compiler metadata, so this is a static complete-unit owner proof rather than a source replay.',
  }),
])
