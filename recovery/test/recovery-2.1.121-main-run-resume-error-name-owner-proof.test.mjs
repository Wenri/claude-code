import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import * as ownerEvidenceModule from '../cases/2.1.120-to-2.1.121/recovered/main-run-resume-error-name-owner-evidence.mjs'

const {
  TARGET121_MAIN_RUN_RESUME_ERROR_NAME_EVIDENCE_IDS,
  TARGET121_MAIN_RUN_RESUME_ERROR_NAME_OWNER_EVIDENCE,
} = ownerEvidenceModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-main-run-resume-error-name-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'ac974895b33c5432ff4fd18e9ed7c662646af65e622f4afc123ea176f6a72ac6'

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
    'error_name proof requires one exact known report/coverage phase; unknown and hybrid pairs are forbidden',
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

function exactCompiledNode(parsed, unitStart, node) {
  return {
    start: unitStart + node.start,
    end: unitStart + node.end,
    ...descriptor(parsed.text.slice(node.start, node.end)),
  }
}

function compiledResumeGraph(parsed, unitStart, rowStart) {
  const parents = new Map()
  let key
  function walk(node, parent = null) {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) walk(child, parent)
      return
    }
    if (typeof node.type === 'string') {
      parents.set(node, parent)
      if (unitStart + node.start === rowStart) key = node
    }
    for (const [name, child] of Object.entries(node)) {
      if (!['start', 'end'].includes(name)) walk(child, node)
    }
  }
  walk(parsed.ast)
  assert.equal(key?.type, 'Identifier')
  assert.equal(key.name, 'error_name')
  const property = parents.get(key)
  const object = parents.get(property)
  let catchClause = property
  while (catchClause && catchClause.type !== 'CatchClause') {
    catchClause = parents.get(catchClause)
  }
  assert.ok(catchClause)
  const tryStatement = parents.get(catchClause)
  assert.equal(tryStatement.type, 'TryStatement')
  return {
    property: exactCompiledNode(parsed, unitStart, property),
    object: exactCompiledNode(parsed, unitStart, object),
    propertyNames: object.properties.map(
      item => item.key.name ?? item.key.value,
    ),
    catchClause: exactCompiledNode(parsed, unitStart, catchClause),
    catchText: parsed.text.slice(catchClause.start, catchClause.end),
    tryStatement: exactCompiledNode(parsed, unitStart, tryStatement),
    tryText: parsed.text.slice(tryStatement.start, tryStatement.end),
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

function authoredResumeGraph(source) {
  const ts = typescript()
  const sourceFile = ts.createSourceFile(
    'main.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.deepEqual(sourceFile.parseDiagnostics, [])
  const parents = new Map()
  const catches = []
  function visit(node, parent = null) {
    parents.set(node, parent)
    if (
      ts.isCatchClause(node) &&
      node.getText(sourceFile).includes('Failed to resume session ')
    ) {
      catches.push(node)
    }
    ts.forEachChild(node, child => visit(child, node))
  }
  visit(sourceFile)
  assert.equal(catches.length, 1)
  const catchClause = catches[0]
  const tryStatement = parents.get(catchClause)
  assert.ok(ts.isTryStatement(tryStatement))
  const calls = []
  function visitCatch(node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(sourceFile) === 'logEvent' &&
      node.arguments[0]?.getText(sourceFile) ===
        "'tengu_session_resumed'"
    ) {
      calls.push(node)
    }
    ts.forEachChild(node, visitCatch)
  }
  visitCatch(catchClause)
  assert.equal(calls.length, 1)
  const call = calls[0]
  const object = call.arguments[1]
  assert.ok(ts.isObjectLiteralExpression(object))
  return {
    sourceFile,
    tryDescriptor: sourceNodeDescriptor(
      source,
      sourceFile,
      tryStatement,
    ),
    catchDescriptor: sourceNodeDescriptor(
      source,
      sourceFile,
      catchClause,
    ),
    callDescriptor: sourceNodeDescriptor(source, sourceFile, call),
    objectDescriptor: sourceNodeDescriptor(source, sourceFile, object),
    propertyNames: object.properties.map(item =>
      item.name.getText(sourceFile),
    ),
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
  'fixture freezes one owner-added-only error_name row and sequential accounting',
  { skip: !selected },
  () => {
    assert.deepEqual(descriptor(fixtureBytes), {
      bytes: 14561,
      sha256: FIXTURE_SHA256,
    })
    assert.deepEqual(
      descriptor(
        fs.readFileSync(
          path.join(repositoryRoot, fixture.caseFiles.helper.path),
        ),
      ),
      expectedDescriptor(fixture.caseFiles.helper),
    )
    assert.deepEqual(
      [...TARGET121_MAIN_RUN_RESUME_ERROR_NAME_EVIDENCE_IDS],
      fixture.evidenceIds,
    )
    assert.ok(
      Object.isFrozen(TARGET121_MAIN_RUN_RESUME_ERROR_NAME_OWNER_EVIDENCE),
    )
    assert.ok(
      Object.isFrozen(
        TARGET121_MAIN_RUN_RESUME_ERROR_NAME_OWNER_EVIDENCE.residues,
      ),
    )
    assert.equal(
      Object.keys(ownerEvidenceModule).some(name => /OVERRIDES?/.test(name)),
      false,
    )
    const residue =
      TARGET121_MAIN_RUN_RESUME_ERROR_NAME_OWNER_EVIDENCE.residues[0]
    assert.deepEqual(
      [
        TARGET121_MAIN_RUN_RESUME_ERROR_NAME_OWNER_EVIDENCE.targetIndex,
        residue.literalKind,
        residue.value,
        residue.start,
        residue.end,
        13,
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
          { ...descriptor(reportBytes), bytes: reportBytes.length + 1 },
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
    const phases = [
      'postDangerousActual',
      'afterFirstAllowed',
      'afterSecondAllowed',
      'afterGrowthbook300',
      'afterSeparateSessionState',
      'afterIndex',
      'afterThisErrorName',
    ].map(name => fixture.cumulativeAccounting[name])
    for (let index = 1; index < phases.length; index += 1) {
      assert.deepEqual(phases[index], {
        owner: phases[index - 1].owner - 1,
        added: phases[index - 1].added - 1,
        strict: phases[index - 1].strict,
      })
    }
    assert.deepEqual(fixture.cumulativeAccounting.afterThisErrorName, {
      owner: 193,
      added: 9,
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
  'authenticated bundles prove one unrelated insertion and one retained CLI-resume catch',
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
    for (const unit of [fixture.targetUnit, fixture.insertedTargetUnit]) {
      const region = ledger.regions.find(
        row => row.target?.index === unit.targetIndex,
      )
      assert.ok(region)
      assert.equal(region.classification, unit.classification)
      assert.equal(
        region.unknownFreeIdentifierCount,
        unit.unknownFreeIdentifierCount,
      )
      assert.deepEqual(structuralTargetDescriptor(region), {
        targetIndex: unit.targetIndex,
        nodeType: unit.nodeType,
        parseStatus: unit.parseStatus,
        start: unit.start,
        end: unit.end,
        tokenCount: unit.tokenCount,
        sha256: unit.sha256,
        coarseHash: unit.coarseHash,
        line: unit.line,
        column: unit.column,
      })
    }
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
    const parsedInserted = parseUnit(
      target,
      fixture.insertedTargetUnit,
      'Target121 reportRenderError',
    )
    const baselineGraph = compiledResumeGraph(
      parsedBaseline,
      fixture.baselineUnit.start,
      fixture.compiledRetention.occurrences.retainedBaselineStart,
    )
    const targetGraph = compiledResumeGraph(
      parsedTarget,
      fixture.targetUnit.start,
      fixture.compiledRetention.occurrences.retainedTargetStart,
    )
    assert.deepEqual(
      baselineGraph.catchClause,
      fixture.compiledRetention.retainedCatch.baseline,
    )
    assert.deepEqual(
      targetGraph.catchClause,
      fixture.compiledRetention.retainedCatch.target,
    )
    assert.deepEqual(
      baselineGraph.tryStatement,
      fixture.compiledRetention.retainedTry.baseline,
    )
    assert.deepEqual(
      targetGraph.tryStatement,
      fixture.compiledRetention.retainedTry.target,
    )
    assert.deepEqual(
      baselineGraph.object,
      fixture.compiledRetention.telemetryObject.baseline,
    )
    assert.deepEqual(
      targetGraph.object,
      fixture.compiledRetention.telemetryObject.target,
    )
    assert.deepEqual(
      baselineGraph.property,
      fixture.compiledRetention.errorNameProperty.baseline,
    )
    assert.deepEqual(
      targetGraph.property,
      fixture.compiledRetention.errorNameProperty.target,
    )
    assert.deepEqual(
      baselineGraph.propertyNames,
      fixture.compiledRetention.telemetryObject.propertyNames,
    )
    assert.deepEqual(targetGraph.propertyNames, baselineGraph.propertyNames)
    for (const [baselineText, targetText, expected] of [
      [
        baselineGraph.catchText,
        targetGraph.catchText,
        fixture.compiledRetention.retainedCatch.identifierNormalizedTokens,
      ],
      [
        baselineGraph.tryText,
        targetGraph.tryText,
        fixture.compiledRetention.retainedTry.identifierNormalizedTokens,
      ],
    ]) {
      const baselineTokens = identifierNormalizedTokens(baselineText)
      const targetTokens = identifierNormalizedTokens(targetText)
      assert.deepEqual(targetTokens, baselineTokens)
      assert.equal(baselineTokens.length, expected.count)
      assert.deepEqual(
        canonicalDescriptor(baselineTokens),
        expectedDescriptor(expected),
      )
    }
    assert.deepEqual(
      findAll(baseline, 'error_name'),
      fixture.compiledRetention.occurrences.baseline,
    )
    assert.deepEqual(
      findAll(target, 'error_name'),
      fixture.compiledRetention.occurrences.target,
    )
    const inserted = fixture.compiledRetention.insertedRenderError
    assert.deepEqual(
      descriptor(
        target.subarray(inserted.unit.start, inserted.unit.end),
      ),
      expectedDescriptor(inserted.unit),
    )
    assert.deepEqual(
      descriptor(
        target.subarray(inserted.property.start, inserted.property.end),
      ),
      expectedDescriptor(inserted.property),
    )
    assert.deepEqual(
      descriptor(
        target.subarray(
          inserted.eventObject.start,
          inserted.eventObject.end,
        ),
      ),
      expectedDescriptor(inserted.eventObject),
    )
    assert.match(parsedInserted.text, /source:"react_render"/)
  },
)

test(
  'Target120 and raw Target121 authored catch graphs are exact and omit the retained compiled fields',
  { skip: !selected },
  () => {
    const baselineBytes = readExact(
      path.resolve(
        repositoryRoot,
        fixture.inputs.sourceRoots.baseline,
        'main.tsx',
      ),
      fixture.sourceGraph.baseline.file,
      'Target120 source main.tsx',
    )
    const rawBytes = readExact(
      path.resolve(
        repositoryRoot,
        fixture.inputs.sourceRoots.raw,
        'main.tsx',
      ),
      fixture.sourceGraph.states[0].file,
      'raw Target121 source main.tsx',
    )
    const baselineGraph = authoredResumeGraph(baselineBytes.toString('utf8'))
    const rawGraph = authoredResumeGraph(rawBytes.toString('utf8'))
    assert.deepEqual(
      baselineGraph.tryDescriptor,
      fixture.sourceGraph.baseline.try,
    )
    assert.deepEqual(
      rawGraph.tryDescriptor,
      fixture.sourceGraph.states[0].try,
    )
    assert.deepEqual(
      baselineGraph.catchDescriptor,
      fixture.sourceGraph.baseline.catch,
    )
    assert.deepEqual(
      rawGraph.catchDescriptor,
      fixture.sourceGraph.states[0].catch,
    )
    assert.deepEqual(
      baselineGraph.callDescriptor,
      fixture.sourceGraph.baseline.telemetryCall,
    )
    assert.deepEqual(
      rawGraph.callDescriptor,
      fixture.sourceGraph.states[0].telemetryCall,
    )
    assert.deepEqual(
      baselineGraph.objectDescriptor,
      fixture.sourceGraph.baseline.telemetryObject,
    )
    assert.deepEqual(
      rawGraph.objectDescriptor,
      fixture.sourceGraph.states[0].telemetryObject,
    )
    assert.deepEqual(
      baselineGraph.propertyNames,
      fixture.sourceGraph.authoredTelemetryProperties,
    )
    assert.deepEqual(rawGraph.propertyNames, baselineGraph.propertyNames)
    for (const name of fixture.sourceGraph.compiledOnlyRetainedProperties) {
      assert.equal(baselineGraph.propertyNames.includes(name), false)
      assert.equal(rawGraph.propertyNames.includes(name), false)
    }
  },
)

test(
  'configured raw or packaged source is an exact static-only state and never a replay donor',
  { skip: !selected },
  () => {
    const sourceBytes = fs.readFileSync(
      path.join(configuredSourceRoot(), 'main.tsx'),
    )
    const state = identifySourceState(sourceBytes)
    const graph = authoredResumeGraph(sourceBytes.toString('utf8'))
    assert.deepEqual(graph.tryDescriptor, state.try)
    assert.deepEqual(graph.catchDescriptor, state.catch)
    assert.deepEqual(graph.callDescriptor, state.telemetryCall)
    assert.deepEqual(graph.objectDescriptor, state.telemetryObject)
    assert.deepEqual(
      graph.propertyNames,
      fixture.sourceGraph.authoredTelemetryProperties,
    )
    for (const name of fixture.sourceGraph.compiledOnlyRetainedProperties) {
      assert.equal(graph.propertyNames.includes(name), false)
    }
    assert.equal(
      TARGET121_MAIN_RUN_RESUME_ERROR_NAME_OWNER_EVIDENCE.paths[0],
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
