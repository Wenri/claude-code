#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertRelease21124GeneratedInputContract,
  assertRelease21124SourceOracleDeclaration,
} from '../lib/release-2.1.124-input-contract.mjs'

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
const attributionSummaryPath = path.join(caseRoot, 'attribution/summary.json')
const readableMetadataPath = path.join(caseRoot, 'readable-diff/metadata.json')
const expectedStructuralArtifacts = {
  rawLedger: {
    path: 'structural/generated-delta.json.gz',
    bytes: 2_415_762,
    sha256: '0675cd7f48b2d74b5922e5eacabd76a8a151d9cdd6f515d76e2aa350fb83e982',
  },
  metadataNormalizedLedger: {
    path: 'structural/metadata-normalized-delta.json.gz',
    bytes: 2_397_530,
    sha256: 'de7f4b2a3bd15392758ac3c981d4759f54bfcdb9a5ee3a810d8215fe4da3e460',
  },
  knownDeltaExactLedger: {
    path: 'structural/known-delta-ledger.json.gz',
    bytes: 2_234_460,
    sha256: '97cf1e6fe195eb4a2605cb0ade2de5fe8963adcb1a02ab2cafd731a783f54a24',
  },
  knownDeltaProof: {
    path: 'structural/known-delta-proof.json',
    bytes: 347_925,
    sha256: '4104bbbd6c14f7703ac5fca78ff1a1ac30925aea53e70ed3f4c080434594e06b',
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
const expectedAccountingClusterIds = [
  1, 2, 4, 9, 10, 11, 16, 26, 31, 33, 34, 36, 47, 56, 60, 61, 74, 86, 97, 98, 112,
  113, 114, 116, 123, 138, 141, 145, 147, 157, 158, 159, 165, 176, 179, 190, 202,
]
const expectedAccountingReasonGroups = {
  dependency: [1, 2, 9, 10, 11, 26],
  'identifier-only': [74, 86, 157, 158, 165, 190],
  'initializer-linkage': [
    4, 16, 31, 33, 34, 36, 47, 56, 60, 61, 97, 98, 112, 116, 138,
    141, 145, 147, 176, 179, 202,
  ],
  'exact-relocation': [113, 114, 123, 159],
}
const expectedInitializerPairedDirectClusterIds = [
  3, 17, 18, 32, 35, 62, 110, 151, 167, 168, 180,
]
const requiredDirectClusterIds = [12, 69, 115, 122, 186, 188, 189]
const expectedDirectClusterCount = 168
const expectedAccountingClusterCount = 37
const expectedDirectSourcePathCount = 121
const expectedSupportSourcePathCount = 10
const expectedChangedSourcePathCount = 131

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function validateAccountingTopology(entries, directClusterIds) {
  assert(
    directClusterIds.length === expectedDirectClusterCount &&
      entries.flatMap(entry => entry.clusterIds).length ===
        expectedAccountingClusterCount,
    'direct/accounting cluster counts',
  )
  for (const [reason, expectedIds] of Object.entries(
    expectedAccountingReasonGroups,
  )) {
    const reasonEntries = entries.filter(entry => entry.reason === reason)
    assert(reasonEntries.length === 1, `${reason}: accounting group count`)
    const actualIds = reasonEntries
      .flatMap(entry => entry.clusterIds)
      .sort((left, right) => left - right)
    assert(JSON.stringify(actualIds) === JSON.stringify(expectedIds),
      `${reason}: accounting cluster topology`)
  }
  const initializerEntries = entries.filter(
    entry => entry.reason === 'initializer-linkage',
  )
  assert(
    entries.every(entry =>
      typeof entry.evidence?.classification === 'string' &&
        entry.evidence.classification.length >= 20 &&
        (entry.reason === 'initializer-linkage' ||
          entry.evidence.pairedDirectClusterIds === undefined)) &&
      initializerEntries.length === 1 &&
      JSON.stringify(initializerEntries[0].evidence.pairedDirectClusterIds) ===
        JSON.stringify(expectedInitializerPairedDirectClusterIds) &&
      expectedInitializerPairedDirectClusterIds.every(clusterId =>
        directClusterIds.includes(clusterId)),
    'accounting evidence and initializer/direct pairing',
  )
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
const attribution = JSON.parse(fs.readFileSync(attributionSummaryPath, 'utf8'))
const readable = JSON.parse(fs.readFileSync(readableMetadataPath, 'utf8'))
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
const generatedInputContract = assertRelease21124GeneratedInputContract({
  artifacts: draft.artifacts,
  attribution,
  attributionSummary: metadata(attributionSummaryPath),
  readable,
  readableMetadata: metadata(readableMetadataPath),
})
for (const [name, expected] of Object.entries(generatedInputContract)) {
  const declared = Object.fromEntries(
    Object.keys(expected).map(key => [
      key,
      draft.generatedRecovery[name === 'readable' ? 'readableDiff' : name]?.[key],
    ]),
  )
  assert(
    JSON.stringify(declared) === JSON.stringify(expected),
    `${name}: generated input contract`,
  )
}
assertRelease21124SourceOracleDeclaration(draft, generatedInputContract)
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
    Array.isArray(semanticClusterInventory.accountingOnly) &&
    Array.isArray(semanticClusterInventory.supportBindings) &&
    semanticClusterInventory.supportBindings.length > 0,
  'known-delta semantic cluster inventory identity',
)
const semanticClusterIds = [
  ...semanticClusterInventory.direct.flatMap(entry => entry.clusterIds),
  ...semanticClusterInventory.accountingOnly.flatMap(entry => entry.clusterIds),
].sort((left, right) => left - right)
const semanticDirectClusterIds = semanticClusterInventory.direct.flatMap(
  entry => entry.clusterIds,
)
const semanticAccountingClusterIds = semanticClusterInventory.accountingOnly.flatMap(
  entry => entry.clusterIds,
)
validateAccountingTopology(
  semanticClusterInventory.accountingOnly,
  semanticDirectClusterIds,
)
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
  requiredDirectClusterIds.every(clusterId =>
    semanticDirectClusterIds.includes(clusterId) &&
      !semanticAccountingClusterIds.includes(clusterId)),
  'reviewed mixed-active clusters must be direct',
)
assert(
  JSON.stringify(
    [...semanticAccountingClusterIds].sort((left, right) => left - right),
  ) === JSON.stringify(expectedAccountingClusterIds),
  'accounting-only clusters differ from the conservative reviewed set',
)
assert(
  JSON.stringify(semanticClusterInventory.supportBindings.map(binding => binding.id)) ===
    JSON.stringify(
      semanticClusterInventory.supportBindings.map(binding => binding.id).sort(),
    ),
  'source-change support bindings are not canonical',
)
const directRowById = new Map(
  directEvidence.rows.map(row => [row.id, row]),
)
assert(
  directRowById.size === directEvidence.rows.length,
  'direct catalog row IDs are not unique',
)
const semanticDirectByRowId = new Map(
  semanticClusterInventory.direct.map(entry => [entry.rowId, entry]),
)
const semanticSupportById = new Map(
  semanticClusterInventory.supportBindings.map(binding => [binding.id, binding]),
)
assert(
  semanticDirectByRowId.size === semanticClusterInventory.direct.length &&
    semanticSupportById.size === semanticClusterInventory.supportBindings.length &&
    [...semanticSupportById.keys()].every(id => !semanticDirectByRowId.has(id)) &&
    JSON.stringify([...directRowById.keys()].sort()) === JSON.stringify([
      ...semanticDirectByRowId.keys(),
      ...semanticSupportById.keys(),
    ].sort()),
  'semantic direct/support rows differ from the catalog',
)
const semanticClusterBindings = semanticClusterInventory.direct.flatMap(entry =>
  entry.clusterBindings.map(binding => ({ rowId: entry.rowId, ...binding })))
const supportBindingsSha256 = sha256(Buffer.from(
  `${JSON.stringify(semanticClusterInventory.supportBindings)}\n`,
))
assert(
  directEvidence.clusterInventory?.directGroups ===
      semanticClusterInventory.direct.length &&
    directEvidence.clusterInventory?.directClusters ===
      semanticDirectClusterIds.length &&
    directEvidence.clusterInventory?.accountingOnlyGroups ===
      semanticClusterInventory.accountingOnly.length &&
    directEvidence.clusterInventory?.accountingOnlyClusters ===
      semanticAccountingClusterIds.length &&
    directEvidence.clusterInventory?.clusterBindingCount ===
      semanticDirectClusterIds.length &&
    directEvidence.clusterInventory?.clusterBindingsSha256 === sha256(
      Buffer.from(`${JSON.stringify(semanticClusterBindings)}\n`),
    ) &&
    directEvidence.clusterInventory?.supportBindingCount ===
      semanticClusterInventory.supportBindings.length &&
    directEvidence.clusterInventory?.supportSourcePathCount ===
      semanticClusterInventory.supportBindings.length &&
    directEvidence.clusterInventory?.supportBindingsSha256 ===
      supportBindingsSha256 &&
    draft.generatedRecovery.structural.semanticClusterInventory
      ?.supportBindings === semanticClusterInventory.supportBindings.length &&
    draft.generatedRecovery.structural.semanticClusterInventory
      ?.supportSourcePaths === semanticClusterInventory.supportBindings.length &&
    directEvidence.coverageDeclarations?.sourceSupportFullyBound === true,
  'catalog must pin direct cluster and source-change support bindings',
)
assert(
  semanticClusterInventory.direct.every(entry => {
    const row = directRowById.get(entry.rowId)
    return row !== undefined &&
      entry.clusterBindings.length === entry.clusterIds.length &&
      JSON.stringify(entry.clusterBindings.map(binding => binding.clusterId)) ===
        JSON.stringify(entry.clusterIds) &&
      entry.clusterBindings.every(binding =>
        binding.sourceWitnesses.every(sourceWitness =>
          sourceWitness.reviewed === true)) &&
      JSON.stringify(row.semanticClusterBindings) ===
        JSON.stringify(entry.clusterBindings)
  }),
  'catalog must preserve one exact witness binding per direct cluster',
)
const directEntryByClusterId = new Map(
  semanticClusterInventory.direct.flatMap(entry =>
    entry.clusterIds.map(clusterId => [clusterId, entry])),
)
function relatedTargetWitnesses(binding) {
  const relatedEntries = new Map()
  for (const clusterId of binding.relatedDirectClusterIds ?? []) {
    const entry = directEntryByClusterId.get(clusterId)
    assert(entry !== undefined, `${binding.id}: related cluster must be direct`)
    relatedEntries.set(entry.rowId, entry)
  }
  return [
    ...new Map(
      [...relatedEntries.values()].flatMap(entry =>
        entry.targetWitnesses.map(witness => [witness.value, witness])),
    ).values(),
  ].sort((left, right) => left.value.localeCompare(right.value))
}
assert(
  semanticClusterInventory.supportBindings.every(binding => {
    const row = directRowById.get(binding.id)
    const relatedWitnesses = relatedTargetWitnesses(binding)
    return (
      typeof binding.id === 'string' &&
      /^[a-z0-9][a-z0-9-]*$/.test(binding.id) &&
      ['owning-direct-prerequisite', 'inherited-residual'].includes(
        binding.classification,
      ) &&
      typeof binding.reason === 'string' &&
      binding.reason.length >= 20 &&
      binding.sourceWitness?.reviewed === true &&
      Array.isArray(binding.sourceWitness?.matchedSemanticTerms) &&
      JSON.stringify(binding.sourceWitness.matchedSemanticTerms) ===
        JSON.stringify([...binding.sourceWitness.matchedSemanticTerms].sort()) &&
      Array.isArray(binding.testIds) &&
      binding.testIds.length > 0 &&
      Array.isArray(binding.relatedDirectClusterIds) &&
      binding.relatedDirectClusterIds.length > 0 &&
      relatedWitnesses.length > 0 &&
      row !== undefined &&
      row.semanticClusterIds === undefined &&
      row.semanticClusterBindings === undefined &&
      JSON.stringify(row.sourceChangeSupport) === JSON.stringify(binding) &&
      JSON.stringify(row.relatedDirectClusterIds) ===
        JSON.stringify(binding.relatedDirectClusterIds) &&
      JSON.stringify(row.semanticTargetWitnesses) ===
        JSON.stringify(relatedWitnesses) &&
      JSON.stringify(row.focusedTests) === JSON.stringify(binding.testIds)
    )
  }),
  'catalog must preserve every reviewed source-change support binding',
)
const changedSourcePaths = directEvidence.changedSourceRows
  .map(row => row.path)
  .sort()
const preciseClusterSourcePaths = [
  ...new Set(semanticClusterInventory.direct.flatMap(entry => entry.sourcePaths)),
].sort()
const supportSourcePaths = semanticClusterInventory.supportBindings
  .map(binding => binding.sourceWitness.path)
  .sort()
assert(
  changedSourcePaths.length === expectedChangedSourcePathCount &&
    preciseClusterSourcePaths.length === expectedDirectSourcePathCount &&
    supportSourcePaths.length === expectedSupportSourcePathCount &&
    new Set(supportSourcePaths).size === supportSourcePaths.length &&
    supportSourcePaths.every(sourcePath =>
      !preciseClusterSourcePaths.includes(sourcePath)) &&
    JSON.stringify([...preciseClusterSourcePaths, ...supportSourcePaths].sort()) ===
      JSON.stringify(changedSourcePaths) &&
    semanticClusterInventory.direct.every(entry =>
      JSON.stringify(entry.sourcePaths) !== JSON.stringify(changedSourcePaths)),
  'precise cluster owners plus support paths must partition changed source',
)
const obligationByRawId = new Map(
  obligations.obligations.map(obligation => [
    obligation.catalogBinding?.rawId,
    obligation,
  ]),
)
assert(
  directEvidence.rows.every(row => {
    const obligation = obligationByRawId.get(row.id)
    return obligation !== undefined &&
      (row.semanticClusterIds === undefined
        ? obligation.semanticClusterIds === undefined &&
          obligation.semanticClusterBindings === undefined &&
          JSON.stringify(obligation.sourceChangeSupport) ===
            JSON.stringify(row.sourceChangeSupport) &&
          JSON.stringify(obligation.relatedDirectClusterIds) ===
            JSON.stringify(row.relatedDirectClusterIds)
        : obligation.sourceChangeSupport === undefined &&
          obligation.relatedDirectClusterIds === undefined &&
          JSON.stringify(obligation.semanticClusterIds) ===
            JSON.stringify(row.semanticClusterIds) &&
          JSON.stringify(obligation.semanticClusterBindings) ===
            JSON.stringify(row.semanticClusterBindings))
  }),
  'semantic obligations must preserve every direct/support binding',
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
Object.assign(
  manifest.generatedRecovery.attribution,
  generatedInputContract.attribution,
)
manifest.generatedRecovery.structural.status =
  'verified-zero-residue-known-delta-ledger'
manifest.generatedRecovery.structural.semanticClusterInventory = {
  ...draft.generatedRecovery.structural.semanticClusterInventory,
  status: 'verified-complete-partition-and-direct-bindings',
  proof: directEvidence.clusterInventory.proof,
  partitionSha256: directEvidence.clusterInventory.partitionSha256,
}
manifest.generatedRecovery.readableDiff.status = 'verified-review-layer'
Object.assign(
  manifest.generatedRecovery.readableDiff,
  generatedInputContract.readable,
)
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
