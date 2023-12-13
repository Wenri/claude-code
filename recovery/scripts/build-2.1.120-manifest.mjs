#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const caseRoot = path.join(repo, 'recovery/cases/2.1.119-to-2.1.120')
const priorManifestPath = path.join(
  repo,
  'recovery/cases/2.1.118-to-2.1.119/manifest.json',
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

assert(draft.schemaVersion === 4, 'draft manifest schema')
assert(draft.case === '2.1.119-to-2.1.120', 'draft case identity')
assert(sourceIdentity.case === draft.case, 'source-freeze case identity')
assert(sourceIdentity.target.commit === sourceLineage.targetCommit, 'target commit')
assert(
  sourceIdentity.target.srcTree === sourceLineage.targetSrcGitTree,
  'target src git tree',
)
assert(
  obligations.obligations.length === directEvidence.rows.length &&
    obligations.obligations.length === directEvidence.rowCount,
  'semantic obligation and catalog totals',
)
assert(directEvidence.categoryCounts.official === 22, 'official row total')
assert(directEvidence.categoryCounts.hidden === 15, 'hidden H01-H15 total')
assert(directEvidence.categoryCounts.daemon >= 3, 'daemon row total')
assert(directEvidence.categoryCounts.selection >= 2, 'selection row total')
assert(directEvidence.categoryCounts.fleet >= 2, 'Fleet row total')
assert(
  semanticSummary.coverage.obligations.obligationCount ===
      obligations.obligations.length &&
    semanticSummary.coverage.obligations.releaseBulletsCovered === 22 &&
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
    explains: ['targetBundle', 'targetAnalyzableBundle', 'officialChangelog'],
  },
  {
    id: '2-1-120-source-facing-overlay-and-freeze',
    confidence: 'equivalent',
    prefixes: ['recovered/'],
    exactPaths: [],
    explains: ['targetBundle', 'officialChangelog'],
  },
  {
    id: '2-1-120-direct-semantic-correspondence',
    confidence: 'equivalent',
    prefixes: ['semantic/'],
    exactPaths: [],
    explains: ['targetBundle', 'targetAnalyzableBundle', 'officialChangelog'],
  },
  {
    id: '2-1-120-recovery-handoff',
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
  patchSet: 'cumulative-2.1.89-through-2.1.120-source-facing-overlays',
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
  changelog: 'evidence/CHANGELOG-2.1.120.md',
  baselineArtifact: 'baselineAnalyzableBundle',
  targetArtifact: 'targetAnalyzableBundle',
  report: semanticFiles.report.path,
  summary: semanticFiles.summary.path,
  directEvidence: semanticFiles.directEvidence.path,
  fileIdentities: semanticFiles,
  obligationCoverage: {
    total: semanticSummary.coverage.obligations.obligationCount,
    official: semanticSummary.coverage.obligations.releaseBulletsCovered,
    ...directEvidence.categoryCounts,
    unverified: semanticSummary.coverage.obligations.unverifiedObligationCount,
  },
  witnesses: {
    targetFragments: semanticSummary.coverage.obligations.fragmentCount,
    targetAbsences: semanticSummary.coverage.obligations.targetAbsenceCount,
    sourceAssertions: semanticSummary.coverage.obligations.sourceAssertionCount,
    sourceAbsences: semanticSummary.coverage.obligations.sourceAbsenceCount,
    sourceRemovals: semanticSummary.coverage.obligations.sourceRemovalCount,
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
  official: directEvidence.categoryCounts.official,
  hidden: directEvidence.categoryCounts.hidden,
  total: directEvidence.rowCount,
  unclassified: 0,
  unverified: 0,
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
  },
}
manifest.generatedRecovery.attribution.status =
  'verified-exhaustive-target-coverage'
manifest.generatedRecovery.attribution.summary = 'attribution/summary.json'
manifest.generatedRecovery.structural.status = 'verified-exhaustive-token-ledger'
manifest.generatedRecovery.readableDiff.status = 'verified-review-layer'
manifest.generatedRecovery.fileAssertions = recoveredFileAssertions
manifest.sourceFreeze = {
  status: 'immutable-and-self-verifying',
  identity: 'recovered/source-freeze/identity.json',
  identitySha256: metadata(sourceIdentityPath).sha256,
  overlay: metadata(path.join(caseRoot, 'recovered/source-facing-overlay.patch')),
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
    status: '2.1.120-manifest-built',
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
