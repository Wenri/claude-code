import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import * as ownerEvidenceModule from '../cases/2.1.120-to-2.1.121/recovered/main-run-is-absolute-owner-evidence.mjs'

const {
  TARGET121_MAIN_RUN_IS_ABSOLUTE_EVIDENCE_IDS,
  TARGET121_MAIN_RUN_IS_ABSOLUTE_OWNER_EVIDENCE,
} = ownerEvidenceModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-main-run-is-absolute-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '05bf0d86baacbfb9fc75acc23ebb5ababc23eb6eb9f147fd2e39a5c3da8986be'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function expectedDescriptor(expected) {
  return { bytes: expected.bytes, sha256: expected.sha256 }
}

function canonicalDescriptor(value) {
  return descriptor(Buffer.from(JSON.stringify(value)))
}

function matchesDescriptor(actual, expected) {
  return (
    actual.bytes === expected.bytes && actual.sha256 === expected.sha256
  )
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

function selectFrozenSnapshot(reportDescriptor, coverageDescriptor) {
  const matches = [
    ['postDangerousReplay', fixture.inputs.frozenSnapshot],
    ['postPrune', fixture.inputs.postPruneSnapshot],
    ['postDaemonOwner', fixture.inputs.postDaemonOwnerSnapshot],
  ].filter(
    ([, frozen]) =>
      matchesDescriptor(reportDescriptor, frozen.typedReport) &&
      matchesDescriptor(coverageDescriptor, frozen.sourceCoverage),
  )
  assert.equal(
    matches.length,
    1,
    'isAbsolute proof accepts only an exact known report/coverage pair; unknown, prior, and hybrid descriptors are forbidden',
  )
  return matches[0][0]
}

function sourceStateFor(actualDescriptor) {
  const sourceFile = fixture.inputs.sourceFile
  const states = {
    ...sourceFile.acceptedStates,
    postPrunePackage: {
      ...sourceFile.acceptedStates.postDangerousPackage,
      ...sourceFile.postPruneSourceState,
    },
  }
  const matches = Object.entries(states).filter(([, state]) =>
    matchesDescriptor(actualDescriptor, state.file),
  )
  assert.equal(
    matches.length,
    1,
    'src/main.tsx must be one exact frozen raw/package state',
  )
  return matches[0]
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

function nodeDescriptor(text, node, unitStart = 0) {
  return {
    localStart: node.start,
    localEnd: node.end,
    start: unitStart + node.start,
    end: unitStart + node.end,
    ...descriptor(text.slice(node.start, node.end)),
  }
}

function sourceNodeDescriptor(source, sourceFile, node) {
  const start = node.getStart(sourceFile)
  const end = node.end
  return { start, end, ...descriptor(source.slice(start, end)) }
}

function normalizedTokenDescriptor(text) {
  const tokens = [...tokenizer(text, { ecmaVersion: 'latest' })].map(token => [
    token.type.label,
    token.type.label === 'name' ? '@id' : (token.value ?? null),
  ])
  return { count: tokens.length, ...canonicalDescriptor(tokens) }
}

function acornNodes(root) {
  const nodes = []
  const parents = new Map()
  function visit(node, parent = null) {
    if (!node || typeof node !== 'object') return
    if (typeof node.type === 'string') {
      nodes.push(node)
      parents.set(node, parent)
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'type' || key === 'start' || key === 'end') continue
      if (Array.isArray(value)) {
        for (const child of value) visit(child, node)
      } else {
        visit(value, node)
      }
    }
  }
  visit(root)
  return { nodes, parents }
}

function parseUnit(bundle, unit, label) {
  const bytes = bundle.subarray(unit.start, unit.end)
  assert.deepEqual(descriptor(bytes), expectedDescriptor(unit), label)
  const text = bytes.toString('utf8')
  const ast = parse(text, { ecmaVersion: 'latest', sourceType: 'script' })
  assert.equal(ast.body.length, 1, `${label}: one complete unit`)
  assert.equal(ast.body[0].type, unit.nodeType, label)
  assert.equal(ast.body[0].id?.name, unit.name, label)
  assert.equal(ast.body[0].async, unit.async, label)
  assert.equal(
    [...tokenizer(text, { ecmaVersion: 'latest' })].length,
    unit.tokenCount,
    `${label}: token count`,
  )
  return { ast, text }
}

function telemetryValue(node) {
  if (node.type === 'Literal') return node.value
  if (
    node.type === 'UnaryExpression' &&
    node.operator === '!' &&
    node.argument.type === 'Literal'
  ) {
    return !node.argument.value
  }
  assert.fail(`unexpected telemetry value node ${node.type}`)
}

function findCompiledGraph(parsed, unitStart, keyStart) {
  const { nodes, parents } = acornNodes(parsed.ast)
  const localKeyStart = keyStart - unitStart
  const callee = nodes.find(
    node =>
      node.type === 'MemberExpression' &&
      node.computed === false &&
      node.property?.name === 'isAbsolute' &&
      node.property.start === localKeyStart,
  )
  assert.ok(callee, 'one exact path.isAbsolute member')
  const testCall = parents.get(callee)
  assert.equal(testCall.type, 'CallExpression')
  assert.equal(testCall.callee, callee)
  assert.equal(testCall.arguments.length, 1)
  const ifStatement = parents.get(testCall)
  assert.equal(ifStatement.type, 'IfStatement')
  assert.equal(ifStatement.test, testCall)
  assert.equal(ifStatement.alternate, null)
  const consequent = ifStatement.consequent
  assert.equal(consequent.type, 'ExpressionStatement')
  const telemetryCall = consequent.expression
  assert.equal(telemetryCall.type, 'CallExpression')
  assert.equal(telemetryCall.arguments.length, 2)
  const telemetryObject = telemetryCall.arguments[1]
  assert.equal(telemetryObject.type, 'ObjectExpression')
  const argument = testCall.arguments[0]
  assert.equal(argument.type, 'MemberExpression')
  const selectedNodes = {
    ifStatement,
    test: testCall,
    callee,
    key: callee.property,
    argument,
    consequent,
    telemetryObject,
  }
  const descriptors = Object.fromEntries(
    Object.entries(selectedNodes).map(([name, node]) => [
      name,
      nodeDescriptor(parsed.text, node, unitStart),
    ]),
  )
  const normalized = Object.fromEntries(
    Object.entries(selectedNodes).map(([name, node]) => [
      name,
      normalizedTokenDescriptor(parsed.text.slice(node.start, node.end)),
    ]),
  )
  const shape = {
    testProperty: callee.property.name,
    argumentProperty: argument.property.name,
    telemetryEvent: telemetryCall.arguments[0].value,
    telemetryProperties: telemetryObject.properties.map(property => [
      property.key.name,
      telemetryValue(property.value),
    ]),
  }
  return {
    descriptors,
    normalized,
    shape,
    pathBindingName: callee.object.name,
  }
}

function compiledDependency(bundle, expected, bindingName) {
  const bytes = bundle.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(bytes), expectedDescriptor(expected))
  const text = bytes.toString('utf8')
  assert.equal(text, `${bindingName}=require("path")`)
  return {
    normalized: normalizedTokenDescriptor(text),
    bindingName,
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

function tsNodes(root, ts) {
  const nodes = []
  function visit(node) {
    nodes.push(node)
    ts.forEachChild(node, visit)
  }
  visit(root)
  return nodes
}

function authoredResumeGraph(ts, sourceFile, source) {
  const nodes = tsNodes(sourceFile, ts)
  const runs = nodes.filter(
    node => ts.isFunctionDeclaration(node) && node.name?.text === 'run',
  )
  assert.equal(runs.length, 1)
  const imports = nodes.filter(
    node =>
      ts.isImportDeclaration(node) && node.moduleSpecifier.text === 'path',
  )
  assert.equal(imports.length, 1)
  const pathImport = imports[0]
  const pathImportNames = pathImport.importClause.namedBindings.elements.map(
    element => element.name.text,
  )
  const resolvedDeclarations = nodes.filter(
    node =>
      ts.isVariableDeclaration(node) &&
      node.name.getText(sourceFile) === 'resolvedPath' &&
      node.initializer?.getText(sourceFile) === 'resolve(options.resume)',
  )
  assert.equal(resolvedDeclarations.length, 1)
  const resolvedDeclaration = resolvedDeclarations[0]
  let resolvedPathStatement = resolvedDeclaration
  while (!ts.isVariableStatement(resolvedPathStatement)) {
    resolvedPathStatement = resolvedPathStatement.parent
  }
  const block = resolvedPathStatement.parent
  assert.ok(ts.isBlock(block))
  const statementIndex = block.statements.indexOf(resolvedPathStatement)
  assert.ok(statementIndex >= 0)
  const tryStatement = block.statements[statementIndex + 1]
  assert.ok(ts.isTryStatement(tryStatement))
  const loadCalls = nodes.filter(
    node =>
      ts.isCallExpression(node) &&
      node.expression.getText(sourceFile) === 'loadTranscriptFromFile' &&
      node.arguments[0]?.getText(sourceFile) === 'resolvedPath',
  )
  assert.equal(loadCalls.length, 1)
  const logOptionIfs = nodes.filter(
    node =>
      ts.isIfStatement(node) && node.expression.getText(sourceFile) === 'logOption',
  )
  assert.equal(logOptionIfs.length, 1)
  const logOptionIf = logOptionIfs[0]
  const innerFailureCalls = nodes.filter(
    node =>
      ts.isCallExpression(node) &&
      node.expression.getText(sourceFile) === 'logEvent' &&
      node.arguments[0]?.getText(sourceFile) === "'tengu_session_resumed'" &&
      node.getStart(sourceFile) > logOptionIf.getStart(sourceFile) &&
      node.end < logOptionIf.end &&
      node.arguments[1]?.getText(sourceFile).includes('success: false'),
  )
  assert.equal(innerFailureCalls.length, 1)
  const innerFailureCall = innerFailureCalls[0]
  const innerFailureObject = innerFailureCall.arguments[1]
  assert.ok(ts.isObjectLiteralExpression(innerFailureObject))
  return {
    run: sourceNodeDescriptor(source, sourceFile, runs[0]),
    pathImport: sourceNodeDescriptor(source, sourceFile, pathImport),
    pathImportModule: pathImport.moduleSpecifier.text,
    pathImportNames,
    resolvedPathStatement: sourceNodeDescriptor(
      source,
      sourceFile,
      resolvedPathStatement,
    ),
    resolvedPathInitializer: resolvedDeclaration.initializer.getText(sourceFile),
    tryStatement: sourceNodeDescriptor(source, sourceFile, tryStatement),
    loadTranscriptCall: sourceNodeDescriptor(source, sourceFile, loadCalls[0]),
    loadTranscriptArgument: loadCalls[0].arguments[0].getText(sourceFile),
    logOptionIf: sourceNodeDescriptor(source, sourceFile, logOptionIf),
    logOptionHasElse: Boolean(logOptionIf.elseStatement),
    innerFailureCall: sourceNodeDescriptor(
      source,
      sourceFile,
      innerFailureCall,
    ),
    innerFailureObject: sourceNodeDescriptor(
      source,
      sourceFile,
      innerFailureObject,
    ),
    innerFailurePropertyNames: innerFailureObject.properties.map(
      property => property.name?.getText(sourceFile),
    ),
  }
}

test('fixture and helper freeze only isAbsolute after separate index ownership', { skip: !selected }, () => {
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, caseName)
  assert.deepEqual(descriptor(fixtureBytes), {
      bytes: 22519,
    sha256: FIXTURE_SHA256,
  })
  assert.deepEqual(
    Object.keys(ownerEvidenceModule).sort(),
    [
      'TARGET121_MAIN_RUN_IS_ABSOLUTE_EVIDENCE_IDS',
      'TARGET121_MAIN_RUN_IS_ABSOLUTE_OWNER_EVIDENCE',
    ],
  )
  readExact(
    path.join(repositoryRoot, fixture.caseFiles.helper.path),
    fixture.caseFiles.helper,
    'frozen isAbsolute helper',
  )
  assert.equal(Object.isFrozen(TARGET121_MAIN_RUN_IS_ABSOLUTE_EVIDENCE_IDS), true)
  assert.equal(Object.isFrozen(TARGET121_MAIN_RUN_IS_ABSOLUTE_OWNER_EVIDENCE), true)
  assert.equal(
    Object.isFrozen(TARGET121_MAIN_RUN_IS_ABSOLUTE_OWNER_EVIDENCE.residues),
    true,
  )
  assert.equal(
    Object.isFrozen(TARGET121_MAIN_RUN_IS_ABSOLUTE_OWNER_EVIDENCE.residues[0]),
    true,
  )
  assert.deepEqual(
    TARGET121_MAIN_RUN_IS_ABSOLUTE_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
  assert.deepEqual(TARGET121_MAIN_RUN_IS_ABSOLUTE_OWNER_EVIDENCE.residues, [
    {
      literalKind: 'property',
      value: 'isAbsolute',
      start: 13822198,
      end: 13822208,
      targetOccurrenceNumber: 75,
    },
  ])
  assert.deepEqual(
    TARGET121_MAIN_RUN_IS_ABSOLUTE_OWNER_EVIDENCE.paths,
    ['src/main.tsx'],
  )
  assert.deepEqual(
    TARGET121_MAIN_RUN_IS_ABSOLUTE_OWNER_EVIDENCE.declarations,
    ['run'],
  )
  assert.equal(
    TARGET121_MAIN_RUN_IS_ABSOLUTE_OWNER_EVIDENCE.residues.some(
      residue => residue.value === 'index' || residue.value === 'error_name',
    ),
    false,
  )
  for (const forbidden of ['apply', 'build', 'replay', 'override', 'coverage']) {
    assert.equal(
      Object.keys(TARGET121_MAIN_RUN_IS_ABSOLUTE_OWNER_EVIDENCE).some(key =>
        key.toLowerCase().includes(forbidden),
      ),
      false,
    )
  }

  const ordered = []
  for (const proof of fixture.inputs.priorStaticProofs) {
    const priorFixture = JSON.parse(
      readExact(
        path.join(repositoryRoot, proof.fixture.path),
        proof.fixture,
        `${proof.name} frozen fixture`,
      ),
    )
    readExact(
      path.join(repositoryRoot, proof.helper.path),
      proof.helper,
      `${proof.name} frozen helper`,
    )
    assert.deepEqual(priorFixture.staticAdmission.ownerResidue, proof.residue)
    ordered.push(proof.residue)
  }
  assert.equal(
    fixture.inputs.externalPriorAdmission.status,
    'forecast dependency only; not audited or claimed here',
  )
  ordered.push(fixture.inputs.externalPriorAdmission.residue)
  ordered.push(fixture.staticAdmission.ownerResidue)
  assert.deepEqual(
    ordered.map(row => row[2]),
    [...ordered.map(row => row[2])].sort((left, right) => left - right),
  )
  assert.equal(new Set(ordered.map(JSON.stringify)).size, 6)
})

test('exact snapshot proves independent and cumulative static accounting', { skip: !selected }, () => {
  const frozen = fixture.inputs.postDaemonOwnerSnapshot
  const reportBytes = readExact(
    artifactPath('CLAUDE_CODE_TARGET121_TYPED_REPORT', frozen.typedReport),
    frozen.typedReport,
    'exact post-prune Target121 typed report',
  )
  const coverageGzip = readExact(
    artifactPath(
      'CLAUDE_CODE_TARGET121_SOURCE_COVERAGE',
      frozen.sourceCoverage,
    ),
    frozen.sourceCoverage,
    'byte-identical Target121 source coverage',
  )
  assert.equal(
    selectFrozenSnapshot(descriptor(reportBytes), descriptor(coverageGzip)),
    'postDaemonOwner',
  )
  for (const rejected of fixture.inputs.knownRejectedReportStates) {
    assert.throws(
      () =>
        selectFrozenSnapshot(
          expectedDescriptor(rejected),
          descriptor(coverageGzip),
        ),
      /unknown, prior, and hybrid descriptors are forbidden/,
    )
  }
  assert.throws(
    () =>
      selectFrozenSnapshot(
        { ...descriptor(reportBytes), bytes: reportBytes.length + 1 },
        descriptor(coverageGzip),
      ),
    /unknown, prior, and hybrid descriptors are forbidden/,
  )
  assert.throws(
    () =>
      selectFrozenSnapshot(descriptor(reportBytes), {
        ...descriptor(coverageGzip),
        sha256: '0'.repeat(64),
      }),
    /unknown, prior, and hybrid descriptors are forbidden/,
  )

  const report = JSON.parse(reportBytes)
  assert.deepEqual(
    {
      ownerRows: report.sourceRuntimeOwnerResidueRows.length,
      addedRows: report.sourceRuntimeAddedOwnerResidueRows.length,
      strictRows: report.rows.length,
    },
    frozen.global,
  )
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
  const phase = fixture.postDaemonOwnerReportSnapshot
  const expected = {
    ...fixture.reportSnapshot,
    ownerRows: phase.ownerRows,
    addedRows: {
      ...phase.addedRows,
      exact: [...fixture.reportSnapshot.addedRows.exact,...phase.restoredAddedRowsExact].sort((left,right)=>left[2]-right[2]),
    },
    strictRows: phase.strictRows,
  }
  assert.equal(ownerRows.length, expected.ownerRows.count)
  assert.equal(addedRows.length, expected.addedRows.count)
  assert.equal(strictRows.length, expected.strictRows.count)
  assert.deepEqual(canonicalDescriptor(ownerRows), expected.ownerRows.full)
  const ownerIdentities = ownerRows.map(reportIdentity)
  assert.deepEqual(
    canonicalDescriptor(ownerIdentities),
    expected.ownerRows.identities,
  )
  assert.deepEqual(canonicalDescriptor(addedRows), expected.addedRows.full)
  const addedIdentities = addedRows.map(reportIdentity)
  assert.deepEqual(addedIdentities, expected.addedRows.exact)
  assert.deepEqual(
    canonicalDescriptor(addedIdentities),
    expected.addedRows.identities,
  )
  assert.deepEqual(canonicalDescriptor(strictRows), expected.strictRows.full)
  const strictIdentities = strictRows.map(strictIdentity)
  assert.deepEqual(
    canonicalDescriptor(strictIdentities),
    expected.strictRows.identities,
  )

  const selectedRows = addedRows.filter(row => row.value === 'isAbsolute')
  assert.equal(selectedRows.length, 1)
  assert.deepEqual(reportIdentity(selectedRows[0]), expected.isAbsoluteRow.identity)
  assert.deepEqual(
    canonicalDescriptor(selectedRows[0]),
    expected.isAbsoluteRow.full,
  )
  assert.equal(selectedRows[0].disposition, expected.isAbsoluteRow.disposition)
  assert.deepEqual(selectedRows[0].ownerPaths, expected.isAbsoluteRow.ownerPaths)
  assert.deepEqual(
    selectedRows[0].ownerSourceMatches,
    expected.isAbsoluteRow.ownerSourceMatches,
  )
  assert.equal(
    strictIdentities.some(row => row[2] === 'isAbsolute'),
    false,
    'isAbsolute is owner-added but not raw-strict',
  )
  assert.deepEqual(
    ownerIdentities.filter(row =>
      fixture.replayScopeRejection.collateralOwnerResidues.some(
        collateral => JSON.stringify(collateral) === JSON.stringify(row),
      ),
    ),
    fixture.replayScopeRejection.collateralOwnerResidues,
  )

  const restoredPhysicalRows = new Set(
    phase.restoredAddedRowsExact.map(JSON.stringify),
  )
  const classifiedAddedIdentities = addedIdentities.filter(
    row => !restoredPhysicalRows.has(JSON.stringify(row)),
  )
  const groups = fixture.staticAdmission.classification
  const allOrdinals = [
    ...groups.cumulativeStaticOrdinals,
    ...groups.separatelyHandledBuildMacroOrdinals,
    ...groups.outOfScopeProductionOrdinals,
  ].sort((left, right) => left - right)
  assert.deepEqual(
    allOrdinals,
    classifiedAddedIdentities.map((_, index) => index),
  )
  assert.equal(new Set(allOrdinals).size, classifiedAddedIdentities.length)
  assert.deepEqual(
    groups.casePriorStaticOrdinals.map(index => classifiedAddedIdentities[index]),
    fixture.staticAdmission.casePriorResidues,
  )
  assert.deepEqual(
    groups.externalPriorStaticOrdinals.map(index => classifiedAddedIdentities[index]),
    [fixture.staticAdmission.externalPriorResidue],
  )
  assert.deepEqual(
    groups.ownedStaticOrdinals.map(index => classifiedAddedIdentities[index]),
    [fixture.staticAdmission.ownerResidue],
  )
  assert.equal(
    classifiedAddedIdentities[groups.outOfScopeProductionOrdinals[0]][1],
    groups.explicitlyDeferredValue,
  )

  assert.deepEqual(fixture.staticAdmission.independentCurrentBaseImpact, {
    rawOwnerRows: 199,
    rawAddedRows: 15,
    ownedByThisProofOwnerAddedRows: 1,
    rawStrictRowsRemoved: 0,
    coverageRowsAddedOrReplaced: 0,
    predictedOwnerRows: 198,
    predictedAddedRows: 14,
    predictedStrictRows: 8,
    predictedCoverageRows: 1,
  })
  assert.deepEqual(fixture.staticAdmission.cumulativeImpact, {
    rawOwnerRows: 199,
    rawAddedRows: 15,
    casePriorStaticOwnerAddedRows: 4,
    externalPriorStaticOwnerAddedRows: 1,
    priorPredictedOwnerRows: 194,
    priorPredictedAddedRows: 10,
    ownedByThisProofOwnerAddedRows: 1,
    cumulativeAdmittedOwnerAddedRows: 6,
    remainingOutOfScopeProductionRows: 3,
    separatelyHandledBuildMacroRows: 6,
    rawStrictRowsRemoved: 0,
    coverageRowsAddedOrReplaced: 0,
    predictedOwnerRows: 193,
    predictedAddedRows: 9,
    predictedStrictRows: 8,
    predictedCoverageRows: 1,
  })
  const cumulative = fixture.staticAdmission.cumulativeImpact
  assert.equal(
    cumulative.rawOwnerRows -
      cumulative.casePriorStaticOwnerAddedRows -
      cumulative.externalPriorStaticOwnerAddedRows,
    cumulative.priorPredictedOwnerRows,
  )
  assert.equal(
    cumulative.priorPredictedOwnerRows -
      cumulative.ownedByThisProofOwnerAddedRows,
    cumulative.predictedOwnerRows,
  )
  assert.equal(
    cumulative.priorPredictedAddedRows -
      cumulative.ownedByThisProofOwnerAddedRows,
    cumulative.predictedAddedRows,
  )

  const coverageRaw = gunzipSync(coverageGzip)
  assert.deepEqual(descriptor(coverageRaw), {
    bytes: frozen.sourceCoverage.rawBytes,
    sha256: frozen.sourceCoverage.rawSha256,
  })
  const coverage = JSON.parse(coverageRaw)
  const coverageRows = coverage.rows.filter(
    row => row.targetIndex === targetIndex,
  )
  assert.equal(coverageRows.length, fixture.coverageRowsDescriptor.count)
  assert.deepEqual(
    canonicalDescriptor(coverageRows),
    expectedDescriptor(fixture.coverageRowsDescriptor),
  )
})

test('Target120 and Target121 retain the exact path dependency and branch', { skip: !selected }, () => {
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
  const ledger = JSON.parse(
    gunzipSync(
      readExact(
        path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
        fixture.inputs.structuralLedger,
        'authenticated structural ledger',
      ),
    ),
  )
  const targetRegion = ledger.regions.find(
    row => row.target?.index === fixture.targetUnit.targetIndex,
  )
  assert.ok(targetRegion)
  assert.equal(targetRegion.baselineUnitIndex, undefined)
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
    },
  )
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
  const baselineGraph = findCompiledGraph(
    baselineUnit,
    fixture.baselineSemanticCounterpart.start,
    fixture.compiledIsAbsoluteGraph.baseline.key.start,
  )
  const targetGraph = findCompiledGraph(
    targetUnit,
    fixture.targetUnit.start,
    fixture.staticAdmission.ownerResidue[2],
  )
  assert.deepEqual(
    baselineGraph.descriptors,
    fixture.compiledIsAbsoluteGraph.baseline,
  )
  assert.deepEqual(
    targetGraph.descriptors,
    fixture.compiledIsAbsoluteGraph.target,
  )
  assert.deepEqual(
    baselineGraph.normalized,
    fixture.compiledIsAbsoluteGraph.sharedNormalized,
  )
  assert.deepEqual(
    targetGraph.normalized,
    fixture.compiledIsAbsoluteGraph.sharedNormalized,
  )
  assert.deepEqual(
    baselineGraph.shape,
    fixture.compiledIsAbsoluteGraph.sharedShape,
  )
  assert.deepEqual(
    targetGraph.shape,
    fixture.compiledIsAbsoluteGraph.sharedShape,
  )
  assert.equal(
    targetGraph.descriptors.key.end,
    fixture.staticAdmission.ownerResidue[3],
  )
  const baselineDependency = compiledDependency(
    baseline,
    fixture.compiledPathDependency.baseline,
    baselineGraph.pathBindingName,
  )
  const targetDependency = compiledDependency(
    target,
    fixture.compiledPathDependency.target,
    targetGraph.pathBindingName,
  )
  assert.deepEqual(
    baselineDependency.normalized,
    fixture.compiledPathDependency.sharedNormalized,
  )
  assert.deepEqual(
    targetDependency.normalized,
    fixture.compiledPathDependency.sharedNormalized,
  )
})

test('raw/package source authenticates the resume boundary and rejects collateral replay', { skip: !selected }, () => {
  const sourceSpec = fixture.inputs.sourceFile
  const configuredSourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  const configuredFilename = configuredSourceRoot
    ? path.join(
        path.resolve(configuredSourceRoot),
        sourceSpec.path.replace(/^src\//, ''),
      )
    : path.join(repositoryRoot, sourceSpec.path)
  const sourceBytes = fs.readFileSync(configuredFilename)
  const [, expectedState] = sourceStateFor(descriptor(sourceBytes))
  assert.throws(
    () =>
      sourceStateFor({
        ...descriptor(sourceBytes),
        sha256: 'f'.repeat(64),
      }),
    /one exact frozen raw\/package state/,
  )
  const source = sourceBytes.toString('utf8')
  const ts = typescript()
  const sourceFile = ts.createSourceFile(
    sourceSpec.path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  const graph = authoredResumeGraph(ts, sourceFile, source)
  for (const name of [
    'run',
    'pathImport',
    'resolvedPathStatement',
    'tryStatement',
    'loadTranscriptCall',
    'logOptionIf',
    'innerFailureCall',
    'innerFailureObject',
  ]) {
    assert.deepEqual(graph[name], expectedState[name])
  }
  assert.equal(graph.pathImportModule, sourceSpec.sharedGraph.pathModule)
  assert.deepEqual(graph.pathImportNames, sourceSpec.sharedGraph.pathImportNames)
  assert.equal(
    graph.resolvedPathInitializer,
    sourceSpec.sharedGraph.resolvedPathInitializer,
  )
  assert.equal(
    graph.loadTranscriptArgument,
    sourceSpec.sharedGraph.loadTranscriptArgument,
  )
  assert.equal(graph.logOptionHasElse, sourceSpec.sharedGraph.logOptionHasElse)
  assert.equal(
    graph.pathImportNames.includes(sourceSpec.sharedGraph.forbiddenImportName),
    false,
  )
  for (const forbidden of sourceSpec.sharedGraph.forbiddenTelemetryProperties) {
    assert.equal(graph.innerFailurePropertyNames.includes(forbidden), false)
  }
  assert.equal((source.match(/\bisAbsolute\b/g) ?? []).length, 0)
  assert.equal((source.match(/\berror_name\b/g) ?? []).length, 0)
  assert.deepEqual(fixture.replayScopeRejection.collateralOwnerResidues, [
    ['property', 'failure_reason', 13822275, 13822289, 15, 12, false],
    ['string', 'not_found_explicit_id', 13822290, 13822313, 6, 5, false],
  ])
  assert.equal(
    fixture.replayScopeRejection.smallestClosedGraph,
    'path import edit plus the complete absolute-path alternate IfStatement',
  )
  assert.match(
    fixture.replayScopeRejection.reason,
    /not row-only.*two distinct retained owner residues/,
  )
})
