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
const sourceRoot = process.env.CLAUDE_CODE_2_1_124_SOURCE_ROOT ?? repo

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

test('2.1.124 semantic clusters exhaustively close with zero residue', () => {
  assert.ok(baselinePath, 'CLAUDE_CODE_2_1_123_BUNDLE must be set')
  assert.ok(targetPath, 'CLAUDE_CODE_2_1_124_BUNDLE must be set')
  const result = rebuildRelease21124Core({
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
  assert.equal(inventory.direct.length, 17)
  assert.equal(inventory.accountingOnly.length, 4)
  const directIds = inventory.direct.flatMap(row => row.clusterIds)
  const accountingIds = inventory.accountingOnly.flatMap(
    row => row.clusterIds,
  )
  assert.equal(directIds.length, 168)
  assert.equal(accountingIds.length, 37)
  assert.deepEqual(accountingIds, [
    1,2,9,10,11,26,
    74,86,157,158,165,190,
    4,16,31,33,34,36,47,56,60,61,97,98,112,116,138,141,145,147,176,179,202,
    113,114,123,159,
  ])
  assert.deepEqual(
    [...directIds, ...accountingIds].sort((left, right) => left - right),
    Array.from({ length: 205 }, (_, index) => index + 1),
  )
  assert.equal(new Set([...directIds, ...accountingIds]).size, 205)
  assert.ok(directIds.includes(12))
  assert.ok(directIds.includes(69))
  assert.ok(directIds.includes(115))
  assert.ok(directIds.includes(186))
  assert.ok(directIds.includes(188))
  assert.ok(directIds.includes(189))
  assert.ok(!accountingIds.includes(69))
  assert.ok(!accountingIds.includes(115))
  assert.ok(!accountingIds.includes(186))
  assert.ok(!accountingIds.includes(188))
  assert.ok(!accountingIds.includes(189))
  assert.deepEqual(
    [...new Set(inventory.direct.flatMap(row => row.testIds))].sort(),
    [
      'gateway-doctor-plugins',
      'history-picker-scopes',
      'legacy-list-peers-alias',
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
  const directSourcePaths = new Set(
    inventory.direct.flatMap(row => row.sourcePaths),
  )
  const supportPaths = inventory.supportBindings.map(
    binding => binding.sourceWitness.path,
  )
  assert.equal(directSourcePaths.size, 121)
  assert.equal(inventory.supportBindings.length, 10)
  assert.equal(new Set(supportPaths).size, 10)
  assert.ok(supportPaths.every(path => !directSourcePaths.has(path)))
  const allSourcePaths = [
    ...new Set([...directSourcePaths, ...supportPaths]),
  ].sort()
  assert.equal(proof.knownDelta.changedSourcePaths.count, 131)
  assert.deepEqual(
    allSourcePaths,
    proof.knownDelta.changedSourcePaths.paths,
  )
  assert.ok(directSourcePaths.has('src/QueryEngine.ts'))
  assert.ok(directSourcePaths.has('src/tools/ListPeersTool/constants.ts'))
  assert.ok(directSourcePaths.has('src/entrypoints/sdk/controlSchemas.ts'))
  assert.ok(directSourcePaths.has('src/hooks/notifs/useStartupNotifications.tsx'))
  assert.ok(directSourcePaths.has('src/migrations/migrateNotificationImpressions.ts'))
  assert.ok(directSourcePaths.has('src/utils/permissions/permissionRuleParser.ts'))
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

  const baselineSource = fs.readFileSync(baselinePath, 'utf8')
  const targetSource = fs.readFileSync(targetPath, 'utf8')
  const clusterLedger = JSON.parse(
    gunzipSync(result.ledgers.cluster).toString('utf8'),
  )
  const bindings = inventory.direct.flatMap(row => row.clusterBindings)
  assert.equal(bindings.length, directIds.length)
  assert.deepEqual(
    bindings.map(binding => binding.clusterId).sort((left, right) => left - right),
    [...directIds].sort((left, right) => left - right),
  )
  for (const row of inventory.direct) {
    assert.deepEqual(
      row.clusterBindings.map(binding => binding.clusterId),
      row.clusterIds,
      `${row.rowId}: one binding per cluster`,
    )
    assert.deepEqual(
      row.sourcePaths,
      [...new Set(row.clusterBindings.flatMap(binding =>
        binding.sourceWitnesses.map(witness => witness.path)))].sort(),
      `${row.rowId}: exact source union`,
    )
    assert.deepEqual(
      row.testIds,
      [...new Set(row.clusterBindings.flatMap(binding => binding.testIds))]
        .sort(),
      `${row.rowId}: exact focused-test union`,
    )
  }
  for (const binding of bindings) {
    const rawWitnesses = [
      binding.targetWitness,
      ...(binding.additionalTargetWitnesses ?? []),
    ]
    assert.equal(
      new Set(rawWitnesses.map(witness =>
        `${witness.side}:${witness.statementIndex}`)).size,
      rawWitnesses.length,
      `C${binding.clusterId}: raw witnesses are unique`,
    )
    assert.deepEqual(
      binding.additionalTargetWitnesses ?? [],
      [...(binding.additionalTargetWitnesses ?? [])].sort((left, right) =>
        left.side.localeCompare(right.side) ||
        left.statementIndex - right.statementIndex),
      `C${binding.clusterId}: additional raw witnesses are canonical`,
    )
    for (const witness of rawWitnesses) {
      assert.equal(witness.kind, 'raw-statement')
      assert.ok(['baseline', 'target'].includes(witness.side))
      const sideSource = witness.side === 'target' ? targetSource : baselineSource
      const otherSource = witness.side === 'target' ? baselineSource : targetSource
      const statement = sideSource.slice(witness.start, witness.end)
      assert.equal(Buffer.byteLength(statement), witness.bytes)
      assert.equal(sha256(statement), witness.sha256)
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
        `C${binding.clusterId} ${sourceWitness.path}`,
      )
      assert.equal(
        sourceWitness.reviewed,
        true,
        `C${binding.clusterId} ${sourceWitness.path}: unreviewed source witness`,
      )
    }
    const cluster = clusterLedger.clusters.find(
      candidate => candidate.id === binding.clusterId,
    )
    assert.ok(cluster, `C${binding.clusterId}: cluster ledger entry exists`)
    const allClusterRaw = [
      ...cluster.baselineStatements.map(statement =>
        baselineSource.slice(statement.raw.start, statement.raw.end)),
      ...cluster.targetStatements.map(statement =>
        targetSource.slice(statement.raw.start, statement.raw.end)),
    ].join('\n')
    const selectedRaw = rawWitnesses.map(witness =>
      (witness.side === 'target' ? targetSource : baselineSource)
        .slice(witness.start, witness.end)).join('\n')
    for (const term of new Set(binding.sourceWitnesses.flatMap(
      witness => witness.matchedSemanticTerms,
    ))) {
      if (allClusterRaw.includes(term)) {
        assert.ok(
          selectedRaw.includes(term),
          `C${binding.clusterId}: selected raw witnesses cover ${JSON.stringify(term)}`,
        )
      }
    }
    for (const absence of binding.sourceAbsences ?? []) {
      const source = fs.readFileSync(path.join(sourceRoot, absence.path), 'utf8')
      assert.equal(
        occurrences(source, absence.fragment),
        0,
        `C${binding.clusterId} ${absence.path}: source removal`,
      )
    }
  }

  const bindingById = new Map(bindings.map(binding => [binding.clusterId, binding]))
  const supportIds = inventory.supportBindings.map(binding => binding.id)
  assert.deepEqual(supportIds, [...supportIds].sort())
  assert.equal(new Set(supportIds).size, supportIds.length)
  for (const support of inventory.supportBindings) {
    assert.equal(support.classification, 'owning-direct-prerequisite')
    assert.ok(support.reason.length > 20)
    assert.equal(support.sourceWitness.reviewed, true)
    assert.ok(support.sourceWitness.matchedSemanticTerms.length > 0)
    const source = fs.readFileSync(
      path.join(sourceRoot, support.sourceWitness.path),
      'utf8',
    )
    assert.equal(
      occurrences(source, support.sourceWitness.fragment),
      support.sourceWitness.count,
      `${support.id}: exact support fragment`,
    )
    assert.ok(support.relatedDirectClusterIds.length > 0)
    assert.deepEqual(
      support.relatedDirectClusterIds,
      [...support.relatedDirectClusterIds].sort((left, right) => left - right),
    )
    assert.ok(support.relatedDirectClusterIds.every(id => bindingById.has(id)))
    assert.deepEqual(
      support.testIds,
      [...new Set(support.relatedDirectClusterIds.flatMap(id =>
        bindingById.get(id).testIds))].sort(),
    )
  }

  for (const row of inventory.accountingOnly) {
    assert.deepEqual(
      Object.keys(row.evidence.clusterRationales).map(Number),
      row.clusterIds,
      `${row.reason}: one reviewed rationale per accounting cluster`,
    )
    assert.ok(Object.values(row.evidence.clusterRationales).every(
      rationale => rationale.length > 20,
    ))
    if (row.reason === 'initializer-linkage') {
      assert.deepEqual(row.evidence.pairedDirectClusterIds, [
        3,17,18,32,35,62,110,151,167,168,180,
      ])
      assert.ok(row.evidence.pairedDirectClusterIds.every(id => bindingById.has(id)))
    }
  }
  assert.equal(
    bindings.find(binding => binding.clusterId === 69).targetWitness
      .statementIndex,
    11_954,
  )
  assert.equal(
    bindings.find(binding => binding.clusterId === 115).targetWitness
      .statementIndex,
    14_953,
  )
  assert.equal(
    bindings.find(binding => binding.clusterId === 115).targetWitness.side,
    'baseline',
  )
  const cluster57 = bindings.find(binding => binding.clusterId === 57)
  assert.deepEqual(
    cluster57.sourceWitnesses.map(witness => [witness.fragment, witness.count]),
    [
      ["'oauth_org_not_allowed',", 1],
      ['origin: SDKMessageOriginSchema().optional(),', 3],
    ],
  )
  const cluster131 = bindings.find(binding => binding.clusterId === 131)
  assert.deepEqual(
    cluster131.sourceWitnesses.map(witness => witness.fragment),
    [
      'const turnsWithReplacementText = new Set<number>();',
      'textSuppressingNameSet.has(block.name)',
      '!turnsWithReplacementText.has(messageTurns[index]!)',
      'return !msg.isMeta || isChannelOrigin(msg.origin);',
    ],
  )
  const hardenedBindings = {
    27: {
      statementIndices: [6_243],
      sourceFragments: [
        'Authorization: null,',
        'const authToken = await tokenCache.getToken()',
      ],
    },
    29: {
      statementIndices: [6_365],
      sourceFragments: ['refreshTokenUsed = lockedTokens.refreshToken'],
    },
    32: {
      statementIndices: [6_693],
      sourceFragments: [
        '!isEnvTruthy(process.env.DISABLE_GROWTHBOOK) &&',
      ],
    },
    35: {
      statementIndices: [6_783],
      sourceFragments: [
        "'deleteProjectConfig fallback: re-read config is missing auth that cache has; refusing to write. See GH #3117.',",
      ],
    },
    39: {
      statementIndices: [7_533, 7_534, 7_535, 7_536],
      sourceFragments: [
        'return version !== null && version >= 1_092_000 && version < 1_105_000',
        'useAdaptiveDrain: !wheelFlood && xtermJs,',
        'base: readScrollSpeedBase(xtermJs, wheelFlood),',
      ],
    },
    44: {
      statementIndices: [7_940],
      sourceFragments: [
        "scope: HistoryScope = 'project',",
        "if (scope === 'project' && entry.project !== currentProject) continue",
        "if (scope === 'session' && entry.sessionId !== currentSession) continue",
      ],
    },
    48: {
      statementIndices: [8_409, 8_410],
      sourceFragments: [
        'return getAllPolicyTierSettings().some(',
        'const policyTiers = getAllPolicyTierSettings()',
        'const allowManagedDomainsOnly = policyTiers.some(',
        'for (const policySettings of policyTiers)',
      ],
    },
    49: {
      statementIndices: [8_547],
      sourceFragments: [
        'if (!/dimensions exceed max allowed size.*\\d+ pixels/.test(error.message)) {',
        '/messages\\.(\\d+)\\.content\\.(\\d+)\\.image/',
      ],
    },
    54: {
      statementIndices: [8_703, 8_705],
      sourceFragments: [
        'const BACKSLASH_WHITESPACE_RE =',
        'containsAnyPlaceholder(a[i + 1]!)',
        'deferredNewlineHash ??= {',
        'return deferredNewlineHash ?? { ok: true }',
      ],
    },
    64: {
      statementIndices: [11_268],
      sourceFragments: [
        'if (containsAnyPlaceholder(format)) return false',
        '!numericArgument.test(argument)',
      ],
    },
    69: {
      statementIndices: [11_951, 11_953, 11_954],
      sourceFragments: ['entry.expiresAt < Date.now()'],
    },
    71: {
      statementIndices: [12_001],
      sourceFragments: [
        '(hasMcpDiscoveryButNoToken(name, config, oauthEntries) ||\n        hasExpiredMcpAccessTokenWithoutRefresh(name, config, oauthEntries))',
      ],
    },
    80: {
      statementIndices: [12_631, 12_633, 12_635],
      sourceFragments: [
        'const CLASSIFIER_MAX_RETRIES = 2',
        'return await sideQuery({ ...options, signal })',
        'runClassifierRequest(stage1Opts, signal)',
        'runClassifierRequest(stage2Opts, signal)',
        'runClassifierRequest(sideQueryOpts, signal)',
      ],
    },
    81: {
      statementIndices: [13_016],
      sourceFragments: [
        'function createConcurrencyLimiter<Args extends unknown[], Result>(',
        'if (active < concurrency) {',
        'await new Promise<void>(resolve => queue.push(resolve))',
        'const runBatch = createConcurrencyLimiter(',
      ],
    },
    88: {
      statementIndices: [13_733, 13_734, 13_735],
      sourceFragments: [
        ': DEFAULT_BRIEF_ENFORCE_TEXT',
      ],
    },
    90: {
      statementIndices: [13_777],
      sourceFragments: [
        'if (current) onLatch?.(current)',
        'return { current, onLatch }',
      ],
    },
    92: {
      statementIndices: [13_796],
      sourceFragments: [
        '"REPL: unawaited Promise coerced to string. Shorthand results used " +',
      ],
    },
    94: {
      statementIndices: [13_880],
      sourceFragments: [
        'getAllowedChannels().length > 0 &&\n      getIsNonInteractiveSession()',
      ],
    },
    96: {
      statementIndices: [13_964],
      sourceFragments: [
        'getAllowedChannels().length > 0 &&\n      getIsNonInteractiveSession()',
      ],
    },
    115: {
      statementIndices: [14_953],
      sourceFragments: [
        '(oauthEntries ?? getMcpOAuthEntries())?.[serverKey]',
      ],
    },
    119: {
      statementIndices: [15_604, 15_607],
      sourceFragments: [
        "if (attachment.reminderType === 'once') {",
        '"The user has asked you to work without stopping for clarifying questions. When you\'d normally pause to check, make the reasonable call and continue; they\'ll redirect if needed.",',
      ],
    },
    120: {
      statementIndices: [15_638],
      sourceFragments: [
        "if (text !== undefined && text !== '' && text !== NO_CONTENT_MESSAGE) {",
      ],
    },
    121: {
      statementIndices: [15_650],
      sourceFragments: [
        "attachment.snippet === ''",
        'The diff was omitted because other modified files in this turn already exceeded the snippet budget; use the Read tool if you need the current content.',
      ],
    },
    122: {
      statementIndices: [15_824],
      sourceFragments: [
        'export function createFileIndexCache() {',
        'export const globalFileIndexCache = createFileIndexCache()',
        'export function resetFileIndexCache(cache: FileIndexCache): void {',
      ],
    },
    127: {
      statementIndices: [16_045],
      sourceFragments: [
        'for (const opt of getGatewayModelOptions()) {',
      ],
    },
    140: {
      statementIndices: [18_381, 18_383],
      sourceFragments: [
        'function setEffortValue(effortValue: EffortValue): EffortCommandResult {',
        'const remoteSuffix = applyRemoteEffort(persistable)',
        'const remoteSuffix = applyRemoteEffort(undefined)',
      ],
    },
    180: {
      statementIndices: [21_028],
      sourceFragments: ['return stripAnsi(value)'],
    },
    183: {
      statementIndices: [21_062],
      sourceFragments: ['lastPrStatuses = action.prStatuses'],
    },
    204: {
      statementIndices: [22_313],
      sourceFragments: [
        "getAuthSnapshot:\n          options.origin === 'service'\n            ? () => auth.getAuthSnapshot()\n            : undefined,",
      ],
    },
  }
  for (const [clusterIdText, expected] of Object.entries(hardenedBindings)) {
    const clusterId = Number(clusterIdText)
    const binding = bindingById.get(clusterId)
    assert.ok(binding, `C${clusterId}: hardened binding exists`)
    assert.deepEqual(
      [
        binding.targetWitness,
        ...(binding.additionalTargetWitnesses ?? []),
      ].map(witness => witness.statementIndex).sort((left, right) => left - right),
      expected.statementIndices,
      `C${clusterId}: exact active statement coverage`,
    )
    const sourceFragments = new Set(
      binding.sourceWitnesses.map(witness => witness.fragment),
    )
    assert.ok(
      expected.sourceFragments.every(fragment => sourceFragments.has(fragment)),
      `C${clusterId}: reviewed behavior source coverage`,
    )
  }
  const requiredActiveStatementByCluster = {
    30: 6_577,
    37: 6_960,
    45: 7_950,
    65: 11_287,
    75: 12_385,
    82: 13_030,
    83: 13_054,
    87: 13_472,
    125: 15_945,
    126: 16_018,
    127: 16_045,
    133: 17_446,
    135: 17_665,
    139: 18_068,
    140: 18_381,
    142: 18_456,
    150: 19_195,
    162: 19_637,
    166: 19_746,
    167: 19_756,
    170: 20_349,
    173: 20_480,
    182: 21_053,
    183: 21_062,
    195: 21_928,
    198: 22_170,
  }
  for (const [clusterIdText, statementIndex] of Object.entries(
    requiredActiveStatementByCluster,
  )) {
    const clusterId = Number(clusterIdText)
    const binding = bindingById.get(clusterId)
    const selectedIndices = [
      binding.targetWitness,
      ...(binding.additionalTargetWitnesses ?? []),
    ].map(witness => witness.statementIndex)
    assert.ok(
      selectedIndices.includes(statementIndex),
      `C${clusterId}: required active raw statement T${statementIndex}`,
    )
  }

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
  assert.equal(committedProof.length, 347_925)
  assert.equal(
    sha256(committedProof),
    '4104bbbd6c14f7703ac5fca78ff1a1ac30925aea53e70ed3f4c080434594e06b',
  )
  const parsedCommittedProof = JSON.parse(committedProof)
  assert.deepEqual(parsedCommittedProof.knownDelta, proof.knownDelta)
  assert.deepEqual(parsedCommittedProof.ledgers, proof.ledgers)
})
