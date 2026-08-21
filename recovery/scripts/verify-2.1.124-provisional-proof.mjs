#!/usr/bin/env node

import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertRelease21124GeneratedInputContract,
  assertRelease21124SourceOracleDeclaration,
} from '../lib/release-2.1.124-input-contract.mjs'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const caseRoot = path.join(repo, 'recovery/cases/2.1.123-to-2.1.124')
const baseRevision = '338d170737e8294c489481bc2e8fac52d8ce5f85'
const accountingReasons = new Set([
  'dependency',
  'exact-relocation',
  'identifier-only',
  'initializer-linkage',
  'metadata',
])
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
    directClusterIds.size === expectedDirectClusterCount &&
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
        directClusterIds.has(clusterId)),
    'accounting evidence and initializer/direct pairing',
  )
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function evidence(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function occurrences(contents, fragment) {
  assert(fragment.length > 0, 'cannot count an empty fragment')
  let count = 0
  let offset = 0
  while ((offset = contents.indexOf(fragment, offset)) !== -1) {
    count += 1
    offset += fragment.length
  }
  return count
}

function changedSourcePaths() {
  return execFileSync(
    'git',
    ['diff', '--name-only', '--no-renames', `${baseRevision}..HEAD`, '--', 'src'],
    { cwd: repo, encoding: 'utf8' },
  ).trim().split('\n').filter(Boolean).sort()
}

function pinnedCaseEvidence(record, label) {
  assert(
    record &&
      typeof record.path === 'string' &&
      record.path.startsWith('evidence/') &&
      !record.path.split('/').some(
        part => part === '' || part === '.' || part === '..',
      ),
    `${label}: unsafe evidence path`,
  )
  const filename = path.join(caseRoot, record.path)
  const status = fs.lstatSync(filename)
  assert(
    status.isFile() && !status.isSymbolicLink(),
    `${label}: expected a regular file`,
  )
  const value = fs.readFileSync(filename)
  assert(value.length === record.bytes, `${label}: byte length`)
  assert(sha256(value) === record.sha256, `${label}: SHA-256`)
  return value
}

const draft = JSON.parse(
  fs.readFileSync(path.join(caseRoot, 'manifest.non-source-draft.json'), 'utf8'),
)
const attributionSummaryBytes = fs.readFileSync(
  path.join(caseRoot, 'attribution/summary.json'),
)
const attribution = JSON.parse(attributionSummaryBytes)
const readableMetadataBytes = fs.readFileSync(
  path.join(caseRoot, 'readable-diff/metadata.json'),
)
const readable = JSON.parse(readableMetadataBytes)
const generatedInputContract = assertRelease21124GeneratedInputContract({
  artifacts: draft.artifacts,
  attribution,
  attributionSummary: evidence(attributionSummaryBytes),
  readable,
  readableMetadata: evidence(readableMetadataBytes),
})
for (const [name, expected] of Object.entries(generatedInputContract)) {
  const section = draft.generatedRecovery[
    name === 'readable' ? 'readableDiff' : name
  ]
  const declared = Object.fromEntries(
    Object.keys(expected).map(key => [key, section?.[key]]),
  )
  assert(
    JSON.stringify(declared) === JSON.stringify(expected),
    `${name}: generated input contract`,
  )
}
assertRelease21124SourceOracleDeclaration(draft, generatedInputContract)
const freeze = JSON.parse(
  fs.readFileSync(path.join(caseRoot, 'freeze-index.json'), 'utf8'),
)
const specs = JSON.parse(
  fs.readFileSync(path.join(repo, 'recovery/2.1.124-direct-evidence-specs.json'), 'utf8'),
)
const provenance = JSON.parse(
  fs.readFileSync(path.join(caseRoot, 'evidence/provenance.json'), 'utf8'),
)
const releaseAbsencePath = path.join(
  caseRoot,
  'evidence/RELEASE-2.1.124-ABSENCE.json',
)
const releaseAbsenceBytes = fs.readFileSync(releaseAbsencePath)
const releaseAbsence = JSON.parse(releaseAbsenceBytes)
const wrapperMembers = JSON.parse(
  fs.readFileSync(path.join(caseRoot, 'package-members.json'), 'utf8'),
)
const platformMembers = JSON.parse(
  fs.readFileSync(
    path.join(caseRoot, 'binary-extraction/native-package-members.json'),
    'utf8',
  ),
)
const knownDeltaProofRecord = draft.generatedRecovery?.structural?.knownDeltaProof
assert(
  knownDeltaProofRecord?.path === 'structural/known-delta-proof.json',
  'known-delta proof path',
)
const knownDeltaProofBytes = fs.readFileSync(
  path.join(caseRoot, knownDeltaProofRecord.path),
)
assert(
  knownDeltaProofBytes.length === knownDeltaProofRecord.bytes &&
    sha256(knownDeltaProofBytes) === knownDeltaProofRecord.sha256,
  'known-delta proof identity',
)
const knownDeltaProof = JSON.parse(knownDeltaProofBytes)
const semanticClusterInventory = knownDeltaProof.knownDelta?.clusterInventory
assert(
  semanticClusterInventory?.schemaVersion === 1 &&
    semanticClusterInventory.totalClusters === 205 &&
    Array.isArray(semanticClusterInventory.direct) &&
    Array.isArray(semanticClusterInventory.accountingOnly),
  'semantic cluster inventory identity',
)
const semanticClusterIds = [
  ...semanticClusterInventory.direct.flatMap(entry => entry.clusterIds),
  ...semanticClusterInventory.accountingOnly.flatMap(entry => entry.clusterIds),
].sort((left, right) => left - right)
assert(
  new Set(semanticClusterInventory.direct.map(entry => entry.rowId)).size ===
    semanticClusterInventory.direct.length,
  'duplicate direct semantic cluster row ID',
)
for (const entry of semanticClusterInventory.direct) {
  assert(
    typeof entry.rowId === 'string' &&
      /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(entry.rowId) &&
      entry.retained !== true &&
      Array.isArray(entry.clusterIds) &&
      entry.clusterIds.length > 0 &&
      Array.isArray(entry.sourcePaths) &&
      entry.sourcePaths.length > 0 &&
      new Set(entry.sourcePaths).size === entry.sourcePaths.length &&
      JSON.stringify(entry.sourcePaths) ===
        JSON.stringify([...entry.sourcePaths].sort()) &&
      entry.sourcePaths.every(sourcePath =>
        typeof sourcePath === 'string' &&
          sourcePath.startsWith('src/') &&
          !sourcePath.split('/').some(
            part => part === '' || part === '.' || part === '..',
          )) &&
      Array.isArray(entry.targetWitnesses) &&
      entry.targetWitnesses.length > 0 &&
      new Set(entry.targetWitnesses.map(witness => witness.value)).size ===
        entry.targetWitnesses.length &&
      entry.targetWitnesses.every(witness =>
        witness.kind === 'literal' &&
          typeof witness.value === 'string' &&
          witness.value.length > 0 &&
          Number.isSafeInteger(witness.count) &&
          witness.count > 0) &&
      Array.isArray(entry.testIds) &&
      entry.testIds.length > 0 &&
      new Set(entry.testIds).size === entry.testIds.length &&
      JSON.stringify(entry.testIds) ===
        JSON.stringify([...entry.testIds].sort()) &&
      entry.testIds.every(testId =>
        typeof testId === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(testId)),
    `${entry.rowId ?? 'direct cluster'}: invalid direct cluster evidence`,
  )
  const bindings = entry.clusterBindings
  assert(
    Array.isArray(bindings) &&
      bindings.length === entry.clusterIds.length &&
      JSON.stringify(bindings.map(binding => binding.clusterId)) ===
        JSON.stringify(entry.clusterIds),
    `${entry.rowId}: cluster bindings are not one-to-one`,
  )
  for (const binding of bindings) {
    const witness = binding.targetWitness
    assert(
      witness?.kind === 'raw-statement' &&
        ['baseline', 'target'].includes(witness.side) &&
        Number.isSafeInteger(witness.statementIndex) &&
        witness.statementIndex >= 0 &&
        Number.isSafeInteger(witness.start) &&
        witness.start >= 0 &&
        Number.isSafeInteger(witness.end) &&
        witness.end > witness.start &&
        Number.isSafeInteger(witness.bytes) &&
        witness.bytes > 0 &&
        typeof witness.sha256 === 'string' &&
        /^[0-9a-f]{64}$/.test(witness.sha256) &&
        typeof witness.normalizedSha256 === 'string' &&
        /^[0-9a-f]{64}$/.test(witness.normalizedSha256) &&
        Number.isSafeInteger(witness.count) &&
        witness.count > 0 &&
        Number.isSafeInteger(witness.otherSideCount) &&
        witness.otherSideCount >= 0 &&
        witness.count !== witness.otherSideCount,
      `${entry.rowId}/C${binding.clusterId}: invalid statement witness`,
    )
    const additionalTargetWitnesses = binding.additionalTargetWitnesses ?? []
    const targetWitnesses = [witness, ...additionalTargetWitnesses]
    assert(
      Array.isArray(additionalTargetWitnesses) &&
        (binding.additionalTargetWitnesses === undefined ||
          additionalTargetWitnesses.length > 0) &&
        JSON.stringify(additionalTargetWitnesses.map(value => [
          value.side,
          value.statementIndex,
        ])) === JSON.stringify(
          additionalTargetWitnesses
            .map(value => [value.side, value.statementIndex])
            .sort((left, right) =>
              left[0].localeCompare(right[0]) || left[1] - right[1]),
        ) &&
        new Set(targetWitnesses.map(value =>
          `${value?.side}\u0000${value?.statementIndex}`)).size ===
          targetWitnesses.length &&
        additionalTargetWitnesses.every(value =>
          value?.kind === 'raw-statement' &&
            ['baseline', 'target'].includes(value.side) &&
            Number.isSafeInteger(value.statementIndex) &&
            value.statementIndex >= 0 &&
            Number.isSafeInteger(value.start) &&
            value.start >= 0 &&
            Number.isSafeInteger(value.end) &&
            value.end > value.start &&
            Number.isSafeInteger(value.bytes) &&
            value.bytes > 0 &&
            typeof value.sha256 === 'string' &&
            /^[0-9a-f]{64}$/.test(value.sha256) &&
            Number.isSafeInteger(value.count) &&
            value.count > 0 &&
            Number.isSafeInteger(value.otherSideCount) &&
            value.otherSideCount >= 0 &&
            value.count !== value.otherSideCount),
      `${entry.rowId}/C${binding.clusterId}: invalid additional statement witnesses`,
    )
    assert(
      Array.isArray(binding.sourceWitnesses) &&
        binding.sourceWitnesses.length > 0 &&
        binding.sourceWitnesses.every(sourceWitness => {
          if (
            typeof sourceWitness.path !== 'string' ||
            !sourceWitness.path.startsWith('src/') ||
            sourceWitness.path.split('/').some(
              part => part === '' || part === '.' || part === '..'
            ) ||
            typeof sourceWitness.fragment !== 'string' ||
            sourceWitness.fragment.length === 0 ||
            !Number.isSafeInteger(sourceWitness.count) ||
            sourceWitness.count <= 0 ||
            sourceWitness.reviewed !== true ||
            !Array.isArray(sourceWitness.matchedSemanticTerms) ||
            !sourceWitness.matchedSemanticTerms.every(term =>
              typeof term === 'string' && term.length > 0) ||
            new Set(sourceWitness.matchedSemanticTerms).size !==
              sourceWitness.matchedSemanticTerms.length
          ) return false
          const source = fs.readFileSync(
            path.join(repo, sourceWitness.path),
            'utf8',
          )
          return occurrences(source, sourceWitness.fragment) ===
            sourceWitness.count
        }) &&
        Array.isArray(binding.testIds) &&
        binding.testIds.length > 0,
      `${entry.rowId}/C${binding.clusterId}: source/test binding`,
    )
  }
  assert(
    JSON.stringify([
      ...new Set(bindings.flatMap(binding =>
        binding.sourceWitnesses.map(sourceWitness => sourceWitness.path))),
    ].sort()) === JSON.stringify(entry.sourcePaths) &&
      JSON.stringify([
        ...new Set(bindings.flatMap(binding => binding.testIds)),
      ].sort()) === JSON.stringify(entry.testIds),
    `${entry.rowId}: row fields differ from cluster-binding unions`,
  )
}
for (const [index, entry] of semanticClusterInventory.accountingOnly.entries()) {
  assert(
    Array.isArray(entry.clusterIds) &&
      entry.clusterIds.length > 0 &&
      accountingReasons.has(entry.reason) &&
      entry.evidence &&
      typeof entry.evidence === 'object' &&
      !Array.isArray(entry.evidence) &&
      Object.keys(entry.evidence).length > 0,
    `accounting-only cluster group ${index + 1}: invalid evidence`,
  )
}
const directClusterIds = new Set(
  semanticClusterInventory.direct.flatMap(entry => entry.clusterIds),
)
const accountingClusterIds = new Set(
  semanticClusterInventory.accountingOnly.flatMap(entry => entry.clusterIds),
)
validateAccountingTopology(
  semanticClusterInventory.accountingOnly,
  directClusterIds,
)
assert(
  requiredDirectClusterIds.every(clusterId =>
    directClusterIds.has(clusterId) && !accountingClusterIds.has(clusterId)),
  'reviewed mixed-active clusters must be direct',
)
assert(
  JSON.stringify([...accountingClusterIds].sort((left, right) => left - right)) ===
    JSON.stringify(expectedAccountingClusterIds),
  'accounting-only clusters differ from the conservative reviewed set',
)
const supportBindings = semanticClusterInventory.supportBindings
assert(Array.isArray(supportBindings) && supportBindings.length > 0,
  'source-change support bindings are missing')
const supportIds = new Set()
const supportPaths = new Set()
for (const binding of supportBindings) {
  const sourceWitness = binding.sourceWitness
  assert(
    typeof binding.id === 'string' &&
      /^[a-z0-9][a-z0-9-]*$/.test(binding.id) &&
      !supportIds.has(binding.id) &&
      !directRowIds.has(binding.id) &&
      ['owning-direct-prerequisite', 'inherited-residual'].includes(
        binding.classification,
      ) &&
      typeof binding.reason === 'string' &&
      binding.reason.trim() === binding.reason &&
      binding.reason.length >= 20 &&
      binding.clusterId === undefined &&
      binding.clusterIds === undefined &&
      typeof sourceWitness?.path === 'string' &&
      sourceWitness.path.startsWith('src/') &&
      !sourceWitness.path.split('/').some(
        part => part === '' || part === '.' || part === '..',
      ) &&
      !supportPaths.has(sourceWitness.path) &&
      typeof sourceWitness.fragment === 'string' &&
      sourceWitness.fragment.length > 0 &&
      Number.isSafeInteger(sourceWitness.count) &&
      sourceWitness.count > 0 &&
      sourceWitness.reviewed === true &&
      Array.isArray(sourceWitness.matchedSemanticTerms) &&
      sourceWitness.matchedSemanticTerms.every(term =>
        typeof term === 'string' && term.length > 0) &&
      new Set(sourceWitness.matchedSemanticTerms).size ===
        sourceWitness.matchedSemanticTerms.length &&
      JSON.stringify(sourceWitness.matchedSemanticTerms) === JSON.stringify(
        [...sourceWitness.matchedSemanticTerms].sort(),
      ) &&
      occurrences(
        fs.readFileSync(path.join(repo, sourceWitness.path), 'utf8'),
        sourceWitness.fragment,
      ) === sourceWitness.count &&
      Array.isArray(binding.relatedDirectClusterIds) &&
      binding.relatedDirectClusterIds.length > 0 &&
      new Set(binding.relatedDirectClusterIds).size ===
        binding.relatedDirectClusterIds.length &&
      JSON.stringify(binding.relatedDirectClusterIds) === JSON.stringify(
        [...binding.relatedDirectClusterIds].sort((left, right) => left - right),
      ) &&
      binding.relatedDirectClusterIds.every(clusterId =>
        directClusterIds.has(clusterId)) &&
      Array.isArray(binding.testIds) &&
      binding.testIds.length > 0 &&
      new Set(binding.testIds).size === binding.testIds.length &&
      JSON.stringify(binding.testIds) ===
        JSON.stringify([...binding.testIds].sort()) &&
      binding.testIds.every(testId =>
        typeof testId === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(testId)),
    `${binding.id ?? 'support binding'}: invalid source-change support`,
  )
  supportIds.add(binding.id)
  supportPaths.add(sourceWitness.path)
}
assert(
  JSON.stringify(supportBindings.map(binding => binding.id)) ===
    JSON.stringify(supportBindings.map(binding => binding.id).sort()),
  'source-change support bindings are not canonical',
)
const changedPaths = changedSourcePaths()
const directOwnerPaths = [
  ...new Set(
    semanticClusterInventory.direct.flatMap(entry => entry.sourcePaths),
  ),
].sort()
assert(
  changedPaths.length === expectedChangedSourcePathCount &&
    directOwnerPaths.length === expectedDirectSourcePathCount &&
    supportPaths.size === expectedSupportSourcePathCount &&
    [...supportPaths].every(sourcePath => !directOwnerPaths.includes(sourcePath)),
  'precise direct owners and support paths overlap',
)
assert(
  JSON.stringify([...new Set([
    ...directOwnerPaths,
    ...supportPaths,
  ])].sort()) === JSON.stringify(changedPaths),
  'precise direct owners plus support paths differ from changed Git topology',
)
assert(
  semanticClusterInventory.direct.every(entry =>
    JSON.stringify(entry.sourcePaths) !== JSON.stringify(changedPaths)),
  'a direct row claims the complete global changed-source inventory',
)

assert(draft.schemaVersion === 4, 'draft schema')
assert(draft.case === '2.1.123-to-2.1.124', 'draft case')
assert(draft.releaseAdjacency.baseline === '2.1.123', 'draft baseline')
assert(draft.releaseAdjacency.target === '2.1.124', 'draft target')
assert(
  draft.releaseAdjacency.publicGitReleaseTagPresent === false &&
    draft.releaseAdjacency.publicChangelogSectionPresent === false &&
    draft.releaseAdjacency.publicReleaseAbsence ===
      'evidence/RELEASE-2.1.124-ABSENCE.json',
  'draft public-release absence binding',
)
assert(draft.recoveryScope.sourceClosurePending === true, 'source remains pending')
assert(draft.recoveryScope.semanticClosurePending === true, 'semantic proof remains pending')
assert(draft.generatedRecovery.attribution.unaccountedTargetUtf16 === 0,
  'generated attribution gap')
assert(draft.generatedRecovery.readableDiff.comparisonInvariantHashesEqual === true,
  'readable diff invariant')
assert(
  knownDeltaProof.complete === true &&
    knownDeltaProof.case === draft.case &&
    knownDeltaProof.release === '2.1.124' &&
    semanticClusterInventory?.schemaVersion === 1 &&
    semanticClusterInventory.totalClusters === 205 &&
    new Set(semanticClusterIds).size === 205 &&
    JSON.stringify(semanticClusterIds) === JSON.stringify(
      Array.from({ length: 205 }, (_, index) => index + 1),
    ) &&
    draft.generatedRecovery.structural.semanticClusterInventory
      ?.totalClusters === 205 &&
    draft.generatedRecovery.structural.semanticClusterInventory?.status ===
      'complete-partition-source-bindings-pending',
  'complete provisional semantic cluster partition',
)
assert(provenance.publicationAdjacency.targetIsNextPublishedVersion === true,
  'registry publication adjacency')
assert(provenance.publicationAdjacency.skippedVersionsAbsent === true,
  'registry skipped-version closure')
assert(
  provenance.publicReleaseAbsence?.path ===
      'evidence/RELEASE-2.1.124-ABSENCE.json' &&
    provenance.publicReleaseAbsence?.bytes === releaseAbsenceBytes.length &&
    provenance.publicReleaseAbsence?.sha256 === sha256(releaseAbsenceBytes) &&
    JSON.stringify(provenance.publicReleaseAbsence?.tag) ===
      JSON.stringify(releaseAbsence.tag) &&
    JSON.stringify(provenance.publicReleaseAbsence?.changelog) ===
      JSON.stringify(releaseAbsence.changelog),
  'provenance pins exact public-release absence evidence',
)
assert(
  releaseAbsence.schemaVersion === 1 &&
    releaseAbsence.kind === 'authenticated-public-release-absence' &&
    releaseAbsence.release === '2.1.124' &&
    releaseAbsence.tag?.name === 'v2.1.124' &&
    releaseAbsence.tag?.present === false &&
    releaseAbsence.changelog?.heading === '## 2.1.124' &&
    releaseAbsence.changelog?.present === false &&
    releaseAbsence.changelog?.bulletCount === 0,
  'authenticated public GitHub release absence',
)
const tagRefs = pinnedCaseEvidence(
  releaseAbsence.tag.refs,
  'public Git tag refs',
).toString('utf8')
const fullChangelog = pinnedCaseEvidence(
  releaseAbsence.changelog.fullSnapshot,
  'full public changelog',
).toString('utf8')
assert(
  !tagRefs.split('\n').some(
    line =>
      line.endsWith('\trefs/tags/v2.1.124') ||
      line.endsWith('\trefs/tags/v2.1.124^{}'),
  ),
  'v2.1.124 tag is absent from pinned refs',
)
assert(
  !fullChangelog.split(/\r?\n/).includes('## 2.1.124'),
  '2.1.124 heading is absent from pinned changelog',
)
for (const [label, report, metadata] of [
  ['wrapper', wrapperMembers, provenance.npm.wrapper],
  ['linux-x64', platformMembers, provenance.npm.linuxX64],
]) {
  assert(report.summary.complete === true, `${label}: complete tar inventory`)
  assert(report.artifacts.target.sha1 === metadata.registryShasum,
    `${label}: registry SHA-1`)
  assert(report.artifacts.target.integrity === metadata.registryIntegrity,
    `${label}: registry SHA-512`)
  assert(report.artifacts.target.sha256 === metadata.tarballSha256,
    `${label}: acquired SHA-256`)
  assert(report.artifacts.target.authentication.shasumVerified === true,
    `${label}: SHA-1 authenticated`)
  assert(report.artifacts.target.authentication.integrityVerified === true,
    `${label}: SHA-512 authenticated`)
  assert(report.artifacts.target.authentication.registrySignature.verified === true,
    `${label}: npm ECDSA signature authenticated`)
  assert(
    report.artifacts.target.authentication.registrySignature.keyId ===
      provenance.npm.registryKey.keyid,
    `${label}: live registry key identity`,
  )
}
assert(freeze.case === draft.case, 'freeze case')
assert(freeze.summary.files === freeze.files.length, 'freeze file count')
for (const entry of freeze.files) {
  const value = fs.readFileSync(path.join(caseRoot, entry.path))
  assert(value.length === entry.bytes, `${entry.path}: frozen bytes`)
  assert(sha256(value) === entry.sha256, `${entry.path}: frozen SHA-256`)
}
assert(specs.case === draft.case, 'spec case')
assert(specs.release === '2.1.124', 'spec release')
assert(specs.complete === false, 'provisional specs must fail closed')
assert(specs.rows.length === 0, 'zero official rows are provisionally enumerated')
assert(specs.rows.every(row => row.status === 'pending-source-recovery'),
  'no provisional row may claim verification')
assert(
  !fs.existsSync(path.join(caseRoot, 'manifest.json')) &&
    !fs.existsSync(path.join(caseRoot, 'semantic/direct-evidence.json')),
  'provisional checkpoint must not contain final proof outputs',
)

console.log(JSON.stringify({
  status: '2.1.124-provisional-proof-state-verified',
  frozenFiles: freeze.summary.files,
  officialRows: 0,
  sourceClosurePending: true,
  semanticClosurePending: true,
}))
