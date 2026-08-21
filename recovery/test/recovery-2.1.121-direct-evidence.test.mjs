import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const BASELINE_BYTES = 13_784_743
const BASELINE_SHA256 =
  'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f'
const TARGET_BYTES = 13_908_188
const TARGET_SHA256 =
  '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a'

// Updated only after the final source tree and row catalog are frozen. The
// deliberately impossible provisional identity makes a partial handoff fail.
const CATALOG_BYTES = 340_038
const CATALOG_SHA256 =
  'bf3912d74cb9920bfb5556b8aff48dc71d8d465cacea2b1a7c8119fc0b22e17a'
const CATALOG_PATH =
  'recovery/cases/2.1.120-to-2.1.121/semantic/direct-evidence.json'
const CHANGELOG_PATH =
  'recovery/cases/2.1.120-to-2.1.121/evidence/CHANGELOG-2.1.121.md'
const HIDDEN_PATH = 'recovery/2.1.121-hidden-semantic-inventory.json'
const BASE_REVISION = '6801ead984ba2c3df02bd092ad8b93df096ed8c1'

const repo = fileURLToPath(new URL('../..', import.meta.url))
// The catalog authenticates the pristine Target121 source tree. Package replay
// outputs are authenticated by their dedicated source-gap tests and must not
// silently replace these original row-scoped witnesses.
const directEvidenceSourceRoot = path.resolve(
  process.env.CLAUDE_CODE_DIRECT_EVIDENCE_SOURCE_ROOT ??
    path.join(repo, '.recovery-tmp/semantic-trees/2.1.121/src'),
)
const frozenSourcePathsPath = path.join(
  repo,
  'recovery/cases/2.1.120-to-2.1.121/recovered/source-freeze/source-paths.txt',
)

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

function readPinnedFile(relativePath, expectedBytes, expectedSha256, label) {
  assert.equal(path.isAbsolute(relativePath), false, `${label}: relative path`)
  assert.equal(relativePath.includes('..'), false, `${label}: no traversal`)
  const filename = path.join(repo, relativePath)
  const status = fs.lstatSync(filename)
  assert.equal(status.isFile(), true, `${label}: regular file`)
  assert.equal(status.isSymbolicLink(), false, `${label}: not a symlink`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, expectedBytes, `${label}: byte length`)
  assert.equal(sha256(value), expectedSha256, `${label}: SHA-256`)
  return value
}

function readAuthenticatedBundle(environmentName, expectedBytes, expectedSha256) {
  const filename = process.env[environmentName]
  assert.ok(filename, `${environmentName} must be set`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, expectedBytes, `${environmentName}: byte length`)
  assert.equal(sha256(value), expectedSha256, `${environmentName}: SHA-256`)
  return value
}

function readSemanticSource(relativePath, label) {
  assert.match(relativePath, /^src\//, `${label}: source-relative path`)
  const filename = path.resolve(
    directEvidenceSourceRoot,
    relativePath.slice(4),
  )
  assert.ok(
    filename.startsWith(directEvidenceSourceRoot + path.sep),
    `${label}: source path remains under the selected root`,
  )
  const status = fs.lstatSync(filename)
  assert.equal(status.isFile(), true, `${label}: regular file`)
  assert.equal(status.isSymbolicLink(), false, `${label}: not a symlink`)
  return fs.readFileSync(filename)
}

function assertFragmentMetadata(fragment, label) {
  const text = fragment.text ?? fragment.fragment
  const value = Buffer.from(text, 'utf8')
  assert.equal(value.length, fragment.bytes, `${label}: byte length`)
  assert.equal(sha256(value), fragment.sha256, `${label}: SHA-256`)
  return value
}

function changedSourcePaths() {
  if (fs.existsSync(frozenSourcePathsPath)) {
    return fs
      .readFileSync(frozenSourcePathsPath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => line.split('\t').at(-1))
      .sort()
  }
  return execFileSync(
    'git',
    ['diff', '--name-only', `${BASE_REVISION}..HEAD`, '--', 'src'],
    { cwd: repo, encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .sort()
}

const catalogBytes = readPinnedFile(
  CATALOG_PATH,
  CATALOG_BYTES,
  CATALOG_SHA256,
  '2.1.121 direct-evidence catalog',
)
const catalog = JSON.parse(catalogBytes)
const changelog = fs
  .readFileSync(path.join(repo, CHANGELOG_PATH), 'utf8')
  .split('\n')
  .filter(line => line.startsWith('- '))
  .map(line => line.slice(2))
const hidden = JSON.parse(fs.readFileSync(path.join(repo, HIDDEN_PATH), 'utf8'))

test('2.1.121-direct-evidence.catalog-is-exhaustive-and-row-scoped', () => {
  assert.equal(catalog.schemaVersion, 1)
  assert.equal(catalog.case, '2.1.120-to-2.1.121')
  assert.equal(catalog.release, '2.1.121')
  assert.deepEqual(catalog.baseline, {
    bytes: BASELINE_BYTES,
    sha256: BASELINE_SHA256,
  })
  assert.deepEqual(catalog.target, {
    bytes: TARGET_BYTES,
    sha256: TARGET_SHA256,
  })
  assert.equal(changelog.length, 39)
  assert.equal(catalog.rowCount, catalog.rows.length)
  assert.equal(new Set(catalog.rows.map(row => row.id)).size, catalog.rowCount)
  assert.equal(catalog.categoryCounts.official, 39)
  assert.equal(catalog.categoryCounts.hidden, 13)
  assert.ok(catalog.categoryCounts.daemon > 0)
  assert.ok(catalog.categoryCounts.residual > 0)
  assert.deepEqual(
    catalog.rows
      .filter(row => row.category === 'official')
      .map(row => row.releaseBullet),
    Array.from({ length: 39 }, (_, index) => index + 1),
  )

  const hiddenById = new Map(hidden.obligations.map(row => [row.id, row]))
  for (const input of catalog.inputs) {
    readPinnedFile(input.path, input.bytes, input.sha256, `input ${input.path}`)
  }
  for (const row of catalog.rows) {
    assert.equal(
      row.evidenceKind,
      'reviewed-row-scoped-direct-evidence',
      `${row.id}: evidence kind`,
    )
    assert.match(row.obligationId, /^[a-z0-9][a-z0-9-]*$/)
    assert.ok(row.title.length > 0, `${row.id}: title`)
    assert.ok(row.rationale.length > 0, `${row.id}: rationale`)
    assert.ok(row.targetFragments.length > 0, `${row.id}: bundle evidence`)
    assert.ok(row.sourceAssertions.length > 0, `${row.id}: source evidence`)
    assert.ok(row.focusedTests.length > 0, `${row.id}: focused test binding`)
    assert.deepEqual(
      row.targetAbsences,
      row.targetFragments.filter(fragment => fragment.targetCount === 0),
      `${row.id}: explicit target absences`,
    )
    assert.deepEqual(row.sourceAbsences, [], `${row.id}: no global fallback`)
    if (row.category === 'official') {
      assert.equal(row.title, changelog[row.releaseBullet - 1])
    }
    if (row.category === 'hidden') {
      assert.equal(row.title, hiddenById.get(row.id)?.title, `${row.id}: title`)
    }
  }

  const allDirectSourcePaths = new Set(
    catalog.rows.flatMap(row => [
      ...row.sourceAssertions.map(assertion => assertion.path),
      ...row.sourcePathAbsences.flatMap(absence => absence.paths),
    ]),
  )
  assert.deepEqual(
    changedSourcePaths().filter(sourcePath => !allDirectSourcePaths.has(sourcePath)),
    [],
    'every changed source path has reviewed row-scoped direct evidence',
  )
})

test('2.1.121-direct-evidence.authenticated-adjacent-bundle-counts', () => {
  const baseline = readAuthenticatedBundle(
    'CLAUDE_CODE_2_1_120_BUNDLE',
    BASELINE_BYTES,
    BASELINE_SHA256,
  )
  const target = readAuthenticatedBundle(
    'CLAUDE_CODE_2_1_121_BUNDLE',
    TARGET_BYTES,
    TARGET_SHA256,
  )

  for (const row of catalog.rows) {
    for (const fragment of row.targetFragments) {
      const value = assertFragmentMetadata(fragment, `${row.id}: bundle witness`)
      assert.equal(
        occurrences(baseline, value),
        fragment.baselineCount,
        `${row.id}: baseline count: ${fragment.text}`,
      )
      assert.equal(
        occurrences(target, value),
        fragment.targetCount,
        `${row.id}: target count: ${fragment.text}`,
      )
    }
    const changed = row.targetFragments.some(
      fragment => fragment.baselineCount !== fragment.targetCount,
    )
    assert.equal(changed || row.retained === true, true, `${row.id}: delta evidence`)
  }
})

test('2.1.121-direct-evidence.exact-source-counts-and-absences', () => {
  for (const row of catalog.rows) {
    for (const sourceAssertion of row.sourceAssertions) {
      const value = assertFragmentMetadata(
        sourceAssertion,
        `${row.id}: ${sourceAssertion.path}`,
      )
      const source = readSemanticSource(
        sourceAssertion.path,
        `${row.id}: source path`,
      )
      assert.equal(
        occurrences(source, value),
        sourceAssertion.count,
        `${row.id}: exact source count: ${sourceAssertion.path}`,
      )
      assert.ok(sourceAssertion.count > 0, `${row.id}: source witness present`)
    }
    for (const sourceAbsence of row.sourcePathAbsences) {
      const value = assertFragmentMetadata(sourceAbsence, `${row.id}: absence`)
      assert.deepEqual(
        sourceAbsence.paths,
        [...new Set(sourceAbsence.paths)].sort(),
        `${row.id}: canonical absence paths`,
      )
      const count = sourceAbsence.paths.reduce((sum, sourcePath) => {
        const source = readSemanticSource(sourcePath, `${row.id}: absence path`)
        return sum + occurrences(source, value)
      }, 0)
      assert.equal(count, 0, `${row.id}: source absence count`)
      assert.equal(sourceAbsence.count, 0, `${row.id}: recorded source absence`)
    }
  }
})
