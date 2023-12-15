import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import * as ownerProofModule from '../cases/2.1.120-to-2.1.121/recovered/fork-spawned-by-skill-owner-overrides.mjs'

const {
  TARGET121_FORK_SPAWNED_BY_SKILL_EVIDENCE_IDS,
  TARGET121_FORK_SPAWNED_BY_SKILL_OWNER_OVERRIDES,
} = ownerProofModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-fork-spawned-by-skill-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '7fe68a2502d0f971e467ec6bc90a1d1e7724f824279060423adf5a271beb6a2a'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function expectedDescriptor(expected) {
  return { bytes: expected.bytes, sha256: expected.sha256 }
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), expectedDescriptor(expected), label)
  return bytes
}

function matchExactSnapshot(actual, snapshots, label) {
  const matches = Object.entries(snapshots).filter(([, expected]) =>
    Object.entries(expectedDescriptor(expected)).every(
      ([key, value]) => actual[key] === value,
    ),
  )
  assert.equal(
    matches.length,
    1,
    `${label}: unsupported exact snapshot ${actual.bytes}/${actual.sha256}`,
  )
  const [state, expected] = matches[0]
  return { expected, state }
}

function readExactSnapshot(filename, snapshots, label = filename) {
  const bytes = fs.readFileSync(filename)
  return {
    bytes,
    ...matchExactSnapshot(descriptor(bytes), snapshots, label),
  }
}

function commonSnapshotPath(snapshots) {
  const paths = [...new Set(Object.values(snapshots).map(row => row.path))]
  assert.equal(paths.length, 1, 'evolution snapshots must share one path')
  return path.join(repositoryRoot, paths[0])
}

function projectedState(states, state, label) {
  const value = states[state]
  assert.ok(value, `${label} state ${state}`)
  if (!value.projection) return value
  const projected = states[value.projection]
  assert.ok(projected, `${label} projection ${value.projection}`)
  assert.equal(projected.projection, undefined, `${label} projection must be direct`)
  return projected
}

function assertCompatibleEvolutionPair(reportState, coverageState) {
  const acceptedCoverageStates =
    fixture.inputs.evolutionCompatibility[reportState] ?? []
  assert.equal(
    acceptedCoverageStates.includes(coverageState),
    true,
    `unsupported report/coverage hybrid ${reportState}/${coverageState}`,
  )
}

function exactBufferSlice(bytes, expected, label) {
  const value = bytes.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(value), expectedDescriptor(expected), label)
  if (expected.exact !== undefined) {
    assert.equal(value.toString('utf8'), expected.exact, label)
  }
  return value.toString('utf8')
}

function artifactPath(environmentName, expected) {
  return path.resolve(
    process.env[environmentName] ?? path.join(repositoryRoot, expected.path),
  )
}

function canonicalDigest(rows) {
  return descriptor(Buffer.from(JSON.stringify(rows)))
}

function countOccurrences(source, needle) {
  let count = 0
  let offset = 0
  while (true) {
    const next = source.indexOf(needle, offset)
    if (next < 0) return count
    count += 1
    offset = next + needle.length
  }
}

function walk(node, visit, currentPath = []) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach((child, index) => walk(child, visit, [...currentPath, index]))
    return
  }
  if (typeof node.type === 'string') visit(node, currentPath)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start'].includes(key)) {
      walk(child, visit, [...currentPath, key])
    }
  }
}

function canonicalize(value, parent = null, key = null) {
  if (Array.isArray(value)) {
    return value.map((child, index) => canonicalize(child, parent, index))
  }
  if (value === null || typeof value !== 'object') return value
  const result = {}
  for (const [childKey, child] of Object.entries(value)) {
    if (['end', 'loc', 'range', 'raw', 'start'].includes(childKey)) continue
    if (value.type === 'Identifier' && childKey === 'name') {
      const preserve =
        (parent?.type === 'MemberExpression' &&
          key === 'property' &&
          !parent.computed) ||
        (parent?.type === 'Property' &&
          key === 'key' &&
          !parent.computed &&
          !parent.shorthand) ||
        (parent?.type === 'MethodDefinition' &&
          key === 'key' &&
          !parent.computed)
      result[childKey] = preserve ? child : '@id'
    } else {
      result[childKey] = canonicalize(child, value, childKey)
    }
  }
  return result
}

function canonicalDescriptor(node) {
  return descriptor(Buffer.from(JSON.stringify(canonicalize(node))))
}

function normalizedToken(token) {
  return [
    token.type.label,
    token.type.label === 'name' ? '@id' : (token.value ?? null),
  ]
}

function parseUnit(bundle, expected, label) {
  const source = exactBufferSlice(bundle, expected, label)
  const program = parse(source, { ecmaVersion: 'latest' })
  assert.equal(program.body.length, 1, `${label}: one top-level unit`)
  const node = program.body[0]
  assert.equal(node.type, expected.nodeType)
  assert.equal(node.async, expected.async)
  assert.equal(node.body.body.length, expected.bodyStatementCount)
  const tokens = [...tokenizer(source, { ecmaVersion: 'latest' })]
  assert.equal(tokens.length, expected.tokenCount)
  return { node, source, tokens, unitStart: expected.start }
}

function runAgentParameterObject(unit) {
  const candidates = []
  walk(unit, node => {
    if (node.type !== 'ObjectExpression') return
    const names = new Set(
      node.properties
        .filter(property => property.type === 'Property')
        .map(property => property.key?.name),
    )
    if (
      names.has('onQueryProgress') &&
      names.has('querySource') &&
      names.has('availableTools') &&
      names.has('forkContextMessages')
    ) {
      candidates.push(node)
    }
  })
  assert.equal(candidates.length, 1, 'one fork runAgent parameter object')
  return candidates[0]
}

function exactNodeSlice(parsed, node, expected, label) {
  assert.equal(node.type, expected.nodeType)
  assert.equal(parsed.unitStart + node.start, expected.start)
  assert.equal(parsed.unitStart + node.end, expected.end)
  const raw = parsed.source.slice(node.start, node.end)
  assert.deepEqual(descriptor(raw), expectedDescriptor(expected), label)
  if (expected.exact !== undefined) assert.equal(raw, expected.exact, label)
  return raw
}

function typescript() {
  return require(
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  )
}

function baselineSourceRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_120_SOURCE_ROOT ??
      path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.120/src'),
  )
}

function targetSourceRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_121_SOURCE_ROOT ??
      path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.121/src'),
  )
}

function baselineRepositoryRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_120_REPOSITORY_ROOT ??
      path.dirname(baselineSourceRoot()),
  )
}

function targetRepositoryRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_121_REPOSITORY_ROOT ??
      path.dirname(targetSourceRoot()),
  )
}

function freshPackageSourceRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_121_FRESH_PACKAGE_SOURCE_ROOT ??
      fixture.sourceState.freshPackage.defaultSourceRoot,
  )
}

function sourceFilename(root, sourcePath) {
  assert.ok(sourcePath.startsWith('src/'))
  return path.join(root, sourcePath.slice(4))
}

function nodeDescriptor(sourceFile, source, node, expected, extra = {}) {
  const start = node.getStart(sourceFile)
  const end = node.end
  const text = source.slice(start, end)
  assert.deepEqual(
    {
      ...extra,
      start,
      end,
      chars: text.length,
      ...descriptor(text),
      line: sourceFile.getLineAndCharacterOfPosition(start).line + 1,
      endLine: sourceFile.getLineAndCharacterOfPosition(end).line + 1,
    },
    expected,
  )
  return text
}

function forkSourceEvidence(ts, root, expected) {
  const filename = sourceFilename(root, fixture.sourceState.path)
  const bytes = readExact(filename, expected, filename)
  const source = bytes.toString('utf8')
  assert.equal(source.length, expected.chars)
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  const declaration = sourceFile.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === fixture.sourceState.declarationName,
  )
  assert.ok(declaration)
  const declarationText = nodeDescriptor(
    sourceFile,
    source,
    declaration,
    expected.declaration,
    { name: declaration.name.text },
  )
  for (const [marker, count] of Object.entries(
    fixture.sourceState.declarationMarkerCounts,
  )) {
    assert.equal(countOccurrences(declarationText, marker), count, marker)
  }
  return { declarationText, source }
}

function toolSourceEvidence(ts, root) {
  const expected = fixture.sourceState.toolUseContext
  const filename = sourceFilename(root, expected.path)
  const bytes = readExact(filename, expected, filename)
  const source = bytes.toString('utf8')
  assert.equal(source.length, expected.chars)
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  const declaration = sourceFile.statements.find(
    statement =>
      ts.isTypeAliasDeclaration(statement) &&
      statement.name.text === expected.declaration.name,
  )
  assert.ok(declaration)
  nodeDescriptor(sourceFile, source, declaration, expected.declaration, {
    name: declaration.name.text,
  })
  const optionsMember = declaration.type.members.find(
    member => member.name?.getText(sourceFile) === 'options',
  )
  assert.ok(optionsMember?.type && ts.isTypeLiteralNode(optionsMember.type))
  nodeDescriptor(
    sourceFile,
    source,
    optionsMember.type,
    Object.fromEntries(
      Object.entries(expected.optionsType).filter(
        ([key]) => !['memberCount', 'memberNames'].includes(key),
      ),
    ),
  )
  const names = optionsMember.type.members
    .map(member => member.name?.getText(sourceFile))
    .filter(Boolean)
  assert.equal(names.length, expected.optionsType.memberCount)
  assert.deepEqual(
    canonicalDigest(names),
    expected.optionsType.memberNames,
  )
  for (const [marker, count] of Object.entries(expected.markerCounts)) {
    assert.equal(countOccurrences(source, marker), count, marker)
    assert.equal(names.includes(marker), false, marker)
  }
  return source
}

function generatedOwnerSourceEvidence(ts, root) {
  const expected = fixture.sourceState.generatedOwnerSource
  const filename = sourceFilename(root, expected.path)
  const bytes = readExact(filename, expected, filename)
  const source = bytes.toString('utf8')
  assert.equal(source.length, expected.chars)
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  for (const [marker, count] of Object.entries(expected.markerCounts)) {
    assert.equal(countOccurrences(source, marker), count, marker)
  }
  return source
}

function sourceRootMarkerCounts(root) {
  const markers = Object.fromEntries(
    Object.keys(fixture.sourceState.sourceRootMarkerCounts).map(marker => [
      marker,
      0,
    ]),
  )
  const pending = [root]
  while (pending.length > 0) {
    const directory = pending.pop()
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) pending.push(filename)
      else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
        const source = fs.readFileSync(filename, 'utf8')
        for (const marker of Object.keys(markers)) {
          markers[marker] += countOccurrences(source, marker)
        }
      }
    }
  }
  return markers
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

test(
  'Target121 fork skill-provenance fixture and owner override are exact',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(
      fixture.status,
      'case-owned-static-owner-proof-source-replay-blocked',
    )
    assert.deepEqual(
      TARGET121_FORK_SPAWNED_BY_SKILL_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET121_FORK_SPAWNED_BY_SKILL_OWNER_OVERRIDES,
      [
        {
          key: `${caseName}:18932`,
          targetIndex: 18932,
          paths: [fixture.ownerResidues.correctedOwner],
          declarations: [fixture.ownerResidues.declaration],
          evidenceIds: fixture.evidenceIds,
          behavior:
            TARGET121_FORK_SPAWNED_BY_SKILL_OWNER_OVERRIDES[0].behavior,
        },
      ],
    )
    assert.equal(
      Object.isFrozen(TARGET121_FORK_SPAWNED_BY_SKILL_OWNER_OVERRIDES),
      true,
    )
    const reportStates = [
      'preCorrection',
      'postCorrection',
      'postFocusedBatch',
      'postDaemonOwner',
    ]
    const coverageStates = [
      'preCorrection',
      'postCorrection',
      'postU20775',
      'postFocusedBatch',
      'postDaemonOwner',
    ]
    assert.deepEqual(
      Object.keys(fixture.inputs.typedReportSnapshots),
      reportStates,
    )
    assert.deepEqual(
      Object.keys(fixture.inputs.sourceCoverageSnapshots),
      coverageStates,
    )
    assert.deepEqual(Object.keys(fixture.ownerResidues.states), reportStates)
    assert.deepEqual(
      Object.keys(fixture.sourceCoverageClaim.states),
      coverageStates,
    )
    for (const snapshots of [
      fixture.inputs.typedReportSnapshots,
      fixture.inputs.sourceCoverageSnapshots,
    ]) {
      assert.equal(
        new Set(
          Object.values(snapshots).map(
            snapshot => `${snapshot.bytes}/${snapshot.sha256}`,
          ),
        ).size,
        Object.keys(snapshots).length,
        'pre/post descriptors must be exact and distinct',
      )
      for (const [state, snapshot] of Object.entries(snapshots)) {
        assert.equal(
          matchExactSnapshot(
            expectedDescriptor(snapshot),
            snapshots,
            `${state} contract`,
          ).state,
          state,
        )
      }
      assert.throws(
        () =>
          matchExactSnapshot(
            { bytes: 0, sha256: '0'.repeat(64) },
            snapshots,
            'unknown evolution state',
          ),
        /unsupported exact snapshot/,
      )
    }
    assert.deepEqual(fixture.inputs.evolutionCompatibility, {
      preCorrection: ['preCorrection'],
      postCorrection: ['postCorrection', 'postU20775'],
      postFocusedBatch: ['postFocusedBatch'],
      postDaemonOwner: ['postDaemonOwner'],
    })
    for (const [reportState, coverageState] of [
      ['preCorrection', 'preCorrection'],
      ['postCorrection', 'postCorrection'],
      ['postCorrection', 'postU20775'],
      ['postFocusedBatch', 'postFocusedBatch'],
      ['postDaemonOwner', 'postDaemonOwner'],
    ]) {
      assert.doesNotThrow(() =>
        assertCompatibleEvolutionPair(reportState, coverageState),
      )
    }
    for (const [reportState, coverageState] of [
      ['preCorrection', 'postCorrection'],
      ['preCorrection', 'postU20775'],
      ['postCorrection', 'preCorrection'],
      ['postCorrection', 'postFocusedBatch'],
      ['postFocusedBatch', 'postCorrection'],
      ['postFocusedBatch', 'postU20775'],
      ['postDaemonOwner', 'postFocusedBatch'],
      ['postFocusedBatch', 'postDaemonOwner'],
    ]) {
      assert.throws(
        () => assertCompatibleEvolutionPair(reportState, coverageState),
        /unsupported report\/coverage hybrid/,
      )
    }
    assert.equal(fixture.generatorWiring.replayHelper, null)
    assert.deepEqual(Object.keys(ownerProofModule).sort(), [
      'TARGET121_FORK_SPAWNED_BY_SKILL_EVIDENCE_IDS',
      'TARGET121_FORK_SPAWNED_BY_SKILL_OWNER_OVERRIDES',
    ])
  },
)

test(
  'u18932 ledger, owner rows, and exact source-coverage evolution are pinned',
  { skip: !selected },
  () => {
    const ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
          fixture.inputs.structuralLedger,
          'Target121 structural ledger',
        ),
      ),
    )
    const targetRegion = ledger.regions.find(
      row => row.target.index === fixture.targetUnit.targetIndex,
    )
    assert.ok(targetRegion)
    assert.equal(targetRegion.classification, fixture.targetUnit.classification)
    assert.equal(targetRegion.baselineUnitIndex, undefined)
    assert.deepEqual(
      {
        nodeType: targetRegion.target.nodeType,
        parseStatus: targetRegion.target.parseStatus,
        start: targetRegion.target.start,
        end: targetRegion.target.end,
        tokenCount: targetRegion.target.tokenCount,
        sourceHash: targetRegion.target.sourceHash,
        coarseHash: targetRegion.target.coarseHash,
        topDefinitionCount: targetRegion.target.topDefinitionCount,
        unknownFreeIdentifierCount: targetRegion.unknownFreeIdentifierCount,
      },
      {
        nodeType: fixture.targetUnit.nodeType,
        parseStatus: fixture.targetUnit.parseStatus,
        start: fixture.targetUnit.start,
        end: fixture.targetUnit.end,
        tokenCount: fixture.targetUnit.tokenCount,
        sourceHash: fixture.targetUnit.sha256,
        coarseHash: fixture.targetUnit.coarseHash,
        topDefinitionCount: fixture.targetUnit.topDefinitionCount,
        unknownFreeIdentifierCount: fixture.targetUnit.unknownFreeIdentifierCount,
      },
    )
    const baselineRegion = ledger.unmatchedBaseline.find(
      row => row.index === fixture.baselineSemanticCounterpart.baselineUnitIndex,
    )
    assert.ok(baselineRegion)
    assert.deepEqual(
      {
        nodeType: baselineRegion.nodeType,
        parseStatus: baselineRegion.parseStatus,
        start: baselineRegion.start,
        end: baselineRegion.end,
        tokenCount: baselineRegion.tokenCount,
        sourceHash: baselineRegion.sourceHash,
        coarseHash: baselineRegion.coarseHash,
        topDefinitionCount: baselineRegion.topDefinitionCount,
      },
      {
        nodeType: fixture.baselineSemanticCounterpart.nodeType,
        parseStatus: fixture.baselineSemanticCounterpart.parseStatus,
        start: fixture.baselineSemanticCounterpart.start,
        end: fixture.baselineSemanticCounterpart.end,
        tokenCount: fixture.baselineSemanticCounterpart.tokenCount,
        sourceHash: fixture.baselineSemanticCounterpart.sha256,
        coarseHash: fixture.baselineSemanticCounterpart.coarseHash,
        topDefinitionCount:
          fixture.baselineSemanticCounterpart.topDefinitionCount,
      },
    )

    const reportSnapshot = readExactSnapshot(
      commonSnapshotPath(fixture.inputs.typedReportSnapshots),
      fixture.inputs.typedReportSnapshots,
      'Target121 typed report snapshot',
    )
    const reportState = projectedState(
      fixture.ownerResidues.states,
      reportSnapshot.state,
      'owner-residue',
    )
    const report = JSON.parse(reportSnapshot.bytes)
    const ownerRows = report.sourceRuntimeOwnerResidueRows.filter(
      row => row.structural.index === fixture.targetUnit.targetIndex,
    )
    const addedRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
      row => row.structural.index === fixture.targetUnit.targetIndex,
    )
    const strictRows = report.rows.filter(
      row => row.structural.index === fixture.targetUnit.targetIndex,
    )
    assert.equal(ownerRows.length, reportState.totalRows)
    assert.equal(addedRows.length, fixture.ownerResidues.targetAddedRows)
    assert.equal(strictRows.length, fixture.ownerResidues.strictRows)
    assert.ok(
      ownerRows.every(
        row =>
          JSON.stringify(row.ownerPaths) ===
            JSON.stringify([reportState.reportedOwner]) &&
          row.ownerSourceMatches.length === 0,
      ),
    )
    assert.deepEqual(
      canonicalDigest(
        ownerRows.map(row => [
          row.literalKind,
          row.value,
          row.target.start,
          row.target.end,
          row.baselineOccurrenceCount,
          row.targetOccurrenceNumber,
          row.targetAdded,
        ]),
      ),
      reportState.rowIdentities,
    )
    if (reportState.ownerIdentities) {
      assert.deepEqual(
        canonicalDigest(
          ownerRows.map(row => [
            row.literalKind,
            row.value,
            row.target.start,
            row.target.end,
            row.baselineOccurrenceCount,
            row.targetOccurrenceNumber,
            row.targetAdded,
            row.ownerPaths,
            row.ownerSourceMatches,
          ]),
        ),
        reportState.ownerIdentities,
      )
    }
    const strictIdentities = strictRows.map(row => [
      row.structural.index,
      row.literalKind,
      row.value,
      row.target.start,
      row.target.end,
      row.targetOccurrenceNumber,
    ])
    assert.deepEqual(strictIdentities, fixture.ownerResidues.strictRowsExact)
    assert.deepEqual(
      canonicalDigest(strictIdentities),
      fixture.ownerResidues.strictIdentities,
    )
    assert.deepEqual(addedRows, strictRows)

    const coverageSnapshot = readExactSnapshot(
      commonSnapshotPath(fixture.inputs.sourceCoverageSnapshots),
      fixture.inputs.sourceCoverageSnapshots,
      'Target121 source-coverage snapshot',
    )
    assertCompatibleEvolutionPair(reportSnapshot.state, coverageSnapshot.state)
    const coverageClaim = projectedState(
      fixture.sourceCoverageClaim.states,
      coverageSnapshot.state,
      'source-coverage',
    )
    const rawCoverage = gunzipSync(coverageSnapshot.bytes)
    assert.deepEqual(descriptor(rawCoverage), {
      bytes: coverageSnapshot.expected.rawBytes,
      sha256: coverageSnapshot.expected.rawSha256,
    })
    const coverage = JSON.parse(rawCoverage)
    const coverageRows = coverage.rows.filter(
      row => row.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert.deepEqual(coverageRows, [coverageClaim.row])
    assert.deepEqual(
      canonicalDigest(coverageRows[0]),
      coverageClaim.rowCanonical,
    )
    assert.deepEqual(
      coverage.owners.filter(owner =>
        coverageRows[0].ownerIds.includes(owner.id),
      ),
      [coverageClaim.owner],
    )
    if (coverageSnapshot.state !== 'preCorrection') {
      assert.deepEqual(coverageRows[0].evidenceIds, fixture.evidenceIds)
      assert.equal(coverageClaim.owner.path, fixture.ownerResidues.correctedOwner)
    }
    assert.match(fixture.sourceCoverageClaim.correction, /owner is false/)
    assert.match(fixture.sourceCoverageClaim.correction, /spawnFork/)
  },
)

test(
  'the complete fork unit delta is exactly one skill-provenance property',
  { skip: !selected },
  t => {
    const baselinePath = artifactPath(
      'CLAUDE_CODE_2_1_120_INNER_BUNDLE',
      fixture.inputs.baselineBundle,
    )
    const targetPath = artifactPath(
      'CLAUDE_CODE_2_1_121_INNER_BUNDLE',
      fixture.inputs.targetBundle,
    )
    if (!fs.existsSync(baselinePath) || !fs.existsSync(targetPath)) {
      t.skip('authenticated Target120/121 bundles are unavailable')
      return
    }
    const baseline = parseUnit(
      readExact(
        baselinePath,
        fixture.inputs.baselineBundle,
        'Target120 bundle',
      ),
      fixture.baselineSemanticCounterpart,
      'Target120 spawnFork unit',
    )
    const target = parseUnit(
      readExact(targetPath, fixture.inputs.targetBundle, 'Target121 bundle'),
      fixture.targetUnit,
      'Target121 u18932',
    )
    assert.equal(
      fixture.targetUnit.bytes - fixture.baselineSemanticCounterpart.bytes,
      fixture.wholeUnitSemanticDelta.rawByteDelta,
    )
    assert.equal(
      fixture.targetUnit.tokenCount -
        fixture.baselineSemanticCounterpart.tokenCount,
      fixture.wholeUnitSemanticDelta.tokenDelta,
    )
    assert.deepEqual(
      canonicalDescriptor(baseline.node),
      fixture.wholeUnitSemanticDelta.baselineCanonical,
    )
    assert.deepEqual(
      canonicalDescriptor(target.node),
      fixture.wholeUnitSemanticDelta.targetCanonical,
    )

    const normalizedBaseline = baseline.tokens.map(normalizedToken)
    const normalizedTarget = target.tokens.map(normalizedToken)
    assert.deepEqual(
      {
        count: normalizedBaseline.length,
        ...canonicalDigest(normalizedBaseline),
      },
      fixture.wholeUnitSemanticDelta.identifierNormalizedTokens.baseline,
    )
    assert.deepEqual(
      {
        count: normalizedTarget.length,
        ...canonicalDigest(normalizedTarget),
      },
      fixture.wholeUnitSemanticDelta.identifierNormalizedTokens.target,
    )
    const tokenInsertion =
      fixture.wholeUnitSemanticDelta.identifierNormalizedTokens.insertion
    const insertedTokens = target.tokens.filter(
      token =>
        token.start >= tokenInsertion.localStart &&
        token.end <= tokenInsertion.localEnd,
    )
    const targetWithoutInsertion = target.tokens.filter(
      token =>
        !(
          token.start >= tokenInsertion.localStart &&
          token.end <= tokenInsertion.localEnd
        ),
    )
    assert.deepEqual(
      {
        count: insertedTokens.length,
        ...canonicalDigest(insertedTokens.map(normalizedToken)),
      },
      {
        count: tokenInsertion.count,
        bytes: tokenInsertion.bytes,
        sha256: tokenInsertion.sha256,
      },
    )
    assert.deepEqual(
      {
        count: targetWithoutInsertion.length,
        ...canonicalDigest(targetWithoutInsertion.map(normalizedToken)),
      },
      fixture.wholeUnitSemanticDelta.identifierNormalizedTokens
        .targetWithoutInsertion,
    )
    assert.deepEqual(
      targetWithoutInsertion.map(normalizedToken),
      normalizedBaseline,
    )

    const baselineObject = runAgentParameterObject(baseline.node)
    const targetObject = runAgentParameterObject(target.node)
    for (const [parsed, node, expected, label] of [
      [
        baseline,
        baselineObject,
        fixture.wholeUnitSemanticDelta.runAgentParameterObject.baseline,
        'Target120 runAgent parameters',
      ],
      [
        target,
        targetObject,
        fixture.wholeUnitSemanticDelta.runAgentParameterObject.target,
        'Target121 runAgent parameters',
      ],
    ]) {
      exactNodeSlice(parsed, node, expected, label)
      assert.equal(node.properties.length, expected.propertyCount)
      assert.deepEqual(canonicalDescriptor(node), {
        bytes: expected.canonicalBytes,
        sha256: expected.canonicalSha256,
      })
    }
    const addition = targetObject.properties[7]
    const expectedAddition = fixture.wholeUnitSemanticDelta.addition
    exactNodeSlice(target, addition, expectedAddition, 'skill provenance')
    assert.equal(addition.key.name, expectedAddition.key)
    assert.equal(addition.value.type, expectedAddition.valueType)
    assert.equal(addition.value.operator, expectedAddition.operator)
    assert.deepEqual(canonicalDescriptor(addition), {
      bytes: expectedAddition.canonicalBytes,
      sha256: expectedAddition.canonicalSha256,
    })
    assert.equal(
      target.unitStart + addition.start,
      tokenInsertion.start,
    )
    assert.equal(
      target.unitStart + addition.end + 1,
      tokenInsertion.end,
    )
    exactBufferSlice(
      Buffer.from(target.source),
      {
        ...expectedAddition.withComma,
        start: tokenInsertion.localStart,
        end: tokenInsertion.localEnd,
      },
      'skill provenance with trailing comma',
    )
    targetObject.properties.splice(expectedAddition.propertyIndex, 1)
    const transformed = canonicalDescriptor(target.node)
    assert.deepEqual(
      transformed,
      fixture.wholeUnitSemanticDelta.transform.commonCanonical,
    )
    assert.deepEqual(transformed, canonicalDescriptor(baseline.node))
  },
)

test(
  'raw Target120 and Target121 sources bind spawnFork and prove the replay blocker',
  { skip: !selected },
  () => {
    const ts = typescript()
    const baseline = forkSourceEvidence(
      ts,
      baselineSourceRoot(),
      fixture.sourceState.target120,
    )
    const target = forkSourceEvidence(
      ts,
      targetSourceRoot(),
      fixture.sourceState.target121,
    )
    assert.equal(baseline.source, target.source)
    assert.equal(baseline.declarationText, target.declarationText)
    assert.match(fixture.sourceState.declarationRelation, /byte-identical/)
    generatedOwnerSourceEvidence(ts, targetSourceRoot())
    toolSourceEvidence(ts, targetSourceRoot())
    assert.deepEqual(
      sourceRootMarkerCounts(targetSourceRoot()),
      fixture.sourceState.sourceRootMarkerCounts,
    )

    const semanticTrees = [
      baselineRepositoryRoot(),
      targetRepositoryRoot(),
    ]
    const expected = [
      fixture.sourceState.target120,
      fixture.sourceState.target121,
    ]
    for (let index = 0; index < semanticTrees.length; index += 1) {
      assert.equal(git(semanticTrees[index], ['rev-parse', 'HEAD']), expected[index].gitCommit)
      assert.equal(
        git(semanticTrees[index], [
          'rev-parse',
          `HEAD:${fixture.sourceState.path}`,
        ]),
        expected[index].gitBlob,
      )
    }
  },
)

test(
  'fresh Target121 package independently preserves the same source blocker',
  { skip: !selected },
  t => {
    const root = freshPackageSourceRoot()
    if (!fs.existsSync(root)) {
      t.skip(`fresh Target121 package source is unavailable: ${root}`)
      return
    }
    const ts = typescript()
    const raw = forkSourceEvidence(
      ts,
      targetSourceRoot(),
      fixture.sourceState.target121,
    )
    const fresh = forkSourceEvidence(
      ts,
      root,
      fixture.sourceState.freshPackage,
    )
    assert.equal(fresh.source, raw.source)
    assert.equal(fresh.declarationText, raw.declarationText)
    generatedOwnerSourceEvidence(ts, root)
    toolSourceEvidence(ts, root)
    assert.deepEqual(
      sourceRootMarkerCounts(root),
      fixture.sourceState.sourceRootMarkerCounts,
    )
  },
)

test(
  'the static proof removes exactly three residues and is import-idempotent',
  { skip: !selected },
  async () => {
    assert.deepEqual(fixture.strictEvolution.before, {
      unsupportedUnits: 39,
      unsupportedResidues: 419,
    })
    assert.deepEqual(fixture.strictEvolution.removes.targetIndices, [18932])
    assert.equal(fixture.strictEvolution.removes.units, 1)
    assert.equal(fixture.strictEvolution.removes.residueCount, 3)
    assert.deepEqual(
      fixture.strictEvolution.removes.residues,
      fixture.ownerResidues.strictRowsExact,
    )
    assert.deepEqual(fixture.strictEvolution.predictedAfter, {
      unsupportedUnits: 38,
      unsupportedResidues: 416,
    })
    assert.match(
      fixture.sourceReplayBlocker.decision,
      /static whole-unit owner proof only; no replay helper and no source writes/,
    )
    assert.match(
      fixture.sourceReplayBlocker.reason,
      /byte-identical.*neither spawnedBySkill nor activeSkill.*type-incomplete/,
    )
    const first = await import(
      `../cases/2.1.120-to-2.1.121/recovered/fork-spawned-by-skill-owner-overrides.mjs?first`
    )
    const second = await import(
      `../cases/2.1.120-to-2.1.121/recovered/fork-spawned-by-skill-owner-overrides.mjs?second`
    )
    assert.deepEqual(
      first.TARGET121_FORK_SPAWNED_BY_SKILL_OWNER_OVERRIDES,
      second.TARGET121_FORK_SPAWNED_BY_SKILL_OWNER_OVERRIDES,
    )
    assert.equal(
      Object.isFrozen(
        first.TARGET121_FORK_SPAWNED_BY_SKILL_OWNER_OVERRIDES[0].paths,
      ),
      true,
    )
  },
)
