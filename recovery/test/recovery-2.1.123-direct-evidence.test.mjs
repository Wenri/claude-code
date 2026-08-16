import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const BASELINE_BYTES = 13_949_544
const BASELINE_SHA256 =
  'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c'
const TARGET_BYTES = 13_949_576
const TARGET_SHA256 =
  '59c8eebc0660d4bbc5c1f82af0ca5e94df5db46084687b979ad21a07fba3d7dd'

// Pinned only after the final source tree and both focused suites are frozen.
const CATALOG_BYTES = 0
const CATALOG_SHA256 = '0'.repeat(64)
const CATALOG_PATH =
  'recovery/cases/2.1.122-to-2.1.123/semantic/direct-evidence.json'
const BASE_REVISION = 'c30cece4b85c84cd9e92ca708c96d1cd3f8f6b87'
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
  return JSON.parse(value)
}

function changedSourcePaths() {
  return execFileSync(
    'git',
    ['diff', '--name-only', `${BASE_REVISION}..HEAD`, '--', 'src'],
    { cwd: repo, encoding: 'utf8' },
  ).trim().split('\n').filter(Boolean).sort()
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
      /^recovery-2\.1\.123-.*\.test\.mjs$/.test(name) &&
      name !== 'recovery-2.1.123-direct-evidence.test.mjs')
    .map(name => name
      .replace(/^recovery-2\.1\.123-/, '')
      .replace(/\.test\.mjs$/, ''))
    .sort()
}

test('the final catalog is pinned to both authenticated adjacent bundles', () => {
  const baseline = readBundle(
    'CLAUDE_CODE_2_1_122_BUNDLE', BASELINE_BYTES, BASELINE_SHA256)
  const target = readBundle(
    'CLAUDE_CODE_2_1_123_BUNDLE', TARGET_BYTES, TARGET_SHA256)
  const catalog = readPinnedCatalog()
  assert.equal(catalog.schemaVersion, 1)
  assert.equal(catalog.case, '2.1.122-to-2.1.123')
  assert.equal(catalog.release, '2.1.123')
  assert.equal(catalog.complete, true)
  assert.deepEqual(catalog.baseline, {
    bytes: BASELINE_BYTES,
    sha256: BASELINE_SHA256,
  })
  assert.deepEqual(catalog.target, {
    bytes: TARGET_BYTES,
    sha256: TARGET_SHA256,
  })
  assert.equal(catalog.rows.length, 1)
  assert.equal(catalog.rowCount, catalog.rows.length)
  assert.deepEqual(catalog.categoryCounts, { official: 1 })
  assert.equal(catalog.changedSourcePathCount, 1)
  assert.deepEqual(focusedTestIds(), [
    'oauth-beta-disable-experimental',
    'semantic-delta',
  ])
  assert.equal(catalog.focusedTestCount, 2)
  assert.equal(catalog.rows[0].id, 'B01')
  assert.deepEqual(catalog.rows[0].focusedTests, focusedTestIds())
  for (const value of Object.values(catalog.coverageDeclarations)) {
    assert.equal(value, true, 'every coverage declaration is closed')
  }
  for (const row of catalog.rows) {
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
  }
})

test('every changed source path and focused suite is bound to an exact row', () => {
  const catalog = readPinnedCatalog()
  assert.deepEqual(changedSourcePaths(), ['src/utils/betas.ts'])
  assert.deepEqual(focusedTestIds(), [
    'oauth-beta-disable-experimental',
    'semantic-delta',
  ])
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
      assert.ok(assertion.path.startsWith('src/'), `${row.id}: safe source path`)
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
        (sum, relative) => sum + occurrences(
          fs.readFileSync(path.join(repo, relative), 'utf8'),
          absence.fragment,
        ),
        0,
      )
      assert.equal(count, 0, `${row.id}: required absence`)
    }
    for (const absence of row.sourceFileAbsences ?? []) {
      assert.ok(absence.path.startsWith('src/'), `${row.id}: safe deleted path`)
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
