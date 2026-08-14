import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const TEST_FILE =
  'recovery/test/recovery-2.1.121-official-runtime-settings-cluster.test.mjs'
const repo = fileURLToPath(new URL('../..', import.meta.url))
const inventory = JSON.parse(
  fs.readFileSync(
    path.join(
      repo,
      'recovery/2.1.121-official-runtime-settings-cluster-inventory.json',
    ),
    'utf8',
  ),
)

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')

function countOccurrences(contents, fragment) {
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
  const baselinePath = process.env.CLAUDE_CODE_2_1_120_BUNDLE
  const targetPath = process.env.CLAUDE_CODE_2_1_121_BUNDLE
  assert.ok(baselinePath, 'CLAUDE_CODE_2_1_120_BUNDLE must be set')
  assert.ok(targetPath, 'CLAUDE_CODE_2_1_121_BUNDLE must be set')
  const baseline = fs.readFileSync(baselinePath)
  const target = fs.readFileSync(targetPath)
  assert.equal(baseline.length, inventory.authenticated_baseline.bytes)
  assert.equal(sha256(baseline), inventory.authenticated_baseline.sha256)
  assert.equal(target.length, inventory.authenticated_target.bytes)
  assert.equal(sha256(target), inventory.authenticated_target.sha256)
  artifacts = { baseline, target }
  return artifacts
}

assert.equal(inventory.schema_version, 1)
assert.equal(inventory.release, '2.1.121')
assert.deepEqual(inventory.owned_bullets, [14, 31, 32, 33, 34, 35, 38, 39])
assert.deepEqual(
  inventory.rows.map(row => row.bullet),
  inventory.owned_bullets,
)

for (const row of inventory.rows) {
  const padded = String(row.bullet).padStart(2, '0')
  assert.equal(row.test_id, `official-2.1.121-b${padded}`)
  assert.ok(row.normalized_witness)
  assert.ok(row.source.length > 0)

  test(`${row.test_id} (${TEST_FILE})`, () => {
    const { baseline, target } = loadAuthenticatedArtifacts()
    for (const witness of row.artifact_fragments) {
      assert.equal(
        countOccurrences(baseline, witness.fragment),
        witness.baseline_count,
        `${row.test_id}: baseline ${witness.fragment}`,
      )
      assert.equal(
        countOccurrences(target, witness.fragment),
        witness.target_count,
        `${row.test_id}: target ${witness.fragment}`,
      )
    }
    for (const sourceWitness of row.source) {
      const source = fs.readFileSync(path.join(repo, sourceWitness.path), 'utf8')
      for (const fragment of sourceWitness.includes ?? []) {
        assert.ok(
          source.includes(fragment),
          `${row.test_id}: ${sourceWitness.path} missing ${JSON.stringify(fragment)}`,
        )
      }
      for (const fragment of sourceWitness.excludes ?? []) {
        assert.ok(
          !source.includes(fragment),
          `${row.test_id}: ${sourceWitness.path} unexpectedly contains ${JSON.stringify(fragment)}`,
        )
      }
    }
  })
}
