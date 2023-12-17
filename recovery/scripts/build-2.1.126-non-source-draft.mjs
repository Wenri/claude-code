#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import {
  RELEASE_2_1_126,
  RELEASE_2_1_126_GENERATED_INPUTS,
  assertRelease21126GeneratedInputContract,
  assertRelease21126SourceOracleDeclaration,
} from '../lib/release-2.1.126-input-contract.mjs'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const caseRoot = path.join(repo, 'recovery/cases/2.1.124-to-2.1.126')
const priorManifestPath = path.join(
  repo,
  'recovery/cases/2.1.123-to-2.1.124/manifest.json',
)
const semanticTopology = RELEASE_2_1_126_GENERATED_INPUTS.semanticTopology
const structuralContract = RELEASE_2_1_126_GENERATED_INPUTS.structural
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

function usage() {
  console.error(
    'Usage: build-2.1.126-non-source-draft.mjs --artifacts DIR',
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

function assertDeepEqual(actual, expected, message) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message)
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

function safeSourcePath(relative) {
  return typeof relative === 'string' &&
    relative.startsWith('src/') &&
    !relative.split('/').some(part => part === '' || part === '.' || part === '..')
}

function rawStatementWitnessShape(witness) {
  return witness?.kind === 'raw-statement' &&
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
    witness.count !== witness.otherSideCount
}

function clusterTargetWitnessesShape(binding) {
  const additional = binding.additionalTargetWitnesses ?? []
  const witnesses = [binding.targetWitness, ...additional]
  return rawStatementWitnessShape(binding.targetWitness) &&
    Array.isArray(additional) &&
    (binding.additionalTargetWitnesses === undefined || additional.length > 0) &&
    additional.every(rawStatementWitnessShape) &&
    JSON.stringify(additional.map(witness => [
      witness.side,
      witness.statementIndex,
    ])) === JSON.stringify(
      additional
        .map(witness => [witness.side, witness.statementIndex])
        .sort((left, right) =>
          left[0].localeCompare(right[0]) || left[1] - right[1]),
    ) &&
    new Set(witnesses.map(witness =>
      `${witness?.side}\u0000${witness?.statementIndex}`)).size ===
      witnesses.length
}

function reviewedSourceWitnessShape(witness, requireReviewed = false) {
  if (
    !safeSourcePath(witness?.path) ||
    typeof witness.fragment !== 'string' ||
    witness.fragment.length === 0 ||
    !Number.isSafeInteger(witness.count) ||
    witness.count <= 0 ||
    typeof witness.reviewed !== 'boolean' ||
    !Array.isArray(witness.matchedSemanticTerms) ||
    witness.matchedSemanticTerms.some(term =>
      typeof term !== 'string' || term.length === 0) ||
    new Set(witness.matchedSemanticTerms).size !==
      witness.matchedSemanticTerms.length ||
    (witness.reviewed !== true && witness.matchedSemanticTerms.length === 0) ||
    (requireReviewed && witness.reviewed !== true)
  ) return false
  return occurrences(
    fs.readFileSync(path.join(repo, witness.path), 'utf8'),
    witness.fragment,
  ) === witness.count
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
  const platformMembers = readJson(
    'binary-extraction/native-package-members.json',
  )
  const exactDelta = readJson('diff/metadata.json')
  const attribution = readJson('attribution/summary.json')
  const readable = readJson('readable-diff/metadata.json')
  const structural = JSON.parse(
    zlib.gunzipSync(
      fs.readFileSync(path.join(caseRoot, 'structural/generated-delta.json.gz')),
    ),
  )
  const metadataNormalizedStructural = JSON.parse(
    zlib.gunzipSync(
      fs.readFileSync(
        path.join(caseRoot, 'structural/metadata-normalized-delta.json.gz'),
      ),
    ),
  )
  const knownDeltaStructural = JSON.parse(
    zlib.gunzipSync(
      fs.readFileSync(
        path.join(caseRoot, 'structural/known-delta-ledger.json.gz'),
      ),
    ),
  )
  const knownDeltaProof = readJson('structural/known-delta-proof.json')
  const structuralArtifacts = {
    rawLedger: assertion('structural/generated-delta.json.gz'),
    metadataLedger: assertion(
      'structural/metadata-normalized-delta.json.gz',
    ),
    exactLedger: assertion('structural/known-delta-ledger.json.gz'),
    proof: assertion('structural/known-delta-proof.json'),
  }

  assert(inventory.artifact.version === '2.1.126', 'Bun inventory version mismatch')
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
  assert(
    knownDeltaProof.schemaVersion === 1 &&
      knownDeltaProof.case === '2.1.124-to-2.1.126' &&
      knownDeltaProof.release === '2.1.126' &&
      knownDeltaProof.complete === true,
    'known-delta proof identity or completeness',
  )
  const semanticClusterInventory = knownDeltaProof.knownDelta?.clusterInventory
  assert(
    semanticClusterInventory?.schemaVersion === 1 &&
      semanticClusterInventory.totalClusters === expectedClusterCount &&
      Array.isArray(semanticClusterInventory.direct) &&
      semanticClusterInventory.direct.length > 0 &&
      Array.isArray(semanticClusterInventory.accountingOnly) &&
      semanticClusterInventory.accountingOnly.length > 0,
    'known-delta semantic cluster inventory',
  )
  const semanticClusterIds = [
    ...semanticClusterInventory.direct.flatMap(entry => entry.clusterIds),
    ...semanticClusterInventory.accountingOnly.flatMap(entry => entry.clusterIds),
  ].sort((left, right) => left - right)
  assert(
    new Set(semanticClusterIds).size === expectedClusterCount &&
      JSON.stringify(semanticClusterIds) === JSON.stringify(
        Array.from({ length: expectedClusterCount }, (_, index) => index + 1),
      ),
    'semantic clusters partition the exact frozen range',
  )
  const directClusterIds = semanticClusterInventory.direct.flatMap(
    entry => entry.clusterIds,
  )
  const accountingClusterIds = semanticClusterInventory.accountingOnly.flatMap(
    entry => entry.clusterIds,
  )
  validateAccountingTopology(
    semanticClusterInventory.accountingOnly,
    directClusterIds,
  )
  assert(
    requiredDirectClusterIds.every(clusterId =>
      directClusterIds.includes(clusterId) &&
        !accountingClusterIds.includes(clusterId)),
    'reviewed mixed-active clusters must be direct',
  )
  assert(
    JSON.stringify([...accountingClusterIds].sort((left, right) => left - right)) ===
      JSON.stringify(expectedAccountingClusterIds),
    'accounting-only clusters differ from the conservative reviewed set',
  )
  assert(
    semanticClusterInventory.direct.every(entry => {
      if (
        entry.retained === true ||
        !Array.isArray(entry.clusterIds) ||
        entry.clusterIds.length === 0 ||
        !Array.isArray(entry.clusterBindings) ||
        !entry.clusterBindings.every(binding =>
          Array.isArray(binding.sourceWitnesses) &&
            Array.isArray(binding.testIds))
      ) return false
      const sourcePaths = [
        ...new Set(entry.clusterBindings.flatMap(binding =>
          [
            ...binding.sourceWitnesses.map(witness => witness.path),
            ...(binding.sourceAbsences ?? []).map(witness => witness.path),
          ])),
      ].sort()
      const testIds = [
        ...new Set(entry.clusterBindings.flatMap(binding => binding.testIds)),
      ].sort()
      return (
        entry.clusterBindings.length === entry.clusterIds.length &&
        JSON.stringify(entry.clusterBindings.map(binding => binding.clusterId)) ===
          JSON.stringify(entry.clusterIds) &&
        entry.clusterBindings.every(binding =>
          clusterTargetWitnessesShape(binding) &&
            Array.isArray(binding.sourceWitnesses) &&
            binding.sourceWitnesses.every(witness =>
              reviewedSourceWitnessShape(witness, true)) &&
            Array.isArray(binding.sourceAbsences ?? []) &&
            binding.sourceWitnesses.length +
                (binding.sourceAbsences ?? []).length >
              0 &&
            (binding.sourceAbsences ?? []).every(witness =>
              safeSourcePath(witness?.path) &&
                typeof witness.fragment === 'string' &&
                witness.fragment.length > 0 &&
                occurrences(
                  fs.readFileSync(path.join(repo, witness.path), 'utf8'),
                  witness.fragment,
                ) === 0) &&
            Array.isArray(binding.testIds) &&
            binding.testIds.length > 0 &&
            new Set(binding.testIds).size === binding.testIds.length &&
            JSON.stringify(binding.testIds) ===
              JSON.stringify([...binding.testIds].sort())) &&
        JSON.stringify(sourcePaths) === JSON.stringify(entry.sourcePaths) &&
        JSON.stringify(testIds) === JSON.stringify(entry.testIds) &&
        Array.isArray(entry.targetWitnesses) &&
        entry.targetWitnesses.length > 0 &&
        entry.targetWitnesses.every(witness =>
          witness.kind === 'literal' &&
            typeof witness.value === 'string' &&
            witness.value.length > 0 &&
            Number.isSafeInteger(witness.count) &&
            witness.count >= 0)
      )
    }),
    'every direct cluster needs an exact statement/source/test binding',
  )
  const supportBindings = semanticClusterInventory.supportBindings
  const retainedRepairs = semanticClusterInventory.targetRetainedRepairs
  const directClusterIdSet = new Set(directClusterIds)
  const directRowIdSet = new Set(
    semanticClusterInventory.direct.map(entry => entry.rowId),
  )
  assert(
    Array.isArray(supportBindings) &&
      supportBindings.length === expectedSupportSourcePathCount &&
      new Set(supportBindings.map(binding => binding.id)).size ===
        supportBindings.length &&
      JSON.stringify(supportBindings.map(binding => binding.id)) ===
        JSON.stringify(supportBindings.map(binding => binding.id).sort()) &&
      supportBindings.every(binding =>
        typeof binding.id === 'string' &&
          /^[a-z0-9][a-z0-9-]*$/.test(binding.id) &&
          !directRowIdSet.has(binding.id) &&
          ['owning-direct-prerequisite', 'inherited-residual'].includes(
            binding.classification,
          ) &&
          typeof binding.reason === 'string' &&
          binding.reason.length >= 20 &&
          binding.clusterId === undefined &&
          binding.clusterIds === undefined &&
          binding.sourceWitness?.reviewed === true &&
          safeSourcePath(binding.sourceWitness.path) &&
          typeof binding.sourceWitness.fragment === 'string' &&
          binding.sourceWitness.fragment.length > 0 &&
          Number.isSafeInteger(binding.sourceWitness.count) &&
          binding.sourceWitness.count > 0 &&
          Array.isArray(binding.sourceWitness.matchedSemanticTerms) &&
          binding.sourceWitness.matchedSemanticTerms.every(term =>
            typeof term === 'string' && term.length > 0) &&
          new Set(binding.sourceWitness.matchedSemanticTerms).size ===
            binding.sourceWitness.matchedSemanticTerms.length &&
          JSON.stringify(binding.sourceWitness.matchedSemanticTerms) ===
            JSON.stringify([...binding.sourceWitness.matchedSemanticTerms].sort()) &&
          occurrences(
            fs.readFileSync(path.join(repo, binding.sourceWitness.path), 'utf8'),
            binding.sourceWitness.fragment,
          ) === binding.sourceWitness.count &&
          Array.isArray(binding.relatedDirectClusterIds) &&
          binding.relatedDirectClusterIds.length > 0 &&
          new Set(binding.relatedDirectClusterIds).size ===
            binding.relatedDirectClusterIds.length &&
          JSON.stringify(binding.relatedDirectClusterIds) === JSON.stringify(
            [...binding.relatedDirectClusterIds].sort((left, right) => left - right),
          ) &&
          binding.relatedDirectClusterIds.every(clusterId =>
            directClusterIdSet.has(clusterId)) &&
          Array.isArray(binding.testIds) &&
          binding.testIds.length > 0 &&
          new Set(binding.testIds).size === binding.testIds.length &&
          JSON.stringify(binding.testIds) ===
            JSON.stringify([...binding.testIds].sort())),
    'reviewed source-change support binding schema',
  )
  const preciseOwnerPaths = [
    ...new Set(
      semanticClusterInventory.direct.flatMap(entry => entry.sourcePaths),
    ),
  ].sort()
  const supportPaths = supportBindings
    .map(binding => binding.sourceWitness.path)
    .sort()
  const changedSourceInventory = knownDeltaProof.knownDelta?.changedSourcePaths
  const changedPaths = changedSourceInventory?.paths
  const retainedRepairPaths = [
    ...new Set((retainedRepairs ?? []).flatMap(entry => entry.sourcePaths ?? [])),
  ].sort()
  assert(
    Array.isArray(retainedRepairs) &&
      retainedRepairs.length === 1 &&
      retainedRepairs.every(entry =>
        entry.rowId === 'ctrl-l-redraw' &&
          entry.disposition === 'target-retained-source-repair' &&
          entry.retained === true &&
          JSON.stringify(entry.releaseBullets) === JSON.stringify([23]) &&
          JSON.stringify(entry.sourcePaths) ===
            JSON.stringify(['src/components/PromptInput/PromptInput.tsx']) &&
          JSON.stringify(entry.testIds) === JSON.stringify(['retained-redraw']) &&
          entry.bundleSemantics?.byteIdenticalAcrossAdjacentBundles === true &&
          Array.isArray(entry.sourceWitnesses) &&
          entry.sourceWitnesses.length > 0 &&
          entry.sourceWitnesses.every(witness =>
            safeSourcePath(witness.path) &&
              witness.reviewed === true &&
              Number.isSafeInteger(witness.count) &&
              witness.count > 0 &&
              occurrences(
                fs.readFileSync(path.join(repo, witness.path), 'utf8'),
                witness.fragment,
              ) === witness.count)),
    'target-retained source-repair proof inventory',
  )
  assert(
    Array.isArray(changedPaths) &&
      changedPaths.length === expectedChangedSourcePathCount &&
      preciseOwnerPaths.length === expectedDirectSourcePathCount &&
      supportPaths.length === expectedSupportSourcePathCount &&
      retainedRepairPaths.length === expectedRetainedSourceRepairPathCount &&
      new Set(supportPaths).size === supportPaths.length &&
      supportPaths.every(sourcePath => !preciseOwnerPaths.includes(sourcePath)) &&
      retainedRepairPaths.every(sourcePath =>
        !preciseOwnerPaths.includes(sourcePath) &&
          !supportPaths.includes(sourcePath)) &&
      JSON.stringify([...new Set([
        ...preciseOwnerPaths,
        ...supportPaths,
        ...retainedRepairPaths,
      ])].sort()) === JSON.stringify(changedPaths) &&
      changedSourceInventory.baseRevision === RELEASE_2_1_126.baseRevision &&
      changedSourceInventory.activeOverlayRevision ===
        RELEASE_2_1_126_GENERATED_INPUTS.sourceRecovery.activeSourceCommit &&
      changedSourceInventory.recoveredOverlayRevision ===
        RELEASE_2_1_126_GENERATED_INPUTS.sourceRecovery.sourceCommit &&
      changedSourceInventory.recoveredSourceTree ===
        RELEASE_2_1_126_GENERATED_INPUTS.sourceRecovery.sourceSrcTree &&
      JSON.stringify(changedSourceInventory.partitions?.activeAdjacent) ===
        JSON.stringify({ count: preciseOwnerPaths.length, paths: preciseOwnerPaths }) &&
      JSON.stringify(
        changedSourceInventory.partitions?.targetRetainedSourceRepairs,
      ) === JSON.stringify({
        count: retainedRepairPaths.length,
        paths: retainedRepairPaths,
      }) &&
      semanticClusterInventory.direct.every(entry =>
        JSON.stringify(entry.sourcePaths) !== JSON.stringify(changedPaths)),
    'adjacent owners, support paths, and retained repairs close changed-source topology',
  )
  const releaseClassification =
    knownDeltaProof.knownDelta?.releaseBulletClassification
  const allOfficialBullets = Array.from(
    { length: RELEASE_2_1_126.officialBulletCount },
    (_, index) => index + 1,
  )
  assert(
    releaseClassification?.total === RELEASE_2_1_126.officialBulletCount &&
      JSON.stringify(releaseClassification.activeAdjacent) ===
        JSON.stringify([10, 17, 18]) &&
      JSON.stringify(releaseClassification.baselineRetained) ===
        JSON.stringify(allOfficialBullets.filter(value => ![10, 17, 18].includes(value))) &&
      JSON.stringify(releaseClassification.hiddenAdjacentRows) ===
        JSON.stringify(['effort-settings-persistence']) &&
      JSON.stringify(releaseClassification.retainedSourceRepairRows) ===
        JSON.stringify(['ctrl-l-redraw']),
    'known-delta release-bullet classification including retained repair',
  )
  assertDeepEqual(
    knownDeltaProof.authenticatedInputs,
    {
      baseline:
        RELEASE_2_1_126_GENERATED_INPUTS.artifacts.baselineAnalyzableBundle,
      target:
        RELEASE_2_1_126_GENERATED_INPUTS.artifacts.targetAnalyzableBundle,
    },
    'known-delta authenticated inputs',
  )
  for (const key of ['rawLedger', 'metadataLedger', 'exactLedger']) {
    assertDeepEqual(
      knownDeltaProof.artifacts[key],
      structuralArtifacts[key],
      `known-delta ${key} identity`,
    )
  }
  assert(
    metadataNormalizedStructural.target.failureCount === 0 &&
      metadataNormalizedStructural.target.unitCount ===
        structuralContract.targetUnits &&
      metadataNormalizedStructural.target.tokenCount ===
        structuralContract.targetTokens,
    'metadata-normalized ledger target identity',
  )
  assert(
    knownDeltaStructural.target.failureCount === 0 &&
      knownDeltaStructural.target.unitCount === structuralContract.targetUnits &&
      knownDeltaStructural.target.tokenCount === structuralContract.targetTokens,
    'known-delta exact ledger target identity',
  )
  assertDeepEqual(
    knownDeltaStructural.coverage.units,
    {
      changed: 0,
      matched: structuralContract.targetUnits,
      moved: 0,
      unresolved: 0,
      total: structuralContract.targetUnits,
    },
    'known-delta exact unit coverage',
  )
  assertDeepEqual(
    knownDeltaStructural.coverage.tokens,
    {
      changed: 0,
      matched: structuralContract.targetTokens,
      moved: 0,
      unresolved: 0,
      total: structuralContract.targetTokens,
      ledgerTotal: structuralContract.targetTokens,
      resolved: structuralContract.targetTokens,
      resolvedFraction: 1,
      exactStructuralFraction: 1,
    },
    'known-delta exact token coverage',
  )
  assert(
    knownDeltaStructural.unmatchedBaseline.length === 0 &&
      knownDeltaStructural.unresolvedTarget.length === 0,
    'known-delta exact residue',
  )
  assertDeepEqual(
    knownDeltaProof.ledgers.knownDeltaExact.target,
    knownDeltaStructural.target,
    'known-delta proof target summary',
  )
  assertDeepEqual(
    knownDeltaProof.ledgers.knownDeltaExact.coverage,
    knownDeltaStructural.coverage,
    'known-delta proof coverage summary',
  )
  assert(
    knownDeltaProof.ledgers.knownDeltaExact.unmatchedBaselineCount === 0 &&
      knownDeltaProof.ledgers.knownDeltaExact.unresolvedTargetCount === 0,
    'known-delta proof zero residue summary',
  )

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
    '2.1.126-linux-x64/cli.js',
    'content',
  )
  targetBundle.byteSlice.prefixHex = '2f2f204062756e204062797465636f6465'
  const packageMember = memberPath => {
    const member = packageMembers.members.find(entry => entry.path === memberPath)
    assert(member?.target?.type === 'file', `missing target member ${memberPath}`)
    return member.target
  }
  const targetDeclarationsMember = packageMember('package/sdk-tools.d.ts')
  const targetPackageJsonMember = packageMember('package/package.json')
  const targetInstallMember = packageMember('package/install.cjs')
  const artifacts = [
    baselineTarball,
    baselineDeclarations,
    baselinePackageJson,
    baselineInstall,
    {
      id: 'targetTarball',
      argument: 'target-tarball',
      localPath: '2.1.126/package.tgz',
      bytes: packageMembers.artifacts.target.compressedBytes,
      sha256: packageMembers.artifacts.target.sha256,
      url: 'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.126.tgz',
    },
    {
      id: 'targetDeclarations',
      argument: 'target-dts',
      archive: 'targetTarball',
      archiveMember: 'package/sdk-tools.d.ts',
      localPath: '2.1.126/package/sdk-tools.d.ts',
      bytes: targetDeclarationsMember.bytes,
      sha256: targetDeclarationsMember.sha256,
    },
    {
      id: 'targetPackageJson',
      argument: 'target-package-json',
      archive: 'targetTarball',
      archiveMember: 'package/package.json',
      localPath: '2.1.126/package/package.json',
      bytes: targetPackageJsonMember.bytes,
      sha256: targetPackageJsonMember.sha256,
    },
    {
      id: 'targetInstall',
      argument: 'target-install',
      archive: 'targetTarball',
      archiveMember: 'package/install.cjs',
      localPath: '2.1.126/package/install.cjs',
      bytes: targetInstallMember.bytes,
      sha256: targetInstallMember.sha256,
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
      localPath: '2.1.126-linux-x64/package.tgz',
      bytes: platformMembers.artifacts.target.compressedBytes,
      sha256: platformMembers.artifacts.target.sha256,
      url: 'https://registry.npmjs.org/@anthropic-ai/claude-code-linux-x64/-/claude-code-linux-x64-2.1.126.tgz',
    },
    {
      id: 'targetExecutable',
      argument: 'target-executable',
      archive: 'targetPlatformTarball',
      archiveMember: 'package/claude',
      localPath: '2.1.126-linux-x64/package/claude',
      bytes: inventory.artifact.bytes,
      sha256: inventory.artifact.sha256,
    },
    targetBundle,
    {
      id: 'targetAnalyzableBundle',
      argument: 'target-analyzable',
      localPath: '2.1.126-linux-x64/cli.inner.js',
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
      '2.1.126-linux-x64/cli.jsc',
      'jsc',
    ),
    moduleArtifact(
      inventory,
      1,
      'targetImageProcessorJs',
      'target-image-js',
      '2.1.126-linux-x64/image-processor.js',
      'content',
    ),
    moduleArtifact(
      inventory,
      2,
      'targetAudioCaptureJs',
      'target-audio-js',
      '2.1.126-linux-x64/audio-capture.js',
      'content',
    ),
    moduleArtifact(
      inventory,
      3,
      'targetImageProcessorNative',
      'target-image-native',
      '2.1.126-linux-x64/image-processor.node',
      'content',
    ),
    moduleArtifact(
      inventory,
      4,
      'targetAudioCaptureNative',
      'target-audio-native',
      '2.1.126-linux-x64/audio-capture.node',
      'content',
    ),
    clone(priorArtifacts.get('sourceOracleBundle')),
    clone(priorArtifacts.get('sourceOracleMap')),
  ]

  const embeddedArtifacts = [
    artifacts.find(item => item.id === 'targetBundle'),
    artifacts.find(item => item.id === 'targetImageProcessorJs'),
    artifacts.find(item => item.id === 'targetAudioCaptureJs'),
  ]
  const generatedInputContract = assertRelease21126GeneratedInputContract({
    artifacts,
    attribution,
    attributionSummary: assertion('attribution/summary.json'),
    readable,
    readableMetadata: assertion('readable-diff/metadata.json'),
    structural: {
      rawLedger: evidence(
        path.join(caseRoot, 'structural/generated-delta.json.gz'),
      ),
      metadataNormalizedLedger: evidence(
        path.join(
          caseRoot,
          'structural/metadata-normalized-delta.json.gz',
        ),
      ),
      knownDeltaExactLedger: evidence(
        path.join(caseRoot, 'structural/known-delta-ledger.json.gz'),
      ),
      knownDeltaProof: evidence(
        path.join(caseRoot, 'structural/known-delta-proof.json'),
      ),
      targetUnits: knownDeltaStructural.target.unitCount,
      targetTokens: knownDeltaStructural.target.tokenCount,
    },
    structuralProof: knownDeltaProof,
  })
  for (const artifact of artifacts) {
    const filename = path.join(args.artifacts, artifact.localPath)
    const actual = evidence(filename)
    assert(actual.bytes === artifact.bytes, `${artifact.id} byte mismatch`)
    assert(actual.sha256 === artifact.sha256, `${artifact.id} SHA-256 mismatch`)
  }
  const fileAssertions = reportFiles()
  const freeze = {
    schemaVersion: 1,
    case: '2.1.124-to-2.1.126',
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
    case: '2.1.124-to-2.1.126',
    draft: {
      kind: 'authenticated-non-source-recovery',
      status: 'source-freeze-semantic-correspondence-and-final-docs-pending',
      generatedBy: 'recovery/scripts/build-2.1.126-non-source-draft.mjs',
      rule:
        'Published artifacts, exact deltas, generated attribution, structural accounting, and readable review outputs are frozen. Source-facing recovery and semantic closure remain pending.',
    },
    releaseAdjacency: {
      baseline: '2.1.124',
      target: '2.1.126',
      targetIsNextPublishedVersion: true,
      skipped: ['2.1.125'],
      skippedVersionsAbsent: true,
      provenance: 'evidence/provenance.json',
      publicGitReleaseTagPresent: true,
      publicChangelogSectionPresent: true,
      officialReleaseNotes: 'evidence/CHANGELOG-2.1.126.md',
      skippedRegistryAbsence:
        'evidence/REGISTRY-2.1.125-ABSENCE.json',
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
        'The matching 2.1.88 bundle/map pair is the cumulative historical ownership oracle used by generated attribution. The structural ledger, readable diff, deterministic known-delta proof, and semantic-correspondence witness/count comparisons independently use the authenticated adjacent 2.1.124 and 2.1.126 analyzable Linux x64 bundles; semantic correspondence consumes cumulative attribution only as target ownership evidence.',
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
        ...generatedInputContract.attribution,
        offsetUnit: 'utf16-code-units',
        targetUtf16: attribution.coverage.targetUtf16,
        accountedTargetUtf16: attribution.coverage.accountedTargetUtf16,
        unaccountedTargetUtf16: attribution.coverage.unaccountedTargetUtf16,
        targetRanges: 'attribution/target-ranges.jsonl.gz',
        targetRangeCount: attribution.coverage.targetRangeCount,
        targetRangeUtf16: attribution.coverage.targetRangeUtf16,
      },
      structural: {
        status:
          'authenticated-inputs-exhaustively-accounted-with-zero-residue-known-delta',
        ...generatedInputContract.structural,
        ledger: 'structural/generated-delta.json.gz',
        rawLedger: structuralArtifacts.rawLedger,
        metadataNormalizedLedger: structuralArtifacts.metadataLedger,
        knownDeltaExactLedger: structuralArtifacts.exactLedger,
        knownDeltaProof: structuralArtifacts.proof,
        targetUnits: structural.target.unitCount,
        targetTokens: structural.target.tokenCount,
        matchedTokens: structural.coverage.tokens.matched,
        movedCandidateTokens: structural.coverage.tokens.moved,
        coarseChangedTokens: structural.coverage.tokens.changed,
        unresolvedTokens: structural.coverage.tokens.unresolved,
        exactStructuralFraction:
          structural.coverage.tokens.exactStructuralFraction,
        resolvedStructuralFraction: structural.coverage.tokens.resolvedFraction,
        knownDeltaClosure: {
          targetUnits: knownDeltaStructural.target.unitCount,
          targetTokens: knownDeltaStructural.target.tokenCount,
          changedUnits: knownDeltaStructural.coverage.units.changed,
          movedUnits: knownDeltaStructural.coverage.units.moved,
          unresolvedUnits: knownDeltaStructural.coverage.units.unresolved,
          changedTokens: knownDeltaStructural.coverage.tokens.changed,
          movedTokens: knownDeltaStructural.coverage.tokens.moved,
          unresolvedTokens: knownDeltaStructural.coverage.tokens.unresolved,
          unmatchedBaselineUnits: knownDeltaStructural.unmatchedBaseline.length,
          unresolvedTargetUnits: knownDeltaStructural.unresolvedTarget.length,
        },
        semanticClusterInventory: {
          totalClusters: semanticClusterInventory.totalClusters,
          directGroups: semanticClusterInventory.direct.length,
          directClusters: semanticClusterInventory.direct.reduce(
            (sum, entry) => sum + entry.clusterIds.length,
            0,
          ),
          accountingOnlyGroups: semanticClusterInventory.accountingOnly.length,
          accountingOnlyClusters: semanticClusterInventory.accountingOnly.reduce(
            (sum, entry) => sum + entry.clusterIds.length,
            0,
          ),
          supportBindings: supportBindings.length,
          supportSourcePaths: supportPaths.length,
          targetRetainedSourceRepairs: retainedRepairs.length,
          retainedSourceRepairPaths: retainedRepairPaths.length,
          status: 'complete-partition-source-bindings-pending',
        },
      },
      readableDiff: {
        status: 'authenticated-inputs-invariant-preserving',
        directory: 'readable-diff',
        ...generatedInputContract.readable,
        comparisonInvariantHashesEqual:
          readable.verification.comparisonInvariantHashesEqual,
        metadata: 'readable-diff/metadata.json',
        fullDiff: 'readable-diff/normalized.diff.gz',
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
  assertRelease21126SourceOracleDeclaration(draft, generatedInputContract)
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
