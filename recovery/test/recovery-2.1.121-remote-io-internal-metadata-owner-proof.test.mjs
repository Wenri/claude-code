import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import * as ownerProofModule from '../cases/2.1.120-to-2.1.121/recovered/remote-io-internal-metadata-owner-overrides.mjs'

const {
  TARGET121_REMOTE_IO_INTERNAL_METADATA_EVIDENCE_IDS,
  TARGET121_REMOTE_IO_INTERNAL_METADATA_OWNER_OVERRIDES,
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
    './recovery-2.1.121-remote-io-internal-metadata-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'fd39e43ace588ec202097b7bcb032ed37dccaf0f203d27091ef02ad4fc375013'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

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
        matches.push({ coverageState, reportState })
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
    coverageBytes,
    coverageExpected:
      fixture.inputs.sourceCoverageSnapshots[states.coverageState],
    reportBytes,
  }
}

function coverageClaim(state) {
  if (state === 'postFocusedBatch') return fixture.sourceCoverageClaim
  const selectedState = fixture[state]
  assert.ok(selectedState, `source-coverage state ${state}`)
  if (selectedState.sourceCoverageClaim) return selectedState.sourceCoverageClaim
  assert.ok(selectedState.sourceCoverageProjection)
  return coverageClaim(selectedState.sourceCoverageProjection)
}

function ownerResidues(state) {
  if (state === 'postFocusedBatch') return fixture.ownerResidues
  const selectedState = fixture[state]
  assert.ok(selectedState?.ownerResidueProjection)
  return ownerResidues(selectedState.ownerResidueProjection)
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), expectedDescriptor(expected), label)
  return bytes
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

function findBundleNode(unit, expected, label) {
  const matches = []
  walk(unit.node, (node, nodePath, parent, key) => {
    if (
      node.type === expected.nodeType &&
      unit.unitStart + node.start === expected.start &&
      unit.unitStart + node.end === expected.end
    ) {
      matches.push({ node, path: nodePath.join('.'), parent, key })
    }
  })
  assert.equal(matches.length, 1, `${label}: unique node`)
  const match = matches[0]
  assert.equal(match.node.start, expected.localStart)
  assert.equal(match.node.end, expected.localEnd)
  if (expected.path !== undefined) assert.equal(match.path, expected.path)
  const raw = unit.source.slice(match.node.start, match.node.end)
  assert.deepEqual(descriptor(raw), expectedDescriptor(expected), label)
  if (expected.exact !== undefined) assert.equal(raw, expected.exact, label)
  if (expected.canonicalBytes !== undefined) {
    assert.deepEqual(canonicalDescriptor(match.node), {
      bytes: expected.canonicalBytes,
      sha256: expected.canonicalSha256,
    })
  }
  return match
}

function normalizedTokens(tokens) {
  return tokens.map(normalizedToken)
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
  return { filename, source, sourceFile, ts }
}

function assertTsNode(parsed, node, expected, label) {
  const start = node.getStart(parsed.sourceFile)
  const end = node.end
  const value = parsed.source.slice(start, end)
  const position = parsed.sourceFile.getLineAndCharacterOfPosition(start)
  assert.deepEqual(
    {
      nodeType: parsed.ts.SyntaxKind[node.kind],
      start,
      end,
      chars: value.length,
      ...descriptor(value),
      line: position.line + 1,
      column: position.character + 1,
    },
    expected,
    label,
  )
}

function gitText(args) {
  return execFileSync('git', args, {
    cwd: gitEvidenceRepositoryRoot,
    encoding: 'utf8',
  }).trim()
}

function assertGitFile(expected) {
  assert.equal(
    gitText(['rev-parse', `${expected.commit}:${expected.selectedPath}`]),
    expected.blob,
  )
}

test(
  'Target121 RemoteIO internal-metadata fixture and static override are exact',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(
      TARGET121_REMOTE_IO_INTERNAL_METADATA_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET121_REMOTE_IO_INTERNAL_METADATA_OWNER_OVERRIDES,
      [
        {
          key: `${caseName}:21913`,
          targetIndex: 21913,
          paths: [fixture.ownerResidues.correctedOwner],
          declarations: fixture.ownerResidues.declarations,
          evidenceIds: fixture.evidenceIds,
          behavior:
            TARGET121_REMOTE_IO_INTERNAL_METADATA_OWNER_OVERRIDES[0].behavior,
        },
      ],
    )
    assert.equal(
      Object.isFrozen(TARGET121_REMOTE_IO_INTERNAL_METADATA_OWNER_OVERRIDES),
      true,
    )
    assert.equal(fixture.generatorWiring.replayHelper, null)
    assert.equal(
      new Set(
        Object.values(fixture.inputs.typedReportSnapshots).map(
          snapshot => `${snapshot.bytes}/${snapshot.sha256}`,
        ),
      ).size,
      5,
      'typed report retains both prior projections and adds exact replay states',
    )
    assert.equal(
      new Set(
        Object.values(fixture.inputs.sourceCoverageSnapshots).map(
          snapshot => `${snapshot.bytes}/${snapshot.sha256}`,
        ),
      ).size,
      5,
    )
    const evolutionStates = [
      'postFocusedBatch',
      'postTail',
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
        { coverageState: state, reportState: state },
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
    assert.equal(fixture.inputs.typedReportSnapshots.postTail.projection, 'postFocusedBatch')
    assert.equal(fixture.postTail.ownerResidueProjection, 'postFocusedBatch')
    assert.equal(fixture.inputs.typedReportSnapshots.postReplay.projection, 'postTail')
    assert.equal(fixture.postReplay.ownerResidueProjection, 'postTail')
    assert.equal(fixture.postReplay.sourceCoverageProjection, 'postTail')
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
    assert.equal(fixture.postDaemonOwner.ownerResidueProjection, 'postPrune')
    assert.equal(fixture.postDaemonOwner.sourceCoverageProjection, 'postPrune')
    assert.deepEqual(Object.keys(ownerProofModule).sort(), [
      'TARGET121_REMOTE_IO_INTERNAL_METADATA_EVIDENCE_IDS',
      'TARGET121_REMOTE_IO_INTERNAL_METADATA_OWNER_OVERRIDES',
    ])
  },
)

test(
  'u21913 ledger boundary and exact report/coverage evolution are pinned',
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
        baselineUnitIndex: targetRegion.baselineUnitIndex,
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
        classification: fixture.targetUnit.classification,
        baselineUnitIndex: undefined,
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
    const baseline = ledger.unmatchedBaseline.find(
      row => row.index === fixture.baselineSemanticCounterpart.baselineUnitIndex,
    )
    assert.ok(baseline)
    assert.deepEqual(
      {
        nodeType: baseline.nodeType,
        parseStatus: baseline.parseStatus,
        start: baseline.start,
        end: baseline.end,
        tokenCount: baseline.tokenCount,
        sourceHash: baseline.sourceHash,
        coarseHash: baseline.coarseHash,
        topDefinitionCount: baseline.topDefinitionCount,
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
    const right = ledger.regions.find(
      row => row.target.index === fixture.rightBoundary.targetIndex,
    )
    assert.deepEqual(
      {
        classification: right.classification,
        baselineUnitIndex: right.baselineUnitIndex,
        pairReason: right.pairReason,
        nodeType: right.target.nodeType,
        start: right.target.start,
        end: right.target.end,
        tokenCount: right.target.tokenCount,
        sourceHash: right.target.sourceHash,
        coarseHash: right.target.coarseHash,
      },
      {
        classification: fixture.rightBoundary.classification,
        baselineUnitIndex: fixture.rightBoundary.baselineUnitIndex,
        pairReason: fixture.rightBoundary.pairReason,
        nodeType: fixture.rightBoundary.nodeType,
        start: fixture.rightBoundary.start,
        end: fixture.rightBoundary.end,
        tokenCount: fixture.rightBoundary.tokenCount,
        sourceHash: fixture.rightBoundary.sha256,
        coarseHash: fixture.rightBoundary.coarseHash,
      },
    )
    assert.equal(
      fixture.baselineSemanticCounterpart.baselineUnitIndex + 1,
      fixture.rightBoundary.baselineUnitIndex,
    )
    assert.equal(fixture.targetUnit.end, fixture.rightBoundary.start)

    const evolution = readEvolutionArtifacts()
    assertCompatibleEvolutionPair(evolution.reportState, evolution.coverageState)
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
    const strictIdentities = strictRows.map(row => [
      row.structural.index,
      row.literalKind,
      row.value,
      row.target.start,
      row.target.end,
      row.targetOccurrenceNumber,
    ])
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
    assert.deepEqual(strictIdentities, expectedOwnerResidues.strictRowsExact)
    assert.deepEqual(
      canonicalDigest(strictIdentities),
      expectedOwnerResidues.strictIdentities,
    )
    assert.equal(
      addedRows[0].value,
      'constructor',
      'constructor is the explicit occurrence-accounting row',
    )

    const expectedCoverageClaim = coverageClaim(evolution.coverageState)
    const rawCoverage = gunzipSync(evolution.coverageBytes)
    assert.deepEqual(descriptor(rawCoverage), {
      bytes: evolution.coverageExpected.rawBytes,
      sha256: evolution.coverageExpected.rawSha256,
    })
    const coverage = JSON.parse(rawCoverage)
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
      [expectedCoverageClaim.owner],
    )
  },
)

test(
  'complete initializer lineage proves the sole internal-metadata insertion',
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
    const baseline = parseUnit(
      baselineBundle,
      fixture.baselineSemanticCounterpart,
      'Target120 u21812',
    )
    const target = parseUnit(targetBundle, fixture.targetUnit, 'Target121 u21913')
    assert.equal(
      fixture.targetUnit.bytes - fixture.baselineSemanticCounterpart.bytes,
      fixture.wholeUnitLineage.rawByteDelta,
    )
    assert.equal(
      fixture.targetUnit.tokenCount -
        fixture.baselineSemanticCounterpart.tokenCount,
      fixture.wholeUnitLineage.tokenDelta,
    )
    assert.deepEqual(
      canonicalDescriptor(baseline.node),
      fixture.wholeUnitLineage.baselineCanonical,
    )
    assert.deepEqual(
      canonicalDescriptor(target.node),
      fixture.wholeUnitLineage.targetCanonical,
    )

    const callback = findBundleNode(
      target,
      fixture.wholeUnitLineage.callback,
      'internal metadata callback',
    )
    findBundleNode(
      target,
      fixture.wholeUnitLineage.previousCallback,
      'metadata callback left boundary',
    )
    findBundleNode(
      target,
      fixture.wholeUnitLineage.nextCallback,
      'metadata callback right boundary',
    )
    assert.equal(callback.parent.type, 'SequenceExpression')
    assert.equal(callback.key, 3)
    assert.equal(callback.parent.expressions.length, 5)
    assert.equal(callback.parent.expressions[callback.key], callback.node)
    exactBufferSlice(
      targetBundle,
      fixture.wholeUnitLineage.callbackInsertion,
      'callback plus delimiter',
    )

    const classExpressions = []
    walk(target.node, node => {
      if (node.type === 'ClassExpression') classExpressions.push(node)
    })
    assert.equal(classExpressions.length, 1)
    const targetClass = classExpressions[0]
    const memberNames = targetClass.body.body.map(member => member.key.name)
    assert.equal(
      targetClass.body.body.length,
      fixture.wholeUnitLineage.compiledClassSurface.memberCount,
    )
    assert.deepEqual(
      canonicalDigest(memberNames),
      fixture.wholeUnitLineage.compiledClassSurface.memberNames,
    )
    const constructor = targetClass.body.body.find(
      member => member.kind === 'constructor',
    )
    assert.equal(constructor.value.params.length, 4)
    const superCalls = []
    walk(constructor, node => {
      if (node.type === 'CallExpression' && node.callee.type === 'Super') {
        superCalls.push(node)
      }
    })
    assert.equal(superCalls.length, 1)
    assert.equal(superCalls[0].arguments.length, 3)

    const baselineTokens = normalizedTokens(baseline.tokens)
    const targetTokens = normalizedTokens(target.tokens)
    assert.deepEqual(
      canonicalDigest(baselineTokens),
      expectedDescriptor(
        fixture.wholeUnitLineage.identifierNormalizedTokens.baseline,
      ),
    )
    assert.deepEqual(
      canonicalDigest(targetTokens),
      expectedDescriptor(
        fixture.wholeUnitLineage.identifierNormalizedTokens.target,
      ),
    )
    const [prefixRun, insertionRun, suffixRun] =
      fixture.wholeUnitLineage.alignment.runs
    assert.deepEqual(targetTokens.slice(0, prefixRun[1]), baselineTokens.slice(0, prefixRun[1]))
    assert.deepEqual(
      targetTokens.slice(-suffixRun[1]),
      baselineTokens.slice(-suffixRun[1]),
    )
    assert.deepEqual(
      canonicalDigest(
        targetTokens.slice(prefixRun[1], prefixRun[1] + insertionRun[1]),
      ),
      expectedDescriptor(
        fixture.wholeUnitLineage.identifierNormalizedTokens.callbackInsertion,
      ),
    )
    assert.deepEqual(
      canonicalDigest(fixture.wholeUnitLineage.alignment.runs),
      fixture.wholeUnitLineage.alignment.runsDescriptor,
    )

    callback.parent.expressions.splice(callback.key, 1)
    assert.deepEqual(
      canonicalDescriptor(target.node),
      fixture.wholeUnitLineage.targetWithoutCallbackCanonical,
    )
    assert.deepEqual(canonicalize(target.node), canonicalize(baseline.node))
    const insertion = fixture.wholeUnitLineage.callbackInsertion
    const targetWithoutCallback =
      target.source.slice(0, insertion.localStart) +
      target.source.slice(insertion.localEnd)
    const strippedTokens = normalizedTokens([
      ...tokenizer(targetWithoutCallback, { ecmaVersion: 'latest' }),
    ])
    assert.deepEqual(
      canonicalDigest(strippedTokens),
      expectedDescriptor(
        fixture.wholeUnitLineage.identifierNormalizedTokens
          .targetWithoutCallback,
      ),
    )
    assert.deepEqual(strippedTokens, baselineTokens)
  },
)

test(
  'remoteIO source authenticates ownership and fails closed on replay architecture',
  { skip: !selected },
  () => {
    const baselineExpected = fixture.sourceState.baseline
    const targetExpected = fixture.sourceState.target
    assertGitFile(baselineExpected)
    assertGitFile(targetExpected)
    const baseline = parseTsFile(baselineExpected, baselineSourceRoot())
    const target = parseTsFile(targetExpected, targetSourceRoot())
    const targetClasses = findTsNodes(
      target.ts,
      target.sourceFile,
      node =>
        target.ts.isClassDeclaration(node) &&
        node.name?.text === fixture.sourceState.className,
    )
    assert.equal(targetClasses.length, 1)
    const targetClass = targetClasses[0]
    assertTsNode(target, targetClass, targetExpected.class, 'RemoteIO class')
    const constructor = targetClass.members.find(
      target.ts.isConstructorDeclaration,
    )
    assert.ok(constructor)
    assertTsNode(
      target,
      constructor,
      targetExpected.constructor,
      'RemoteIO constructor',
    )
    const memberNames = targetClass.members.map(member =>
      target.ts.isConstructorDeclaration(member)
        ? 'constructor'
        : member.name?.getText(target.sourceFile),
    )
    assert.equal(memberNames.includes(undefined), false)
    assert.equal(memberNames.length, targetExpected.classMemberCount)
    assert.deepEqual(canonicalDigest(memberNames), targetExpected.memberNames)
    assert.equal(constructor.parameters.length, targetExpected.constructorParameterCount)
    const superCalls = findTsNodes(
      target.ts,
      constructor,
      node =>
        target.ts.isCallExpression(node) &&
        node.expression.kind === target.ts.SyntaxKind.SuperKeyword,
    )
    assert.equal(superCalls.length, 1)
    assert.equal(superCalls[0].arguments.length, targetExpected.superArgumentCount)
    assert.equal(target.source.includes('this.sessionState'), false)
    assert.equal(memberNames.includes('flushDeliveryAcks'), false)

    let reconstructed = target.source
    for (const addition of [...fixture.sourceState.exactAdditions].reverse()) {
      const actual = reconstructed.slice(addition.start, addition.end)
      assert.equal(actual, addition.exact, addition.role)
      assert.deepEqual(descriptor(actual), expectedDescriptor(addition), addition.role)
      reconstructed =
        reconstructed.slice(0, addition.start) +
        reconstructed.slice(addition.end)
    }
    assert.deepEqual(
      { chars: reconstructed.length, ...descriptor(reconstructed) },
      fixture.sourceState.targetWithoutExactAdditions,
    )
    assert.equal(reconstructed, baseline.source)

    const dependencyBytes = readExact(
      path.join(
        repositoryRoot,
        fixture.inputs.sessionStateDependencyFixture.path,
      ),
      fixture.inputs.sessionStateDependencyFixture,
      'u21128 dependency fixture',
    )
    const dependency = JSON.parse(dependencyBytes)
    assert.equal(
      dependency.wholeClass.target.targetIndex,
      fixture.dependencyProof.fixtureTargetIndex,
    )
    const sink = dependency.runtimeConsumers.find(
      row => row.role === fixture.dependencyProof.runtimeConsumerRole,
    )
    assert.deepEqual(
      {
        targetIndex: sink.targetIndex,
        unitStart: sink.unitStart,
        unitEnd: sink.unitEnd,
        unitNodeType: sink.unitNodeType,
        unitTokenCount: sink.unitTokenCount,
        unitSha256: sink.unitSha256,
        unitCoarseHash: sink.unitCoarseHash,
        unknownFreeIdentifierCount: sink.unknownFreeIdentifierCount,
        start: sink.start,
        end: sink.end,
        bytes: sink.bytes,
        sha256: sink.sha256,
        exact: sink.exact,
      },
      {
        targetIndex: fixture.targetUnit.targetIndex,
        unitStart: fixture.targetUnit.start,
        unitEnd: fixture.targetUnit.end,
        unitNodeType: fixture.targetUnit.nodeType,
        unitTokenCount: fixture.targetUnit.tokenCount,
        unitSha256: fixture.targetUnit.sha256,
        unitCoarseHash: fixture.targetUnit.coarseHash,
        unknownFreeIdentifierCount: fixture.targetUnit.unknownFreeIdentifierCount,
        start: fixture.wholeUnitLineage.callback.start,
        end: fixture.wholeUnitLineage.callback.end,
        bytes: fixture.wholeUnitLineage.callback.bytes,
        sha256: fixture.wholeUnitLineage.callback.sha256,
        exact: fixture.wholeUnitLineage.callback.exact,
      },
    )
    assert.equal(
      dependency.sourceReplayBlocker.decision,
      fixture.dependencyProof.sourceArchitectureDecision,
    )
    const structuredExpected = dependency.sourceStates.targetStructuredIO
    const structured = parseTsFile(structuredExpected, targetSourceRoot())
    assert.equal(structured.source.includes('SessionStateManager'), false)
    const structuredClasses = findTsNodes(
      structured.ts,
      structured.sourceFile,
      node =>
        structured.ts.isClassDeclaration(node) && node.name?.text === 'StructuredIO',
    )
    assert.equal(structuredClasses.length, 1)
    const structuredConstructor = structuredClasses[0].members.find(
      structured.ts.isConstructorDeclaration,
    )
    assert.equal(
      structuredConstructor.parameters.length,
      fixture.dependencyProof.requiredStructuredIOConstructorParameters,
    )
    assert.match(fixture.sourceReplayBlocker.reason, /mixed global\/per-instance graph/)
  },
)

test(
  'u21913 predicted residue impact remains scoped to one static unit',
  { skip: !selected },
  () => {
    assert.deepEqual(fixture.generatorWiring.expectedAddedOwnerImpact, {
      units: -1,
      residues: -2,
    })
    assert.deepEqual(fixture.generatorWiring.expectedRawStrictImpact, {
      units: -1,
      residues: -1,
    })
    assert.deepEqual(
      fixture.ownerResidues.strictRowsExact.map(row => row[0]),
      [21913],
    )
  },
)
