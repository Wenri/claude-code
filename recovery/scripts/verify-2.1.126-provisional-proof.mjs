#!/usr/bin/env node

import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  RELEASE_2_1_126,
  RELEASE_2_1_126_GENERATED_INPUTS,
  assertRelease21126GeneratedInputContract,
  assertRelease21126SourceOracleDeclaration,
} from '../lib/release-2.1.126-input-contract.mjs'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const caseRoot = path.join(repo, 'recovery/cases/2.1.124-to-2.1.126')
const baseRevision = RELEASE_2_1_126.baseRevision
const semanticTopology = RELEASE_2_1_126_GENERATED_INPUTS.semanticTopology
const accountingReasons = new Set([
  'dependency',
  'exact-relocation',
  'identifier-only',
  'initializer-linkage',
  'metadata',
])
const expectedAccountingClusterIds = semanticTopology.accountingClusterIds
const expectedAccountingReasonGroups = semanticTopology.accountingReasonGroups
const expectedInitializerPairedDirectClusterIds =
  semanticTopology.initializerPairedDirectClusterIds
const requiredDirectClusterIds = semanticTopology.requiredDirectClusterIds
const expectedClusterCount = semanticTopology.totalClusters
const expectedDirectClusterCount = semanticTopology.directClusterCount
const expectedAccountingClusterCount = semanticTopology.accountingClusterCount
const expectedDirectSourcePathCount = semanticTopology.directSourcePathCount
const expectedSupportSourcePathCount = semanticTopology.supportSourcePathCount
const expectedRetainedSourceRepairPathCount =
  semanticTopology.retainedSourceRepairPathCount
const expectedChangedSourcePathCount = semanticTopology.changedSourcePathCount

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
const knownDeltaProofBytes = fs.readFileSync(
  path.join(caseRoot, 'structural/known-delta-proof.json'),
)
const knownDeltaProof = JSON.parse(knownDeltaProofBytes)
const structuralIdentity = (relative, targetKey) => ({
  ...evidence(fs.readFileSync(path.join(caseRoot, relative))),
  ...(targetKey
    ? { [targetKey]: knownDeltaProof.ledgers.knownDeltaExact.target[targetKey] }
    : {}),
})
const generatedInputContract = assertRelease21126GeneratedInputContract({
  artifacts: draft.artifacts,
  attribution,
  attributionSummary: evidence(attributionSummaryBytes),
  readable,
  readableMetadata: evidence(readableMetadataBytes),
  structural: {
    rawLedger: structuralIdentity('structural/generated-delta.json.gz'),
    metadataNormalizedLedger: structuralIdentity(
      'structural/metadata-normalized-delta.json.gz',
    ),
    knownDeltaExactLedger: structuralIdentity(
      'structural/known-delta-ledger.json.gz',
    ),
    knownDeltaProof: evidence(knownDeltaProofBytes),
    targetUnits: knownDeltaProof.ledgers.knownDeltaExact.target.unitCount,
    targetTokens: knownDeltaProof.ledgers.knownDeltaExact.target.tokenCount,
  },
  structuralProof: knownDeltaProof,
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
assertRelease21126SourceOracleDeclaration(draft, generatedInputContract)
const freeze = JSON.parse(
  fs.readFileSync(path.join(caseRoot, 'freeze-index.json'), 'utf8'),
)
const specs = JSON.parse(
  fs.readFileSync(path.join(repo, 'recovery/2.1.126-direct-evidence-specs.json'), 'utf8'),
)
const provenance = JSON.parse(
  fs.readFileSync(path.join(caseRoot, 'evidence/provenance.json'), 'utf8'),
)
const releasePresencePath = path.join(
  caseRoot,
  RELEASE_2_1_126.officialReleasePresence,
)
const releasePresenceBytes = fs.readFileSync(releasePresencePath)
const releasePresence = JSON.parse(releasePresenceBytes)
const skippedAbsencePath = path.join(
  caseRoot,
  RELEASE_2_1_126.skippedRegistryAbsence,
)
const skippedAbsenceBytes = fs.readFileSync(skippedAbsencePath)
const skippedAbsence = JSON.parse(skippedAbsenceBytes)
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
assert(
  knownDeltaProofBytes.length === knownDeltaProofRecord.bytes &&
    sha256(knownDeltaProofBytes) === knownDeltaProofRecord.sha256,
  'known-delta proof identity',
)
const semanticClusterInventory = knownDeltaProof.knownDelta?.clusterInventory
assert(
  semanticClusterInventory?.schemaVersion === 1 &&
    semanticClusterInventory.totalClusters === expectedClusterCount &&
    Array.isArray(semanticClusterInventory.direct) &&
    Array.isArray(semanticClusterInventory.accountingOnly),
  'semantic cluster inventory identity',
)
const semanticClusterIds = [
  ...semanticClusterInventory.direct.flatMap(entry => entry.clusterIds),
  ...semanticClusterInventory.accountingOnly.flatMap(entry => entry.clusterIds),
].sort((left, right) => left - right)
const directRowIds = new Set(
  semanticClusterInventory.direct.map(entry => entry.rowId),
)
assert(
  directRowIds.size ===
    semanticClusterInventory.direct.length,
  'duplicate direct semantic cluster row ID',
)
for (const entry of semanticClusterInventory.direct) {
  assert(
    typeof entry.rowId === 'string' &&
      /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(entry.rowId) &&
      entry.retained !== true &&
      Array.isArray(entry.releaseBullets ?? []) &&
      new Set(entry.releaseBullets ?? []).size ===
        (entry.releaseBullets ?? []).length &&
      JSON.stringify(entry.releaseBullets ?? []) === JSON.stringify(
        [...(entry.releaseBullets ?? [])].sort((left, right) => left - right),
      ) &&
      (entry.releaseBullets ?? []).every(releaseBullet =>
        Number.isSafeInteger(releaseBullet) &&
          releaseBullet >= 1 &&
          releaseBullet <= RELEASE_2_1_126.officialBulletCount) &&
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
          witness.count >= 0) &&
      Array.isArray(entry.testIds) &&
      JSON.stringify(entry.testIds) === JSON.stringify([
        'active-semantics',
        'semantic-delta',
      ]) &&
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
        Array.isArray(binding.sourceAbsences ?? []) &&
        binding.sourceWitnesses.length + (binding.sourceAbsences ?? []).length >
          0 &&
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
        (binding.sourceAbsences ?? []).every(sourceAbsence => {
          if (
            typeof sourceAbsence.path !== 'string' ||
            !sourceAbsence.path.startsWith('src/') ||
            sourceAbsence.path.split('/').some(
              part => part === '' || part === '.' || part === '..'
            ) ||
            typeof sourceAbsence.fragment !== 'string' ||
            sourceAbsence.fragment.length === 0
          ) return false
          const source = fs.readFileSync(
            path.join(repo, sourceAbsence.path),
            'utf8',
          )
          return occurrences(source, sourceAbsence.fragment) === 0
        }) &&
        Array.isArray(binding.testIds) &&
        binding.testIds.length > 0,
      `${entry.rowId}/C${binding.clusterId}: source/test binding`,
    )
  }
  assert(
    JSON.stringify([
      ...new Set(bindings.flatMap(binding =>
        [
          ...binding.sourceWitnesses.map(sourceWitness => sourceWitness.path),
          ...(binding.sourceAbsences ?? []).map(sourceAbsence =>
            sourceAbsence.path),
        ])),
    ].sort()) === JSON.stringify(entry.sourcePaths) &&
      JSON.stringify([
        ...new Set(bindings.flatMap(binding => binding.testIds)),
      ].sort()) === JSON.stringify(entry.testIds),
    `${entry.rowId}: row fields differ from cluster-binding unions`,
  )
}
const releaseBulletClassification =
  knownDeltaProof.knownDelta?.releaseBulletClassification
const expectedOfficialBullets = Array.from(
  { length: RELEASE_2_1_126.officialBulletCount },
  (_, index) => index + 1,
)
const directActiveBullets = semanticClusterInventory.direct
  .flatMap(entry => entry.releaseBullets ?? [])
  .sort((left, right) => left - right)
const hiddenAdjacentRows = semanticClusterInventory.direct
  .filter(entry => (entry.releaseBullets ?? []).length === 0)
  .map(entry => entry.rowId)
  .sort()
assert(
  releaseBulletClassification?.total ===
      RELEASE_2_1_126.officialBulletCount &&
    JSON.stringify(releaseBulletClassification.activeAdjacent) ===
      JSON.stringify(directActiveBullets) &&
    JSON.stringify(releaseBulletClassification.baselineRetained) ===
      JSON.stringify(expectedOfficialBullets.filter(
        value => !directActiveBullets.includes(value),
      )) &&
    JSON.stringify(releaseBulletClassification.hiddenAdjacentRows) ===
      JSON.stringify(hiddenAdjacentRows) &&
    JSON.stringify(releaseBulletClassification.retainedSourceRepairRows) ===
      JSON.stringify(['ctrl-l-redraw']),
  'known-delta release-bullet classification',
)
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
assert(
  Array.isArray(supportBindings) &&
    supportBindings.length === expectedSupportSourcePathCount,
  'source-change support binding count differs from the frozen topology',
)
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
const targetRetainedRepairs = semanticClusterInventory.targetRetainedRepairs
assert(
  Array.isArray(targetRetainedRepairs) &&
    targetRetainedRepairs.length === 1 &&
    targetRetainedRepairs.every(repair =>
      repair.rowId === 'ctrl-l-redraw' &&
        repair.disposition === 'target-retained-source-repair' &&
        repair.retained === true &&
        JSON.stringify(repair.releaseBullets) === JSON.stringify([23]) &&
        JSON.stringify(repair.sourcePaths) ===
          JSON.stringify(['src/components/PromptInput/PromptInput.tsx']) &&
        JSON.stringify(repair.testIds) === JSON.stringify(['retained-redraw']) &&
        repair.bundleSemantics?.byteIdenticalAcrossAdjacentBundles === true &&
        Array.isArray(repair.bundleSemantics?.fragments) &&
        repair.bundleSemantics.fragments.every(fragment =>
          fragment.baselineCount > 0 &&
            fragment.baselineCount === fragment.targetCount) &&
        Array.isArray(repair.sourceWitnesses) &&
        repair.sourceWitnesses.length > 0 &&
        repair.sourceWitnesses.every(witness =>
          witness.reviewed === true &&
            occurrences(
              fs.readFileSync(path.join(repo, witness.path), 'utf8'),
              witness.fragment,
            ) === witness.count)),
  'target-retained source-repair proof inventory',
)
const changedPaths = changedSourcePaths()
const directOwnerPaths = [
  ...new Set(
    semanticClusterInventory.direct.flatMap(entry => entry.sourcePaths),
  ),
].sort()
const retainedRepairPaths = [
  ...new Set(targetRetainedRepairs.flatMap(repair => repair.sourcePaths)),
].sort()
assert(
  changedPaths.length === expectedChangedSourcePathCount &&
    directOwnerPaths.length === expectedDirectSourcePathCount &&
    supportPaths.size === expectedSupportSourcePathCount &&
    retainedRepairPaths.length === expectedRetainedSourceRepairPathCount &&
    [...supportPaths].every(sourcePath => !directOwnerPaths.includes(sourcePath)) &&
    retainedRepairPaths.every(sourcePath =>
      !directOwnerPaths.includes(sourcePath) && !supportPaths.has(sourcePath)),
  'adjacent owners, support paths, and retained repairs overlap',
)
assert(
  JSON.stringify([...new Set([
    ...directOwnerPaths,
    ...supportPaths,
    ...retainedRepairPaths,
  ])].sort()) === JSON.stringify(changedPaths),
  'adjacent owners, support paths, and retained repairs differ from changed Git topology',
)
const changedSourceInventory = knownDeltaProof.knownDelta?.changedSourcePaths
assert(
  changedSourceInventory?.baseRevision === baseRevision &&
    changedSourceInventory.activeOverlayRevision ===
      RELEASE_2_1_126_GENERATED_INPUTS.sourceRecovery.activeSourceCommit &&
    changedSourceInventory.recoveredOverlayRevision ===
      RELEASE_2_1_126_GENERATED_INPUTS.sourceRecovery.sourceCommit &&
    changedSourceInventory.recoveredSourceTree ===
      RELEASE_2_1_126_GENERATED_INPUTS.sourceRecovery.sourceSrcTree &&
    JSON.stringify(changedSourceInventory.paths) === JSON.stringify(changedPaths) &&
    JSON.stringify(changedSourceInventory.partitions?.activeAdjacent) ===
      JSON.stringify({ count: directOwnerPaths.length, paths: directOwnerPaths }) &&
    JSON.stringify(
      changedSourceInventory.partitions?.targetRetainedSourceRepairs,
    ) === JSON.stringify({
      count: retainedRepairPaths.length,
      paths: retainedRepairPaths,
    }),
  'known-delta source partition identity',
)
assert(
  semanticClusterInventory.direct.every(entry =>
    JSON.stringify(entry.sourcePaths) !== JSON.stringify(changedPaths)),
  'a direct row claims the complete global changed-source inventory',
)

assert(draft.schemaVersion === 4, 'draft schema')
assert(draft.case === '2.1.124-to-2.1.126', 'draft case')
assert(draft.releaseAdjacency.baseline === '2.1.124', 'draft baseline')
assert(draft.releaseAdjacency.target === '2.1.126', 'draft target')
assert(
  draft.releaseAdjacency.publicGitReleaseTagPresent === true &&
    draft.releaseAdjacency.publicChangelogSectionPresent === true &&
    draft.releaseAdjacency.officialReleaseNotes ===
      RELEASE_2_1_126.officialSection &&
    draft.releaseAdjacency.skippedRegistryAbsence ===
      RELEASE_2_1_126.skippedRegistryAbsence &&
    JSON.stringify(draft.releaseAdjacency.skipped) ===
      JSON.stringify(RELEASE_2_1_126.skipped),
  'draft public-release presence and skipped-version binding',
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
    knownDeltaProof.release === '2.1.126' &&
    semanticClusterInventory?.schemaVersion === 1 &&
    semanticClusterInventory.totalClusters === expectedClusterCount &&
    new Set(semanticClusterIds).size === expectedClusterCount &&
    JSON.stringify(semanticClusterIds) === JSON.stringify(
      Array.from({ length: expectedClusterCount }, (_, index) => index + 1),
    ) &&
    draft.generatedRecovery.structural.semanticClusterInventory
      ?.totalClusters === expectedClusterCount &&
    draft.generatedRecovery.structural.semanticClusterInventory
      ?.targetRetainedSourceRepairs === targetRetainedRepairs.length &&
    draft.generatedRecovery.structural.semanticClusterInventory
      ?.retainedSourceRepairPaths === retainedRepairPaths.length &&
    draft.generatedRecovery.structural.semanticClusterInventory?.status ===
      'complete-partition-source-bindings-pending',
  'complete provisional semantic cluster partition',
)
assert(provenance.publicationAdjacency.targetIsNextPublishedVersion === true,
  'registry publication adjacency')
assert(provenance.publicationAdjacency.skippedVersionsAbsent === true,
  'registry skipped-version closure')
assert(
  provenance.publicReleasePresence?.path ===
      RELEASE_2_1_126.officialReleasePresence &&
    provenance.publicReleasePresence?.bytes === releasePresenceBytes.length &&
    provenance.publicReleasePresence?.sha256 === sha256(releasePresenceBytes) &&
    JSON.stringify(provenance.publicReleasePresence?.tag) ===
      JSON.stringify(releasePresence.tag) &&
    JSON.stringify(provenance.publicReleasePresence?.changelog) ===
      JSON.stringify(releasePresence.changelog),
  'provenance pins exact public-release presence evidence',
)
assert(
  releasePresence.schemaVersion === 1 &&
    releasePresence.kind === 'authenticated-public-release-presence' &&
    releasePresence.release === '2.1.126' &&
    releasePresence.tag?.name === 'v2.1.126' &&
    releasePresence.tag?.present === true &&
    releasePresence.changelog?.heading === '## 2.1.126' &&
    releasePresence.changelog?.present === true &&
    releasePresence.changelog?.bulletCount ===
      RELEASE_2_1_126.officialBulletCount,
  'authenticated public GitHub release presence',
)
const tagRefs = pinnedCaseEvidence(
  releasePresence.tag.refs,
  'public Git tag refs',
).toString('utf8')
const fullChangelog = pinnedCaseEvidence(
  releasePresence.changelog.fullSnapshot,
  'full public changelog',
).toString('utf8')
const sectionChangelog = pinnedCaseEvidence(
  releasePresence.changelog.section,
  'official release section',
).toString('utf8')
assert(
  tagRefs.split('\n').some(
    line =>
      line.endsWith('\trefs/tags/v2.1.126') ||
      line.endsWith('\trefs/tags/v2.1.126^{}'),
  ),
  'v2.1.126 tag is present in pinned refs',
)
assert(
  occurrences(fullChangelog, sectionChangelog) === 1,
  '2.1.126 section is uniquely contained in the pinned changelog',
)
assert(
  skippedAbsence.schemaVersion === 1 &&
    skippedAbsence.kind === 'authoritative-npm-registry-version-absence' &&
    skippedAbsence.release === '2.1.125' &&
    skippedAbsence.publishedAdjacency?.targetIsNextPublishedVersion === true &&
    skippedAbsence.publishedAdjacency?.skippedVersionsAbsent === true &&
    skippedAbsence.packages?.length === 2 &&
    skippedAbsence.packages.every(entry =>
      entry.packument?.skippedVersionPresent === false &&
        entry.packument?.skippedPublicationTimePresent === false &&
        entry.missingVersionEndpoint?.httpStatus === 404),
  'authenticated skipped 2.1.125 registry absence',
)
assert(
  provenance.npm.skippedVersionAbsence?.path ===
      RELEASE_2_1_126.skippedRegistryAbsence &&
    provenance.npm.skippedVersionAbsence?.bytes === skippedAbsenceBytes.length &&
    provenance.npm.skippedVersionAbsence?.sha256 ===
      sha256(skippedAbsenceBytes) &&
    provenance.npm.skippedVersionAbsence?.kind === skippedAbsence.kind,
  'provenance pins exact skipped-version absence evidence',
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
assert(specs.release === '2.1.126', 'spec release')
assert(specs.complete === false, 'provisional specs must fail closed')
const officialBullets = sectionChangelog
  .split('\n')
  .filter(line => line.startsWith('- '))
  .map(line => line.slice(2))
assert(
  officialBullets.length === RELEASE_2_1_126.officialBulletCount &&
    specs.rows.length === RELEASE_2_1_126.officialBulletCount &&
    specs.rows.every((row, index) =>
      row.id === `B${String(index + 1).padStart(2, '0')}` &&
        row.category === 'official' &&
        row.releaseBullet === index + 1 &&
        row.title === officialBullets[index]),
  'all official rows are provisionally enumerated from the authenticated section',
)
assert(specs.rows.every(row => row.status === 'pending-source-recovery'),
  'no provisional row may claim verification')
assert(
  !fs.existsSync(path.join(caseRoot, 'manifest.json')) &&
    !fs.existsSync(path.join(caseRoot, 'semantic/direct-evidence.json')),
  'provisional checkpoint must not contain final proof outputs',
)

console.log(JSON.stringify({
  status: '2.1.126-provisional-proof-state-verified',
  frozenFiles: freeze.summary.files,
  officialRows: specs.rows.length,
  sourceClosurePending: true,
  semanticClosurePending: true,
}))
