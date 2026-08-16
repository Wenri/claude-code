#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const caseRoot = path.join(repo, 'recovery/cases/2.1.123-to-2.1.124')
const priorManifestPath = path.join(
  repo,
  'recovery/cases/2.1.122-to-2.1.123/manifest.json',
)
const draftPath = path.join(caseRoot, 'manifest.non-source-draft.json')
const outputPath = path.join(caseRoot, 'manifest.json')
const sourceLineagePath = path.join(
  caseRoot,
  'recovered/source-lineage-core.json',
)
const sourceFreezeRoot = path.join(caseRoot, 'recovered/source-freeze')
const sourceIdentityPath = path.join(sourceFreezeRoot, 'identity.json')
const obligationsPath = path.join(caseRoot, 'semantic/obligations.json')
const directEvidencePath = path.join(caseRoot, 'semantic/direct-evidence.json')
const semanticReportPath = path.join(
  caseRoot,
  'semantic/semantic-correspondence.json.gz',
)
const semanticSummaryPath = path.join(caseRoot, 'semantic/summary.json')
const knownDeltaProofPath = path.join(
  caseRoot,
  'structural/known-delta-proof.json',
)
// Replaced by the exact-identity seal after the semantic proof freezes. Zero
// identities keep final manifest construction fail-closed in the meantime.
const expectedStructuralArtifacts = {
  rawLedger: {
    path: 'structural/generated-delta.json.gz',
    bytes: 0,
    sha256: '0'.repeat(64),
  },
  metadataNormalizedLedger: {
    path: 'structural/metadata-normalized-delta.json.gz',
    bytes: 0,
    sha256: '0'.repeat(64),
  },
  knownDeltaExactLedger: {
    path: 'structural/known-delta-ledger.json.gz',
    bytes: 0,
    sha256: '0'.repeat(64),
  },
  knownDeltaProof: {
    path: 'structural/known-delta-proof.json',
    bytes: 0,
    sha256: '0'.repeat(64),
  },
}
const expectedKnownDeltaClosure = {
  targetUnits: 22_358,
  targetTokens: 4_405_970,
  changedUnits: 0,
  movedUnits: 0,
  unresolvedUnits: 0,
  changedTokens: 0,
  movedTokens: 0,
  unresolvedTokens: 0,
  unmatchedBaselineUnits: 0,
  unresolvedTargetUnits: 0,
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function metadata(filename, root = caseRoot) {
  const value = fs.readFileSync(filename)
  return {
    path: path.relative(root, filename).replaceAll('\\', '/'),
    bytes: value.length,
    sha256: sha256(value),
  }
}

function walkFiles(directory) {
  const values = []
  const queue = [directory]
  while (queue.length > 0) {
    const current = queue.shift()
    for (const entry of fs
      .readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const filename = path.join(current, entry.name)
      const status = fs.lstatSync(filename)
      assert(!status.isSymbolicLink(), `case file is a symlink: ${filename}`)
      if (status.isDirectory()) queue.push(filename)
      else if (status.isFile()) values.push(filename)
    }
  }
  return values.sort()
}

const prior = JSON.parse(fs.readFileSync(priorManifestPath, 'utf8'))
const draft = JSON.parse(fs.readFileSync(draftPath, 'utf8'))
const sourceLineage = JSON.parse(fs.readFileSync(sourceLineagePath, 'utf8'))
const sourceIdentity = JSON.parse(fs.readFileSync(sourceIdentityPath, 'utf8'))
const obligations = JSON.parse(fs.readFileSync(obligationsPath, 'utf8'))
const directEvidence = JSON.parse(fs.readFileSync(directEvidencePath, 'utf8'))
const semanticSummary = JSON.parse(fs.readFileSync(semanticSummaryPath, 'utf8'))
const knownDeltaProof = JSON.parse(fs.readFileSync(knownDeltaProofPath, 'utf8'))
const knownDeltaProofRepositoryMetadata = metadata(knownDeltaProofPath, repo)
const semanticClusterInventory = knownDeltaProof.knownDelta?.clusterInventory
const expectedFocusedTests = [
  ...new Set(directEvidence.rows.flatMap(row => row.focusedTests ?? [])),
].sort()
const expectedReleaseTests = [
  'recovery/test/recovery-2.1.124-direct-evidence.test.mjs',
  ...expectedFocusedTests.map(
    id => `recovery/test/recovery-2.1.124-${id}.test.mjs`,
  ),
].sort()
const expectedTestAssertions = sourceLineage.testFileAssertions
  .map(entry => entry.path)
  .sort()
const expectedTargetCommitFiles = [...new Set([
  ...expectedTestAssertions,
  ...directEvidence.inputs.map(entry => entry.path),
  'recovery/2.1.124-direct-evidence-specs.json',
  'recovery/cases/2.1.123-to-2.1.124/semantic/direct-evidence.json',
])].sort()
assert(expectedFocusedTests.includes('semantic-delta'),
  'focused tests include semantic delta')

assert(draft.schemaVersion === 4, 'draft manifest schema')
assert(draft.case === '2.1.123-to-2.1.124', 'draft case identity')
assert(
  draft.releaseAdjacency?.baseline === '2.1.123' &&
    draft.releaseAdjacency?.target === '2.1.124' &&
    draft.releaseAdjacency?.publicGitReleaseTagPresent === false &&
    draft.releaseAdjacency?.publicChangelogSectionPresent === false &&
    draft.releaseAdjacency?.publicReleaseAbsence ===
      'evidence/RELEASE-2.1.124-ABSENCE.json',
  'draft release adjacency',
)
assert(
  JSON.stringify({
    rawLedger: draft.generatedRecovery?.structural?.rawLedger,
    metadataNormalizedLedger:
      draft.generatedRecovery?.structural?.metadataNormalizedLedger,
    knownDeltaExactLedger:
      draft.generatedRecovery?.structural?.knownDeltaExactLedger,
    knownDeltaProof: draft.generatedRecovery?.structural?.knownDeltaProof,
  }) === JSON.stringify(expectedStructuralArtifacts),
  'exact structural ledger and proof identities',
)
assert(
  JSON.stringify(draft.generatedRecovery.structural.knownDeltaClosure) ===
    JSON.stringify(expectedKnownDeltaClosure),
  'zero-residue known-delta closure',
)
const draftArtifacts = new Map(draft.artifacts.map(entry => [entry.id, entry]))
const priorArtifacts = new Map(prior.artifacts.map(entry => [entry.id, entry]))
const baselineDeclarations = draftArtifacts.get('baselineDeclarations')
const targetDeclarations = draftArtifacts.get('targetDeclarations')
const baselinePackageJson = draftArtifacts.get('baselinePackageJson')
const targetPackageJson = draftArtifacts.get('targetPackageJson')
assert(
  baselineDeclarations?.bytes === targetDeclarations?.bytes &&
    baselineDeclarations?.sha256 === targetDeclarations?.sha256,
  'declaration artifact identity',
)
assert(
  baselinePackageJson?.sha256 !== undefined &&
    targetPackageJson?.sha256 !== undefined &&
    baselinePackageJson.sha256 !== targetPackageJson.sha256,
  'package.json adjacent artifact identity',
)
assert(prior.baselineOracle?.sourceMap !== undefined, 'prior baseline oracle')
for (const artifactId of ['sourceOracleBundle', 'sourceOracleMap']) {
  const draftArtifact = draftArtifacts.get(artifactId)
  const priorArtifact = priorArtifacts.get(artifactId)
  assert(
    draftArtifact?.bytes === priorArtifact?.bytes &&
      draftArtifact?.sha256 === priorArtifact?.sha256,
    `${artifactId}: historical oracle identity`,
  )
}
assert(sourceIdentity.case === draft.case, 'source-freeze case identity')
assert(sourceIdentity.target.commit === sourceLineage.targetCommit, 'target commit')
assert(
  sourceIdentity.verification.diffCheck.scope === 'full-target-tree' &&
    sourceIdentity.verification.diffCheck.sourceDiagnosticLines === 0 &&
    Number.isSafeInteger(
      sourceIdentity.verification.diffCheck.diagnosticLines,
    ) &&
    sourceIdentity.verification.diffCheck.diagnosticLines >= 0 &&
    /^[a-f0-9]{64}$/.test(sourceIdentity.verification.diffCheck.sha256) &&
    sourceIdentity.verification.diffCheck.reviewed === true,
  'full-tree diff-check freeze identity',
)
const fullDiffCheckRaw = fs.readFileSync(
  path.join(sourceFreezeRoot, 'diff-check.raw.txt'),
)
assert(
  sha256(fullDiffCheckRaw) === sourceIdentity.verification.diffCheck.sha256 &&
    fullDiffCheckRaw.toString('utf8').split('\n').filter(Boolean).length ===
      sourceIdentity.verification.diffCheck.diagnosticLines,
  'full-tree diff-check frozen output',
)
assert(
  sourceIdentity.target.srcTree === sourceLineage.targetSrcGitTree,
  'target src git tree',
)
assert(
  obligations.obligations.length === directEvidence.rows.length &&
    obligations.obligations.length === directEvidence.rowCount,
  'semantic obligation and catalog totals',
)
assert(
  directEvidence.categoryCounts.official === undefined &&
    directEvidence.rows.every(row => row.category !== 'official'),
  'direct catalog must be hidden-only',
)
assert(
  knownDeltaProof.schemaVersion === 1 &&
    knownDeltaProof.case === '2.1.123-to-2.1.124' &&
    knownDeltaProof.release === '2.1.124' &&
    knownDeltaProof.complete === true &&
    semanticClusterInventory?.schemaVersion === 1 &&
    semanticClusterInventory.totalClusters === 205 &&
    Array.isArray(semanticClusterInventory.direct) &&
    Array.isArray(semanticClusterInventory.accountingOnly),
  'known-delta semantic cluster inventory identity',
)
const semanticClusterIds = [
  ...semanticClusterInventory.direct.flatMap(entry => entry.clusterIds),
  ...semanticClusterInventory.accountingOnly.flatMap(entry => entry.clusterIds),
].sort((left, right) => left - right)
assert(
  new Set(semanticClusterIds).size === 205 &&
    JSON.stringify(semanticClusterIds) === JSON.stringify(
      Array.from({ length: 205 }, (_, index) => index + 1),
    ) &&
    JSON.stringify(directEvidence.clusterInventory?.proof) ===
      JSON.stringify(knownDeltaProofRepositoryMetadata) &&
    directEvidence.clusterInventory?.totalClusters === 205 &&
    directEvidence.coverageDeclarations?.clusterInventoryFullyBound === true,
  'complete known-delta semantic cluster partition',
)
assert(
  JSON.stringify(
    semanticClusterInventory.direct
      .map(entry => [entry.rowId, entry.clusterIds])
      .sort((left, right) => left[0].localeCompare(right[0])),
  ) === JSON.stringify(
    directEvidence.rows
      .map(row => [row.id, row.semanticClusterIds])
      .sort((left, right) => left[0].localeCompare(right[0])),
  ),
  'semantic cluster direct rows differ from the catalog',
)
assert(
  JSON.stringify(obligations.semanticClusterInventory) === JSON.stringify({
    ...directEvidence.clusterInventory,
    directRowIdsSha256: sha256(Buffer.from(
      `${directEvidence.rows.map(row => row.id).join('\n')}\n`,
    )),
  }),
  'semantic obligations cluster inventory binding',
)
assert(
  JSON.stringify(sourceLineage.testFiles) ===
    JSON.stringify(expectedReleaseTests),
  'exact catalog-derived source-lineage topology',
)
assert(
  JSON.stringify(
    sourceLineage.changedFiles.map(entry => ({
      status: entry.status,
      path: entry.path,
    })),
  ) === JSON.stringify(directEvidence.changedSourceRows),
  'source-lineage boundary differs from direct evidence',
)
assert(
  JSON.stringify(sourceLineage.testFileAssertions.map(entry => entry.path)) ===
    JSON.stringify(expectedTestAssertions) &&
    JSON.stringify(
      sourceLineage.targetCommitFileAssertions.map(entry => entry.path),
    ) === JSON.stringify(expectedTargetCommitFiles),
  'exact target-commit recovery input topology',
)
const targetCommitAssertionByPath = new Map(
  sourceLineage.targetCommitFileAssertions.map(entry => [entry.path, entry]),
)
assert(
  targetCommitAssertionByPath.size ===
    sourceLineage.targetCommitFileAssertions.length,
  'duplicate target-commit recovery input',
)
for (const entry of directEvidence.inputs) {
  assert(
    JSON.stringify(targetCommitAssertionByPath.get(entry.path)) ===
      JSON.stringify(entry),
    `${entry.path}: direct input differs from target-commit assertion`,
  )
}
assert(
  directEvidence.focusedTestCount === expectedFocusedTests.length &&
    JSON.stringify(
      [...new Set(directEvidence.rows.flatMap(row => row.focusedTests))].sort(),
    ) === JSON.stringify(expectedFocusedTests),
  'exact hidden focused-test bindings',
)
const directSourceFileAbsenceCount = directEvidence.rows.reduce(
  (sum, row) => sum + (row.sourceFileAbsences ?? []).length,
  0,
)
const catalogDeletedSources = directEvidence.rows
  .flatMap(row => row.sourceFileAbsences ?? [])
  .map(entry => ({
    path: entry.path,
    status: 'D',
    base: { bytes: entry.baseBytes, sha256: entry.baseSha256 },
    target: null,
  }))
  .sort((left, right) => left.path.localeCompare(right.path))
const lineageDeletedSources = sourceLineage.changedFiles
  .filter(entry => entry.status === 'D')
  .map(entry => ({
    path: entry.path,
    status: entry.status,
    base: entry.base,
    target: entry.target,
  }))
  .sort((left, right) => left.path.localeCompare(right.path))
assert(
  JSON.stringify(catalogDeletedSources) === JSON.stringify(lineageDeletedSources),
  'direct catalog and reversible overlay deleted-source identities differ',
)
assert(
  semanticSummary.coverage.obligations.sourceFileAbsenceCount ===
    directSourceFileAbsenceCount,
  'semantic and direct deleted-source counts differ',
)
assert(
  semanticSummary.coverage.obligations.obligationCount ===
      obligations.obligations.length &&
    semanticSummary.coverage.obligations.releaseBulletsCovered === 0 &&
    semanticSummary.coverage.obligations.releaseBulletCount === 0 &&
    semanticSummary.coverage.obligations.unverifiedObligationCount === 0 &&
    semanticSummary.coverage.unclassifiedTokens === 0 &&
    semanticSummary.coverage.accountedTokens ===
      semanticSummary.coverage.targetTokens,
  'semantic closure is incomplete',
)
assert(
  semanticSummary.sourceTree.manifestSha256 ===
      sourceLineage.target.manifestSha256 &&
    semanticSummary.sourceTree.files === sourceLineage.target.files &&
    semanticSummary.sourceTree.bytes === sourceLineage.target.bytes,
  'semantic report and source freeze use different source trees',
)
const lineageTests = new Set(sourceLineage.testFiles)
for (const entry of obligations.testCatalog) {
  assert(lineageTests.has(entry.path), `semantic test is not in lineage: ${entry.path}`)
}

const cumulativeApplied = new Map(
  prior.sourceOracle.appliedSourceTree.files.map(entry => [
    entry.path,
    clone(entry),
  ]),
)
for (const changed of sourceLineage.changedFiles) {
  const previous = cumulativeApplied.get(changed.path)
  if (changed.target === null) {
    assert(previous !== undefined, `${changed.path}: deletion has no baseline`)
    cumulativeApplied.set(changed.path, {
      path: changed.path,
      ...(previous.baseline === 'absent' ? { baseline: 'absent' } : {}),
      target: 'absent',
    })
  } else {
    cumulativeApplied.set(changed.path, {
      path: changed.path,
      ...(previous?.baseline === 'absent' ||
      (previous === undefined && changed.status === 'A')
        ? { baseline: 'absent' }
        : {}),
      bytes: changed.target.bytes,
      sha256: changed.target.sha256,
    })
  }
}
const appliedSourceFiles = [...cumulativeApplied.values()].sort((left, right) =>
  left.path.localeCompare(right.path),
)

const sourceFreezeAssertions = [
  metadata(path.join(caseRoot, 'recovered/source-facing-overlay.patch')),
  ...walkFiles(sourceFreezeRoot).map(filename => metadata(filename)),
]
assert(sourceFreezeAssertions.length === 16, 'source-freeze assertion total')
const sourceFreezePaths = new Set(sourceFreezeAssertions.map(entry => entry.path))
for (const required of [
  'recovered/source-facing-overlay.patch',
  'recovered/source-freeze/SHA256SUMS',
  'recovered/source-freeze/identity.json',
  'recovered/source-freeze/source-facing-overlay.patch',
  'recovered/source-freeze/source-files.sha256',
  'recovered/source-freeze/target-test-files.sha256',
]) {
  assert(sourceFreezePaths.has(required), `source-freeze file absent: ${required}`)
}

const excludedCaseFiles = new Set(['manifest.json', 'manifest.non-source-draft.json'])
const recoveredFileAssertions = walkFiles(caseRoot)
  .map(filename => metadata(filename))
  .filter(entry => !excludedCaseFiles.has(entry.path))
const assertedPaths = new Set(recoveredFileAssertions.map(entry => entry.path))
assert(
  assertedPaths.size === recoveredFileAssertions.length,
  'duplicate recovered file assertion',
)
for (const required of [
  'freeze-index.json',
  'RECOVERY_RUNBOOK.md',
  'REPORT.md',
  'recovered/source-lineage-core.json',
  'semantic/README.md',
  'semantic/direct-evidence.json',
  'semantic/obligations.json',
  'semantic/semantic-correspondence.json.gz',
  'semantic/summary.json',
]) {
  assert(assertedPaths.has(required), `final case file absent: ${required}`)
}

const groups = [
  {
    id: 'exact-published-package-and-bundle-recovery',
    confidence: 'exact',
    prefixes: ['binary-extraction/', 'diff/'],
    exactPaths: ['package-members.json'],
    explains: [
      'baselineBundle',
      'targetBundle',
      'targetAnalyzableBundle',
      'targetImageProcessorJs',
      'targetAudioCaptureJs',
      'targetExecutable',
    ],
  },
  {
    id: 'authenticated-generated-accounting',
    confidence: 'exact',
    prefixes: ['attribution/', 'evidence/', 'readable-diff/', 'structural/'],
    exactPaths: ['freeze-index.json'],
    explains: ['targetBundle', 'targetAnalyzableBundle'],
  },
  {
    id: '2-1-124-source-facing-overlay-and-freeze',
    confidence: 'equivalent',
    prefixes: ['recovered/'],
    exactPaths: [],
    explains: ['targetBundle'],
  },
  {
    id: '2-1-124-direct-semantic-correspondence',
    confidence: 'equivalent',
    prefixes: ['semantic/'],
    exactPaths: [],
    explains: ['targetBundle', 'targetAnalyzableBundle'],
  },
  {
    id: '2-1-124-recovery-handoff',
    confidence: 'equivalent',
    prefixes: [],
    exactPaths: ['RECOVERY_RUNBOOK.md', 'REPORT.md'],
    explains: ['targetBundle'],
  },
]

const editByPath = new Map()
const recoveredEdits = groups.map(group => {
  const files = recoveredFileAssertions
    .map(entry => entry.path)
    .filter(
      relative =>
        group.exactPaths.includes(relative) ||
        group.prefixes.some(prefix => relative.startsWith(prefix)),
    )
    .sort()
  assert(files.length > 0, `${group.id}: empty file group`)
  for (const relative of files) {
    assert(!editByPath.has(relative), `${relative}: linked twice`)
    editByPath.set(relative, group.id)
  }
  return {
    id: group.id,
    confidence: group.confidence,
    files,
    explains: group.explains,
  }
})
assert(
  editByPath.size === recoveredFileAssertions.length,
  'every recovered file must be linked exactly once',
)

const semanticFiles = {
  directEvidence: metadata(directEvidencePath),
  obligations: metadata(obligationsPath),
  report: metadata(semanticReportPath),
  summary: metadata(semanticSummaryPath),
}
const manifest = clone(draft)
delete manifest.draft
delete manifest.pendingSourceClosure
manifest.baselineOracle = clone(prior.baselineOracle)
manifest.recoveryScope = {
  platform: 'linux-x64',
  completeness: 'generated-code-complete-linux-x64-source-semantic-equivalent',
  authoredSourceTextObservable: false,
  authenticatedNativeContainer: true,
  exactPublishedPackageTreeReconstruction: true,
  exactPublishedBundleReconstruction: true,
  exactEmbeddedJavaScriptGraphReconstruction: true,
  allTargetUtf16Accounted: true,
  allTargetTokensClassified: true,
  allSemanticObligationsVerified: true,
  sourceClosurePending: false,
  semanticClosurePending: false,
}
manifest.sourceOracle.appliedSourceTree = {
  baseline: prior.sourceOracle.appliedSourceTree.baseline,
  patchSet: 'cumulative-2.1.89-through-2.1.124-source-facing-overlays',
  fileCount: appliedSourceFiles.length,
  files: appliedSourceFiles,
}
manifest.sourceLineage = clone(sourceLineage)
manifest.targetAssertions = {
  declarationChange: { kind: 'unchanged' },
  packageVersionChange: {
    baseline: draft.releaseAdjacency.baseline,
    target: draft.releaseAdjacency.target,
  },
  packageJsonChange: { kind: 'exact-artifact' },
  officialReleaseNotes: {
    kind: 'authenticated-public-release-absence',
    ...metadata(
      path.join(caseRoot, 'evidence/RELEASE-2.1.124-ABSENCE.json'),
    ),
  },
  bundleFragments: [],
  status: 'authenticated-semantic-correspondence-complete',
}
manifest.recoveredEdits = recoveredEdits
manifest.recoveredFileAssertions = recoveredFileAssertions
manifest.generatedRecovery.semanticCorrespondence = {
  status: 'verified-zero-unclassified-zero-unverified',
  attributionDirectory: 'attribution',
  structuralLedger: 'structural/generated-delta.json.gz',
  obligations: semanticFiles.obligations.path,
  changelog: 'evidence/RELEASE-2.1.124-ABSENCE.json',
  baselineArtifact: 'baselineAnalyzableBundle',
  targetArtifact: 'targetAnalyzableBundle',
  report: semanticFiles.report.path,
  summary: semanticFiles.summary.path,
  directEvidence: semanticFiles.directEvidence.path,
  fileIdentities: semanticFiles,
  obligationCoverage: {
    total: semanticSummary.coverage.obligations.obligationCount,
    official: 0,
    ...directEvidence.categoryCounts,
    unverified: semanticSummary.coverage.obligations.unverifiedObligationCount,
  },
  witnesses: {
    targetFragments: semanticSummary.coverage.obligations.fragmentCount,
    targetAbsences: semanticSummary.coverage.obligations.targetAbsenceCount,
    sourceAssertions: semanticSummary.coverage.obligations.sourceAssertionCount,
    sourceAbsences: semanticSummary.coverage.obligations.sourceAbsenceCount,
    sourceRemovals: semanticSummary.coverage.obligations.sourceRemovalCount,
    sourceFileAbsences:
      semanticSummary.coverage.obligations.sourceFileAbsenceCount,
  },
  targetTokens: semanticSummary.coverage.targetTokens,
  accountedTokens: semanticSummary.coverage.accountedTokens,
  unclassifiedTokens: semanticSummary.coverage.unclassifiedTokens,
  testCatalogEntries: semanticSummary.coverage.obligations.testCatalogEntries,
  usedTestCatalogEntries:
    semanticSummary.coverage.obligations.usedTestCatalogEntries,
}
manifest.generatedRecovery.semanticCatalogContract = {
  status: 'verified-lossless-row-scoped-direct-correspondence',
  official: directEvidence.categoryCounts.official ?? 0,
  hidden: directEvidence.categoryCounts.hidden ?? 0,
  total: directEvidence.rowCount,
  unclassified: 0,
  unverified: 0,
  clusterInventory: {
    ...directEvidence.clusterInventory,
    directRowIdsSha256: obligations.semanticClusterInventory.directRowIdsSha256,
  },
  directEvidence: {
    ...semanticFiles.directEvidence,
    rows: directEvidence.rowCount,
    categoryCounts: directEvidence.categoryCounts,
    targetFragments: directEvidence.rows.reduce(
      (sum, row) => sum + row.targetFragments.length,
      0,
    ),
    targetAbsences: directEvidence.rows.reduce(
      (sum, row) => sum + row.targetAbsences.length,
      0,
    ),
    sourceAssertions: directEvidence.rows.reduce(
      (sum, row) => sum + row.sourceAssertions.length,
      0,
    ),
    sourcePathAbsences: directEvidence.rows.reduce(
      (sum, row) => sum + row.sourcePathAbsences.length,
      0,
    ),
    sourceFileAbsences: directSourceFileAbsenceCount,
  },
}
manifest.generatedRecovery.attribution.status =
  'verified-exhaustive-target-coverage'
manifest.generatedRecovery.attribution.summary = 'attribution/summary.json'
manifest.generatedRecovery.structural.status =
  'verified-zero-residue-known-delta-ledger'
manifest.generatedRecovery.structural.semanticClusterInventory = {
  ...draft.generatedRecovery.structural.semanticClusterInventory,
  status: 'verified-complete-partition-and-direct-bindings',
  proof: directEvidence.clusterInventory.proof,
  partitionSha256: directEvidence.clusterInventory.partitionSha256,
}
manifest.generatedRecovery.readableDiff.status = 'verified-review-layer'
manifest.generatedRecovery.fileAssertions = recoveredFileAssertions
manifest.sourceFreeze = {
  status: 'immutable-and-self-verifying',
  identity: 'recovered/source-freeze/identity.json',
  identitySha256: metadata(sourceIdentityPath).sha256,
  overlay: metadata(path.join(caseRoot, 'recovered/source-facing-overlay.patch')),
  diffCheck: {
    ...sourceIdentity.verification.diffCheck,
    rawOutput: 'recovered/source-freeze/diff-check.raw.txt',
    allowlist: 'recovered/source-freeze/diff-check-allowlist.txt',
  },
  fileAssertions: sourceFreezeAssertions,
}
manifest.finalization = {
  status: 'complete',
  sourceFreezeIdentitySha256: manifest.sourceFreeze.identitySha256,
  semanticObligationsSha256: semanticFiles.obligations.sha256,
  semanticReportSha256: semanticFiles.report.sha256,
  semanticSummarySha256: semanticFiles.summary.sha256,
  recoveredFiles: recoveredFileAssertions.length,
  recoveredEdits: recoveredEdits.length,
}

fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`)
const value = fs.readFileSync(outputPath)
console.log(
  JSON.stringify({
    status: '2.1.124-manifest-built',
    path: path.relative(repo, outputPath),
    bytes: value.length,
    sha256: sha256(value),
    recoveredFiles: recoveredFileAssertions.length,
    recoveredEdits: recoveredEdits.length,
    appliedSourceFiles: appliedSourceFiles.length,
    sourceFreezePaths: sourceFreezeAssertions.length,
    semanticObligations: semanticSummary.coverage.obligations.obligationCount,
  }),
)
