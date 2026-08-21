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
import * as ownerProofModule from '../cases/2.1.120-to-2.1.121/recovered/headless-restored-task-clear-owner-overrides.mjs'

const {
  TARGET121_HEADLESS_RESTORED_TASK_CLEAR_EVIDENCE_IDS,
  TARGET121_HEADLESS_RESTORED_TASK_CLEAR_OWNER_OVERRIDES,
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
    './recovery-2.1.121-headless-restored-task-clear-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'c1bc3e2411719bfd8219e2acaa8163fa3540c6092ab83934ed958a9b1bd204e5'

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

function parseUnit(bundle, expected, label) {
  const source = exactBufferSlice(bundle, expected, label)
  const program = parse(source, { ecmaVersion: 'latest' })
  assert.equal(program.body.length, 1, `${label}: one unit`)
  const node = program.body[0]
  assert.equal(node.type, expected.nodeType)
  assert.equal(node.params.length, expected.parameterCount)
  assert.equal(node.body.body.length, expected.bodyStatementCount)
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
  assert.equal(matches.length, 1, `${label}: unique AST node`)
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
  'Target121 headless restored-task fixture and static override are exact',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.deepEqual(
      TARGET121_HEADLESS_RESTORED_TASK_CLEAR_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET121_HEADLESS_RESTORED_TASK_CLEAR_OWNER_OVERRIDES,
      [
        {
          key: `${caseName}:21958`,
          targetIndex: 21958,
          paths: [fixture.ownerResidues.correctedOwner],
          declarations: fixture.ownerResidues.declarations,
          evidenceIds: fixture.evidenceIds,
          behavior:
            TARGET121_HEADLESS_RESTORED_TASK_CLEAR_OWNER_OVERRIDES[0].behavior,
        },
      ],
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
      'TARGET121_HEADLESS_RESTORED_TASK_CLEAR_EVIDENCE_IDS',
      'TARGET121_HEADLESS_RESTORED_TASK_CLEAR_OWNER_OVERRIDES',
    ])
  },
)

test(
  'u21958 ledger boundary and exact report/coverage evolution are pinned',
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
    assert.deepEqual(
      {
        classification: target.classification,
        baselineUnitIndex: target.baselineUnitIndex,
        nodeType: target.target.nodeType,
        parseStatus: target.target.parseStatus,
        start: target.target.start,
        end: target.target.end,
        tokenCount: target.target.tokenCount,
        sourceHash: target.target.sourceHash,
        coarseHash: target.target.coarseHash,
        topDefinitionCount: target.target.topDefinitionCount,
        unknownFreeIdentifierCount: target.unknownFreeIdentifierCount,
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
    const left = ledger.regions.find(
      row => row.target.index === fixture.leftBoundary.targetIndex,
    )
    assert.deepEqual(
      {
        classification: left.classification,
        baselineUnitIndex: left.baselineUnitIndex,
        pairReason: left.pairReason,
        nodeType: left.target.nodeType,
        start: left.target.start,
        end: left.target.end,
        tokenCount: left.target.tokenCount,
        sourceHash: left.target.sourceHash,
        coarseHash: left.target.coarseHash,
      },
      {
        classification: fixture.leftBoundary.classification,
        baselineUnitIndex: fixture.leftBoundary.baselineUnitIndex,
        pairReason: fixture.leftBoundary.pairReason,
        nodeType: fixture.leftBoundary.nodeType,
        start: fixture.leftBoundary.start,
        end: fixture.leftBoundary.end,
        tokenCount: fixture.leftBoundary.tokenCount,
        sourceHash: fixture.leftBoundary.sha256,
        coarseHash: fixture.leftBoundary.coarseHash,
      },
    )
    assert.equal(fixture.leftBoundary.end, fixture.targetUnit.start)
    assert.equal(
      fixture.leftBoundary.baselineUnitIndex + 1,
      fixture.baselineSemanticCounterpart.baselineUnitIndex,
    )

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
    assert.deepEqual(canonicalDigest(ownerIdentities), expectedOwnerResidues.rowIdentities)
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
    assert.deepEqual(addedIdentities, expectedOwnerResidues.targetAddedRowsExact)
    assert.deepEqual(
      canonicalDigest(addedIdentities),
      expectedOwnerResidues.targetAddedIdentities,
    )
    assert.deepEqual(strictIdentities, expectedOwnerResidues.strictRowsExact)
    assert.deepEqual(
      canonicalDigest(strictIdentities),
      expectedOwnerResidues.strictIdentities,
    )

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
    assert.deepEqual(canonicalDigest(rows[0]), expectedCoverageClaim.rowCanonical)
    assert.deepEqual(
      coverage.owners.filter(owner => rows[0].ownerIds.includes(owner.id)),
      [expectedCoverageClaim.owner],
    )
  },
)

test(
  'complete runHeadless lineage proves one contiguous restart-recovery block',
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
      'Target120 u21857',
    )
    const target = parseUnit(targetBundle, fixture.targetUnit, 'Target121 u21958')
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
    const block = findBundleNode(
      target,
      fixture.wholeUnitLineage.recoveryBlock,
      'recovery block',
    )
    const clear = findBundleNode(
      target,
      fixture.wholeUnitLineage.clearCall,
      'internal metadata clear',
    )
    findBundleNode(
      target,
      fixture.wholeUnitLineage.previousStatement,
      'left statement boundary',
    )
    findBundleNode(
      target,
      fixture.wholeUnitLineage.nextStatement,
      'right statement boundary',
    )
    assert.equal(block.parent.type, 'BlockStatement')
    assert.equal(block.key, fixture.wholeUnitLineage.recoveryBlock.statementIndex)
    assert.equal(clear.parent.type, 'SequenceExpression')
    assert.equal(clear.key, 2)
    assert.ok(
      target.source
        .slice(block.node.start, block.node.end)
        .includes('CLAUDE_CODE_RESUME_INTERRUPTED_TURN'),
    )
    assert.equal(clear.node.arguments[0].properties[0].key.name, 'running_background_tasks')
    assert.equal(clear.node.arguments[0].properties[0].value.elements.length, 0)

    const baselineTokens = normalizedTokens(baseline.tokens)
    const targetTokens = normalizedTokens(target.tokens)
    assert.deepEqual(
      canonicalDigest(baselineTokens),
      expectedDescriptor(fixture.wholeUnitLineage.identifierNormalizedTokens.baseline),
    )
    assert.deepEqual(
      canonicalDigest(targetTokens),
      expectedDescriptor(fixture.wholeUnitLineage.identifierNormalizedTokens.target),
    )
    const [prefix, insertion, suffix] = fixture.wholeUnitLineage.alignment.runs
    assert.deepEqual(targetTokens.slice(0, prefix[1]), baselineTokens.slice(0, prefix[1]))
    assert.deepEqual(targetTokens.slice(-suffix[1]), baselineTokens.slice(-suffix[1]))
    assert.deepEqual(
      canonicalDigest(targetTokens.slice(prefix[1], prefix[1] + insertion[1])),
      expectedDescriptor(
        fixture.wholeUnitLineage.identifierNormalizedTokens.recoveryBlock,
      ),
    )
    assert.deepEqual(
      canonicalDigest(fixture.wholeUnitLineage.alignment.runs),
      fixture.wholeUnitLineage.alignment.runsDescriptor,
    )

    block.parent.body.splice(block.key, 1)
    assert.deepEqual(
      canonicalDescriptor(target.node),
      fixture.wholeUnitLineage.targetWithoutRecoveryBlockCanonical,
    )
    assert.deepEqual(canonicalize(target.node), canonicalize(baseline.node))
    const expected = fixture.wholeUnitLineage.recoveryBlock
    const strippedSource =
      target.source.slice(0, expected.localStart) +
      target.source.slice(expected.localEnd)
    const strippedTokens = normalizedTokens([
      ...tokenizer(strippedSource, { ecmaVersion: 'latest' }),
    ])
    assert.deepEqual(
      canonicalDigest(strippedTokens),
      expectedDescriptor(
        fixture.wholeUnitLineage.identifierNormalizedTokens
          .targetWithoutRecoveryBlock,
      ),
    )
    assert.deepEqual(strippedTokens, baselineTokens)
  },
)

test(
  'print source authenticates the recovery semantics and fails closed on replay',
  { skip: !selected },
  () => {
    assertGitFile(fixture.sourceState.baseline)
    assertGitFile(fixture.sourceState.target)
    const baseline = parseTsFile(fixture.sourceState.baseline, baselineSourceRoot())
    const target = parseTsFile(fixture.sourceState.target, targetSourceRoot())
    const functionFor = parsed => {
      const matches = findTsNodes(
        parsed.ts,
        parsed.sourceFile,
        node =>
          parsed.ts.isFunctionDeclaration(node) &&
          node.name?.text === fixture.sourceState.functionName,
      )
      assert.equal(matches.length, 1)
      return matches[0]
    }
    const baselineFunction = functionFor(baseline)
    const targetFunction = functionFor(target)
    for (const [parsed, node, expected] of [
      [baseline, baselineFunction, fixture.sourceState.baseline.runHeadless],
      [target, targetFunction, fixture.sourceState.target.runHeadless],
    ]) {
      assert.deepEqual(
        tsNodeActual(parsed, node, {
          parameterCount: node.parameters.length,
          bodyStatementCount: node.body.statements.length,
        }),
        expected,
      )
    }
    const sourceBlock = targetFunction.body.statements[
      fixture.sourceState.recoveryBlock.statementIndex
    ]
    assert.equal(target.ts.isIfStatement(sourceBlock), true)
    assert.deepEqual(
      tsNodeActual(target, sourceBlock),
      Object.fromEntries(
        Object.entries(fixture.sourceState.recoveryBlock).filter(
          ([key]) => key !== 'statementIndex',
        ),
      ),
    )
    const clearCalls = findTsNodes(
      target.ts,
      sourceBlock,
      node =>
        target.ts.isCallExpression(node) &&
        node.expression.getText(target.sourceFile) ===
          'notifySessionInternalMetadataChanged',
    )
    assert.equal(clearCalls.length, 1)
    const { exact, ...clearExpected } = fixture.sourceState.clearCall
    assert.deepEqual(tsNodeActual(target, clearCalls[0]), clearExpected)
    assert.equal(clearCalls[0].getText(target.sourceFile), exact)
    assert.equal(clearCalls[0].arguments.length, 1)
    assert.equal(target.ts.isObjectLiteralExpression(clearCalls[0].arguments[0]), true)
    assert.equal(
      clearCalls[0].arguments[0].properties[0].name.getText(target.sourceFile),
      'running_background_tasks',
    )
    assert.equal(
      target.ts.isArrayLiteralExpression(
        clearCalls[0].arguments[0].properties[0].initializer,
      ),
      true,
    )
    assert.deepEqual(
      {
        orphanedBackgroundTaskReminder: countOccurrences(
          baseline.source,
          'orphaned background task(s) after restart',
        ),
        notifySessionInternalMetadataChanged: countOccurrences(
          baseline.source,
          'notifySessionInternalMetadataChanged',
        ),
      },
      fixture.sourceState.baselineOccurrenceCounts,
    )
    assert.deepEqual(
      {
        orphanedBackgroundTaskReminder: countOccurrences(
          target.source,
          'orphaned background task(s) after restart',
        ),
        notifySessionInternalMetadataChanged: countOccurrences(
          target.source,
          'notifySessionInternalMetadataChanged',
        ),
        thisSessionState: countOccurrences(target.source, 'this.sessionState'),
      },
      fixture.sourceState.targetOccurrenceCounts,
    )

    const dependency = JSON.parse(
      readExact(
        path.join(
          repositoryRoot,
          fixture.inputs.sessionStateDependencyFixture.path,
        ),
        fixture.inputs.sessionStateDependencyFixture,
        'u21128 dependency fixture',
      ),
    )
    const consumer = dependency.runtimeConsumers.find(
      row => row.role === fixture.dependencyProof.runtimeConsumerRole,
    )
    assert.deepEqual(
      {
        targetIndex: consumer.targetIndex,
        unitStart: consumer.unitStart,
        unitEnd: consumer.unitEnd,
        unitNodeType: consumer.unitNodeType,
        unitTokenCount: consumer.unitTokenCount,
        unitSha256: consumer.unitSha256,
        unitCoarseHash: consumer.unitCoarseHash,
        unknownFreeIdentifierCount: consumer.unknownFreeIdentifierCount,
        start: consumer.start,
        end: consumer.end,
        bytes: consumer.bytes,
        sha256: consumer.sha256,
        exact: consumer.exact,
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
        start: fixture.wholeUnitLineage.clearCall.start,
        end: fixture.wholeUnitLineage.clearCall.end,
        bytes: fixture.wholeUnitLineage.clearCall.bytes,
        sha256: fixture.wholeUnitLineage.clearCall.sha256,
        exact: fixture.wholeUnitLineage.clearCall.exact,
      },
    )
    assert.equal(
      dependency.sourceReplayBlocker.decision,
      fixture.dependencyProof.sourceArchitectureDecision,
    )
    const structured = parseTsFile(
      dependency.sourceStates.targetStructuredIO,
      targetSourceRoot(),
    )
    assert.equal(structured.source.includes('SessionStateManager'), false)
    const structuredClass = findTsNodes(
      structured.ts,
      structured.sourceFile,
      node =>
        structured.ts.isClassDeclaration(node) && node.name?.text === 'StructuredIO',
    )[0]
    const structuredConstructor = structuredClass.members.find(
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
  'u21958 predicted impact remains one static unit and one strict residue',
  { skip: !selected },
  () => {
    assert.deepEqual(fixture.generatorWiring.expectedAddedOwnerImpact, {
      units: -1,
      residues: -1,
    })
    assert.deepEqual(fixture.generatorWiring.expectedRawStrictImpact, {
      units: -1,
      residues: -1,
    })
    assert.deepEqual(fixture.ownerResidues.strictRowsExact.map(row => row[0]), [21958])
  },
)
