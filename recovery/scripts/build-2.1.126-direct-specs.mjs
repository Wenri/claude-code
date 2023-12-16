#!/usr/bin/env node

import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  RELEASE_2_1_126,
  RELEASE_2_1_126_GENERATED_INPUTS,
  assertRelease21126TopologyFrozen,
} from '../lib/release-2.1.126-input-contract.mjs'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const caseRoot = path.join(repo, 'recovery/cases/2.1.124-to-2.1.126')
const changelogPath = path.join(
  caseRoot,
  RELEASE_2_1_126.officialSection,
)
const releasePresencePath = path.join(
  caseRoot,
  RELEASE_2_1_126.officialReleasePresence,
)
const skippedAbsencePath = path.join(
  caseRoot,
  RELEASE_2_1_126.skippedRegistryAbsence,
)
const reviewedOfficialPath = path.join(
  repo,
  'recovery/2.1.126-reviewed-official-evidence.json',
)
const reviewedOfficialBuilderPath = path.join(
  repo,
  'recovery/scripts/build-2.1.126-reviewed-official-evidence.mjs',
)
const priorDirectEvidencePath = path.join(
  repo,
  'recovery/cases/2.1.123-to-2.1.124/semantic/direct-evidence.json',
)
const knownDeltaProofPath = path.join(
  caseRoot,
  'structural/known-delta-proof.json',
)
const outputPath = path.join(repo, 'recovery/2.1.126-direct-evidence-specs.json')
const baseRevision = RELEASE_2_1_126.baseRevision
const semanticTopology = RELEASE_2_1_126_GENERATED_INPUTS.semanticTopology
const expectedClusterCount = semanticTopology.totalClusters
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
const expectedDirectClusterCount = semanticTopology.directClusterCount
const expectedAccountingClusterCount = semanticTopology.accountingClusterCount
const expectedDirectSourcePathCount = semanticTopology.directSourcePathCount
const expectedSupportSourcePathCount = semanticTopology.supportSourcePathCount
const expectedRetainedSourceRepairPathCount =
  semanticTopology.retainedSourceRepairPathCount
const expectedChangedSourcePathCount = semanticTopology.changedSourcePathCount
const expectedFocusedTestCount = semanticTopology.focusedTestCount
const final = process.argv.slice(2).includes('--final')

if (process.argv.slice(2).some(argument => argument !== '--final')) {
  throw new Error('Usage: build-2.1.126-direct-specs.mjs [--final]')
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function metadata(filename) {
  const value = fs.readFileSync(filename)
  return {
    path: path.relative(repo, filename).replaceAll('\\', '/'),
    bytes: value.length,
    sha256: sha256(value),
  }
}

function safeSourcePath(relative, label) {
  assert(
    typeof relative === 'string' &&
      relative.startsWith('src/') &&
      !relative.split('/').some(part => part === '' || part === '.' || part === '..'),
    `${label}: unsafe source path`,
  )
  return relative
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

function validateReviewedSourceWitness(sourceWitness, label) {
  const sourcePath = safeSourcePath(sourceWitness?.path, label)
  assert(
    typeof sourceWitness.fragment === 'string' &&
      sourceWitness.fragment.length > 0 &&
      Number.isSafeInteger(sourceWitness.count) &&
      sourceWitness.count > 0 &&
      sourceWitness.reviewed === true &&
      Array.isArray(sourceWitness.matchedSemanticTerms) &&
      sourceWitness.matchedSemanticTerms.every(term =>
        typeof term === 'string' && term.length > 0) &&
      new Set(sourceWitness.matchedSemanticTerms).size ===
        sourceWitness.matchedSemanticTerms.length,
    `${label}: invalid reviewed source witness`,
  )
  const source = fs.readFileSync(path.join(repo, sourcePath), 'utf8')
  assert(
    occurrences(source, sourceWitness.fragment) === sourceWitness.count,
    `${label}: source witness count`,
  )
  return sourcePath
}

function validateRetainedSourceWitness(sourceWitness, label) {
  const sourcePath = safeSourcePath(sourceWitness?.path, label)
  assert(
    typeof sourceWitness.fragment === 'string' &&
      sourceWitness.fragment.length > 0 &&
      Number.isSafeInteger(sourceWitness.count) &&
      sourceWitness.count > 0 &&
      Object.keys(sourceWitness).sort().join(',') === 'count,fragment,path',
    `${label}: invalid retained source witness`,
  )
  const source = fs.readFileSync(path.join(repo, sourcePath), 'utf8')
  assert(
    occurrences(source, sourceWitness.fragment) === sourceWitness.count,
    `${label}: retained source witness count`,
  )
  return sourcePath
}

function changedSourceRows() {
  return execFileSync(
    'git',
    ['diff', '--name-status', '--no-renames', `${baseRevision}..HEAD`, '--', 'src'],
    { cwd: repo, encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [status, sourcePath] = line.split('\t')
      assert(['A', 'M', 'D'].includes(status), `unsupported source status: ${line}`)
      return { status, path: safeSourcePath(sourcePath, line) }
    })
    .sort((left, right) => left.path.localeCompare(right.path))
}

function focusedTestIds() {
  return fs
    .readdirSync(path.join(repo, 'recovery/test'))
    .filter(
      name =>
        /^recovery-2\.1\.126-.*\.test\.mjs$/.test(name) &&
        name !== 'recovery-2.1.126-direct-evidence.test.mjs',
    )
    .map(name =>
      name
        .replace(/^recovery-2\.1\.126-/, '')
        .replace(/\.test\.mjs$/, ''),
    )
    .sort()
}

function validateClusterIds(clusterIds, label) {
  assert(Array.isArray(clusterIds) && clusterIds.length > 0,
    `${label}: empty cluster ID group`)
  assert(
    clusterIds.every(clusterId =>
      Number.isSafeInteger(clusterId) &&
        clusterId >= 1 &&
        clusterId <= expectedClusterCount),
    `${label}: invalid cluster ID`,
  )
  assert(new Set(clusterIds).size === clusterIds.length,
    `${label}: duplicate cluster ID`)
  assert(
    JSON.stringify(clusterIds) ===
      JSON.stringify([...clusterIds].sort((left, right) => left - right)),
    `${label}: cluster IDs are not canonical`,
  )
}

function validateRawStatementWitness(witness, label) {
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
    `${label}: invalid raw-statement witness`,
  )
}

function validateClusterBindings(entry) {
  const bindings = entry.clusterBindings
  assert(
    Array.isArray(bindings) && bindings.length === entry.clusterIds.length,
    `${entry.rowId}: cluster bindings are not one-to-one`,
  )
  assert(
    JSON.stringify(bindings.map(binding => binding.clusterId)) ===
      JSON.stringify(entry.clusterIds),
    `${entry.rowId}: cluster binding IDs differ from the direct cluster IDs`,
  )
  const sourceWitnesses = new Map()
  for (const binding of bindings) {
    const additionalTargetWitnesses = binding.additionalTargetWitnesses ?? []
    assert(
      Array.isArray(additionalTargetWitnesses) &&
        (binding.additionalTargetWitnesses === undefined ||
          additionalTargetWitnesses.length > 0) &&
        JSON.stringify(additionalTargetWitnesses.map(witness => [
          witness.side,
          witness.statementIndex,
        ])) === JSON.stringify(
          additionalTargetWitnesses
            .map(witness => [witness.side, witness.statementIndex])
            .sort((left, right) =>
              left[0].localeCompare(right[0]) || left[1] - right[1]),
        ),
      `${entry.rowId}/C${binding.clusterId}: additional witnesses are not canonical`,
    )
    const targetWitnesses = [
      binding.targetWitness,
      ...additionalTargetWitnesses,
    ]
    assert(
      new Set(targetWitnesses.map(witness =>
        `${witness?.side}\u0000${witness?.statementIndex}`)).size ===
        targetWitnesses.length,
      `${entry.rowId}/C${binding.clusterId}: duplicate statement witness`,
    )
    targetWitnesses.forEach((witness, index) =>
      validateRawStatementWitness(
        witness,
        `${entry.rowId}/C${binding.clusterId}/W${index + 1}`,
      ))
    assert(
      Array.isArray(binding.sourceWitnesses) &&
        Array.isArray(binding.sourceAbsences ?? []) &&
        binding.sourceWitnesses.length + (binding.sourceAbsences ?? []).length >
          0,
      `${entry.rowId}/C${binding.clusterId}: no source owner or callsite`,
    )
    const bindingSourceKeys = new Set()
    for (const sourceWitness of binding.sourceWitnesses) {
      const sourcePath = validateReviewedSourceWitness(
        sourceWitness,
        `${entry.rowId}/C${binding.clusterId}: source witness`,
      )
      assert(
        entry.sourcePaths.includes(sourcePath),
        `${entry.rowId}/C${binding.clusterId}: source witness outside owners`,
      )
      const key = `${sourcePath}\u0000${sourceWitness.fragment}`
      assert(
        !bindingSourceKeys.has(key),
        `${entry.rowId}/C${binding.clusterId}: duplicate source witness`,
      )
      bindingSourceKeys.add(key)
      const previous = sourceWitnesses.get(key)
      assert(
        previous === undefined || previous.count === sourceWitness.count,
        `${entry.rowId}: conflicting source witness count`,
      )
      sourceWitnesses.set(key, sourceWitness)
    }
    for (const sourceAbsence of binding.sourceAbsences ?? []) {
      const sourcePath = safeSourcePath(
        sourceAbsence?.path,
        `${entry.rowId}/C${binding.clusterId}: source absence`,
      )
      assert(
        entry.sourcePaths.includes(sourcePath) &&
          typeof sourceAbsence.fragment === 'string' &&
          sourceAbsence.fragment.length > 0 &&
          occurrences(
            fs.readFileSync(path.join(repo, sourcePath), 'utf8'),
            sourceAbsence.fragment,
          ) === 0,
        `${entry.rowId}/C${binding.clusterId}: invalid source absence`,
      )
    }
    assert(
      Array.isArray(binding.testIds) &&
        binding.testIds.length > 0 &&
        new Set(binding.testIds).size === binding.testIds.length &&
        JSON.stringify(binding.testIds) ===
          JSON.stringify([...binding.testIds].sort()) &&
        binding.testIds.every(testId =>
          typeof testId === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(testId)),
      `${entry.rowId}/C${binding.clusterId}: invalid focused tests`,
    )
  }
  const boundSourcePaths = [
    ...new Set(
      bindings.flatMap(binding =>
        [
          ...binding.sourceWitnesses.map(sourceWitness => sourceWitness.path),
          ...(binding.sourceAbsences ?? []).map(sourceAbsence =>
            sourceAbsence.path),
        ]),
    ),
  ].sort()
  const boundTestIds = [
    ...new Set(bindings.flatMap(binding => binding.testIds)),
  ].sort()
  assert(
    JSON.stringify(boundSourcePaths) === JSON.stringify(entry.sourcePaths),
    `${entry.rowId}: row source paths differ from cluster-binding owners`,
  )
  assert(
    JSON.stringify(boundTestIds) === JSON.stringify(entry.testIds),
    `${entry.rowId}: row tests differ from cluster-binding tests`,
  )
  return [...sourceWitnesses.values()].sort(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      left.fragment.localeCompare(right.fragment),
  )
}

function validateSupportBindings(inventory, directClusterIds) {
  const bindings = inventory.supportBindings
  assert(
    Array.isArray(bindings) &&
      bindings.length === expectedSupportSourcePathCount,
    'source-change support binding count differs from the frozen topology',
  )
  assert(
    JSON.stringify(bindings.map(binding => binding.id)) === JSON.stringify(
      bindings.map(binding => binding.id).sort(),
    ),
    'source-change support bindings are not canonical',
  )
  const ids = new Set()
  const paths = new Set()
  const directClusterIdSet = new Set(directClusterIds)
  for (const binding of bindings) {
    assert(
      typeof binding.id === 'string' &&
        /^[a-z0-9][a-z0-9-]*$/.test(binding.id) &&
        !ids.has(binding.id) &&
        ['owning-direct-prerequisite', 'inherited-residual'].includes(
          binding.classification,
        ) &&
        typeof binding.reason === 'string' &&
        binding.reason.trim() === binding.reason &&
        binding.reason.length >= 20 &&
        binding.clusterId === undefined &&
        binding.clusterIds === undefined,
      `${binding.id ?? 'support binding'}: invalid reviewed support identity`,
    )
    ids.add(binding.id)
    const sourcePath = validateReviewedSourceWitness(
      binding.sourceWitness,
      `${binding.id}: support source witness`,
    )
    assert(binding.sourceWitness.reviewed === true,
      `${binding.id}: support source witness must be explicitly reviewed`)
    assert(
      JSON.stringify(binding.sourceWitness.matchedSemanticTerms) ===
        JSON.stringify([...binding.sourceWitness.matchedSemanticTerms].sort()),
      `${binding.id}: support semantic terms are not canonical`,
    )
    assert(!paths.has(sourcePath), `${binding.id}: duplicate support source path`)
    paths.add(sourcePath)
    validateClusterIds(
      binding.relatedDirectClusterIds,
      `${binding.id}: related direct clusters`,
    )
    assert(
      binding.relatedDirectClusterIds.every(clusterId =>
        directClusterIdSet.has(clusterId)),
      `${binding.id}: relation references a non-direct cluster`,
    )
    assert(
      Array.isArray(binding.testIds) &&
        binding.testIds.length > 0 &&
        new Set(binding.testIds).size === binding.testIds.length &&
        JSON.stringify(binding.testIds) ===
          JSON.stringify([...binding.testIds].sort()) &&
        binding.testIds.every(testId =>
          typeof testId === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(testId)),
      `${binding.id}: invalid support focused tests`,
    )
  }
  return bindings
}

function validateSourcePathAbsences(entry) {
  const absences = entry.sourcePathAbsences ?? []
  assert(Array.isArray(absences), `${entry.rowId}: sourcePathAbsences`)
  for (const absence of absences) {
    assert(
      Array.isArray(absence.paths) && absence.paths.length > 0,
      `${entry.rowId}: empty source-path absence scope`,
    )
    assert(
      new Set(absence.paths).size === absence.paths.length,
      `${entry.rowId}: duplicate source-path absence scope`,
    )
    for (const sourcePath of absence.paths) {
      safeSourcePath(sourcePath, `${entry.rowId}: source-path absence`)
      assert(entry.sourcePaths.includes(sourcePath),
        `${entry.rowId}: source-path absence is outside source owners`)
    }
    assert(
      typeof absence.fragment === 'string' && absence.fragment.length > 0,
      `${entry.rowId}: empty source-path absence fragment`,
    )
  }
  return absences
}

function validateSourceFileAbsences(entry) {
  const absences = entry.sourceFileAbsences ?? []
  assert(Array.isArray(absences), `${entry.rowId}: sourceFileAbsences`)
  assert(new Set(absences).size === absences.length,
    `${entry.rowId}: duplicate source-file absence`)
  for (const sourcePath of absences) {
    safeSourcePath(sourcePath, `${entry.rowId}: source-file absence`)
    assert(entry.sourcePaths.includes(sourcePath),
      `${entry.rowId}: source-file absence is outside source owners`)
  }
  assert(
    JSON.stringify(absences) === JSON.stringify([...absences].sort()),
    `${entry.rowId}: source-file absences are not canonical`,
  )
  return absences
}

function clusterInventory() {
  const proof = JSON.parse(fs.readFileSync(knownDeltaProofPath, 'utf8'))
  assert(
    proof.schemaVersion === 1 &&
      proof.case === '2.1.124-to-2.1.126' &&
      proof.release === '2.1.126' &&
      proof.complete === true,
    'known-delta proof identity and completeness',
  )
  const inventory = proof.knownDelta?.clusterInventory
  assert(
    inventory?.schemaVersion === 1 &&
      inventory.totalClusters === expectedClusterCount &&
      Array.isArray(inventory.direct) &&
      inventory.direct.length > 0 &&
      Array.isArray(inventory.accountingOnly) &&
      inventory.accountingOnly.length > 0,
    'semantic cluster inventory identity',
  )
  const classification = proof.knownDelta?.releaseBulletClassification
  const expectedAll = Array.from(
    { length: RELEASE_2_1_126.officialBulletCount },
    (_, index) => index + 1,
  )
  assert(
    classification?.total === RELEASE_2_1_126.officialBulletCount &&
      Array.isArray(classification.activeAdjacent) &&
      Array.isArray(classification.baselineRetained) &&
      Array.isArray(classification.hiddenAdjacentRows) &&
      Array.isArray(classification.retainedSourceRepairRows) &&
      JSON.stringify([
        ...classification.activeAdjacent,
        ...classification.baselineRetained,
      ].sort((left, right) => left - right)) === JSON.stringify(expectedAll) &&
      new Set([
        ...classification.activeAdjacent,
        ...classification.baselineRetained,
      ]).size === RELEASE_2_1_126.officialBulletCount &&
      JSON.stringify(classification.hiddenAdjacentRows) ===
        JSON.stringify(['effort-settings-persistence']) &&
      JSON.stringify(classification.retainedSourceRepairRows) ===
        JSON.stringify(['ctrl-l-redraw']),
    'known-delta release-bullet classification',
  )

  const directRowIds = new Set()
  const directObligationIds = new Set()
  const activeOfficialBullets = new Set()
  for (const entry of inventory.direct) {
    assert(entry.retained === undefined || entry.retained === false,
      `${entry.rowId ?? 'direct cluster'}: retained bypass is forbidden`)
    assert(
      typeof entry.rowId === 'string' &&
        /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(entry.rowId),
      'direct cluster row ID',
    )
    assert(!directRowIds.has(entry.rowId), `duplicate direct row: ${entry.rowId}`)
    directRowIds.add(entry.rowId)
    const releaseBullets = entry.releaseBullets ?? []
    assert(
      Array.isArray(releaseBullets) &&
        new Set(releaseBullets).size === releaseBullets.length &&
        JSON.stringify(releaseBullets) ===
          JSON.stringify([...releaseBullets].sort((left, right) => left - right)) &&
        releaseBullets.every(releaseBullet =>
          Number.isSafeInteger(releaseBullet) &&
            releaseBullet >= 1 &&
            releaseBullet <= RELEASE_2_1_126.officialBulletCount),
      `${entry.rowId}: invalid official release bullet bindings`,
    )
    for (const releaseBullet of releaseBullets) {
      assert(
        !activeOfficialBullets.has(releaseBullet),
        `${entry.rowId}: duplicate active official release bullet`,
      )
      activeOfficialBullets.add(releaseBullet)
    }
    const obligationId = releaseBullets.length === 0
      ? `hidden-${entry.rowId.toLowerCase()}`
      : `official-2-1-126-${releaseBullets
          .map(releaseBullet => `b${String(releaseBullet).padStart(2, '0')}`)
          .join('-')}`
    assert(!directObligationIds.has(obligationId),
      `case-colliding direct row: ${entry.rowId}`)
    directObligationIds.add(obligationId)
    validateClusterIds(entry.clusterIds, entry.rowId)
    assert(Array.isArray(entry.sourcePaths) && entry.sourcePaths.length > 0,
      `${entry.rowId}: no source paths`)
    assert(new Set(entry.sourcePaths).size === entry.sourcePaths.length,
      `${entry.rowId}: duplicate source path`)
    entry.sourcePaths.forEach(sourcePath =>
      safeSourcePath(sourcePath, `${entry.rowId}: source owner`))
    assert(
      JSON.stringify(entry.sourcePaths) ===
        JSON.stringify([...entry.sourcePaths].sort()),
      `${entry.rowId}: source paths are not canonical`,
    )
    assert(
      Array.isArray(entry.targetWitnesses) && entry.targetWitnesses.length > 0,
      `${entry.rowId}: no target witnesses`,
    )
    for (const witness of entry.targetWitnesses) {
      assert(witness.kind === 'literal',
        `${entry.rowId}: target witness must be an exact literal`)
      assert(typeof witness.value === 'string' && witness.value.length > 0,
        `${entry.rowId}: empty target witness`)
      assert(Number.isSafeInteger(witness.count) && witness.count >= 0,
        `${entry.rowId}: invalid target witness count`)
    }
    assert(
      new Set(entry.targetWitnesses.map(witness => witness.value)).size ===
        entry.targetWitnesses.length,
      `${entry.rowId}: duplicate target witness`,
    )
    assert(Array.isArray(entry.testIds) && entry.testIds.length > 0,
      `${entry.rowId}: no focused tests`)
    assert(new Set(entry.testIds).size === entry.testIds.length,
      `${entry.rowId}: duplicate focused test`)
    assert(
      entry.testIds.every(testId => /^[a-z0-9][a-z0-9-]*$/.test(testId)),
      `${entry.rowId}: invalid focused test ID`,
    )
    assert(
      JSON.stringify(entry.testIds) === JSON.stringify([...entry.testIds].sort()),
      `${entry.rowId}: focused tests are not canonical`,
    )
    validateSourcePathAbsences(entry)
    validateSourceFileAbsences(entry)
    validateClusterBindings(entry)
  }
  assert(
    JSON.stringify([...activeOfficialBullets].sort((left, right) => left - right)) ===
        JSON.stringify(classification.activeAdjacent) &&
      JSON.stringify(classification.baselineRetained) === JSON.stringify(
        expectedAll.filter(value => !activeOfficialBullets.has(value)),
      ) &&
      JSON.stringify(inventory.direct
        .filter(entry => (entry.releaseBullets ?? []).length === 0)
        .map(entry => entry.rowId)
        .sort()) === JSON.stringify(classification.hiddenAdjacentRows),
    'direct rows differ from the proof release-bullet classification',
  )

  for (const [index, entry] of inventory.accountingOnly.entries()) {
    const label = `accounting-only group ${index + 1}`
    validateClusterIds(entry.clusterIds, label)
    assert(accountingReasons.has(entry.reason), `${label}: invalid reason`)
    assert(
      entry.evidence &&
        typeof entry.evidence === 'object' &&
        !Array.isArray(entry.evidence) &&
        Object.keys(entry.evidence).length > 0,
      `${label}: empty accounting evidence`,
    )
  }

  const directClusterIds = inventory.direct.flatMap(entry => entry.clusterIds)
  const accountingClusterIds = inventory.accountingOnly.flatMap(
    entry => entry.clusterIds,
  )
  validateAccountingTopology(inventory.accountingOnly, directClusterIds)
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
  const supportBindings = validateSupportBindings(
    inventory,
    directClusterIds,
  )
  assert(
    supportBindings.every(binding =>
      !directRowIds.has(binding.id) &&
        !directObligationIds.has(`hidden-${binding.id}`)),
    'support binding ID or obligation collides with a direct semantic row',
  )
  const targetRetainedRepairs = inventory.targetRetainedRepairs
  assert(
    Array.isArray(targetRetainedRepairs) &&
      targetRetainedRepairs.length === 1 &&
      targetRetainedRepairs.every(entry =>
        entry.rowId === 'ctrl-l-redraw' &&
          entry.title === 'Ctrl+L redraws without clearing prompt state' &&
          entry.disposition === 'target-retained-source-repair' &&
          entry.retained === true &&
          JSON.stringify(entry.releaseBullets) === JSON.stringify([23]) &&
          JSON.stringify(entry.sourcePaths) ===
            JSON.stringify(['src/components/PromptInput/PromptInput.tsx']) &&
          JSON.stringify(entry.testIds) === JSON.stringify(['retained-redraw']) &&
          entry.bundleSemantics?.byteIdenticalAcrossAdjacentBundles === true &&
          Array.isArray(entry.bundleSemantics?.fragments) &&
          entry.bundleSemantics.fragments.length === 4 &&
          entry.bundleSemantics.fragments.every(fragment =>
            typeof fragment.text === 'string' &&
              fragment.text.length > 0 &&
              fragment.baselineCount > 0 &&
              fragment.baselineCount === fragment.targetCount) &&
          Array.isArray(entry.sourceWitnesses) &&
          entry.sourceWitnesses.length > 0 &&
          entry.sourceWitnesses.every(witness =>
            safeSourcePath(witness.path, `${entry.rowId}: repair source`) &&
              witness.reviewed === true &&
              Number.isSafeInteger(witness.count) &&
              witness.count > 0 &&
              occurrences(
                fs.readFileSync(path.join(repo, witness.path), 'utf8'),
                witness.fragment,
              ) === witness.count)),
    'known-delta target-retained source-repair inventory',
  )
  const changedSourceInventory = proof.knownDelta?.changedSourcePaths
  const directSourcePaths = [
    ...new Set(inventory.direct.flatMap(entry => entry.sourcePaths)),
  ].sort()
  const supportSourcePaths = supportBindings
    .map(binding => binding.sourceWitness.path)
    .sort()
  const repairSourcePaths = [
    ...new Set(targetRetainedRepairs.flatMap(entry => entry.sourcePaths)),
  ].sort()
  assert(
    changedSourceInventory?.baseRevision === RELEASE_2_1_126.baseRevision &&
      changedSourceInventory.activeOverlayRevision ===
        RELEASE_2_1_126_GENERATED_INPUTS.sourceRecovery.activeSourceCommit &&
      changedSourceInventory.recoveredOverlayRevision ===
        RELEASE_2_1_126_GENERATED_INPUTS.sourceRecovery.sourceCommit &&
      changedSourceInventory.recoveredSourceTree ===
        RELEASE_2_1_126_GENERATED_INPUTS.sourceRecovery.sourceSrcTree &&
      JSON.stringify(changedSourceInventory.paths) === JSON.stringify([
        ...new Set([
          ...directSourcePaths,
          ...supportSourcePaths,
          ...repairSourcePaths,
        ]),
      ].sort()) &&
      JSON.stringify(changedSourceInventory.partitions?.activeAdjacent) ===
        JSON.stringify({ count: directSourcePaths.length, paths: directSourcePaths }) &&
      JSON.stringify(
        changedSourceInventory.partitions?.targetRetainedSourceRepairs,
      ) === JSON.stringify({ count: repairSourcePaths.length, paths: repairSourcePaths }),
    'known-delta changed-source partitions and recovered tree',
  )
  const allClusterIds = [...directClusterIds, ...accountingClusterIds]
    .sort((left, right) => left - right)
  assert(new Set(allClusterIds).size === allClusterIds.length,
    'semantic cluster partition has duplicates')
  assert(
    JSON.stringify(allClusterIds) === JSON.stringify(
      Array.from({ length: expectedClusterCount }, (_, index) => index + 1),
    ),
    'semantic cluster partition differs from the frozen exact range',
  )
  return {
    inventory,
    directClusterIds,
    accountingClusterIds,
    supportBindings,
    targetRetainedRepairs,
    activeOfficialBullets,
    releaseBulletClassification: classification,
  }
}

function officialBullets() {
  const section = fs.readFileSync(changelogPath, 'utf8')
  assert(
    section.startsWith('## 2.1.126\n'),
    'official changelog section heading',
  )
  const bullets = section
    .split('\n')
    .filter(line => line.startsWith('- '))
    .map(line => line.slice(2))
  assert(
    bullets.length === RELEASE_2_1_126.officialBulletCount &&
      bullets.every(value => value.length > 0),
    'official changelog bullet inventory',
  )
  const presence = JSON.parse(fs.readFileSync(releasePresencePath, 'utf8'))
  assert(
    presence.schemaVersion === 1 &&
      presence.kind === 'authenticated-public-release-presence' &&
      presence.release === RELEASE_2_1_126.target &&
      presence.tag?.name === 'v2.1.126' &&
      presence.tag?.present === true &&
      presence.changelog?.heading === '## 2.1.126' &&
      presence.changelog?.present === true &&
      presence.changelog?.bulletCount === bullets.length &&
      presence.changelog?.section?.path === RELEASE_2_1_126.officialSection &&
      presence.changelog.section.bytes === Buffer.byteLength(section) &&
      presence.changelog.section.sha256 === sha256(Buffer.from(section)),
    'authenticated 2.1.126 public-release presence',
  )
  return bullets
}

function validateSkippedRegistryAbsence() {
  const witness = JSON.parse(fs.readFileSync(skippedAbsencePath, 'utf8'))
  const expectedPackages = [
    '@anthropic-ai/claude-code',
    '@anthropic-ai/claude-code-linux-x64',
  ]
  assert(
    witness.schemaVersion === 1 &&
      witness.kind === 'authoritative-npm-registry-version-absence' &&
      witness.registry === 'https://registry.npmjs.org' &&
      witness.release === '2.1.125' &&
      JSON.stringify(witness.semanticVersionGap) === JSON.stringify({
        baseline: '2.1.124',
        skipped: ['2.1.125'],
        target: '2.1.126',
      }) &&
      JSON.stringify(witness.publishedAdjacency) === JSON.stringify({
        sequence: ['2.1.124', '2.1.126'],
        targetIsNextPublishedVersion: true,
        skippedVersionsAbsent: true,
      }) &&
      Array.isArray(witness.packages) &&
      JSON.stringify(witness.packages.map(entry => entry.name)) ===
        JSON.stringify(expectedPackages) &&
      witness.packages.every(entry =>
        entry.packument?.httpStatus === 200 &&
          entry.packument?.skippedVersionPresent === false &&
          entry.packument?.skippedPublicationTimePresent === false &&
          !entry.packument.versionWindow.includes('2.1.125') &&
          entry.packument.versionWindow.includes('2.1.124') &&
          entry.packument.versionWindow.includes('2.1.126') &&
          entry.missingVersionEndpoint?.httpStatus === 404 &&
          entry.missingVersionEndpoint?.body?.bytes === 28 &&
          entry.missingVersionEndpoint?.body?.sha256 ===
            'fefa83edd887f5aa6f5741c230e6a0121e0039db064aa4849a4185f152d6e683' &&
          entry.missingVersionEndpoint?.body?.json ===
            'version not found: 2.1.125'),
    'authenticated 2.1.125 registry absence',
  )
  return witness
}

function nonActiveOfficialRows(bullets, activeOfficialBullets) {
  assert(fs.existsSync(reviewedOfficialPath),
    'reviewed official non-active evidence inventory is missing')
  const review = JSON.parse(fs.readFileSync(reviewedOfficialPath, 'utf8'))
  assert(
    review.schemaVersion === 1 &&
      review.case === RELEASE_2_1_126.case &&
      review.baseline === RELEASE_2_1_126.baseline &&
      review.release === RELEASE_2_1_126.target &&
      review.complete === true &&
      Array.isArray(review.rows),
    'reviewed official non-active evidence inventory identity',
  )
  const priorCatalog = JSON.parse(
    fs.readFileSync(priorDirectEvidencePath, 'utf8'),
  )
  assert(
    priorCatalog.case === '2.1.123-to-2.1.124' &&
      priorCatalog.release === RELEASE_2_1_126.baseline &&
      priorCatalog.complete === true &&
      Array.isArray(priorCatalog.rows),
    'sealed baseline direct-evidence catalog identity',
  )
  const priorById = new Map(priorCatalog.rows.map(row => [row.id, row]))
  assert(priorById.size === priorCatalog.rows.length,
    'sealed baseline direct-evidence row IDs are unique')
  const expectedNonActiveBullets = Array.from(
    { length: RELEASE_2_1_126.officialBulletCount },
    (_, index) => index + 1,
  ).filter(number => !activeOfficialBullets.has(number))
  const actualBullets = review.rows.map(row => row.releaseBullet)
  assert(
    JSON.stringify(actualBullets) === JSON.stringify(expectedNonActiveBullets),
    'reviewed official rows must cover every non-adjacent bullet in order',
  )
  return review.rows.map(row => {
    const label = `B${String(row.releaseBullet).padStart(2, '0')}`
    assert(
      row.id === label &&
        row.title === bullets[row.releaseBullet - 1] &&
        ['inherited-retained', 'target-retained-source-repair']
          .includes(row.disposition) &&
        Array.isArray(row.targetFragments) &&
        row.targetFragments.length > 0 &&
        new Set(row.targetFragments).size === row.targetFragments.length &&
        JSON.stringify(row.targetFragments) ===
          JSON.stringify([...row.targetFragments].sort()) &&
        Array.isArray(row.sourceAssertions) &&
        row.sourceAssertions.length > 0 &&
        new Set(row.sourceAssertions.map(witness => JSON.stringify(witness))).size ===
          row.sourceAssertions.length &&
        JSON.stringify(row.sourceAssertions) === JSON.stringify(
          [...row.sourceAssertions].sort((left, right) =>
            left.path.localeCompare(right.path) ||
              left.fragment.localeCompare(right.fragment)),
        ) &&
        typeof row.rationale === 'string' &&
        row.rationale.length >= 20,
      `${label}: invalid non-active official review`,
    )
    const common = {
      id: label,
      obligationId:
        `official-2-1-126-b${String(row.releaseBullet).padStart(2, '0')}`,
      category: 'official',
      releaseBullet: row.releaseBullet,
      title: row.title,
      status: 'verified',
      targetFragments: row.targetFragments,
      sourceAssertions: row.sourceAssertions,
      sourcePathAbsences: [],
      sourceFileAbsences: [],
      focusedTests: [],
      rationale: row.rationale,
    }
    if (row.disposition === 'target-retained-source-repair') {
      assert(
        row.inheritedRowIds === undefined &&
          row.retained === true &&
          typeof row.observedBehavior === 'string' &&
          row.observedBehavior.trim() === row.observedBehavior &&
          row.observedBehavior.length >= 20,
        `${label}: invalid target-retained source repair`,
      )
      for (const witness of row.sourceAssertions) {
        validateRetainedSourceWitness(witness, `${label}: repaired source`)
      }
      return {
        ...common,
        retained: true,
        targetRetainedSourceRepair: {
          observedBehavior: row.observedBehavior,
          authenticatedBundleInvariant: 'unchanged-positive-counts-required',
          testIds: ['retained-redraw'],
        },
        focusedTests: ['retained-redraw'],
      }
    }
    assert(
      Array.isArray(row.inheritedRowIds) &&
        row.inheritedRowIds.length > 0 &&
        new Set(row.inheritedRowIds).size === row.inheritedRowIds.length &&
        JSON.stringify(row.inheritedRowIds) ===
          JSON.stringify([...row.inheritedRowIds].sort()) &&
        row.observedBehavior === undefined &&
        row.retained === true,
      `${label}: invalid inherited-retained row binding`,
    )
    const inheritedRows = row.inheritedRowIds.map(rowId => {
      const inherited = priorById.get(rowId)
      assert(inherited !== undefined, `${label}: unknown baseline row ${rowId}`)
      return inherited
    })
    const targetFragmentsByRow = new Map(inheritedRows.map(inherited => [
      inherited.id,
      new Set(inherited.targetFragments.map(fragment => fragment.text)),
    ]))
    const inheritedTargetFragments = new Set(
      [...targetFragmentsByRow.values()].flatMap(values => [...values]),
    )
    assert(
      row.targetFragments.every(fragment =>
        inheritedTargetFragments.has(fragment)),
      `${label}: target fragment is not inherited from the sealed baseline row`,
    )
    const sourceWitnessesByRow = new Map(inheritedRows.map(inherited => [
      inherited.id,
      new Set(inherited.sourceAssertions.map(witness => JSON.stringify({
        path: witness.path,
        fragment: witness.fragment,
        count: witness.count,
      }))),
    ]))
    const inheritedSourceWitnesses = new Set(
      [...sourceWitnessesByRow.values()].flatMap(values => [...values]),
    )
    for (const witness of row.sourceAssertions) {
      validateRetainedSourceWitness(witness, `${label}: retained source`)
      assert(
        inheritedSourceWitnesses.has(JSON.stringify({
          path: witness.path,
          fragment: witness.fragment,
          count: witness.count,
        })),
        `${label}: source witness is not inherited from the sealed baseline row`,
      )
    }
    for (const inherited of inheritedRows) {
      assert(
        row.targetFragments.some(fragment =>
          targetFragmentsByRow.get(inherited.id).has(fragment)) &&
          row.sourceAssertions.some(witness =>
            sourceWitnessesByRow.get(inherited.id).has(JSON.stringify(witness))),
        `${label}: ${inherited.id} contributes no selected target/source evidence`,
      )
    }
    const baselineFocusedTests = [
      ...new Set(inheritedRows.flatMap(inherited => inherited.focusedTests)),
    ].sort()
    assert(baselineFocusedTests.length > 0,
      `${label}: inherited baseline tests are missing`)
    return {
      ...common,
      retained: true,
      inheritedBaselineEvidence: {
        catalog: metadata(priorDirectEvidencePath),
        rowIds: row.inheritedRowIds,
        rowBindings: inheritedRows.map(inherited => ({
          id: inherited.id,
          rowSha256: sha256(Buffer.from(JSON.stringify(inherited))),
        })),
        focusedTests: baselineFocusedTests,
      },
    }
  })
}

const bullets = officialBullets()
validateSkippedRegistryAbsence()

if (!final) {
  const rows = bullets.map((title, index) => ({
    id: `B${String(index + 1).padStart(2, '0')}`,
    obligationId:
      `official-2-1-126-b${String(index + 1).padStart(2, '0')}`,
    category: 'official',
    releaseBullet: index + 1,
    title,
    status: 'pending-source-recovery',
    retained: null,
    targetFragments: [],
    sourceAssertions: [],
    sourcePathAbsences: [],
    sourceFileAbsences: [],
    focusedTests: [],
    rationale:
      'Pending classification as adjacent-active or inherited-retained evidence.',
  }))
  const output = {
    schemaVersion: 1,
    case: '2.1.124-to-2.1.126',
    release: '2.1.126',
    complete: false,
    coverageDeclarations: {
      officialRowsEnumerated: true,
      hiddenInventoryComplete: false,
      daemonInventoryComplete: false,
      residualAuditComplete: false,
      clusterInventoryFullyBound: false,
      sourceSupportFullyBound: false,
      changedSourcePathsFullyBound: false,
      focusedTestsFullyBound: false,
    },
    rows,
  }
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
  console.log(JSON.stringify({
    status: '2.1.126-direct-specs-built',
    complete: false,
    rows: rows.length,
    official: rows.length,
    nonOfficial: 0,
  }))
  process.exit(0)
}

const {
  inventory,
  directClusterIds,
  accountingClusterIds,
  supportBindings,
  targetRetainedRepairs,
  activeOfficialBullets,
  releaseBulletClassification,
} = clusterInventory()
assertRelease21126TopologyFrozen()
const nonActiveRows = nonActiveOfficialRows(bullets, activeOfficialBullets)
const inheritedRetainedRows = nonActiveRows.filter(row =>
  row.inheritedBaselineEvidence !== undefined)
const retainedSourceRepairRows = nonActiveRows.filter(row =>
  row.targetRetainedSourceRepair !== undefined)
assert(
  retainedSourceRepairRows.length === targetRetainedRepairs.length &&
    retainedSourceRepairRows.every(row => {
      const repair = targetRetainedRepairs.find(entry =>
        entry.releaseBullets.length === 1 &&
          entry.releaseBullets[0] === row.releaseBullet)
      const proofFragments = repair?.bundleSemantics?.fragments
        .map(fragment => fragment.text)
        .sort()
      const proofWitnesses = repair?.sourceWitnesses ?? []
      return repair !== undefined &&
        row.id === 'B23' &&
        row.title === bullets[row.releaseBullet - 1] &&
        JSON.stringify(row.targetFragments) === JSON.stringify(proofFragments) &&
        JSON.stringify(row.focusedTests) === JSON.stringify(repair.testIds) &&
        proofWitnesses.every(witness =>
          row.sourceAssertions.some(assertion =>
            assertion.path === witness.path &&
              assertion.fragment === witness.fragment &&
              assertion.count === witness.count))
    }),
  'reviewed target-retained source repair differs from known-delta proof',
)
const semanticClusterBindings = inventory.direct.flatMap(entry =>
  entry.clusterBindings.map(binding => ({ rowId: entry.rowId, ...binding })))
assert(
  semanticClusterBindings.length === directClusterIds.length,
  'every direct semantic cluster needs one exact binding',
)
const changedRows = changedSourceRows()
assert(changedRows.length > 0, 'expected changed source paths')
const statusByPath = new Map(changedRows.map(row => [row.path, row.status]))
const changedPaths = changedRows.map(row => row.path)
const directSourcePaths = new Set(
  inventory.direct.flatMap(entry => entry.sourcePaths),
)
const supportSourcePaths = new Set(
  supportBindings.map(binding => binding.sourceWitness.path),
)
const retainedSourceRepairPaths = new Set(
  retainedSourceRepairRows.flatMap(row =>
    row.sourceAssertions
      .map(witness => witness.path)
      .filter(sourcePath => statusByPath.has(sourcePath))),
)
assert(
  changedRows.length === expectedChangedSourcePathCount &&
    directSourcePaths.size === expectedDirectSourcePathCount &&
    supportSourcePaths.size === expectedSupportSourcePathCount &&
    retainedSourceRepairPaths.size ===
      expectedRetainedSourceRepairPathCount &&
    [...supportSourcePaths].every(sourcePath =>
      !directSourcePaths.has(sourcePath)) &&
    [...retainedSourceRepairPaths].every(sourcePath =>
      !directSourcePaths.has(sourcePath) &&
        !supportSourcePaths.has(sourcePath)),
  'adjacent owners, support paths, and retained repairs overlap',
)
const reviewedSourcePaths = new Set([
  ...directSourcePaths,
  ...supportSourcePaths,
  ...retainedSourceRepairPaths,
])
const missingChangedPaths = changedRows
  .map(row => row.path)
  .filter(sourcePath => !reviewedSourcePaths.has(sourcePath))
const unexpectedSourcePaths = [...reviewedSourcePaths]
  .filter(sourcePath => !statusByPath.has(sourcePath))
  .sort()
assert(
  missingChangedPaths.length === 0,
  `changed source paths missing from precise owners/support:\n${missingChangedPaths.join('\n')}`,
)
assert(
  unexpectedSourcePaths.length === 0,
  `semantic owner/support paths outside the changed-source boundary:\n${unexpectedSourcePaths.join('\n')}`,
)
for (const entry of inventory.direct) {
  assert(
    JSON.stringify(entry.sourcePaths) !== JSON.stringify(changedPaths),
    `${entry.rowId}: direct row may not claim the complete global changed-source inventory`,
  )
}

const reviewedFocusedTests = [
  ...new Set([
    ...inventory.direct.flatMap(entry => entry.testIds),
    ...supportBindings.flatMap(binding => binding.testIds),
    ...retainedSourceRepairRows.flatMap(row => row.focusedTests),
  ]),
].sort()
assert(reviewedFocusedTests.includes('semantic-delta'),
  'semantic cluster inventory must bind the semantic-delta suite')
assert(
  reviewedFocusedTests.length === expectedFocusedTestCount &&
    JSON.stringify(focusedTestIds()) === JSON.stringify(reviewedFocusedTests),
  'focused tests differ from the exact semantic cluster inventory',
)

const semanticRows = [...inventory.direct]
  .sort((left, right) => left.rowId.localeCompare(right.rowId))
  .map(entry => {
    const deletedSourcePaths = entry.sourcePaths
      .filter(sourcePath => statusByPath.get(sourcePath) === 'D')
      .sort()
    const sourceFileAbsences = validateSourceFileAbsences(entry)
    assert(
      JSON.stringify(sourceFileAbsences) === JSON.stringify(deletedSourcePaths),
      `${entry.rowId}: source-file absences differ from Git`,
    )
    assert(deletedSourcePaths.length === 0,
      `${entry.rowId}: deleted paths cannot carry source callsite witnesses`)
    const boundSourceAssertions = validateClusterBindings(entry)
    assert(boundSourceAssertions.length > 0,
      `${entry.rowId}: no extant source assertion`)
    const releaseBullets = entry.releaseBullets ?? []
    const official = releaseBullets.length > 0
    const rowId = official
      ? releaseBullets
          .map(releaseBullet => `B${String(releaseBullet).padStart(2, '0')}`)
          .join('-')
      : entry.rowId
    return {
      id: rowId,
      obligationId: official
        ? `official-2-1-126-${releaseBullets
            .map(releaseBullet =>
              `b${String(releaseBullet).padStart(2, '0')}`)
            .join('-')}`
        : `hidden-${entry.rowId.toLowerCase()}`,
      category: official ? 'official' : 'hidden',
      ...(official ? { releaseBullets, semanticRowId: entry.rowId } : {}),
      title: official
        ? releaseBullets.map(releaseBullet => bullets[releaseBullet - 1]).join(' / ')
        : entry.title ?? entry.rowId.replaceAll('-', ' '),
      status: 'verified',
      semanticClusterIds: entry.clusterIds,
      semanticClusterBindings: entry.clusterBindings,
      semanticTargetWitnesses: entry.targetWitnesses,
      targetFragments: entry.targetWitnesses.map(witness => witness.value),
      sourceAssertions: boundSourceAssertions,
      sourcePathAbsences: validateSourcePathAbsences(entry),
      sourceFileAbsences,
      focusedTests: entry.testIds,
      rationale:
        entry.rationale ??
        `Authenticated semantic clusters ${entry.clusterIds
          .map(clusterId => `C${String(clusterId).padStart(3, '0')}`)
          .join(', ')} bind exact adjacent-bundle witnesses to the reviewed ` +
          `source owners and focused ${entry.testIds.join(', ')} verification.`,
    }
  })
const directEntryByClusterId = new Map(
  inventory.direct.flatMap(entry =>
    entry.clusterIds.map(clusterId => [clusterId, entry])),
)
const supportRows = supportBindings.map(binding => {
  const relatedEntries = [
    ...new Map(
      binding.relatedDirectClusterIds.map(clusterId => {
        const entry = directEntryByClusterId.get(clusterId)
        assert(entry !== undefined,
          `${binding.id}: related direct cluster is missing`)
        return [entry.rowId, entry]
      }),
    ).values(),
  ]
  const targetWitnesses = [
    ...new Map(
      relatedEntries.flatMap(entry =>
        entry.targetWitnesses.map(witness => [witness.value, witness])),
    ).values(),
  ].sort((left, right) => left.value.localeCompare(right.value))
  assert(targetWitnesses.length > 0,
    `${binding.id}: support row has no related bundle witness`)
  assert(statusByPath.get(binding.sourceWitness.path) !== 'D',
    `${binding.id}: deleted support source is unsupported`)
  return {
    id: binding.id,
    obligationId: `hidden-${binding.id}`,
    category: 'hidden',
    title: binding.id.replaceAll('-', ' '),
    status: 'verified',
    sourceChangeSupport: binding,
    relatedDirectClusterIds: binding.relatedDirectClusterIds,
    semanticTargetWitnesses: targetWitnesses,
    targetFragments: targetWitnesses.map(witness => witness.value),
    sourceAssertions: [binding.sourceWitness],
    sourcePathAbsences: [],
    sourceFileAbsences: [],
    focusedTests: binding.testIds,
    rationale: binding.reason,
  }
})
const rows = [...nonActiveRows, ...semanticRows, ...supportRows]
  .sort((left, right) => left.id.localeCompare(right.id))
assert(new Set(rows.map(row => row.id)).size === rows.length,
  'semantic and support row IDs are not unique')
const officialRows = rows
  .filter(row => row.category === 'official')
const coveredOfficialBullets = officialRows
  .flatMap(row => row.releaseBullets ?? [row.releaseBullet])
  .sort((left, right) => left - right)
assert(
  JSON.stringify(coveredOfficialBullets) ===
      JSON.stringify(Array.from(
        { length: RELEASE_2_1_126.officialBulletCount },
        (_, index) => index + 1,
      )) &&
    officialRows.every(row =>
      row.title === (row.releaseBullets ?? [row.releaseBullet])
        .map(releaseBullet => bullets[releaseBullet - 1])
        .join(' / ')),
  'official rows must cover the authenticated changelog exactly once',
)

const output = {
  schemaVersion: 1,
  case: '2.1.124-to-2.1.126',
  release: '2.1.126',
  complete: true,
  inputs: [
    changelogPath,
    releasePresencePath,
    skippedAbsencePath,
    reviewedOfficialPath,
    reviewedOfficialBuilderPath,
    priorDirectEvidencePath,
    knownDeltaProofPath,
  ].map(metadata),
  officialCoverage: {
    bulletCount: RELEASE_2_1_126.officialBulletCount,
    activeAdjacent: activeOfficialBullets.size,
    retainedInherited: inheritedRetainedRows.length,
    targetRetainedSourceRepair: retainedSourceRepairRows.length,
    nonActiveTotal: nonActiveRows.length,
    complete: true,
    releaseBulletClassification,
  },
  clusterInventory: {
    proof: metadata(knownDeltaProofPath),
    totalClusters: expectedClusterCount,
    directGroups: inventory.direct.length,
    directClusters: directClusterIds.length,
    accountingOnlyGroups: inventory.accountingOnly.length,
    accountingOnlyClusters: accountingClusterIds.length,
    clusterBindingCount: semanticClusterBindings.length,
    clusterBindingsSha256: sha256(Buffer.from(
      `${JSON.stringify(semanticClusterBindings)}\n`,
    )),
    supportBindingCount: supportBindings.length,
    supportSourcePathCount: supportSourcePaths.size,
    supportBindingsSha256: sha256(Buffer.from(
      `${JSON.stringify(supportBindings)}\n`,
    )),
    targetRetainedRepairCount: targetRetainedRepairs.length,
    targetRetainedRepairsSha256: sha256(Buffer.from(
      `${JSON.stringify(targetRetainedRepairs)}\n`,
    )),
    partitionSha256: sha256(Buffer.from(`${[
      ...directClusterIds.map(clusterId => `direct\t${clusterId}`),
      ...accountingClusterIds.map(clusterId => `accounting-only\t${clusterId}`),
    ].sort().join('\n')}\n`)),
  },
  sourceRepairInventory: {
    rowCount: retainedSourceRepairRows.length,
    pathCount: retainedSourceRepairPaths.size,
    paths: [...retainedSourceRepairPaths].sort(),
    bindingsSha256: sha256(Buffer.from(`${JSON.stringify(
      retainedSourceRepairRows.map(row => ({
        id: row.id,
        targetRetainedSourceRepair: row.targetRetainedSourceRepair,
        sourceAssertions: row.sourceAssertions,
        focusedTests: row.focusedTests,
      })),
    )}\n`)),
  },
  changedSourceRows: changedRows,
  coverageDeclarations: {
    officialRowsEnumerated: true,
    hiddenInventoryComplete: true,
    daemonInventoryComplete: true,
    residualAuditComplete: true,
    clusterInventoryFullyBound: true,
    sourceSupportFullyBound: true,
    changedSourcePathsFullyBound: true,
    focusedTestsFullyBound: true,
  },
  rows,
}

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify({
  status: '2.1.126-direct-specs-built',
  complete: true,
  rows: rows.length,
  official: officialRows.length,
  retainedOfficial: nonActiveRows.length,
  inheritedRetainedOfficial: inheritedRetainedRows.length,
  targetRetainedSourceRepair: retainedSourceRepairRows.length,
  activeOfficial: activeOfficialBullets.size,
  nonOfficial: rows.length - officialRows.length,
  directClusters: directClusterIds.length,
  accountingOnlyClusters: accountingClusterIds.length,
  changedSourcePaths: changedRows.length,
  focusedTests: reviewedFocusedTests.length,
}))
