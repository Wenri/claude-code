import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const BASELINE_BYTES = 13_908_188
const BASELINE_SHA256 =
  '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a'
const TARGET_BYTES = 13_949_544
const TARGET_SHA256 =
  'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c'

// Updated only after the final source tree and row catalog are frozen. This
// impossible provisional identity makes every partial handoff fail closed.
const CATALOG_BYTES = 0
const CATALOG_SHA256 =
  '0000000000000000000000000000000000000000000000000000000000000000'
const CATALOG_PATH =
  'recovery/cases/2.1.121-to-2.1.122/semantic/direct-evidence.json'
const BASE_REVISION = '11890981447ee2cea3407c608f4411e43e5fe72a'
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

function focusedTestIds() {
  return fs.readdirSync(path.join(repo, 'recovery/test'))
    .filter(name =>
      /^recovery-2\.1\.122-.*\.test\.mjs$/.test(name) &&
      name !== 'recovery-2.1.122-direct-evidence.test.mjs')
    .map(name => name
      .replace(/^recovery-2\.1\.122-/, '')
      .replace(/\.test\.mjs$/, ''))
    .sort()
}

test('the final catalog is pinned to both authenticated adjacent bundles', () => {
  const baseline = readBundle(
    'CLAUDE_CODE_2_1_121_BUNDLE', BASELINE_BYTES, BASELINE_SHA256)
  const target = readBundle(
    'CLAUDE_CODE_2_1_122_BUNDLE', TARGET_BYTES, TARGET_SHA256)
  const catalog = readPinnedCatalog()
  assert.equal(catalog.schemaVersion, 1)
  assert.equal(catalog.case, '2.1.121-to-2.1.122')
  assert.equal(catalog.release, '2.1.122')
  assert.equal(catalog.complete, true)
  assert.deepEqual(catalog.baseline, {
    bytes: BASELINE_BYTES,
    sha256: BASELINE_SHA256,
  })
  assert.deepEqual(catalog.target, {
    bytes: TARGET_BYTES,
    sha256: TARGET_SHA256,
  })
  assert.ok(catalog.rows.length >= 18)
  assert.equal(catalog.rowCount, catalog.rows.length)
  assert.equal(catalog.categoryCounts.official, 18)
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
  const assertedPaths = new Set(catalog.rows.flatMap(row => [
    ...row.sourceAssertions.map(assertion => assertion.path),
    ...(row.sourcePathAbsences ?? []).flatMap(absence => absence.paths),
  ]))
  const boundTests = new Set(catalog.rows.flatMap(row => row.focusedTests))
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
  }
})
