import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const TEST_FILE = 'recovery/test/recovery-2.1.120-official-bullets.test.mjs'
const repo = fileURLToPath(new URL('../..', import.meta.url))
const inventory = JSON.parse(
  fs.readFileSync(
    path.join(repo, 'recovery/2.1.120-official-semantic-inventory.json'),
    'utf8',
  ),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function countOccurrences(contents, fragment) {
  assert.ok(fragment.length > 0, 'cannot count an empty fragment')
  let count = 0
  let offset = 0
  while ((offset = contents.indexOf(fragment, offset)) !== -1) {
    count++
    offset += fragment.length
  }
  return count
}

let artifacts
function loadAuthenticatedArtifacts() {
  if (artifacts) return artifacts
  const baselinePath = process.env.CLAUDE_CODE_2_1_119_BUNDLE
  const targetPath = process.env.CLAUDE_CODE_2_1_120_BUNDLE
  assert.ok(baselinePath, 'CLAUDE_CODE_2_1_119_BUNDLE must be set')
  assert.ok(targetPath, 'CLAUDE_CODE_2_1_120_BUNDLE must be set')
  const baseline = fs.readFileSync(baselinePath)
  const target = fs.readFileSync(targetPath)
  assert.equal(
    baseline.length,
    inventory.authenticated_baseline.bytes,
    '2.1.119 bundle byte length',
  )
  assert.equal(
    sha256(baseline),
    inventory.authenticated_baseline.sha256,
    '2.1.119 bundle SHA-256',
  )
  assert.equal(
    target.length,
    inventory.authenticated_target.bytes,
    '2.1.120 bundle byte length',
  )
  assert.equal(
    sha256(target),
    inventory.authenticated_target.sha256,
    '2.1.120 bundle SHA-256',
  )
  artifacts = { baseline, target }
  return artifacts
}

function assertArtifactFragments(row) {
  const { baseline, target } = loadAuthenticatedArtifacts()
  for (const witness of row.artifact_fragments ?? []) {
    const fragment = Buffer.from(witness.fragment, 'utf8')
    assert.equal(
      countOccurrences(baseline, fragment),
      witness.baseline_count,
      `${row.test_id}: baseline fragment count: ${witness.fragment}`,
    )
    assert.equal(
      countOccurrences(target, fragment),
      witness.target_count,
      `${row.test_id}: target fragment count: ${witness.fragment}`,
    )
    assert.ok(witness.target_count > 0, `${row.test_id}: target witness absent`)
  }
}

function assertSourceEvidence(row) {
  assert.ok(Array.isArray(row.source), `${row.test_id}: source assertions`)
  assert.ok(row.source.length > 0, `${row.test_id}: no source boundary assertion`)
  for (const assertion of row.source) {
    const sourcePath = path.join(repo, assertion.path)
    const source = fs.readFileSync(sourcePath, 'utf8')
    for (const fragment of assertion.includes ?? []) {
      assert.ok(
        source.includes(fragment),
        `${row.test_id}: ${assertion.path} missing ${JSON.stringify(fragment)}`,
      )
    }
    for (const fragment of assertion.excludes ?? []) {
      assert.ok(
        !source.includes(fragment),
        `${row.test_id}: ${assertion.path} retained ${JSON.stringify(fragment)}`,
      )
    }
  }
}

assert.equal(inventory.schema_version, 1, 'inventory schema version')
assert.equal(inventory.release, '2.1.120', 'inventory release')
assert.equal(inventory.direct_all_22_test_coverage, true, 'direct coverage flag')
assert.equal(inventory.rows.length, 22, 'official bullet count')
assert.deepEqual(
  inventory.rows.map(row => row.bullet),
  Array.from({ length: 22 }, (_, index) => index + 1),
  'official bullet ordering',
)

const allowedClassifications = new Set([
  'active-source',
  'active-source-native-path',
  'retained-no-js-delta',
  'external-vscode-boundary',
])

for (const row of inventory.rows) {
  const padded = String(row.bullet).padStart(2, '0')
  assert.equal(row.test_id, `official-2.1.120-b${padded}`, 'stable test ID')
  assert.ok(row.changelog.length > 0, `${row.test_id}: changelog text`)
  assert.ok(
    row.normalized_witness.length > 0,
    `${row.test_id}: normalized witness`,
  )
  assert.ok(
    allowedClassifications.has(row.classification),
    `${row.test_id}: classification`,
  )
  if (row.classification.includes('boundary') || row.classification.includes('retained')) {
    assert.ok(row.boundary_note, `${row.test_id}: boundary note`)
  }

  test(`${row.test_id} (${TEST_FILE})`, () => {
    assertArtifactFragments(row)
    assertSourceEvidence(row)
  })
}
