import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import * as replayModule from '../cases/2.1.120-to-2.1.121/recovered/replay-dangerous-mode-pre-dialog-source-gap.mjs'
import {
  TARGET121_MAIN_RUN_VIEW_MODE_OWNER_EVIDENCE,
  buildTarget121MainRunViewModeOutput,
} from '../cases/2.1.120-to-2.1.121/recovered/replay-main-run-view-mode-source-gap.mjs'
import { TARGET121_MAIN_RUN_FIRST_ALLOWED_OWNER_EVIDENCE } from '../cases/2.1.120-to-2.1.121/recovered/main-run-first-allowed-owner-evidence.mjs'

const {
  applyTarget121DangerousModePreDialogSourceRecovery,
  buildTarget121DangerousModePreDialogOutput,
  TARGET121_DANGEROUS_MODE_PRE_DIALOG_EVIDENCE_IDS,
  TARGET121_DANGEROUS_MODE_PRE_DIALOG_OWNER_EVIDENCE,
  TARGET121_DANGEROUS_MODE_PRE_DIALOG_SOURCE_STATES,
} = replayModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-dangerous-mode-pre-dialog-source-gap.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '118454b85d40a8e29411066b481faa156585c7bb86389a89775bb2e96767a402'
const residueName = 'skipDangerousModePromptSetPreDialog'

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

function evolutionSnapshot(state) {
  if (state === 'preDangerous') return fixture.inputs.frozenBeforeEdits
  if (state === 'postDangerous') return fixture.inputs.frozenAfterReplay
  if (state === 'postDaemonOwner') return fixture.inputs.frozenPostDaemonOwner
  assert.equal(state, 'postPrune')
  return fixture.inputs.frozenPostPrune
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
          evolutionSnapshot(reportState).typedReport,
        ) &&
        matchesDescriptor(
          coverageDescriptor,
          evolutionSnapshot(coverageState).sourceCoverage,
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
  const current = fixture.inputs.frozenPostDaemonOwner
  const reportBytes = fs.readFileSync(
    artifactPath('CLAUDE_CODE_TARGET121_TYPED_REPORT', current.typedReport),
  )
  const coverageGzip = fs.readFileSync(
    artifactPath('CLAUDE_CODE_TARGET121_SOURCE_COVERAGE', current.sourceCoverage),
  )
  return {
    ...selectEvolutionPair(descriptor(reportBytes), descriptor(coverageGzip)),
    reportBytes,
    coverageGzip,
  }
}

function configuredSourceFilename() {
  const configuredRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  if (configuredRoot) {
    return path.join(
      path.resolve(configuredRoot),
      fixture.inputs.sourceFile.path.replace(/^src\//, ''),
    )
  }
  return path.join(repositoryRoot, fixture.inputs.sourceFile.path)
}

function exactNodeDescriptor(text, node, offset = 0) {
  return {
    localStart: node.start,
    localEnd: node.end,
    start: offset + node.start,
    end: offset + node.end,
    ...descriptor(text.slice(node.start, node.end)),
  }
}

function normalizedTokenDescriptor(text) {
  const tokens = [...tokenizer(text, { ecmaVersion: 'latest' })].map(token => [
    token.type.label,
    token.type.label === 'name' ? '@id' : (token.value ?? null),
  ])
  return { count: tokens.length, ...canonicalDescriptor(tokens) }
}

function parseUnit(bundle, unit, label) {
  const value = bundle.subarray(unit.start, unit.end)
  assert.deepEqual(
    descriptor(value),
    { bytes: unit.bytes, sha256: unit.sha256 },
    label,
  )
  const text = value.toString('utf8')
  const ast = parse(text, { ecmaVersion: 'latest', sourceType: 'script' })
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

function walk(root, callback) {
  function visit(node, parent = null) {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child, parent)
      return
    }
    if (typeof node.type === 'string') callback(node, parent)
    for (const [key, child] of Object.entries(node)) {
      if (!['end', 'start'].includes(key)) visit(child, node)
    }
  }
  visit(root)
}

function compiledRunGraph(parsed, unitStart) {
  const properties = []
  const declarations = []
  const calls = []
  walk(parsed.ast, (node, parent) => {
    if (
      node.type === 'Property' &&
      !node.computed &&
      (node.key.name ?? node.key.value) === residueName
    ) {
      properties.push({ node, parent })
    }
    if (node.type === 'VariableDeclarator') declarations.push(node)
    if (node.type === 'CallExpression') calls.push(node)
  })
  if (properties.length === 0) return { propertyCount: 0 }
  assert.equal(properties.length, 1)
  const { node: property, parent: object } = properties[0]
  const call = calls.find(node => node.arguments.includes(object))
  assert.ok(call)
  const boundName = property.value.name
  const definition = declarations.find(node => node.id?.name === boundName)
  assert.ok(definition)
  const propertyText = parsed.text.slice(property.start, property.end)
  const definitionText = parsed.text.slice(definition.start, definition.end)
  return {
    propertyCount: properties.length,
    property: {
      ...exactNodeDescriptor(parsed.text, property, unitStart),
      text: propertyText,
      normalizedTokens: normalizedTokenDescriptor(propertyText),
    },
    call: {
      callee: call.callee.name,
      ...exactNodeDescriptor(parsed.text, call, unitStart),
    },
    boundName,
    definition: {
      ...exactNodeDescriptor(parsed.text, definition, unitStart),
      text: definitionText,
      initializerType: definition.init.type,
      initializerCallee: definition.init.callee.name,
      normalizedTokens: normalizedTokenDescriptor(definitionText),
    },
    definitionBeforeCall: definition.start < property.start,
  }
}

function compiledCalleeGraph(parsed, unitStart) {
  const properties = []
  const identifiers = []
  walk(parsed.ast, (node, parent) => {
    if (
      node.type === 'Property' &&
      !node.computed &&
      (node.key.name ?? node.key.value) === residueName
    ) {
      properties.push(node)
    }
    if (node.type === 'Identifier') identifiers.push({ node, parent })
  })
  if (properties.length === 0) return { propertyCount: 0 }
  assert.equal(properties.length, 1)
  const property = properties[0]
  assert.ok(parsed.node.params[0].properties.includes(property))
  const propertyText = parsed.text.slice(property.start, property.end)
  const boundName = property.value.name
  return {
    propertyCount: 1,
    functionName: parsed.node.id.name,
    property: {
      ...exactNodeDescriptor(parsed.text, property, unitStart),
      text: propertyText,
      normalizedTokens: normalizedTokenDescriptor(propertyText),
    },
    boundName,
    boundOccurrences: identifiers
      .filter(({ node }) => node.name === boundName)
      .map(({ node, parent }) => ({
        ...exactNodeDescriptor(parsed.text, node, unitStart),
        parentType: parent.type,
      })),
  }
}

function structuralDescriptor(region, indexName) {
  const unit = region[indexName]
  return {
    [indexName === 'target' ? 'targetIndex' : 'baselineUnitIndex']:
      unit.index,
    nodeType: unit.nodeType,
    parseStatus: unit.parseStatus,
    start: unit.start,
    end: unit.end,
    tokenCount: unit.tokenCount,
    sha256: unit.sourceHash,
    coarseHash: unit.coarseHash,
    topDefinitionCount: unit.topDefinitionCount,
    line: unit.location.line,
    column: unit.location.column,
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

function assertPartition(rows, expected, identity) {
  assert.equal(rows.length, expected.count)
  assert.deepEqual(canonicalDescriptor(rows), expected.fullRows)
  assert.deepEqual(
    canonicalDescriptor(rows.map(identity)),
    expected.identities,
  )
}

function residueIdentity(row) {
  return JSON.stringify([
    row.targetIndex,
    row.literalKind,
    row.value,
    row.start,
    row.end,
    row.targetOccurrenceNumber,
  ])
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

function sourceGraph(source) {
  const ts = typescript()
  const sourceFile = ts.createSourceFile(
    'main.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const imports = []
  const functions = new Map()
  function visit(node) {
    if (
      ts.isImportSpecifier(node) &&
      node.name.text === 'hasSkipDangerousModePermissionPrompt'
    ) {
      imports.push(node)
    }
    if (ts.isFunctionDeclaration(node) && node.name) {
      functions.set(node.name.text, node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  const run = functions.get('run')
  const callee = functions.get('logTenguInit')
  assert.ok(run)
  assert.ok(callee)
  const snapshots = []
  const calls = []
  function visitRun(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(sourceFile) === residueName
    ) {
      snapshots.push(node)
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(sourceFile) === 'logTenguInit'
    ) {
      calls.push(node)
    }
    ts.forEachChild(node, visitRun)
  }
  visitRun(run)
  const callProperties = calls.flatMap(call =>
    call.arguments.flatMap(argument =>
      ts.isObjectLiteralExpression(argument)
        ? argument.properties.filter(
            property => property.name?.getText(sourceFile) === residueName,
          )
        : [],
    ),
  )
  const bindingProperties = ts.isObjectBindingPattern(callee.parameters[0].name)
    ? callee.parameters[0].name.elements.filter(
        element => element.name.getText(sourceFile) === residueName,
      )
    : []
  const typeNode = callee.parameters[0].type
  const typeProperties =
    typeNode && ts.isTypeLiteralNode(typeNode)
      ? typeNode.members.filter(
          member => member.name?.getText(sourceFile) === residueName,
        )
      : []
  const bodyUses = []
  function visitBody(node) {
    if (ts.isIdentifier(node) && node.text === residueName) bodyUses.push(node)
    ts.forEachChild(node, visitBody)
  }
  visitBody(callee.body)
  return {
    ts,
    sourceFile,
    run,
    callee,
    imports,
    snapshots,
    calls,
    callProperties,
    bindingProperties,
    typeProperties,
    bodyUses,
  }
}

function sourceState(actual) {
  const sourceFile = fixture.inputs.sourceFile
  const states = {
    ...sourceFile.acceptedStates,
    postPrune: sourceFile.postPruneSourceState,
  }
  const matches = []
  for (const [stateName, state] of Object.entries(states)) {
    for (const phase of ['input', 'output']) {
      if (state[phase] && matchesDescriptor(actual, state[phase].file)) {
        matches.push({ stateName, phase, state })
      }
    }
  }
  assert.equal(matches.length, 1, 'source must match one exact accepted state')
  return matches[0]
}

test(
  'dangerous-mode pre-dialog replay metadata is immutable and exactly two-row scoped',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(
      [...TARGET121_DANGEROUS_MODE_PRE_DIALOG_EVIDENCE_IDS],
      fixture.evidenceIds,
    )
    const evolutionStates = ['preDangerous', 'postDangerous', 'postPrune', 'postDaemonOwner']
    for (const state of evolutionStates) {
      const snapshot = evolutionSnapshot(state)
      assert.deepEqual(
        selectEvolutionPair(
          expectedDescriptor(snapshot.typedReport),
          expectedDescriptor(snapshot.sourceCoverage),
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
          {
            ...expectedDescriptor(fixture.inputs.frozenAfterReplay.typedReport),
            bytes: fixture.inputs.frozenAfterReplay.typedReport.bytes + 1,
          },
          expectedDescriptor(fixture.inputs.frozenAfterReplay.sourceCoverage),
        ),
      /unsupported exact report\/coverage pair/,
    )
    assert.equal(fixture.inputs.frozenAfterReplay.typedReport.projection, 'frozenBeforeEdits excluding rowBoundary.admitted')
    assert.equal(fixture.inputs.frozenAfterReplay.sourceCoverage.projection, 'frozenBeforeEdits')
    assert.equal(fixture.postDangerous.coverageProjection, 'preDangerous')
    assert.equal(
      fixture.inputs.frozenPostPrune.typedReport.projection,
      'frozenAfterReplay plus unrelated post-prune owner corrections',
    )
    assert.equal(
      fixture.inputs.sourceFile.postPruneSourceState.projection,
      'postViewModeReplay.output plus the unrelated plugin-prune source replay',
    )
    assert.deepEqual(
      descriptor(
        fs.readFileSync(
          path.join(repositoryRoot, fixture.caseFiles.helper.path),
        ),
      ),
      expectedDescriptor(fixture.caseFiles.helper),
    )
    assert.ok(Object.isFrozen(TARGET121_DANGEROUS_MODE_PRE_DIALOG_OWNER_EVIDENCE))
    assert.ok(Object.isFrozen(TARGET121_DANGEROUS_MODE_PRE_DIALOG_OWNER_EVIDENCE.residues))
    assert.deepEqual(
      TARGET121_DANGEROUS_MODE_PRE_DIALOG_OWNER_EVIDENCE.residues.map(row => [
        row.targetIndex,
        row.literalKind,
        row.value,
        row.start,
        row.end,
        0,
        row.targetOccurrenceNumber,
        true,
      ]),
      fixture.rowBoundary.admitted,
    )
    assert.deepEqual(
      TARGET121_DANGEROUS_MODE_PRE_DIALOG_SOURCE_STATES.map(state => ({
        name: state.name,
        path: state.path,
        input: { ...state.input },
        output: { ...state.output },
      })),
      Object.entries(fixture.inputs.sourceFile.acceptedStates).map(
        ([name, state]) => ({
          name,
          path: fixture.inputs.sourceFile.path,
          input: state.input.file,
          output: state.output.file,
        }),
      ),
    )

    const graphKeys = new Set(
      TARGET121_DANGEROUS_MODE_PRE_DIALOG_OWNER_EVIDENCE.residues.map(
        residueIdentity,
      ),
    )
    const priorResidues = [
      ...TARGET121_MAIN_RUN_VIEW_MODE_OWNER_EVIDENCE.residues.map(row => ({
        targetIndex: TARGET121_MAIN_RUN_VIEW_MODE_OWNER_EVIDENCE.targetIndex,
        ...row,
      })),
      ...TARGET121_MAIN_RUN_FIRST_ALLOWED_OWNER_EVIDENCE.residues.map(row => ({
        targetIndex: TARGET121_MAIN_RUN_FIRST_ALLOWED_OWNER_EVIDENCE.targetIndex,
        ...row,
      })),
    ]
    assert.ok(priorResidues.every(row => !graphKeys.has(residueIdentity(row))))
    assert.deepEqual(
      priorResidues.map(row => [
        row.targetIndex,
        row.literalKind,
        row.value,
        row.start,
        row.end,
        row.targetOccurrenceNumber,
      ]),
      [
        ...fixture.rowBoundary.priorViewModeAdmission,
        fixture.rowBoundary.priorFirstAllowedAdmission,
      ].map(row => [row[0], row[1], row[2], row[3], row[4], row[6]]),
    )
  },
)

test(
  'exact pre/post-dangerous/post-prune report phases preserve the two-row replay boundary',
  { skip: !selected },
  () => {
    const evolution = readEvolutionArtifacts()
    assertCompatibleEvolutionPair(evolution.reportState, evolution.coverageState)
    const frozen = evolutionSnapshot(evolution.reportState)
    const reportBytes = evolution.reportBytes
    const coverageGzip = evolution.coverageGzip
    const report = JSON.parse(reportBytes)
    const expectedReport =
      evolution.reportState === 'preDangerous'
        ? fixture.reportSnapshot
        : evolution.reportState === 'postDangerous'
          ? fixture.postDangerous.reportSnapshot
          : evolution.reportState === 'postPrune'
            ? {
              ...fixture.postDangerous.reportSnapshot,
              global: fixture.postPrune.global,
            }
            : {
                ...fixture.postDaemonOwner.reportSnapshot,
                u22107: fixture.reportSnapshot.u22107,
              }
    const partitions = [
      ['global', null],
      ['u22106', 22106],
      ['u22107', 22107],
    ]
    for (const [name, targetIndex] of partitions) {
      const select = row =>
        targetIndex === null || row.structural.index === targetIndex
      assertPartition(
        report.sourceRuntimeOwnerResidueRows.filter(select),
        expectedReport[name].ownerRows,
        reportIdentity,
      )
      assertPartition(
        report.sourceRuntimeAddedOwnerResidueRows.filter(select),
        expectedReport[name].addedRows,
        reportIdentity,
      )
      assertPartition(
        report.rows.filter(select),
        expectedReport[name].strictRows,
        strictIdentity,
      )
    }

    const admitted = fixture.rowBoundary.admitted
    const admittedReportIdentities = admitted.map(row => row.slice(1))
    const actualAdmitted = report.sourceRuntimeAddedOwnerResidueRows
      .filter(row => [22106, 22107].includes(row.structural.index))
      .filter(row => row.value === residueName)
    if (
      evolution.reportState === 'preDangerous' ||
      evolution.reportState === 'postDaemonOwner'
    ) {
      assert.deepEqual(
        actualAdmitted.map(row => [row.structural.index, ...reportIdentity(row)]),
        admitted,
      )
      assert.deepEqual(
        report.rows
          .filter(row =>
            admittedReportIdentities.some(
              admittedRow =>
                JSON.stringify(reportIdentity(row)) ===
                JSON.stringify(admittedRow),
            ),
          )
          .map(strictIdentity),
        admitted.map(row => [row[0], row[1], row[2], row[3], row[4], row[6]]),
        'both owner-added rows are also raw strict rows',
      )
      assert.ok(
        actualAdmitted.every(
          row =>
            JSON.stringify(row.ownerPaths) === JSON.stringify(['main.tsx']) &&
            row.ownerSourceMatches.length === 0,
        ),
      )
    } else {
      assert.deepEqual(actualAdmitted, [])
      assert.deepEqual(fixture.postDangerous.removedRowsExact, admitted)
    }

    const u22106Added = report.sourceRuntimeAddedOwnerResidueRows
      .filter(row => row.structural.index === 22106)
      .map(reportIdentity)
    assert.deepEqual(
      u22106Added.filter(
        row =>
          !(
            row[0] === 'property' &&
            row[1] === residueName &&
            row[2] === 13809436
          ),
      ),
      evolution.reportState === 'postDaemonOwner'
        ? [
            ...fixture.postDaemonOwner.restoredViewModeRowsExact,
            ...fixture.rowBoundary.remainingU22106AddedAfterThisReplay,
          ]
        : fixture.rowBoundary.remainingU22106AddedAfterThisReplay,
    )

    const current = fixture.reportSnapshot
    const direct = fixture.predictedImpact.thisReplayAgainstFrozenSnapshot
    assert.deepEqual(
      direct.global,
      {
        ownerRows: current.global.ownerRows.count + direct.ownerRowDelta,
        addedRows: current.global.addedRows.count + direct.addedRowDelta,
        strictRows: current.global.strictRows.count + direct.strictRowDelta,
        coverageRows: fixture.coverageSnapshot.globalRowCount,
      },
    )
    assert.deepEqual(direct.u22106, {
      ownerRows: current.u22106.ownerRows.count - 1,
      addedRows: current.u22106.addedRows.count - 1,
      strictRows: current.u22106.strictRows.count - 1,
      coverageRows: 1,
    })
    assert.deepEqual(direct.u22107, {
      ownerRows: current.u22107.ownerRows.count - 1,
      addedRows: current.u22107.addedRows.count - 1,
      strictRows: current.u22107.strictRows.count - 1,
      coverageRows: 1,
    })
    assert.deepEqual(
      {
        global: {
          ownerRows: expectedReport.global.ownerRows.count,
          addedRows: expectedReport.global.addedRows.count,
          strictRows: expectedReport.global.strictRows.count,
          coverageRows: fixture.coverageSnapshot.globalRowCount,
        },
        u22106: {
          ownerRows: expectedReport.u22106.ownerRows.count,
          addedRows: expectedReport.u22106.addedRows.count,
          strictRows: expectedReport.u22106.strictRows.count,
          coverageRows: 1,
        },
        u22107: {
          ownerRows: expectedReport.u22107.ownerRows.count,
          addedRows: expectedReport.u22107.addedRows.count,
          strictRows: expectedReport.u22107.strictRows.count,
          coverageRows: 1,
        },
      },
      evolution.reportState === 'preDangerous'
        ? {
            global: {
              ownerRows: fixture.reportSnapshot.global.ownerRows.count,
              addedRows: fixture.reportSnapshot.global.addedRows.count,
              strictRows: fixture.reportSnapshot.global.strictRows.count,
              coverageRows: fixture.coverageSnapshot.globalRowCount,
            },
            u22106: {
              ownerRows: fixture.reportSnapshot.u22106.ownerRows.count,
              addedRows: fixture.reportSnapshot.u22106.addedRows.count,
              strictRows: fixture.reportSnapshot.u22106.strictRows.count,
              coverageRows: 1,
            },
            u22107: {
              ownerRows: fixture.reportSnapshot.u22107.ownerRows.count,
              addedRows: fixture.reportSnapshot.u22107.addedRows.count,
              strictRows: fixture.reportSnapshot.u22107.strictRows.count,
              coverageRows: 1,
            },
          }
        : evolution.reportState === 'postDangerous'
          ? {
              global: direct.global,
              u22106: direct.u22106,
              u22107: direct.u22107,
            }
          : evolution.reportState === 'postPrune'
            ? {
              global: {
                ownerRows: fixture.postPrune.global.ownerRows.count,
                addedRows: fixture.postPrune.global.addedRows.count,
                strictRows: fixture.postPrune.global.strictRows.count,
                coverageRows: fixture.coverageSnapshot.globalRowCount,
              },
              u22106: direct.u22106,
              u22107: direct.u22107,
              }
            : {
                global: {
                  ownerRows: fixture.postDaemonOwner.reportSnapshot.global.ownerRows.count,
                  addedRows: fixture.postDaemonOwner.reportSnapshot.global.addedRows.count,
                  strictRows: fixture.postDaemonOwner.reportSnapshot.global.strictRows.count,
                  coverageRows: fixture.coverageSnapshot.globalRowCount,
                },
                u22106: {
                  ownerRows: fixture.postDaemonOwner.reportSnapshot.u22106.ownerRows.count,
                  addedRows: fixture.postDaemonOwner.reportSnapshot.u22106.addedRows.count,
                  strictRows: fixture.postDaemonOwner.reportSnapshot.u22106.strictRows.count,
                  coverageRows: 1,
                },
                u22107: {
                  ownerRows: fixture.reportSnapshot.u22107.ownerRows.count,
                  addedRows: fixture.reportSnapshot.u22107.addedRows.count,
                  strictRows: fixture.reportSnapshot.u22107.strictRows.count,
                  coverageRows: 1,
                },
              },
    )
    const cumulative =
      fixture.predictedImpact.cumulativeAfterFirstAllowedStaticAdmission
    assert.equal(cumulative.global.ownerRows, direct.global.ownerRows - 1)
    assert.equal(cumulative.global.addedRows, direct.global.addedRows - 1)
    assert.equal(cumulative.global.strictRows, direct.global.strictRows)
    assert.equal(cumulative.u22106.ownerRows, direct.u22106.ownerRows - 1)
    assert.equal(cumulative.u22106.addedRows, direct.u22106.addedRows - 1)
    assert.equal(cumulative.u22106.strictRows, direct.u22106.strictRows)

    const coverageRaw = gunzipSync(coverageGzip)
    assert.deepEqual(descriptor(coverageRaw), {
      bytes: frozen.sourceCoverage.rawBytes,
      sha256: frozen.sourceCoverage.rawSha256,
    })
    const coverage = JSON.parse(coverageRaw)
    assert.equal(coverage.rows.length, fixture.coverageSnapshot.globalRowCount)
    const selectedRows = coverage.rows.filter(row =>
      [22106, 22107].includes(row.targetIndex),
    )
    assert.deepEqual(
      canonicalDescriptor(selectedRows),
      fixture.coverageSnapshot.selectedRowsDescriptor,
    )
    assert.deepEqual(selectedRows, fixture.coverageSnapshot.rows)
  },
)

test(
  'complete baseline and target units authenticate one pre-dialog call-to-callee graph',
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
    for (const [name, expected] of Object.entries(fixture.targetUnits)) {
      const region = ledger.regions.find(
        row => row.target?.index === expected.targetIndex,
      )
      assert.ok(region, `${name}: target region`)
      assert.equal(region.classification, expected.classification)
      assert.equal(
        region.unknownFreeIdentifierCount,
        expected.unknownFreeIdentifierCount,
      )
      assert.deepEqual(structuralDescriptor(region, 'target'), {
        targetIndex: expected.targetIndex,
        nodeType: expected.nodeType,
        parseStatus: expected.parseStatus,
        start: expected.start,
        end: expected.end,
        tokenCount: expected.tokenCount,
        sha256: expected.sha256,
        coarseHash: expected.coarseHash,
        topDefinitionCount: expected.topDefinitionCount,
        line: expected.line,
        column: expected.column,
      })
    }
    for (const [name, expected] of Object.entries(fixture.baselineUnits)) {
      const unit = ledger.unmatchedBaseline.find(
        row => row.index === expected.baselineUnitIndex,
      )
      assert.ok(unit, `${name}: unmatched baseline unit`)
      assert.deepEqual(
        {
          baselineUnitIndex: unit.index,
          nodeType: unit.nodeType,
          parseStatus: unit.parseStatus,
          start: unit.start,
          end: unit.end,
          tokenCount: unit.tokenCount,
          sha256: unit.sourceHash,
          coarseHash: unit.coarseHash,
          topDefinitionCount: unit.topDefinitionCount,
          line: unit.location.line,
          column: unit.location.column,
        },
        {
          baselineUnitIndex: expected.baselineUnitIndex,
          nodeType: expected.nodeType,
          parseStatus: expected.parseStatus,
          start: expected.start,
          end: expected.end,
          tokenCount: expected.tokenCount,
          sha256: expected.sha256,
          coarseHash: expected.coarseHash,
          topDefinitionCount: expected.topDefinitionCount,
          line: expected.line,
          column: expected.column,
        },
      )
    }

    const baselineRun = parseUnit(
      baseline,
      fixture.baselineUnits.run,
      'complete Target120 run',
    )
    const baselineCallee = parseUnit(
      baseline,
      fixture.baselineUnits.logTenguInit,
      'complete Target120 logTenguInit',
    )
    const targetRun = parseUnit(
      target,
      fixture.targetUnits.run,
      'complete Target121 run',
    )
    const targetCallee = parseUnit(
      target,
      fixture.targetUnits.logTenguInit,
      'complete Target121 logTenguInit',
    )
    assert.deepEqual(
      compiledRunGraph(baselineRun, fixture.baselineUnits.run.start),
      { propertyCount: fixture.compiledGraph.baseline.runPropertyCount },
    )
    assert.deepEqual(
      compiledCalleeGraph(
        baselineCallee,
        fixture.baselineUnits.logTenguInit.start,
      ),
      { propertyCount: fixture.compiledGraph.baseline.calleePropertyCount },
    )
    const runGraph = compiledRunGraph(
      targetRun,
      fixture.targetUnits.run.start,
    )
    assert.equal(runGraph.propertyCount, 1)
    assert.equal(runGraph.boundName, 'tf')
    assert.equal(runGraph.definitionBeforeCall, true)
    assert.deepEqual(runGraph.property, fixture.compiledGraph.target.runProperty)
    assert.deepEqual(runGraph.call, fixture.compiledGraph.target.runCall)
    assert.deepEqual(
      runGraph.definition,
      fixture.compiledGraph.target.snapshotDefinition,
    )
    const calleeGraph = compiledCalleeGraph(
      targetCallee,
      fixture.targetUnits.logTenguInit.start,
    )
    assert.equal(calleeGraph.propertyCount, 1)
    assert.equal(calleeGraph.functionName, fixture.targetUnits.logTenguInit.name)
    assert.equal(calleeGraph.boundName, 'P')
    assert.deepEqual(
      calleeGraph.property,
      fixture.compiledGraph.target.calleeProperty,
    )
    assert.deepEqual(
      calleeGraph.boundOccurrences,
      fixture.compiledGraph.target.calleeBoundOccurrences,
      'the target callee binding is deliberately unused beyond destructuring',
    )
    assert.deepEqual(
      runGraph.property.normalizedTokens,
      calleeGraph.property.normalizedTokens,
      'caller and callee properties differ only in bound identifier',
    )

    const settingsRegion = ledger.regions.find(
      row => row.target?.index === fixture.settingsReaderUnit.targetIndex,
    )
    assert.ok(settingsRegion)
    assert.equal(settingsRegion.classification, 'matched')
    assert.equal(
      settingsRegion.baselineUnitIndex,
      fixture.settingsReaderUnit.baselineUnitIndex,
    )
    assert.equal(settingsRegion.pairReason, fixture.settingsReaderUnit.pairReason)
    const settingsUnit = parseUnit(
      target,
      {
        ...fixture.settingsReaderUnit,
        async: false,
      },
      'Target121 settings reader',
    )
    assert.equal(settingsUnit.node.id.name, 'oe')
    const settingsText = settingsUnit.text
    for (const source of [
      'userSettings',
      'localSettings',
      'flagSettings',
      'policySettings',
    ]) {
      assert.ok(settingsText.includes(`"${source}"`))
    }
    assert.equal(
      (settingsText.match(/skipDangerousModePermissionPrompt/g) ?? []).length,
      4,
    )
  },
)

test(
  'bounded source replay restores the exact typed graph in either accepted source lineage',
  { skip: !selected },
  () => {
    const filename = configuredSourceFilename()
    const source = fs.readFileSync(filename, 'utf8')
    const selectedState = sourceState(descriptor(source))
    const recovered =
      selectedState.phase === 'input'
        ? buildTarget121DangerousModePreDialogOutput(source)
        : source
    assert.deepEqual(
      descriptor(recovered),
      selectedState.state.output.file,
      'recovered source descriptor',
    )
    if (selectedState.phase === 'input') {
      const inputGraph = sourceGraph(source)
      assert.equal(inputGraph.imports.length, 0)
      assert.equal(inputGraph.snapshots.length, 0)
      assert.equal(inputGraph.callProperties.length, 0)
      assert.equal(inputGraph.bindingProperties.length, 0)
      assert.equal(inputGraph.typeProperties.length, 0)
    }

    const graph = sourceGraph(recovered)
    assert.equal(graph.imports.length, 1)
    assert.equal(graph.snapshots.length, 1)
    assert.equal(graph.calls.length, 1)
    assert.equal(graph.callProperties.length, 1)
    assert.equal(graph.bindingProperties.length, 1)
    assert.equal(graph.typeProperties.length, 1)
    assert.equal(graph.bodyUses.length, 0)
    assert.equal(
      graph.snapshots[0].initializer.getText(graph.sourceFile),
      'hasSkipDangerousModePermissionPrompt()',
    )
    assert.equal(
      graph.callProperties[0].kind,
      graph.ts.SyntaxKind.ShorthandPropertyAssignment,
    )
    assert.equal(
      graph.typeProperties[0].type.getText(graph.sourceFile),
      'boolean',
    )
    assert.ok(
      graph.snapshots[0].getStart(graph.sourceFile) <
        graph.callProperties[0].getStart(graph.sourceFile),
    )
    const expected = selectedState.state.output
    assert.deepEqual(
      sourceNodeDescriptor(recovered, graph.sourceFile, graph.run),
      expected.run,
    )
    assert.deepEqual(
      sourceNodeDescriptor(recovered, graph.sourceFile, graph.callee),
      expected.logTenguInit,
    )
    assert.deepEqual(
      sourceNodeDescriptor(recovered, graph.sourceFile, graph.imports[0]),
      expected.importSpecifier,
    )
    assert.deepEqual(
      sourceNodeDescriptor(recovered, graph.sourceFile, graph.snapshots[0]),
      expected.snapshot,
    )
    assert.deepEqual(
      sourceNodeDescriptor(
        recovered,
        graph.sourceFile,
        graph.callProperties[0],
      ),
      expected.callProperty,
    )
    assert.deepEqual(
      sourceNodeDescriptor(
        recovered,
        graph.sourceFile,
        graph.bindingProperties[0],
      ),
      expected.calleeBinding,
    )
    assert.deepEqual(
      sourceNodeDescriptor(
        recovered,
        graph.sourceFile,
        graph.typeProperties[0],
      ),
      expected.calleeType,
    )
  },
)

test(
  'replay is deterministic, idempotent, and rejects partial or mixed source states',
  { skip: !selected },
  () => {
    const preSource = fs.readFileSync(path.join(repositoryRoot, 'src/main.tsx'))
    assert.deepEqual(
      descriptor(preSource),
      fixture.inputs.sourceFile.acceptedStates.preViewModeReplay.input.file,
      'raw source remains the immutable pre-viewMode input',
    )
    const postSource = Buffer.from(
      buildTarget121MainRunViewModeOutput(preSource.toString('utf8')),
    )
    assert.deepEqual(
      descriptor(postSource),
      fixture.inputs.sourceFile.acceptedStates.postViewModeReplay.input.file,
      'post-viewMode input is reconstructed independently',
    )

    for (const [stateName, input] of [
      ['preViewModeReplay', preSource],
      ['postViewModeReplay', postSource],
    ]) {
      const temporaryRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), `target121-dangerous-mode-${stateName}-`),
      )
      const filename = path.join(temporaryRoot, 'main.tsx')
      fs.writeFileSync(filename, input)
      assert.deepEqual(
        applyTarget121DangerousModePreDialogSourceRecovery({
          sourceRoot: temporaryRoot,
        }),
        { status: 'recovered', state: stateName, files: ['src/main.tsx'] },
      )
      const output = fs.readFileSync(filename)
      assert.deepEqual(
        descriptor(output),
        fixture.inputs.sourceFile.acceptedStates[stateName].output.file,
      )
      assert.deepEqual(
        applyTarget121DangerousModePreDialogSourceRecovery({
          sourceRoot: temporaryRoot,
        }),
        { status: 'already-recovered', state: stateName, files: [] },
      )

      const partial = Buffer.from(
        output
          .toString('utf8')
          .replace(`      ${residueName},\n`, ''),
      )
      assert.notDeepEqual(descriptor(partial), descriptor(output))
      fs.writeFileSync(filename, partial)
      assert.throws(
        () =>
          applyTarget121DangerousModePreDialogSourceRecovery({
            sourceRoot: temporaryRoot,
          }),
        /requires one exact accepted raw or recovered source state/,
      )
    }

    const callerOnly = preSource
      .toString('utf8')
      .replace(
        '      systemPromptFlag:',
        `      ${residueName},\n      systemPromptFlag:`,
      )
    assert.throws(
      () => buildTarget121DangerousModePreDialogOutput(callerOnly),
      /run call property replay anchor differs/,
    )
    assert.throws(
      () => buildTarget121DangerousModePreDialogOutput('not main source'),
      /settings import replay anchor differs/,
    )
  },
)
