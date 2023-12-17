#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const caseRoot = path.join(repo, 'recovery/cases/2.1.119-to-2.1.120')
const priorManifestPath = path.join(
  repo,
  'recovery/cases/2.1.118-to-2.1.119/manifest.json',
)
const draftPath = path.join(caseRoot, 'manifest.non-source-draft.json')
const freezePath = path.join(caseRoot, 'freeze-index.json')

const frozenPaths = [
  'binary-extraction/bun-graph.txt',
  'binary-extraction/inventory.json',
  'binary-extraction/native-package-members.json',
  'diff/audio-capture.js.zstd-delta',
  'diff/cli.js.zstd-delta',
  'diff/image-processor.js.zstd-delta',
  'diff/metadata.json',
  'diff/package.json.zstd-delta',
  'evidence/CHANGELOG-2.1.120.md',
  'evidence/claude-code-CHANGELOG-c3933441.md',
  'evidence/provenance.json',
  'package-members.json',
]

const expectedFrozenSha256 = new Map([
  ['binary-extraction/bun-graph.txt', 'f78e5b90b3fe42ded9e5620bbe34856750bc1290fab7010329b2564ba562bc6a'],
  ['binary-extraction/inventory.json', 'a28b5c6ffd7101c1ee5716024577cc89e356f2f0e076a6c5f9a708d619fb4f27'],
  ['binary-extraction/native-package-members.json', 'e51202ef6803b112c71d2e32e2805225b78803d112eae55620f225d54b509eb7'],
  ['diff/audio-capture.js.zstd-delta', '216480718fe07232d1ee3971898da4c855f2e14c30dc5a4b0345db23be25b484'],
  ['diff/cli.js.zstd-delta', '182523f7a68bc84d5789e1ef508a6ae12477a282682bee41bffe6f312fc8e588'],
  ['diff/image-processor.js.zstd-delta', '1ebc3d045f9c5d27ad92b877c5d164c672ff0b48ff0a458707a9173605490489'],
  ['diff/metadata.json', '0b88cc193abdbc1e70682f57f7740b7a9a5e1595b2fd84bb8805773ca2151a23'],
  ['diff/package.json.zstd-delta', 'ad53f612329038c981dd4d1d397585f6344ebca93338b6126bcabbf08507672b'],
  ['evidence/CHANGELOG-2.1.120.md', '75a3c8095663ecec2e2e85d304958a9e8fe12b0e540b4eea6ce207facf88e1a5'],
  ['evidence/claude-code-CHANGELOG-c3933441.md', '7859f1bbcb8bc46d2ded13c69100a227644c277d778964eca2216b162a678640'],
  ['evidence/provenance.json', 'b19ec8e6c9b6478c0767dd9c3266ad1c0374a28c65d0cea8bd1a2c0ede7c1b22'],
  ['package-members.json', '0ab0856e6c12b6d545f81f225b3560aa6c314a3af6e4c8c8e14f6aa669e5d913'],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(caseRoot, relative), 'utf8'))
}

function assertion(relative) {
  const value = fs.readFileSync(path.join(caseRoot, relative))
  return { path: relative, bytes: value.length, sha256: sha256(value) }
}

function framedTree(files) {
  const hash = crypto.createHash('sha256')
  for (const file of files) {
    hash
      .update(file.path)
      .update('\0')
      .update(String(file.bytes))
      .update('\0')
      .update(file.sha256)
      .update('\n')
  }
  return hash.digest('hex')
}

function packageFramedTree(members) {
  const hash = crypto.createHash('sha256')
  for (const member of members) {
    if (member.target === null) continue
    hash
      .update(member.path)
      .update('\0')
      .update(member.target.mode)
      .update('\0')
      .update(member.target.sha256)
      .update('\0')
  }
  return hash.digest('hex')
}

function renamePriorArtifact(priorArtifacts, id, newId, argument) {
  const value = clone(priorArtifacts.get(id))
  assert(value !== undefined, `missing prior artifact: ${id}`)
  value.id = newId
  value.argument = argument
  return value
}

const prior = JSON.parse(fs.readFileSync(priorManifestPath, 'utf8'))
const priorArtifacts = new Map(prior.artifacts.map(value => [value.id, value]))
const packageMembers = readJson('package-members.json')
const nativePackageMembers = readJson(
  'binary-extraction/native-package-members.json',
)
const nativeInventory = readJson('binary-extraction/inventory.json')
const provenance = readJson('evidence/provenance.json')
const exactDelta = readJson('diff/metadata.json')
const attribution = readJson('attribution/summary.json')
const readable = readJson('readable-diff/metadata.json')
const structuralBytes = fs.readFileSync(
  path.join(caseRoot, 'structural/generated-delta.json.gz'),
)
const structural = JSON.parse(zlib.gunzipSync(structuralBytes))

assert(provenance.release === '2.1.120', 'provenance release mismatch')
assert(
  provenance.publicationAdjacency.baseline === '2.1.119' &&
    provenance.publicationAdjacency.targetIsNextPublishedVersion === true,
  'publication adjacency mismatch',
)
assert(provenance.changelog.bulletCount === 22, 'official bullet count mismatch')
assert(packageMembers.summary.complete === true, 'wrapper comparison incomplete')
assert(
  packageMembers.summary.unchanged === 6 &&
    packageMembers.summary.changed === 1 &&
    packageMembers.summary.added === 0 &&
    packageMembers.summary.removed === 0,
  'wrapper member classification mismatch',
)
assert(
  nativePackageMembers.summary.complete === true &&
    nativePackageMembers.summary.unchanged === 2 &&
    nativePackageMembers.summary.changed === 2,
  'native member classification mismatch',
)
assert(exactDelta.totalPayloadBytes === 2489050, 'exact delta total mismatch')
assert(
  nativeInventory.artifact.sha256 ===
    '12c0d6eb6d39dc2597fd131d8ea4f12ed8bf25b47dadd9173878e6d025959c9f' &&
    nativeInventory.derivedAnalyzableCli.inner.sha256 ===
      'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f',
  'native inventory identity mismatch',
)
assert(
  attribution.coverage.accountedTargetUtf16 === 13784743 &&
    attribution.coverage.unaccountedTargetUtf16 === 0 &&
    attribution.coverage.targetRangeCount === 58345,
  'attribution coverage mismatch',
)
assert(
  structural.target.sha256 ===
    'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f' &&
    structural.target.tokenCount === 4331872 &&
    structural.target.unitCount === 22020,
  'structural identity mismatch',
)
assert(
  readable.verification.comparisonInvariantHashesEqual === true &&
    readable.inputs.target.sha256 ===
      'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f',
  'readable diff identity mismatch',
)

const freezeFiles = frozenPaths.map(relative => {
  const value = assertion(relative)
  assert(
    value.sha256 === expectedFrozenSha256.get(relative),
    `frozen identity mismatch: ${relative}`,
  )
  return value
})
const freezeIndex = {
  schemaVersion: 1,
  case: '2.1.119-to-2.1.120',
  kind: 'authenticated-non-source-recovery-freeze',
  summary: {
    files: freezeFiles.length,
    bytes: freezeFiles.reduce((sum, file) => sum + file.bytes, 0),
  },
  files: freezeFiles,
}
fs.writeFileSync(freezePath, `${JSON.stringify(freezeIndex, null, 2)}\n`)

const baselineTarball = renamePriorArtifact(
  priorArtifacts,
  'targetTarball',
  'baselineTarball',
  'baseline-tarball',
)
const baselineDeclarations = renamePriorArtifact(
  priorArtifacts,
  'targetDeclarations',
  'baselineDeclarations',
  'baseline-dts',
)
baselineDeclarations.archive = 'baselineTarball'
const baselinePackageJson = renamePriorArtifact(
  priorArtifacts,
  'targetPackageJson',
  'baselinePackageJson',
  'baseline-package-json',
)
baselinePackageJson.archive = 'baselineTarball'
const baselineInstall = renamePriorArtifact(
  priorArtifacts,
  'targetInstall',
  'baselineInstall',
  'baseline-install',
)
baselineInstall.archive = 'baselineTarball'
const baselinePlatformTarball = renamePriorArtifact(
  priorArtifacts,
  'targetPlatformTarball',
  'baselinePlatformTarball',
  'baseline-platform-tarball',
)
const baselineExecutable = renamePriorArtifact(
  priorArtifacts,
  'targetExecutable',
  'baselineExecutable',
  'baseline-executable',
)
baselineExecutable.archive = 'baselinePlatformTarball'
const baselineBundle = renamePriorArtifact(
  priorArtifacts,
  'targetBundle',
  'baselineBundle',
  'baseline',
)
baselineBundle.byteSlice.sourceArtifact = 'baselineExecutable'
const baselineAnalyzableBundle = renamePriorArtifact(
  priorArtifacts,
  'targetAnalyzableBundle',
  'baselineAnalyzableBundle',
  'baseline-analyzable',
)
baselineAnalyzableBundle.byteSlice.sourceArtifact = 'baselineBundle'
const baselineImageProcessorJs = renamePriorArtifact(
  priorArtifacts,
  'targetImageProcessorJs',
  'baselineImageProcessorJs',
  'baseline-image-js',
)
baselineImageProcessorJs.byteSlice.sourceArtifact = 'baselineExecutable'
const baselineAudioCaptureJs = renamePriorArtifact(
  priorArtifacts,
  'targetAudioCaptureJs',
  'baselineAudioCaptureJs',
  'baseline-audio-js',
)
baselineAudioCaptureJs.byteSlice.sourceArtifact = 'baselineExecutable'

const targetArtifacts = [
  {
    id: 'targetTarball',
    argument: 'target-tarball',
    localPath: '2.1.120/package.tgz',
    bytes: 13541,
    sha256: '9bca5e08cdd8418a7cfac44f75f7fb4f6e160caefcf6bad423a134cc6fdc4494',
    url: 'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.120.tgz',
  },
  {
    id: 'targetDeclarations',
    argument: 'target-dts',
    archive: 'targetTarball',
    archiveMember: 'package/sdk-tools.d.ts',
    localPath: '2.1.120/package/sdk-tools.d.ts',
    bytes: 117452,
    sha256: '8f907e0e9fd160b857d25881375f73f1bddd3642d372ad52ea71d7ff441f3ddf',
  },
  {
    id: 'targetPackageJson',
    argument: 'target-package-json',
    archive: 'targetTarball',
    archiveMember: 'package/package.json',
    localPath: '2.1.120/package/package.json',
    bytes: 1476,
    sha256: 'cf10ef98e4e3699b457c08cb04842902aa1004d1f6e9131d00c9ef9856b35106',
  },
  {
    id: 'targetInstall',
    argument: 'target-install',
    archive: 'targetTarball',
    archiveMember: 'package/install.cjs',
    localPath: '2.1.120/package/install.cjs',
    bytes: 6307,
    sha256: '574cb5fd945d2adba5901a9ae508b62ca539e5a91dcd877840fc174844ed79d2',
  },
  {
    id: 'targetPlatformTarball',
    argument: 'target-platform-tarball',
    localPath: '2.1.120-linux-x64/package.tgz',
    bytes: 76473493,
    sha256: '5d1c7dd861d8d8fff0593a4fc9e8f163c2e4c01cca914c159ef25591b4740131',
    url: 'https://registry.npmjs.org/@anthropic-ai/claude-code-linux-x64/-/claude-code-linux-x64-2.1.120.tgz',
  },
  {
    id: 'targetExecutable',
    argument: 'target-executable',
    archive: 'targetPlatformTarball',
    archiveMember: 'package/claude',
    localPath: '2.1.120-linux-x64/package/claude',
    bytes: 245832320,
    sha256: '12c0d6eb6d39dc2597fd131d8ea4f12ed8bf25b47dadd9173878e6d025959c9f',
  },
  {
    id: 'targetBundle',
    argument: 'target',
    localPath: '2.1.120-linux-x64/cli.js',
    bytes: 13784833,
    sha256: '280754b3db23901e986711f11dc74536da9669c43f61999b4a84e2cf76cf1e83',
    byteSlice: {
      sourceArtifact: 'targetExecutable',
      offset: 230087480,
      bytes: 13784833,
      prefixHex: '2f2f204062756e204062797465636f6465',
    },
  },
  {
    id: 'targetAnalyzableBundle',
    argument: 'target-analyzable',
    localPath: '2.1.120-linux-x64/cli.inner.js',
    bytes: 13784743,
    sha256: 'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f',
    byteSlice: { sourceArtifact: 'targetBundle', offset: 87, bytes: 13784743 },
  },
  {
    id: 'targetCliJsc',
    argument: 'target-cli-jsc',
    localPath: '2.1.120-linux-x64/cli.jsc',
    bytes: 121412208,
    sha256: '555a0b34b8a72c5a9ed25534c55bf152cc0dd7bccf5dc89d767d84bbbde92369',
    byteSlice: {
      sourceArtifact: 'targetExecutable',
      offset: 108675200,
      bytes: 121412208,
    },
  },
  ...[
    ['targetImageProcessorJs', 'target-image-js', 'image-processor.js', 243872346, 1976, '3f8590a56cf38cd482b989149a4b0883b0b87609e63cb1e538984b9ecbc3c0c6'],
    ['targetAudioCaptureJs', 'target-audio-js', 'audio-capture.js', 243874353, 1974, '4c2249a869b9c418b76cc74a8c3400b48fdc2bff4bdbd982c35d3bf8f2b6fdcf'],
    ['targetImageProcessorNative', 'target-image-native', 'image-processor.node', 243876362, 1458656, '418c92f2e5d688ecf0fe24ab490123c7bdb6d62ca72983431244665f179a4405'],
    ['targetAudioCaptureNative', 'target-audio-native', 'audio-capture.node', 245335051, 492184, '7e89edf4dde9b69b6c55a310788ad999e2d0dd469d8a31c529cf28f3ea5e929c'],
  ].map(([id, argument, name, offset, bytes, digest]) => ({
    id,
    argument,
    localPath: `2.1.120-linux-x64/${name}`,
    bytes,
    sha256: digest,
    byteSlice: {
      sourceArtifact: 'targetExecutable',
      offset,
      bytes,
      ...(name.endsWith('.node') ? { prefixHex: '7f454c46' } : {}),
    },
  })),
]

const officialChangelog = {
  id: 'officialChangelog',
  argument: 'changelog',
  localPath: 'evidence/claude-code-CHANGELOG-c3933441.md',
  bytes: 257968,
  sha256: '7859f1bbcb8bc46d2ded13c69100a227644c277d778964eca2216b162a678640',
  url: 'https://raw.githubusercontent.com/anthropics/claude-code/c3933441f09efb3429934c2213ee29f21a55cf74/CHANGELOG.md',
}

const targetEmbeddedFiles = nativeInventory.modules
  .filter(module => module.path.endsWith('.js'))
  .map(module => ({
    path: module.path.replace('/$bunfs/root/', ''),
    bytes: module.content.bytes,
    sha256: module.content.sha256,
  }))
const targetPackageFiles = packageMembers.members
  .filter(member => member.target !== null)
  .map(member => ({
    path: member.path,
    bytes: member.target.bytes,
    sha256: member.target.sha256,
  }))
const reportAssertions = [
  'attribution/sources.jsonl.gz',
  'attribution/summary.json',
  'attribution/target-initializers.jsonl.gz',
  'attribution/target-partitions.jsonl.gz',
  'attribution/target-ranges.jsonl.gz',
  'readable-diff/metadata.json',
  'readable-diff/normalized.diff.gz',
  'readable-diff/renames.tsv',
  'readable-diff/statements.diff',
  'structural/generated-delta.json.gz',
].map(assertion)

const manifest = {
  schemaVersion: 4,
  case: '2.1.119-to-2.1.120',
  draft: {
    kind: 'authenticated-non-source-recovery',
    status: 'source-freeze-semantic-correspondence-and-final-docs-pending',
    generatedBy: 'recovery/scripts/build-2.1.120-non-source-draft.mjs',
    rule:
      'Published artifacts, exact deltas, generated attribution, structural accounting, and readable review outputs are frozen. Source-facing recovery, semantic correspondence, and final report/runbook identities remain pending.',
  },
  releaseAdjacency: {
    baseline: '2.1.119',
    target: '2.1.120',
    targetIsNextPublishedVersion: true,
    skipped: [],
    skippedVersionsAbsent: true,
    provenance: 'evidence/provenance.json',
  },
  recoveryScope: {
    platform: 'linux-x64',
    completeness: 'authenticated-generated-recovery-complete-source-and-semantic-pending',
    authoredSourceTextObservable: false,
    authenticatedNativeContainer: true,
    exactPublishedPackageTreeReconstruction: true,
    exactPublishedBundleReconstruction: true,
    exactEmbeddedJavaScriptGraphReconstruction: true,
    allTargetUtf16Accounted: true,
    allTargetTokensClassified: true,
    sourceClosurePending: true,
    semanticClosurePending: true,
  },
  artifacts: [
    baselineTarball,
    baselineDeclarations,
    baselinePackageJson,
    baselineInstall,
    ...targetArtifacts.slice(0, 4),
    baselinePlatformTarball,
    baselineExecutable,
    baselineBundle,
    baselineAnalyzableBundle,
    baselineImageProcessorJs,
    baselineAudioCaptureJs,
    ...targetArtifacts.slice(4),
    clone(priorArtifacts.get('sourceOracleBundle')),
    clone(priorArtifacts.get('sourceOracleMap')),
    officialChangelog,
  ],
  baselineOracle: clone(prior.baselineOracle),
  sourceOracle: {
    bundleArtifact: 'sourceOracleBundle',
    mapArtifact: 'sourceOracleMap',
    relationship: prior.sourceOracle.relationship,
    appliedSourceTree: { status: 'pending-source-recovery' },
  },
  sourceLineage: { status: 'pending-source-recovery-and-freeze' },
  targetAssertions: {
    declarationChange: { kind: 'unchanged' },
    packageVersionChange: { baseline: '2.1.119', target: '2.1.120' },
    packageJsonChange: { kind: 'exact-artifact' },
    bundleFragments: [],
    status: 'semantic-ledger-pending',
  },
  recoveredEdits: [],
  recoveredFileAssertions: [],
  generatedRecovery: {
    packageMembers: {
      report: 'package-members.json',
      baselineTarball: {
        bytes: baselineTarball.bytes,
        sha256: baselineTarball.sha256,
      },
      baselineMembers: packageMembers.summary.baselineMemberCount,
      targetMembers: packageMembers.summary.targetMemberCount,
      targetMemberBytes: targetPackageFiles.reduce((sum, file) => sum + file.bytes, 0),
      targetFramedTreeSha256: packageFramedTree(packageMembers.members),
      unchanged: packageMembers.summary.unchanged,
      changed: packageMembers.summary.changed,
      added: packageMembers.summary.added,
      removed: packageMembers.summary.removed,
      modeOnlyChanged: 0,
      changedMemberPayloads: [
        {
          member: 'package/package.json',
          algorithm: 'zstd-dictionary-patch',
          path: 'diff/package.json.zstd-delta',
        },
      ],
      addedMemberPayloads: [],
    },
    exactBundleDelta: {
      algorithm: 'zstd-dictionary-patch',
      path: 'diff/cli.js.zstd-delta',
      baselineArtifact: 'baselineBundle',
      targetArtifact: 'targetBundle',
      reconstructsTargetExactly: true,
    },
    embeddedCode: {
      status: 'all-plain-javascript-bun-modules-exact',
      files: [
        ['src/entrypoints/cli.js', 'baselineBundle', 'targetBundle', 'diff/cli.js.zstd-delta'],
        ['image-processor.js', 'baselineImageProcessorJs', 'targetImageProcessorJs', 'diff/image-processor.js.zstd-delta'],
        ['audio-capture.js', 'baselineAudioCaptureJs', 'targetAudioCaptureJs', 'diff/audio-capture.js.zstd-delta'],
      ].map(([file, baselineArtifact, targetArtifact, payload]) => ({
        path: file,
        algorithm: 'zstd-dictionary-patch',
        baselineArtifact,
        targetArtifact,
        payload,
      })),
      targetFiles: targetEmbeddedFiles.length,
      targetBytes: targetEmbeddedFiles.reduce((sum, file) => sum + file.bytes, 0),
      targetFramedTreeSha256: framedTree(targetEmbeddedFiles),
    },
    bunExtraction: {
      status: 'authenticated-linux-x64-bun-graph',
      inventory: 'binary-extraction/inventory.json',
      discoveryOutput: 'binary-extraction/bun-graph.txt',
      executableArtifact: 'targetExecutable',
      analyzableArtifact: 'targetAnalyzableBundle',
      moduleArtifacts: [
        { index: 0, contentArtifact: 'targetBundle', jscArtifact: 'targetCliJsc' },
        { index: 1, contentArtifact: 'targetImageProcessorJs' },
        { index: 2, contentArtifact: 'targetAudioCaptureJs' },
        { index: 3, contentArtifact: 'targetImageProcessorNative' },
        { index: 4, contentArtifact: 'targetAudioCaptureNative' },
      ],
    },
    attribution: {
      status: 'authenticated-inputs-exhaustively-accounted',
      directory: 'attribution',
      baselineArtifact: 'sourceOracleBundle',
      sourceMapArtifact: 'sourceOracleMap',
      targetArtifact: 'targetAnalyzableBundle',
      offsetUnit: 'utf16-code-units',
      targetUtf16: attribution.coverage.targetUtf16,
      accountedTargetUtf16: attribution.coverage.accountedTargetUtf16,
      unaccountedTargetUtf16: attribution.coverage.unaccountedTargetUtf16,
      targetRanges: 'attribution/target-ranges.jsonl.gz',
      targetRangeCount: attribution.coverage.targetRangeCount,
      targetRangeUtf16: attribution.coverage.targetRangeUtf16,
    },
    structural: {
      status: 'authenticated-inputs-exhaustively-accounted',
      ledger: 'structural/generated-delta.json.gz',
      baselineArtifact: 'baselineAnalyzableBundle',
      targetArtifact: 'targetAnalyzableBundle',
      targetUnits: structural.target.unitCount,
      targetTokens: structural.target.tokenCount,
      matchedTokens: structural.coverage.tokens.matched,
      movedCandidateTokens: structural.coverage.tokens.moved,
      coarseChangedTokens: structural.coverage.tokens.changed,
      unresolvedTokens: structural.coverage.tokens.unresolved,
      exactStructuralFraction: structural.coverage.tokens.exactStructuralFraction,
      resolvedStructuralFraction: structural.coverage.tokens.resolvedFraction,
    },
    readableDiff: {
      status: 'authenticated-inputs-invariant-preserving',
      directory: 'readable-diff',
      comparisonInvariantHashesEqual:
        readable.verification.comparisonInvariantHashesEqual,
      metadata: 'readable-diff/metadata.json',
      fullDiff: 'readable-diff/normalized.diff.gz',
      baselineArtifact: 'baselineAnalyzableBundle',
      targetArtifact: 'targetAnalyzableBundle',
    },
    semanticCorrespondence: {
      status: 'pending-source-and-semantic-closure',
      required: [
        'semantic/README.md',
        'semantic/obligations.json',
        'semantic/semantic-correspondence.json.gz',
        'semantic/summary.json',
      ],
    },
    fileAssertions: [...freezeFiles, ...reportAssertions],
  },
  nonSourceFreeze: {
    index: 'freeze-index.json',
    indexBytes: fs.statSync(freezePath).size,
    indexSha256: sha256(fs.readFileSync(freezePath)),
    files: freezeIndex.summary.files,
    bytes: freezeIndex.summary.bytes,
    verified: true,
    generatedReportAssertions: reportAssertions,
  },
  pendingSourceClosure: {
    status: 'source-and-semantic-correspondence-pending',
    manifestFields: [
      'recoveryScope.completeness and final unresolved claim',
      'sourceOracle.appliedSourceTree',
      'sourceLineage',
      'targetAssertions.bundleFragments',
      'recoveredEdits',
      'recoveredFileAssertions',
      'generatedRecovery.semanticCorrespondence',
      'sourceFreeze',
      'finalization',
    ],
    caseFiles: [
      'RECOVERY_RUNBOOK.md',
      'REPORT.md',
      'semantic/README.md',
      'semantic/obligations.json',
      'semantic/semantic-correspondence.json.gz',
      'semantic/summary.json',
      'recovered/source-facing-overlay.patch',
      'recovered/source-freeze/*',
    ],
  },
}

fs.writeFileSync(draftPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(
  JSON.stringify({
    status: 'non-source-draft-built',
    path: path.relative(repo, draftPath),
    bytes: fs.statSync(draftPath).size,
    sha256: sha256(fs.readFileSync(draftPath)),
    artifacts: manifest.artifacts.length,
    frozenFiles: freezeIndex.summary.files,
    frozenBytes: freezeIndex.summary.bytes,
    reportAssertions: reportAssertions.length,
    pending: manifest.pendingSourceClosure.status,
  }),
)
