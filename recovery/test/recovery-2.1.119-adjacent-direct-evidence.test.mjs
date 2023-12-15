import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const BASELINE_BYTES = 13_234_618
const BASELINE_SHA256 =
  '84d06c8582112ca623b66cc28b3a55c5d57e9add86d7a1b1163d6a12a31a9ffa'
const TARGET_BYTES = 13_720_987
const TARGET_SHA256 =
  '9a1fccbe69ffe06c82345db1cc8cdbbc9a9929ed723bc8832ad48dfeff64b4ef'
const CATALOG_BYTES = 156_609
const CATALOG_SHA256 =
  '6f3829ac9fd4da733d9bf960f7a4834df789caa246ecc3f50fda281b33a2d1d7'
const CATALOG_PATH =
  'recovery/cases/2.1.118-to-2.1.119/semantic/adjacent-direct-evidence.json'
const repo = fileURLToPath(new URL('../..', import.meta.url))
// The catalog authenticates the pristine Target119 source tree. Replayed
// package outputs are covered by their dedicated source-gap proofs and must
// not silently replace these original row-scoped witnesses.
const directEvidenceSourceRoot = path.resolve(
  process.env.CLAUDE_CODE_DIRECT_EVIDENCE_SOURCE_ROOT ??
    path.join(repo, '.recovery-tmp/semantic-trees/2.1.119/src'),
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
  const filename = path.resolve(directEvidenceSourceRoot, relativePath.slice(4))
  assert.ok(
    filename.startsWith(directEvidenceSourceRoot + path.sep),
    `${label}: source path remains under the selected root`,
  )
  const status = fs.lstatSync(filename)
  assert.equal(status.isFile(), true, `${label}: regular file`)
  assert.equal(status.isSymbolicLink(), false, `${label}: not a symlink`)
  return fs.readFileSync(filename)
}

const catalogBytes = readPinnedFile(
  CATALOG_PATH,
  CATALOG_BYTES,
  CATALOG_SHA256,
  'adjacent direct-evidence catalog',
)
const catalog = JSON.parse(catalogBytes)

function loadRawCatalog(metadata) {
  const value = readPinnedFile(
    metadata.path,
    metadata.bytes,
    metadata.sha256,
    `raw catalog ${metadata.path}`,
  )
  return JSON.parse(value)
}

function expectedRawRows() {
  const catalogs = catalog.rawCatalogs.map(loadRawCatalog)
  assert.equal(catalogs.length, 2, 'hidden + daemon raw catalogs')
  const rows = catalogs.flatMap(value => value.obligations)
  const knownTestIds = new Set(
    catalogs.flatMap(value =>
      Object.keys(value.testSuites ?? value.tests ?? {}),
    ),
  )
  return { knownTestIds, rows }
}

function assertFragmentMetadata(fragment, label) {
  const value = Buffer.from(fragment.text ?? fragment.fragment, 'utf8')
  assert.equal(value.length, fragment.bytes, `${label}: byte length`)
  assert.equal(sha256(value), fragment.sha256, `${label}: SHA-256`)
  return value
}

function sourceFiles() {
  const files = []
  const queue = [directEvidenceSourceRoot]
  while (queue.length > 0) {
    const directory = queue.shift()
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const filename = path.join(directory, entry.name)
      const status = fs.lstatSync(filename)
      assert.equal(status.isSymbolicLink(), false, `source path is not a symlink: ${filename}`)
      if (status.isDirectory()) queue.push(filename)
      else if (status.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) {
        files.push(fs.readFileSync(filename))
      }
    }
  }
  return files
}

test('adjacent-direct-evidence.catalog-exhaustive', () => {
  assert.equal(catalog.schemaVersion, 1, 'catalog schema')
  assert.equal(catalog.release, '2.1.119', 'catalog release')
  assert.equal(catalog.rowCount, 84, 'declared row count')
  assert.equal(catalog.rows.length, 84, 'actual row count')
  assert.deepEqual(catalog.baseline, {
    bytes: BASELINE_BYTES,
    sha256: BASELINE_SHA256,
  })
  assert.deepEqual(catalog.target, {
    bytes: TARGET_BYTES,
    sha256: TARGET_SHA256,
  })

  const { knownTestIds, rows: rawRows } = expectedRawRows()
  const rawIds = rawRows.map(row => row.id)
  const directIds = catalog.rows.map(row => row.id)
  assert.equal(new Set(rawIds).size, 84, '84 unique raw obligation IDs')
  assert.equal(new Set(directIds).size, 84, '84 unique evidence row IDs')
  assert.deepEqual(directIds, rawIds, 'evidence rows exhaust raw obligations in order')

  const rawById = new Map(rawRows.map(row => [row.id, row]))
  for (const row of catalog.rows) {
    const raw = rawById.get(row.id)
    assert.ok(raw, `${row.id}: raw obligation exists`)
    assert.equal(row.obligationId, row.id.toLowerCase(), `${row.id}: stable ID`)
    assert.equal(row.classification, raw.classification, `${row.id}: classification`)
    assert.equal(row.status, raw.status, `${row.id}: status`)
    assert.deepEqual(row.testIds, raw.testIds, `${row.id}: exact raw test IDs`)
    assert.ok(row.testIds.length > 0, `${row.id}: nonempty test IDs`)
    for (const testId of row.testIds) {
      assert.equal(knownTestIds.has(testId), true, `${row.id}: known ${testId}`)
    }
    assert.match(
      row.evidenceKind,
      /^manually-reviewed-direct(?:-absence)?-evidence$/,
      `${row.id}: reviewed direct evidence`,
    )
    assert.ok(row.rationale.length > 0, `${row.id}: rationale`)
    assert.ok(row.targetFragments.length > 0, `${row.id}: target witnesses`)
  }
})

test('adjacent-direct-evidence.authenticated-bundle-counts', () => {
  const baseline = readAuthenticatedBundle(
    'CLAUDE_CODE_2_1_118_BUNDLE',
    BASELINE_BYTES,
    BASELINE_SHA256,
  )
  const target = readAuthenticatedBundle(
    'CLAUDE_CODE_2_1_119_BUNDLE',
    TARGET_BYTES,
    TARGET_SHA256,
  )

  for (const row of catalog.rows) {
    for (const fragment of row.targetFragments) {
      const value = assertFragmentMetadata(fragment, `${row.id}: target witness`)
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
      assert.ok(fragment.targetCount > 0, `${row.id}: target witness is present`)
    }
    for (const fragment of row.targetAbsences) {
      const value = assertFragmentMetadata(fragment, `${row.id}: target absence`)
      assert.equal(
        occurrences(baseline, value),
        fragment.baselineCount,
        `${row.id}: absent baseline count`,
      )
      assert.equal(
        occurrences(target, value),
        fragment.targetCount,
        `${row.id}: absent target count`,
      )
      assert.equal(fragment.targetCount, 0, `${row.id}: target absence is absent`)
    }
  }
})

test('adjacent-direct-evidence.exact-source-counts', () => {
  const allSourceFiles = sourceFiles()
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
      assert.ok(sourceAssertion.count > 0, `${row.id}: source witness is present`)
    }
    for (const sourceAbsence of row.sourceAbsences) {
      assert.equal(
        sourceAbsence.scope,
        'src/**/*.{ts,tsx}',
        `${row.id}: supported absence scope`,
      )
      const value = assertFragmentMetadata(
        sourceAbsence,
        `${row.id}: source absence`,
      )
      const count = allSourceFiles.reduce(
        (sum, source) => sum + occurrences(source, value),
        0,
      )
      assert.equal(count, sourceAbsence.count, `${row.id}: source absence count`)
      assert.equal(sourceAbsence.count, 0, `${row.id}: source absence is absent`)
    }
  }
})
