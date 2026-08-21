const CASE_NAME = '2.1.117-to-2.1.118'
const TARGET_FRAGMENT_EVIDENCE =
  'target118-tertiary-static-owner-target-fragment'
const SOURCE_AST_EVIDENCE = 'target118-tertiary-static-owner-source-ast-test'

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

export const TARGET118_TERTIARY_STATIC_OWNER_OVERRIDES = Object.freeze([
  override(
    2523,
    'src/utils/plugins/schemas.ts',
    'The authenticated Target118 marketplace schema unit is authored by SettingsMarketplacePluginSchema; its single compiled validation string is the exact fold of three adjacent source string literals in the refine message.',
  ),
  override(
    6249,
    'src/utils/http.ts',
    'The authenticated Target118 WIF authentication function is authored by getAuthHeadersAsync; its second getWIFCredentials property occurrence is the named dynamic-import binding that is invoked inside the function.',
  ),
  override(
    15337,
    'src/commands/color/color.ts',
    'The authenticated Target118 remote color synchronizer is authored by syncRemoteColor; updateBridgeSessionColorTag is the exact dynamic-import binding called with the bridge session and color.',
  ),
  override(
    20013,
    'src/services/tips/tipRegistry.ts',
    'The authenticated Target118 guest-passes tip is authored inside externalTips; its eligibility callback destructures and returns the exact eligible field from checkCachedPassesEligibility.',
  ),
])
