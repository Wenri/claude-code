#!/usr/bin/env node

import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const caseRoot = path.join(repo, 'recovery/cases/2.1.123-to-2.1.124')
const releaseAbsencePath = path.join(
  caseRoot,
  'evidence/RELEASE-2.1.124-ABSENCE.json',
)
const knownDeltaProofPath = path.join(
  caseRoot,
  'structural/known-delta-proof.json',
)
const outputPath = path.join(repo, 'recovery/2.1.124-direct-evidence-specs.json')
const baseRevision = '338d170737e8294c489481bc2e8fac52d8ce5f85'
const expectedClusterCount = 205
const accountingReasons = new Set([
  'dependency',
  'exact-relocation',
  'identifier-only',
  'initializer-linkage',
  'metadata',
])
const expectedAccountingClusterIds = [
  1, 2, 9, 10, 11, 26, 56, 97, 98, 113, 114, 116, 138, 141, 145, 157,
  158, 159, 165, 176, 190, 202,
]
const requiredDirectClusterIds = [12, 69, 115, 186, 188, 189]
const final = process.argv.slice(2).includes('--final')

if (process.argv.slice(2).some(argument => argument !== '--final')) {
  throw new Error('Usage: build-2.1.124-direct-specs.mjs [--final]')
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
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
        /^recovery-2\.1\.124-.*\.test\.mjs$/.test(name) &&
        name !== 'recovery-2.1.124-direct-evidence.test.mjs',
    )
    .map(name =>
      name
        .replace(/^recovery-2\.1\.124-/, '')
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
        Number.isSafeInteger(witness.count) &&
        witness.count > 0 &&
        Number.isSafeInteger(witness.otherSideCount) &&
        witness.otherSideCount >= 0 &&
        witness.count !== witness.otherSideCount,
      `${entry.rowId}/C${binding.clusterId}: invalid raw-statement witness`,
    )
    assert(
      Array.isArray(binding.sourceWitnesses) &&
        binding.sourceWitnesses.length > 0,
      `${entry.rowId}/C${binding.clusterId}: no source owner or callsite`,
    )
    const bindingSourceKeys = new Set()
    for (const sourceWitness of binding.sourceWitnesses) {
      const sourcePath = safeSourcePath(
        sourceWitness.path,
        `${entry.rowId}/C${binding.clusterId}: source witness`,
      )
      assert(
        entry.sourcePaths.includes(sourcePath) &&
          typeof sourceWitness.fragment === 'string' &&
          sourceWitness.fragment.length > 0 &&
          Number.isSafeInteger(sourceWitness.count) &&
          sourceWitness.count > 0,
        `${entry.rowId}/C${binding.clusterId}: invalid source witness`,
      )
      const source = fs.readFileSync(path.join(repo, sourcePath), 'utf8')
      assert(
        occurrences(source, sourceWitness.fragment) === sourceWitness.count,
        `${entry.rowId}/C${binding.clusterId}: source witness count`,
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
        binding.sourceWitnesses.map(sourceWitness => sourceWitness.path)),
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
      proof.case === '2.1.123-to-2.1.124' &&
      proof.release === '2.1.124' &&
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

  const directRowIds = new Set()
  const directObligationIds = new Set()
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
    const obligationId = `hidden-${entry.rowId.toLowerCase()}`
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
      assert(Number.isSafeInteger(witness.count) && witness.count > 0,
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
  const allClusterIds = [...directClusterIds, ...accountingClusterIds]
    .sort((left, right) => left - right)
  assert(new Set(allClusterIds).size === allClusterIds.length,
    'semantic cluster partition has duplicates')
  assert(
    JSON.stringify(allClusterIds) === JSON.stringify(
      Array.from({ length: expectedClusterCount }, (_, index) => index + 1),
    ),
    'semantic cluster partition is not exactly 1..205',
  )
  return { inventory, directClusterIds, accountingClusterIds }
}

const releaseAbsence = JSON.parse(fs.readFileSync(releaseAbsencePath, 'utf8'))
assert(
  releaseAbsence.release === '2.1.124' &&
    releaseAbsence.tag?.present === false &&
    releaseAbsence.changelog?.present === false &&
    releaseAbsence.changelog?.bulletCount === 0,
  'authenticated 2.1.124 public-release absence',
)

if (!final) {
  const output = {
    schemaVersion: 1,
    case: '2.1.123-to-2.1.124',
    release: '2.1.124',
    complete: false,
    coverageDeclarations: {
      officialRowsEnumerated: true,
      hiddenInventoryComplete: false,
      daemonInventoryComplete: false,
      residualAuditComplete: false,
      clusterInventoryFullyBound: false,
      changedSourcePathsFullyBound: false,
      focusedTestsFullyBound: false,
    },
    rows: [],
  }
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
  console.log(JSON.stringify({
    status: '2.1.124-direct-specs-built',
    complete: false,
    rows: 0,
    official: 0,
    nonOfficial: 0,
  }))
  process.exit(0)
}

const { inventory, directClusterIds, accountingClusterIds } = clusterInventory()
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
const missingChangedPaths = changedRows
  .map(row => row.path)
  .filter(sourcePath => !directSourcePaths.has(sourcePath))
const unexpectedSourcePaths = [...directSourcePaths]
  .filter(sourcePath => !statusByPath.has(sourcePath))
  .sort()
assert(
  missingChangedPaths.length === 0,
  `changed source paths missing from semantic clusters:\n${missingChangedPaths.join('\n')}`,
)
assert(
  unexpectedSourcePaths.length === 0,
  `semantic cluster source owners outside the changed-source boundary:\n${unexpectedSourcePaths.join('\n')}`,
)
for (const entry of inventory.direct) {
  assert(
    JSON.stringify(entry.sourcePaths) !== JSON.stringify(changedPaths),
    `${entry.rowId}: direct row may not claim the complete global changed-source inventory`,
  )
}

const reviewedFocusedTests = [
  ...new Set(inventory.direct.flatMap(entry => entry.testIds)),
].sort()
assert(reviewedFocusedTests.includes('semantic-delta'),
  'semantic cluster inventory must bind the semantic-delta suite')
assert(
  JSON.stringify(focusedTestIds()) === JSON.stringify(reviewedFocusedTests),
  'focused tests differ from the exact semantic cluster inventory',
)

const rows = [...inventory.direct]
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
    return {
      id: entry.rowId,
      obligationId: `hidden-${entry.rowId.toLowerCase()}`,
      category: 'hidden',
      title: entry.title ?? entry.rowId.replaceAll('-', ' '),
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

const output = {
  schemaVersion: 1,
  case: '2.1.123-to-2.1.124',
  release: '2.1.124',
  complete: true,
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
    partitionSha256: sha256(Buffer.from(`${[
      ...directClusterIds.map(clusterId => `direct\t${clusterId}`),
      ...accountingClusterIds.map(clusterId => `accounting-only\t${clusterId}`),
    ].sort().join('\n')}\n`)),
  },
  changedSourceRows: changedRows,
  coverageDeclarations: {
    officialRowsEnumerated: true,
    hiddenInventoryComplete: true,
    daemonInventoryComplete: true,
    residualAuditComplete: true,
    clusterInventoryFullyBound: true,
    changedSourcePathsFullyBound: true,
    focusedTestsFullyBound: true,
  },
  rows,
}

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify({
  status: '2.1.124-direct-specs-built',
  complete: true,
  rows: rows.length,
  official: 0,
  nonOfficial: rows.length,
  directClusters: directClusterIds.length,
  accountingOnlyClusters: accountingClusterIds.length,
  changedSourcePaths: changedRows.length,
  focusedTests: reviewedFocusedTests.length,
}))
