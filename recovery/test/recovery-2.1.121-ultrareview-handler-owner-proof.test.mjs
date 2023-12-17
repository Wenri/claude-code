import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import * as ownerProofModule from '../cases/2.1.120-to-2.1.121/recovered/ultrareview-handler-owner-overrides.mjs'

const {
  applyTarget121UltrareviewTaskRegistrySourceRecovery,
  TARGET121_ULTRAREVIEW_HANDLER_EVIDENCE_IDS,
  TARGET121_ULTRAREVIEW_HANDLER_OWNER_OVERRIDES,
  TARGET121_ULTRAREVIEW_TASK_REGISTRY_REPLAY,
} = ownerProofModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const gitEvidenceRepositoryRoot = path.resolve(
  process.env.CLAUDE_CODE_2_1_121_REPOSITORY_ROOT ?? repositoryRoot,
)
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-ultrareview-handler-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '6194ec5ed5112e3a0348bb5d9fe5150741554010c80b286ecb6252de36895a05'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function canonicalDigest(value) {
  return descriptor(JSON.stringify(value))
}

function expectedDescriptor(expected) {
  return { bytes: expected.bytes, sha256: expected.sha256 }
}

function commonSnapshotPath(snapshots) {
  const paths = [...new Set(Object.values(snapshots).map(row => row.path))]
  assert.equal(paths.length, 1, 'evolution snapshots must share one path')
  return path.join(repositoryRoot, paths[0])
}

function descriptorMatches(actual, expected) {
  return Object.entries(expectedDescriptor(expected)).every(
    ([key, value]) => actual[key] === value,
  )
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

function selectEvolutionPair(reportDescriptor, coverageDescriptor) {
  const matches = []
  for (const [reportState, coverageStates] of Object.entries(
    fixture.inputs.evolutionCompatibility,
  )) {
    for (const coverageState of coverageStates) {
      if (
        descriptorMatches(
          reportDescriptor,
          fixture.inputs.typedReportSnapshots[reportState],
        ) &&
        descriptorMatches(
          coverageDescriptor,
          fixture.inputs.sourceCoverageSnapshots[coverageState],
        )
      ) {
        matches.push({ reportState, coverageState })
      }
    }
  }
  assert.equal(
    matches.length,
    1,
    `unsupported exact report/coverage pair ${reportDescriptor.bytes}/${reportDescriptor.sha256} ${coverageDescriptor.bytes}/${coverageDescriptor.sha256}`,
  )
  return matches[0]
}

function readEvolutionArtifacts() {
  const reportBytes = fs.readFileSync(
    commonSnapshotPath(fixture.inputs.typedReportSnapshots),
  )
  const coverageBytes = fs.readFileSync(
    commonSnapshotPath(fixture.inputs.sourceCoverageSnapshots),
  )
  const states = selectEvolutionPair(
    descriptor(reportBytes),
    descriptor(coverageBytes),
  )
  return {
    ...states,
    reportBytes,
    coverageBytes,
    coverageExpected:
      fixture.inputs.sourceCoverageSnapshots[states.coverageState],
  }
}

function ownerResidues(state) {
  if (state === 'preReplay') return fixture.ownerResidues
  const selectedState = fixture[state]
  if (selectedState?.ownerResidues) return selectedState.ownerResidues
  assert.ok(selectedState?.ownerResidueProjection)
  return ownerResidues(selectedState.ownerResidueProjection)
}

function coverageClaim(state) {
  if (state === 'preReplay') return fixture.sourceCoverageClaim
  const selectedState = fixture[state]
  if (selectedState?.sourceCoverageClaim) return selectedState.sourceCoverageClaim
  assert.ok(selectedState?.sourceCoverageProjection)
  return coverageClaim(selectedState.sourceCoverageProjection)
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), expectedDescriptor(expected), label)
  return bytes
}

function exactBufferSlice(bytes, expected, label) {
  const value = bytes.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(value), expectedDescriptor(expected), label)
  return value.toString('utf8')
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

function sourceFilename(root, selectedPath) {
  assert.ok(selectedPath.startsWith('src/'))
  return path.join(root, selectedPath.slice(4))
}

function walk(node, visit, currentPath = [], parent = null, key = null) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach((child, index) =>
      walk(child, visit, [...currentPath, index], parent, index),
    )
    return
  }
  if (typeof node.type === 'string') visit(node, currentPath, parent, key)
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

function normalizedTokens(tokens) {
  return tokens.map(token => [
    token.type.label,
    token.type.label === 'name' ? '@id' : (token.value ?? null),
  ])
}

function parseFunctionUnit(bundle, expected, label) {
  const source = exactBufferSlice(bundle, expected, label)
  const program = parse(source, { ecmaVersion: 'latest' })
  assert.equal(program.body.length, 1, `${label}: one complete unit`)
  const node = program.body[0]
  assert.equal(node.type, expected.nodeType)
  assert.equal(node.params.length, expected.parameterCount)
  assert.equal(node.body.body.length, expected.bodyStatementCount)
  const tokens = [...tokenizer(source, { ecmaVersion: 'latest' })]
  assert.equal(tokens.length, expected.tokenCount)
  return { node, program, source, tokens, unitStart: expected.start }
}

function findAcornNode(root, predicate, label) {
  const matches = []
  walk(root, (node, nodePath, parent, key) => {
    if (predicate(node, parent, key)) {
      matches.push({ node, parent, key, path: nodePath.join('.') })
    }
  })
  assert.equal(matches.length, 1, label)
  return matches[0]
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

function parseTsFile(expected, root) {
  const filename = sourceFilename(root, expected.selectedPath)
  const stat = fs.lstatSync(filename)
  assert.equal(stat.isSymbolicLink(), false)
  assert.equal(stat.isFile(), true)
  const bytes = readExact(filename, expected, expected.selectedPath)
  const source = bytes.toString('utf8')
  assert.equal(source.length, expected.chars)
  const ts = typescript()
  const sourceFile = ts.createSourceFile(
    expected.selectedPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, expected.selectedPath)
  return { source, sourceFile, ts }
}

function targetSourceExpectations() {
  return {
    pristine: {
      file: fixture.sourceState.target,
      function: fixture.sourceState.function,
      launchCall: {
        ...fixture.sourceState.launchCall,
        line: 204,
        column: 26,
      },
      contextProperty: fixture.sourceState.contextProperty,
      replayGapCounts: fixture.sourceState.replayGapCounts,
    },
    replayed: {
      file: fixture.sourceState.replayedTarget,
      function: fixture.sourceState.replayedTarget.function,
      launchCall: fixture.sourceState.replayedTarget.launchCall,
      contextProperty: fixture.sourceState.replayedTarget.contextProperty,
      replayGapCounts: fixture.sourceState.replayedTarget.replayGapCounts,
    },
  }
}

function parseSelectedTargetSource(root) {
  const filename = sourceFilename(root, fixture.sourceState.path)
  const stat = fs.lstatSync(filename)
  assert.equal(stat.isSymbolicLink(), false)
  assert.equal(stat.isFile(), true)
  const bytes = fs.readFileSync(filename)
  const matches = Object.entries(targetSourceExpectations()).filter(
    ([, expected]) => descriptorMatches(descriptor(bytes), expected.file),
  )
  assert.equal(
    matches.length,
    1,
    `unsupported exact Ultrareview source state ${descriptor(bytes).bytes}/${descriptor(bytes).sha256}`,
  )
  const [state, expected] = matches[0]
  const source = bytes.toString('utf8')
  assert.equal(source.length, expected.file.chars)
  const ts = typescript()
  const sourceFile = ts.createSourceFile(
    fixture.sourceState.path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, fixture.sourceState.path)
  return { state, expected, parsed: { source, sourceFile, ts } }
}

function parseLooseTsFile(filename) {
  const source = fs.readFileSync(filename, 'utf8')
  const ts = typescript()
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, filename)
  return { source, sourceFile, ts }
}

function tsNodeActual(parsed, node, extra = {}) {
  const start = node.getStart(parsed.sourceFile)
  const end = node.end
  const value = parsed.source.slice(start, end)
  const position = parsed.sourceFile.getLineAndCharacterOfPosition(start)
  return {
    nodeType: parsed.ts.SyntaxKind[node.kind],
    start,
    end,
    chars: value.length,
    ...descriptor(value),
    line: position.line + 1,
    column: position.character + 1,
    ...extra,
  }
}

function gitText(args) {
  return require('node:child_process')
    .execFileSync('git', args, {
      cwd: gitEvidenceRepositoryRoot,
      encoding: 'utf8',
    })
    .trim()
}

function assertGitFile(expected) {
  assert.equal(
    gitText(['rev-parse', `${expected.commit}:${expected.selectedPath}`]),
    expected.blob,
  )
}

function ledgerProjection(region) {
  return {
    targetIndex: region.target.index,
    baselineUnitIndex: region.baselineUnitIndex,
    classification: region.classification,
    pairReason: region.pairReason,
    unknownFreeIdentifierCount: region.unknownFreeIdentifierCount,
    nodeType: region.target.nodeType,
    start: region.target.start,
    end: region.target.end,
    tokenCount: region.target.tokenCount,
    sha256: region.target.sourceHash,
    coarseHash: region.target.coarseHash,
  }
}

function countSourceSemantics(parsed, fn) {
  const counts = new Map()
  const add = key => counts.set(key, (counts.get(key) ?? 0) + 1)
  function visit(node) {
    if (parsed.ts.isPropertyAccessExpression(node)) {
      add(`property:${node.name.text}`)
    }
    if (
      parsed.ts.isPropertyAssignment(node) ||
      parsed.ts.isShorthandPropertyAssignment(node)
    ) {
      add(`property:${node.name.getText(parsed.sourceFile)}`)
    }
    if (
      parsed.ts.isStringLiteral(node) ||
      parsed.ts.isNoSubstitutionTemplateLiteral(node)
    ) {
      add(`string:${node.text}`)
    }
    if (parsed.ts.isNumericLiteral(node)) add(`number:${node.text}`)
    parsed.ts.forEachChild(node, visit)
  }
  visit(fn)
  return Object.fromEntries(
    Object.keys(fixture.sourceState.residueSemanticCounts).map(key => [
      key,
      counts.get(key) ?? 0,
    ]),
  )
}

function copyReplayGraph(destinationRoot, sourceRoot = baselineSourceRoot()) {
  for (const owner of fixture.sourceReplayGraph.owners) {
    const source = sourceFilename(sourceRoot, owner.ownerPath)
    const destination = sourceFilename(destinationRoot, owner.ownerPath)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
  }
}

test(
  'Target121 Ultrareview fixture, owner correction, and replay exports are exact',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    const evolutionStates = [
      'preReplay',
      'postReplay',
      'postDangerous',
      'postPrune',
      'postDaemonOwner',
    ]
    for (const state of evolutionStates) {
      assert.deepEqual(
        selectEvolutionPair(
          expectedDescriptor(fixture.inputs.typedReportSnapshots[state]),
          expectedDescriptor(fixture.inputs.sourceCoverageSnapshots[state]),
        ),
        { reportState: state, coverageState: state },
      )
      const expectedClaim = coverageClaim(state)
      assert.deepEqual(
        canonicalDigest(expectedClaim.row),
        expectedClaim.rowCanonical,
      )
    }
    for (const reportState of evolutionStates) {
      for (const coverageState of evolutionStates) {
        if (reportState === coverageState) continue
        assert.throws(
          () => assertCompatibleEvolutionPair(reportState, coverageState),
          /unsupported report\/coverage hybrid/,
        )
      }
    }
    assert.throws(
      () =>
        selectEvolutionPair(
          expectedDescriptor(fixture.inputs.typedReportSnapshots.postReplay),
          {
            ...expectedDescriptor(
              fixture.inputs.sourceCoverageSnapshots.postReplay,
            ),
            bytes: fixture.inputs.sourceCoverageSnapshots.postReplay.bytes + 1,
          },
        ),
      /unsupported exact report\/coverage pair/,
    )
    assert.throws(
      () =>
        selectEvolutionPair(
          {
            ...expectedDescriptor(fixture.inputs.typedReportSnapshots.postDangerous),
            bytes: fixture.inputs.typedReportSnapshots.postDangerous.bytes + 1,
          },
          expectedDescriptor(fixture.inputs.sourceCoverageSnapshots.postDangerous),
        ),
      /unsupported exact report\/coverage pair/,
    )
    assert.equal(fixture.inputs.typedReportSnapshots.postDangerous.projection, 'postReplay')
    assert.equal(fixture.inputs.sourceCoverageSnapshots.postDangerous.projection, 'postReplay')
    assert.equal(fixture.postDangerous.ownerResidueProjection, 'postReplay')
    assert.equal(fixture.postDangerous.sourceCoverageProjection, 'postReplay')
    assert.equal(fixture.inputs.typedReportSnapshots.postPrune.projection, 'postDangerous')
    assert.equal(fixture.inputs.sourceCoverageSnapshots.postPrune.projection, 'postDangerous')
    assert.equal(fixture.postPrune.ownerResidueProjection, 'postDangerous')
    assert.equal(fixture.postPrune.sourceCoverageProjection, 'postDangerous')
    assert.equal(fixture.inputs.typedReportSnapshots.postDaemonOwner.projection, 'postPrune')
    assert.equal(fixture.inputs.sourceCoverageSnapshots.postDaemonOwner.projection, 'postPrune')
    assert.deepEqual(
      [
        fixture.postDaemonOwner.ownerResidues.totalRows,
        fixture.postDaemonOwner.ownerResidues.targetAddedRows,
        fixture.postDaemonOwner.ownerResidues.strictRows,
      ],
      [1, 0, 0],
    )
    assert.equal(fixture.postDaemonOwner.sourceCoverageProjection, 'postPrune')
    assert.deepEqual(
      TARGET121_ULTRAREVIEW_HANDLER_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(TARGET121_ULTRAREVIEW_HANDLER_OWNER_OVERRIDES, [
      {
        key: `${caseName}:22067`,
        targetIndex: 22067,
        paths: [fixture.ownerResidues.correctedOwner],
        declarations: fixture.ownerResidues.declarations,
        evidenceIds: fixture.evidenceIds,
        behavior: TARGET121_ULTRAREVIEW_HANDLER_OWNER_OVERRIDES[0].behavior,
      },
    ])
    assert.deepEqual(
      TARGET121_ULTRAREVIEW_TASK_REGISTRY_REPLAY.owners.map(owner => ({
        ownerPath: owner.ownerPath,
        role: owner.role,
        preimage: owner.preimage,
        postimage: owner.postimage,
      })),
      fixture.sourceReplayGraph.owners,
    )
    assert.equal(
      TARGET121_ULTRAREVIEW_TASK_REGISTRY_REPLAY.targetIndex,
      fixture.targetUnit.targetIndex,
    )
    assert.deepEqual(Object.keys(ownerProofModule).sort(), [
      'TARGET121_ULTRAREVIEW_HANDLER_EVIDENCE_IDS',
      'TARGET121_ULTRAREVIEW_HANDLER_OWNER_OVERRIDES',
      'TARGET121_ULTRAREVIEW_TASK_REGISTRY_REPLAY',
      'applyTarget121UltrareviewTaskRegistrySourceRecovery',
    ])
    assert.deepEqual(fixture.generatorWiring.expectedAddedOwnerImpact, {
      units: -1,
      residues: -13,
    })
    assert.deepEqual(fixture.generatorWiring.expectedRawStrictImpact, {
      units: 0,
      residues: 0,
    })
  },
)

test(
  'u22067 ledger boundaries, exact owner partitions, and frozen coverage are pinned',
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
    const target = ledger.regions.find(
      row => row.target.index === fixture.targetUnit.targetIndex,
    )
    assert.deepEqual(ledgerProjection(target), {
      targetIndex: fixture.targetUnit.targetIndex,
      baselineUnitIndex: fixture.targetUnit.baselineUnitIndex,
      classification: fixture.targetUnit.classification,
      pairReason: fixture.targetUnit.pairReason,
      unknownFreeIdentifierCount: fixture.targetUnit.unknownFreeIdentifierCount,
      nodeType: fixture.targetUnit.nodeType,
      start: fixture.targetUnit.start,
      end: fixture.targetUnit.end,
      tokenCount: fixture.targetUnit.tokenCount,
      sha256: fixture.targetUnit.sha256,
      coarseHash: fixture.targetUnit.coarseHash,
    })
    for (const expected of [
      fixture.adjacentCohesion.left,
      fixture.adjacentCohesion.right,
      fixture.adjacentCohesion.nextHelper,
    ]) {
      const actual = ledger.regions.find(
        row => row.target.index === expected.targetIndex,
      )
      const projected = ledgerProjection(actual)
      delete projected.unknownFreeIdentifierCount
      assert.deepEqual(projected, expected)
    }
    assert.equal(fixture.adjacentCohesion.left.end, fixture.targetUnit.start)
    assert.equal(fixture.adjacentCohesion.right.start, fixture.targetUnit.end)
    const producer = ledger.regions.find(
      row =>
        row.target.index === fixture.compiledReplayGraph.producer.target.targetIndex,
    )
    const {
      binding: _producerBinding,
      bytes: _producerBytes,
      ...producerLedgerExpected
    } = fixture.compiledReplayGraph.producer.target
    assert.deepEqual(ledgerProjection(producer), producerLedgerExpected)

    const evolution = readEvolutionArtifacts()
    assertCompatibleEvolutionPair(
      evolution.reportState,
      evolution.coverageState,
    )
    const report = JSON.parse(evolution.reportBytes)
    const expectedOwnerResidues = ownerResidues(evolution.reportState)
    const ownerRows = report.sourceRuntimeOwnerResidueRows.filter(
      row => row.structural.index === fixture.targetUnit.targetIndex,
    )
    const addedRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
      row => row.structural.index === fixture.targetUnit.targetIndex,
    )
    const strictRows = report.rows.filter(
      row => row.structural.index === fixture.targetUnit.targetIndex,
    )
    assert.deepEqual(
      [ownerRows.length, addedRows.length, strictRows.length],
      [
        expectedOwnerResidues.totalRows,
        expectedOwnerResidues.targetAddedRows,
        expectedOwnerResidues.strictRows,
      ],
    )
    assert.ok(
      ownerRows.every(
        row =>
          JSON.stringify(row.ownerPaths) ===
            JSON.stringify([expectedOwnerResidues.reportedOwner]) &&
          row.ownerSourceMatches.length === 0,
      ),
    )
    const identity = row => [
      row.literalKind,
      row.value,
      row.target.start,
      row.target.end,
      row.baselineOccurrenceCount,
      row.targetOccurrenceNumber,
      row.targetAdded,
    ]
    const ownerIdentities = ownerRows.map(identity)
    const addedIdentities = addedRows.map(identity)
    assert.deepEqual(
      canonicalDigest(ownerIdentities),
      expectedOwnerResidues.rowIdentities,
    )
    assert.deepEqual(
      canonicalDigest(
        ownerRows.map((row, index) => [
          ...ownerIdentities[index],
          row.ownerPaths,
          row.ownerSourceMatches,
        ]),
      ),
      expectedOwnerResidues.ownerIdentities,
    )
    assert.deepEqual(
      addedIdentities,
      expectedOwnerResidues.targetAddedRowsExact,
    )
    assert.deepEqual(
      canonicalDigest(addedIdentities),
      expectedOwnerResidues.targetAddedIdentities,
    )
    assert.deepEqual(
      canonicalDigest(strictRows),
      expectedOwnerResidues.strictIdentities,
    )
    if (evolution.reportState === 'postReplay') {
      assert.deepEqual(fixture.postReplay.partitionDelta, {
        removedOwnerRows:
          fixture.ownerResidues.totalRows - expectedOwnerResidues.totalRows,
        removedAddedOwnerRows:
          fixture.ownerResidues.targetAddedRows -
          expectedOwnerResidues.targetAddedRows,
        removedStrictRows:
          fixture.ownerResidues.strictRows - expectedOwnerResidues.strictRows,
      })
      assert.equal(fixture.postReplay.partitionDelta.removedAddedOwnerRows, 13)
    }

    const expectedCoverageClaim = coverageClaim(evolution.coverageState)
    const raw = gunzipSync(evolution.coverageBytes)
    assert.deepEqual(descriptor(raw), {
      bytes: evolution.coverageExpected.rawBytes,
      sha256: evolution.coverageExpected.rawSha256,
    })
    const coverage = JSON.parse(raw)
    const rows = coverage.rows.filter(
      row => row.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert.deepEqual(rows, [expectedCoverageClaim.row])
    assert.deepEqual(
      canonicalDigest(rows[0]),
      expectedCoverageClaim.rowCanonical,
    )
    assert.deepEqual(
      coverage.owners.filter(owner => rows[0].ownerIds.includes(owner.id)),
      [expectedCoverageClaim.reportedOwner],
    )
    if (evolution.coverageState === 'preReplay') {
      assert.notEqual(
        expectedCoverageClaim.reportedOwner.path,
        fixture.ownerResidues.correctedOwner,
      )
    } else {
      assert.equal(
        expectedCoverageClaim.reportedOwner.path,
        fixture.ownerResidues.correctedOwner,
      )
    }
  },
)

test(
  'complete predecessor and target functions prove all 13 rows are local invariants',
  { skip: !selected },
  () => {
    const baselineBundle = readExact(
      artifactPath(
        'CLAUDE_CODE_2_1_120_INNER_BUNDLE',
        fixture.inputs.baselineBundle,
      ),
      fixture.inputs.baselineBundle,
      'Target120 bundle',
    )
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_121_INNER_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'Target121 bundle',
    )
    const baseline = parseFunctionUnit(
      baselineBundle,
      fixture.baselineSemanticCounterpart,
      'Target120 u21966',
    )
    const target = parseFunctionUnit(
      targetBundle,
      fixture.targetUnit,
      'Target121 u22067',
    )
    assert.equal(target.source.length, baseline.source.length)
    assert.deepEqual(
      canonicalDescriptor(baseline.node),
      fixture.wholeUnitEquivalence.baselineCanonical,
    )
    assert.deepEqual(
      canonicalDescriptor(target.node),
      fixture.wholeUnitEquivalence.targetCanonical,
    )
    assert.deepEqual(canonicalize(target.node), canonicalize(baseline.node))
    const baselineTokens = normalizedTokens(baseline.tokens)
    const targetTokens = normalizedTokens(target.tokens)
    assert.deepEqual(
      canonicalDigest(baselineTokens),
      expectedDescriptor(
        fixture.wholeUnitEquivalence.identifierNormalizedTokens.baseline,
      ),
    )
    assert.deepEqual(
      canonicalDigest(targetTokens),
      expectedDescriptor(
        fixture.wholeUnitEquivalence.identifierNormalizedTokens.target,
      ),
    )
    assert.deepEqual(targetTokens, baselineTokens)

    assert.equal(
      fixture.ownerResidues.targetAddedRowsExact.length,
      fixture.wholeUnitEquivalence.localInvariantNodes.length,
    )
    for (let index = 0; index < fixture.ownerResidues.targetAddedRowsExact.length; index++) {
      const row = fixture.ownerResidues.targetAddedRowsExact[index]
      const expected = fixture.wholeUnitEquivalence.localInvariantNodes[index]
      const [kind, value, absoluteStart, absoluteEnd] = row
      assert.deepEqual([kind, value], [expected.kind, expected.value])
      assert.deepEqual(
        [
          absoluteStart - fixture.targetUnit.start,
          absoluteEnd - fixture.targetUnit.start,
        ],
        [expected.localStart, expected.localEnd],
      )
      const targetRaw = target.source.slice(expected.localStart, expected.localEnd)
      const baselineRaw = baseline.source.slice(
        expected.localStart,
        expected.localEnd,
      )
      assert.equal(targetRaw, baselineRaw, `${kind}:${value}`)
      assert.equal(
        targetRaw,
        kind === 'string' ? JSON.stringify(value) : value,
        `${kind}:${value}`,
      )
      for (const unit of [baseline, target]) {
        const match = findAcornNode(
          unit.node,
          node =>
            node.type === expected.nodeType &&
            node.start === expected.localStart &&
            node.end === expected.localEnd,
          `${kind}:${value}: unique AST node`,
        )
        assert.equal(match.path, expected.path)
        if (expected.nodeType === 'Identifier') {
          assert.equal(match.node.name, value)
        } else if (kind === 'number') {
          assert.equal(match.node.value, Number(value))
        } else {
          assert.equal(match.node.value, value)
        }
      }
    }
  },
)

test(
  'exact Ultrareview sources authenticate the true owner and all 13 semantics',
  { skip: !selected },
  () => {
    assertGitFile(fixture.sourceState.baseline)
    assertGitFile(fixture.sourceState.target)
    const baseline = parseTsFile(fixture.sourceState.baseline, baselineSourceRoot())
    const selectedTarget = parseSelectedTargetSource(targetSourceRoot())
    const pristine = targetSourceExpectations().pristine
    if (selectedTarget.state === 'pristine') {
      assert.equal(selectedTarget.parsed.source, baseline.source)
    } else {
      assert.notEqual(selectedTarget.parsed.source, baseline.source)
      assert.equal(selectedTarget.state, 'replayed')
    }
    for (const { parsed, expected } of [
      { parsed: baseline, expected: pristine },
      { parsed: selectedTarget.parsed, expected: selectedTarget.expected },
    ]) {
      const functions = findTsNodes(
        parsed.ts,
        parsed.sourceFile,
        node =>
          parsed.ts.isFunctionDeclaration(node) &&
          node.name?.text === fixture.sourceState.declaration,
      )
      assert.equal(functions.length, 1)
      const fn = functions[0]
      assert.deepEqual(
        tsNodeActual(parsed, fn, {
          parameterCount: fn.parameters.length,
          bodyStatementCount: fn.body.statements.length,
        }),
        expected.function,
      )
      assert.deepEqual(
        countSourceSemantics(parsed, fn),
        fixture.sourceState.residueSemanticCounts,
      )
      const calls = findTsNodes(
        parsed.ts,
        fn,
        node =>
          parsed.ts.isCallExpression(node) &&
          node.expression.getText(parsed.sourceFile) === 'launchUltrareview',
      )
      assert.equal(calls.length, 1)
      assert.deepEqual(
        tsNodeActual(parsed, calls[0]),
        {
          nodeType: 'CallExpression',
          ...expected.launchCall,
        },
      )
      const options = calls[0].arguments[1]
      assert.ok(parsed.ts.isObjectLiteralExpression(options))
      const context = options.properties.find(
        property => property.name?.getText(parsed.sourceFile) === 'context',
      )
      assert.ok(parsed.ts.isPropertyAssignment(context))
      const start = context.getStart(parsed.sourceFile)
      const raw = parsed.source.slice(start, context.end)
      assert.deepEqual(
        {
          start,
          end: context.end,
          chars: raw.length,
          ...descriptor(raw),
          exact: raw,
          propertyNames: context.initializer.properties.map(property =>
            property.name.getText(parsed.sourceFile),
          ),
        },
        expected.contextProperty,
      )
      assert.deepEqual(
        Object.fromEntries(
          Object.keys(expected.replayGapCounts).map(marker => [
            marker,
            parsed.source.split(marker).length - 1,
          ]),
        ),
        expected.replayGapCounts,
      )
    }
    assert.equal(fixture.sourceState.baseline.blob, fixture.sourceState.target.blob)

    const agentsSource = fs.readFileSync(
      sourceFilename(targetSourceRoot(), 'src/cli/handlers/agents.ts'),
      'utf8',
    )
    for (const marker of [
      'ultrareviewHandler',
      'allow_remote_sessions',
      'launchUltrareview',
    ]) {
      assert.equal(agentsSource.includes(marker), false, marker)
    }
  },
)

test(
  'compiled producer and handler consumer close the no-op task-registry edge',
  { skip: !selected },
  () => {
    const baselineBundle = readExact(
      artifactPath(
        'CLAUDE_CODE_2_1_120_INNER_BUNDLE',
        fixture.inputs.baselineBundle,
      ),
      fixture.inputs.baselineBundle,
    )
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_121_INNER_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
    )
    const producerPairs = [
      [
        baselineBundle,
        fixture.compiledReplayGraph.producer.baseline,
        fixture.compiledReplayGraph.consumer.baseline,
        fixture.baselineSemanticCounterpart,
      ],
      [
        targetBundle,
        fixture.compiledReplayGraph.producer.target,
        fixture.compiledReplayGraph.consumer.target,
        fixture.targetUnit,
      ],
    ]
    const producerPrograms = []
    for (const [bundle, producerExpected, consumerExpected, unitExpected] of producerPairs) {
      const producerSource = exactBufferSlice(
        bundle,
        producerExpected,
        `${producerExpected.binding} producer`,
      )
      const producerProgram = parse(producerSource, { ecmaVersion: 'latest' })
      producerPrograms.push(producerProgram)
      assert.equal(
        [...tokenizer(producerSource, { ecmaVersion: 'latest' })].length,
        producerExpected.tokenCount,
      )
      const object = findAcornNode(
        producerProgram,
        node =>
          node.type === 'ObjectExpression' &&
          node.properties.map(property => property.key?.name).join(',') ===
            fixture.compiledReplayGraph.producer.objectExpression.propertyNames.join(','),
        `${producerExpected.binding}: exact no-op producer`,
      )
      const objectRaw = producerSource.slice(object.node.start, object.node.end)
      assert.deepEqual(
        {
          localStart: object.node.start,
          localEnd: object.node.end,
          ...descriptor(objectRaw),
          propertyNames: object.node.properties.map(property => property.key.name),
        },
        fixture.compiledReplayGraph.producer.objectExpression,
      )
      assert.equal(object.parent.type, 'AssignmentExpression')
      assert.equal(object.parent.left.name, producerExpected.binding)

      const consumerSource = exactBufferSlice(bundle, unitExpected, 'consumer unit')
      const consumerProgram = parse(consumerSource, { ecmaVersion: 'latest' })
      const call = findAcornNode(
        consumerProgram,
        node =>
          node.type === 'CallExpression' &&
          node.arguments[1]?.type === 'ObjectExpression' &&
          node.arguments[1].properties.some(
            property => property.key?.name === 'skipTaskRegistration',
          ),
        'unique Ultrareview launch consumer',
      )
      assert.equal(call.path, fixture.compiledReplayGraph.consumer.callPath)
      assert.deepEqual(
        [call.node.start, call.node.end],
        [
          fixture.compiledReplayGraph.consumer.localStart,
          fixture.compiledReplayGraph.consumer.localEnd,
        ],
      )
      assert.deepEqual(
        descriptor(consumerSource.slice(call.node.start, call.node.end)),
        consumerExpected.call,
      )
      const options = call.node.arguments[1]
      assert.deepEqual(
        options.properties.map(property => property.key.name),
        fixture.compiledReplayGraph.consumer.optionPropertyNames,
      )
      const context = options.properties.find(
        property => property.key.name === 'context',
      )
      assert.deepEqual(
        context.value.properties.map(property => property.key.name),
        fixture.compiledReplayGraph.consumer.contextPropertyNames,
      )
      assert.deepEqual(
        descriptor(consumerSource.slice(context.start, context.end)),
        consumerExpected.context,
      )
      const taskRegistry = context.value.properties[1]
      assert.deepEqual(
        {
          localStart: taskRegistry.start,
          localEnd: taskRegistry.end,
          ...descriptor(
            consumerSource.slice(taskRegistry.start, taskRegistry.end),
          ),
          binding: taskRegistry.value.name,
        },
        consumerExpected.taskRegistry,
      )
      assert.equal(taskRegistry.value.name, producerExpected.binding)
    }
    assert.deepEqual(
      canonicalize(producerPrograms[0]),
      canonicalize(producerPrograms[1]),
    )
  },
)

test(
  'two-owner source replay is graph-closed, transactional, and idempotent',
  { skip: !selected },
  () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target121-ultrareview-closed-replay-'),
    )
    const invalidRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target121-ultrareview-invalid-replay-'),
    )
    try {
      copyReplayGraph(temporaryRoot)
      assert.deepEqual(
        applyTarget121UltrareviewTaskRegistrySourceRecovery({
          sourceRoot: temporaryRoot,
        }),
        {
          status: 'recovered',
          files: fixture.sourceReplayGraph.owners.map(owner => owner.ownerPath),
        },
      )
      for (const owner of fixture.sourceReplayGraph.owners) {
        readExact(
          sourceFilename(temporaryRoot, owner.ownerPath),
          owner.postimage,
          `${owner.role} postimage`,
        )
      }

      const framework = parseLooseTsFile(
        sourceFilename(temporaryRoot, 'src/utils/task/framework.ts'),
      )
      const declarations = findTsNodes(
        framework.ts,
        framework.sourceFile,
        node =>
          framework.ts.isVariableDeclaration(node) &&
          node.name.getText(framework.sourceFile) === 'NOOP_TASK_REGISTRY',
      )
      assert.equal(declarations.length, 1)
      assert.deepEqual(
        tsNodeActual(framework, declarations[0]),
        fixture.sourceReplayGraph.postimageAst.producerDeclaration,
      )
      const producerObject = declarations[0].initializer
      assert.ok(framework.ts.isObjectLiteralExpression(producerObject))
      assert.deepEqual(
        producerObject.properties.map(property =>
          property.name.getText(framework.sourceFile),
        ),
        fixture.compiledReplayGraph.producer.objectExpression.propertyNames,
      )

      const ultrareview = parseLooseTsFile(
        sourceFilename(temporaryRoot, fixture.sourceState.path),
      )
      const imports = findTsNodes(
        ultrareview.ts,
        ultrareview.sourceFile,
        node =>
          ultrareview.ts.isImportDeclaration(node) &&
          node.moduleSpecifier.text === '../../utils/task/framework.js',
      )
      assert.equal(imports.length, 1)
      assert.deepEqual(
        tsNodeActual(ultrareview, imports[0]),
        fixture.sourceReplayGraph.postimageAst.consumerImport,
      )
      const handlers = findTsNodes(
        ultrareview.ts,
        ultrareview.sourceFile,
        node =>
          ultrareview.ts.isFunctionDeclaration(node) &&
          node.name?.text === fixture.sourceState.declaration,
      )
      assert.equal(handlers.length, 1)
      assert.deepEqual(
        tsNodeActual(ultrareview, handlers[0]),
        fixture.sourceReplayGraph.postimageAst.consumerFunction,
      )
      const taskRegistryProperties = findTsNodes(
        ultrareview.ts,
        handlers[0],
        node =>
          ultrareview.ts.isPropertyAssignment(node) &&
          node.name.getText(ultrareview.sourceFile) === 'taskRegistry',
      )
      assert.equal(taskRegistryProperties.length, 1)
      assert.equal(
        taskRegistryProperties[0].initializer.getText(ultrareview.sourceFile),
        'NOOP_TASK_REGISTRY',
      )
      assert.deepEqual(
        applyTarget121UltrareviewTaskRegistrySourceRecovery({
          sourceRoot: temporaryRoot,
        }),
        { status: 'already-recovered', files: [] },
      )

      const consumer = fixture.sourceReplayGraph.owners.find(
        owner => owner.role === 'consumer',
      )
      fs.copyFileSync(
        sourceFilename(baselineSourceRoot(), consumer.ownerPath),
        sourceFilename(temporaryRoot, consumer.ownerPath),
      )
      assert.deepEqual(
        applyTarget121UltrareviewTaskRegistrySourceRecovery({
          sourceRoot: temporaryRoot,
        }),
        { status: 'recovered', files: [consumer.ownerPath] },
      )

      copyReplayGraph(invalidRoot)
      const invalidConsumer = sourceFilename(invalidRoot, consumer.ownerPath)
      fs.writeFileSync(
        invalidConsumer,
        Buffer.concat([fs.readFileSync(invalidConsumer), Buffer.from('\n')]),
      )
      assert.throws(
        () =>
          applyTarget121UltrareviewTaskRegistrySourceRecovery({
            sourceRoot: invalidRoot,
          }),
        /requires its exact raw or recovered state/,
      )
      const producer = fixture.sourceReplayGraph.owners.find(
        owner => owner.role === 'producer',
      )
      readExact(
        sourceFilename(invalidRoot, producer.ownerPath),
        producer.preimage,
        'failed graph validation writes no producer',
      )
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true })
      fs.rmSync(invalidRoot, { recursive: true })
    }
  },
)
