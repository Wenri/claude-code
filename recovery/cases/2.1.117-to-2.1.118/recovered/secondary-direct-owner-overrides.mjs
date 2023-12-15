const CASE_NAME = '2.1.117-to-2.1.118'
const TARGET_FRAGMENT_EVIDENCE =
  'target118-secondary-direct-owner-target-fragment'
const SOURCE_AST_EVIDENCE = 'target118-secondary-direct-owner-source-ast-test'

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

export const TARGET118_SECONDARY_DIRECT_OWNER_OVERRIDES = Object.freeze([
  override(
    15071,
    'src/utils/messages.ts',
    'The authenticated Target118 plan-mode instruction unit is authored by getPlanModeV2Instructions in messages.ts, including both plan-file sections and the AskUserQuestion clarification guidance.',
  ),
  override(
    16206,
    'src/commands/plugin/ManageMarketplaces.tsx',
    'The authenticated Target118 marketplace management unit is the authored ManageMarketplaces declaration, including the pending update/remove result shape and action summary labels.',
  ),
  override(
    16234,
    'src/commands/plugin/ManagePlugins.tsx',
    'The authenticated Target118 plugin component summary unit is the authored PluginComponentsDisplay declaration, including the Agents, Skills, and Hooks sections.',
  ),
])
