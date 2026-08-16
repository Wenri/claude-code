import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import test from 'node:test'
import {
  RELEASE_2_1_124,
  rebuildRelease21124Core,
} from '../scripts/build-2.1.124-semantic-delta.mjs'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const structural = path.join(
  repo,
  'recovery/cases/2.1.123-to-2.1.124/structural',
)
const baselinePath = process.env.CLAUDE_CODE_2_1_123_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_124_BUNDLE

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test('2.1.124 semantic clusters exhaustively close with zero residue', () => {
  assert.ok(baselinePath, 'CLAUDE_CODE_2_1_123_BUNDLE must be set')
  assert.ok(targetPath, 'CLAUDE_CODE_2_1_124_BUNDLE must be set')
  const result = rebuildRelease21124Core({
    baselinePath,
    targetPath,
    rawLedgerPath: path.join(structural, 'generated-delta.json.gz'),
    metadataLedgerPath: path.join(
      structural,
      'metadata-normalized-delta.json.gz',
    ),
    exactLedgerPath: path.join(structural, 'known-delta-ledger.json.gz'),
    clusterLedgerPath: path.join(
      structural,
      'semantic-cluster-ledger.json.gz',
    ),
  })
  const proof = result.proof
  assert.equal(proof.complete, true)
  assert.equal(proof.case, '2.1.123-to-2.1.124')
  assert.equal(proof.release, '2.1.124')
  assert.deepEqual(proof.authenticatedInputs, {
    baseline: RELEASE_2_1_124.baseline,
    target: RELEASE_2_1_124.target,
  })
  assert.equal(
    proof.metadataNormalization.replacementCardinalityPerValue,
    162,
  )
  assert.deepEqual(
    proof.metadataNormalization.replacements.map(row => [
      row.field,
      row.count,
      row.rawCount,
      row.baseline.value,
      row.target.value,
    ]),
    [
      ['version', 162, 163, '2.1.123', '2.1.124'],
      [
        'buildTimestamp',
        162,
        162,
        '2026-04-29T00:34:52Z',
        '2026-04-30T00:25:36Z',
      ],
      [
        'sourceRevision',
        162,
        162,
        '54903ade25087ef906df59ec6a608cc3a50a3f06',
        '241621312a512bb8563f31eaa762903c15edaa07',
      ],
    ],
  )

  const inventory = proof.knownDelta.clusterInventory
  assert.equal(inventory.totalClusters, 205)
  assert.equal(inventory.direct.length, 16)
  assert.equal(inventory.accountingOnly.length, 4)
  const directIds = inventory.direct.flatMap(row => row.clusterIds)
  const accountingIds = inventory.accountingOnly.flatMap(
    row => row.clusterIds,
  )
  assert.equal(directIds.length, 177)
  assert.equal(accountingIds.length, 28)
  assert.deepEqual(
    [...directIds, ...accountingIds].sort((left, right) => left - right),
    Array.from({ length: 205 }, (_, index) => index + 1),
  )
  assert.equal(new Set([...directIds, ...accountingIds]).size, 205)
  assert.deepEqual(
    [...new Set(inventory.direct.flatMap(row => row.testIds))].sort(),
    [
      'gateway-doctor-plugins',
      'history-picker-scopes',
      'mcp-oauth-dedup',
      'project-purge',
      'repl-isolation',
      'runtime-tail',
      'semantic-delta',
      'skill-activation-telemetry',
      'ui-command-semantics',
      'ui-sdk-tail',
    ],
  )
  const sourcePaths = new Set(
    inventory.direct.flatMap(row => row.sourcePaths),
  )
  assert.equal(sourcePaths.size, 129)
  assert.ok(sourcePaths.has('src/QueryEngine.ts'))
  assert.ok(sourcePaths.has('src/entrypoints/sdk/controlSchemas.ts'))
  assert.ok(sourcePaths.has('src/hooks/notifs/useStartupNotifications.tsx'))
  assert.ok(sourcePaths.has('src/migrations/migrateNotificationImpressions.ts'))
  assert.ok(
    inventory.direct.every(
      row =>
        row.retained === undefined &&
        row.sourcePaths.length > 0 &&
        row.targetWitnesses.length > 0 &&
        row.targetWitnesses.every(witness =>
          witness.kind === 'literal' && witness.count > 0),
    ),
  )

  const exact = proof.ledgers.knownDeltaExact
  assert.deepEqual(exact.coverage.units, {
    changed: 0,
    matched: RELEASE_2_1_124.targetUnits,
    moved: 0,
    unresolved: 0,
    total: RELEASE_2_1_124.targetUnits,
  })
  assert.equal(exact.coverage.tokens.changed, 0)
  assert.equal(exact.coverage.tokens.matched, RELEASE_2_1_124.targetTokens)
  assert.equal(exact.coverage.tokens.moved, 0)
  assert.equal(exact.coverage.tokens.unresolved, 0)
  assert.equal(exact.unmatchedBaselineCount, 0)
  assert.equal(exact.unresolvedTargetCount, 0)

  const clusterLedger = JSON.parse(
    gunzipSync(result.ledgers.cluster).toString('utf8'),
  )
  assert.equal(clusterLedger.coverage.clusterCount, 205)
  assert.equal(clusterLedger.coverage.targetChangedStatementCount, 375)
  assert.equal(clusterLedger.coverage.baselineChangedStatementCount, 319)
  assert.deepEqual(
    clusterLedger.clusters.map(cluster => cluster.id),
    Array.from({ length: 205 }, (_, index) => index + 1),
  )

  const committedProof = fs.readFileSync(
    path.join(structural, 'known-delta-proof.json'),
  )
  assert.equal(committedProof.length, 80_895)
  assert.equal(
    sha256(committedProof),
    'e77c41755941af59ccf371d301d348514316bbe7f31f1436a398cbffbe3332cd',
  )
  const parsedCommittedProof = JSON.parse(committedProof)
  assert.deepEqual(parsedCommittedProof.knownDelta, proof.knownDelta)
  assert.deepEqual(parsedCommittedProof.ledgers, proof.ledgers)
})
