const CASE_NAME = '2.1.118-to-2.1.119'
const TARGET_FRAGMENT_EVIDENCE =
  'target119-secondary-static-owner-target-fragment'
const SOURCE_COMPILER_EVIDENCE =
  'target119-secondary-static-owner-source-compiler-test'

function override(targetIndex, ownerPath, behavior) {
  return Object.freeze({
    key: `${CASE_NAME}:${targetIndex}`,
    targetIndex,
    paths: Object.freeze([ownerPath]),
    evidenceIds: Object.freeze([
      TARGET_FRAGMENT_EVIDENCE,
      SOURCE_COMPILER_EVIDENCE,
    ]),
    behavior,
  })
}

export const TARGET119_SECONDARY_STATIC_OWNER_OVERRIDES = Object.freeze([
  override(
    18804,
    'src/commands.ts',
    'The authenticated Target119 commands module initializer lowers the named stopNonInteractive import to one namespace-member access while BRIDGE_SAFE_COMMANDS retains the authored binding; this residue is compiler import lowering in the already-correct source owner.',
  ),
  override(
    19021,
    'src/utils/permissions/filesystem.ts',
    'The authenticated Target119 filesystem module initializer lowers the named randomBytes import inside getBundledSkillsRoot and expands the exact pinned build metadata object used for MACRO.VERSION; all four residues are compiler/build representation in the already-correct source owner.',
  ),
  override(
    19931,
    'src/hooks/useDiffInIDE.ts',
    'The authenticated Target119 useDiffInIDE declaration lowers its named basename import to one namespace-member call; the residue is compiler import lowering in the already-correct source owner.',
  ),
  override(
    20710,
    'src/utils/skills/skillChangeDetector.ts',
    "The authenticated Target119 USE_POLLING declaration minifies the exact authored typeof Bun !== 'undefined' comparison to the equivalent typeof Bun < 'u' form; the string residue is compiler representation in the already-correct source owner.",
  ),
  override(
    20891,
    'src/utils/plugins/officialMarketplaceStartupCheck.ts',
    'The authenticated Target119 checkAndInstallOfficialMarketplace declaration lowers its named join import to one namespace-member call; the residue is compiler import lowering in the already-correct source owner.',
  ),
  override(
    21145,
    'src/utils/cronTasksLock.ts',
    'The authenticated Target119 LOCK_FILE_REL initializer lowers its named join import to one namespace-member call over the exact authored lock-path literals; the residue is compiler import lowering in the already-correct source owner.',
  ),
  override(
    21213,
    'src/utils/githubRepoPathMapping.ts',
    'The authenticated Target119 updateGithubRepoPathMapping declaration lowers its named realpath import to one namespace-member call; the residue is compiler import lowering in the already-correct source owner.',
  ),
])

export const TARGET119_SECONDARY_STATIC_PROOF_SPECS = Object.freeze([
  Object.freeze({
    targetIndex: 18804,
    scopeName: 'BRIDGE_SAFE_COMMANDS',
    representations: Object.freeze([
      Object.freeze({
        kind: 'property',
        value: 'stopNonInteractive',
        representation: 'named-import-member-lowering',
        module: './commands/stop/index.js',
        importedName: 'stopNonInteractive',
      }),
    ]),
  }),
  Object.freeze({
    targetIndex: 19021,
    scopeName: 'getBundledSkillsRoot',
    representations: Object.freeze([
      Object.freeze({
        kind: 'property',
        value: 'randomBytes',
        representation: 'named-import-member-lowering',
        module: 'crypto',
        importedName: 'randomBytes',
      }),
      Object.freeze({
        kind: 'string',
        value: '2.1.119',
        representation: 'build-metadata-object-expansion',
      }),
      Object.freeze({
        kind: 'string',
        value: '2026-04-23T19:08:52Z',
        representation: 'build-metadata-object-expansion',
      }),
      Object.freeze({
        kind: 'string',
        value: '6f68554839756189e277b8285a18fe47acd9a5a1',
        representation: 'build-metadata-object-expansion',
      }),
    ]),
  }),
  Object.freeze({
    targetIndex: 19931,
    scopeName: 'useDiffInIDE',
    representations: Object.freeze([
      Object.freeze({
        kind: 'property',
        value: 'basename',
        representation: 'named-import-member-lowering',
        module: 'path',
        importedName: 'basename',
      }),
    ]),
  }),
  Object.freeze({
    targetIndex: 20710,
    scopeName: 'USE_POLLING',
    representations: Object.freeze([
      Object.freeze({
        kind: 'string',
        value: 'u',
        representation: 'minified-typeof-undefined',
      }),
    ]),
  }),
  Object.freeze({
    targetIndex: 20891,
    scopeName: 'checkAndInstallOfficialMarketplace',
    representations: Object.freeze([
      Object.freeze({
        kind: 'property',
        value: 'join',
        representation: 'named-import-member-lowering',
        module: 'path',
        importedName: 'join',
      }),
    ]),
  }),
  Object.freeze({
    targetIndex: 21145,
    scopeName: 'LOCK_FILE_REL',
    representations: Object.freeze([
      Object.freeze({
        kind: 'property',
        value: 'join',
        representation: 'named-import-member-lowering',
        module: 'path',
        importedName: 'join',
      }),
    ]),
  }),
  Object.freeze({
    targetIndex: 21213,
    scopeName: 'updateGithubRepoPathMapping',
    representations: Object.freeze([
      Object.freeze({
        kind: 'property',
        value: 'realpath',
        representation: 'named-import-member-lowering',
        module: 'fs/promises',
        importedName: 'realpath',
      }),
    ]),
  }),
])
