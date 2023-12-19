import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import * as replayModule from '../cases/2.1.120-to-2.1.121/recovered/replay-main-run-view-mode-source-gap.mjs'

const {
  applyTarget121MainRunViewModeSourceRecovery,
  buildTarget121MainRunViewModeOutput,
  TARGET121_MAIN_RUN_VIEW_MODE_EVIDENCE_IDS,
  TARGET121_MAIN_RUN_VIEW_MODE_INPUT_FILES,
  TARGET121_MAIN_RUN_VIEW_MODE_OUTPUT_FILES,
  TARGET121_MAIN_RUN_VIEW_MODE_OWNER_EVIDENCE,
} = replayModule

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-main-run-view-mode-source-gap.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '54cbff7e493a4d497fa82f127a6e2b0448881fa2931da924b6a8573257b23af6'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function expectedDescriptor(expected) {
  return { bytes: expected.bytes, sha256: expected.sha256 }
}

function matchesDescriptor(actual, expected) {
  return (
    actual.bytes === expected.bytes && actual.sha256 === expected.sha256
  )
}

function commonSnapshotPath(snapshots) {
  const paths = [...new Set(Object.values(snapshots).map(row => row.path))]
  assert.equal(paths.length, 1, 'evolution snapshots must share one path')
  return path.join(repositoryRoot, paths[0])
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
        matchesDescriptor(
          reportDescriptor,
          fixture.inputs.typedReportSnapshots[reportState],
        ) &&
        matchesDescriptor(
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

function reportSnapshot(state) {
  if (state === 'preReplay') return fixture.reportSnapshot
  if (state === 'postReplay') {
    const admitted = new Set(fixture.rowClassification.admittedReplayOrdinals)
    return {
      ownerRows: fixture.postReplay.reportSnapshot.ownerRows,
      addedRows: {
        ...fixture.postReplay.reportSnapshot.addedRows,
        exact: fixture.reportSnapshot.addedRows.exact.filter(
          (_, index) => !admitted.has(index),
        ),
      },
      strictRows: fixture.reportSnapshot.strictRows,
    }
  }
  if (state === 'postPrune') {
    return reportSnapshot('postDangerous')
  }
  if (state === 'postDaemonOwner') return reportSnapshot('preReplay')
  assert.equal(state, 'postDangerous')
  const prior = reportSnapshot('postReplay')
  const removedAdded = new Set(
    fixture.postDangerous.partitionDelta.removedAddedRowsExact.map(JSON.stringify),
  )
  const removedStrict = new Set(
    fixture.postDangerous.partitionDelta.removedStrictRowsExact.map(JSON.stringify),
  )
  return {
    ownerRows: fixture.postDangerous.reportSnapshot.ownerRows,
    addedRows: {
      ...fixture.postDangerous.reportSnapshot.addedRows,
      exact: prior.addedRows.exact.filter(row => !removedAdded.has(JSON.stringify(row))),
    },
    strictRows: {
      ...fixture.postDangerous.reportSnapshot.strictRows,
      exact: prior.strictRows.exact.filter(row => !removedStrict.has(JSON.stringify(row))),
    },
  }
}

function canonicalDescriptor(value) {
  return descriptor(Buffer.from(JSON.stringify(value)))
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), expectedDescriptor(expected), label)
  return bytes
}

function artifactPath(environmentName, expected) {
  return path.resolve(
    process.env[environmentName] ??
      path.join(repositoryRoot, expected.path),
  )
}

function configuredSourceFilename(sourceSpec) {
  const configuredRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  if (configuredRoot) {
    return path.join(
      path.resolve(configuredRoot),
      sourceSpec.path.replace(/^src\//, ''),
    )
  }
  return path.join(repositoryRoot, sourceSpec.path)
}

function parseUnit(bundle, unit, label) {
  const value = bundle.subarray(unit.start, unit.end)
  assert.deepEqual(
    descriptor(value),
    { bytes: unit.bytes, sha256: unit.sha256 },
    label,
  )
  const ast = parse(value.toString('utf8'), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  })
  assert.equal(ast.body.length, 1, `${label}: one complete unit`)
  const node = ast.body[0]
  assert.equal(node.type, unit.nodeType, label)
  assert.equal(node.id?.name, unit.name, label)
  assert.equal(node.async, unit.async, label)
  return { ast, node, text: value.toString('utf8'), value }
}

function normalizedTokenDescriptor(text) {
  const tokens = [...tokenizer(text, { ecmaVersion: 'latest' })].map(token => [
    token.type.label,
    token.type.label === 'name' ? '@id' : (token.value ?? null),
  ])
  return { count: tokens.length, ...canonicalDescriptor(tokens) }
}

function findLineageFragments(parsed, unitStart) {
  const parents = new Map()
  const viewModeMembers = []
  const briefTranscriptProperties = []
  function walk(node, parent = null) {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) walk(child, parent)
      return
    }
    if (typeof node.type === 'string') {
      parents.set(node, parent)
      if (
        node.type === 'MemberExpression' &&
        !node.computed &&
        node.property?.name === 'viewMode'
      ) {
        viewModeMembers.push(node)
      }
      if (
        node.type === 'Property' &&
        !node.computed &&
        (node.key?.name ?? node.key?.value) === 'briefTranscript'
      ) {
        briefTranscriptProperties.push(node)
      }
    }
    for (const [key, child] of Object.entries(node)) {
      if (!['end', 'start'].includes(key)) walk(child, node)
    }
  }
  walk(parsed.ast)
  assert.equal(viewModeMembers.length, 1)
  assert.equal(briefTranscriptProperties.length, 1)

  let first = viewModeMembers[0]
  while (first && first.type !== 'VariableDeclarator') first = parents.get(first)
  assert.ok(first)
  const declaration = parents.get(first)
  assert.equal(declaration.type, 'VariableDeclaration')
  const index = declaration.declarations.indexOf(first)
  assert.ok(index >= 0)
  const last = declaration.declarations[index + 2]
  assert.ok(last)
  const clusterText = parsed.text.slice(first.start, last.end)
  const consumerNode = briefTranscriptProperties[0]
  const consumerText = parsed.text.slice(consumerNode.start, consumerNode.end)
  return {
    initialViewCluster: {
      localStart: first.start,
      localEnd: last.end,
      start: unitStart + first.start,
      end: unitStart + last.end,
      ...descriptor(clusterText),
      normalizedTokens: normalizedTokenDescriptor(clusterText),
    },
    briefTranscriptConsumer: {
      localStart: consumerNode.start,
      localEnd: consumerNode.end,
      start: unitStart + consumerNode.start,
      end: unitStart + consumerNode.end,
      ...descriptor(consumerText),
      normalizedTokens: normalizedTokenDescriptor(consumerText),
    },
  }
}

function reportIdentity(row) {
  return [
    row.literalKind,
    row.value,
    row.target.start,
    row.target.end,
    row.baselineOccurrenceCount,
    row.targetOccurrenceNumber,
    row.targetAdded,
  ]
}

function strictIdentity(row) {
  return [
    row.structural.index,
    row.literalKind,
    row.value,
    row.target.start,
    row.target.end,
    row.targetOccurrenceNumber,
  ]
}

let typescriptPromise
function loadTypeScript() {
  typescriptPromise ??= import(
    pathToFileURL(
      path.join(
        repositoryRoot,
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      ),
    ).href
  ).then(imported => imported.default ?? imported)
  return typescriptPromise
}

function parseSourceFile(ts, filename, text) {
  const parsed = ts.createSourceFile(
    filename,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(parsed.parseDiagnostics.length, 0, filename)
  return parsed
}

function uniqueRunDeclaration(ts, sourceFile) {
  const matches = []
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'run') {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(matches.length, 1, 'one src/main.tsx::run declaration')
  return matches[0]
}

function sourceNodeDescriptor(source, sourceFile, node) {
  const start = node.getStart(sourceFile)
  const end = node.end
  return { start, end, ...descriptor(source.slice(start, end)) }
}

function uniqueVariableStatement(ts, sourceFile, root, name) {
  const matches = []
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === name) {
      let current = node
      while (current && !ts.isVariableStatement(current)) current = current.parent
      assert.ok(current)
      matches.push(current)
    }
    ts.forEachChild(node, visit)
  }
  visit(root)
  assert.equal(matches.length, 1, `${name}: one variable statement`)
  return matches[0]
}

function uniquePropertyAssignment(ts, sourceFile, root, name) {
  const matches = []
  function visit(node) {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(sourceFile).replace(/^['"]|['"]$/g, '') === name
    ) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(root)
  assert.equal(matches.length, 1, `${name}: one property assignment`)
  return matches[0]
}

test(
  'u22106 fixture is exhaustive but its admission remains two-row scoped',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.targetUnit.targetIndex, 22106)
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
    assert.equal(fixture.inputs.sourceFile.postDangerous.projection, 'output')
    assert.equal(fixture.inputs.typedReportSnapshots.postPrune.projection, 'postDangerous')
    assert.equal(fixture.inputs.sourceCoverageSnapshots.postPrune.projection, 'postDangerous')
    assert.equal(fixture.inputs.typedReportSnapshots.postDaemonOwner.projection, 'postPrune')
    assert.equal(fixture.inputs.sourceCoverageSnapshots.postDaemonOwner.projection, 'postPrune')
    assert.equal(fixture.postDaemonOwner.reportSnapshotProjection, 'preReplay')
    assert.equal(fixture.postDaemonOwner.coverageProjection, 'postPrune')
    assert.equal(fixture.inputs.sourceFile.postPrune.projection, 'postDangerous')
    assert.deepEqual(
      [...TARGET121_MAIN_RUN_VIEW_MODE_EVIDENCE_IDS],
      fixture.evidenceIds,
    )
    assert.deepEqual(TARGET121_MAIN_RUN_VIEW_MODE_INPUT_FILES, [
      { path: fixture.inputs.sourceFile.path, ...fixture.inputs.sourceFile.input },
    ])
    assert.deepEqual(TARGET121_MAIN_RUN_VIEW_MODE_OUTPUT_FILES, [
      { path: fixture.inputs.sourceFile.path, ...fixture.inputs.sourceFile.output },
    ])
    assert.equal(
      Object.keys(replayModule).some(key => key.includes('OWNER_OVERRIDES')),
      false,
      'row-scoped evidence must not become a whole-unit owner override',
    )
    assert.deepEqual(
      {
        targetIndex: TARGET121_MAIN_RUN_VIEW_MODE_OWNER_EVIDENCE.targetIndex,
        paths: [...TARGET121_MAIN_RUN_VIEW_MODE_OWNER_EVIDENCE.paths],
        declarations: [
          ...TARGET121_MAIN_RUN_VIEW_MODE_OWNER_EVIDENCE.declarations,
        ],
        residues: TARGET121_MAIN_RUN_VIEW_MODE_OWNER_EVIDENCE.residues.map(
          row => ({ ...row }),
        ),
        evidenceIds: [
          ...TARGET121_MAIN_RUN_VIEW_MODE_OWNER_EVIDENCE.evidenceIds,
        ],
      },
      {
        targetIndex: 22106,
        paths: [fixture.sourceOwner.path],
        declarations: [fixture.sourceOwner.declaration],
        residues: fixture.reportSnapshot.addedRows.exact
          .slice(0, 2)
          .map(
            ([literalKind, value, start, end, , targetOccurrenceNumber]) => ({
              literalKind,
              value,
              start,
              end,
              targetOccurrenceNumber,
            }),
          ),
        evidenceIds: fixture.evidenceIds,
      },
    )
    assert.equal(
      Object.isFrozen(TARGET121_MAIN_RUN_VIEW_MODE_OWNER_EVIDENCE),
      true,
    )

    const groups = fixture.rowClassification
    const allOrdinals = [
      ...groups.buildMacroOrdinals,
      ...groups.admittedReplayOrdinals,
      ...groups.deferredProductionOrdinals,
    ].sort((a, b) => a - b)
    assert.deepEqual(
      allOrdinals,
      fixture.reportSnapshot.addedRows.exact.map((_, index) => index),
    )
    assert.equal(new Set(allOrdinals).size, allOrdinals.length)
    assert.deepEqual(
      groups.deferredProductionOrdinals.map(
        index => fixture.reportSnapshot.addedRows.exact[index][1],
      ),
      groups.deferredProductionValues,
    )
    assert.deepEqual(
      [...new Set(groups.buildMacroOrdinals.map(
        index => fixture.reportSnapshot.addedRows.exact[index][1],
      ))],
      groups.buildMacroValues,
    )
    assert.deepEqual(fixture.admissionImpact, {
      admittedOwnerAddedRows: 2,
      deferredProductionRows: 10,
      separatelyHandledBuildMacroRows: 6,
      strictRowsRemovedByThisReplay: 0,
      coverageRowsAddedOrReplaced: 0,
      reason:
        'viewMode and focus are in the frozen owner-added partition but not its strict subset; the already-correct u22106 main.tsx coverage row is preserved verbatim.',
    })
    const postRows = reportSnapshot('postReplay').addedRows.exact
    const removedRows = fixture.rowClassification.admittedReplayOrdinals.map(
      index => fixture.reportSnapshot.addedRows.exact[index],
    )
    assert.deepEqual(
      removedRows,
      fixture.postReplay.partitionDelta.removedAddedRowsExact,
    )
    assert.deepEqual(fixture.postReplay.partitionDelta, {
      removedOwnerRows: 2,
      removedAddedRows: 2,
      removedStrictRows: 0,
      removedAddedRowsExact: removedRows,
    })
    const macroRows = postRows.filter(row =>
      groups.buildMacroValues.includes(row[1]),
    )
    const deferredRows = postRows.filter(
      row => !groups.buildMacroValues.includes(row[1]),
    )
    assert.deepEqual(
      { count: deferredRows.length, ...canonicalDescriptor(deferredRows) },
      fixture.postReplay.retainedIdentityPartitions.deferredProduction,
    )
    assert.deepEqual(
      { count: macroRows.length, ...canonicalDescriptor(macroRows) },
      fixture.postReplay.retainedIdentityPartitions.buildMacros,
    )
  },
)

test(
  'frozen owner, added, strict, and coverage partitions are exact',
  { skip: !selected },
  () => {
    const evolution = readEvolutionArtifacts()
    assertCompatibleEvolutionPair(
      evolution.reportState,
      evolution.coverageState,
    )
    const report = JSON.parse(evolution.reportBytes)
    const expectedSnapshot = reportSnapshot(evolution.reportState)
    const targetIndex = fixture.targetUnit.targetIndex
    const ownerRows = report.sourceRuntimeOwnerResidueRows.filter(
      row => row.structural.index === targetIndex,
    )
    const addedRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
      row => row.structural.index === targetIndex,
    )
    const strictRows = report.rows.filter(
      row => row.structural.index === targetIndex,
    )
    assert.equal(ownerRows.length, expectedSnapshot.ownerRows.count)
    assert.equal(addedRows.length, expectedSnapshot.addedRows.count)
    assert.equal(strictRows.length, expectedSnapshot.strictRows.count)
    assert.deepEqual(
      canonicalDescriptor(ownerRows),
      expectedSnapshot.ownerRows.fullRows,
    )
    assert.deepEqual(
      canonicalDescriptor(addedRows),
      expectedSnapshot.addedRows.fullRows,
    )
    assert.deepEqual(
      canonicalDescriptor(strictRows),
      expectedSnapshot.strictRows.fullRows,
    )
    const ownerIdentities = ownerRows.map(reportIdentity)
    assert.deepEqual(
      canonicalDescriptor(ownerIdentities),
      expectedSnapshot.ownerRows.identities,
    )
    assert.deepEqual(
      canonicalDescriptor(
        ownerRows.map((row, index) => [
          ...ownerIdentities[index],
          row.ownerPaths,
          row.ownerSourceMatches,
        ]),
      ),
      expectedSnapshot.ownerRows.attributionIdentities,
    )
    assert.ok(
      ownerRows.every(
        row =>
          JSON.stringify(row.ownerPaths) === JSON.stringify(['main.tsx']) &&
          row.ownerSourceMatches.length === 0,
      ),
    )
    const addedIdentities = addedRows.map(reportIdentity)
    assert.deepEqual(addedIdentities, expectedSnapshot.addedRows.exact)
    assert.deepEqual(
      canonicalDescriptor(addedIdentities),
      expectedSnapshot.addedRows.identities,
    )
    const strictIdentities = strictRows.map(strictIdentity)
    assert.deepEqual(strictIdentities, expectedSnapshot.strictRows.exact)
    assert.deepEqual(
      canonicalDescriptor(strictIdentities),
      expectedSnapshot.strictRows.identities,
    )

    const admittedKeys = new Set(
      fixture.rowClassification.admittedReplayOrdinals.map(index =>
        JSON.stringify(fixture.reportSnapshot.addedRows.exact[index].slice(0, 4)),
      ),
    )
    assert.ok(
      strictRows.every(
        row =>
          !admittedKeys.has(
            JSON.stringify([
              row.literalKind,
              row.value,
              row.target.start,
              row.target.end,
            ]),
          ),
      ),
      'the row-scoped replay predicts no strict-row subtraction',
    )

    if (evolution.reportState === 'postReplay') {
      assert.deepEqual(
        fixture.postReplay.partitionDelta.removedAddedRowsExact,
        fixture.rowClassification.admittedReplayOrdinals.map(
          index => fixture.reportSnapshot.addedRows.exact[index],
        ),
      )
      assert.equal(
        fixture.reportSnapshot.addedRows.count - addedRows.length,
        fixture.postReplay.partitionDelta.removedAddedRows,
      )
      assert.equal(
        fixture.reportSnapshot.ownerRows.count - ownerRows.length,
        fixture.postReplay.partitionDelta.removedOwnerRows,
      )
      assert.equal(
        fixture.reportSnapshot.strictRows.count - strictRows.length,
        fixture.postReplay.partitionDelta.removedStrictRows,
      )
    } else if (
      evolution.reportState === 'postDangerous' ||
      evolution.reportState === 'postPrune'
    ) {
      const prior = reportSnapshot('postReplay')
      assert.equal(
        prior.addedRows.count - addedRows.length,
        fixture.postDangerous.partitionDelta.removedAddedRows,
      )
      assert.equal(
        prior.ownerRows.count - ownerRows.length,
        fixture.postDangerous.partitionDelta.removedOwnerRows,
      )
      assert.equal(
        prior.strictRows.count - strictRows.length,
        fixture.postDangerous.partitionDelta.removedStrictRows,
      )
      assert.deepEqual(
        fixture.postDangerous.partitionDelta.removedAddedRowsExact,
        [["property","skipDangerousModePromptSetPreDialog",13809436,13809471,0,1,true]],
      )
    } else if (evolution.reportState === 'postDaemonOwner') {
      assert.equal(ownerRows.length, fixture.reportSnapshot.ownerRows.count)
      assert.equal(addedRows.length, fixture.reportSnapshot.addedRows.count)
      assert.equal(strictRows.length, fixture.reportSnapshot.strictRows.count)
      assert.equal(fixture.postDaemonOwner.reportSnapshotProjection, 'preReplay')
    }

    const coverageRaw = gunzipSync(evolution.coverageBytes)
    assert.deepEqual(descriptor(coverageRaw), {
      bytes: evolution.coverageExpected.rawBytes,
      sha256: evolution.coverageExpected.rawSha256,
    })
    const coverage = JSON.parse(coverageRaw)
    const coverageRows = coverage.rows.filter(
      row => row.targetIndex === targetIndex,
    )
    assert.deepEqual(
      canonicalDescriptor(coverageRows),
      fixture.coverageRowsDescriptor,
    )
    assert.deepEqual(coverageRows, [fixture.coverageRow])
  },
)

test(
  'complete baseline and target run units authenticate retained view-mode lineage',
  { skip: !selected },
  () => {
    const baseline = readExact(
      artifactPath(
        'CLAUDE_CODE_2_1_120_INNER_BUNDLE',
        fixture.inputs.baselineBundle,
      ),
      fixture.inputs.baselineBundle,
      'authenticated Target120 inner bundle',
    )
    const target = readExact(
      artifactPath(
        'CLAUDE_CODE_2_1_121_INNER_BUNDLE',
        fixture.inputs.targetBundle,
      ),
      fixture.inputs.targetBundle,
      'authenticated Target121 inner bundle',
    )
    const ledgerBytes = readExact(
      path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
      fixture.inputs.structuralLedger,
      'Target121 structural ledger',
    )
    const ledger = JSON.parse(gunzipSync(ledgerBytes))
    const targetRegion = ledger.regions.find(
      row => row.target?.index === fixture.targetUnit.targetIndex,
    )
    assert.ok(targetRegion)
    assert.deepEqual(
      {
        classification: targetRegion.classification,
        unknownFreeIdentifierCount: targetRegion.unknownFreeIdentifierCount,
        nodeType: targetRegion.target.nodeType,
        parseStatus: targetRegion.target.parseStatus,
        start: targetRegion.target.start,
        end: targetRegion.target.end,
        tokenCount: targetRegion.target.tokenCount,
        sourceHash: targetRegion.target.sourceHash,
        coarseHash: targetRegion.target.coarseHash,
        topDefinitionCount: targetRegion.target.topDefinitionCount,
        line: targetRegion.target.location.line,
        column: targetRegion.target.location.column,
      },
      {
        classification: fixture.targetUnit.classification,
        unknownFreeIdentifierCount: fixture.targetUnit.unknownFreeIdentifierCount,
        nodeType: fixture.targetUnit.nodeType,
        parseStatus: fixture.targetUnit.parseStatus,
        start: fixture.targetUnit.start,
        end: fixture.targetUnit.end,
        tokenCount: fixture.targetUnit.tokenCount,
        sourceHash: fixture.targetUnit.sha256,
        coarseHash: fixture.targetUnit.coarseHash,
        topDefinitionCount: fixture.targetUnit.topDefinitionCount,
        line: fixture.targetUnit.line,
        column: fixture.targetUnit.column,
      },
    )
    assert.equal(targetRegion.baselineUnitIndex, undefined)
    const baselineRegion = ledger.unmatchedBaseline.find(
      row =>
        row.index === fixture.baselineSemanticCounterpart.baselineUnitIndex,
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
        line: baselineRegion.location.line,
        column: baselineRegion.location.column,
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
        line: fixture.baselineSemanticCounterpart.line,
        column: fixture.baselineSemanticCounterpart.column,
      },
    )

    const baselineUnit = parseUnit(
      baseline,
      fixture.baselineSemanticCounterpart,
      'complete Target120 main run unit',
    )
    const targetUnit = parseUnit(
      target,
      fixture.targetUnit,
      'complete Target121 main run unit',
    )
    for (const parsed of [baselineUnit, targetUnit]) {
      for (const [sentinel, count] of [
        ['run_function_start', 1],
        ['run_commander_initialized', 1],
        ['run_before_parse', 2],
        ['run_after_parse', 2],
        ['main_after_run', 1],
      ]) {
        assert.equal(parsed.text.split(sentinel).length - 1, count, sentinel)
      }
      assert.equal(parsed.text.split('.parseAsync(process.argv)').length - 1, 2)
    }

    const baselineFragments = findLineageFragments(
      baselineUnit,
      fixture.baselineSemanticCounterpart.start,
    )
    const targetFragments = findLineageFragments(
      targetUnit,
      fixture.targetUnit.start,
    )
    assert.deepEqual(baselineFragments, fixture.compiledLineage.baseline)
    assert.deepEqual(targetFragments, fixture.compiledLineage.target)
    assert.deepEqual(
      baselineFragments.initialViewCluster.normalizedTokens,
      targetFragments.initialViewCluster.normalizedTokens,
    )
    assert.deepEqual(
      baselineFragments.briefTranscriptConsumer.normalizedTokens,
      targetFragments.briefTranscriptConsumer.normalizedTokens,
    )

    const admitted = fixture.rowClassification.admittedReplayOrdinals.map(
      index => fixture.reportSnapshot.addedRows.exact[index],
    )
    assert.equal(admitted[1][2] - admitted[0][3], 9)
    for (const [kind, value, start, end] of admitted) {
      const exact = target.subarray(start, end).toString('utf8')
      assert.equal(exact, kind === 'string' ? JSON.stringify(value) : value)
      assert.ok(start >= fixture.compiledLineage.target.initialViewCluster.start)
      assert.ok(end <= fixture.compiledLineage.target.initialViewCluster.end)
    }
  },
)

test(
  'bounded main source replay is exact, idempotent, fail-closed, and behavioral',
  { skip: !selected },
  async () => {
    const sourceSpec = fixture.inputs.sourceFile
    const configuredSourcePath = configuredSourceFilename(sourceSpec)
    const configuredSource = fs.readFileSync(configuredSourcePath)
    const configuredSourceDescriptor = descriptor(configuredSource)
    const configuredStates = [
      ['raw', sourceSpec.input],
      ['already-recovered', sourceSpec.output],
      ['postDangerous', sourceSpec.postDangerous],
      ['postPrune', sourceSpec.postPrune],
    ].filter(([, expected]) =>
      matchesDescriptor(configuredSourceDescriptor, expected),
    )
    assert.equal(
      configuredStates.length,
      1,
      `configured semantic source is neither exact raw nor recovered: ${configuredSourcePath}`,
    )
    const configuredState = configuredStates[0][0]
    const repositorySource = readExact(
      path.join(repositoryRoot, sourceSpec.path),
      sourceSpec.input,
      'current cumulative src/main.tsx',
    )
    if (configuredState === 'raw') {
      assert.deepEqual(
        configuredSource,
        repositorySource,
        'configured raw semantic source equals the pinned replay input',
      )
    } else if (configuredState === 'already-recovered') {
      const configuredTemporary = fs.mkdtempSync(
        path.join(os.tmpdir(), 'target121-main-run-view-mode-configured-'),
      )
      const configuredRoot = path.join(configuredTemporary, 'src')
      fs.mkdirSync(configuredRoot, { recursive: true })
      fs.writeFileSync(path.join(configuredRoot, 'main.tsx'), configuredSource)
      try {
        assert.deepEqual(
          applyTarget121MainRunViewModeSourceRecovery({
            sourceRoot: configuredRoot,
          }),
          { status: 'already-recovered', files: [] },
        )
      } finally {
        fs.rmSync(configuredTemporary, { recursive: true, force: true })
      }
    } else {
      const expected = sourceSpec[configuredState]
      assert.ok(expected)
      assert.deepEqual(descriptor(configuredSource), expectedDescriptor(expected))
    }
    const auditedPackageFile = path.join(
      sourceSpec.auditedPackageRoot,
      sourceSpec.path,
    )
    if (fs.existsSync(auditedPackageFile)) {
      assert.deepEqual(
        descriptor(fs.readFileSync(auditedPackageFile)),
        expectedDescriptor(sourceSpec.postDangerous),
        'audited package main.tsx equals the exact post-dangerous source state',
      )
    }
    const postPruneAuditedPackageFile = path.join(
      sourceSpec.postPruneAuditedPackageRoot,
      sourceSpec.path,
    )
    if (fs.existsSync(postPruneAuditedPackageFile)) {
      assert.deepEqual(
        descriptor(fs.readFileSync(postPruneAuditedPackageFile)),
        expectedDescriptor(sourceSpec.postPrune),
        'audited package main.tsx equals the exact post-prune source state',
      )
    }

    const ts = await loadTypeScript()
    const inputText = repositorySource.toString('utf8')
    const inputParsed = parseSourceFile(ts, sourceSpec.path, inputText)
    const inputRun = uniqueRunDeclaration(ts, inputParsed)
    assert.deepEqual(
      sourceNodeDescriptor(inputText, inputParsed, inputRun),
      fixture.sourceOwner.inputRun,
    )
    const inputRunText = inputRun.getText(inputParsed)
    assert.equal(inputRunText.includes('viewMode'), false)
    assert.equal(inputRunText.includes('initialBriefTranscript'), false)

    const directOutput = Buffer.from(
      buildTarget121MainRunViewModeOutput(inputText),
      'utf8',
    )
    assert.deepEqual(descriptor(directOutput), sourceSpec.output)
    const firstInputAnchor = fixture.sourceReplay.anchors.initialViewState.input
    assert.deepEqual(
      descriptor(inputText.slice(firstInputAnchor.start, firstInputAnchor.end)),
      expectedDescriptor(firstInputAnchor),
    )
    const secondInputAnchor =
      fixture.sourceReplay.anchors.briefTranscriptConsumer.input
    assert.deepEqual(
      descriptor(inputText.slice(secondInputAnchor.start, secondInputAnchor.end)),
      expectedDescriptor(secondInputAnchor),
    )

    const temporary = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target121-main-run-view-mode-'),
    )
    const sourceRoot = path.join(temporary, 'src')
    const filename = path.join(sourceRoot, 'main.tsx')
    fs.mkdirSync(sourceRoot, { recursive: true })
    fs.writeFileSync(filename, repositorySource)
    try {
      assert.deepEqual(
        applyTarget121MainRunViewModeSourceRecovery({ sourceRoot }),
        { status: 'recovered', files: [sourceSpec.path] },
      )
      const output = readExact(filename, sourceSpec.output, 'replayed src/main.tsx')
      const outputText = output.toString('utf8')
      assert.deepEqual(
        applyTarget121MainRunViewModeSourceRecovery({ sourceRoot }),
        { status: 'already-recovered', files: [] },
      )

      const firstOutput = fixture.sourceReplay.anchors.initialViewState.output
      assert.deepEqual(
        descriptor(
          outputText.slice(
            firstInputAnchor.start,
            firstInputAnchor.start + firstOutput.bytes,
          ),
        ),
        firstOutput,
      )
      const firstDelta = firstOutput.bytes - firstInputAnchor.bytes
      const secondOutput = fixture.sourceReplay.anchors.briefTranscriptConsumer.output
      const secondOutputStart = secondInputAnchor.start + firstDelta
      assert.deepEqual(
        descriptor(
          outputText.slice(
            secondOutputStart,
            secondOutputStart + secondOutput.bytes,
          ),
        ),
        secondOutput,
      )

      const outputParsed = parseSourceFile(ts, sourceSpec.path, outputText)
      const outputRun = uniqueRunDeclaration(ts, outputParsed)
      assert.deepEqual(
        sourceNodeDescriptor(outputText, outputParsed, outputRun),
        fixture.sourceOwner.outputRun,
      )
      const viewStatement = uniqueVariableStatement(
        ts,
        outputParsed,
        outputRun,
        'viewMode',
      )
      const initialBriefStatement = uniqueVariableStatement(
        ts,
        outputParsed,
        outputRun,
        'initialBriefTranscript',
      )
      const verboseStatement = uniqueVariableStatement(
        ts,
        outputParsed,
        outputRun,
        'verbose',
      )
      const briefProperty = uniquePropertyAssignment(
        ts,
        outputParsed,
        outputRun,
        'briefTranscript',
      )
      const statements = [
        viewStatement,
        initialBriefStatement,
        verboseStatement,
      ].map(node => node.getText(outputParsed))
      assert.deepEqual(
        statements.map(text => text.split(/\s+/)[1]),
        ['viewMode', 'initialBriefTranscript', 'verbose'],
      )
      assert.equal(
        briefProperty.initializer.getText(outputParsed),
        '(verbose ?? false) ? false : initialBriefTranscript',
      )

      const evaluate = new Function(
        'viewModeInput',
        'globalBrief',
        'optionVerbose',
        'configVerbose',
        `const options = { verbose: optionVerbose }
         const getInitialSettings = () => ({ viewMode: viewModeInput })
         const getGlobalConfig = () => ({ briefTranscript: globalBrief })
         const getConfigValue = () => ({ value: configVerbose })
         ${statements.join('\n')}
         return { verbose, ${briefProperty.getText(outputParsed)} }`,
      )
      for (const row of fixture.sourceReplay.truthTable) {
        assert.deepEqual(
          evaluate(
            row.viewMode ?? undefined,
            row.globalBrief,
            row.optionVerbose ?? undefined,
            row.configVerbose,
          ),
          {
            verbose: row.verbose,
            briefTranscript: row.briefTranscript,
          },
          row.name,
        )
      }
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true })
    }

    const mixed = Buffer.from(repositorySource)
    const mutation = mixed.indexOf('let outputFormat = options.outputFormat;')
    assert.ok(mutation >= 0)
    mixed[mutation] = 'L'.charCodeAt(0)
    const mixedTemporary = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target121-main-run-view-mode-mixed-'),
    )
    const mixedRoot = path.join(mixedTemporary, 'src')
    fs.mkdirSync(mixedRoot, { recursive: true })
    fs.writeFileSync(path.join(mixedRoot, 'main.tsx'), mixed)
    try {
      assert.throws(
        () =>
          applyTarget121MainRunViewModeSourceRecovery({
            sourceRoot: mixedRoot,
          }),
        /requires its exact raw or recovered source state/,
      )
    } finally {
      fs.rmSync(mixedTemporary, { recursive: true, force: true })
    }
  },
)
