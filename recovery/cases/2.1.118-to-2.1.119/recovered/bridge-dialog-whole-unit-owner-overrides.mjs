const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_BRIDGE_DIALOG_WHOLE_UNIT_EVIDENCE_IDS = Object.freeze([
  'target119-bridge-dialog-authenticated-whole-unit-proof',
  'target119-bridge-dialog-config-call-delta-proof',
  'target119-bridge-dialog-inherited-footer-proof',
  'target119-bridge-dialog-source-map-owner-proof',
  'target119-bridge-dialog-source-replay-blocker',
])

export const TARGET119_BRIDGE_DIALOG_WHOLE_UNIT_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20251`,
      targetIndex: 20251,
      paths: Object.freeze(['src/components/BridgeDialog.tsx']),
      declarations: Object.freeze(['BridgeDialog']),
      evidenceIds: TARGET119_BRIDGE_DIALOG_WHOLE_UNIT_EVIDENCE_IDS,
      behavior:
        'The complete authenticated Target119 BridgeDialog is a 96-slot compiler-cached UI unit. After alpha normalization, the only Target118-to-Target119 token change replaces the disconnect config-updater argument with the direct remoteControlAtStartup false pair; basename, QR toString, the chord-aware KeyboardShortcutHint footer, and the entire cache topology are inherited and remain stable through Target121. The recovered BridgeDialog authenticates the declaration, imports, and direct config call, but is a stale 87-slot manual-footer snapshot, while the recovered KeyboardShortcutHint requires shortcut and compiles to 9 slots instead of the authenticated chord-aware 12-slot dependency. Admission is static and never authorizes a partial or graph-incomplete source replay.',
    }),
  ])
