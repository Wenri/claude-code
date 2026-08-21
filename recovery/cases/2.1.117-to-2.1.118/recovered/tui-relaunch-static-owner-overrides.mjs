const CASE_NAME = '2.1.117-to-2.1.118'
const EVIDENCE_IDS = Object.freeze([
  'target118-tui-relaunch-static-target-fragment',
  'target118-tui-relaunch-static-source-ast-test',
])

export const TARGET118_TUI_RELAUNCH_STATIC_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:17052`,
    targetIndex: 17052,
    paths: Object.freeze(['src/utils/relaunch.ts']),
    declarations: Object.freeze(['relaunch']),
    evidenceIds: EVIDENCE_IDS,
    behavior:
      'The authenticated Target118 relaunch function strips the TUI-switch and both bridge-reattach variables from the inherited environment before applying explicit overrides and dropEnv. The exact historical utils/relaunch.ts declaration owns the complete unit; the provisional theme command attribution is rejected.',
  }),
  Object.freeze({
    key: `${CASE_NAME}:17059`,
    targetIndex: 17059,
    paths: Object.freeze(['src/commands/tui/tui.ts']),
    declarations: Object.freeze(['RENDERERS']),
    evidenceIds: EVIDENCE_IDS,
    behavior:
      "The authenticated Target118 TUI module initializes the exact renderer domain ['default', 'fullscreen']. The exact historical commands/tui/tui.ts declaration owns the complete unit; the provisional theme command attribution is rejected.",
  }),
])
