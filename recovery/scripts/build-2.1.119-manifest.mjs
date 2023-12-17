#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const caseRoot = path.join(repo, 'recovery/cases/2.1.118-to-2.1.119')
const priorManifestPath = path.join(
  repo,
  'recovery/cases/2.1.117-to-2.1.118/manifest.json',
)
const priorManifestExpected = {
  bytes: 328_311,
  sha256: '3292422c208ed8a72362fdf8bfe555c8db306586d7cdc00353a48e9d91561c35',
}
const draftPath = path.join(caseRoot, 'manifest.non-source-draft.json')
const outputPath = path.join(caseRoot, 'manifest.json')
const sourceLineagePath = path.join(
  caseRoot,
  'recovered/source-lineage-core.json',
)
const obligationsPath = path.join(caseRoot, 'semantic/obligations.json')
const directEvidencePath = path.join(
  caseRoot,
  'semantic/adjacent-direct-evidence.json',
)
const semanticReportPath = path.join(
  caseRoot,
  'semantic/semantic-correspondence.json.gz',
)
const semanticSummaryPath = path.join(caseRoot, 'semantic/summary.json')

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

const priorManifestBytes = fs.readFileSync(priorManifestPath)
assert(
  priorManifestBytes.length === priorManifestExpected.bytes &&
    sha256(priorManifestBytes) === priorManifestExpected.sha256,
  'predecessor manifest identity',
)
const priorManifestDescriptor = {
  path: path.relative(repo, priorManifestPath).replaceAll('\\', '/'),
  ...priorManifestExpected,
}
const prior = JSON.parse(priorManifestBytes.toString('utf8'))
const draft = JSON.parse(fs.readFileSync(draftPath, 'utf8'))
const sourceLineage = JSON.parse(fs.readFileSync(sourceLineagePath, 'utf8'))
const obligations = JSON.parse(fs.readFileSync(obligationsPath, 'utf8'))
const directEvidence = JSON.parse(fs.readFileSync(directEvidencePath, 'utf8'))
const semanticSummary = JSON.parse(fs.readFileSync(semanticSummaryPath, 'utf8'))

assert(draft.schemaVersion === 4, 'draft manifest schema')
assert(draft.case === '2.1.118-to-2.1.119', 'draft case identity')
assert(
  draft.releaseAdjacency?.baseline === '2.1.118' &&
    draft.releaseAdjacency?.target === '2.1.119' &&
    draft.releaseAdjacency?.targetIsNextPublishedVersion === true &&
    draft.releaseAdjacency?.skippedVersionsAbsent === true &&
    isDeepStrictEqual(draft.releaseAdjacency?.skipped, []),
  'draft release adjacency',
)
assert(prior.schemaVersion === 4, 'predecessor manifest schema')
assert(prior.case === '2.1.117-to-2.1.118', 'predecessor case identity')
assert(
  prior.releaseAdjacency?.baseline === '2.1.117' &&
    prior.releaseAdjacency?.target === '2.1.118' &&
    prior.releaseAdjacency?.targetIsNextPublishedVersion === true &&
    prior.releaseAdjacency?.skippedVersionsAbsent === true &&
    isDeepStrictEqual(prior.releaseAdjacency?.skipped, []),
  'predecessor release adjacency',
)
assert(
  draft.releaseAdjacency.baseline === prior.releaseAdjacency.target,
  'predecessor release target is the current baseline',
)
assert(
  prior.sourceLineage?.verifierResult?.status === 'source-lineage-verified' &&
    prior.sourceLineage?.verifierResult?.byteComparison === 'exact' &&
    prior.sourceLineage?.testResult?.base?.fail === 0 &&
    prior.sourceLineage?.testResult?.appliedTarget?.fail === 0,
  'predecessor source-lineage verification status',
)
const priorAppliedSourceTree = prior.sourceOracle?.appliedSourceTree
assert(
  priorAppliedSourceTree?.patchSet ===
    'cumulative-2.1.89-through-2.1.118-source-facing-overlays',
  'predecessor cumulative source patch set',
)
assert(
  Array.isArray(priorAppliedSourceTree.files) &&
    priorAppliedSourceTree.files.length > 0 &&
    priorAppliedSourceTree.fileCount === priorAppliedSourceTree.files.length,
  'predecessor cumulative source file count',
)
const priorAppliedPaths = priorAppliedSourceTree.files.map(entry => entry.path)
assert(
  new Set(priorAppliedPaths).size === priorAppliedPaths.length &&
    isDeepStrictEqual(
      priorAppliedPaths,
      [...priorAppliedPaths].sort((left, right) => left.localeCompare(right)),
    ),
  'predecessor cumulative source paths',
)
assert(
  isDeepStrictEqual(prior.sourceLineage?.target, sourceLineage.base),
  'predecessor target lineage is the current base lineage',
)
assert(obligations.obligations.length === 135, 'semantic obligation total')
assert(directEvidence.rows.length === 84, 'direct evidence row total')
assert(
  semanticSummary.coverage.obligations.obligationCount === 135 &&
    semanticSummary.coverage.obligations.unverifiedObligationCount === 0 &&
    semanticSummary.coverage.unclassifiedTokens === 0,
  'semantic closure is incomplete',
)
assert(
  sourceLineage.patch.sha256 ===
    '623cfd2740598d7a6f7cc0a7f72bfebd5000eeae13d6ccb3295f594b0abef794',
  'source-lineage overlay identity',
)
assert(
  Array.isArray(sourceLineage.testFiles) && sourceLineage.testFiles.length === 8,
  'source-lineage target test files',
)
assert(sourceLineage.testFileAssertions.length === 8, 'test file assertions')

const cumulativeApplied = new Map(
  prior.sourceOracle.appliedSourceTree.files.map(entry => [entry.path, clone(entry)]),
)
for (const changed of sourceLineage.changedFiles) {
  assert(changed.target !== null, `${changed.path}: source deletion is unsupported`)
  const previous = cumulativeApplied.get(changed.path)
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
const appliedSourceFiles = [...cumulativeApplied.values()].sort((left, right) =>
  left.path.localeCompare(right.path),
)

const excludedCaseFiles = new Set([
  'manifest.json',
  'manifest.non-source-draft.json',
])
const recoveredFileAssertions = walkFiles(caseRoot)
  .map(filename => metadata(filename))
  .filter(entry => !excludedCaseFiles.has(entry.path))

const assertedPaths = new Set(recoveredFileAssertions.map(entry => entry.path))
assert(
  assertedPaths.size === recoveredFileAssertions.length,
  'duplicate recovered file assertion',
)
const requiredSourceFreezePaths = [
  ...draft.sourceFreeze.fileAssertions.map(entry => entry.path),
]
assert(requiredSourceFreezePaths.length === 16, 'required source-freeze path count')
for (const required of requiredSourceFreezePaths) {
  assert(assertedPaths.has(required), `source-freeze assertion is absent: ${required}`)
}
for (const required of [
  'freeze-index.json',
  'RECOVERY_RUNBOOK.md',
  'REPORT.md',
  'recovered/source-lineage-core.json',
  'semantic/adjacent-direct-evidence.json',
  'semantic/obligations.json',
  'semantic/semantic-correspondence.json.gz',
  'semantic/summary.json',
]) {
  assert(assertedPaths.has(required), `final case assertion is absent: ${required}`)
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
    explains: ['targetBundle', 'targetAnalyzableBundle', 'officialChangelog'],
  },
  {
    id: '2-1-119-source-facing-overlay-and-freeze',
    confidence: 'equivalent',
    prefixes: ['recovered/'],
    exactPaths: [],
    explains: ['targetBundle', 'officialChangelog'],
  },
  {
    id: '2-1-119-semantic-supplement-overlay',
    confidence: 'equivalent',
    prefixes: [],
    exactPaths: ['semantic-supplement.patch'],
    explains: ['targetBundle', 'officialChangelog'],
  },
  {
    id: '2-1-119-direct-semantic-correspondence',
    confidence: 'equivalent',
    prefixes: ['semantic/'],
    exactPaths: [
      'daemon-fleet-query-obligations.json',
      'hidden-obligations.json',
    ],
    explains: ['targetBundle', 'targetAnalyzableBundle', 'officialChangelog'],
  },
  {
    id: '2-1-119-recovery-handoff',
    confidence: 'equivalent',
    prefixes: [],
    exactPaths: ['RECOVERY_RUNBOOK.md', 'REPORT.md'],
    explains: ['targetBundle', 'officialChangelog'],
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
    assert(!editByPath.has(relative), `${relative}: linked by two recovery edits`)
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
  'every recovered file assertion must be linked exactly once',
)
for (const relative of assertedPaths) {
  assert(editByPath.has(relative), `${relative}: no recovered edit linkage`)
}

const semanticFiles = {
  directEvidence: metadata(directEvidencePath),
  obligations: metadata(obligationsPath),
  report: metadata(semanticReportPath),
  summary: metadata(semanticSummaryPath),
}

const manifest = clone(draft)
delete manifest.draft
delete manifest.pendingSourceClosure
manifest.releaseAdjacency.predecessorManifest = priorManifestDescriptor
manifest.recoveryScope = {
  platform: 'linux-x64',
  completeness: 'generated-code-complete-linux-x64-source-partial',
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
  patchSet: 'cumulative-2.1.89-through-2.1.119-source-facing-overlays',
  fileCount: appliedSourceFiles.length,
  files: appliedSourceFiles,
}
manifest.sourceLineage = clone(sourceLineage)
manifest.targetAssertions.status = 'authenticated-semantic-correspondence-complete'
manifest.recoveredEdits = recoveredEdits
manifest.recoveredFileAssertions = recoveredFileAssertions
manifest.generatedRecovery.semanticCorrespondence = {
  status: 'verified-zero-unclassified-zero-unverified',
  attributionDirectory: 'attribution',
  structuralLedger: 'structural/generated-delta.json.gz',
  obligations: semanticFiles.obligations.path,
  changelog: 'evidence/CHANGELOG-2.1.119.md',
  baselineArtifact: 'baselineAnalyzableBundle',
  targetArtifact: 'targetAnalyzableBundle',
  report: semanticFiles.report.path,
  summary: semanticFiles.summary.path,
  directEvidence: semanticFiles.directEvidence.path,
  fileIdentities: semanticFiles,
  obligationCoverage: {
    total: semanticSummary.coverage.obligations.obligationCount,
    official: semanticSummary.coverage.obligations.releaseBulletsCovered,
    hidden: 65,
    daemonFleetQuery: 19,
    unverified: semanticSummary.coverage.obligations.unverifiedObligationCount,
  },
  witnesses: {
    targetFragments: semanticSummary.coverage.obligations.fragmentCount,
    targetAbsences: semanticSummary.coverage.obligations.targetAbsenceCount,
    sourceAssertions: semanticSummary.coverage.obligations.sourceAssertionCount,
    sourceAbsences: semanticSummary.coverage.obligations.sourceAbsenceCount,
  },
  targetTokens: semanticSummary.coverage.targetTokens,
  accountedTokens: semanticSummary.coverage.accountedTokens,
  unclassifiedTokens: semanticSummary.coverage.unclassifiedTokens,
  testCatalogEntries: semanticSummary.coverage.obligations.testCatalogEntries,
  usedTestCatalogEntries:
    semanticSummary.coverage.obligations.usedTestCatalogEntries,
}
manifest.generatedRecovery.semanticCatalogContract.status =
  'verified-lossless-direct-correspondence'
manifest.generatedRecovery.semanticCatalogContract.directEvidence = {
  ...semanticFiles.directEvidence,
  rows: directEvidence.rows.length,
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
  sourceAbsences: directEvidence.rows.reduce(
    (sum, row) => sum + row.sourceAbsences.length,
    0,
  ),
}
manifest.generatedRecovery.attribution.status = 'verified-exhaustive-target-coverage'
manifest.generatedRecovery.attribution.summary = 'attribution/summary.json'
manifest.generatedRecovery.structural.status = 'verified-exhaustive-token-ledger'
manifest.generatedRecovery.readableDiff.status = 'verified-review-layer'
manifest.generatedRecovery.fileAssertions = recoveredFileAssertions
manifest.sourceFreeze.status = 'immutable-and-self-verifying'
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
    status: '2.1.119-manifest-built',
    path: path.relative(repo, outputPath),
    bytes: value.length,
    sha256: sha256(value),
    recoveredFiles: recoveredFileAssertions.length,
    recoveredEdits: recoveredEdits.length,
    appliedSourceFiles: appliedSourceFiles.length,
    sourceFreezePaths: requiredSourceFreezePaths.length,
    semanticObligations:
      semanticSummary.coverage.obligations.obligationCount,
  }),
)
