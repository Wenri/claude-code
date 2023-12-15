import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import * as ownerEvidenceModule from '../cases/2.1.120-to-2.1.121/recovered/main-run-first-allowed-owner-evidence.mjs'

const {
  TARGET121_MAIN_RUN_FIRST_ALLOWED_EVIDENCE_IDS,
  TARGET121_MAIN_RUN_FIRST_ALLOWED_OWNER_EVIDENCE,
} = ownerEvidenceModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-main-run-first-allowed-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '0bf69e223d2058c326d224131b1c7ca9a4441de31e36fa101e448647bb5d86d7'

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

function exactNodeDescriptor(text, node) {
  const start = node.start
  const end = node.end
  return { start, end, ...descriptor(text.slice(start, end)) }
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

function phaseSnapshot(state) {
  if (state === 'postViewModeReplay') {
    return fixture.inputs.postViewModeReplaySnapshot
  }
  if (state === 'postPrune') {
    return fixture.inputs.postPruneSnapshot
  }
  if (state === 'postDaemonOwner') {
    return fixture.inputs.postDaemonOwnerSnapshot
  }
  assert.equal(state, 'postDangerousReplay')
  return fixture.inputs.postDangerousReplaySnapshot
}

function assertCompatibleSnapshotPair(reportState, coverageState) {
  assert.equal(
    (fixture.inputs.evolutionCompatibility[reportState] ?? []).includes(
      coverageState,
    ),
    true,
    `unsupported report/coverage hybrid ${reportState}/${coverageState}`,
  )
}

function snapshotPhase(reportDescriptor, coverageDescriptor) {
  const matches = []
  for (const [reportState, coverageStates] of Object.entries(
    fixture.inputs.evolutionCompatibility,
  )) {
    for (const coverageState of coverageStates) {
      if (
        matchesDescriptor(reportDescriptor, phaseSnapshot(reportState).typedReport) &&
        matchesDescriptor(coverageDescriptor, phaseSnapshot(coverageState).sourceCoverage)
      ) {
        matches.push(reportState)
      }
    }
  }
  assert.equal(
    matches.length,
    1,
    'u22106 first-allowed proof requires one exact report/coverage phase; unknown descriptors and hybrids are forbidden',
  )
  return matches[0]
}

function reportSnapshotFor(state) {
  if (state === 'postViewModeReplay') return fixture.reportSnapshot
  if (state === 'postDaemonOwner') {
    return {
      ownerRows: fixture.postDaemonOwner.reportSnapshot.ownerRows,
      addedRows: {
        ...fixture.postDaemonOwner.reportSnapshot.addedRows,
        exact: [
          ...fixture.priorViewModeReplay.removedOwnerAddedRowsExact,
          ...fixture.reportSnapshot.addedRows.exact,
        ],
      },
      strictRows: {
        ...fixture.postDaemonOwner.reportSnapshot.strictRows,
        exact: fixture.reportSnapshot.strictRows.exact,
      },
    }
  }
  if (state === 'postPrune') return reportSnapshotFor('postDangerousReplay')
  assert.equal(state, 'postDangerousReplay')
  const removedAdded = JSON.stringify(fixture.postDangerous.removedRowsExact)
  const removedStrict = JSON.stringify(fixture.postDangerous.removedStrictRowsExact)
  return {
    ...fixture.postDangerous.reportSnapshot,
    addedRows: {
      ...fixture.postDangerous.reportSnapshot.addedRows,
      exact: fixture.reportSnapshot.addedRows.exact.filter(
        row => JSON.stringify(row) !== removedAdded,
      ),
    },
    strictRows: {
      ...fixture.postDangerous.reportSnapshot.strictRows,
      exact: fixture.reportSnapshot.strictRows.exact.filter(
        row => JSON.stringify(row) !== removedStrict,
      ),
    },
  }
}

function parseUnit(bundle, unit, label) {
  const value = bundle.subarray(unit.start, unit.end)
  assert.deepEqual(
    descriptor(value),
    { bytes: unit.bytes, sha256: unit.sha256 },
    label,
  )
  const text = value.toString('utf8')
  const ast = parse(text, {
    ecmaVersion: 'latest',
    sourceType: 'script',
  })
  assert.equal(ast.body.length, 1, `${label}: one complete unit`)
  const node = ast.body[0]
  assert.equal(node.type, unit.nodeType, label)
  assert.equal(node.id?.name, unit.name, label)
  assert.equal(node.async, unit.async, label)
  assert.equal(
    [...tokenizer(text, { ecmaVersion: 'latest' })].length,
    unit.tokenCount,
    `${label}: token count`,
  )
  return { ast, node, text }
}

function normalizedTokenDescriptor(text) {
  const tokens = [...tokenizer(text, { ecmaVersion: 'latest' })].map(token => [
    token.type.label,
    token.type.label === 'name' ? '@id' : (token.value ?? null),
  ])
  return { count: tokens.length, ...canonicalDescriptor(tokens) }
}

function compiledAllowedGraphs(parsed, unitStart) {
  const parents = new Map()
  const allowedProperties = []
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
        !node.computed &&
        node.key?.name === 'allowed'
      ) {
        allowedProperties.push(node)
      }
    }
    for (const [key, child] of Object.entries(node)) {
      if (!['end', 'start'].includes(key)) walk(child, node)
    }
  }
  walk(parsed.ast)

  return allowedProperties.map((property, ordinal) => {
    let declaration = property
    while (declaration?.type !== 'VariableDeclaration') {
      declaration = parents.get(declaration)
    }
    assert.ok(declaration, `allowed graph ${ordinal}: variable declaration`)
    let block = parents.get(declaration)
    while (block && !Array.isArray(block.body)) block = parents.get(block)
    assert.ok(block, `allowed graph ${ordinal}: statement block`)
    const statementIndex = block.body.indexOf(declaration)
    assert.ok(statementIndex >= 0)
    const statements = block.body.slice(statementIndex, statementIndex + 3)
    assert.equal(statements.length, 3)
    const fragmentStart = statements[0].start
    const fragmentEnd = statements.at(-1).end
    const fragment = parsed.text.slice(fragmentStart, fragmentEnd)
    const boundName = property.value.name
    const occurrences = []
    function collectBoundIdentifiers(node) {
      if (node === null || typeof node !== 'object') return
      if (Array.isArray(node)) {
        for (const child of node) collectBoundIdentifiers(child)
        return
      }
      if (node.type === 'Identifier' && node.name === boundName) {
        occurrences.push({
          relativeStart: node.start - fragmentStart,
          relativeEnd: node.end - fragmentStart,
          parentType: parents.get(node)?.type,
        })
      }
      for (const [key, child] of Object.entries(node)) {
        if (!['end', 'start'].includes(key)) collectBoundIdentifiers(child)
      }
    }
    for (const statement of statements) collectBoundIdentifiers(statement)

    const localDescriptor = node => ({
      localStart: node.start,
      localEnd: node.end,
      start: unitStart + node.start,
      end: unitStart + node.end,
      ...descriptor(parsed.text.slice(node.start, node.end)),
    })
    return {
      ordinal,
      key: localDescriptor(property.key),
      property: localDescriptor(property),
      boundIdentifierOccurrences: occurrences,
      fragment: {
        localStart: fragmentStart,
        localEnd: fragmentEnd,
        start: unitStart + fragmentStart,
        end: unitStart + fragmentEnd,
        ...descriptor(fragment),
        normalizedTokens: normalizedTokenDescriptor(fragment),
      },
      statementTypes: statements.map(statement => statement.type),
    }
  })
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

function sourceStateFor(actual) {
  const sourceSpec = fixture.inputs.sourceFile
  const postPruneProjection = sourceSpec.postPruneSourceState.projection
  const acceptedStates = {
    ...sourceSpec.acceptedStates,
    postPrune: {
      ...sourceSpec.acceptedStates[postPruneProjection],
      ...sourceSpec.postPruneSourceState,
    },
  }
  const matches = Object.entries(acceptedStates).filter(([, state]) =>
    matchesDescriptor(actual, state.file),
  )
  assert.equal(
    matches.length,
    1,
    'src/main.tsx must be one exact accepted source state',
  )
  return matches[0]
}

function sourceAllowedEvidence(ts, sourceFile, source, run) {
  const allowedBindings = []
  const importSpecifiers = []
  const variables = new Map([
    ['dynamicMcpConfig', []],
    ['scopedConfigs', []],
  ])
  function visit(node) {
    if (
      ts.isBindingElement(node) &&
      node.name.getText(sourceFile) === 'allowed'
    ) {
      allowedBindings.push(node)
    }
    if (
      ts.isImportSpecifier(node) &&
      node.name.text === 'filterMcpServersByPolicy'
    ) {
      importSpecifiers.push(node)
    }
    if (ts.isVariableDeclaration(node)) {
      const declarations = variables.get(node.name.getText(sourceFile))
      if (declarations) declarations.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(importSpecifiers.length, 1)
  assert.equal(variables.get('dynamicMcpConfig').length, 1)
  assert.equal(variables.get('scopedConfigs').length, 1)

  const graphs = allowedBindings
    .filter(node => node.getStart(sourceFile) >= run.getStart(sourceFile))
    .filter(node => node.end <= run.end)
    .map((binding, ordinal) => {
      let declaration = binding
      while (!ts.isVariableDeclaration(declaration)) declaration = declaration.parent
      let statement = declaration
      while (!ts.isVariableStatement(statement)) statement = statement.parent
      const block = statement.parent
      assert.ok(ts.isBlock(block))
      const statementIndex = block.statements.indexOf(statement)
      assert.ok(statementIndex >= 0)
      const statements = block.statements.slice(statementIndex, statementIndex + 3)
      assert.equal(statements.length, 3)
      const fragmentStart = statements[0].getStart(sourceFile)
      const fragmentEnd = statements.at(-1).end
      const occurrences = []
      function collect(node) {
        if (
          ts.isIdentifier(node) &&
          node.text === 'allowed' &&
          node.getStart(sourceFile) >= fragmentStart &&
          node.end <= fragmentEnd
        ) {
          occurrences.push({
            relativeStart: node.getStart(sourceFile) - fragmentStart,
            relativeEnd: node.end - fragmentStart,
            parentKind: ts.SyntaxKind[node.parent.kind],
          })
        }
        ts.forEachChild(node, collect)
      }
      for (const sibling of statements) collect(sibling)
      return {
        ordinal,
        binding: sourceNodeDescriptor(source, sourceFile, binding),
        variableDeclaration: sourceNodeDescriptor(
          source,
          sourceFile,
          declaration,
        ),
        initializer: declaration.initializer.getText(sourceFile),
        fragment: {
          start: fragmentStart,
          end: fragmentEnd,
          ...descriptor(source.slice(fragmentStart, fragmentEnd)),
        },
        statementKinds: statements.map(node => ts.SyntaxKind[node.kind]),
        allowedIdentifierOccurrences: occurrences,
      }
    })

  return {
    importSpecifier: sourceNodeDescriptor(
      source,
      sourceFile,
      importSpecifiers[0],
    ),
    dynamicMcpConfig: sourceNodeDescriptor(
      source,
      sourceFile,
      variables.get('dynamicMcpConfig')[0],
    ),
    scopedConfigs: sourceNodeDescriptor(
      source,
      sourceFile,
      variables.get('scopedConfigs')[0],
    ),
    graphs,
    dynamicMcpConfigType:
      variables.get('dynamicMcpConfig')[0].type.getText(sourceFile),
  }
}

test(
  'u22106 first allowed evidence is immutable, static, and exactly one-row scoped',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.targetUnit.targetIndex, 22106)
    assert.deepEqual(
      [...TARGET121_MAIN_RUN_FIRST_ALLOWED_EVIDENCE_IDS],
      fixture.evidenceIds,
    )
    assert.deepEqual(
      descriptor(
        fs.readFileSync(
          path.join(repositoryRoot, fixture.caseFiles.helper.path),
        ),
      ),
      expectedDescriptor(fixture.caseFiles.helper),
    )
    assert.equal(
      Object.keys(ownerEvidenceModule).some(
        key => key.includes('OWNER_OVERRIDES') || /^apply|^build/.test(key),
      ),
      false,
      'static row evidence must expose neither replay nor whole-unit override',
    )
    assert.ok(Object.isFrozen(TARGET121_MAIN_RUN_FIRST_ALLOWED_OWNER_EVIDENCE))
    assert.ok(Object.isFrozen(TARGET121_MAIN_RUN_FIRST_ALLOWED_OWNER_EVIDENCE.residues))
    assert.ok(Object.isFrozen(TARGET121_MAIN_RUN_FIRST_ALLOWED_OWNER_EVIDENCE.residues[0]))

    const admitted = fixture.reportSnapshot.addedRows.exact[0]
    assert.deepEqual(
      {
        targetIndex: TARGET121_MAIN_RUN_FIRST_ALLOWED_OWNER_EVIDENCE.targetIndex,
        paths: [...TARGET121_MAIN_RUN_FIRST_ALLOWED_OWNER_EVIDENCE.paths],
        declarations: [
          ...TARGET121_MAIN_RUN_FIRST_ALLOWED_OWNER_EVIDENCE.declarations,
        ],
        residues: TARGET121_MAIN_RUN_FIRST_ALLOWED_OWNER_EVIDENCE.residues.map(
          row => ({ ...row }),
        ),
        evidenceIds: [
          ...TARGET121_MAIN_RUN_FIRST_ALLOWED_OWNER_EVIDENCE.evidenceIds,
        ],
      },
      {
        targetIndex: 22106,
        paths: ['src/main.tsx'],
        declarations: ['run'],
        residues: [
          {
            literalKind: admitted[0],
            value: admitted[1],
            start: admitted[2],
            end: admitted[3],
            targetOccurrenceNumber: admitted[5],
          },
        ],
        evidenceIds: fixture.evidenceIds,
      },
    )

    const groups = fixture.rowClassification
    const ordinals = [
      ...groups.admittedStaticOrdinals,
      ...groups.deferredProductionOrdinals,
      ...groups.buildMacroOrdinals,
    ].sort((left, right) => left - right)
    assert.deepEqual(
      ordinals,
      fixture.reportSnapshot.addedRows.exact.map((_, index) => index),
    )
    assert.equal(new Set(ordinals).size, ordinals.length)
    assert.deepEqual(
      groups.deferredProductionOrdinals.map(
        index => fixture.reportSnapshot.addedRows.exact[index][1],
      ),
      groups.deferredProductionValues,
    )
    assert.deepEqual(
      [
        ...new Set(
          groups.buildMacroOrdinals.map(
            index => fixture.reportSnapshot.addedRows.exact[index][1],
          ),
        ),
      ],
      groups.buildMacroValues,
    )
    assert.deepEqual(groups.admittedStaticOrdinals, [0])
    assert.equal(
      fixture.reportSnapshot.addedRows.exact[1][1],
      'allowed',
      'the later allowed return branch remains explicitly deferred',
    )
    assert.deepEqual(fixture.staticAdmission.predictedImpact, {
      admittedOwnerAddedRows: 1,
      remainingDeferredProductionRows: 9,
      separatelyHandledBuildMacroRows: 6,
      rawStrictRowsRemoved: 0,
      coverageRowsAddedOrReplaced: 0,
      predictedOwnerRows: 199,
      predictedAddedRows: 15,
      predictedStrictRows: 9,
      predictedCoverageRows: 1,
    })
    const postDangerousRows = reportSnapshotFor('postDangerousReplay').addedRows.exact
    const postDangerousGroups = fixture.postDangerous.rowClassification
    assert.deepEqual(
      [
        ...postDangerousGroups.admittedStaticOrdinals,
        ...postDangerousGroups.deferredProductionOrdinals,
        ...postDangerousGroups.buildMacroOrdinals,
      ].sort((left, right) => left - right),
      postDangerousRows.map((_, index) => index),
    )
    assert.deepEqual(fixture.postDangerous.staticAdmission.predictedImpact, {
      rawOwnerRows: 199,
      rawAddedRows: 15,
      admittedOwnerAddedRows: 1,
      remainingDeferredProductionRows: 8,
      separatelyHandledBuildMacroRows: 6,
      rawStrictRowsRemoved: 0,
      coverageRowsAddedOrReplaced: 0,
      predictedOwnerRows: 198,
      predictedAddedRows: 14,
      predictedStrictRows: 8,
      predictedCoverageRows: 1,
    })
  },
)

test(
  'exact post-viewMode, post-dangerous, and post-prune partitions reject unknown and cross-phase pairs',
  { skip: !selected },
  () => {
    const frozen = fixture.inputs.postDaemonOwnerSnapshot
    const prior = fixture.inputs.postViewModeReplaySnapshot
    const reportFilename = artifactPath(
      'CLAUDE_CODE_TARGET121_TYPED_REPORT',
      frozen.typedReport,
    )
    const coverageFilename = artifactPath(
      'CLAUDE_CODE_TARGET121_SOURCE_COVERAGE',
      frozen.sourceCoverage,
    )
    const reportBytes = readExact(
      reportFilename,
      frozen.typedReport,
      'exact post-prune Target121 typed report',
    )
    const coverageGzip = readExact(
      coverageFilename,
      frozen.sourceCoverage,
      'byte-identical post-prune Target121 source coverage',
    )
    assert.equal(
      snapshotPhase(descriptor(reportBytes), descriptor(coverageGzip)),
      'postDaemonOwner',
    )
    const phaseStates = [
      'postViewModeReplay',
      'postDangerousReplay',
      'postPrune',
      'postDaemonOwner',
    ]
    for (const state of phaseStates) {
      const snapshot = phaseSnapshot(state)
      assert.equal(
        snapshotPhase(
          expectedDescriptor(snapshot.typedReport),
          expectedDescriptor(snapshot.sourceCoverage),
        ),
        state,
      )
    }
    for (const reportState of phaseStates) {
      for (const coverageState of phaseStates) {
        if (reportState === coverageState) continue
        assert.throws(
          () => assertCompatibleSnapshotPair(reportState, coverageState),
          /unsupported report\/coverage hybrid/,
        )
        if (
          !matchesDescriptor(
            phaseSnapshot(reportState).sourceCoverage,
            phaseSnapshot(coverageState).sourceCoverage,
          )
        ) {
          assert.throws(
            () =>
              snapshotPhase(
                expectedDescriptor(phaseSnapshot(reportState).typedReport),
                expectedDescriptor(phaseSnapshot(coverageState).sourceCoverage),
              ),
            /unknown descriptors and hybrids are forbidden/,
          )
        }
      }
    }
    assert.throws(
      () =>
        snapshotPhase(
          descriptor(reportBytes),
          prior.knownPriorDescriptors.sourceCoverage,
        ),
      /unknown descriptors and hybrids are forbidden/,
    )
    assert.throws(
      () =>
        snapshotPhase(
          prior.knownPriorDescriptors.typedReport,
          descriptor(coverageGzip),
        ),
      /unknown descriptors and hybrids are forbidden/,
    )

    const report = JSON.parse(reportBytes)
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
    const expected = reportSnapshotFor('postDaemonOwner')
    assert.equal(ownerRows.length, expected.ownerRows.count)
    assert.equal(addedRows.length, expected.addedRows.count)
    assert.equal(strictRows.length, expected.strictRows.count)
    assert.deepEqual(canonicalDescriptor(ownerRows), expected.ownerRows.fullRows)
    assert.deepEqual(canonicalDescriptor(addedRows), expected.addedRows.fullRows)
    assert.deepEqual(canonicalDescriptor(strictRows), expected.strictRows.fullRows)

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
    assert.ok(
      ownerRows.every(
        row =>
          JSON.stringify(row.ownerPaths) === JSON.stringify(['main.tsx']) &&
          row.ownerSourceMatches.length === 0,
      ),
    )
    const addedIdentities = addedRows.map(reportIdentity)
    assert.deepEqual(addedIdentities, expected.addedRows.exact)
    assert.deepEqual(
      canonicalDescriptor(addedIdentities),
      expected.addedRows.identities,
    )
    const strictIdentities = strictRows.map(strictIdentity)
    assert.deepEqual(strictIdentities, expected.strictRows.exact)
    assert.deepEqual(
      canonicalDescriptor(strictIdentities),
      expected.strictRows.identities,
    )

    const removed = new Set(
      fixture.priorViewModeReplay.removedOwnerAddedRowsExact.map(row =>
        JSON.stringify(row.slice(0, 4)),
      ),
    )
    assert.deepEqual(
      addedIdentities.filter(row =>
        removed.has(JSON.stringify(row.slice(0, 4))),
      ),
      fixture.priorViewModeReplay.removedOwnerAddedRowsExact,
      'post-daemon physical rows restore exactly the two frozen viewMode/focus identities',
    )
    const admittedKey = JSON.stringify(
      fixture.staticAdmission.ownerResidue.slice(0, 4),
    )
    assert.ok(
      strictIdentities.every(
        row =>
          JSON.stringify([row[1], row[2], row[3], row[4]]) !== admittedKey,
      ),
      'the first allowed admission removes zero raw strict rows',
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
    assert.deepEqual(
      canonicalDescriptor(coverageRows),
      fixture.coverageRowsDescriptor,
    )
    assert.deepEqual(coverageRows, [fixture.coverageRow])
  },
)

test(
  'complete baseline and target units authenticate one first-allowed adjacency graph',
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
      'authenticated Target121 structural ledger',
    )
    const ledger = JSON.parse(gunzipSync(ledgerBytes))
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

    const baselineGraphs = compiledAllowedGraphs(
      baselineUnit,
      fixture.baselineSemanticCounterpart.start,
    )
    const targetGraphs = compiledAllowedGraphs(
      targetUnit,
      fixture.targetUnit.start,
    )
    assert.deepEqual(baselineGraphs, fixture.compiledAllowedGraphs.baseline)
    assert.deepEqual(targetGraphs, fixture.compiledAllowedGraphs.target)
    assert.deepEqual(
      baselineGraphs[0].fragment.normalizedTokens,
      targetGraphs[0].fragment.normalizedTokens,
      'first allowed declaration/warning/spread graph is retained exactly',
    )
    assert.deepEqual(targetGraphs[0].boundIdentifierOccurrences, [
      { relativeStart: 55, relativeEnd: 57, parentType: 'Property' },
      { relativeStart: 198, relativeEnd: 200, parentType: 'SpreadElement' },
    ])

    const admitted = fixture.staticAdmission.ownerResidue
    assert.deepEqual(
      [
        admitted[2],
        admitted[3],
        target.subarray(admitted[2], admitted[3]).toString('utf8'),
      ],
      [targetGraphs[0].key.start, targetGraphs[0].key.end, 'allowed'],
    )
    const deferredAllowed = fixture.reportSnapshot.addedRows.exact[1]
    assert.deepEqual(
      [deferredAllowed[2], deferredAllowed[3]],
      [targetGraphs[1].key.start, targetGraphs[1].key.end],
    )
    assert.equal(targetGraphs[0].statementTypes.at(-1), 'ExpressionStatement')
    assert.equal(targetGraphs[1].statementTypes.at(-1), 'ReturnStatement')
    assert.ok(
      targetGraphs[1].fragment.start > targetGraphs[0].fragment.end,
      'the later allowed return branch is nonadjacent and remains deferred',
    )
  },
)

test(
  'main.tsx run already owns the first allowed graph, so static proof is fail-closed and replay-free',
  { skip: !selected },
  () => {
    const sourceSpec = fixture.inputs.sourceFile
    const configuredSourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
    const configuredFilename = configuredSourceRoot
      ? path.join(
          path.resolve(configuredSourceRoot),
          sourceSpec.path.replace(/^src\//, ''),
        )
      : path.join(repositoryRoot, sourceSpec.path)
    const configuredBytes = fs.readFileSync(configuredFilename)
    const [stateName, expectedState] = sourceStateFor(
      descriptor(configuredBytes),
    )
    const source = configuredBytes.toString('utf8')
    const ts = typescript()
    const sourceFile = ts.createSourceFile(
      sourceSpec.path,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    assert.equal(sourceFile.parseDiagnostics.length, 0)
    const runs = []
    function findRun(node) {
      if (ts.isFunctionDeclaration(node) && node.name?.text === 'run') {
        runs.push(node)
      }
      ts.forEachChild(node, findRun)
    }
    findRun(sourceFile)
    assert.equal(runs.length, 1, 'one exact src/main.tsx::run declaration')
    assert.deepEqual(
      sourceNodeDescriptor(source, sourceFile, runs[0]),
      expectedState.run,
    )

    const evidence = sourceAllowedEvidence(
      ts,
      sourceFile,
      source,
      runs[0],
    )
    assert.deepEqual(evidence.importSpecifier, expectedState.importSpecifier)
    assert.deepEqual(evidence.dynamicMcpConfig, expectedState.dynamicMcpConfig)
    assert.deepEqual(evidence.scopedConfigs, expectedState.scopedConfigs)
    assert.equal(
      evidence.dynamicMcpConfigType,
      'Record<string, ScopedMcpServerConfig>',
    )
    assert.deepEqual(evidence.graphs, expectedState.allowedGraphs)
    assert.equal(
      evidence.graphs[0].initializer,
      'filterMcpServersByPolicy(scopedConfigs)',
    )
    assert.deepEqual(evidence.graphs[0].allowedIdentifierOccurrences, [
      { relativeStart: 18, relativeEnd: 25, parentKind: 'BindingElement' },
      { relativeStart: 353, relativeEnd: 360, parentKind: 'SpreadAssignment' },
    ])
    assert.equal(evidence.graphs[1].initializer, 'filterMcpServersByPolicy(configs)')
    assert.ok(
      [
        'preViewModeReplay',
        'postViewModeReplay',
        'postDangerousReplay',
        'postPrune',
      ].includes(stateName),
      'configured source state is explicitly named',
    )

    assert.throws(
      () => sourceStateFor({ ...descriptor(configuredBytes), bytes: configuredBytes.length + 1 }),
      /one exact accepted source state/,
      'a mixed or mutated source state fails closed',
    )
    assert.equal(fixture.staticAdmission.mode, 'static-row-proof-no-source-replay')
    assert.equal(
      Object.keys(ownerEvidenceModule).some(
        key => /^apply|^build/.test(key) || key.includes('OWNER_OVERRIDES'),
      ),
      false,
    )
  },
)
