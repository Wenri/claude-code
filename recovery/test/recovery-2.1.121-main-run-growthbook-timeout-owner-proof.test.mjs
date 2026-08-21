import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import * as firstAllowedModule from '../cases/2.1.120-to-2.1.121/recovered/main-run-first-allowed-owner-evidence.mjs'
import * as ownerEvidenceModule from '../cases/2.1.120-to-2.1.121/recovered/main-run-growthbook-timeout-owner-evidence.mjs'
import * as secondAllowedModule from '../cases/2.1.120-to-2.1.121/recovered/main-run-second-allowed-owner-evidence.mjs'

const {
  TARGET121_MAIN_RUN_GROWTHBOOK_TIMEOUT_EVIDENCE_IDS,
  TARGET121_MAIN_RUN_GROWTHBOOK_TIMEOUT_OWNER_EVIDENCE,
} = ownerEvidenceModule
const { TARGET121_MAIN_RUN_FIRST_ALLOWED_OWNER_EVIDENCE } =
  firstAllowedModule
const { TARGET121_MAIN_RUN_SECOND_ALLOWED_OWNER_EVIDENCE } =
  secondAllowedModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-main-run-growthbook-timeout-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'b0af67816cc1098186158b62315788408419d0f9cb1e4527411d4b5835f1b0dd'

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

function phaseSnapshot(state) {
  if (state === 'postViewModeReplay') {
    return fixture.inputs.frozenPostViewModeSnapshot
  }
  if (state === 'postPrune') {
    return fixture.inputs.postPruneSnapshot
  }
  if (state === 'postDaemonOwner') {
    return fixture.inputs.postDaemonOwnerSnapshot
  }
  assert.equal(state, 'postDangerousReplay')
  return fixture.inputs.frozenPostDangerousSnapshot
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
    'u22106 growthbook proof requires one exact report/coverage phase; unknown descriptors and hybrids are forbidden',
  )
  return matches[0]
}

function reportSnapshotFor(state) {
  if (state === 'postViewModeReplay') return fixture.reportSnapshot
  if (state === 'postDaemonOwner') {
    return {
      ownerRows: fixture.postDaemonOwner.reportSnapshot.ownerRows,
      addedRows: {...fixture.postDaemonOwner.reportSnapshot.addedRows, exact:[...fixture.postDaemonOwner.restoredAddedRowsExact,...fixture.reportSnapshot.addedRows.exact]},
      strictRows: {...fixture.postDaemonOwner.reportSnapshot.strictRows, exact:fixture.reportSnapshot.strictRows.exact},
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

function residueFromIdentity(identity) {
  return {
    literalKind: identity[0],
    value: identity[1],
    start: identity[2],
    end: identity[3],
    targetOccurrenceNumber: identity[5],
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

function findTimeoutGraph(parsed, unitStart, numericStart) {
  const parents = new Map()
  const numericLiterals = []
  function walk(node, parent = null) {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) walk(child, parent)
      return
    }
    if (typeof node.type === 'string') {
      parents.set(node, parent)
      if (node.type === 'Literal' && node.value === 300) {
        numericLiterals.push(node)
      }
    }
    for (const [key, child] of Object.entries(node)) {
      if (!['end', 'start'].includes(key)) walk(child, node)
    }
  }
  walk(parsed.ast)

  const literal = numericLiterals.find(
    node => unitStart + node.start === numericStart,
  )
  assert.ok(literal, `numeric 300 at ${numericStart}`)
  let timeoutCall = parents.get(literal)
  while (
    timeoutCall &&
    !(
      timeoutCall.type === 'CallExpression' &&
      timeoutCall.arguments[1] === literal
    )
  ) {
    timeoutCall = parents.get(timeoutCall)
  }
  assert.ok(timeoutCall)
  assert.deepEqual(
    timeoutCall.arguments.map(node => node.type),
    ['CallExpression', 'Literal', 'Literal'],
  )
  assert.equal(timeoutCall.arguments[2].value, 'gb-before-tools')
  let ifStatement = timeoutCall
  while (ifStatement?.type !== 'IfStatement') {
    ifStatement = parents.get(ifStatement)
  }
  assert.ok(ifStatement)
  const block = parents.get(ifStatement)
  assert.equal(block.type, 'BlockStatement')
  const statementIndex = block.body.indexOf(ifStatement)
  assert.ok(statementIndex > 0)
  const previous = block.body[statementIndex - 1]
  const commandLoadingStatement = block.body[statementIndex + 1]
  assert.equal(previous.type, 'VariableDeclaration')
  assert.equal(commandLoadingStatement.type, 'ExpressionStatement')
  const previousLastDeclarator = previous.declarations.at(-1)

  const core = {
    literal: nodeDescriptor(parsed.text, literal, unitStart),
    timeoutCall: nodeDescriptor(parsed.text, timeoutCall, unitStart),
    ifStatement: nodeDescriptor(parsed.text, ifStatement, unitStart),
    previousLastDeclarator: nodeDescriptor(
      parsed.text,
      previousLastDeclarator,
      unitStart,
    ),
    commandLoadingStatement: nodeDescriptor(
      parsed.text,
      commandLoadingStatement,
      unitStart,
    ),
    statementIndex,
    bodyCount: block.body.length,
  }
  return {
    core,
    normalized: {
      ifStatement: normalizedTokenDescriptor(
        parsed.text.slice(ifStatement.start, ifStatement.end),
      ),
      previousLastDeclarator: normalizedTokenDescriptor(
        parsed.text.slice(
          previousLastDeclarator.start,
          previousLastDeclarator.end,
        ),
      ),
      commandLoadingStatement: normalizedTokenDescriptor(
        parsed.text.slice(
          commandLoadingStatement.start,
          commandLoadingStatement.end,
        ),
      ),
    },
    companionValueSpan: [
      unitStart + timeoutCall.arguments[2].start,
      unitStart + timeoutCall.arguments[2].end,
    ],
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

function mainSourceEvidence(ts, sourceFile, source) {
  const runs = []
  const imports = []
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'run') {
      runs.push(node)
    }
    if (ts.isImportDeclaration(node)) imports.push(node)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(runs.length, 1)
  const run = runs[0]
  const currentCwdDeclarations = []
  function findCurrentCwd(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(sourceFile) === 'currentCwd'
    ) {
      currentCwdDeclarations.push(node)
    }
    ts.forEachChild(node, findCurrentCwd)
  }
  findCurrentCwd(run)
  assert.equal(currentCwdDeclarations.length, 1)
  const currentCwd = currentCwdDeclarations[0]
  let currentCwdStatement = currentCwd
  while (!ts.isVariableStatement(currentCwdStatement)) {
    currentCwdStatement = currentCwdStatement.parent
  }
  const block = currentCwdStatement.parent
  assert.ok(ts.isBlock(block))
  const statementIndex = block.statements.indexOf(currentCwdStatement)
  assert.ok(statementIndex >= 0)
  const commandLoadingStatement = block.statements[statementIndex + 1]
  assert.ok(ts.isExpressionStatement(commandLoadingStatement))
  assert.equal(
    commandLoadingStatement.getText(sourceFile),
    "logForDebugging('[STARTUP] Loading commands and agents...');",
  )

  const importSpecs = {}
  for (const [moduleName] of Object.entries(
    fixture.inputs.sourceFile.sharedImports,
  )) {
    const matches = imports.filter(
      node => node.moduleSpecifier.text === moduleName,
    )
    assert.equal(matches.length, 1, `${moduleName}: one import`)
    const imported = matches[0]
    assert.ok(ts.isNamedImports(imported.importClause.namedBindings))
    importSpecs[moduleName] = {
      ...sourceNodeDescriptor(source, sourceFile, imported),
      names: imported.importClause.namedBindings.elements.map(
        element => element.name.text,
      ),
    }
  }

  return {
    run: sourceNodeDescriptor(source, sourceFile, run),
    ownerBoundary: {
      currentCwdDeclarator: sourceNodeDescriptor(
        source,
        sourceFile,
        currentCwd,
      ),
      commandLoadingStatement: sourceNodeDescriptor(
        source,
        sourceFile,
        commandLoadingStatement,
      ),
      gap: descriptor(
        source.slice(
          currentCwdStatement.end,
          commandLoadingStatement.getStart(sourceFile),
        ),
      ),
      statementIndex,
      bodyCount: block.statements.length,
    },
    importSpecs,
    currentCwdText: currentCwd.getText(sourceFile),
    commandLoadingText: commandLoadingStatement.getText(sourceFile),
  }
}

test(
  'u22106 GrowthBook timeout evidence is immutable, cumulative, and one-row scoped',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.targetUnit.targetIndex, 22106)
    assert.deepEqual(
      [...TARGET121_MAIN_RUN_GROWTHBOOK_TIMEOUT_EVIDENCE_IDS],
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

    const importedPriors = [
      TARGET121_MAIN_RUN_FIRST_ALLOWED_OWNER_EVIDENCE,
      TARGET121_MAIN_RUN_SECOND_ALLOWED_OWNER_EVIDENCE,
    ]
    assert.equal(fixture.inputs.priorAllowedProofs.length, 2)
    for (const [index, prior] of fixture.inputs.priorAllowedProofs.entries()) {
      const priorFixture = JSON.parse(
        readExact(
          path.join(repositoryRoot, prior.fixture.path),
          prior.fixture,
          `immutable ${prior.name} fixture dependency`,
        ),
      )
      readExact(
        path.join(repositoryRoot, prior.helper.path),
        prior.helper,
        `immutable ${prior.name} helper dependency`,
      )
      assert.deepEqual(priorFixture.staticAdmission.ownerResidue, prior.residue)
      assert.deepEqual(
        importedPriors[index].residues.map(row => ({ ...row })),
        [residueFromIdentity(prior.residue)],
      )
    }

    assert.ok(
      Object.isFrozen(TARGET121_MAIN_RUN_GROWTHBOOK_TIMEOUT_OWNER_EVIDENCE),
    )
    assert.ok(
      Object.isFrozen(
        TARGET121_MAIN_RUN_GROWTHBOOK_TIMEOUT_OWNER_EVIDENCE.residues,
      ),
    )
    assert.equal(
      Object.keys(ownerEvidenceModule).some(
        key =>
          key.includes('OWNER_OVERRIDES') ||
          key.includes('INPUT_FILES') ||
          key.includes('OUTPUT_FILES') ||
          /^apply|^build/.test(key),
      ),
      false,
      'static evidence exposes no replay, builder, or whole-unit override',
    )
    assert.deepEqual(
      {
        targetIndex:
          TARGET121_MAIN_RUN_GROWTHBOOK_TIMEOUT_OWNER_EVIDENCE.targetIndex,
        paths: [
          ...TARGET121_MAIN_RUN_GROWTHBOOK_TIMEOUT_OWNER_EVIDENCE.paths,
        ],
        declarations: [
          ...TARGET121_MAIN_RUN_GROWTHBOOK_TIMEOUT_OWNER_EVIDENCE.declarations,
        ],
        residues:
          TARGET121_MAIN_RUN_GROWTHBOOK_TIMEOUT_OWNER_EVIDENCE.residues.map(
            row => ({ ...row }),
          ),
        evidenceIds: [
          ...TARGET121_MAIN_RUN_GROWTHBOOK_TIMEOUT_OWNER_EVIDENCE.evidenceIds,
        ],
      },
      {
        targetIndex: 22106,
        paths: ['src/main.tsx'],
        declarations: ['run'],
        residues: [residueFromIdentity(fixture.staticAdmission.ownerResidue)],
        evidenceIds: fixture.evidenceIds,
      },
    )
    const ordered = [
      ...fixture.staticAdmission.priorResidues,
      fixture.staticAdmission.ownerResidue,
    ]
    assert.deepEqual(
      ordered.map(row => row[2]),
      [...ordered.map(row => row[2])].sort((left, right) => left - right),
    )
    assert.equal(new Set(ordered.map(row => JSON.stringify(row))).size, 3)
  },
)

test(
  'exact post-viewMode, post-dangerous, and post-prune phases preserve three-admission accounting',
  { skip: !selected },
  () => {
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
          { ...descriptor(reportBytes), bytes: reportBytes.length + 1 },
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

    const restoredPhysicalRows = new Set(
      [
        ...fixture.postDaemonOwner.restoredAddedRowsExact,
        fixture.postDangerous.removedRowsExact,
      ].map(JSON.stringify),
    )
    const classifiedAddedIdentities = addedIdentities.filter(
      row => !restoredPhysicalRows.has(JSON.stringify(row)),
    )
    const groups = fixture.postDangerous.rowClassification
    assert.deepEqual(groups.priorStaticOrdinals, [0, 1])
    assert.deepEqual(groups.ownedStaticOrdinals, [2])
    assert.deepEqual(groups.cumulativeStaticOrdinals, [0, 1, 2])
    const ordinals = [
      ...groups.cumulativeStaticOrdinals,
      ...groups.deferredProductionOrdinals,
      ...groups.buildMacroOrdinals,
    ].sort((left, right) => left - right)
    assert.deepEqual(
      ordinals,
      classifiedAddedIdentities.map((_, index) => index),
    )
    assert.equal(new Set(ordinals).size, ordinals.length)
    assert.deepEqual(
      groups.cumulativeStaticOrdinals.map(index => classifiedAddedIdentities[index]),
      [
        ...fixture.staticAdmission.priorResidues,
        fixture.staticAdmission.ownerResidue,
      ],
    )
    assert.deepEqual(
      groups.deferredProductionOrdinals.map(
        index => classifiedAddedIdentities[index][1],
      ),
      groups.deferredProductionValues,
    )
    assert.deepEqual(
      [
        ...new Set(
          groups.buildMacroOrdinals.map(index => classifiedAddedIdentities[index][1]),
        ),
      ],
      groups.buildMacroValues,
    )
    assert.deepEqual(fixture.postDangerous.staticAdmission.predictedImpact, {
      rawOwnerRows: 199,
      rawAddedRows: 15,
      priorStaticOwnerAddedRows: 2,
      ownedByThisProofOwnerAddedRows: 1,
      cumulativeAdmittedOwnerAddedRows: 3,
      remainingDeferredProductionRows: 6,
      separatelyHandledBuildMacroRows: 6,
      rawStrictRowsRemoved: 0,
      coverageRowsAddedOrReplaced: 0,
      predictedOwnerRows: 196,
      predictedAddedRows: 12,
      predictedStrictRows: 8,
      predictedCoverageRows: 1,
    })

    const admittedKeys = new Set(
      [
        ...fixture.staticAdmission.priorResidues,
        fixture.staticAdmission.ownerResidue,
      ].map(row => JSON.stringify(row.slice(0, 4))),
    )
    assert.ok(
      strictIdentities.every(
        row =>
          !admittedKeys.has(
            JSON.stringify([row[1], row[2], row[3], row[4]]),
          ),
      ),
      'three static admissions remove zero raw strict rows',
    )
    assert.deepEqual(
      ownerIdentities.filter(row => row[1] === 'gb-before-tools'),
      [fixture.replayScopeRejection.collateralOwnerResidue],
      'the retained companion row remains outside this admission',
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
    assert.equal(coverageRows.length, 1)
    assert.deepEqual(
      canonicalDescriptor(coverageRows),
      fixture.coverageRowsDescriptor,
    )
  },
)

test(
  'complete baseline and target units retain the exact timeout owner graph',
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
    const ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
          fixture.inputs.structuralLedger,
          'authenticated Target121 structural ledger',
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
    const baselineGraph = findTimeoutGraph(
      baselineUnit,
      fixture.baselineSemanticCounterpart.start,
      fixture.compiledTimeoutGraph.baseline.literal.start,
    )
    const targetGraph = findTimeoutGraph(
      targetUnit,
      fixture.targetUnit.start,
      fixture.staticAdmission.ownerResidue[2],
    )
    assert.deepEqual(baselineGraph.core, fixture.compiledTimeoutGraph.baseline)
    assert.deepEqual(targetGraph.core, fixture.compiledTimeoutGraph.target)
    for (const graph of [baselineGraph, targetGraph]) {
      assert.deepEqual(
        graph.normalized.ifStatement,
        fixture.compiledTimeoutGraph.normalizedIfTokens,
      )
      assert.deepEqual(
        graph.normalized.previousLastDeclarator,
        fixture.compiledTimeoutGraph.normalizedCurrentCwdTokens,
      )
      assert.deepEqual(
        graph.normalized.commandLoadingStatement,
        fixture.compiledTimeoutGraph.normalizedCommandLoadingTokens,
      )
    }
    assert.deepEqual(baselineGraph.normalized, targetGraph.normalized)
    assert.deepEqual(
      [targetGraph.core.literal.start, targetGraph.core.literal.end],
      fixture.staticAdmission.ownerResidue.slice(2, 4),
    )
    assert.deepEqual(
      targetGraph.companionValueSpan,
      fixture.replayScopeRejection.collateralOwnerResidue.slice(2, 4),
    )
    assert.equal(
      target.subarray(
        fixture.staticAdmission.ownerResidue[2],
        fixture.staticAdmission.ownerResidue[3],
      ).toString('utf8'),
      '300',
    )
    assert.ok(
      fixture.staticAdmission.priorResidues.at(-1)[3] <
        targetGraph.core.ifStatement.start,
      'the timeout graph follows both immutable allowed admissions',
    )
  },
)

test(
  'main source authenticates the owner boundary and rejects collateral replay',
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
    const evidence = mainSourceEvidence(ts, sourceFile, source)
    assert.deepEqual(evidence.run, expectedState.run)
    assert.deepEqual(evidence.ownerBoundary, expectedState.ownerBoundary)
    assert.deepEqual(evidence.importSpecs, sourceSpec.sharedImports)
    assert.deepEqual(
      normalizedTokenDescriptor(evidence.currentCwdText),
      fixture.compiledTimeoutGraph.normalizedCurrentCwdTokens,
    )
    assert.deepEqual(
      normalizedTokenDescriptor(evidence.commandLoadingText),
      fixture.compiledTimeoutGraph.normalizedCommandLoadingTokens,
    )
    assert.equal(source.includes('gb-before-tools'), false)
    assert.equal(
      evidence.importSpecs[
        './services/analytics/firstPartyEventLogger.js'
      ].names.includes('is1PEventLoggingEnabled'),
      false,
    )
    assert.equal(
      evidence.importSpecs['./utils/sleep.js'].names.includes('withTimeout'),
      false,
    )
    assert.equal(
      evidence.importSpecs[
        './services/analytics/growthbook.js'
      ].names.includes('initializeGrowthBook'),
      true,
    )
    assert.equal(
      evidence.importSpecs['./utils/config.js'].names.includes(
        'getGlobalConfig',
      ),
      true,
    )

    const rejected = fixture.replayScopeRejection
    assert.deepEqual(descriptor(rejected.minimalClosedStatement), {
      bytes: rejected.descriptor.bytes,
      sha256: rejected.descriptor.sha256,
    })
    const synthetic = parse(rejected.minimalClosedStatement, {
      ecmaVersion: 'latest',
      allowAwaitOutsideFunction: true,
    })
    assert.equal(synthetic.body.length, 1)
    assert.equal(synthetic.body[0].type, 'IfStatement')
    assert.deepEqual(
      normalizedTokenDescriptor(rejected.minimalClosedStatement),
      rejected.normalizedTokens,
    )
    assert.deepEqual(
      rejected.normalizedTokens,
      fixture.compiledTimeoutGraph.normalizedIfTokens,
      'the smallest authored statement is the exact normalized compiled graph',
    )
    const literalValues = []
    function collectLiterals(node) {
      if (node === null || typeof node !== 'object') return
      if (Array.isArray(node)) {
        for (const child of node) collectLiterals(child)
        return
      }
      if (node.type === 'Literal') literalValues.push(node.value)
      for (const [key, child] of Object.entries(node)) {
        if (!['end', 'start'].includes(key)) collectLiterals(child)
      }
    }
    collectLiterals(synthetic)
    assert.deepEqual(literalValues, [0, 300, 'gb-before-tools'])
    assert.deepEqual(rejected.missingImportSpecifiers, [
      'is1PEventLoggingEnabled',
      'withTimeout',
    ])
    assert.equal(
      fixture.postDangerous.staticAdmission.predictedImpact.rawOwnerRows -
        fixture.postDangerous.staticAdmission.predictedImpact.priorStaticOwnerAddedRows -
        2,
      195,
      'closed replay would claim numeric 300 and retained gb-before-tools',
    )
    assert.equal(
      fixture.postDangerous.staticAdmission.predictedImpact.predictedOwnerRows,
      196,
      'the authorized static disposition claims exactly one new row',
    )
    assert.ok(
      [
        'preViewModeReplay',
        'postViewModeReplay',
        'postDangerousReplay',
        'postPrune',
      ].includes(stateName),
    )
  },
)
