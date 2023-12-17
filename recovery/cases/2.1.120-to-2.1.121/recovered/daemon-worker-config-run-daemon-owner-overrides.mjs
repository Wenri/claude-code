const CASE_NAME = '2.1.120-to-2.1.121'
const SOURCE_PATH = 'src/daemon/main.ts'

export const TARGET121_DAEMON_WORKER_CONFIG_RUN_DAEMON_EVIDENCE_IDS =
  Object.freeze([
    'target121-daemon-worker-config-authenticated-complete-units',
    'target121-daemon-worker-config-baseline-inline-lineage',
    'target121-daemon-worker-config-source-ast-test',
    'target121-daemon-worker-config-shared-call-graph-test',
    'target121-daemon-run-build-macro-test',
    'target121-daemon-worker-config-static-no-replay-test',
  ])

export const TARGET121_DAEMON_WORKER_CONFIG_RUN_DAEMON_PROOF_SPEC =
  Object.freeze({
    case: CASE_NAME,
    targetIndices: Object.freeze([22170, 22174]),
    baselineUnitIndex: 19500,
    structuralClassification: 'unresolved',
    coverageLane: 'nonmatched-source-runtime-owner-correction',
    provisionalOwnerPaths: Object.freeze(['src/main.tsx']),
    correctedOwnerPaths: Object.freeze([SOURCE_PATH]),
    sourceDeclarations: Object.freeze(['runDaemon']),
    representation:
      'compiler-extracted-worker-config-manager-and-run-daemon-caller',
    sourceReplayAuthorized: false,
  })

export const TARGET121_DAEMON_WORKER_CONFIG_RUN_DAEMON_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:22170`,
      targetIndex: 22170,
      paths: Object.freeze([SOURCE_PATH]),
      declarations: Object.freeze(['runDaemon']),
      evidenceIds:
        TARGET121_DAEMON_WORKER_CONFIG_RUN_DAEMON_EVIDENCE_IDS,
      behavior:
        'Target121 u22170 is the compiler-extracted configured-worker lifecycle from src/daemon/main.ts::runDaemon. The complete function loads and watches daemon.json, creates and restarts ManagedWorker instances with the daemon auth manager, publishes worker status, and returns workerCount, hasOAuthConsumer, disposeWatcher, drainReloads, and stop operations to u22174. The same lifecycle is inline in the complete Target120 runDaemon, and the exact raw and packaged Target121 runDaemon already author every operation, so this is a static owner correction with no source replay.',
    }),
    Object.freeze({
      key: `${CASE_NAME}:22174`,
      targetIndex: 22174,
      paths: Object.freeze([SOURCE_PATH]),
      declarations: Object.freeze(['runDaemon']),
      evidenceIds:
        TARGET121_DAEMON_WORKER_CONFIG_RUN_DAEMON_EVIDENCE_IDS,
      behavior:
        'Target121 u22174 is the complete compiled runDaemon caller in src/daemon/main.ts. It creates the daemon auth manager, passes it and the worker configuration graph to u22170, consumes workerCount and hasOAuthConsumer, then disposes the watcher, drains reloads, and stops the extracted manager during shutdown. Its six VERSION, BUILD_TIME, and GIT_SHA rows are build substitutions of two MACRO.VERSION source references and are proved separately from the twelve worker-manager rows. Raw and packaged source contain the exact integrated lifecycle, so no replay is authorized.',
    }),
  ])
