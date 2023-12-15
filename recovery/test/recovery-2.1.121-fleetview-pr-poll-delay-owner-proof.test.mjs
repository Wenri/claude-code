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
import * as ownerProofModule from '../cases/2.1.120-to-2.1.121/recovered/fleetview-pr-poll-delay-owner-overrides.mjs'

const {
  TARGET121_FLEETVIEW_PR_POLL_DELAY_EVIDENCE_IDS,
  TARGET121_FLEETVIEW_PR_POLL_DELAY_OWNER_OVERRIDES,
} = ownerProofModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-fleetview-pr-poll-delay-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '012b3f2e1fc7feb928376cc11646d8f5b35d1259700c0c74b54e001c5bf205ab'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function expectedDescriptor(expected) {
  return { bytes: expected.bytes, sha256: expected.sha256 }
}

function canonicalDigest(value) {
  return descriptor(Buffer.from(JSON.stringify(value)))
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
  return { expected: matches[0][1], state: matches[0][0] }
}

function readExactSnapshot(filename, snapshots, label) {
  const bytes = fs.readFileSync(filename)
  return { bytes, ...matchExactSnapshot(descriptor(bytes), snapshots, label) }
}

function commonSnapshotPath(snapshots) {
  const paths = [...new Set(Object.values(snapshots).map(row => row.path))]
  assert.equal(paths.length, 1, 'evolution snapshots must share one path')
  return path.join(repositoryRoot, paths[0])
}

function localEvolutionState(state) {
  if (state === 'provisional') {
    return {
      ownerResidues: fixture.ownerResidues,
      sourceCoverageClaim: fixture.sourceCoverageClaim,
    }
  }
  const value = fixture[state]
  assert.ok(value, `local evolution state ${state}`)
  if (value.projection) return localEvolutionState(value.projection)
  return value
}

function assertCompatibleEvolutionPair(reportState, coverageState) {
  assert.equal(
    (fixture.inputs.evolutionCompatibility[reportState] ?? []).includes(
      coverageState,
    ),
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

function exactStringSlice(source, expected, label) {
  const value = source.slice(expected.start, expected.end)
  assert.equal(value.length, expected.chars ?? expected.end - expected.start)
  assert.deepEqual(descriptor(value), expectedDescriptor(expected), label)
  if (expected.exact !== undefined) assert.equal(value, expected.exact, label)
  return value
}

function artifactPath(environmentName, expected) {
  return path.resolve(
    process.env[environmentName] ?? path.join(repositoryRoot, expected.path),
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
      process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
      path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.121/src'),
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

function occurrenceStarts(source, regexp) {
  return [...source.matchAll(regexp)].map(match => match.index)
}

function walk(node, visit, currentPath = [], parent = null, key = null) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach((child, index) =>
      walk(child, visit, [...currentPath, index], parent, index),
    )
    return
  }
  if (typeof node.type === 'string') {
    visit(node, currentPath, parent, key)
  }
  for (const [childKey, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start'].includes(childKey)) {
      walk(child, visit, [...currentPath, childKey], node, childKey)
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
          !parent.computed) ||
        (parent?.type === 'PropertyDefinition' &&
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
  return canonicalDigest(canonicalize(node))
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
  const tokens = [...tokenizer(source, { ecmaVersion: 'latest' })]
  assert.equal(tokens.length, expected.tokenCount)
  return { node, source, tokens, unitStart: expected.start }
}

function assertNode(unit, expected, label) {
  const matches = []
  walk(unit.node, (node, nodePath) => {
    if (
      node.type === expected.nodeType &&
      node.start === expected.localStart &&
      node.end === expected.localEnd
    ) {
      matches.push({ node, path: nodePath.join('.') })
    }
  })
  assert.equal(matches.length, 1, `${label}: unique node`)
  assert.equal(matches[0].path, expected.path)
  const raw = unit.source.slice(matches[0].node.start, matches[0].node.end)
  assert.deepEqual(descriptor(raw), expectedDescriptor(expected), label)
  if (expected.exact !== undefined) assert.equal(raw, expected.exact, label)
  return matches[0].node
}

function typescript() {
  return require(
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  )
}

function findTsNodes(ts, root, predicate) {
  const matches = []
  function visit(node) {
    if (predicate(node)) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(root)
  return matches
}

function tsNodeDescriptor(ts, sourceFile, source, node, expected, extra = {}) {
  const start = node.getStart(sourceFile)
  const end = node.end
  const text = source.slice(start, end)
  assert.deepEqual(
    {
      start,
      end,
      chars: text.length,
      ...descriptor(text),
      line: sourceFile.getLineAndCharacterOfPosition(start).line + 1,
      endLine: sourceFile.getLineAndCharacterOfPosition(end).line + 1,
      ...extra,
    },
    expected,
  )
  return text
}

function parseTsFile(ts, root, sourcePath, expected) {
  const filename = sourceFilename(root, sourcePath)
  const bytes = readExact(filename, expected, filename)
  const source = bytes.toString('utf8')
  assert.equal(source.length, expected.chars)
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    sourcePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  return { filename, source, sourceFile }
}

function fleetViewSourceEvidence(ts, root, expected) {
  const parsed = parseTsFile(ts, root, fixture.sourceState.path, expected)
  const declarations = findTsNodes(
    ts,
    parsed.sourceFile,
    node => ts.isFunctionDeclaration(node) && node.name?.text === 'FleetView',
  )
  assert.equal(declarations.length, 1)
  const fleetView = declarations[0]
  tsNodeDescriptor(ts, parsed.sourceFile, parsed.source, fleetView, expected.fleetView, {
    parameterCount: fleetView.parameters.length,
    bodyStatementCount: fleetView.body.statements.length,
  })
  const polls = findTsNodes(
    ts,
    fleetView,
    node =>
      ts.isVariableDeclaration(node) &&
      node.name.getText(parsed.sourceFile) === 'poll',
  )
  assert.equal(polls.length, 1)
  tsNodeDescriptor(ts, parsed.sourceFile, parsed.source, polls[0], expected.poll)
  const activeUrls = findTsNodes(
    ts,
    fleetView,
    node =>
      ts.isVariableDeclaration(node) &&
      node.name.getText(parsed.sourceFile) === 'activeUrls',
  )
  assert.equal(activeUrls.length, 1)
  tsNodeDescriptor(
    ts,
    parsed.sourceFile,
    parsed.source,
    activeUrls[0],
    expected.activeUrls,
  )
  const prIfs = findTsNodes(
    ts,
    fleetView,
    node =>
      ts.isIfStatement(node) &&
      node.expression.getText(parsed.sourceFile) === expected.prIf.test,
  )
  assert.equal(prIfs.length, 1)
  tsNodeDescriptor(ts, parsed.sourceFile, parsed.source, prIfs[0], expected.prIf, {
    test: prIfs[0].expression.getText(parsed.sourceFile),
  })
  for (const [marker, count] of Object.entries(
    fixture.sourceState.fleetViewMarkerCounts,
  )) {
    assert.equal(countOccurrences(parsed.source, marker), count, marker)
  }
  return parsed.source
}

function producerSourceEvidence(ts, root, expected) {
  const parsed = parseTsFile(ts, root, expected.path, expected.file)
  const name = expected.declaration.exact.match(/function (\w+)/)?.[1]
  assert.ok(name)
  const declarations = findTsNodes(
    ts,
    parsed.sourceFile,
    node => ts.isFunctionDeclaration(node) && node.name?.text === name,
  )
  assert.equal(declarations.length, 1)
  const { exact, ...declarationExpected } = expected.declaration
  const text = tsNodeDescriptor(
    ts,
    parsed.sourceFile,
    parsed.source,
    declarations[0],
    declarationExpected,
  )
  assert.equal(text, exact)
  return parsed.source
}

function reportedOwnerSourceEvidence(root, expected) {
  const filename = sourceFilename(root, expected.path)
  const bytes = readExact(filename, expected, filename)
  const source = bytes.toString('utf8')
  assert.equal(source.length, expected.chars)
  for (const [marker, count] of Object.entries(expected.markerCounts)) {
    assert.equal(countOccurrences(source, marker), count, marker)
  }
  return source
}

function git(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

test(
  'Target121 FleetView PR-delay fixture and override are exact',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(
      fixture.status,
      'case-owned-static-owner-proof-source-replay-blocked',
    )
    assert.deepEqual(
      TARGET121_FLEETVIEW_PR_POLL_DELAY_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET121_FLEETVIEW_PR_POLL_DELAY_OWNER_OVERRIDES,
      [
        {
          key: `${caseName}:20874`,
          targetIndex: 20874,
          paths: [fixture.ownerResidues.correctedOwner],
          declarations: fixture.ownerResidues.declarations,
          evidenceIds: fixture.evidenceIds,
          behavior:
            TARGET121_FLEETVIEW_PR_POLL_DELAY_OWNER_OVERRIDES[0].behavior,
        },
      ],
    )
    assert.equal(
      Object.isFrozen(TARGET121_FLEETVIEW_PR_POLL_DELAY_OWNER_OVERRIDES),
      true,
    )
    assert.equal(fixture.generatorWiring.replayHelper, null)
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
    }
    assert.doesNotThrow(() =>
      assertCompatibleEvolutionPair('provisional', 'provisional'),
    )
    assert.doesNotThrow(() =>
      assertCompatibleEvolutionPair('postFocusedBatch', 'postFocusedBatch'),
    )
    assert.doesNotThrow(() =>
      assertCompatibleEvolutionPair('postDaemonOwner', 'postDaemonOwner'),
    )
    assert.throws(
      () => assertCompatibleEvolutionPair('provisional', 'postFocusedBatch'),
      /unsupported report\/coverage hybrid/,
    )
    assert.throws(
      () => assertCompatibleEvolutionPair('postFocusedBatch', 'provisional'),
      /unsupported report\/coverage hybrid/,
    )
    assert.throws(
      () =>
        assertCompatibleEvolutionPair('postDaemonOwner', 'postFocusedBatch'),
      /unsupported report\/coverage hybrid/,
    )
    assert.deepEqual(Object.keys(ownerProofModule).sort(), [
      'TARGET121_FLEETVIEW_PR_POLL_DELAY_EVIDENCE_IDS',
      'TARGET121_FLEETVIEW_PR_POLL_DELAY_OWNER_OVERRIDES',
    ])
  },
)

test(
  'u20874 ledger, exact report partition, and provisional coverage row are pinned',
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
    assert.deepEqual(
      {
        classification: targetRegion.classification,
        nodeType: targetRegion.target.nodeType,
        parseStatus: targetRegion.target.parseStatus,
        start: targetRegion.target.start,
        end: targetRegion.target.end,
        tokenCount: targetRegion.target.tokenCount,
        sourceHash: targetRegion.target.sourceHash,
        coarseHash: targetRegion.target.coarseHash,
        topDefinitionCount: targetRegion.target.topDefinitionCount,
        unknownFreeIdentifierCount: targetRegion.unknownFreeIdentifierCount,
        baselineUnitIndex: targetRegion.baselineUnitIndex,
      },
      {
        classification: fixture.targetUnit.classification,
        nodeType: fixture.targetUnit.nodeType,
        parseStatus: fixture.targetUnit.parseStatus,
        start: fixture.targetUnit.start,
        end: fixture.targetUnit.end,
        tokenCount: fixture.targetUnit.tokenCount,
        sourceHash: fixture.targetUnit.sha256,
        coarseHash: fixture.targetUnit.coarseHash,
        topDefinitionCount: fixture.targetUnit.topDefinitionCount,
        unknownFreeIdentifierCount: fixture.targetUnit.unknownFreeIdentifierCount,
        baselineUnitIndex: undefined,
      },
    )

    const reportSnapshot = readExactSnapshot(
      commonSnapshotPath(fixture.inputs.typedReportSnapshots),
      fixture.inputs.typedReportSnapshots,
      'Target121 typed report snapshot',
    )
    const reportState = localEvolutionState(reportSnapshot.state).ownerResidues
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
    const rowIdentities = ownerRows.map(row => [
      row.literalKind,
      row.value,
      row.target.start,
      row.target.end,
      row.baselineOccurrenceCount,
      row.targetOccurrenceNumber,
      row.targetAdded,
    ])
    if (reportState.allRowsExact) {
      assert.deepEqual(rowIdentities, reportState.allRowsExact)
    }
    assert.deepEqual(
      canonicalDigest(rowIdentities),
      reportState.rowIdentities,
    )
    assert.deepEqual(
      canonicalDigest(
        ownerRows.map((row, index) => [
          ...rowIdentities[index],
          row.ownerPaths,
          row.ownerSourceMatches,
        ]),
      ),
      reportState.ownerIdentities,
    )
    const addedIdentities = addedRows.map(row => [
      row.literalKind,
      row.value,
      row.target.start,
      row.target.end,
      row.baselineOccurrenceCount,
      row.targetOccurrenceNumber,
      row.targetAdded,
    ])
    assert.deepEqual(addedIdentities, fixture.ownerResidues.targetAddedRowsExact)
    assert.deepEqual(
      canonicalDigest(addedIdentities),
      fixture.ownerResidues.targetAddedIdentities,
    )
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

    const coverageSnapshot = readExactSnapshot(
      commonSnapshotPath(fixture.inputs.sourceCoverageSnapshots),
      fixture.inputs.sourceCoverageSnapshots,
      'Target121 source-coverage snapshot',
    )
    assertCompatibleEvolutionPair(reportSnapshot.state, coverageSnapshot.state)
    const coverageState = localEvolutionState(
      coverageSnapshot.state,
    ).sourceCoverageClaim
    const rawCoverage = gunzipSync(coverageSnapshot.bytes)
    assert.deepEqual(descriptor(rawCoverage), {
      bytes: coverageSnapshot.expected.rawBytes,
      sha256: coverageSnapshot.expected.rawSha256,
    })
    const coverage = JSON.parse(rawCoverage)
    const rows = coverage.rows.filter(
      row => row.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert.equal(rows.length, 1)
    assert.deepEqual(
      canonicalDigest(rows[0]),
      coverageState.rowCanonical ?? coverageState.provisionalRow,
    )
    if (coverageState.row) {
      assert.deepEqual(rows, [coverageState.row])
    } else {
      assert.deepEqual(
      {
        targetIndex: rows[0].targetIndex,
        start: rows[0].start,
        end: rows[0].end,
        nodeType: rows[0].nodeType,
        sourceHash: rows[0].sourceHash,
        structuralClass: rows[0].structuralClass,
        disposition: rows[0].disposition,
        ownerIds: rows[0].ownerIds,
        evidenceIds: rows[0].evidenceIds,
      },
      {
        targetIndex: fixture.targetUnit.targetIndex,
        start: fixture.targetUnit.start,
        end: fixture.targetUnit.end,
        nodeType: fixture.targetUnit.nodeType,
        sourceHash: fixture.targetUnit.sha256,
        structuralClass: fixture.targetUnit.classification,
        disposition: 'source-runtime-covered',
        ownerIds: [coverageState.reportedOwner.id],
        evidenceIds: ['source-map-attribution', 'semantic-test'],
      },
    )
    assert.match(rows[0].behavior, /sessionRestore\.ts/)
    }
    assert.deepEqual(
      coverage.owners.filter(owner => rows[0].ownerIds.includes(owner.id)),
      [coverageState.owner ?? coverageState.reportedOwner],
    )
  },
)

test(
  'complete helper, insertion boundary, and all twelve numeric nodes are exact',
  { skip: !selected },
  () => {
    const baselineBundle = readExact(
      artifactPath(
        'CLAUDE_CODE_2_1_120_INNER_BUNDLE',
        fixture.inputs.baselineBundle,
      ),
      fixture.inputs.baselineBundle,
      'Target120 inner bundle',
    )
    const targetBundle = readExact(
      artifactPath(
        'CLAUDE_CODE_2_1_121_INNER_BUNDLE',
        fixture.inputs.targetBundle,
      ),
      fixture.inputs.targetBundle,
      'Target121 inner bundle',
    )
    const boundary = fixture.baselineInsertionBoundary
    const baselineLeft = parseUnit(
      baselineBundle,
      boundary.baselineLeft,
      'Target120 left insertion anchor',
    )
    const baselineRight = parseUnit(
      baselineBundle,
      boundary.baselineRight,
      'Target120 right insertion anchor',
    )
    const targetLeft = parseUnit(
      targetBundle,
      boundary.targetLeft,
      'Target121 left insertion anchor',
    )
    const target = parseUnit(targetBundle, fixture.targetUnit, 'Target121 u20874')
    const targetRight = parseUnit(
      targetBundle,
      boundary.targetRight,
      'Target121 right insertion anchor',
    )
    assert.equal(boundary.baselineLeft.end, boundary.baselineRight.start)
    assert.equal(boundary.targetLeft.end, fixture.targetUnit.start)
    assert.equal(fixture.targetUnit.end, boundary.targetRight.start)
    assert.deepEqual(canonicalize(baselineLeft.node), canonicalize(targetLeft.node))
    assert.deepEqual(canonicalize(baselineRight.node), canonicalize(targetRight.node))
    assert.deepEqual(
      canonicalDescriptor(target.node),
      fixture.wholeUnitEvidence.canonical,
    )
    assert.equal(target.node.params.length, fixture.targetUnit.parameterCount)
    assert.equal(
      target.node.body.body.length,
      fixture.targetUnit.bodyStatementCount,
    )
    assert.equal(target.node.body.body[0].type, 'IfStatement')
    assert.equal(target.node.body.body[0].consequent.body.length, 3)
    const { method, ...tokenDescriptor } =
      fixture.wholeUnitEvidence.identifierNormalizedTokens
    assert.match(method, /Identifier|name-token|name-token value/)
    assert.deepEqual(
      {
        count: target.tokens.length,
        ...canonicalDigest(target.tokens.map(normalizedToken)),
      },
      tokenDescriptor,
    )

    const numericNodes = []
    walk(target.node, (node, nodePath) => {
      if (node.type === 'Literal' && typeof node.value === 'number') {
        numericNodes.push([
          node.value,
          nodePath.join('.'),
          node.start,
          node.end,
          fixture.targetUnit.start + node.start,
          fixture.targetUnit.start + node.end,
        ])
      }
    })
    assert.deepEqual(numericNodes, fixture.wholeUnitEvidence.numericNodes)
    for (const row of numericNodes) {
      assert.equal(
        target.source.slice(row[2], row[3]),
        String(row[0]),
        `numeric node ${row[0]}`,
      )
    }

    const selector = Function(`${target.source}; return oZ4`)()
    for (const [focused, elapsed, expected] of
      fixture.wholeUnitEvidence.branchTable) {
      assert.equal(selector(focused, elapsed), expected)
    }
    assert.deepEqual(
      occurrenceStarts(baselineBundle.toString('utf8'), /(?<!\d)900000(?!\d)/g),
      fixture.wholeUnitEvidence.global900000OccurrenceStarts.baseline,
    )
    assert.deepEqual(
      occurrenceStarts(targetBundle.toString('utf8'), /(?<!\d)900000(?!\d)/g),
      fixture.wholeUnitEvidence.global900000OccurrenceStarts.target,
    )
    assert.equal(
      fixture.wholeUnitEvidence.global900000OccurrenceStarts.target.at(-1),
      fixture.ownerResidues.strictRowsExact[0][3],
    )
    parseUnit(
      baselineBundle,
      boundary.baselineExports,
      'Target120 FleetView exports',
    )
    parseUnit(targetBundle, boundary.targetExports, 'Target121 FleetView exports')
  },
)

test(
  'FleetView owns the helper call, timestamp gate, producers, and module initializer',
  { skip: !selected },
  () => {
    const baselineBundle = readExact(
      artifactPath(
        'CLAUDE_CODE_2_1_120_INNER_BUNDLE',
        fixture.inputs.baselineBundle,
      ),
      fixture.inputs.baselineBundle,
      'Target120 inner bundle',
    )
    const targetBundle = readExact(
      artifactPath(
        'CLAUDE_CODE_2_1_121_INNER_BUNDLE',
        fixture.inputs.targetBundle,
      ),
      fixture.inputs.targetBundle,
      'Target121 inner bundle',
    )
    const targetSource = targetBundle.toString('utf8')
    assert.deepEqual(
      occurrenceStarts(targetSource, /oZ4/g),
      fixture.callGraph.helperOccurrenceStarts,
    )
    const targetFleet = parseUnit(
      targetBundle,
      fixture.callGraph.targetFleetView,
      'Target121 FleetView runtime',
    )
    const baselineFleet = parseUnit(
      baselineBundle,
      fixture.callGraph.baselineFleetView,
      'Target120 FleetView runtime',
    )
    for (const [label, expected] of Object.entries({
      lastPollRef: fixture.callGraph.lastPollRef,
      focusReset: fixture.callGraph.focusReset,
      targetActiveUrlsAndGate: fixture.callGraph.targetActiveUrlsAndGate,
      helperGateDeclarator: fixture.callGraph.helperGateDeclarator,
      helperCall: fixture.callGraph.helperCall,
      targetPrGate: fixture.callGraph.targetPrGate,
      timestampCommit: fixture.callGraph.timestampCommit,
    })) {
      assertNode(targetFleet, expected, label)
    }
    const targetGate = assertNode(
      targetFleet,
      fixture.callGraph.targetPrGate,
      'Target121 PR gate',
    )
    assert.equal(
      targetFleet.source.slice(targetGate.test.start, targetGate.test.end),
      fixture.callGraph.targetPrGate.test.exact,
    )
    assert.deepEqual(
      descriptor(
        targetFleet.source.slice(targetGate.test.start, targetGate.test.end),
      ),
      expectedDescriptor(fixture.callGraph.targetPrGate.test),
    )
    assertNode(
      baselineFleet,
      fixture.callGraph.baselineActiveUrls,
      'Target120 active URL declaration',
    )
    const baselineGate = assertNode(
      baselineFleet,
      fixture.callGraph.baselinePrGate,
      'Target120 PR gate',
    )
    assert.equal(
      baselineFleet.source.slice(baselineGate.test.start, baselineGate.test.end),
      fixture.callGraph.baselinePrGate.test.exact,
    )
    assert.equal(countOccurrences(baselineFleet.source, 'oZ4'), 0)

    const ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
          fixture.inputs.structuralLedger,
          'Target121 structural ledger',
        ),
      ),
    )
    for (const producer of fixture.callGraph.inputProducers) {
      exactBufferSlice(targetBundle, producer, producer.role)
      const region = ledger.regions.find(
        row => row.target.index === producer.targetIndex,
      )
      assert.ok(region)
      assert.equal(region.classification, producer.classification)
      assert.equal(region.baselineUnitIndex, producer.baselineUnitIndex)
      assert.equal(region.target.sourceHash, producer.sha256)
      assert.equal(region.target.coarseHash, producer.coarseHash)
    }
    const initializer = fixture.callGraph.moduleInitializer
    const initializerRegion = ledger.regions.find(
      row => row.target.index === initializer.targetIndex,
    )
    assert.ok(initializerRegion)
    assert.equal(initializerRegion.classification, initializer.classification)
    assert.equal(initializerRegion.target.sourceHash, initializer.sha256)
    assert.equal(initializerRegion.target.coarseHash, initializer.coarseHash)
    assert.equal(
      initializerRegion.unknownFreeIdentifierCount,
      initializer.unknownFreeIdentifierCount,
    )
    parseUnit(targetBundle, initializer, 'Target121 FleetView module initializer')
  },
)

test(
  'raw source authenticates FleetView and both inputs while blocking replay',
  { skip: !selected },
  () => {
    const ts = typescript()
    const baselineRoot = baselineSourceRoot()
    const targetRoot = targetSourceRoot()
    const targetIsFreshPackage =
      path.resolve(targetRoot) === path.resolve(freshPackageSourceRoot())
    const baseline = fleetViewSourceEvidence(
      ts,
      baselineRoot,
      fixture.sourceState.target120,
    )
    const target = fleetViewSourceEvidence(
      ts,
      targetRoot,
      fixture.sourceState.target121,
    )
    assert.notEqual(baseline, target)
    assert.equal(
      fixture.sourceState.target120.poll.sha256,
      fixture.sourceState.target121.poll.sha256,
    )
    reportedOwnerSourceEvidence(
      targetRoot,
      fixture.sourceState.reportedOwnerTarget121,
    )
    producerSourceEvidence(
      ts,
      targetRoot,
      fixture.sourceState.inputProducerSources.terminalFocus,
    )
    producerSourceEvidence(
      ts,
      targetRoot,
      targetIsFreshPackage
        ? fixture.sourceState.inputProducerSources.lastInteractionFresh
        : fixture.sourceState.inputProducerSources.lastInteractionTarget121,
    )
    assert.equal(
      git(path.dirname(baselineRoot), [
        'rev-parse',
        `${fixture.sourceState.target120.gitCommit}:${fixture.sourceState.path}`,
      ]),
      fixture.sourceState.target120.gitBlob,
    )
    if (!targetIsFreshPackage) {
      for (const expected of [
        {
          path: fixture.sourceState.path,
          gitBlob: fixture.sourceState.target121.gitBlob,
        },
        fixture.sourceState.reportedOwnerTarget121,
        fixture.sourceState.inputProducerSources.terminalFocus,
        fixture.sourceState.inputProducerSources.lastInteractionTarget121,
      ]) {
        assert.equal(
          git(path.dirname(targetRoot), [
            'rev-parse',
            `${fixture.sourceState.target121.gitCommit}:${expected.path}`,
          ]),
          expected.gitBlob,
        )
      }
    }
    assert.match(fixture.sourceReplayBlocker.decision, /^static complete-unit/)
    assert.equal(fixture.sourceReplayBlocker.reasons.length, 4)
  },
)

test(
  'fresh Target121 package independently preserves the FleetView blocker',
  { skip: !selected },
  t => {
    const root = freshPackageSourceRoot()
    if (!fs.existsSync(root)) {
      t.skip(`fresh Target121 package source is unavailable: ${root}`)
      return
    }
    const ts = typescript()
    const raw = fleetViewSourceEvidence(
      ts,
      targetSourceRoot(),
      fixture.sourceState.target121,
    )
    const fresh = fleetViewSourceEvidence(
      ts,
      root,
      fixture.sourceState.target121,
    )
    assert.equal(fresh, raw)
    reportedOwnerSourceEvidence(
      root,
      fixture.sourceState.reportedOwnerTarget121,
    )
    producerSourceEvidence(
      ts,
      root,
      fixture.sourceState.inputProducerSources.terminalFocus,
    )
    producerSourceEvidence(
      ts,
      root,
      fixture.sourceState.inputProducerSources.lastInteractionFresh,
    )
  },
)

test(
  'the static proof removes exactly one strict residue and is import-idempotent',
  { skip: !selected },
  async () => {
    assert.deepEqual(fixture.generatorWiring.expectedAddedOwnerImpact, {
      units: -1,
      residues: -1,
    })
    assert.deepEqual(fixture.generatorWiring.expectedRawStrictImpact, {
      units: -1,
      residues: -1,
    })
    const standalone = fixture.strictEvolution.frozenStandalone
    assert.deepEqual(
      {
        unsupportedUnits: standalone.before.unsupportedUnits - 1,
        unsupportedResidues: standalone.before.unsupportedResidues - 1,
      },
      standalone.after,
    )
    const queued = fixture.strictEvolution.queuedAfterU21925
    assert.deepEqual(
      {
        unsupportedUnits: queued.before.unsupportedUnits - 1,
        unsupportedResidues: queued.before.unsupportedResidues - 1,
      },
      queued.after,
    )
    assert.deepEqual(
      fixture.strictEvolution.queuedCumulative.after,
      queued.after,
    )
    const moduleUrl = new URL(
      '../cases/2.1.120-to-2.1.121/recovered/fleetview-pr-poll-delay-owner-overrides.mjs',
      import.meta.url,
    )
    const freshImport = await import(`${moduleUrl.href}?proof=${Date.now()}`)
    assert.deepEqual(
      freshImport.TARGET121_FLEETVIEW_PR_POLL_DELAY_OWNER_OVERRIDES,
      TARGET121_FLEETVIEW_PR_POLL_DELAY_OWNER_OVERRIDES,
    )
    assert.deepEqual(
      freshImport.TARGET121_FLEETVIEW_PR_POLL_DELAY_EVIDENCE_IDS,
      TARGET121_FLEETVIEW_PR_POLL_DELAY_EVIDENCE_IDS,
    )
  },
)
