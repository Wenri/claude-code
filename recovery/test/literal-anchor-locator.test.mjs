import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  locateExactLiteralAnchors,
  longestIncreasingSubsequenceIndices,
} from '../lib/literal-anchor-locator.mjs'

function withBundles(baselineText, targetText, callback) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'literal-anchor-test-'),
  )
  const baseline = path.join(directory, 'baseline.js')
  const target = path.join(directory, 'target.js')
  fs.writeFileSync(baseline, baselineText)
  fs.writeFileSync(target, targetText)
  try {
    return callback(baseline, target)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

test('computes a deterministic increasing subsequence', () => {
  assert.deepEqual(
    longestIncreasingSubsequenceIndices([10, 30, 20, 40]),
    [0, 2, 3],
  )
  assert.deepEqual(longestIncreasingSubsequenceIndices([]), [])
})

test('locates unique literals while ignoring identifier churn', () => {
  withBundles(
    'const a = "alpha anchor"; function f(x) { return x + "middle anchor" } console.log("omega anchor", a)',
    'const z = "alpha anchor"; function f(q) { return q + "middle anchor" } console.log("omega anchor", z)',
    (baseline, target) => {
      const report = locateExactLiteralAnchors(baseline, target, {
        minimumLiteralLength: 8,
      })
      assert.equal(report.summary.uniqueCommonAnchorCount, 3)
      assert.equal(report.summary.monotoneAnchorCount, 3)
      assert.equal(report.summary.partitionCount, 4)
      assert.equal(report.claim.includes('strict verifier'), true)
      assert.equal(
        report.partitions.every(
          partition => partition.requiresStrictVerification,
        ),
        true,
      )
    },
  )
})

test('excludes duplicate literals and reports moved anchors', () => {
  withBundles(
    'const a = ["alpha unique", "beta unique", "gamma unique", "duplicate literal", "duplicate literal"]',
    'const b = ["beta unique", "alpha unique", "gamma unique", "duplicate literal", "duplicate literal"]',
    (baseline, target) => {
      const report = locateExactLiteralAnchors(baseline, target, {
        minimumLiteralLength: 8,
      })
      assert.equal(report.summary.uniqueCommonAnchorCount, 3)
      assert.equal(report.summary.monotoneAnchorCount, 2)
      assert.equal(report.summary.nonMonotoneAnchorCount, 1)
      assert.equal(
        report.anchors.some(
          anchor => anchor.literal.preview === '"duplicate literal"',
        ),
        false,
      )
    },
  )
})

test('does not present target-only literals as anchors', () => {
  withBundles(
    'export const value = "stable literal anchor"',
    'export const value = "changed target literal"',
    (baseline, target) => {
      const report = locateExactLiteralAnchors(baseline, target)
      assert.equal(report.summary.uniqueCommonAnchorCount, 0)
      assert.equal(report.summary.partitionCount, 1)
      assert.equal(report.partitions[0].requiresStrictVerification, true)
    },
  )
})

