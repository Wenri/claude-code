const CASE_NAME = '2.1.117-to-2.1.118'
const TARGET_FRAGMENT_EVIDENCE =
  'target118-quinary-static-owner-target-fragment'
const SOURCE_AST_EVIDENCE =
  'target118-quinary-static-owner-source-ast-test'

function override(targetIndex, ownerPath, behavior) {
  return Object.freeze({
    key: `${CASE_NAME}:${targetIndex}`,
    targetIndex,
    paths: Object.freeze([ownerPath]),
    evidenceIds: Object.freeze([
      TARGET_FRAGMENT_EVIDENCE,
      SOURCE_AST_EVIDENCE,
    ]),
    behavior,
  })
}

export const TARGET118_QUINARY_STATIC_OWNER_OVERRIDES = Object.freeze([
  override(
    6166,
    'src/utils/auth.ts',
    'The authenticated Target118 auth export registry binds shouldUseWIFAuth and describeHowToDisableAuthTokenSource to the exact exported historical source declarations; the property residues are module-export lowering, not missing runtime behavior.',
  ),
  override(
    15119,
    'src/utils/messages.ts',
    'The authenticated Target118 module initializer hoists the exact shared plan-mode paragraph consumed twice by getPlanModeV2Instructions; the standalone string residue is compiler common-template-prefix extraction from the historical source declaration.',
  ),
  override(
    17959,
    'src/utils/sessionStorage.ts',
    'The authenticated Target118 session-storage export registry binds recordSessionAlias and recordForkContextRef to the exact exported historical source declarations; the property residues are module-export lowering, not missing runtime behavior.',
  ),
])
