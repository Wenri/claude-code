import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { verifyReadableDiff } from '../scripts/verify-readable-diff.mjs'

const REPORT = fileURLToPath(
  new URL(
    '../cases/2.1.88-to-2.1.89/readable-diff',
    import.meta.url,
  ),
)

test('checked-in readable diff is canonical and comparison-preserving', () => {
  const result = verifyReadableDiff({
    expectedBaselineSha256:
      '75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f',
    expectedMetadataSha256:
      'c8ffebb49805ef4f0ca597c63729ae7ce09ce5a9de6efae9e5c4d5ec0fcdf261',
    expectedTargetSha256:
      'a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01',
    reportDirectory: REPORT,
  })

  assert.equal(result.status, 'readable-diff-verified')
  assert.equal(result.normalizedDiff.bytes, 24096865)
  assert.equal(result.matching.structurallyUniquePairs, 12334)
  assert.deepEqual(result.renames, {
    accepted: 16254,
    edits: 87233,
    rejected: 5580,
  })
})
