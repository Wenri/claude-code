const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_BRIDGE_DIALOG_MEMO_CACHE_EVIDENCE_IDS = Object.freeze([
  'target117-bridge-dialog-authenticated-memo-cache-closure',
  'target117-bridge-dialog-source-compiler-cache-owner-test',
])

export const TARGET117_BRIDGE_DIALOG_MEMO_CACHE_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:19151`,
      targetIndex: 19151,
      paths: Object.freeze(['src/components/BridgeDialog.tsx']),
      declarations: Object.freeze(['BridgeDialog']),
      evidenceIds: TARGET117_BRIDGE_DIALOG_MEMO_CACHE_EVIDENCE_IDS,
      behavior:
        'The authenticated Target117 BridgeDialog unit uses its sole added numeric residue, 96, only as the React compiler memo-cache allocation size; the cache binding has no non-slot uses and addresses every slot from 0 through 95, while the exact ff0339 BridgeDialog source independently closes its compiler-runtime cache from 0 through 86. The residue is compiler allocation metadata owned by BridgeDialog, not source-authored runtime data.',
    }),
  ])
