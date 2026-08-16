import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const BASELINE_BYTES = 13_949_576
const BASELINE_SHA256 =
  '59c8eebc0660d4bbc5c1f82af0ca5e94df5db46084687b979ad21a07fba3d7dd'
const TARGET_BYTES = 13_980_928
const TARGET_SHA256 =
  'dc2b68c385a3064737343e51e6d7c690f9e03cc40fa89c4393708ae03094d590'

const CATALOG_BYTES = 360_116
const CATALOG_SHA256 =
  '55928e6f00ec1fa8b324472e90cab317907b392223b634804b65a1d2b38d16c3'
const CATALOG_PATH =
  'recovery/cases/2.1.123-to-2.1.124/semantic/direct-evidence.json'
const KNOWN_DELTA_PROOF_PATH =
  'recovery/cases/2.1.123-to-2.1.124/structural/known-delta-proof.json'
const BASE_REVISION = '338d170737e8294c489481bc2e8fac52d8ce5f85'
const EXPECTED_CLUSTER_COUNT = 205
const ACCOUNTING_REASONS = new Set([
  'dependency',
  'exact-relocation',
  'identifier-only',
  'initializer-linkage',
  'metadata',
])
const EXPECTED_ACCOUNTING_CLUSTER_IDS = [
  1, 2, 4, 9, 10, 11, 16, 26, 31, 33, 34, 36, 47, 56, 60, 61, 74, 86, 97, 98, 112,
  113, 114, 116, 123, 138, 141, 145, 147, 157, 158, 159, 165, 176, 179, 190, 202,
]
const EXPECTED_ACCOUNTING_REASON_GROUPS = {
  dependency: [1, 2, 9, 10, 11, 26],
  'identifier-only': [74, 86, 157, 158, 165, 190],
  'initializer-linkage': [
    4, 16, 31, 33, 34, 36, 47, 56, 60, 61, 97, 98, 112, 116, 138,
    141, 145, 147, 176, 179, 202,
  ],
  'exact-relocation': [113, 114, 123, 159],
}
const EXPECTED_INITIALIZER_PAIRED_DIRECT_CLUSTER_IDS = [
  3, 17, 18, 32, 35, 62, 110, 151, 167, 168, 180,
]
const EXPECTED_DIRECT_CLUSTER_COUNT = 168
const EXPECTED_ACCOUNTING_CLUSTER_COUNT = 37
const EXPECTED_DIRECT_SOURCE_PATH_COUNT = 121
const EXPECTED_SUPPORT_SOURCE_PATH_COUNT = 10
const EXPECTED_CHANGED_SOURCE_PATH_COUNT = 131
const repo = fileURLToPath(new URL('../..', import.meta.url))

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  assert.ok(fragment.length > 0, 'cannot count an empty fragment')
  let count = 0
  let offset = 0
  while ((offset = contents.indexOf(fragment, offset)) !== -1) {
    count += 1
    offset += fragment.length
  }
  return count
}

function assertSafeSourcePath(relative, label) {
  assert.equal(typeof relative, 'string', `${label}: source path type`)
  assert.equal(relative.startsWith('src/'), true, `${label}: source prefix`)
  assert.equal(
    relative.split('/').some(part => part === '' || part === '.' || part === '..'),
    false,
    `${label}: unsafe source path`,
  )
}

function assertReviewedSourceWitness(witness, label, requireReviewed = false) {
  assertSafeSourcePath(witness?.path, label)
  assert.equal(typeof witness.fragment, 'string', `${label}: source fragment type`)
  assert.ok(witness.fragment.length > 0, `${label}: source fragment`)
  assert.ok(Number.isSafeInteger(witness.count) && witness.count > 0,
    `${label}: source count`)
  assert.equal(typeof witness.reviewed, 'boolean', `${label}: reviewed marker`)
  assert.ok(Array.isArray(witness.matchedSemanticTerms),
    `${label}: semantic terms`)
  assert.equal(
    new Set(witness.matchedSemanticTerms).size,
    witness.matchedSemanticTerms.length,
    `${label}: unique semantic terms`,
  )
  assert.ok(
    witness.reviewed === true || witness.matchedSemanticTerms.length > 0,
    `${label}: source review evidence`,
  )
  if (requireReviewed) {
    assert.equal(witness.reviewed, true, `${label}: explicit review`)
  }
  const source = fs.readFileSync(path.join(repo, witness.path), 'utf8')
  assert.equal(
    occurrences(source, witness.fragment),
    witness.count,
    `${label}: source witness count`,
  )
}

function sourceWitnessProjection(witness) {
  return {
    path: witness.path,
    fragment: witness.fragment,
    count: witness.count,
  }
}

function assertAccountingTopology(entries, directClusterIds) {
  assert.equal(directClusterIds.length, EXPECTED_DIRECT_CLUSTER_COUNT)
  assert.equal(
    entries.flatMap(entry => entry.clusterIds).length,
    EXPECTED_ACCOUNTING_CLUSTER_COUNT,
  )
  for (const [reason, expectedIds] of Object.entries(
    EXPECTED_ACCOUNTING_REASON_GROUPS,
  )) {
    const reasonEntries = entries.filter(entry => entry.reason === reason)
    assert.equal(reasonEntries.length, 1, `${reason}: accounting group count`)
    assert.deepEqual(
      reasonEntries
        .flatMap(entry => entry.clusterIds)
        .sort((left, right) => left - right),
      expectedIds,
      `${reason}: accounting cluster topology`,
    )
  }
  const initializerEntries = entries.filter(
    entry => entry.reason === 'initializer-linkage',
  )
  assert.equal(initializerEntries.length, 1)
  assert.deepEqual(
    initializerEntries[0].evidence.pairedDirectClusterIds,
    EXPECTED_INITIALIZER_PAIRED_DIRECT_CLUSTER_IDS,
  )
  assert.ok(EXPECTED_INITIALIZER_PAIRED_DIRECT_CLUSTER_IDS.every(clusterId =>
    directClusterIds.includes(clusterId)))
  for (const entry of entries) {
    assert.ok(
      typeof entry.evidence?.classification === 'string' &&
        entry.evidence.classification.length >= 20,
      `${entry.reason}: accounting classification`,
    )
    if (entry.reason !== 'initializer-linkage') {
      assert.equal(entry.evidence.pairedDirectClusterIds, undefined)
    }
  }
}

function assertRawStatementWitness({ baseline, cluster, label, target, witness }) {
  assert.equal(witness?.kind, 'raw-statement', `${label}: witness kind`)
  assert.ok(['baseline', 'target'].includes(witness.side), `${label}: witness side`)
  const statement = cluster[`${witness.side}Statements`].find(
    value => value.index === witness.statementIndex,
  )
  assert.ok(statement, `${label}: statement entry`)
  assert.deepEqual(
    {
      start: witness.start,
      end: witness.end,
      bytes: witness.bytes,
      sha256: witness.normalizedSha256,
    },
    statement.raw,
    `${label}: normalized cluster-ledger statement identity`,
  )
  assert.match(witness.sha256, /^[0-9a-f]{64}$/, `${label}: raw SHA-256`)
  const sideSource = witness.side === 'target' ? target : baseline
  const otherSource = witness.side === 'target' ? baseline : target
  const statementText = sideSource.slice(witness.start, witness.end)
  assert.equal(Buffer.byteLength(statementText), witness.bytes, `${label}: bytes`)
  assert.equal(sha256(statementText), witness.sha256, `${label}: SHA-256`)
  assert.equal(occurrences(sideSource, statementText), witness.count,
    `${label}: same-side count`)
  assert.equal(occurrences(otherSource, statementText), witness.otherSideCount,
    `${label}: other-side count`)
  assert.notEqual(witness.count, witness.otherSideCount,
    `${label}: adjacent count change`)
  return statementText
}

function readBundle(environmentName, expectedBytes, expectedSha256) {
  const filename = process.env[environmentName]
  assert.ok(filename, `${environmentName} must be set`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, expectedBytes, `${environmentName}: byte length`)
  assert.equal(sha256(value), expectedSha256, `${environmentName}: SHA-256`)
  return value.toString('utf8')
}

function readPinnedCatalog() {
  assert.notEqual(CATALOG_BYTES, 0, 'catalog byte pin has not been sealed')
  assert.notEqual(CATALOG_SHA256, '0'.repeat(64), 'catalog SHA pin has not been sealed')
  const filename = path.join(repo, CATALOG_PATH)
  const status = fs.lstatSync(filename)
  assert.equal(status.isFile(), true, 'catalog is a regular file')
  assert.equal(status.isSymbolicLink(), false, 'catalog is not a symlink')
  const value = fs.readFileSync(filename)
  assert.equal(value.length, CATALOG_BYTES, 'catalog byte length')
  assert.equal(sha256(value), CATALOG_SHA256, 'catalog SHA-256')
  const catalog = JSON.parse(value)
  assert.ok(Array.isArray(catalog.inputs) && catalog.inputs.length > 0)
  assert.equal(
    new Set(catalog.inputs.map(entry => entry.path)).size,
    catalog.inputs.length,
    'catalog input paths are unique',
  )
  for (const entry of catalog.inputs) {
    assert.equal(typeof entry.path, 'string', 'catalog input path type')
    assert.equal(entry.path.startsWith('recovery/'), true, 'catalog input prefix')
    assert.equal(
      entry.path.split('/').some(
        part => part === '' || part === '.' || part === '..',
      ),
      false,
      `${entry.path}: unsafe catalog input path`,
    )
    const inputFilename = path.join(repo, entry.path)
    const inputStatus = fs.lstatSync(inputFilename)
    assert.equal(inputStatus.isFile(), true, `${entry.path}: regular input`)
    assert.equal(inputStatus.isSymbolicLink(), false, `${entry.path}: real input`)
    const inputValue = fs.readFileSync(inputFilename)
    assert.equal(inputValue.length, entry.bytes, `${entry.path}: input bytes`)
    assert.equal(sha256(inputValue), entry.sha256, `${entry.path}: input SHA-256`)
  }
  return catalog
}

function readPinnedClusterInventory(catalog) {
  const record = catalog.inputs.find(entry => entry.path === KNOWN_DELTA_PROOF_PATH)
  assert.ok(record, 'catalog does not pin the known-delta proof')
  const filename = path.join(repo, record.path)
  const status = fs.lstatSync(filename)
  assert.equal(status.isFile(), true, 'known-delta proof is a regular file')
  assert.equal(status.isSymbolicLink(), false, 'known-delta proof is not a symlink')
  const value = fs.readFileSync(filename)
  assert.equal(value.length, record.bytes, 'known-delta proof byte length')
  assert.equal(sha256(value), record.sha256, 'known-delta proof SHA-256')
  const proof = JSON.parse(value)
  assert.equal(proof.schemaVersion, 1)
  assert.equal(proof.case, '2.1.123-to-2.1.124')
  assert.equal(proof.release, '2.1.124')
  assert.equal(proof.complete, true)
  const inventory = proof.knownDelta?.clusterInventory
  assert.equal(inventory?.schemaVersion, 1)
  assert.equal(inventory.totalClusters, EXPECTED_CLUSTER_COUNT)
  assert.ok(inventory.direct.length > 0)
  assert.ok(inventory.accountingOnly.length > 0)
  assert.ok(inventory.supportBindings.length > 0)
  const directClusters = inventory.direct.flatMap(entry => entry.clusterIds)
  const accountingOnlyClusters = inventory.accountingOnly.flatMap(
    entry => entry.clusterIds,
  )
  assertAccountingTopology(inventory.accountingOnly, directClusters)
  const allClusters = [...directClusters, ...accountingOnlyClusters]
    .sort((left, right) => left - right)
  assert.equal(new Set(allClusters).size, EXPECTED_CLUSTER_COUNT)
  assert.deepEqual(
    allClusters,
    Array.from({ length: EXPECTED_CLUSTER_COUNT }, (_, index) => index + 1),
  )
  for (const clusterId of [12, 69, 115, 122, 186, 188, 189]) {
    assert.equal(directClusters.includes(clusterId), true)
    assert.equal(accountingOnlyClusters.includes(clusterId), false)
  }
  assert.deepEqual(
    [...accountingOnlyClusters].sort((left, right) => left - right),
    EXPECTED_ACCOUNTING_CLUSTER_IDS,
  )
  const clusterLedgerRecord = proof.artifacts?.clusterLedger
  assert.deepEqual(
    clusterLedgerRecord?.path,
    'structural/semantic-cluster-ledger.json.gz',
  )
  const clusterLedgerCatalogPath =
    'recovery/cases/2.1.123-to-2.1.124/' + clusterLedgerRecord.path
  assert.deepEqual(
    catalog.inputs.find(entry => entry.path === clusterLedgerCatalogPath),
    {
      path: clusterLedgerCatalogPath,
      bytes: clusterLedgerRecord.bytes,
      sha256: clusterLedgerRecord.sha256,
    },
  )
  const clusterLedgerBytes = fs.readFileSync(
    path.join(repo, clusterLedgerCatalogPath),
  )
  assert.equal(clusterLedgerBytes.length, clusterLedgerRecord.bytes)
  assert.equal(sha256(clusterLedgerBytes), clusterLedgerRecord.sha256)
  const clusterLedger = JSON.parse(
    gunzipSync(clusterLedgerBytes).toString('utf8'),
  )
  assert.equal(clusterLedger.coverage?.clusterCount, EXPECTED_CLUSTER_COUNT)
  const clusterById = new Map(
    clusterLedger.clusters.map(cluster => [cluster.id, cluster]),
  )
  assert.equal(clusterById.size, EXPECTED_CLUSTER_COUNT)
  for (const entry of inventory.accountingOnly) {
    assert.ok(ACCOUNTING_REASONS.has(entry.reason), 'accounting-only reason')
    assert.ok(
      entry.evidence &&
        typeof entry.evidence === 'object' &&
        !Array.isArray(entry.evidence) &&
        Object.keys(entry.evidence).length > 0,
      'accounting-only evidence',
    )
  }
  for (const entry of inventory.direct) {
    assert.notEqual(entry.retained, true, `${entry.rowId}: retained bypass`)
    assert.ok(entry.targetWitnesses.length > 0, `${entry.rowId}: witnesses`)
    for (const witness of entry.targetWitnesses) {
      assert.equal(witness.kind, 'literal', `${entry.rowId}: literal witness`)
      assert.equal(typeof witness.value, 'string', `${entry.rowId}: witness text`)
      assert.ok(witness.value.length > 0, `${entry.rowId}: witness text`)
      assert.ok(
        Number.isSafeInteger(witness.count) && witness.count > 0,
        `${entry.rowId}: exact witness count`,
      )
    }
    for (const relative of entry.sourcePaths) {
      assertSafeSourcePath(relative, entry.rowId)
    }
    assert.deepEqual(
      entry.clusterBindings.map(binding => binding.clusterId),
      entry.clusterIds,
      `${entry.rowId}: exact cluster-binding IDs`,
    )
    assert.deepEqual(
      [...new Set(entry.clusterBindings.flatMap(binding =>
        binding.sourceWitnesses.map(sourceWitness => sourceWitness.path)))].sort(),
      entry.sourcePaths,
      `${entry.rowId}: cluster-binding source union`,
    )
    assert.deepEqual(
      [...new Set(entry.clusterBindings.flatMap(binding => binding.testIds))].sort(),
      entry.testIds,
      `${entry.rowId}: cluster-binding test union`,
    )
    for (const binding of entry.clusterBindings) {
      for (const witness of binding.sourceWitnesses) {
        assertReviewedSourceWitness(
          witness,
          `${entry.rowId}/C${binding.clusterId}`,
        )
      }
    }
  }
  const directClusterIdSet = new Set(directClusters)
  const supportIds = inventory.supportBindings.map(binding => binding.id)
  assert.deepEqual(supportIds, [...supportIds].sort())
  assert.equal(new Set(supportIds).size, supportIds.length)
  const supportPaths = []
  for (const binding of inventory.supportBindings) {
    assert.match(binding.id, /^[a-z0-9][a-z0-9-]*$/)
    assert.ok([
      'owning-direct-prerequisite',
      'inherited-residual',
    ].includes(binding.classification))
    assert.ok(typeof binding.reason === 'string' && binding.reason.length >= 20)
    assert.equal(binding.clusterId, undefined)
    assert.equal(binding.clusterIds, undefined)
    assertReviewedSourceWitness(binding.sourceWitness, binding.id, true)
    assert.deepEqual(
      binding.sourceWitness.matchedSemanticTerms,
      [...binding.sourceWitness.matchedSemanticTerms].sort(),
      `${binding.id}: canonical support semantic terms`,
    )
    supportPaths.push(binding.sourceWitness.path)
    assert.deepEqual(
      binding.relatedDirectClusterIds,
      [...new Set(binding.relatedDirectClusterIds)].sort(
        (left, right) => left - right,
      ),
    )
    assert.ok(binding.relatedDirectClusterIds.length > 0)
    assert.ok(binding.relatedDirectClusterIds.every(clusterId =>
      directClusterIdSet.has(clusterId)))
    assert.deepEqual(binding.testIds, [...new Set(binding.testIds)].sort())
    assert.ok(binding.testIds.length > 0)
  }
  assert.equal(new Set(supportPaths).size, supportPaths.length)
  const semanticClusterBindings = inventory.direct.flatMap(entry =>
    entry.clusterBindings.map(binding => ({ rowId: entry.rowId, ...binding })))
  assert.deepEqual(catalog.clusterInventory, {
    proof: record,
    totalClusters: EXPECTED_CLUSTER_COUNT,
    directGroups: inventory.direct.length,
    directClusters: directClusters.length,
    accountingOnlyGroups: inventory.accountingOnly.length,
    accountingOnlyClusters: accountingOnlyClusters.length,
    clusterBindingCount: directClusters.length,
    clusterBindingsSha256: sha256(Buffer.from(
      `${JSON.stringify(semanticClusterBindings)}\n`,
    )),
    supportBindingCount: inventory.supportBindings.length,
    supportSourcePathCount: supportPaths.length,
    supportBindingsSha256: sha256(Buffer.from(
      `${JSON.stringify(inventory.supportBindings)}\n`,
    )),
    partitionSha256: sha256(Buffer.from(`${[
      ...directClusters.map(clusterId => `direct\t${clusterId}`),
      ...accountingOnlyClusters.map(clusterId => `accounting-only\t${clusterId}`),
    ].sort().join('\n')}\n`)),
  })
  return { inventory, clusterById }
}

function changedSourcePaths() {
  return changedSourceRows().map(row => row.path).sort()
}

function changedSourceRows() {
  return execFileSync(
    'git',
    ['diff', '--name-status', '--no-renames', `${BASE_REVISION}..HEAD`, '--', 'src'],
    { cwd: repo, encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [status, sourcePath] = line.split('\t')
      return { status, path: sourcePath }
    })
    .sort((left, right) => left.path.localeCompare(right.path))
}

function deletedSourcePaths() {
  return execFileSync(
    'git',
    ['diff', '--name-status', '--no-renames', `${BASE_REVISION}..HEAD`, '--', 'src'],
    { cwd: repo, encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => line.split('\t'))
    .filter(([status]) => status === 'D')
    .map(([, relative]) => relative)
    .sort()
}

function focusedTestIds() {
  return fs.readdirSync(path.join(repo, 'recovery/test'))
    .filter(name =>
      /^recovery-2\.1\.124-.*\.test\.mjs$/.test(name) &&
      name !== 'recovery-2.1.124-direct-evidence.test.mjs')
    .map(name => name
      .replace(/^recovery-2\.1\.124-/, '')
      .replace(/\.test\.mjs$/, ''))
    .sort()
}

test('the final catalog is pinned to both authenticated adjacent bundles', () => {
  const baseline = readBundle(
    'CLAUDE_CODE_2_1_123_BUNDLE', BASELINE_BYTES, BASELINE_SHA256)
  const target = readBundle(
    'CLAUDE_CODE_2_1_124_BUNDLE', TARGET_BYTES, TARGET_SHA256)
  const catalog = readPinnedCatalog()
  const { inventory: clusterInventory, clusterById } =
    readPinnedClusterInventory(catalog)
  assert.equal(catalog.schemaVersion, 1)
  assert.equal(catalog.case, '2.1.123-to-2.1.124')
  assert.equal(catalog.release, '2.1.124')
  assert.equal(catalog.complete, true)
  assert.deepEqual(catalog.baseline, {
    bytes: BASELINE_BYTES,
    sha256: BASELINE_SHA256,
  })
  assert.deepEqual(catalog.target, {
    bytes: TARGET_BYTES,
    sha256: TARGET_SHA256,
  })
  assert.ok(catalog.rows.length > 0)
  assert.equal(catalog.rowCount, catalog.rows.length)
  assert.equal(catalog.categoryCounts.official, undefined)
  assert.ok(catalog.rows.every(row => row.category !== 'official'))
  const clusterByRow = new Map(
    clusterInventory.direct.map(entry => [entry.rowId, entry]),
  )
  const supportById = new Map(
    clusterInventory.supportBindings.map(binding => [binding.id, binding]),
  )
  assert.equal(clusterByRow.size, clusterInventory.direct.length)
  assert.equal(supportById.size, clusterInventory.supportBindings.length)
  assert.deepEqual(
    [...supportById.keys()].filter(id => clusterByRow.has(id)),
    [],
    'support row IDs do not collide with direct semantic rows',
  )
  assert.deepEqual(
    catalog.rows.map(row => row.id).sort(),
    [...clusterByRow.keys(), ...supportById.keys()].sort(),
  )
  const directEntryByClusterId = new Map(
    clusterInventory.direct.flatMap(entry =>
      entry.clusterIds.map(clusterId => [clusterId, entry])),
  )
  const relatedTargetWitnesses = binding => {
    const relatedEntries = new Map()
    for (const clusterId of binding.relatedDirectClusterIds) {
      const entry = directEntryByClusterId.get(clusterId)
      assert.ok(entry, `${binding.id}: related cluster is direct`)
      relatedEntries.set(entry.rowId, entry)
    }
    return [
      ...new Map(
        [...relatedEntries.values()].flatMap(entry =>
          entry.targetWitnesses.map(witness => [witness.value, witness])),
      ).values(),
    ].sort((left, right) => left.value.localeCompare(right.value))
  }
  const preciseOwnerPaths = [
    ...new Set(clusterInventory.direct.flatMap(entry => entry.sourcePaths)),
  ].sort()
  const supportPaths = clusterInventory.supportBindings
    .map(binding => binding.sourceWitness.path)
    .sort()
  assert.deepEqual(
    supportPaths.filter(sourcePath => preciseOwnerPaths.includes(sourcePath)),
    [],
    'precise owners and support paths are disjoint',
  )
  assert.deepEqual(
    [...preciseOwnerPaths, ...supportPaths].sort(),
    changedSourcePaths(),
    'precise owners plus support paths close the Git source boundary',
  )
  assert.equal(preciseOwnerPaths.length, EXPECTED_DIRECT_SOURCE_PATH_COUNT)
  assert.equal(supportPaths.length, EXPECTED_SUPPORT_SOURCE_PATH_COUNT)
  assert.equal(changedSourcePaths().length, EXPECTED_CHANGED_SOURCE_PATH_COUNT)
  assert.equal(catalog.changedSourcePathCount, changedSourcePaths().length)
  assert.ok(focusedTestIds().includes('semantic-delta'))
  assert.equal(catalog.focusedTestCount, focusedTestIds().length)
  for (const value of Object.values(catalog.coverageDeclarations)) {
    assert.equal(value, true, 'every coverage declaration is closed')
  }
  for (const row of catalog.rows) {
    const semantic = clusterByRow.get(row.id)
    const support = supportById.get(row.id)
    assert.notEqual(semantic === undefined, support === undefined,
      `${row.id}: exact semantic/support binding`)
    if (semantic !== undefined) {
      assert.equal(row.evidenceKind, 'reviewed-row-scoped-direct-evidence')
      assert.equal(row.sourceChangeSupport, undefined)
      assert.equal(row.relatedDirectClusterIds, undefined)
      assert.deepEqual(row.semanticClusterIds, semantic.clusterIds)
      assert.deepEqual(row.semanticClusterBindings, semantic.clusterBindings)
      assert.deepEqual(row.semanticTargetWitnesses, semantic.targetWitnesses)
      assert.deepEqual(
        row.targetFragments.map(fragment => fragment.text),
        semantic.targetWitnesses.map(witness => witness.value),
      )
      assert.deepEqual(row.focusedTests, semantic.testIds)
      const semanticSourceWitnesses = [
        ...new Map(
          semantic.clusterBindings.flatMap(binding =>
            binding.sourceWitnesses.map(sourceWitness => [
              `${sourceWitness.path}\u0000${sourceWitness.fragment}`,
              sourceWitness,
            ])),
        ).values(),
      ].sort((left, right) =>
        left.path.localeCompare(right.path) ||
          left.fragment.localeCompare(right.fragment))
      assert.deepEqual(
        row.sourceAssertions.map(sourceWitnessProjection),
        semanticSourceWitnesses.map(sourceWitnessProjection),
        `${row.id}: exact cluster source callsites`,
      )
      assert.deepEqual(row.sourcePathAbsences, semantic.sourcePathAbsences ?? [])
      assert.deepEqual(
        row.sourceFileAbsences.map(entry => entry.path),
        semantic.sourceFileAbsences ?? [],
      )
      assert.deepEqual(
        [...new Set([
          ...row.sourceAssertions.map(assertion => assertion.path),
          ...row.sourcePathAbsences.flatMap(absence => absence.paths),
          ...row.sourceFileAbsences.map(absence => absence.path),
        ])].sort(),
        semantic.sourcePaths,
      )
    } else {
      const targetWitnesses = relatedTargetWitnesses(support)
      assert.equal(row.evidenceKind, 'reviewed-source-change-support-evidence')
      assert.equal(row.semanticClusterIds, undefined)
      assert.equal(row.semanticClusterBindings, undefined)
      assert.deepEqual(row.sourceChangeSupport, support)
      assert.deepEqual(
        row.relatedDirectClusterIds,
        support.relatedDirectClusterIds,
      )
      assert.deepEqual(row.semanticTargetWitnesses, targetWitnesses)
      assert.deepEqual(
        row.targetFragments.map(fragment => fragment.text),
        targetWitnesses.map(witness => witness.value),
      )
      assert.deepEqual(
        row.sourceAssertions.map(sourceWitnessProjection),
        [sourceWitnessProjection(support.sourceWitness)],
      )
      assert.deepEqual(row.sourcePathAbsences, [])
      assert.deepEqual(row.sourceFileAbsences, [])
      assert.deepEqual(row.focusedTests, support.testIds)
    }
    assert.ok(row.targetFragments.length > 0, `${row.id}: bundle evidence`)
    assert.ok(row.sourceAssertions.length > 0, `${row.id}: source evidence`)
    assert.ok(row.focusedTests.length > 0, `${row.id}: focused test`)
    for (const fragment of row.targetFragments) {
      const value = Buffer.from(fragment.text)
      assert.equal(value.length, fragment.bytes, `${row.id}: fragment bytes`)
      assert.equal(sha256(value), fragment.sha256, `${row.id}: fragment SHA`)
      assert.equal(
        occurrences(baseline, fragment.text),
        fragment.baselineCount,
        `${row.id}: baseline count`,
      )
      assert.equal(
        occurrences(target, fragment.text),
        fragment.targetCount,
        `${row.id}: target count`,
      )
    }
    for (const [index, witness] of row.semanticTargetWitnesses.entries()) {
      assert.equal(witness.kind, 'literal', `${row.id}: literal target witness`)
      assert.equal(
        row.targetFragments[index].targetCount,
        witness.count,
        `${row.id}: semantic target witness count`,
      )
    }
    if (semantic !== undefined) {
      assert.deepEqual(
        row.semanticClusterBindings.map(binding => binding.clusterId),
        row.semanticClusterIds,
        `${row.id}: one witness binding per direct cluster`,
      )
      for (const binding of row.semanticClusterBindings) {
        const cluster = clusterById.get(binding.clusterId)
        assert.ok(cluster, `${row.id}/C${binding.clusterId}: cluster ledger entry`)
        const additionalTargetWitnesses = binding.additionalTargetWitnesses ?? []
        assert.ok(Array.isArray(additionalTargetWitnesses))
        if (binding.additionalTargetWitnesses !== undefined) {
          assert.ok(additionalTargetWitnesses.length > 0)
        }
        assert.deepEqual(
          additionalTargetWitnesses.map(witness => [
            witness.side,
            witness.statementIndex,
          ]),
          additionalTargetWitnesses
            .map(witness => [witness.side, witness.statementIndex])
            .sort((left, right) =>
              left[0].localeCompare(right[0]) || left[1] - right[1]),
          `${row.id}/C${binding.clusterId}: canonical additional witnesses`,
        )
        const targetWitnesses = [
          binding.targetWitness,
          ...additionalTargetWitnesses,
        ]
        assert.equal(
          new Set(targetWitnesses.map(witness =>
            `${witness.side}\u0000${witness.statementIndex}`)).size,
          targetWitnesses.length,
          `${row.id}/C${binding.clusterId}: unique statement witnesses`,
        )
        const selectedRawStatements = targetWitnesses.map((witness, index) =>
          assertRawStatementWitness({
            baseline,
            cluster,
            label: `${row.id}/C${binding.clusterId}/W${index + 1}`,
            target,
            witness,
          }))
        const allClusterRawStatements = [
          ...cluster.baselineStatements.map(statement =>
            baseline.slice(statement.raw.start, statement.raw.end)),
          ...cluster.targetStatements.map(statement =>
            target.slice(statement.raw.start, statement.raw.end)),
        ]
        assert.ok(binding.sourceWitnesses.length > 0)
        assert.ok(binding.testIds.length > 0)
        for (const sourceWitness of binding.sourceWitnesses) {
          assertReviewedSourceWitness(
            sourceWitness,
            `${row.id}/C${binding.clusterId}`,
            true,
          )
          for (const term of sourceWitness.matchedSemanticTerms) {
            if (allClusterRawStatements.some(statement => statement.includes(term))) {
              assert.ok(
                selectedRawStatements.some(statement => statement.includes(term)),
                `${row.id}/C${binding.clusterId}: selected raw witnesses omit source term ${JSON.stringify(term)}`,
              )
            }
          }
        }
      }
    }
    assert.equal(
      row.targetFragments.some(
        fragment => fragment.baselineCount !== fragment.targetCount,
      ),
      true,
      `${row.id}: adjacent bundle evidence`,
    )
    assert.notEqual(row.retained, true, `${row.id}: retained bypass`)
    if (semantic !== undefined) {
      assert.notDeepEqual(
        semantic.sourcePaths,
        changedSourcePaths(),
        `${row.id}: row-local source ownership must not equal the global delta`,
      )
    }
  }
})

test('every changed source path and focused suite is bound to an exact row', () => {
  const catalog = readPinnedCatalog()
  assert.deepEqual(catalog.changedSourceRows, changedSourceRows())
  const assertedPaths = new Set(catalog.rows.flatMap(row => [
    ...row.sourceAssertions.map(assertion => assertion.path),
    ...(row.sourcePathAbsences ?? []).flatMap(absence => absence.paths),
    ...(row.sourceFileAbsences ?? []).map(absence => absence.path),
  ]))
  const boundTests = new Set(catalog.rows.flatMap(row => row.focusedTests))
  const catalogDeletedPaths = catalog.rows
    .flatMap(row => (row.sourceFileAbsences ?? []).map(absence => absence.path))
    .sort()
  assert.equal(
    new Set(catalogDeletedPaths).size,
    catalogDeletedPaths.length,
    'deleted source paths are unique',
  )
  assert.deepEqual(
    catalogDeletedPaths,
    deletedSourcePaths(),
    'catalog deleted source paths exactly match git',
  )
  assert.deepEqual(
    changedSourcePaths().filter(value => !assertedPaths.has(value)),
    [],
    'all changed source paths have exact row evidence',
  )
  assert.deepEqual(
    [...assertedPaths].filter(value => !changedSourcePaths().includes(value)).sort(),
    [],
    'row source owners stay inside the exact changed-source boundary',
  )
  assert.deepEqual(
    focusedTestIds().filter(value => !boundTests.has(value)),
    [],
    'all focused recovery suites have row bindings',
  )
})

test('source witnesses and absences are exact and self-authenticating', () => {
  const catalog = readPinnedCatalog()
  for (const row of catalog.rows) {
    for (const assertion of row.sourceAssertions) {
      assertSafeSourcePath(assertion.path, row.id)
      const value = Buffer.from(assertion.fragment)
      assert.equal(value.length, assertion.bytes, `${row.id}: source bytes`)
      assert.equal(sha256(value), assertion.sha256, `${row.id}: source SHA`)
      const source = fs.readFileSync(path.join(repo, assertion.path), 'utf8')
      assert.equal(
        occurrences(source, assertion.fragment),
        assertion.count,
        `${row.id}: source count`,
      )
      assert.ok(assertion.count > 0, `${row.id}: source witness present`)
    }
    for (const absence of row.sourcePathAbsences ?? []) {
      const value = Buffer.from(absence.fragment)
      assert.equal(value.length, absence.bytes, `${row.id}: absence bytes`)
      assert.equal(sha256(value), absence.sha256, `${row.id}: absence SHA`)
      const count = absence.paths.reduce(
        (sum, relative) => {
          assertSafeSourcePath(relative, row.id)
          return sum + occurrences(
            fs.readFileSync(path.join(repo, relative), 'utf8'),
            absence.fragment,
          )
        },
        0,
      )
      assert.equal(count, 0, `${row.id}: required absence`)
    }
    for (const absence of row.sourceFileAbsences ?? []) {
      assertSafeSourcePath(absence.path, row.id)
      const filename = path.resolve(repo, absence.path)
      assert.ok(
        filename.startsWith(`${path.resolve(repo, 'src')}${path.sep}`),
        `${row.id}: deleted source path stays inside src`,
      )
      assert.equal(
        fs.existsSync(filename),
        false,
        `${row.id}: deleted source file is absent`,
      )
      const baseValue = execFileSync(
        'git',
        ['show', `${BASE_REVISION}:${absence.path}`],
        { cwd: repo },
      )
      assert.equal(baseValue.length, absence.baseBytes, `${row.id}: base bytes`)
      assert.equal(
        sha256(baseValue),
        absence.baseSha256,
        `${row.id}: base SHA-256`,
      )
    }
  }
})
