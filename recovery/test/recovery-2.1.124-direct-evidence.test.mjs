import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const BASELINE_BYTES = 13_949_576
const BASELINE_SHA256 =
  '59c8eebc0660d4bbc5c1f82af0ca5e94df5db46084687b979ad21a07fba3d7dd'
const TARGET_BYTES = 13_980_928
const TARGET_SHA256 =
  'dc2b68c385a3064737343e51e6d7c690f9e03cc40fa89c4393708ae03094d590'

// Pinned only after the final source tree and focused-suite topology are frozen.
const CATALOG_BYTES = 0
const CATALOG_SHA256 =
  '0000000000000000000000000000000000000000000000000000000000000000'
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
  const directClusters = inventory.direct.flatMap(entry => entry.clusterIds)
  const accountingOnlyClusters = inventory.accountingOnly.flatMap(
    entry => entry.clusterIds,
  )
  const allClusters = [...directClusters, ...accountingOnlyClusters]
    .sort((left, right) => left - right)
  assert.equal(new Set(allClusters).size, EXPECTED_CLUSTER_COUNT)
  assert.deepEqual(
    allClusters,
    Array.from({ length: EXPECTED_CLUSTER_COUNT }, (_, index) => index + 1),
  )
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
  }
  assert.deepEqual(catalog.clusterInventory, {
    proof: record,
    totalClusters: EXPECTED_CLUSTER_COUNT,
    directGroups: inventory.direct.length,
    directClusters: directClusters.length,
    accountingOnlyGroups: inventory.accountingOnly.length,
    accountingOnlyClusters: accountingOnlyClusters.length,
    partitionSha256: sha256(Buffer.from(`${[
      ...directClusters.map(clusterId => `direct\t${clusterId}`),
      ...accountingOnlyClusters.map(clusterId => `accounting-only\t${clusterId}`),
    ].sort().join('\n')}\n`)),
  })
  return inventory
}

function changedSourcePaths() {
  return changedSourceRows().map(row => row.path)
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
  const clusterInventory = readPinnedClusterInventory(catalog)
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
  assert.equal(clusterByRow.size, clusterInventory.direct.length)
  assert.deepEqual(
    catalog.rows.map(row => row.id).sort(),
    [...clusterByRow.keys()].sort(),
  )
  assert.equal(catalog.changedSourcePathCount, changedSourcePaths().length)
  assert.ok(focusedTestIds().includes('semantic-delta'))
  assert.equal(catalog.focusedTestCount, focusedTestIds().length)
  for (const value of Object.values(catalog.coverageDeclarations)) {
    assert.equal(value, true, 'every coverage declaration is closed')
  }
  for (const row of catalog.rows) {
    const semantic = clusterByRow.get(row.id)
    assert.ok(semantic, `${row.id}: semantic cluster binding`)
    assert.deepEqual(row.semanticClusterIds, semantic.clusterIds)
    assert.deepEqual(row.semanticTargetWitnesses, semantic.targetWitnesses)
    assert.deepEqual(
      row.targetFragments.map(fragment => fragment.text),
      semantic.targetWitnesses.map(witness => witness.value),
    )
    assert.deepEqual(row.focusedTests, semantic.testIds)
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
    assert.equal(
      row.targetFragments.some(
        fragment => fragment.baselineCount !== fragment.targetCount,
      ),
      true,
      `${row.id}: adjacent bundle evidence`,
    )
    assert.notEqual(row.retained, true, `${row.id}: retained bypass`)
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
