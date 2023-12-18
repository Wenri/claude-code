#!/usr/bin/env node

const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_DAEMON_MAIN_LOG_ROTATION_EVIDENCE_IDS =
  Object.freeze([
    'target121-daemon-main-log-rotation-authenticated-pairing',
    'target121-daemon-main-log-rotation-ordinal-lineage',
    'target121-daemon-main-log-rotation-source-constant-fold',
    'target121-daemon-main-log-rotation-runtime-caller-graph',
    'target121-daemon-main-log-rotation-static-no-wiring',
  ])

export const TARGET121_DAEMON_MAIN_LOG_ROTATION_DEPENDENCY_TARGET_INDICES =
  Object.freeze([22156, 22157, 22158, 22159, 22161, 22174])

export const TARGET121_DAEMON_MAIN_LOG_ROTATION_MATCHED_STATIC_PROOF_SPEC =
  Object.freeze({
    targetIndex: 22160,
    baselineUnitIndex: 19487,
    structuralClassification: 'moved',
    pairReason: 'exact-scope-normalized-token-hash',
    moveEvidence: 'unique-exact-structural-hash',
    coverageLane: 'moved-alpha-equivalent-static-proof',
    coverageTargetRowPresent: true,
    coverageOwnerIds: Object.freeze([]),
    allOwnerInputTargetRowPresent: true,
    allOwnerInputOwners: Object.freeze([]),
    coverageGeneratorWiringAuthorized: false,
    synthesizedCorrectionAccepted: false,
    sourceReplayAuthorized: false,
  })

// Case-scoped evidence only. The exact structural pair proves that the
// declaration is retained runtime, while authenticated Target121 source binds
// the constant-folded number to daemon/main.ts. The coverage and all-owner
// rows deliberately stay ownerless because matched/moved units are outside
// the nonmatched generator-override contract.
export const TARGET121_DAEMON_MAIN_LOG_ROTATION_STRICT_NUMBER_OWNER_EVIDENCE =
  Object.freeze({
    key: `${CASE_NAME}:22160:daemon-main-log-rotation-strict-number`,
    targetIndex: 22160,
    paths: Object.freeze(['src/daemon/main.ts']),
    declarations: Object.freeze([
      'DAEMON_LOG_ROTATION_BYTES',
      'createDaemonLogger',
      'runDaemon',
    ]),
    dependencyTargetIndices:
      TARGET121_DAEMON_MAIN_LOG_ROTATION_DEPENDENCY_TARGET_INDICES,
    residues: Object.freeze([
      Object.freeze({
        literalKind: 'number',
        value: '10485760',
        start: 13869300,
        end: 13869308,
        baselineCount: 10,
        targetOccurrenceNumber: 11,
      }),
    ]),
    evidenceIds: TARGET121_DAEMON_MAIN_LOG_ROTATION_EVIDENCE_IDS,
    behavior:
      'Target121 u22160 is the unique moved, exact-scope-normalized pair of Target120 u19487. Both complete declarations initialize their third binding to 10485760, and their adjacent logger functions reference that binding twice. The authenticated Target121 src/daemon/main.ts declares DAEMON_LOG_ROTATION_BYTES as 10 * 1024 * 1024, uses it in both createDaemonLogger rotation thresholds, and reaches the logger from runDaemon. The target-wide eleventh occurrence is ordinal spill beyond the baseline total of ten, not a new operation in this paired unit. This static case admits only the number row, authorizes no whole-unit or coverage override, and replays no source.',
  })
