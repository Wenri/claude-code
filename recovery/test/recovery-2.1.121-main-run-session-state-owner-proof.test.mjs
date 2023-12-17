import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import * as ownerEvidenceModule from '../cases/2.1.120-to-2.1.121/recovered/main-run-session-state-owner-evidence.mjs'

const {
  TARGET121_MAIN_RUN_SESSION_STATE_EVIDENCE_IDS,
  TARGET121_MAIN_RUN_SESSION_STATE_OWNER_EVIDENCE,
} = ownerEvidenceModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-main-run-session-state-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'c8d8a01df44a6f60da7b38e4a8f39a375c1fd6eda769bba5f2805d717733785f'

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
    'sessionState proof accepts only an exact known report/coverage pair; unknown, prior, and hybrid descriptors are forbidden',
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
  const result = []
  function visit(node, parent = null) {
    if (!node || typeof node !== 'object') return
    if (typeof node.type === 'string') result.push([node, parent])
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
  return result
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

function findCompiledGraph(parsed, unitStart, keyStart) {
  const nodes = acornNodes(parsed.ast)
  const localKeyStart = keyStart - unitStart
  const propertyPair = nodes.find(
    ([node]) =>
      node.type === 'Property' &&
      node.computed === false &&
      node.key?.name === 'sessionState' &&
      node.key.start === localKeyStart,
  )
  assert.ok(propertyPair, 'one exact sessionState property')
  const [property, options] = propertyPair
  assert.equal(options.type, 'ObjectExpression')
  assert.equal(property.value.type, 'Identifier')
  const managerName = property.value.name
  const managerPair = [...nodes].reverse().find(
    ([node]) =>
      node.type === 'VariableDeclarator' &&
      node.id?.name === managerName &&
      node.init?.type === 'NewExpression' &&
      node.end < property.start,
  )
  assert.ok(managerPair, 'manager binding resolves before sessionState')
  const manager = managerPair[0]
  const storeCandidates = nodes.filter(([node]) => {
    if (
      node.type !== 'VariableDeclarator' ||
      node.init?.type !== 'CallExpression' ||
      node.start <= manager.end ||
      node.end >= property.start
    ) {
      return false
    }
    return node.init.arguments.some(
      argument =>
        argument.type === 'ArrowFunctionExpression' &&
        argument.body?.type === 'CallExpression' &&
        argument.body.arguments?.[1]?.type === 'Identifier' &&
        argument.body.arguments[1].name === managerName,
    )
  })
  assert.equal(storeCandidates.length, 1, 'one store callback captures manager')
  const store = storeCandidates[0][0]
  const callback = store.init.arguments.find(
    argument => argument.type === 'ArrowFunctionExpression',
  )
  const headlessCalls = nodes.filter(
    ([node]) =>
      node.type === 'CallExpression' && node.arguments?.includes(options),
  )
  assert.equal(headlessCalls.length, 1, 'one call owns the options object')
  const headlessCall = headlessCalls[0][0]
  const descriptors = {
    manager: nodeDescriptor(parsed.text, manager, unitStart),
    store: nodeDescriptor(parsed.text, store, unitStart),
    callback: nodeDescriptor(parsed.text, callback, unitStart),
    property: nodeDescriptor(parsed.text, property, unitStart),
    key: nodeDescriptor(parsed.text, property.key, unitStart),
  }
  const normalized = Object.fromEntries(
    Object.entries({ manager, store, callback, property, key: property.key }).map(
      ([name, node]) => [
        name,
        normalizedTokenDescriptor(parsed.text.slice(node.start, node.end)),
      ],
    ),
  )
  const shape = {
    managerInitializer: manager.init.type,
    storeInitializer: store.init.type,
    storeArgumentCount: store.init.arguments.length,
    callbackType: callback.type,
    callbackArgumentRoles: [
      callback.body.arguments[0]?.name === callback.params[0]?.name
        ? 'callback-parameter'
        : 'other',
      callback.body.arguments[1]?.name === managerName
        ? 'manager-binding'
        : 'other',
    ],
    propertyValueRole:
      property.value.name === managerName ? 'manager-binding' : 'other',
    headlessOptionsArgumentIndex: headlessCall.arguments.indexOf(options),
    propertyIndex: options.properties.indexOf(property),
    propertyCount: options.properties.length,
  }
  return { descriptors, normalized, shape }
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

function authoredMainGraph(ts, sourceFile, source) {
  const nodes = tsNodes(sourceFile, ts)
  const runs = nodes.filter(
    node => ts.isFunctionDeclaration(node) && node.name?.text === 'run',
  )
  assert.equal(runs.length, 1)
  const imports = {}
  for (const [key, moduleName, bindingName] of [
    ['onChangeAppState', './state/onChangeAppState.js', 'onChangeAppState'],
    ['createStore', './state/store.js', 'createStore'],
  ]) {
    const matches = nodes.filter(
      node =>
        ts.isImportDeclaration(node) &&
        node.moduleSpecifier.text === moduleName,
    )
    assert.equal(matches.length, 1)
    const names = matches[0].importClause.namedBindings.elements.map(
      element => element.name.text,
    )
    assert.deepEqual(names, [bindingName])
    imports[key] = sourceNodeDescriptor(source, sourceFile, matches[0])
  }
  const storeDeclarations = nodes.filter(
    node =>
      ts.isVariableDeclaration(node) &&
      node.name.getText(sourceFile) === 'headlessStore',
  )
  assert.equal(storeDeclarations.length, 1)
  const storeDeclaration = storeDeclarations[0]
  assert.ok(ts.isCallExpression(storeDeclaration.initializer))
  let storeStatement = storeDeclaration
  while (!ts.isVariableStatement(storeStatement)) {
    storeStatement = storeStatement.parent
  }
  const headlessCalls = nodes.filter(
    node =>
      ts.isCallExpression(node) &&
      node.expression.getText(sourceFile) === 'runHeadless',
  )
  assert.equal(headlessCalls.length, 1)
  const headlessCall = headlessCalls[0]
  const options = headlessCall.arguments.at(-1)
  assert.ok(ts.isObjectLiteralExpression(options))
  const propertyNames = options.properties.map(
    property => property.name?.getText(sourceFile),
  )
  const lastOption = options.properties.at(-1)
  return {
    run: sourceNodeDescriptor(source, sourceFile, runs[0]),
    imports,
    headlessStore: sourceNodeDescriptor(source, sourceFile, storeStatement),
    headlessStoreInitializer: {
      callee: storeDeclaration.initializer.expression.getText(sourceFile),
      arguments: storeDeclaration.initializer.arguments.map(argument =>
        argument.getText(sourceFile),
      ),
      ...descriptor(
        source.slice(
          storeDeclaration.initializer.getStart(sourceFile),
          storeDeclaration.initializer.end,
        ),
      ),
    },
    runHeadlessCall: sourceNodeDescriptor(source, sourceFile, headlessCall),
    runHeadlessArgumentCount: headlessCall.arguments.length,
    options: sourceNodeDescriptor(source, sourceFile, options),
    optionsPropertyCount: options.properties.length,
    propertyNames,
    lastOption: sourceNodeDescriptor(source, sourceFile, lastOption),
    lastOptionName: lastOption.name?.getText(sourceFile),
  }
}

test('fixture and evidence helper freeze one disjoint static row', { skip: !selected }, () => {
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, caseName)
  assert.deepEqual(descriptor(fixtureBytes), {
      bytes: 22504,
    sha256: FIXTURE_SHA256,
  })
  assert.deepEqual(
    Object.keys(ownerEvidenceModule).sort(),
    [
      'TARGET121_MAIN_RUN_SESSION_STATE_EVIDENCE_IDS',
      'TARGET121_MAIN_RUN_SESSION_STATE_OWNER_EVIDENCE',
    ],
  )
  assert.deepEqual(
    descriptor(
      readExact(
        path.join(repositoryRoot, fixture.caseFiles.helper.path),
        fixture.caseFiles.helper,
      ),
    ),
    expectedDescriptor(fixture.caseFiles.helper),
  )
  assert.equal(Object.isFrozen(TARGET121_MAIN_RUN_SESSION_STATE_EVIDENCE_IDS), true)
  assert.equal(Object.isFrozen(TARGET121_MAIN_RUN_SESSION_STATE_OWNER_EVIDENCE), true)
  assert.equal(
    Object.isFrozen(TARGET121_MAIN_RUN_SESSION_STATE_OWNER_EVIDENCE.residues),
    true,
  )
  assert.equal(
    Object.isFrozen(TARGET121_MAIN_RUN_SESSION_STATE_OWNER_EVIDENCE.residues[0]),
    true,
  )
  assert.deepEqual(
    TARGET121_MAIN_RUN_SESSION_STATE_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
  assert.deepEqual(
    TARGET121_MAIN_RUN_SESSION_STATE_OWNER_EVIDENCE.residues,
    [
      {
        literalKind: 'property',
        value: 'sessionState',
        start: 13812452,
        end: 13812464,
        targetOccurrenceNumber: 30,
      },
    ],
  )
  assert.deepEqual(
    TARGET121_MAIN_RUN_SESSION_STATE_OWNER_EVIDENCE.paths,
    ['src/main.tsx'],
  )
  assert.deepEqual(
    TARGET121_MAIN_RUN_SESSION_STATE_OWNER_EVIDENCE.declarations,
    ['run'],
  )
  assert.equal(
    TARGET121_MAIN_RUN_SESSION_STATE_OWNER_EVIDENCE.residues.some(row =>
      fixture.staticAdmission.classification.explicitlyDisjointLaneValues.includes(
        row.value,
      ),
    ),
    false,
  )
  for (const forbidden of ['apply', 'build', 'replay', 'override', 'coverage']) {
    assert.equal(
      Object.keys(TARGET121_MAIN_RUN_SESSION_STATE_OWNER_EVIDENCE).some(key =>
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
  ordered.push(fixture.staticAdmission.ownerResidue)
  assert.deepEqual(
    ordered.map(row => row[2]),
    [...ordered.map(row => row[2])].sort((left, right) => left - right),
  )
  assert.equal(new Set(ordered.map(JSON.stringify)).size, 4)
})

test('one exact snapshot proves owner-added, non-strict cumulative accounting', { skip: !selected }, () => {
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
      /prior, and hybrid descriptors are forbidden/,
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
      exact: [
        ...fixture.reportSnapshot.addedRows.exact,
        ...phase.restoredAddedRowsExact,
      ].sort((left, right) => left[2] - right[2]),
    },
    strictRows: {
      ...phase.strictRows,
      exact: [
        ...fixture.reportSnapshot.strictRows.exact,
        ...phase.restoredStrictRowsExact,
      ].sort((left, right) => left[3] - right[3]),
    },
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
  assert.deepEqual(
    canonicalDescriptor(
      ownerRows.map((row, index) => [
        ...ownerIdentities[index],
        row.ownerPaths,
        row.ownerSourceMatches,
      ]),
    ),
    expected.ownerRows.attributionIdentities,
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
  assert.deepEqual(strictIdentities, expected.strictRows.exact)
  assert.deepEqual(
    canonicalDescriptor(strictIdentities),
    expected.strictRows.identities,
  )

  const sessionRows = addedRows.filter(row => row.value === 'sessionState')
  assert.equal(sessionRows.length, 1)
  assert.deepEqual(reportIdentity(sessionRows[0]), expected.sessionStateRow.identity)
  assert.deepEqual(
    canonicalDescriptor(sessionRows[0]),
    expected.sessionStateRow.full,
  )
  assert.equal(sessionRows[0].disposition, expected.sessionStateRow.disposition)
  assert.deepEqual(sessionRows[0].ownerPaths, expected.sessionStateRow.ownerPaths)
  assert.deepEqual(
    sessionRows[0].ownerSourceMatches,
    expected.sessionStateRow.ownerSourceMatches,
  )
  assert.equal(strictRows.includes(sessionRows[0]), false)
  assert.equal(
    strictIdentities.some(row => row[2] === 'sessionState'),
    false,
    'sessionState is owner-added but not raw-strict',
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
    groups.priorStaticOrdinals.map(index => classifiedAddedIdentities[index]),
    fixture.staticAdmission.priorResidues,
  )
  assert.deepEqual(
    groups.ownedStaticOrdinals.map(index => classifiedAddedIdentities[index]),
    [fixture.staticAdmission.ownerResidue],
  )
  assert.deepEqual(
    groups.cumulativeStaticOrdinals.map(index => classifiedAddedIdentities[index]),
    [
      ...fixture.staticAdmission.priorResidues,
      fixture.staticAdmission.ownerResidue,
    ],
  )
  assert.deepEqual(
    groups.explicitlyDisjointLaneValues,
    groups.outOfScopeProductionOrdinals
      .map(index => classifiedAddedIdentities[index][1])
      .filter(value =>
        ['pluginPruneHandler', 'createSubcommandRoot'].includes(value),
      ),
  )
  assert.deepEqual(fixture.staticAdmission.predictedImpact, {
    rawOwnerRows: 199,
    rawAddedRows: 15,
    priorStaticOwnerAddedRows: 3,
    ownedByThisProofOwnerAddedRows: 1,
    cumulativeAdmittedOwnerAddedRows: 4,
    remainingOutOfScopeProductionRows: 5,
    separatelyHandledBuildMacroRows: 6,
    rawStrictRowsRemoved: 0,
    coverageRowsAddedOrReplaced: 0,
    predictedOwnerRows: 195,
    predictedAddedRows: 11,
    predictedStrictRows: 8,
    predictedCoverageRows: 1,
  })
  const impact = fixture.staticAdmission.predictedImpact
  assert.equal(
    impact.rawOwnerRows - impact.cumulativeAdmittedOwnerAddedRows,
    impact.predictedOwnerRows,
  )
  assert.equal(
    impact.rawAddedRows - impact.cumulativeAdmittedOwnerAddedRows,
    impact.predictedAddedRows,
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

test('complete Target120 and Target121 units retain one exact binding graph', { skip: !selected }, () => {
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
    fixture.compiledSessionStateGraph.baseline.key.start,
  )
  const targetGraph = findCompiledGraph(
    targetUnit,
    fixture.targetUnit.start,
    fixture.staticAdmission.ownerResidue[2],
  )
  assert.deepEqual(
    baselineGraph.descriptors,
    fixture.compiledSessionStateGraph.baseline,
  )
  assert.deepEqual(
    targetGraph.descriptors,
    fixture.compiledSessionStateGraph.target,
  )
  assert.deepEqual(
    baselineGraph.normalized,
    fixture.compiledSessionStateGraph.sharedNormalized,
  )
  assert.deepEqual(
    targetGraph.normalized,
    fixture.compiledSessionStateGraph.sharedNormalized,
  )
  assert.deepEqual(
    baselineGraph.shape,
    fixture.compiledSessionStateGraph.sharedShape,
  )
  assert.deepEqual(
    targetGraph.shape,
    fixture.compiledSessionStateGraph.sharedShape,
  )
  assert.equal(
    targetGraph.descriptors.key.end,
    fixture.staticAdmission.ownerResidue[3],
  )
  assert.ok(
    fixture.staticAdmission.priorResidues.at(-1)[3] <
      targetGraph.descriptors.manager.start,
    'the sessionState graph follows all three prior static admissions',
  )
})

test('raw/package main states authenticate the owner boundary without a manager replay', { skip: !selected }, () => {
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
  const graph = authoredMainGraph(ts, sourceFile, source)
  assert.deepEqual(graph.run, expectedState.run)
  assert.deepEqual(graph.imports, expectedState.imports)
  assert.deepEqual(graph.headlessStore, expectedState.headlessStore)
  assert.deepEqual(
    graph.headlessStoreInitializer,
    sourceSpec.sharedGraph.headlessStoreInitializer,
  )
  assert.deepEqual(graph.runHeadlessCall, expectedState.runHeadlessCall)
  assert.equal(
    graph.runHeadlessArgumentCount,
    sourceSpec.sharedGraph.runHeadlessArgumentCount,
  )
  assert.deepEqual(graph.options, expectedState.options)
  assert.equal(
    graph.optionsPropertyCount,
    sourceSpec.sharedGraph.optionsPropertyCount,
  )
  assert.deepEqual(graph.lastOption, expectedState.lastOption)
  assert.equal(graph.lastOptionName, sourceSpec.sharedGraph.lastOptionName)
  assert.equal(
    graph.propertyNames.includes(sourceSpec.sharedGraph.forbiddenOptionName),
    false,
  )
  assert.equal(source.includes('SessionStateManager'), false)
  assert.equal(source.includes('sessionState'), false)
  assert.deepEqual(fixture.sourceReplayDecision, {
    selectedProof: 'smallest-row-only-static-proof',
    replayRequired: false,
    reason:
      'The authored graph already implements session metadata propagation through process-global functions. main.tsx has no SessionStateManager binding and its runHeadless options end at sessionStartHooksPromise. Adding only sessionState would reference a nonexistent value; recreating the instance graph would overlap recovered global behavior and would not be a row-scoped edit.',
  })
})

test('authenticated package support proves the process-global replacement graph', { skip: !selected }, t => {
  const ts = typescript()
  const support = {
    ...fixture.inputs.packageSupport,
    root: path.resolve(
      process.env.CLAUDE_CODE_2_1_121_FRESH_PACKAGE_SOURCE_ROOT ??
        fixture.inputs.packageSupport.root,
    ),
  }
  if (!fs.existsSync(support.root)) {
    t.skip(`fresh Target121 package source is unavailable: ${support.root}`)
    return
  }
  const parsed = {}
  for (const [relativePath, expected] of Object.entries(support.files)) {
    const bytes = readExact(
      path.join(support.root, relativePath),
      expected,
      `authenticated package ${relativePath}`,
    )
    const source = bytes.toString('utf8')
    for (const forbidden of support.forbiddenArchitectureTokens) {
      assert.equal(source.includes(forbidden), false, `${relativePath}: ${forbidden}`)
    }
    const sourceFile = ts.createSourceFile(
      relativePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    assert.equal(sourceFile.parseDiagnostics.length, 0)
    parsed[relativePath] = {
      source,
      sourceFile,
      nodes: tsNodes(sourceFile, ts),
    }
  }

  const sessionSpec = support.files['utils/sessionState.ts']
  const session = parsed['utils/sessionState.ts']
  for (const [name, expected] of [
    ['setSessionInternalMetadataChangedListener', sessionSpec.setInternalListener],
    ['notifySessionInternalMetadataChanged', sessionSpec.notifyInternal],
  ]) {
    const matches = session.nodes.filter(
      node => ts.isFunctionDeclaration(node) && node.name?.text === name,
    )
    assert.equal(matches.length, 1)
    assert.deepEqual(
      sourceNodeDescriptor(session.source, session.sourceFile, matches[0]),
      expected,
    )
  }

  const changeSpec = support.files['state/onChangeAppState.ts']
  const change = parsed['state/onChangeAppState.ts']
  const changeFunctions = change.nodes.filter(
    node =>
      ts.isFunctionDeclaration(node) && node.name?.text === 'onChangeAppState',
  )
  assert.equal(changeFunctions.length, 1)
  assert.deepEqual(
    sourceNodeDescriptor(change.source, change.sourceFile, changeFunctions[0]),
    changeSpec.onChangeAppState,
  )
  const changeNotifyCalls = change.nodes.filter(
    node =>
      ts.isCallExpression(node) &&
      node.expression.getText(change.sourceFile) ===
        'notifySessionInternalMetadataChanged',
  )
  assert.equal(changeNotifyCalls.length, changeSpec.notifyInternalCallCount)

  const printSpec = support.files['cli/print.ts']
  const print = parsed['cli/print.ts']
  const printNotifyCalls = print.nodes.filter(
    node =>
      ts.isCallExpression(node) &&
      node.expression.getText(print.sourceFile) ===
        'notifySessionInternalMetadataChanged',
  )
  assert.equal(printNotifyCalls.length, 1)
  assert.deepEqual(
    sourceNodeDescriptor(print.source, print.sourceFile, printNotifyCalls[0]),
    printSpec.notifyInternalCall,
  )
  assert.equal(fixture.sourceReplayDecision.replayRequired, false)
})
