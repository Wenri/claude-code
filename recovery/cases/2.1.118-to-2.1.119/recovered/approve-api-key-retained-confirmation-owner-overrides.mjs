const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_APPROVE_API_KEY_RETAINED_EVIDENCE_IDS = Object.freeze([
  'target119-approve-api-key-complete-unit-retention-test',
  'target119-approve-api-key-cross-release-confirmation-lineage-test',
  'target119-approve-api-key-strict-ordinal-spill-test',
])

export const TARGET119_APPROVE_API_KEY_RETAINED_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:21230`,
    targetIndex: 21230,
    paths: Object.freeze(['src/components/ApproveApiKey.tsx']),
    evidenceIds: TARGET119_APPROVE_API_KEY_RETAINED_EVIDENCE_IDS,
    behavior:
      'Target119 u21230 is the retained ApproveApiKey confirmation declaration: its complete function and focus/cancelLabel/onConfirm/onCancel object are identifier-canonical identical to Target118 u20330 and the authenticated Target117 u20131 confirmation proof. The mechanically target-added cancelLabel row is only a global-occurrence ordinal spill, so the unchanged owner declaration needs no Target119 source replay.',
  }),
])

export const TARGET119_APPROVE_API_KEY_RETAINED_PROOF_SPEC = Object.freeze({
  targetIndex: 21230,
  baselineUnitIndex: 20330,
  historicalTargetIndex: 20131,
  ownerPath: 'src/components/ApproveApiKey.tsx',
  declaration: 'ApproveApiKey',
  representation: 'retained-confirmation-global-ordinal-spill',
  residue: Object.freeze({
    kind: 'property',
    value: 'cancelLabel',
    start: 12768927,
    end: 12768938,
    baselineCount: 21,
    targetOrdinal: 22,
    targetAdded: true,
  }),
})
