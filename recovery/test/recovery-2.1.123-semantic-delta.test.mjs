import assert from 'node:assert/strict'
import { gunzipSync } from 'node:zlib'
import test from 'node:test'
import {
  RELEASE_2_1_123,
  rebuildRelease21123Core,
} from '../scripts/build-2.1.123-semantic-delta.mjs'

const baselinePath = process.env.CLAUDE_CODE_2_1_122_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_123_BUNDLE

test('2.1.123 semantic delta is finite and has zero unexplained residue', () => {
  assert.ok(baselinePath, 'CLAUDE_CODE_2_1_122_BUNDLE must be set')
  assert.ok(targetPath, 'CLAUDE_CODE_2_1_123_BUNDLE must be set')
  const result = rebuildRelease21123Core({ baselinePath, targetPath })
  const proof = result.proof

  assert.equal(proof.complete, true)
  assert.equal(proof.case, '2.1.122-to-2.1.123')
  assert.equal(proof.release, '2.1.123')
  assert.deepEqual(proof.authenticatedInputs, {
    baseline: RELEASE_2_1_123.baseline,
    target: RELEASE_2_1_123.target,
  })
  assert.equal(
    proof.metadataNormalization.replacementCardinalityPerValue,
    162,
  )
  assert.deepEqual(
    proof.metadataNormalization.replacements.map(row => [
      row.field,
      row.count,
      row.baseline.value,
      row.target.value,
    ]),
    [
      ['version', 162, '2.1.122', '2.1.123'],
      [
        'buildTimestamp',
        162,
        '2026-04-28T01:31:31Z',
        '2026-04-29T00:34:52Z',
      ],
      [
        'sourceRevision',
        162,
        '70046c58fb1c720f82bcbf39a3447dadf5bd33b2',
        '54903ade25087ef906df59ec6a608cc3a50a3f06',
      ],
    ],
  )
  assert.deepEqual(proof.finiteInventories.literalDelta, [])
  assert.deepEqual(proof.finiteInventories.operatorDelta, [])
  assert.deepEqual(proof.finiteInventories.semanticPropertyDelta, [])
  assert.deepEqual(proof.finiteInventories.moduleSurfaceDelta, [])

  assert.equal(proof.knownDelta.oauthBetaHeader, 'oauth-2025-04-20')
  assert.deepEqual(proof.knownDelta.callCounts, {
    baselineCombined: 12,
    targetKillSwitch: 11,
    targetProvider: 4,
  })
  assert.deepEqual(proof.knownDelta.syntheticCallCounts, {
    killSwitch: 11,
    provider: 4,
  })
  assert.equal(proof.knownDelta.slices.length, 8)
  for (const slice of proof.knownDelta.slices) {
    assert.equal(Buffer.byteLength(slice.text), slice.bytes, slice.id)
    assert.match(slice.sha256, /^[a-f0-9]{64}$/, slice.id)
  }

  const narrowed = proof.ledgers.metadataNormalized
  assert.deepEqual(narrowed.coverage.units, {
    changed: 7,
    matched: 22_292,
    moved: 0,
    unresolved: 3,
    total: 22_302,
  })
  assert.deepEqual(narrowed.changedTargetIndices, [
    6_281,
    6_282,
    6_284,
    10_140,
    19_574,
    19_588,
    19_592,
  ])
  assert.deepEqual(narrowed.unresolvedTargetIndices, [6_279, 6_280, 6_286])

  const exact = proof.ledgers.knownDeltaExact
  assert.deepEqual(exact.coverage.units, {
    changed: 0,
    matched: RELEASE_2_1_123.targetUnits,
    moved: 0,
    unresolved: 0,
    total: RELEASE_2_1_123.targetUnits,
  })
  assert.equal(exact.coverage.tokens.changed, 0)
  assert.equal(exact.coverage.tokens.matched, RELEASE_2_1_123.targetTokens)
  assert.equal(exact.coverage.tokens.moved, 0)
  assert.equal(exact.coverage.tokens.unresolved, 0)
  assert.equal(exact.unmatchedBaselineCount, 0)
  assert.equal(exact.unresolvedTargetCount, 0)

  assert.deepEqual(proof.attribution.coverage, {
    partitionCount: 3,
    targetPartitionUtf16: RELEASE_2_1_123.target.bytes,
    exactAnchorCount: 0,
    exactAnchorTargetUtf16: 0,
    exactGeneratedPartitionCount: 2,
    exactGeneratedTargetUtf16: 13_947_757,
    changedHighConfidencePartitionCount: 1,
    changedHighConfidenceTargetUtf16: 1_819,
    changedCandidatePartitionCount: 0,
    changedCandidateTargetUtf16: 0,
    unresolvedPartitionCount: 0,
    unresolvedTargetUtf16: 0,
    accountedTargetUtf16: RELEASE_2_1_123.target.bytes,
    targetUtf16: RELEASE_2_1_123.target.bytes,
    unaccountedTargetUtf16: 0,
    targetRangeCount: 3,
    targetRangeUtf16: RELEASE_2_1_123.target.bytes,
  })
  assert.equal(
    proof.attribution.baselineOwnership.sourceCount,
    1,
  )

  const exactLedger = JSON.parse(gunzipSync(result.ledgers.exactLedger))
  assert.equal(exactLedger.regions.length, RELEASE_2_1_123.targetUnits)
  assert.ok(
    exactLedger.regions.every(region => region.classification === 'matched'),
  )
  assert.deepEqual(exactLedger.unmatchedBaseline, [])
  assert.deepEqual(exactLedger.unresolvedTarget, [])
})
