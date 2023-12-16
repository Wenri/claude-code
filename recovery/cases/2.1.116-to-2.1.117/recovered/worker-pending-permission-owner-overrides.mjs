const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_WORKER_PENDING_PERMISSION_EVIDENCE_IDS = Object.freeze([
  'target117-worker-pending-permission-target-fragment-proof',
  'target117-worker-pending-permission-source-jsx-owner-test',
])

export const TARGET117_WORKER_PENDING_PERMISSION_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:18545`,
      targetIndex: 18545,
      paths: Object.freeze([
        'src/components/permissions/WorkerPendingPermission.tsx',
      ]),
      declarations: Object.freeze(['WorkerPendingPermission']),
      evidenceIds: TARGET117_WORKER_PENDING_PERMISSION_EVIDENCE_IDS,
      behavior:
        'The authenticated Target117 pending-permission title renders a spinner followed by one Text child whose exact leading-space text is " Waiting for team lead approval"; the ff0339 WorkerPendingPermission JSX constructs the same text from an explicit one-space expression adjacent to the literal. This override owns only that composed JSX text residue.',
    }),
  ])
