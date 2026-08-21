const CASE_NAME = '2.1.117-to-2.1.118'

export const TARGET118_PLUGIN_THEME_COUNT_EVIDENCE_IDS = Object.freeze([
  'target118-plugin-theme-count-authenticated-whole-unit',
  'target118-plugin-theme-count-complete-semantic-delta',
  'target118-plugin-theme-count-source-lineage-replay-blocker',
])

export const TARGET118_PLUGIN_THEME_COUNT_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:19784`,
    targetIndex: 19784,
    paths: Object.freeze([
      'src/hooks/useManagePlugins.ts',
      'src/utils/plugins/loadPluginThemes.ts',
    ]),
    declarations: Object.freeze(['useManagePlugins', 'loadPluginThemes']),
    evidenceIds: TARGET118_PLUGIN_THEME_COUNT_EVIDENCE_IDS,
    behavior:
      'The authenticated Target118 useManagePlugins hook synchronously publishes themes from the just-loaded enabled plugin set, records the resulting theme_count in successful startup telemetry, and records zero on the failure path. Removing exactly that loader call and the two theme_count fields yields the complete Target117 hook after identifier and expression-sequence normalization, and Target119 retains the complete Target118 unit. Recovered source contains a later asynchronous no-argument theme loader API and no exact theme-count call graph, so this is a static whole-unit admission and never authorizes a partial replay.',
  }),
])
