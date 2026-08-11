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
const TEST_FILE = 'recovery/test/recovery-2.1.119-official-bullets.test.mjs'
const repo = fileURLToPath(new URL('../..', import.meta.url))
const inventory = JSON.parse(
  fs.readFileSync(
    path.join(repo, 'recovery/2.1.119-official-semantic-inventory.json'),
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
  const baselinePath = process.env.CLAUDE_CODE_2_1_118_BUNDLE
  const targetPath = process.env.CLAUDE_CODE_2_1_119_BUNDLE
  assert.ok(baselinePath, 'CLAUDE_CODE_2_1_118_BUNDLE must be set')
  assert.ok(targetPath, 'CLAUDE_CODE_2_1_119_BUNDLE must be set')
  const baseline = fs.readFileSync(baselinePath)
  const target = fs.readFileSync(targetPath)
  assert.equal(baseline.length, BASELINE_BYTES, '2.1.118 bundle byte length')
  assert.equal(sha256(baseline), BASELINE_SHA256, '2.1.118 bundle SHA-256')
  assert.equal(target.length, TARGET_BYTES, '2.1.119 bundle byte length')
  assert.equal(sha256(target), TARGET_SHA256, '2.1.119 bundle SHA-256')
  artifacts = { baseline, baselinePath, target, targetPath }
  return artifacts
}

function decodeTargetFragment(fragment) {
  assert.equal(fragment.encoding, 'base64', `${fragment.id}: encoding`)
  const bytes = Buffer.from(fragment.base64, 'base64')
  assert.equal(bytes.length, fragment.bytes, `${fragment.id}: byte length`)
  assert.equal(sha256(bytes), fragment.sha256, `${fragment.id}: SHA-256`)
  return bytes
}

function assertBundleEvidence(row) {
  const { baseline, target } = loadAuthenticatedArtifacts()
  assert.ok(
    Array.isArray(row.targetFragments) && row.targetFragments.length > 0,
    `${row.test_id}: targetFragments`,
  )
  for (const fragment of row.targetFragments) {
    const bytes = decodeTargetFragment(fragment)
    assert.equal(
      countOccurrences(baseline, bytes),
      fragment.baseline_count,
      `${fragment.id}: baseline count`,
    )
    assert.equal(
      countOccurrences(target, bytes),
      fragment.target_count,
      `${fragment.id}: target count`,
    )
    if (fragment.kind === 'target-exact') {
      assert.ok(fragment.target_count > 0, `${fragment.id}: absent from target`)
    } else if (fragment.kind === 'baseline-removal') {
      assert.ok(fragment.baseline_count > 0, `${fragment.id}: absent from baseline`)
      assert.equal(fragment.target_count, 0, `${fragment.id}: not removed`)
    } else {
      assert.fail(`${fragment.id}: unsupported fragment kind ${fragment.kind}`)
    }
  }
}

function assertSourceEvidence(row) {
  assert.ok(Array.isArray(row.source), `${row.test_id}: source assertions`)
  assert.ok(row.source.length > 0, `${row.test_id}: no owned source assertion`)
  for (const assertion of row.source) {
    const fragment = Buffer.from(assertion.fragment, 'utf8')
    assert.equal(
      fragment.length,
      assertion.bytes,
      `${row.test_id}: ${assertion.path}: fragment byte length`,
    )
    assert.equal(
      sha256(fragment),
      assertion.sha256,
      `${row.test_id}: ${assertion.path}: fragment SHA-256`,
    )
    const source = fs.readFileSync(path.join(repo, assertion.path))
    assert.equal(
      countOccurrences(source, fragment),
      assertion.count,
      `${row.test_id}: ${assertion.path}: exact source count`,
    )
  }
}

function assertNativeBoundary(row) {
  const { baselinePath, targetPath } = loadAuthenticatedArtifacts()
  assert.equal(row.targetFragments.length, 1, `${row.test_id}: native witness`)
  const witness = row.targetFragments[0]
  assert.equal(witness.kind, 'native-artifact', `${row.test_id}: witness kind`)
  const baselineNative = fs.readFileSync(
    path.join(path.dirname(baselinePath), witness.artifact),
  )
  const targetNative = fs.readFileSync(
    path.join(path.dirname(targetPath), witness.artifact),
  )
  assert.equal(baselineNative.length, witness.baseline_bytes, 'baseline native bytes')
  assert.equal(targetNative.length, witness.target_bytes, 'target native bytes')
  assert.equal(
    sha256(baselineNative),
    witness.baseline_sha256,
    'baseline native SHA-256',
  )
  assert.equal(
    sha256(targetNative),
    witness.target_sha256,
    'target native SHA-256',
  )
  assert.deepEqual(targetNative, baselineNative, 'Linux native artifact boundary')
  assert.deepEqual(row.source, [], `${row.test_id}: no Linux source delta`)
}

assert.equal(inventory.schema_version, 2, 'inventory schema version')
assert.equal(inventory.release, '2.1.119', 'inventory release')
assert.equal(inventory.direct_all_51_test_coverage, true, 'direct coverage flag')
assert.equal(inventory.rows.length, 51, 'official bullet count')
assert.deepEqual(
  inventory.rows.map(row => row.bullet),
  Array.from({ length: 51 }, (_, index) => index + 1),
  'official bullet ordering',
)

for (const row of inventory.rows) {
  const padded = String(row.bullet).padStart(2, '0')
  assert.equal(row.test_id, `official-2.1.119-b${padded}`, 'stable test ID')
  assert.equal(
    row.direct_test,
    `${TEST_FILE}#${row.test_id}`,
    `${row.test_id}: direct test pointer`,
  )
  test(row.test_id, () => {
    if (row.bullet === 51) assertNativeBoundary(row)
    else {
      assertBundleEvidence(row)
      assertSourceEvidence(row)
    }
  })
}
