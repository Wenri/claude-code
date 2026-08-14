#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const caseRoot = path.join(repo, 'recovery/cases/2.1.120-to-2.1.121')
const priorManifestPath = path.join(
  repo,
  'recovery/cases/2.1.119-to-2.1.120/manifest.json',
)

function usage() {
  console.error(
    'Usage: build-2.1.121-non-source-draft.mjs --artifacts DIR',
  )
}

function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== '--artifacts') {
    usage()
    throw new Error('Expected exactly --artifacts DIR')
  }
  return { artifacts: path.resolve(argv[1]) }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function evidence(filename) {
  const value = fs.readFileSync(filename)
  return { bytes: value.length, sha256: sha256(value) }
}

function assertion(relative) {
  return { path: relative, ...evidence(path.join(caseRoot, relative)) }
}

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(caseRoot, relative), 'utf8'))
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function renamePriorArtifact(priorArtifacts, id, newId, argument) {
  const artifact = clone(priorArtifacts.get(id))
  assert(artifact !== undefined, `Missing prior artifact: ${id}`)
  artifact.id = newId
  artifact.argument = argument
  return artifact
}

function moduleArtifact(inventory, index, id, argument, localPath, source) {
  const module = inventory.modules[index]
  assert(module !== undefined, `Missing Bun module ${index}`)
  const pointer = source === 'jsc' ? module.jsc : module.content
  assert(pointer !== undefined, `Missing Bun module ${index} ${source}`)
  const artifact = {
    id,
    argument,
    localPath,
    bytes: pointer.bytes,
    sha256: pointer.sha256,
    byteSlice: {
      sourceArtifact: 'targetExecutable',
      offset: pointer.actualFileOffset,
      bytes: pointer.bytes,
    },
  }
  if (module.kind === 'elf') artifact.byteSlice.prefixHex = '7f454c46'
  return artifact
}

function framedTree(records) {
  const hash = crypto.createHash('sha256')
  for (const record of [...records].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  )) {
    hash
      .update(record.path)
      .update('\0')
      .update(record.mode ?? '')
      .update('\0')
      .update(record.sha256)
      .update('\0')
  }
  return hash.digest('hex')
}

function embeddedFramedTree(records) {
  const hash = crypto.createHash('sha256')
  for (const record of records) {
    hash
      .update(record.path)
      .update('\0')
      .update(String(record.bytes))
      .update('\0')
      .update(record.sha256)
      .update('\n')
  }
  return hash.digest('hex')
}

function reportFiles() {
  const prefixes = [
    'attribution',
    'binary-extraction',
    'diff',
    'evidence',
    'readable-diff',
    'structural',
  ]
  const files = ['package-members.json']
  for (const prefix of prefixes) {
    const root = path.join(caseRoot, prefix)
    for (const entry of fs.readdirSync(root, { recursive: true })) {
      const filename = path.join(root, entry)
      if (fs.statSync(filename).isFile()) {
        files.push(path.posix.join(prefix, entry.split(path.sep).join('/')))
      }
    }
  }
  return files.sort().map(assertion)
}

function main() {
  const args = parseArguments(process.argv.slice(2))
  const prior = JSON.parse(fs.readFileSync(priorManifestPath, 'utf8'))
  const priorArtifacts = new Map(prior.artifacts.map(value => [value.id, value]))
  const inventory = readJson('binary-extraction/inventory.json')
  const packageMembers = readJson('package-members.json')
  const exactDelta = readJson('diff/metadata.json')
  const attribution = readJson('attribution/summary.json')
  const readable = readJson('readable-diff/metadata.json')
  const structural = JSON.parse(
    zlib.gunzipSync(
      fs.readFileSync(path.join(caseRoot, 'structural/generated-delta.json.gz')),
    ),
  )

  assert(inventory.artifact.version === '2.1.121', 'Bun inventory version mismatch')
  assert(packageMembers.summary.complete === true, 'Package comparison incomplete')
  const changedPackageMembers = packageMembers.members.filter(
    member => member.status === 'changed',
  )
  assert(
    changedPackageMembers.length === 1 &&
      changedPackageMembers[0].path === 'package/package.json',
    'unexpected changed package members',
  )
  assert(
    packageMembers.members.every(member => member.status !== 'added'),
    'unexpected added package member',
  )
  const packageDelta = exactDelta.files.find(file => file.path === 'package.json')
  assert(
    packageDelta?.baseline.sha256 === changedPackageMembers[0].baseline.sha256 &&
      packageDelta?.target.sha256 === changedPackageMembers[0].target.sha256 &&
      packageDelta?.payload.path === 'diff/package.json.zstd-delta',
    'package.json delta identity',
  )
  assert(attribution.coverage.unaccountedTargetUtf16 === 0, 'Attribution gap')
  assert(
    readable.verification.comparisonInvariantHashesEqual === true,
    'Readable diff changed target invariant',
  )
  assert(structural.target.failureCount === 0, 'Structural parse failure')

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

  const targetBundle = moduleArtifact(
    inventory,
    0,
    'targetBundle',
    'target',
    '2.1.121-linux-x64/cli.js',
    'content',
  )
  targetBundle.byteSlice.prefixHex = '2f2f204062756e204062797465636f6465'
  const artifacts = [
    baselineTarball,
    baselineDeclarations,
    baselinePackageJson,
    baselineInstall,
    {
      id: 'targetTarball',
      argument: 'target-tarball',
      localPath: '2.1.121/package.tgz',
      bytes: 13541,
      sha256: 'fbb28f31d803d5cebafa8a5b95475df6ef152c219609940a3edd194b558a3460',
      url: 'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.121.tgz',
    },
    {
      id: 'targetDeclarations',
      argument: 'target-dts',
      archive: 'targetTarball',
      archiveMember: 'package/sdk-tools.d.ts',
      localPath: '2.1.121/package/sdk-tools.d.ts',
      bytes: 117452,
      sha256: '8f907e0e9fd160b857d25881375f73f1bddd3642d372ad52ea71d7ff441f3ddf',
    },
    {
      id: 'targetPackageJson',
      argument: 'target-package-json',
      archive: 'targetTarball',
      archiveMember: 'package/package.json',
      localPath: '2.1.121/package/package.json',
      bytes: 1476,
      sha256: '83eb99fd29fb46e03642f2ca2481c5f2eb5c7141607d407a7b06069362ddd6bd',
    },
    {
      id: 'targetInstall',
      argument: 'target-install',
      archive: 'targetTarball',
      archiveMember: 'package/install.cjs',
      localPath: '2.1.121/package/install.cjs',
      bytes: 6307,
      sha256: '574cb5fd945d2adba5901a9ae508b62ca539e5a91dcd877840fc174844ed79d2',
    },
    baselinePlatformTarball,
    baselineExecutable,
    baselineBundle,
    baselineAnalyzableBundle,
    baselineImageProcessorJs,
    baselineAudioCaptureJs,
    {
      id: 'targetPlatformTarball',
      argument: 'target-platform-tarball',
      localPath: '2.1.121-linux-x64/package.tgz',
      bytes: 76841856,
      sha256: '2ebb9e97a98009f4cd557b132c5fdc4dc3fb5ddf4bb8c6db138e71870ba96133',
      url: 'https://registry.npmjs.org/@anthropic-ai/claude-code-linux-x64/-/claude-code-linux-x64-2.1.121.tgz',
    },
    {
      id: 'targetExecutable',
      argument: 'target-executable',
      archive: 'targetPlatformTarball',
      archiveMember: 'package/claude',
      localPath: '2.1.121-linux-x64/package/claude',
      bytes: inventory.artifact.bytes,
      sha256: inventory.artifact.sha256,
    },
    targetBundle,
    {
      id: 'targetAnalyzableBundle',
      argument: 'target-analyzable',
      localPath: '2.1.121-linux-x64/cli.inner.js',
      bytes: inventory.derivedAnalyzableCli.inner.bytes,
      sha256: inventory.derivedAnalyzableCli.inner.sha256,
      byteSlice: {
        sourceArtifact: 'targetBundle',
        offset: inventory.derivedAnalyzableCli.wrapperPrefixBytes,
        bytes: inventory.derivedAnalyzableCli.inner.bytes,
      },
    },
    moduleArtifact(
      inventory,
      0,
      'targetCliJsc',
      'target-cli-jsc',
      '2.1.121-linux-x64/cli.jsc',
      'jsc',
    ),
    moduleArtifact(
      inventory,
      1,
      'targetImageProcessorJs',
      'target-image-js',
      '2.1.121-linux-x64/image-processor.js',
      'content',
    ),
    moduleArtifact(
      inventory,
      2,
      'targetAudioCaptureJs',
      'target-audio-js',
      '2.1.121-linux-x64/audio-capture.js',
      'content',
    ),
    moduleArtifact(
      inventory,
      3,
      'targetImageProcessorNative',
      'target-image-native',
      '2.1.121-linux-x64/image-processor.node',
      'content',
    ),
    moduleArtifact(
      inventory,
      4,
      'targetAudioCaptureNative',
      'target-audio-native',
      '2.1.121-linux-x64/audio-capture.node',
      'content',
    ),
    clone(priorArtifacts.get('sourceOracleBundle')),
    clone(priorArtifacts.get('sourceOracleMap')),
    {
      id: 'officialChangelog',
      argument: 'changelog',
      localPath: 'evidence/claude-code-CHANGELOG-15862041.md',
      bytes: 262246,
      sha256: 'fdb8520ed27409773cfc82a75502e35c69b523e5bb425e9ab3b456abf401e2a6',
      url: 'https://raw.githubusercontent.com/anthropics/claude-code/158620419486e3d2d696351d5a71fbd6b8f58653/CHANGELOG.md',
    },
  ]

  const embeddedArtifacts = [
    artifacts.find(item => item.id === 'targetBundle'),
    artifacts.find(item => item.id === 'targetImageProcessorJs'),
    artifacts.find(item => item.id === 'targetAudioCaptureJs'),
  ]
  for (const artifact of artifacts) {
    const filename = path.join(args.artifacts, artifact.localPath)
    const actual = evidence(filename)
    assert(actual.bytes === artifact.bytes, `${artifact.id} byte mismatch`)
    assert(actual.sha256 === artifact.sha256, `${artifact.id} SHA-256 mismatch`)
  }
  const fileAssertions = reportFiles()
  const freeze = {
    schemaVersion: 1,
    case: '2.1.120-to-2.1.121',
    kind: 'authenticated-non-source-recovery-freeze',
    summary: {
      files: fileAssertions.length,
      bytes: fileAssertions.reduce((sum, file) => sum + file.bytes, 0),
    },
    files: fileAssertions,
  }
  fs.writeFileSync(
    path.join(caseRoot, 'freeze-index.json'),
    `${JSON.stringify(freeze, null, 2)}\n`,
  )
  const freezeEvidence = evidence(path.join(caseRoot, 'freeze-index.json'))
  const targetMembers = packageMembers.members
    .filter(member => member.target !== null)
    .map(member => ({
      path: member.path,
      mode: member.target.mode,
      sha256: member.target.sha256,
    }))

  const draft = {
    schemaVersion: 4,
    case: '2.1.120-to-2.1.121',
    draft: {
      kind: 'authenticated-non-source-recovery',
      status: 'source-freeze-semantic-correspondence-and-final-docs-pending',
      generatedBy: 'recovery/scripts/build-2.1.121-non-source-draft.mjs',
      rule:
        'Published artifacts, exact deltas, generated attribution, structural accounting, and readable review outputs are frozen. Source-facing recovery and semantic closure remain pending.',
    },
    releaseAdjacency: {
      baseline: '2.1.120',
      target: '2.1.121',
      targetIsNextPublishedVersion: true,
      skipped: [],
      skippedVersionsAbsent: true,
      provenance: 'evidence/provenance.json',
    },
    recoveryScope: {
      platform: 'linux-x64',
      completeness:
        'authenticated-generated-recovery-complete-source-and-semantic-pending',
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
    artifacts,
    sourceOracle: {
      bundleArtifact: 'sourceOracleBundle',
      mapArtifact: 'sourceOracleMap',
      relationship:
        'The matching 2.1.88 bundle/map pair supplies exact historical source ownership only. The authenticated 2.1.120 and 2.1.121 Linux x64 Bun CLI interiors are the adjacent generated comparison.',
      appliedSourceTree: { status: 'pending-source-recovery' },
    },
    sourceLineage: { status: 'pending-source-recovery-and-freeze' },
    generatedRecovery: {
      packageMembers: {
        report: 'package-members.json',
        baselineTarball: {
          bytes: packageMembers.artifacts.baseline.compressedBytes,
          sha256: packageMembers.artifacts.baseline.sha256,
        },
        targetMembers: packageMembers.summary.targetMemberCount,
        targetMemberBytes: packageMembers.artifacts.target.unpackedMemberBytes,
        targetFramedTreeSha256: framedTree(targetMembers),
        ...packageMembers.summary,
        changedMemberPayloads: [
          {
            member: 'package/package.json',
            algorithm: exactDelta.algorithm,
            path: packageDelta.payload.path,
          },
        ],
        addedMemberPayloads: [],
      },
      exactBundleDelta: {
        algorithm: exactDelta.algorithm,
        path: exactDelta.files[0].payload.path,
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
          algorithm: exactDelta.algorithm,
          baselineArtifact,
          targetArtifact,
          payload,
        })),
        targetFiles: embeddedArtifacts.length,
        targetBytes: embeddedArtifacts.reduce((sum, item) => sum + item.bytes, 0),
        targetFramedTreeSha256: embeddedFramedTree(
          embeddedArtifacts.map((item, index) => ({
            path: ['src/entrypoints/cli.js', 'image-processor.js', 'audio-capture.js'][index],
            bytes: item.bytes,
            sha256: item.sha256,
          })),
        ),
      },
      bunExtraction: {
        status: 'authenticated-linux-x64-bun-footer-directory',
        inventory: 'binary-extraction/inventory.json',
        extractor: 'recovery/scripts/inspect-bun-container.mjs',
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
        exactStructuralFraction:
          structural.coverage.tokens.exactStructuralFraction,
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
      },
      fileAssertions,
    },
    nonSourceFreeze: {
      index: 'freeze-index.json',
      ...freezeEvidence,
      files: freeze.summary.files,
      frozenBytes: freeze.summary.bytes,
      verified: true,
    },
    pendingSourceClosure: {
      status: 'source-and-semantic-correspondence-pending',
      caseFiles: [
        'RECOVERY_RUNBOOK.md',
        'REPORT.md',
        'semantic/*',
        'recovered/source-facing-overlay.patch',
        'recovered/source-freeze/*',
      ],
    },
  }
  fs.writeFileSync(
    path.join(caseRoot, 'manifest.non-source-draft.json'),
    `${JSON.stringify(draft, null, 2)}\n`,
  )
  console.log(
    JSON.stringify({
      case: draft.case,
      artifacts: artifacts.length,
      frozenFiles: freeze.summary.files,
      attribution: draft.generatedRecovery.attribution,
      structural: draft.generatedRecovery.structural,
    }, null, 2),
  )
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
}
