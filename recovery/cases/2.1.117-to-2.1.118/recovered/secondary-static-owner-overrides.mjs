const CASE_NAME = '2.1.117-to-2.1.118'
const TARGET_FRAGMENT_EVIDENCE =
  'target118-secondary-static-owner-target-fragment'
const SOURCE_AST_EVIDENCE = 'target118-secondary-static-owner-source-ast-test'

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

export const TARGET118_SECONDARY_STATIC_OWNER_OVERRIDES = Object.freeze([
  override(
    13032,
    'src/utils/Shell.ts',
    'The authenticated Target118 shell executor cleanup is authored by exec in Shell.ts; the compiled unlinkSync property access is the named fs import used to remove the native cwd sidecar.',
  ),
  override(
    17153,
    'src/commands/passes/index.ts',
    'The authenticated Target118 passes command initializer is the authored default command object, whose hidden-state getter destructures the eligible referral result.',
  ),
  override(
    18389,
    'src/constants/prompts.ts',
    'The authenticated Target118 system-prompt unit is authored by getSystemPrompt, including the runtime CWD and session-date section for VCR mode.',
  ),
])
