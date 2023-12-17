const CASE_NAME = '2.1.116-to-2.1.117'
const TARGET_FRAGMENT_EVIDENCE = 'target117-bridge-export-target-fragment'
const SOURCE_DECLARATION_EVIDENCE =
  'target117-bridge-export-source-declaration-test'

function freezeOverride(targetIndex, sourcePath, declarations, behavior) {
  return Object.freeze({
    key: `${CASE_NAME}:${targetIndex}`,
    targetIndex,
    paths: Object.freeze([sourcePath]),
    declarations: Object.freeze([...declarations]),
    evidenceIds: Object.freeze([
      TARGET_FRAGMENT_EVIDENCE,
      SOURCE_DECLARATION_EVIDENCE,
    ]),
    behavior,
  })
}

export const TARGET117_BRIDGE_EXPORT_OWNER_OVERRIDES = Object.freeze([
  freezeOverride(
    10755,
    'src/bridge/bridgeEnabled.ts',
    ['getBridgeAuthDebugInfo'],
    'The raw Target117 exported getBridgeAuthDebugInfo declaration owns both the authenticated bundle implementation and its added export-registry property; the residue is a declaration-to-property compilation representation, not a missing source behavior.',
  ),
])
