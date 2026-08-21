const CASE_NAME = '2.1.117-to-2.1.118'
const TARGET_FRAGMENT_EVIDENCE =
  'target118-quaternary-static-owner-target-fragment'
const SOURCE_AST_EVIDENCE =
  'target118-quaternary-static-owner-source-ast-test'

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

export const TARGET118_QUATERNARY_STATIC_OWNER_OVERRIDES = Object.freeze([
  override(
    6796,
    'src/utils/fullscreen.ts',
    'The authenticated Target118 renderer-path function reads the module-scoped gbGateCached state; the bundle lowers that shared module state into its generated state object while preserving the source nullish fallback and result branches.',
  ),
  override(
    15447,
    'src/components/ThemePicker.tsx',
    'The authenticated Target118 ThemePicker destructures onCustomTheme and customThemes and uses both throughout the exact historical component; the two property residues are binding/property lowering, not missing behavior.',
  ),
  override(
    18758,
    'src/bridge/bridgeMessaging.ts',
    'The authenticated Target118 control-request handler destructures onSetColor and invokes it in the set_color branch with the exact unsupported-callback fallback response.',
  ),
  override(
    20441,
    'src/interactiveHelpers.tsx',
    'The authenticated Target118 Bedrock fallback dialog maps warnings to keyed Text elements; the key residue is the JSX property emitted from the exact historical handleBedrockDefaultFallbacks declaration.',
  ),
  override(
    20443,
    'src/interactiveHelpers.tsx',
    'The authenticated Target118 Vertex fallback dialog maps warnings to keyed Text elements; the key residue is the JSX property emitted from the exact historical handleVertexDefaultFallbacks declaration.',
  ),
  override(
    20523,
    'src/skills/bundled/updateConfig.ts',
    'The authenticated Target118 update-config skill strips the twelve-character hooks-only prefix; the emitted numeric residue is the constant fold of the exact source string length.',
  ),
  override(
    20897,
    'src/commands/install.tsx',
    'The authenticated Target118 SetupNotes component uses the React compiler memo cache; the generated c property is the lowering of the exact historical _c(5) cache call.',
  ),
  override(
    20898,
    'src/commands/install.tsx',
    'The authenticated Target118 setup-note row uses its map index as the JSX key; the generated key property is owned by the exact historical _temp renderer declaration.',
  ),
  override(
    20908,
    'src/cli/handlers/util.tsx',
    'The authenticated Target118 install handler passes process.cwd() to setup; the generated cwd property access is the lowering of the exact named import and call in installHandler.',
  ),
  override(
    20916,
    'src/cli/handlers/plugins.ts',
    'The authenticated Target118 plugin-tag handler destructures the validated release plan before rendering and executing it; the plan residue is owned by that exact binding.',
  ),
])
