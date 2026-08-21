const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_CLI_BG_MODULE_IMPORT_EVIDENCE_IDS = Object.freeze([
  'target119-cli-bg-module-initializer-whole-unit-proof',
  'target119-cli-bg-import-to-open-agents-boundary-proof',
  'target119-cli-bg-authored-source-import-proof',
  'target119-cli-bg-false-session-restore-owner-proof',
  'target119-cli-bg-cross-release-initializer-lineage-proof',
  'target119-cli-bg-static-owner-only-proof',
])

export const TARGET119_CLI_BG_MODULE_IMPORT_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:20778`,
    targetIndex: 20778,
    paths: Object.freeze(['src/cli/bg.ts']),
    declarations: Object.freeze(['openAgentsFromForeground']),
    evidenceIds: TARGET119_CLI_BG_MODULE_IMPORT_EVIDENCE_IDS,
    behavior:
      'The complete authenticated Target119 module initializer requires crypto and fs/promises into the two bindings declared immediately after openAgentsFromForeground. That adjacent function consumes those bindings only as randomUUID and rm, exactly matching the named authored imports in the new Target119 src/cli/bg.ts file. The generated src/utils/sessionRestore.ts owner is impossible: its authenticated source is unchanged from Target118, has only a type-only crypto import, and has no fs/promises import. Target120 and Target121 retain the exact initializer AST under minifier alpha-renaming. This evidence corrects the whole unit statically and never authorizes source replay.',
  }),
])
