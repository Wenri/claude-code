import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import test from 'node:test'
import {
  RELEASE_2_1_126,
  rebuildRelease21126Core,
} from '../scripts/build-2.1.126-semantic-delta.mjs'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const structural = path.join(
  repo,
  'recovery/cases/2.1.124-to-2.1.126/structural',
)
const baselinePath = process.env.CLAUDE_CODE_2_1_124_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_126_BUNDLE
const sourceRoot = process.env.CLAUDE_CODE_2_1_126_SOURCE_ROOT ?? repo

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  let count = 0
  let offset = 0
  while ((offset = contents.indexOf(fragment, offset)) !== -1) {
    count += 1
    offset += fragment.length
  }
  return count
}

function inventoryDelta(cluster, collection, key) {
  return cluster.inventory[collection].find(row => row.key === key)
}

test('2.1.126 semantic delta exhaustively closes every adjacent cluster', () => {
  assert.ok(baselinePath, 'CLAUDE_CODE_2_1_124_BUNDLE must be set')
  assert.ok(targetPath, 'CLAUDE_CODE_2_1_126_BUNDLE must be set')
  const result = rebuildRelease21126Core({
    baselinePath,
    targetPath,
    sourceRoot,
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
  assert.equal(proof.case, '2.1.124-to-2.1.126')
  assert.equal(proof.release, '2.1.126')
  assert.deepEqual(proof.authenticatedInputs, {
    baseline: RELEASE_2_1_126.baseline,
    target: RELEASE_2_1_126.target,
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
      ['version', 162, 163, '2.1.124', '2.1.126'],
      [
        'buildTimestamp',
        162,
        162,
        '2026-04-30T00:25:36Z',
        '2026-04-30T16:01:00Z',
      ],
      [
        'sourceRevision',
        162,
        162,
        '241621312a512bb8563f31eaa762903c15edaa07',
        'e44c1d97bd39dbf2525164f3fd33be6edbf1661e',
      ],
    ],
  )
  assert.deepEqual(
    proof.metadataNormalization.normalizedTarget,
    RELEASE_2_1_126.normalizedTarget,
  )

  assert.deepEqual(proof.knownDelta.changedSourcePaths, {
    baseRevision: 'ae866640a6d67891fe14aeff5bc41da10784b979',
    overlayRevision: '5b99258953100cc337aa42a047dc7d059657c6f8',
    recoveredSourceTree: '5632342fec59adeeea18e0d0fc8ab4aff3d72893',
    count: 4,
    paths: [
      'src/commands/effort/effort.tsx',
      'src/services/api/claude.ts',
      'src/services/api/client.ts',
      'src/tools/FileReadTool/FileReadTool.ts',
    ],
  })
  assert.deepEqual(proof.knownDelta.releaseBulletClassification, {
    total: 33,
    activeAdjacent: [10, 17, 18],
    baselineRetained: [
      1, 2, 3, 4, 5, 6, 7, 8, 9,
      11, 12, 13, 14, 15, 16,
      19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33,
    ],
    hiddenAdjacentRows: ['effort-settings-persistence'],
  })
  assert.equal(
    proof.knownDelta.releaseBulletClassification.activeAdjacent.length +
      proof.knownDelta.releaseBulletClassification.baselineRetained.length,
    33,
  )

  const inventory = proof.knownDelta.clusterInventory
  assert.equal(inventory.totalClusters, 6)
  assert.equal(inventory.direct.length, 3)
  assert.deepEqual(
    inventory.direct.map(row => [
      row.rowId,
      row.clusterIds,
      row.releaseBullets,
      row.testIds,
    ]),
    [
      [
        'stream-idle-timeout',
        [1, 6],
        [17, 18],
        ['active-semantics', 'semantic-delta'],
      ],
      [
        'file-read-malware-reminder-removal',
        [2, 3],
        [10],
        ['active-semantics', 'semantic-delta'],
      ],
      [
        'effort-settings-persistence',
        [4],
        [],
        ['active-semantics', 'semantic-delta'],
      ],
    ],
  )
  assert.deepEqual(inventory.accountingOnly.map(row => row.clusterIds), [[5]])
  assert.equal(inventory.accountingOnly[0].reason, 'initializer-linkage')
  assert.deepEqual(
    inventory.accountingOnly[0].evidence.pairedDirectClusterIds,
    [4],
  )
  assert.deepEqual(inventory.supportBindings, [])

  const directIds = inventory.direct.flatMap(row => row.clusterIds)
  const accountingIds = inventory.accountingOnly.flatMap(row => row.clusterIds)
  assert.deepEqual(directIds, [1, 6, 2, 3, 4])
  assert.deepEqual(
    [...directIds, ...accountingIds].sort((left, right) => left - right),
    [1, 2, 3, 4, 5, 6],
  )
  assert.equal(new Set([...directIds, ...accountingIds]).size, 6)
  assert.deepEqual(
    [...new Set(inventory.direct.flatMap(row => row.sourcePaths))].sort(),
    proof.knownDelta.changedSourcePaths.paths,
  )

  const baselineSource = fs.readFileSync(baselinePath, 'utf8')
  const targetSource = fs.readFileSync(targetPath, 'utf8')
  const clusterLedger = JSON.parse(
    gunzipSync(result.ledgers.cluster).toString('utf8'),
  )
  assert.equal(
    clusterLedger.kind,
    '2.1.126-binding-aware-semantic-cluster-ledger',
  )
  assert.deepEqual(clusterLedger.statementCounts, {
    baseline: 22_358,
    target: 22_358,
  })
  assert.deepEqual(clusterLedger.coverage, {
    clusterCount: 6,
    baselineChangedStatementCount: 9,
    targetChangedStatementCount: 9,
    classifications: { ambiguous: 3, application: 3 },
  })
  assert.deepEqual(
    clusterLedger.clusters.map(cluster => cluster.id),
    [1, 2, 3, 4, 5, 6],
  )
  assert.ok(clusterLedger.clusters.every(cluster =>
    Array.isArray(cluster.inventory.allIdentifierDelta)))

  const bindingById = new Map(
    inventory.direct.flatMap(row => row.clusterBindings)
      .map(binding => [binding.clusterId, binding]),
  )
  assert.equal(bindingById.size, 5)
  const expectedSide = new Map([
    [1, 'target'],
    [2, 'baseline'],
    [3, 'target'],
    [4, 'target'],
    [6, 'target'],
  ])
  for (const [clusterId, binding] of bindingById) {
    const cluster = clusterLedger.clusters.find(row => row.id === clusterId)
    const witnesses = [
      binding.targetWitness,
      ...(binding.additionalTargetWitnesses ?? []),
    ]
    assert.ok(cluster, `C${clusterId}: cluster entry`)
    assert.ok(witnesses.every(witness => witness.side === expectedSide.get(clusterId)))
    assert.deepEqual(
      witnesses.map(witness => witness.statementIndex)
        .sort((left, right) => left - right),
      cluster[`${expectedSide.get(clusterId)}Statements`]
        .map(statement => statement.index)
        .sort((left, right) => left - right),
      `C${clusterId}: every changed ${expectedSide.get(clusterId)} statement`,
    )
    assert.equal(
      new Set(witnesses.map(witness => witness.statementIndex)).size,
      witnesses.length,
      `C${clusterId}: unique raw witnesses`,
    )
    for (const witness of witnesses) {
      const sideSource = witness.side === 'target' ? targetSource : baselineSource
      const otherSource = witness.side === 'target' ? baselineSource : targetSource
      const statement = sideSource.slice(witness.start, witness.end)
      const ledgerStatement = cluster[`${witness.side}Statements`]
        .find(row => row.index === witness.statementIndex)
      assert.equal(Buffer.byteLength(statement), witness.bytes)
      assert.equal(sha256(statement), witness.sha256)
      assert.equal(witness.normalizedSha256, ledgerStatement.normalized.sha256)
      assert.equal(occurrences(sideSource, statement), witness.count)
      assert.equal(occurrences(otherSource, statement), witness.otherSideCount)
      assert.notEqual(witness.count, witness.otherSideCount)
    }
    for (const sourceWitness of binding.sourceWitnesses) {
      const source = fs.readFileSync(
        path.join(sourceRoot, sourceWitness.path),
        'utf8',
      )
      assert.equal(
        occurrences(source, sourceWitness.fragment),
        sourceWitness.count,
        `C${clusterId} ${sourceWitness.path}: positive source witness`,
      )
      assert.equal(sourceWitness.reviewed, true)
    }
    for (const absence of binding.sourceAbsences ?? []) {
      const source = fs.readFileSync(path.join(sourceRoot, absence.path), 'utf8')
      assert.equal(
        occurrences(source, absence.fragment),
        0,
        `C${clusterId} ${absence.path}: source removal`,
      )
    }
  }
  assert.notEqual(
    bindingById.get(3).targetWitness.sha256,
    bindingById.get(3).targetWitness.normalizedSha256,
    'C3 raw and all-identifier-normalized hashes are independently bound',
  )
  assert.notEqual(
    bindingById.get(4).targetWitness.sha256,
    bindingById.get(4).targetWitness.normalizedSha256,
    'C4 raw and all-identifier-normalized hashes are independently bound',
  )
  assert.notEqual(
    bindingById.get(6).targetWitness.sha256,
    bindingById.get(6).targetWitness.normalizedSha256,
    'C6 raw and all-identifier-normalized hashes are independently bound',
  )

  const clusters = new Map(clusterLedger.clusters.map(cluster => [
    cluster.id,
    cluster,
  ]))
  assert.deepEqual(
    inventoryDelta(clusters.get(1), 'allIdentifierDelta', 'Number'),
    { key: 'Number', baseline: 0, target: 1, delta: 1 },
  )
  assert.deepEqual(
    inventoryDelta(clusters.get(1), 'literalDelta', 'number:90000'),
    { key: 'number:90000', baseline: 1, target: 0, delta: -1 },
  )
  assert.deepEqual(
    inventoryDelta(clusters.get(2), 'allIdentifierDelta', 'aB_'),
    { key: 'aB_', baseline: 1, target: 0, delta: -1 },
  )
  assert.deepEqual(
    inventoryDelta(clusters.get(3), 'allIdentifierDelta', 'mainLoopModel'),
    { key: 'mainLoopModel', baseline: 2, target: 1, delta: -1 },
  )
  assert.ok(clusters.get(3).inventory.literalDelta.some(row =>
    row.key.startsWith('template:\n\n<system-reminder>') &&
      row.baseline === 1 && row.target === 0))
  assert.deepEqual(
    inventoryDelta(clusters.get(4), 'semanticPropertyDelta', 'Property:effortLevel'),
    { key: 'Property:effortLevel', baseline: 0, target: 2, delta: 2 },
  )
  assert.deepEqual(clusters.get(5).inventory.literalDelta, [])
  assert.deepEqual(clusters.get(5).inventory.operatorDelta, [])
  assert.deepEqual(clusters.get(5).inventory.semanticPropertyDelta, [])
  assert.deepEqual(
    inventoryDelta(clusters.get(5), 'allIdentifierDelta', 'Y6'),
    { key: 'Y6', baseline: 0, target: 1, delta: 1 },
  )
  assert.deepEqual(
    inventoryDelta(clusters.get(6), 'allIdentifierDelta', 'Ei8'),
    { key: 'Ei8', baseline: 0, target: 1, delta: 1 },
  )

  for (const row of inventory.direct) {
    for (const witness of row.targetWitnesses) {
      assert.equal(occurrences(targetSource, witness.value), witness.count)
      assert.notEqual(occurrences(baselineSource, witness.value), witness.count)
    }
  }

  const effortSource = fs.readFileSync(
    path.join(sourceRoot, 'src/commands/effort/effort.tsx'),
    'utf8',
  )
  const persistIndex = effortSource.indexOf(
    "updateSettingsForSource('userSettings', {",
  )
  const telemetryIndex = effortSource.indexOf("logEvent('tengu_effort_command'", persistIndex)
  const unpinIndex = effortSource.indexOf('unpinLaunchEffort()', persistIndex)
  assert.ok(persistIndex !== -1 && persistIndex < telemetryIndex)
  assert.ok(telemetryIndex < unpinIndex)

  const exact = proof.ledgers.knownDeltaExact
  assert.deepEqual(exact.coverage.units, {
    changed: 0,
    matched: RELEASE_2_1_126.targetUnits,
    moved: 0,
    unresolved: 0,
    total: RELEASE_2_1_126.targetUnits,
  })
  assert.equal(exact.coverage.tokens.changed, 0)
  assert.equal(exact.coverage.tokens.matched, RELEASE_2_1_126.targetTokens)
  assert.equal(exact.coverage.tokens.moved, 0)
  assert.equal(exact.coverage.tokens.unresolved, 0)
  assert.equal(exact.unmatchedBaselineCount, 0)
  assert.equal(exact.unresolvedTargetCount, 0)

  const committedProof = fs.readFileSync(
    path.join(structural, 'known-delta-proof.json'),
  )
  assert.equal(committedProof.length, 25_049)
  assert.equal(
    sha256(committedProof),
    'd21ddc907423b3fb7d9ed7ac2d8e50fd541b45bc561105c65d6757c12acb54be',
  )
  const parsedCommittedProof = JSON.parse(committedProof)
  assert.deepEqual(parsedCommittedProof.knownDelta, proof.knownDelta)
  assert.deepEqual(parsedCommittedProof.ledgers, proof.ledgers)
  assert.deepEqual(parsedCommittedProof.artifacts, {
    rawLedger: {
      path: 'structural/generated-delta.json.gz',
      bytes: 2_257_547,
      sha256: 'c5032b816690e1df5c30d1286278d674414671a6055ebf726b53b00f1073b88a',
    },
    metadataLedger: {
      path: 'structural/metadata-normalized-delta.json.gz',
      bytes: 2_237_149,
      sha256: 'f7b4ace72ab4505a17b25310399bfacbff3ee07c6378440e6e1e2fdb2888458b',
    },
    exactLedger: {
      path: 'structural/known-delta-ledger.json.gz',
      bytes: 2_234_299,
      sha256: '66e0052214d8a90a10058f383e09ab7d9480836eeed1d1d41973a83de55fc1c9',
    },
    clusterLedger: {
      path: 'structural/semantic-cluster-ledger.json.gz',
      bytes: 5_818,
      sha256: 'a4dd3dfcca8a075b20aa24d8c6dad3cfde8b4fa54bce0a3979469531bb2fa622',
    },
  })
})
