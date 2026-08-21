#!/usr/bin/env node

import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

export const RELEASE_2_1_126 = Object.freeze({
  case: '2.1.124-to-2.1.126',
  release: '2.1.126',
  baseline: {
    bytes: 13_980_928,
    sha256: 'dc2b68c385a3064737343e51e6d7c690f9e03cc40fa89c4393708ae03094d590',
  },
  target: {
    bytes: 13_980_411,
    sha256: 'e9d40219be0cad9009c115ec637df4976e987c33d4b7a88cc5f047ead9ad828d',
  },
  normalizedTarget: {
    bytes: 13_980_411,
    sha256: '271bf76a599bc3743abf29769b21ed1ba99b646596f4296b6f3d78b83bd4c017',
  },
  targetTokens: 4_405_944,
  targetUnits: 22_358,
  totalClusters: 6,
})

const METADATA_REPLACEMENTS = Object.freeze([
  ['version', '2.1.124', '2.1.126', 163],
  ['buildTimestamp', '2026-04-30T00:25:36Z', '2026-04-30T16:01:00Z', 162],
  ['sourceRevision', '241621312a512bb8563f31eaa762903c15edaa07', 'e44c1d97bd39dbf2525164f3fd33be6edbf1661e', 162],
])

const ARTIFACTS = Object.freeze({
  rawLedger: 'structural/generated-delta.json.gz',
  metadataLedger: 'structural/metadata-normalized-delta.json.gz',
  exactLedger: 'structural/known-delta-ledger.json.gz',
  clusterLedger: 'structural/semantic-cluster-ledger.json.gz',
  proof: 'structural/known-delta-proof.json',
})

const EXPECTED_ARTIFACTS = Object.freeze({
  rawLedger: {
    bytes: 2_257_547,
    sha256: 'c5032b816690e1df5c30d1286278d674414671a6055ebf726b53b00f1073b88a',
  },
  metadataLedger: {
    bytes: 2_237_149,
    sha256: 'f7b4ace72ab4505a17b25310399bfacbff3ee07c6378440e6e1e2fdb2888458b',
  },
  exactLedger: {
    bytes: 2_234_299,
    sha256: '66e0052214d8a90a10058f383e09ab7d9480836eeed1d1d41973a83de55fc1c9',
  },
  clusterLedger: {
    bytes: 5_818,
    sha256: 'a4dd3dfcca8a075b20aa24d8c6dad3cfde8b4fa54bce0a3979469531bb2fa622',
  },
})

const BASE_REVISION = 'ae866640a6d67891fe14aeff5bc41da10784b979'
const OVERLAY_REVISION = '5b99258953100cc337aa42a047dc7d059657c6f8'
const RECOVERED_SOURCE_TREE = '5632342fec59adeeea18e0d0fc8ab4aff3d72893'

const ALL_CHANGED_SOURCE_PATHS = Object.freeze([
  'src/commands/effort/effort.tsx',
  'src/services/api/claude.ts',
  'src/services/api/client.ts',
  'src/tools/FileReadTool/FileReadTool.ts',
])

const RELEASE_BULLET_CLASSIFICATION = Object.freeze({
  total: 33,
  activeAdjacent: [10, 17, 18],
  baselineRetained: [
    1, 2, 3, 4, 5, 6, 7, 8, 9,
    11, 12, 13, 14, 15, 16,
    19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33,
  ],
  hiddenAdjacentRows: ['effort-settings-persistence'],
})

const CLUSTER_BINDING_SPECS = Object.freeze({
  1: {
    side: 'target',
    primaryStatementIndex: 6_249,
    additionalStatementIndices: [6_252],
    sourceWitnesses: [
      {
        path: 'src/services/api/client.ts',
        fragment: 'export function getStreamIdleTimeoutMs(): number {',
      },
      {
        path: 'src/services/api/client.ts',
        fragment: 'addStreamIdleTimeout(response.body, getStreamIdleTimeoutMs())',
      },
    ],
  },
  2: {
    side: 'baseline',
    primaryStatementIndex: 14_805,
    sourceWitnesses: [],
    sourceAbsences: [
      {
        path: 'src/tools/FileReadTool/FileReadTool.ts',
        fragment: 'function shouldIncludeFileReadMitigation(model: string): boolean {',
      },
      {
        path: 'src/tools/FileReadTool/FileReadTool.ts',
        fragment: "const MITIGATION_EXEMPT_MODELS = new Set(['claude-opus-4-6'])",
      },
    ],
  },
  3: {
    side: 'target',
    primaryStatementIndex: 14_812,
    additionalStatementIndices: [14_809, 14_811],
    sourceWitnesses: [
      {
        path: 'src/tools/FileReadTool/FileReadTool.ts',
        fragment: 'memoryFileFreshnessPrefix(data) + formatFileLines(data.file)',
      },
    ],
    sourceAbsences: [
      {
        path: 'src/tools/FileReadTool/FileReadTool.ts',
        fragment: 'export const CYBER_RISK_MITIGATION_REMINDER =',
      },
      {
        path: 'src/tools/FileReadTool/FileReadTool.ts',
        fragment: 'const fileReadModels = new WeakMap<object, string>()',
      },
      {
        path: 'src/tools/FileReadTool/FileReadTool.ts',
        fragment: 'fileReadModels.set(data, context.options.mainLoopModel)',
      },
    ],
  },
  4: {
    side: 'target',
    primaryStatementIndex: 18_381,
    additionalStatementIndices: [18_383],
    sourceWitnesses: [
      {
        path: 'src/commands/effort/effort.tsx',
        fragment: "updateSettingsForSource('userSettings', {",
      },
      {
        path: 'src/commands/effort/effort.tsx',
        fragment: 'Failed to set effort level:',
      },
    ],
  },
  6: {
    side: 'target',
    primaryStatementIndex: 19_637,
    sourceWitnesses: [
      {
        path: 'src/services/api/claude.ts',
        fragment: 'const STREAM_IDLE_TIMEOUT_MS = getStreamIdleTimeoutMs()',
      },
    ],
  },
})

const DIRECT_ROW_SPECS = Object.freeze([
  {
    rowId: 'stream-idle-timeout',
    title: 'Shared five-minute stream idle timeout floor',
    clusterIds: [1, 6],
    releaseBullets: [17, 18],
    targetWitnesses: [{
      kind: 'literal',
      value: 'Number(process.env.CLAUDE_STREAM_IDLE_TIMEOUT_MS)||0',
      count: 1,
    }],
    testIds: ['active-semantics', 'semantic-delta'],
  },
  {
    rowId: 'file-read-malware-reminder-removal',
    title: 'FileRead malware reminder and model side channel removal',
    clusterIds: [2, 3],
    releaseBullets: [10],
    targetWitnesses: [{
      kind: 'literal',
      value: 'Whenever you read a file, you should consider whether it would be considered malware.',
      count: 0,
    }],
    testIds: ['active-semantics', 'semantic-delta'],
  },
  {
    rowId: 'effort-settings-persistence',
    title: 'Effort changes persist to user settings before local side effects',
    clusterIds: [4],
    releaseBullets: [],
    targetWitnesses: [{
      kind: 'literal',
      value: 'Failed to set effort level: ',
      count: 2,
    }],
    testIds: ['active-semantics', 'semantic-delta'],
  },
])

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function evidence(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
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

function authenticate(filename, expected, label) {
  const bytes = fs.readFileSync(filename)
  assert(
    JSON.stringify(evidence(bytes)) === JSON.stringify(expected),
    `${label} identity`,
  )
  return { bytes, source: bytes.toString('utf8') }
}

export function normalizeRelease21126Metadata({ baseline, target }) {
  const replacementsByTarget = new Map(
    METADATA_REPLACEMENTS.map(([field, baselineValue, targetValue, rawCount]) => [
      targetValue,
      { field, baselineValue, targetValue, rawCount },
    ]),
  )
  const ast = parse(target, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const counts = new Map()
  const edits = []
  const stack = [ast]
  while (stack.length > 0) {
    const node = stack.pop()
    if (!node || typeof node !== 'object') continue
    if (node.type === 'Literal' && replacementsByTarget.has(node.value)) {
      const replacement = replacementsByTarget.get(node.value)
      assert(
        node.raw === JSON.stringify(replacement.targetValue),
        `${replacement.field} encoding`,
      )
      edits.push({
        start: node.start,
        end: node.end,
        text: JSON.stringify(replacement.baselineValue),
      })
      counts.set(replacement.field, (counts.get(replacement.field) ?? 0) + 1)
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) if (child?.type) stack.push(child)
      } else if (value?.type) stack.push(value)
    }
  }
  edits.sort((left, right) => right.start - left.start)
  let normalized = target
  for (const edit of edits) {
    normalized =
      normalized.slice(0, edit.start) + edit.text + normalized.slice(edit.end)
  }
  assert(occurrences(normalized, '2.1.126') === 1, 'version banner count')
  normalized = normalized.replace('2.1.126', '2.1.124')

  const replacements = METADATA_REPLACEMENTS.map(
    ([field, baselineValue, targetValue, rawCount]) => {
      assert(counts.get(field) === 162, `${field} AST count`)
      assert(
        occurrences(baseline, baselineValue) === rawCount,
        `${field} baseline raw count`,
      )
      assert(
        occurrences(target, targetValue) === rawCount,
        `${field} target raw count`,
      )
      return {
        field,
        count: 162,
        rawCount,
        baseline: { value: baselineValue, sha256: sha256(baselineValue) },
        target: { value: targetValue, sha256: sha256(targetValue) },
      }
    },
  )
  assert(
    JSON.stringify(evidence(normalized)) ===
      JSON.stringify(RELEASE_2_1_126.normalizedTarget),
    `normalized target identity: ${JSON.stringify(evidence(normalized))}`,
  )
  return { normalized, replacements }
}

function git(sourceRoot, args) {
  return execFileSync('git', args, {
    cwd: sourceRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  }).trim()
}

function authenticateSourceTree(sourceRoot) {
  const dirtySource = git(sourceRoot, [
    'status', '--porcelain', '--untracked-files=all', '--', 'src',
  ])
  assert(dirtySource === '', 'recovered src worktree must be clean')
  assert(
    git(sourceRoot, ['rev-parse', 'HEAD:src']) === RECOVERED_SOURCE_TREE,
    'recovered src tree identity',
  )
  assert(
    git(sourceRoot, ['rev-parse', `${OVERLAY_REVISION}:src`]) ===
      RECOVERED_SOURCE_TREE,
    'frozen overlay src tree identity',
  )
  const changedPaths = git(sourceRoot, [
    'diff', '--name-only', '--no-renames', `${BASE_REVISION}..HEAD`, '--', 'src',
  ]).split('\n').filter(Boolean).sort()
  assert(
    JSON.stringify(changedPaths) ===
      JSON.stringify([...ALL_CHANGED_SOURCE_PATHS].sort()),
    'recovered source topology differs from the frozen four-path inventory',
  )
  return changedPaths
}

function baseSource(sourceRoot, sourcePath) {
  return execFileSync('git', ['show', `${BASE_REVISION}:${sourcePath}`], {
    cwd: sourceRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
}

function sourceWitness(sourceRoot, clusterId, spec) {
  const current = fs.readFileSync(path.join(sourceRoot, spec.path), 'utf8')
  const previous = baseSource(sourceRoot, spec.path)
  const count = occurrences(current, spec.fragment)
  assert(count > 0, `C${clusterId} ${spec.path}: source witness changed`)
  assert(
    occurrences(previous, spec.fragment) !== count,
    `C${clusterId} ${spec.path}: source witness is not adjacent-changing`,
  )
  return {
    path: spec.path,
    fragment: spec.fragment,
    count,
    matchedSemanticTerms: [],
    reviewed: true,
  }
}

function sourceAbsence(sourceRoot, clusterId, spec) {
  const current = fs.readFileSync(path.join(sourceRoot, spec.path), 'utf8')
  const previous = baseSource(sourceRoot, spec.path)
  assert(
    !current.includes(spec.fragment),
    `C${clusterId} ${spec.path}: removed source fragment is still present`,
  )
  assert(
    previous.includes(spec.fragment),
    `C${clusterId} ${spec.path}: removed source fragment is absent from base`,
  )
  return { path: spec.path, fragment: spec.fragment }
}

function statementWitness({ cluster, spec, statementIndex, baseline, target }) {
  const side = spec.side
  const sideSource = side === 'target' ? target : baseline
  const otherSource = side === 'target' ? baseline : target
  const statement = cluster[`${side}Statements`].find(
    row => row.index === statementIndex,
  )
  assert(statement, `C${cluster.id}: ${side} statement ${statementIndex} absent`)
  const text = sideSource.slice(statement.raw.start, statement.raw.end)
  const raw = evidence(text)
  assert(
    JSON.stringify(raw) ===
      JSON.stringify({ bytes: statement.raw.bytes, sha256: statement.raw.sha256 }),
    `C${cluster.id}: ${side} statement ${statementIndex} raw identity`,
  )
  const count = occurrences(sideSource, text)
  const otherSideCount = occurrences(otherSource, text)
  assert(
    count !== otherSideCount,
    `C${cluster.id}: ${side} statement ${statementIndex} is not count-changing`,
  )
  return {
    kind: 'raw-statement',
    side,
    statementIndex,
    start: statement.raw.start,
    end: statement.raw.end,
    bytes: raw.bytes,
    sha256: raw.sha256,
    normalizedSha256: statement.normalized.sha256,
    count,
    otherSideCount,
  }
}

export function release21126ClusterInventory({
  baseline,
  target,
  clusterLedger,
  sourceRoot,
}) {
  assert(typeof baseline === 'string' && typeof target === 'string',
    'cluster inventory requires authenticated adjacent bundles')
  assert(
    clusterLedger?.kind === '2.1.126-binding-aware-semantic-cluster-ledger',
    'cluster ledger kind',
  )
  assert(
    clusterLedger.coverage?.clusterCount === RELEASE_2_1_126.totalClusters,
    'cluster inventory requires the authenticated six-cluster ledger',
  )
  assert(clusterLedger.statementCounts?.baseline === RELEASE_2_1_126.targetUnits,
    'cluster baseline statement count')
  assert(clusterLedger.statementCounts?.target === RELEASE_2_1_126.targetUnits,
    'cluster target statement count')
  assert(sourceRoot, 'cluster inventory requires a recovered source root')
  authenticateSourceTree(sourceRoot)

  const clusters = clusterLedger.clusters
  const clusterById = new Map(clusters.map(cluster => [cluster.id, cluster]))
  assert(clusterById.size === RELEASE_2_1_126.totalClusters,
    'cluster IDs must be unique')
  for (let id = 1; id <= RELEASE_2_1_126.totalClusters; id += 1) {
    const cluster = clusterById.get(id)
    assert(cluster, `cluster C${id} absent`)
    assert(Array.isArray(cluster.inventory?.allIdentifierDelta),
      `C${id}: all-identifier audit absent`)
    for (const key of [
      'literalDelta', 'nodeTypeDelta', 'operatorDelta', 'semanticPropertyDelta',
    ]) assert(Array.isArray(cluster.inventory[key]), `C${id}: ${key} absent`)
  }

  const direct = DIRECT_ROW_SPECS.map(row => {
    const clusterBindings = row.clusterIds.map(clusterId => {
      const cluster = clusterById.get(clusterId)
      const spec = CLUSTER_BINDING_SPECS[clusterId]
      assert(spec, `C${clusterId}: direct binding spec absent`)
      const targetWitness = statementWitness({
        cluster,
        spec,
        statementIndex: spec.primaryStatementIndex,
        baseline,
        target,
      })
      const additionalTargetWitnesses = (
        spec.additionalStatementIndices ?? []
      ).map(statementIndex => statementWitness({
        cluster,
        spec,
        statementIndex,
        baseline,
        target,
      }))
      const sourceWitnesses = spec.sourceWitnesses.map(source =>
        sourceWitness(sourceRoot, clusterId, source))
      const sourceAbsences = (spec.sourceAbsences ?? []).map(absence =>
        sourceAbsence(sourceRoot, clusterId, absence))
      assert(sourceWitnesses.length > 0 || sourceAbsences.length > 0,
        `C${clusterId}: direct source evidence absent`)
      return {
        clusterId,
        targetWitness,
        ...(additionalTargetWitnesses.length > 0
          ? { additionalTargetWitnesses }
          : {}),
        sourceWitnesses,
        ...(sourceAbsences.length > 0 ? { sourceAbsences } : {}),
        testIds: [...row.testIds].sort(),
      }
    })
    const sourcePaths = [...new Set(clusterBindings.flatMap(binding => [
      ...binding.sourceWitnesses.map(witness => witness.path),
      ...(binding.sourceAbsences ?? []).map(absence => absence.path),
    ]))].sort()
    const sourcePathAbsences = clusterBindings
      .flatMap(binding => binding.sourceAbsences ?? [])
      .map(absence => ({ paths: [absence.path], fragment: absence.fragment }))
      .sort((left, right) =>
        left.paths[0].localeCompare(right.paths[0]) ||
        left.fragment.localeCompare(right.fragment))
    return {
      clusterIds: [...row.clusterIds].sort((left, right) => left - right),
      rowId: row.rowId,
      title: row.title,
      releaseBullets: [...row.releaseBullets],
      sourcePaths,
      targetWitnesses: row.targetWitnesses.map(witness => ({ ...witness })),
      testIds: [...row.testIds].sort(),
      clusterBindings,
      ...(sourcePathAbsences.length > 0 ? { sourcePathAbsences } : {}),
    }
  })

  const c5 = clusterById.get(5)
  const accountingOnly = [{
    clusterIds: [5],
    reason: 'initializer-linkage',
    evidence: {
      classification: 'settings module initializer linkage paired with active effort persistence',
      pairedDirectClusterIds: [4],
      clusterRationales: {
        5: 'The added settings initializer call links the import used by C4; it has no independent literal, property, or operator semantic delta.',
      },
      statementPair: {
        baseline: c5.baselineStatements[0],
        target: c5.targetStatements[0],
      },
    },
  }]
  assert(c5.inventory.literalDelta.length === 0, 'C5 literal residue')
  assert(c5.inventory.operatorDelta.length === 0, 'C5 operator residue')
  assert(c5.inventory.semanticPropertyDelta.length === 0,
    'C5 semantic-property residue')

  const supportBindings = []
  const directSourcePaths = [...new Set(direct.flatMap(row => row.sourcePaths))]
    .sort()
  assert(
    JSON.stringify(directSourcePaths) ===
      JSON.stringify([...ALL_CHANGED_SOURCE_PATHS].sort()),
    'direct owners must close the four changed source paths',
  )
  const ids = [...direct, ...accountingOnly]
    .flatMap(row => row.clusterIds)
    .sort((left, right) => left - right)
  assert(new Set(ids).size === ids.length, 'cluster partition duplicates')
  assert(
    ids.length === RELEASE_2_1_126.totalClusters &&
      ids.every((id, index) => id === index + 1),
    'cluster partition must be exactly 1..6',
  )
  return {
    schemaVersion: 1,
    totalClusters: RELEASE_2_1_126.totalClusters,
    direct,
    accountingOnly,
    supportBindings,
  }
}

function ledgerSummary(report) {
  return {
    baseline: report.baseline,
    target: report.target,
    globalBindingPairCount: report.globalBindingEvidence.pairCount,
    pairCount: report.pairCount,
    coverage: report.coverage,
    unmatchedBaselineCount: report.unmatchedBaseline.length,
    unresolvedTargetCount: report.unresolvedTarget.length,
    changedTargetIndices: report.regions
      .filter(row => row.classification === 'changed')
      .map(row => row.target.index),
    unresolvedTargetIndices: report.unresolvedTarget.map(row => row.target.index),
  }
}

function readLedger(filename, expected, label) {
  const bytes = fs.readFileSync(filename)
  assert(
    JSON.stringify(evidence(bytes)) === JSON.stringify(expected),
    `${label} artifact identity`,
  )
  return { bytes, report: JSON.parse(gunzipSync(bytes).toString('utf8')) }
}

export function rebuildRelease21126Core({
  baselinePath,
  targetPath,
  rawLedgerPath,
  metadataLedgerPath,
  exactLedgerPath,
  clusterLedgerPath,
  sourceRoot,
}) {
  const baseline = authenticate(
    path.resolve(baselinePath), RELEASE_2_1_126.baseline, '2.1.124 baseline',
  )
  const target = authenticate(
    path.resolve(targetPath), RELEASE_2_1_126.target, '2.1.126 target',
  )
  const normalization = normalizeRelease21126Metadata({
    baseline: baseline.source,
    target: target.source,
  })
  const raw = readLedger(rawLedgerPath, EXPECTED_ARTIFACTS.rawLedger, 'raw ledger')
  const metadata = readLedger(
    metadataLedgerPath, EXPECTED_ARTIFACTS.metadataLedger, 'metadata ledger',
  )
  const exact = readLedger(
    exactLedgerPath, EXPECTED_ARTIFACTS.exactLedger, 'exact ledger',
  )
  const cluster = readLedger(
    clusterLedgerPath, EXPECTED_ARTIFACTS.clusterLedger, 'cluster ledger',
  )

  assert(
    raw.report.baseline.sha256 === RELEASE_2_1_126.baseline.sha256 &&
      raw.report.target.sha256 === RELEASE_2_1_126.target.sha256,
    'raw adjacent ledger inputs',
  )
  assert(
    metadata.report.baseline.sha256 === RELEASE_2_1_126.baseline.sha256 &&
      metadata.report.target.sha256 === RELEASE_2_1_126.normalizedTarget.sha256,
    'metadata ledger inputs',
  )
  assert(
    exact.report.baseline.sha256 === RELEASE_2_1_126.normalizedTarget.sha256 &&
      exact.report.target.sha256 === RELEASE_2_1_126.normalizedTarget.sha256,
    'exact ledger inputs',
  )
  assert(
    exact.report.coverage.tokens.matched === RELEASE_2_1_126.targetTokens &&
      exact.report.coverage.units.matched === RELEASE_2_1_126.targetUnits,
    'exact ledger cardinality',
  )
  assert(
    ['changed', 'moved', 'unresolved'].every(key =>
      exact.report.coverage.tokens[key] === 0 &&
      exact.report.coverage.units[key] === 0),
    'exact ledger residue',
  )
  assert(
    exact.report.unmatchedBaseline.length === 0 &&
      exact.report.unresolvedTarget.length === 0,
    'exact ledger unmatched residue',
  )
  assert(
    cluster.report.inputs.baseline.sha256 === RELEASE_2_1_126.baseline.sha256 &&
      cluster.report.inputs.targetMetadataNormalized.sha256 ===
        RELEASE_2_1_126.normalizedTarget.sha256,
    'cluster ledger inputs',
  )

  const inventory = release21126ClusterInventory({
    baseline: baseline.source,
    target: target.source,
    clusterLedger: cluster.report,
    sourceRoot: path.resolve(sourceRoot),
  })
  for (const row of inventory.direct) {
    for (const item of row.targetWitnesses) {
      assert(
        occurrences(target.source, item.value) === item.count,
        `${row.rowId} target witness count`,
      )
      assert(
        occurrences(baseline.source, item.value) !== item.count,
        `${row.rowId} witness must differ in baseline`,
      )
    }
  }

  const proof = {
    schemaVersion: 1,
    kind: 'release-2.1.126-known-semantic-delta-proof',
    case: RELEASE_2_1_126.case,
    release: RELEASE_2_1_126.release,
    complete: true,
    claim: 'Authenticated adjacent inner bundles are exhaustively partitioned into six post-metadata, binding-aware semantic clusters. Five active clusters bind every changed raw statement, exact reviewed source owners or removals, and focused tests; the remaining settings initializer cluster is explicitly accounting-only. The frozen four-path source tree closes without support bindings, all identifiers/properties/operators/literals are audited, and the exact normalized ledger has zero semantic residue.',
    authenticatedInputs: {
      baseline: RELEASE_2_1_126.baseline,
      target: RELEASE_2_1_126.target,
    },
    metadataNormalization: {
      replacementCardinalityPerValue: 162,
      replacements: normalization.replacements,
      normalizedTarget: RELEASE_2_1_126.normalizedTarget,
    },
    knownDelta: {
      changedSourcePaths: {
        baseRevision: BASE_REVISION,
        overlayRevision: OVERLAY_REVISION,
        recoveredSourceTree: RECOVERED_SOURCE_TREE,
        count: ALL_CHANGED_SOURCE_PATHS.length,
        paths: [...ALL_CHANGED_SOURCE_PATHS].sort(),
      },
      releaseBulletClassification: {
        total: RELEASE_BULLET_CLASSIFICATION.total,
        activeAdjacent: [...RELEASE_BULLET_CLASSIFICATION.activeAdjacent],
        baselineRetained: [...RELEASE_BULLET_CLASSIFICATION.baselineRetained],
        hiddenAdjacentRows: [
          ...RELEASE_BULLET_CLASSIFICATION.hiddenAdjacentRows,
        ],
      },
      clusterInventory: inventory,
    },
    ledgers: {
      rawAdjacent: ledgerSummary(raw.report),
      metadataNormalized: ledgerSummary(metadata.report),
      knownDeltaExact: ledgerSummary(exact.report),
    },
  }
  return {
    proof,
    ledgers: {
      raw: raw.bytes,
      metadata: metadata.bytes,
      exact: exact.bytes,
      cluster: cluster.bytes,
    },
  }
}

function writeArtifact(root, relative, value) {
  const filename = path.join(root, relative)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, value)
  return { path: relative, ...evidence(value) }
}

export function buildRelease21126SemanticDelta(options) {
  const result = rebuildRelease21126Core(options)
  const root = path.resolve(options.outputRoot)
  const artifacts = {
    rawLedger: writeArtifact(root, ARTIFACTS.rawLedger, result.ledgers.raw),
    metadataLedger: writeArtifact(
      root, ARTIFACTS.metadataLedger, result.ledgers.metadata,
    ),
    exactLedger: writeArtifact(root, ARTIFACTS.exactLedger, result.ledgers.exact),
    clusterLedger: writeArtifact(
      root, ARTIFACTS.clusterLedger, result.ledgers.cluster,
    ),
  }
  const proof = { ...result.proof, artifacts }
  const proofBytes = Buffer.from(`${JSON.stringify(proof, null, 2)}\n`)
  const proofEvidence = writeArtifact(root, ARTIFACTS.proof, proofBytes)
  return { proof, proofEvidence }
}

export const release21126SemanticDeltaInternals = Object.freeze({
  artifacts: ARTIFACTS,
  expectedArtifacts: EXPECTED_ARTIFACTS,
  baseRevision: BASE_REVISION,
  overlayRevision: OVERLAY_REVISION,
  recoveredSourceTree: RECOVERED_SOURCE_TREE,
  releaseBulletClassification: RELEASE_BULLET_CLASSIFICATION,
})

function parseArguments(argv) {
  const result = {}
  const allowed = new Set([
    'baseline', 'target', 'raw-ledger', 'metadata-ledger', 'exact-ledger',
    'cluster-ledger', 'source-root', 'output',
  ])
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, '')
    const value = argv[index + 1]
    assert(allowed.has(key) && value, `invalid argument: ${argv[index] ?? ''}`)
    result[key] = value
  }
  return result
}

function main() {
  const args = parseArguments(process.argv.slice(2))
  const required = [
    'baseline', 'target', 'raw-ledger', 'metadata-ledger', 'exact-ledger',
    'cluster-ledger', 'source-root', 'output',
  ]
  assert(
    required.every(key => args[key]),
    `Usage: build-2.1.126-semantic-delta.mjs ${required
      .map(key => `--${key} PATH`).join(' ')}`,
  )
  const result = buildRelease21126SemanticDelta({
    baselinePath: args.baseline,
    targetPath: args.target,
    rawLedgerPath: args['raw-ledger'],
    metadataLedgerPath: args['metadata-ledger'],
    exactLedgerPath: args['exact-ledger'],
    clusterLedgerPath: args['cluster-ledger'],
    sourceRoot: args['source-root'],
    outputRoot: args.output,
  })
  console.log(JSON.stringify({
    status: '2.1.126-semantic-delta-built',
    proof: result.proofEvidence,
    exact: result.proof.ledgers.knownDeltaExact.coverage,
  }, null, 2))
}

const invokedAsScript =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (invokedAsScript) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error))
    process.exitCode = 1
  }
}
