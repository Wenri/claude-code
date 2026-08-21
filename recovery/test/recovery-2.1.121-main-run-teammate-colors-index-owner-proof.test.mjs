import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import * as ownerEvidenceModule from '../cases/2.1.120-to-2.1.121/recovered/main-run-teammate-colors-index-owner-evidence.mjs'

const {
  TARGET121_MAIN_RUN_TEAMMATE_COLORS_INDEX_EVIDENCE_IDS,
  TARGET121_MAIN_RUN_TEAMMATE_COLORS_INDEX_OWNER_EVIDENCE,
} = ownerEvidenceModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-main-run-teammate-colors-index-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'c926591d9cbd74c5f01bda6dcb0b796b74503233ad60afe7fd2b81b317575ab8'

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
    process.env[environmentName] ?? path.join(repositoryRoot, expected.path),
  )
}

function selectArtifactSnapshot(reportDescriptor, coverageDescriptor) {
  const matches = [
    ['postDangerous', fixture.inputs.frozenPostDangerousSnapshot],
    ['postPrune', fixture.inputs.frozenPostPruneSnapshot],
    ['postDaemonOwner', fixture.inputs.frozenPostDaemonOwnerSnapshot],
  ].filter(
    ([, snapshot]) =>
      matchesDescriptor(reportDescriptor, snapshot.typedReport) &&
      matchesDescriptor(coverageDescriptor, snapshot.sourceCoverage),
  )
  assert.equal(
    matches.length,
    1,
    'index proof requires one exact known report/coverage phase; unknown and hybrid pairs are forbidden',
  )
  return matches[0]
}

function reportIdentity(row) {
  return [
    row.structural.index,
    row.literalKind,
    row.value,
    row.target.start,
    row.target.end,
    row.baselineOccurrenceCount,
    row.targetOccurrenceNumber,
    row.targetAdded,
  ]
}

function findAll(haystack, needle) {
  const positions = []
  let cursor = -1
  while ((cursor = haystack.indexOf(needle, cursor + 1)) >= 0) {
    positions.push(cursor)
  }
  return positions
}

function identifierNormalizedTokens(text) {
  return [...tokenizer(text, { ecmaVersion: 'latest' })].map(token => [
    token.type.label,
    token.type.label === 'name' ? '@id' : (token.value ?? null),
  ])
}

function parseUnit(bundle, unit, label) {
  const value = bundle.subarray(unit.start, unit.end)
  assert.deepEqual(descriptor(value), expectedDescriptor(unit), label)
  const text = value.toString('utf8')
  const ast = parse(text, { ecmaVersion: 'latest', sourceType: 'script' })
  assert.equal(ast.body.length, 1, `${label}: complete unit`)
  const node = ast.body[0]
  assert.equal(node.type, unit.nodeType, label)
  assert.equal(node.id?.name, unit.name, label)
  assert.equal(
    [...tokenizer(text, { ecmaVersion: 'latest' })].length,
    unit.tokenCount,
    `${label}: token count`,
  )
  return { ast, node, text }
}

function structuralTargetDescriptor(region) {
  return {
    targetIndex: region.target.index,
    nodeType: region.target.nodeType,
    parseStatus: region.target.parseStatus,
    start: region.target.start,
    end: region.target.end,
    tokenCount: region.target.tokenCount,
    sha256: region.target.sourceHash,
    coarseHash: region.target.coarseHash,
    line: region.target.location.line,
    column: region.target.location.column,
  }
}

function structuralBaselineDescriptor(unit) {
  return {
    baselineUnitIndex: unit.index,
    nodeType: unit.nodeType,
    parseStatus: unit.parseStatus,
    start: unit.start,
    end: unit.end,
    tokenCount: unit.tokenCount,
    sha256: unit.sourceHash,
    coarseHash: unit.coarseHash,
    line: unit.location.line,
    column: unit.location.column,
  }
}

function compiledInitialStateGraph(parsed, unitStart, expectedFragment) {
  const parents = new Map()
  let fragmentProperty
  function walk(node, parent = null) {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) walk(child, parent)
      return
    }
    if (typeof node.type === 'string') {
      parents.set(node, parent)
      if (
        node.type === 'Property' &&
        unitStart + node.start === expectedFragment.start
      ) {
        fragmentProperty = node
      }
    }
    for (const [key, child] of Object.entries(node)) {
      if (!['start', 'end'].includes(key)) walk(child, node)
    }
  }
  walk(parsed.ast)
  assert.ok(fragmentProperty)
  const nestedObject = fragmentProperty.value
  assert.equal(nestedObject.type, 'ObjectExpression')
  const indexProperty = nestedObject.properties.find(
    property =>
      property.type === 'Property' &&
      !property.computed &&
      (property.key.name ?? property.key.value) === 'index',
  )
  assert.ok(indexProperty)
  assert.equal(indexProperty.value.type, 'Literal')
  assert.equal(indexProperty.value.value, 0)
  const completeObject = parents.get(fragmentProperty)
  assert.equal(completeObject.type, 'ObjectExpression')
  function exact(node) {
    return {
      start: unitStart + node.start,
      end: unitStart + node.end,
      ...descriptor(parsed.text.slice(node.start, node.end)),
    }
  }
  return {
    fragment: exact(fragmentProperty),
    nestedObject: exact(nestedObject),
    indexProperty: exact(indexProperty),
    completeObject: exact(completeObject),
    completeObjectText: parsed.text.slice(
      completeObject.start,
      completeObject.end,
    ),
  }
}

function typescript() {
  return require(
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  )
}

function sourceNodeDescriptor(source, sourceFile, node) {
  const start = node.getStart(sourceFile)
  const end = node.end
  return { start, end, ...descriptor(source.slice(start, end)) }
}

function authoredSourceGraph(source) {
  const ts = typescript()
  const sourceFile = ts.createSourceFile(
    'main.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.deepEqual(sourceFile.parseDiagnostics, [])
  let run
  let initialState
  function findRun(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'run') {
      run = node
    }
    ts.forEachChild(node, findRun)
  }
  findRun(sourceFile)
  assert.ok(run)
  function findInitialState(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(sourceFile) === 'initialState'
    ) {
      initialState = node
    }
    ts.forEachChild(node, findInitialState)
  }
  findInitialState(run)
  assert.ok(initialState)
  assert.ok(ts.isObjectLiteralExpression(initialState.initializer))
  const initialObject = initialState.initializer
  const topLevelProperties = new Map()
  const allPropertyNames = []
  function collectProperties(node) {
    if (
      ts.isPropertyAssignment(node) ||
      ts.isShorthandPropertyAssignment(node) ||
      ts.isMethodDeclaration(node)
    ) {
      const name = node.name?.getText(sourceFile)
      if (name) allPropertyNames.push(name)
    }
    ts.forEachChild(node, collectProperties)
  }
  collectProperties(initialObject)
  for (const property of initialObject.properties) {
    const name = property.name?.getText(sourceFile)
    if (name) topLevelProperties.set(name, property)
  }
  return {
    sourceFile,
    run,
    initialState,
    runDescriptor: sourceNodeDescriptor(source, sourceFile, run),
    initialStateDescriptor: sourceNodeDescriptor(
      source,
      sourceFile,
      initialState,
    ),
    topLevelProperties,
    allPropertyNames,
    propertyDescriptor(name) {
      const property = topLevelProperties.get(name)
      assert.ok(property, `source initialState property ${name}`)
      return sourceNodeDescriptor(source, sourceFile, property)
    },
  }
}

function configuredSourceRoot() {
  const configured = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  if (configured) return path.resolve(configured)
  return path.resolve(repositoryRoot, fixture.inputs.sourceRoots.raw)
}

function identifySourceState(sourceBytes) {
  const actual = descriptor(sourceBytes)
  const matches = fixture.sourceGraph.states.filter(state =>
    matchesDescriptor(actual, state.file),
  )
  assert.equal(matches.length, 1, 'one exact raw/package source state')
  return matches[0]
}

test(
  'fixture freezes one owner-added-only row and cumulative accounting without a whole-unit override',
  { skip: !selected },
  () => {
    assert.deepEqual(descriptor(fixtureBytes), {
      bytes: 12170,
      sha256: FIXTURE_SHA256,
    })
    assert.equal(fixture.case, caseName)
    assert.deepEqual(
      descriptor(
        fs.readFileSync(
          path.join(repositoryRoot, fixture.caseFiles.helper.path),
        ),
      ),
      expectedDescriptor(fixture.caseFiles.helper),
    )
    assert.deepEqual(
      [...TARGET121_MAIN_RUN_TEAMMATE_COLORS_INDEX_EVIDENCE_IDS],
      fixture.evidenceIds,
    )
    assert.ok(
      Object.isFrozen(
        TARGET121_MAIN_RUN_TEAMMATE_COLORS_INDEX_OWNER_EVIDENCE,
      ),
    )
    assert.ok(
      Object.isFrozen(
        TARGET121_MAIN_RUN_TEAMMATE_COLORS_INDEX_OWNER_EVIDENCE.residues,
      ),
    )
    assert.equal(
      Object.keys(ownerEvidenceModule).some(name => /OVERRIDES?/.test(name)),
      false,
      'no complete-unit override export',
    )
    const residue =
      TARGET121_MAIN_RUN_TEAMMATE_COLORS_INDEX_OWNER_EVIDENCE.residues[0]
    assert.deepEqual(
      [
        TARGET121_MAIN_RUN_TEAMMATE_COLORS_INDEX_OWNER_EVIDENCE.targetIndex,
        residue.literalKind,
        residue.value,
        residue.start,
        residue.end,
        296,
        residue.targetOccurrenceNumber,
        true,
      ],
      fixture.rowBoundary.admitted,
    )
    assert.deepEqual(
      canonicalDescriptor(fixture.rowBoundary.admitted),
      fixture.rowBoundary.descriptor,
    )
    assert.deepEqual(
      fixture.inputs.frozenPostDangerousSnapshot.selectedRow,
      fixture.rowBoundary.admitted,
    )
    assert.deepEqual(
      fixture.inputs.frozenPostDangerousSnapshot.partitions,
      { owner: true, added: true, strict: false, unclassified: false },
    )
    const current = fixture.inputs.frozenPostDaemonOwnerSnapshot
    const reportBytes = readExact(
      artifactPath('CLAUDE_CODE_TARGET121_TYPED_REPORT', current.typedReport),
      current.typedReport,
      'exact post-prune Target121 typed report',
    )
    const coverageGzip = readExact(
      artifactPath(
        'CLAUDE_CODE_TARGET121_SOURCE_COVERAGE',
        current.sourceCoverage,
      ),
      current.sourceCoverage,
      'exact post-prune Target121 coverage',
    )
    assert.equal(
      selectArtifactSnapshot(
        descriptor(reportBytes),
        descriptor(coverageGzip),
      )[0],
      'postDaemonOwner',
    )
    assert.throws(
      () =>
        selectArtifactSnapshot(
          expectedDescriptor(fixture.inputs.frozenPostDangerousSnapshot.typedReport),
          descriptor(coverageGzip),
        ),
      /unknown and hybrid pairs are forbidden/,
    )
    assert.throws(
      () =>
        selectArtifactSnapshot(
          { ...descriptor(reportBytes), sha256: '0'.repeat(64) },
          descriptor(coverageGzip),
        ),
      /unknown and hybrid pairs are forbidden/,
    )
    const report = JSON.parse(reportBytes)
    const unitRows = report.sourceRuntimeOwnerResidueRows.filter(
      row => row.structural.index === 22106,
    )
    const unitAddedRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
      row => row.structural.index === 22106,
    )
    const unitStrictRows = report.rows.filter(
      row => row.structural.index === 22106,
    )
    assert.deepEqual(
      {
        owner: unitRows.length,
        added: unitAddedRows.length,
        strict: unitStrictRows.length,
        unclassified: 0,
      },
      current.u22106Counts,
    )
    assert.ok(
      unitAddedRows.some(
        row =>
          JSON.stringify(reportIdentity(row)) ===
          JSON.stringify(current.selectedRow),
      ),
    )
    assert.deepEqual(descriptor(gunzipSync(coverageGzip)), {
      bytes: current.sourceCoverage.rawBytes,
      sha256: current.sourceCoverage.rawSha256,
    })
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(
          fixture.inputs.frozenPostDangerousSnapshot.u22106Counts,
        ).filter(([name]) => name !== 'unclassified'),
      ),
      fixture.cumulativeAccounting.postDangerousActual,
    )
    assert.equal(
      fixture.inputs.frozenPostDangerousSnapshot.u22106Counts.unclassified,
      0,
    )
    const phases = [
      'postDangerousActual',
      'afterFirstAllowed',
      'afterSecondAllowed',
      'afterGrowthbook300',
      'afterSeparateSessionState',
      'afterThisIndex',
    ].map(name => fixture.cumulativeAccounting[name])
    for (let index = 1; index < phases.length; index += 1) {
      assert.deepEqual(phases[index], {
        owner: phases[index - 1].owner - 1,
        added: phases[index - 1].added - 1,
        strict: phases[index - 1].strict,
      })
    }
    assert.deepEqual(fixture.cumulativeAccounting.afterThisIndex, {
      owner: 194,
      added: 10,
      strict: 8,
    })
    assert.deepEqual(fixture.cumulativeAccounting.thisAdmissionDelta, {
      owner: -1,
      added: -1,
      strict: 0,
      coverage: 0,
    })
    assert.equal(fixture.summary.sourceReplay, false)
    assert.equal(fixture.summary.rawStrictRowsRemoved, 0)
  },
)

test(
  'complete authenticated units retain the exact teammate-color allocator and index property',
  { skip: !selected },
  () => {
    const baseline = readExact(
      artifactPath(
        'CLAUDE_CODE_2_1_120_INNER_BUNDLE',
        fixture.inputs.baselineBundle,
      ),
      fixture.inputs.baselineBundle,
      'authenticated Target120 bundle',
    )
    const target = readExact(
      artifactPath(
        'CLAUDE_CODE_2_1_121_INNER_BUNDLE',
        fixture.inputs.targetBundle,
      ),
      fixture.inputs.targetBundle,
      'authenticated Target121 bundle',
    )
    const ledgerBytes = readExact(
      path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
      fixture.inputs.structuralLedger,
      'structural ledger',
    )
    const ledger = JSON.parse(gunzipSync(ledgerBytes))
    const targetRegion = ledger.regions.find(
      row => row.target?.index === fixture.targetUnit.targetIndex,
    )
    assert.ok(targetRegion)
    assert.equal(targetRegion.classification, fixture.targetUnit.classification)
    assert.equal(
      targetRegion.unknownFreeIdentifierCount,
      fixture.targetUnit.unknownFreeIdentifierCount,
    )
    assert.deepEqual(structuralTargetDescriptor(targetRegion), {
      targetIndex: fixture.targetUnit.targetIndex,
      nodeType: fixture.targetUnit.nodeType,
      parseStatus: fixture.targetUnit.parseStatus,
      start: fixture.targetUnit.start,
      end: fixture.targetUnit.end,
      tokenCount: fixture.targetUnit.tokenCount,
      sha256: fixture.targetUnit.sha256,
      coarseHash: fixture.targetUnit.coarseHash,
      line: fixture.targetUnit.line,
      column: fixture.targetUnit.column,
    })
    const baselineUnit = ledger.unmatchedBaseline.find(
      unit => unit.index === fixture.baselineUnit.baselineUnitIndex,
    )
    assert.ok(baselineUnit)
    assert.deepEqual(
      structuralBaselineDescriptor(baselineUnit),
      Object.fromEntries(
        Object.entries(fixture.baselineUnit).filter(
          ([key]) => !['name', 'bytes'].includes(key),
        ),
      ),
    )

    const parsedBaseline = parseUnit(
      baseline,
      fixture.baselineUnit,
      'Target120 run',
    )
    const parsedTarget = parseUnit(
      target,
      fixture.targetUnit,
      'Target121 run',
    )
    const baselineGraph = compiledInitialStateGraph(
      parsedBaseline,
      fixture.baselineUnit.start,
      fixture.compiledRetention.runFragment.baseline,
    )
    const targetGraph = compiledInitialStateGraph(
      parsedTarget,
      fixture.targetUnit.start,
      fixture.compiledRetention.runFragment.target,
    )
    assert.deepEqual(
      baselineGraph.fragment,
      fixture.compiledRetention.runFragment.baseline,
    )
    assert.deepEqual(
      targetGraph.fragment,
      fixture.compiledRetention.runFragment.target,
    )
    assert.deepEqual(
      baselineGraph.nestedObject,
      fixture.compiledRetention.nestedObject.baseline,
    )
    assert.deepEqual(
      targetGraph.nestedObject,
      fixture.compiledRetention.nestedObject.target,
    )
    assert.deepEqual(
      baselineGraph.indexProperty,
      fixture.compiledRetention.indexProperty.baseline,
    )
    assert.deepEqual(
      targetGraph.indexProperty,
      fixture.compiledRetention.indexProperty.target,
    )
    assert.deepEqual(
      baselineGraph.completeObject,
      fixture.compiledRetention.completeInitialStateObject.baseline,
    )
    assert.deepEqual(
      targetGraph.completeObject,
      fixture.compiledRetention.completeInitialStateObject.target,
    )
    const baselineNormalized = identifierNormalizedTokens(
      baselineGraph.completeObjectText,
    )
    const targetNormalized = identifierNormalizedTokens(
      targetGraph.completeObjectText,
    )
    assert.deepEqual(targetNormalized, baselineNormalized)
    assert.equal(
      baselineNormalized.length,
      fixture.compiledRetention.completeInitialStateObject
        .identifierNormalizedTokens.count,
    )
    assert.deepEqual(
      canonicalDescriptor(baselineNormalized),
      expectedDescriptor(
        fixture.compiledRetention.completeInitialStateObject
          .identifierNormalizedTokens,
      ),
    )
    assert.deepEqual(
      findAll(baseline, fixture.compiledRetention.fragmentText),
      fixture.compiledRetention.allFragmentStarts.baseline,
    )
    assert.deepEqual(
      findAll(target, fixture.compiledRetention.fragmentText),
      fixture.compiledRetention.allFragmentStarts.target,
    )
    for (const bundle of [baseline, target]) {
      for (const start of findAll(bundle, fixture.compiledRetention.fragmentText)) {
        assert.deepEqual(
          descriptor(
            bundle.subarray(
              start,
              start + fixture.compiledRetention.fragment.bytes,
            ),
          ),
          expectedDescriptor(fixture.compiledRetention.fragment),
        )
      }
    }
    assert.equal(
      target
        .subarray(
          fixture.rowBoundary.admitted[3],
          fixture.rowBoundary.admitted[4],
        )
        .toString('utf8'),
      'index',
    )
  },
)

test(
  'Target120 and raw Target121 authored initialState graphs are exact and both block replay',
  { skip: !selected },
  () => {
    const baselineFilename = path.resolve(
      repositoryRoot,
      fixture.inputs.sourceRoots.baseline,
      'main.tsx',
    )
    const rawFilename = path.resolve(
      repositoryRoot,
      fixture.inputs.sourceRoots.raw,
      'main.tsx',
    )
    const baselineBytes = readExact(
      baselineFilename,
      fixture.sourceGraph.baseline.file,
      'Target120 source main.tsx',
    )
    const rawBytes = readExact(
      rawFilename,
      fixture.sourceGraph.states[0].file,
      'raw Target121 source main.tsx',
    )
    const baselineGraph = authoredSourceGraph(baselineBytes.toString('utf8'))
    const rawGraph = authoredSourceGraph(rawBytes.toString('utf8'))
    assert.deepEqual(
      baselineGraph.runDescriptor,
      fixture.sourceGraph.baseline.run,
    )
    assert.deepEqual(
      rawGraph.runDescriptor,
      fixture.sourceGraph.states[0].run,
    )
    assert.deepEqual(
      baselineGraph.initialStateDescriptor,
      fixture.sourceGraph.baseline.initialState,
    )
    assert.deepEqual(
      rawGraph.initialStateDescriptor,
      fixture.sourceGraph.states[0].initialState,
    )
    assert.deepEqual(
      baselineGraph.initialStateDescriptor,
      {
        ...rawGraph.initialStateDescriptor,
        start: baselineGraph.initialStateDescriptor.start,
        end: baselineGraph.initialStateDescriptor.end,
      },
    )
    for (const name of fixture.sourceGraph.expectedAbsentInitialStateProperties) {
      assert.equal(baselineGraph.allPropertyNames.includes(name), false)
      assert.equal(rawGraph.allPropertyNames.includes(name), false)
    }
    for (const [name, expected] of Object.entries(
      fixture.sourceGraph.stableProperties,
    )) {
      assert.deepEqual(
        descriptor(
          baselineBytes
            .toString('utf8')
            .slice(
              baselineGraph.topLevelProperties.get(name).getStart(
                baselineGraph.sourceFile,
              ),
              baselineGraph.topLevelProperties.get(name).end,
            ),
        ),
        expectedDescriptor(expected),
      )
      assert.deepEqual(
        descriptor(
          rawBytes
            .toString('utf8')
            .slice(
              rawGraph.topLevelProperties.get(name).getStart(
                rawGraph.sourceFile,
              ),
              rawGraph.topLevelProperties.get(name).end,
            ),
        ),
        expectedDescriptor(expected),
      )
    }
  },
)

test(
  'configured raw or packaged source remains an exact no-replay state with stable owner context',
  { skip: !selected },
  () => {
    const sourceFilename = path.join(configuredSourceRoot(), 'main.tsx')
    const sourceBytes = fs.readFileSync(sourceFilename)
    const state = identifySourceState(sourceBytes)
    const source = sourceBytes.toString('utf8')
    const graph = authoredSourceGraph(source)
    assert.deepEqual(graph.runDescriptor, state.run)
    assert.deepEqual(graph.initialStateDescriptor, state.initialState)
    for (const name of fixture.sourceGraph.expectedAbsentInitialStateProperties) {
      assert.equal(graph.allPropertyNames.includes(name), false)
    }
    for (const [name, expected] of Object.entries(
      fixture.sourceGraph.stableProperties,
    )) {
      assert.deepEqual(
        graph.propertyDescriptor(name),
        {
          ...graph.propertyDescriptor(name),
          ...expectedDescriptor(expected),
        },
      )
    }
    assert.equal(
      TARGET121_MAIN_RUN_TEAMMATE_COLORS_INDEX_OWNER_EVIDENCE.paths[0],
      'src/main.tsx',
    )
    assert.equal(
      fixture.inputs.frozenPostDangerousSnapshot.coverageRow.ownerIds[0],
      'owner-src-main-tsx',
    )
    assert.equal(
      fixture.sourceGraph.decision,
      'retained-compiled-static-proof-source-replay-blocked',
    )
  },
)
