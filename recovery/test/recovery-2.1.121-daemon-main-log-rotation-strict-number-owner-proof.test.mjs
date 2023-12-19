import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import * as ownerEvidenceModule from '../cases/2.1.120-to-2.1.121/recovered/daemon-main-log-rotation-strict-number-owner-evidence.mjs'

const {
  TARGET121_DAEMON_MAIN_LOG_ROTATION_DEPENDENCY_TARGET_INDICES,
  TARGET121_DAEMON_MAIN_LOG_ROTATION_EVIDENCE_IDS,
  TARGET121_DAEMON_MAIN_LOG_ROTATION_MATCHED_STATIC_PROOF_SPEC,
  TARGET121_DAEMON_MAIN_LOG_ROTATION_STRICT_NUMBER_OWNER_EVIDENCE,
} = ownerEvidenceModule

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
    './recovery-2.1.121-daemon-main-log-rotation-strict-number-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'a6b9904ab3f4c7adb6fdb7361d68e5a89d297c1fc2c866c4a0ffcbed0b3424d8'

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

function sameDescriptor(actual, expected) {
  return (
    actual?.bytes === expected?.bytes && actual?.sha256 === expected?.sha256
  )
}

function selectFrozenPhase(reportDescriptor, coverageDescriptor) {
  const phases = [
    ['postPrune', fixture.inputs.frozenPostPruneSnapshot],
    ['postDaemonOwner', fixture.inputs.frozenPostDaemonOwnerSnapshot],
  ]
  const match = phases.find(
    ([, snapshot]) =>
      sameDescriptor(reportDescriptor, snapshot.typedReport) &&
      sameDescriptor(coverageDescriptor, snapshot.sourceCoverage),
  )
  if (!match) {
    throw new Error('unknown-or-hybrid-target121-log-rotation-phase')
  }
  return { name: match[0], snapshot: match[1] }
}

function typedReportIdentity(row) {
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

function targetSourceRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_121_SOURCE_ROOT ??
      process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
      path.join(repositoryRoot, fixture.inputs.sourceRoots.raw),
  )
}

function typescript() {
  return require(
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  )
}

function reportIdentity(item, residue) {
  return [
    item.targetIndex,
    residue.literalKind,
    residue.value,
    residue.start,
    residue.end,
    residue.baselineCount,
    residue.targetOccurrenceNumber,
    true,
  ]
}

function walkAst(value, visit) {
  if (value === null || typeof value !== 'object') return
  if (typeof value.type === 'string') visit(value)
  for (const [key, child] of Object.entries(value)) {
    if (['end', 'loc', 'range', 'raw', 'start'].includes(key)) continue
    if (Array.isArray(child)) {
      for (const item of child) walkAst(item, visit)
    } else {
      walkAst(child, visit)
    }
  }
}

function canonicalizeAst(value) {
  if (Array.isArray(value)) return value.map(canonicalizeAst)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !['end', 'loc', 'range', 'raw', 'start'].includes(key))
      .map(([key, child]) => [
        key,
        key === 'name' && value.type === 'Identifier'
          ? '@id'
          : canonicalizeAst(child),
      ]),
  )
}

function normalizedTokenShape(text) {
  return [...tokenizer(text, { ecmaVersion: 'latest' })].map(token => [
    token.type.label,
    token.type.label === 'name' ? '@id' : token.value,
  ])
}

function parsedUnit(bundle, expected) {
  const bytes = bundle.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(bytes), {
    bytes: expected.bytes,
    sha256: expected.sha256,
  })
  const text = bytes.toString('utf8')
  const ast = parse(text, { ecmaVersion: 'latest', sourceType: 'script' })
  assert.equal(ast.body.length, 1)
  assert.equal(ast.body[0].type, expected.nodeType ?? ast.body[0].type)
  assert.equal(
    [...tokenizer(text, { ecmaVersion: 'latest' })].length,
    expected.tokenCount,
  )
  return { ast, node: ast.body[0], text }
}

function tsSourceDescriptor(text, node) {
  const start = node.getStart(node.getSourceFile())
  const end = node.end
  const value = text.slice(start, end)
  return {
    start,
    end,
    chars: value.length,
    ...descriptor(value),
  }
}

function collectTs(sourceFile, ts, predicate) {
  const result = []
  function visit(node) {
    if (predicate(node)) result.push(node)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return result
}

function evaluateNumericExpression(node, ts) {
  if (ts.isNumericLiteral(node)) return Number(node.text)
  assert.ok(ts.isBinaryExpression(node))
  assert.equal(node.operatorToken.kind, ts.SyntaxKind.AsteriskToken)
  return (
    evaluateNumericExpression(node.left, ts) *
    evaluateNumericExpression(node.right, ts)
  )
}

test(
  'fixture freezes the single u22160 strict row as static evidence with no owner wiring',
  { skip: !selected },
  () => {
    assert.deepEqual(descriptor(fixtureBytes), {
      bytes: fixtureBytes.length,
      sha256: FIXTURE_SHA256,
    })
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(
      descriptor(
        fs.readFileSync(
          path.join(repositoryRoot, fixture.caseFiles.helper.path),
        ),
      ),
      expectedDescriptor(fixture.caseFiles.helper),
    )
    assert.deepEqual(Object.keys(ownerEvidenceModule).sort(), [
      'TARGET121_DAEMON_MAIN_LOG_ROTATION_DEPENDENCY_TARGET_INDICES',
      'TARGET121_DAEMON_MAIN_LOG_ROTATION_EVIDENCE_IDS',
      'TARGET121_DAEMON_MAIN_LOG_ROTATION_MATCHED_STATIC_PROOF_SPEC',
      'TARGET121_DAEMON_MAIN_LOG_ROTATION_STRICT_NUMBER_OWNER_EVIDENCE',
    ])
    assert.deepEqual(
      [...TARGET121_DAEMON_MAIN_LOG_ROTATION_EVIDENCE_IDS],
      fixture.evidenceIds,
    )
    assert.deepEqual(
      [...TARGET121_DAEMON_MAIN_LOG_ROTATION_DEPENDENCY_TARGET_INDICES],
      fixture.compiledRuntimeGraph.target.adjacentUnits
        .map(item => item.index)
        .concat(fixture.compiledRuntimeGraph.target.logger.index)
        .concat(fixture.compiledRuntimeGraph.target.caller.index)
        .sort((left, right) => left - right),
    )

    const item =
      TARGET121_DAEMON_MAIN_LOG_ROTATION_STRICT_NUMBER_OWNER_EVIDENCE
    assert.ok(Object.isFrozen(item))
    assert.ok(Object.isFrozen(item.paths))
    assert.ok(item.residues.every(Object.isFrozen))
    assert.equal(item.targetIndex, 22160)
    assert.deepEqual([...item.paths], fixture.rowBoundary.staticProofOwnerPaths)
    assert.deepEqual([...item.declarations], [
      'DAEMON_LOG_ROTATION_BYTES',
      'createDaemonLogger',
      'runDaemon',
    ])
    const admitted = reportIdentity(item, item.residues[0])
    assert.deepEqual(admitted, fixture.rowBoundary.admitted)
    assert.deepEqual(
      canonicalDescriptor(admitted),
      fixture.rowBoundary.admittedDescriptor,
    )

    const frozen = fixture.inputs.frozenPostPruneSnapshot
    assert.deepEqual(
      canonicalDescriptor(frozen.reportRow),
      frozen.reportRowDescriptor,
    )
    assert.deepEqual(
      canonicalDescriptor(frozen.coverageRow),
      frozen.coverageRowDescriptor,
    )
    assert.deepEqual(
      canonicalDescriptor(frozen.allOwnerRow),
      frozen.allOwnerRowDescriptor,
    )
    assert.deepEqual(
      [
        frozen.reportRow.structural.index,
        frozen.reportRow.literalKind,
        frozen.reportRow.value,
        frozen.reportRow.target.start,
        frozen.reportRow.target.end,
        frozen.reportRow.baselineOccurrenceCount,
        frozen.reportRow.targetOccurrenceNumber,
        frozen.reportRow.targetAdded,
      ],
      admitted,
    )
    assert.deepEqual(frozen.coverageRow.ownerIds, [])
    assert.deepEqual(frozen.coverageRow.evidenceIds, ['structural-pairing'])
    assert.deepEqual(frozen.allOwnerRow.owners, [])
    assert.equal(frozen.coverageRow.disposition, 'alpha-equivalent')
    assert.equal(frozen.coverageRow.structuralClass, 'moved')
    assert.deepEqual(expectedDescriptor(frozen.typedReport), {
      bytes: 25396455,
      sha256:
        'f63079907d813bffaf98cb89d28b8b2e183df9fe2e1c72b21f10fa2fd5c0a3f4',
    })
    assert.deepEqual(expectedDescriptor(frozen.sourceCoverage), {
      bytes: 345989,
      sha256:
        '05ac9243d7cee276bc51c8eb0c8e4e3678f96d941560cae620d05af240d7cdd4',
    })
    assert.deepEqual(
      {
        bytes: frozen.sourceCoverage.rawBytes,
        sha256: frozen.sourceCoverage.rawSha256,
      },
      {
        bytes: 2968244,
        sha256:
          '7be9d68b6144e09290d58e3dae17f21df9536852b5f8415e777c9f7dd3ad1c06',
      },
    )

    const post = fixture.inputs.frozenPostDaemonOwnerSnapshot
    assert.deepEqual(
      selectFrozenPhase(frozen.typedReport, frozen.sourceCoverage),
      { name: 'postPrune', snapshot: frozen },
    )
    assert.deepEqual(
      selectFrozenPhase(post.typedReport, post.sourceCoverage),
      { name: 'postDaemonOwner', snapshot: post },
    )
    assert.throws(
      () => selectFrozenPhase(frozen.typedReport, post.sourceCoverage),
      /unknown-or-hybrid-target121-log-rotation-phase/,
    )
    assert.throws(
      () => selectFrozenPhase(post.typedReport, frozen.sourceCoverage),
      /unknown-or-hybrid-target121-log-rotation-phase/,
    )
    assert.throws(
      () =>
        selectFrozenPhase(
          { bytes: 0, sha256: 'unknown-report' },
          { bytes: 0, sha256: 'unknown-coverage' },
        ),
      /unknown-or-hybrid-target121-log-rotation-phase/,
    )
    assert.deepEqual(expectedDescriptor(post.typedReport), {
      bytes: 25369097,
      sha256:
        '2126a6898cf52b4ad639c18d51dddd24d9adfd8df73470cf2ab4298700a66bf3',
    })
    assert.deepEqual(expectedDescriptor(post.sourceCoverage), {
      bytes: 347677,
      sha256:
        '91e279daac39df4d94f0bc34e90eb31b875b5fdeeabeceb0dc83d74660de6b83',
    })
    assert.deepEqual(
      {
        bytes: post.sourceCoverage.rawBytes,
        sha256: post.sourceCoverage.rawSha256,
      },
      {
        bytes: 2974761,
        sha256:
          '8b53acac16477ad92958b40bc7b9c44cba07b6ea48671adacc5c94f7235b173f',
      },
    )
    assert.deepEqual(post.globalCounts, {
      ownerRows: 35634,
      addedOwnerRows: 1118,
      strictRows: 1275,
      coverageRows: 4807,
      coverageOwners: 704,
    })
    assert.deepEqual(post.unitCounts, {
      ownerRows: 0,
      addedOwnerRows: 0,
      strictRows: 1,
      coverageRows: 1,
    })
    assert.deepEqual(
      canonicalDescriptor([]),
      post.emptyPartitionDescriptor,
    )
    assert.deepEqual(
      canonicalDescriptor(post.strictRows),
      post.strictRowsDescriptor,
    )
    assert.deepEqual(
      post.strictRows.map(typedReportIdentity),
      post.strictIdentities,
    )
    assert.deepEqual(
      canonicalDescriptor(post.strictIdentities),
      post.strictIdentitiesDescriptor,
    )
    assert.deepEqual(post.strictIdentities, [fixture.rowBoundary.admitted])
    assert.deepEqual(
      canonicalDescriptor(post.coverageRows),
      post.coverageRowsDescriptor,
    )
    assert.equal(post.coverageRows.length, 1)
    assert.deepEqual(post.coverageRows[0], frozen.coverageRow)

    assert.deepEqual(
      TARGET121_DAEMON_MAIN_LOG_ROTATION_MATCHED_STATIC_PROOF_SPEC,
      {
        targetIndex: 22160,
        baselineUnitIndex: 19487,
        structuralClassification: 'moved',
        pairReason: 'exact-scope-normalized-token-hash',
        moveEvidence: 'unique-exact-structural-hash',
        coverageLane: 'moved-alpha-equivalent-static-proof',
        coverageTargetRowPresent: true,
        coverageOwnerIds: [],
        allOwnerInputTargetRowPresent: true,
        allOwnerInputOwners: [],
        coverageGeneratorWiringAuthorized: false,
        synthesizedCorrectionAccepted: false,
        sourceReplayAuthorized: false,
      },
    )
    assert.equal(Object.isFrozen(TARGET121_DAEMON_MAIN_LOG_ROTATION_MATCHED_STATIC_PROOF_SPEC), true)
    assert.equal(fixture.rowBoundary.wholeUnitOverride, false)
    assert.equal(fixture.rowBoundary.coverageGeneratorWiringAuthorized, false)
    assert.equal(fixture.rowBoundary.synthesizedCorrectionAccepted, false)
    assert.equal(fixture.rowBoundary.sourceReplay, false)
    assert.deepEqual(fixture.rowBoundary.physicalPartitionDelta, {
      productionStrict: { units: -1, rows: -1 },
      owner: { units: 0, rows: 0 },
      addedOwner: { units: 0, rows: 0 },
      unclassifiedAdded: { units: 0, rows: 0 },
      coverage: { units: 0, rows: 0 },
      allOwner: { units: 0, rows: 0 },
    })
    assert.deepEqual(fixture.impact, {
      provenUnits: 1,
      provenStrictResidues: 1,
      strictUnitsRemoved: 1,
      strictRowsRemoved: 1,
      ownerRowsRemoved: 0,
      addedOwnerRowsRemoved: 0,
      coverageRowsChanged: 0,
      allOwnerRowsChanged: 0,
      synthesizedCoverageCorrections: 0,
      synthesizedOwnerRows: 0,
      productionRuntime: true,
      constantFold: true,
      macroOnly: false,
    })
  },
)

test(
  'authenticated bundles prove the unique moved pair and global occurrence ordinal spill',
  { skip: !selected },
  () => {
    const baselineBundle = readExact(
      artifactPath(
        'CLAUDE_CODE_2_1_120_BUNDLE',
        fixture.inputs.baselineBundle,
      ),
      fixture.inputs.baselineBundle,
    )
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_121_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
    )
    const structural = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
          fixture.inputs.structuralLedger,
        ),
      ),
    )
    const region = structural.regions.find(
      item => item.target.index === fixture.structuralPair.target.index,
    )
    assert.deepEqual(
      {
        classification: region.classification,
        baselineUnitIndex: region.baselineUnitIndex,
        pairReason: region.pairReason,
        moveEvidence: region.moveEvidence,
        unknownFreeIdentifierCount: region.unknownFreeIdentifierCount,
        target: region.target,
      },
      {
        classification: fixture.structuralPair.classification,
        baselineUnitIndex: fixture.structuralPair.baselineUnitIndex,
        pairReason: fixture.structuralPair.pairReason,
        moveEvidence: fixture.structuralPair.moveEvidence,
        unknownFreeIdentifierCount:
          fixture.structuralPair.unknownFreeIdentifierCount,
        target: {
          index: fixture.structuralPair.target.index,
          nodeType: fixture.structuralPair.target.nodeType,
          parseStatus: fixture.structuralPair.target.parseStatus,
          start: fixture.structuralPair.target.start,
          end: fixture.structuralPair.target.end,
          tokenCount: fixture.structuralPair.target.tokenCount,
          sourceHash: fixture.structuralPair.target.sha256,
          coarseHash: fixture.structuralPair.target.coarseHash,
          location: region.target.location,
          topDefinitionCount: fixture.structuralPair.target.topDefinitionCount,
        },
      },
    )

    const baseline = parsedUnit(baselineBundle, fixture.structuralPair.baseline)
    const target = parsedUnit(targetBundle, fixture.structuralPair.target)
    assert.equal(baseline.text, fixture.structuralPair.baseline.text)
    assert.equal(target.text, fixture.structuralPair.target.text)
    assert.deepEqual(
      baseline.node.declarations.map(item => item.id.name),
      fixture.structuralPair.baseline.nameBindings,
    )
    assert.deepEqual(
      target.node.declarations.map(item => item.id.name),
      fixture.structuralPair.target.nameBindings,
    )
    assert.equal(
      baseline.node.declarations.at(-1).init.value,
      Number(fixture.numberOccurrenceLineage.value),
    )
    assert.equal(
      target.node.declarations.at(-1).init.value,
      Number(fixture.numberOccurrenceLineage.value),
    )
    for (const parsed of [baseline, target]) {
      assert.deepEqual(
        canonicalDescriptor(canonicalizeAst(parsed.ast)),
        expectedDescriptor(fixture.structuralPair.canonicalAst),
      )
      assert.deepEqual(
        canonicalDescriptor(normalizedTokenShape(parsed.text)),
        expectedDescriptor(fixture.structuralPair.normalizedTokenShape),
      )
    }

    function numberCoordinates(bundle) {
      const result = []
      for (const token of tokenizer(bundle.toString('utf8'), {
        ecmaVersion: 'latest',
      })) {
        if (
          token.type.label === 'num' &&
          String(token.value) === fixture.numberOccurrenceLineage.value
        ) {
          result.push([token.start, token.end])
        }
      }
      return result
    }

    const baselineCoordinates = numberCoordinates(baselineBundle)
    const targetCoordinates = numberCoordinates(targetBundle)
    assert.equal(
      baselineCoordinates.length,
      fixture.numberOccurrenceLineage.baseline.count,
    )
    assert.equal(
      targetCoordinates.length,
      fixture.numberOccurrenceLineage.target.count,
    )
    assert.deepEqual(
      canonicalDescriptor(baselineCoordinates),
      fixture.numberOccurrenceLineage.baseline.coordinatesDescriptor,
    )
    assert.deepEqual(
      canonicalDescriptor(targetCoordinates),
      fixture.numberOccurrenceLineage.target.coordinatesDescriptor,
    )
    assert.deepEqual(
      baselineCoordinates[
        fixture.numberOccurrenceLineage.baseline.pairedUnitOrdinal - 1
      ],
      fixture.numberOccurrenceLineage.baseline.pairedUnitCoordinate,
    )
    assert.deepEqual(
      targetCoordinates[
        fixture.numberOccurrenceLineage.target.selectedOrdinal - 1
      ],
      fixture.numberOccurrenceLineage.target.selectedCoordinate,
    )
    assert.equal(
      fixture.numberOccurrenceLineage.target.count -
        fixture.numberOccurrenceLineage.baseline.count,
      fixture.numberOccurrenceLineage.globalOrdinalDelta,
    )
  },
)

test(
  'compiled runtime graph binds the rotation threshold twice and reaches it from the daemon caller',
  { skip: !selected },
  () => {
    const baselineBundle = readExact(
      artifactPath(
        'CLAUDE_CODE_2_1_120_BUNDLE',
        fixture.inputs.baselineBundle,
      ),
      fixture.inputs.baselineBundle,
    )
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_121_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
    )

    function verifyGraph(bundle, graph, numberBinding) {
      const logger = parsedUnit(bundle, graph.logger)
      assert.equal(logger.node.id.name, graph.logger.name)
      const references = []
      walkAst(logger.node, node => {
        if (node.type === 'Identifier' && node.name === numberBinding) {
          references.push({
            localStart: node.start,
            localEnd: node.end,
            start: graph.logger.start + node.start,
            end: graph.logger.start + node.end,
          })
        }
      })
      assert.deepEqual(references, graph.logger.numberBindingReferences)
      for (const expected of graph.adjacentUnits) {
        const unit = parsedUnit(bundle, expected)
        if (unit.node.type === 'FunctionDeclaration') {
          assert.equal(unit.node.id.name, expected.name)
        } else {
          assert.ok(
            unit.node.declarations.some(item => item.id.name === expected.name),
          )
        }
      }
    }

    verifyGraph(
      baselineBundle,
      fixture.compiledRuntimeGraph.baseline,
      fixture.structuralPair.baseline.numberBinding,
    )
    verifyGraph(
      targetBundle,
      fixture.compiledRuntimeGraph.target,
      fixture.structuralPair.target.numberBinding,
    )

    const callerExpected = fixture.compiledRuntimeGraph.target.caller
    const caller = parsedUnit(targetBundle, callerExpected)
    assert.equal(caller.node.id.name, callerExpected.name)
    const loggerReferences = []
    walkAst(caller.node, node => {
      if (
        node.type === 'Identifier' &&
        node.name === fixture.compiledRuntimeGraph.target.logger.name
      ) {
        loggerReferences.push({
          localStart: node.start,
          localEnd: node.end,
          start: callerExpected.start + node.start,
          end: callerExpected.start + node.end,
        })
      }
    })
    assert.deepEqual(loggerReferences, [callerExpected.loggerReference])
  },
)

test(
  'authenticated raw and postPrune source constant-fold the threshold and preserve the caller graph',
  { skip: !selected },
  () => {
    const relativeSourcePath = fixture.sourceLineage.path.slice('src/'.length)
    const filename = path.join(targetSourceRoot(), relativeSourcePath)
    const bytes = fs.readFileSync(filename)
    const stateMatches = fixture.sourceLineage.states.filter(state =>
      assertStateDescriptor(descriptor(bytes), state.file),
    )
    assert.equal(stateMatches.length, 1)
    const state = stateMatches[0]
    assert.deepEqual(descriptor(bytes), expectedDescriptor(state.file))
    const text = bytes.toString('utf8')
    assert.equal(text.length, state.file.chars)
    assert.equal(text.includes(fixture.numberOccurrenceLineage.value), false)

    const ts = typescript()
    const sourceFile = ts.createSourceFile(
      filename,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    assert.deepEqual(sourceFile.parseDiagnostics, [])
    const declarations = collectTs(
      sourceFile,
      ts,
      node =>
        ts.isVariableDeclaration(node) &&
        node.name.getText(sourceFile) === 'DAEMON_LOG_ROTATION_BYTES',
    )
    assert.equal(declarations.length, 1)
    const declaration = declarations[0]
    const statement = declaration.parent.parent
    assert.ok(ts.isVariableStatement(statement))
    assert.deepEqual(
      tsSourceDescriptor(text, statement),
      expectedSourceNode(state.constant.statement),
    )
    assert.deepEqual(
      tsSourceDescriptor(text, declaration),
      expectedSourceNode(state.constant.declaration),
    )
    assert.deepEqual(
      {
        ...tsSourceDescriptor(text, declaration.initializer),
        text: declaration.initializer.getText(sourceFile),
      },
      state.constant.initializer,
    )
    assert.equal(
      evaluateNumericExpression(declaration.initializer, ts),
      fixture.sourceLineage.constantFold.evaluatedValue,
    )

    const constantReferences = collectTs(
      sourceFile,
      ts,
      node =>
        ts.isIdentifier(node) && node.text === 'DAEMON_LOG_ROTATION_BYTES',
    ).map(node => [node.getStart(sourceFile), node.end])
    assert.deepEqual(constantReferences, state.constantReferences)

    const functions = collectTs(
      sourceFile,
      ts,
      node =>
        ts.isFunctionDeclaration(node) &&
        [
          'openDaemonLog',
          'closeDaemonLog',
          'rotateDaemonLog',
          'createDaemonLogger',
          'runDaemon',
        ].includes(node.name?.text),
    )
    const functionsByName = new Map(
      functions.map(node => [node.name.text, node]),
    )
    assert.equal(functionsByName.size, 5)
    for (const expected of state.functions) {
      const node = functionsByName.get(expected.name)
      assert.ok(node)
      assert.deepEqual(
        { name: node.name.text, ...tsSourceDescriptor(text, node) },
        expected,
      )
    }
    const runDaemon = functionsByName.get('runDaemon')
    assert.deepEqual(
      tsSourceDescriptor(text, runDaemon),
      expectedSourceNode(state.runDaemon),
    )

    const createDaemonLogger = functionsByName.get('createDaemonLogger')
    const callNames = collectTs(createDaemonLogger, ts, node =>
      ts.isCallExpression(node),
    ).map(node => node.expression.getText(sourceFile))
    for (const [name, count] of Object.entries(
      fixture.sourceLineage.callCountsInsideCreateDaemonLogger,
    )) {
      assert.equal(callNames.filter(value => value === name).length, count)
    }
    const createLoggerCalls = collectTs(
      runDaemon,
      ts,
      node =>
        ts.isCallExpression(node) &&
        node.expression.getText(sourceFile) === 'createDaemonLogger',
    )
    assert.equal(
      createLoggerCalls.length,
      fixture.sourceLineage.runDaemonCreateLoggerCallCount,
    )
    assert.deepEqual(
      tsSourceDescriptor(text, createLoggerCalls[0]),
      expectedSourceNode(state.createLoggerCall),
    )

    const rawGitBytes = execFileSync(
      'git',
      [
        'show',
        `${fixture.sourceLineage.targetCommit}:${fixture.sourceLineage.path}`,
      ],
      { cwd: gitEvidenceRepositoryRoot, maxBuffer: 1024 * 1024 },
    )
    assert.deepEqual(
      descriptor(rawGitBytes),
      expectedDescriptor(
        fixture.sourceLineage.states.find(item => item.name === 'raw').file,
      ),
    )
    assert.equal(
      execFileSync(
        'git',
        [
          'rev-parse',
          `${fixture.sourceLineage.targetCommit}:${fixture.sourceLineage.path}`,
        ],
        { cwd: gitEvidenceRepositoryRoot, encoding: 'utf8' },
      ).trim(),
      fixture.sourceLineage.targetGitBlob,
    )

    const baselineFilename = path.join(
      repositoryRoot,
      fixture.inputs.sourceRoots.baseline,
      relativeSourcePath,
    )
    const baselineBytes = readExact(
      baselineFilename,
      fixture.sourceLineage.baseline.file,
    )
    const baselineText = baselineBytes.toString('utf8')
    assert.equal(
      baselineText.includes('DAEMON_LOG_ROTATION_BYTES'),
      false,
    )
    assert.equal(baselineText.includes('createDaemonLogger'), false)
    const baselineGitBytes = execFileSync(
      'git',
      [
        'show',
        `${fixture.sourceLineage.baseline.gitCommit}:${fixture.sourceLineage.path}`,
      ],
      { cwd: gitEvidenceRepositoryRoot, maxBuffer: 1024 * 1024 },
    )
    assert.deepEqual(
      descriptor(baselineGitBytes),
      expectedDescriptor(fixture.sourceLineage.baseline.file),
    )
    assert.equal(
      execFileSync(
        'git',
        [
          'rev-parse',
          `${fixture.sourceLineage.baseline.gitCommit}:${fixture.sourceLineage.path}`,
        ],
        { cwd: gitEvidenceRepositoryRoot, encoding: 'utf8' },
      ).trim(),
      fixture.sourceLineage.baseline.gitBlob,
    )
    assert.equal(
      fixture.sourceLineage.decision,
      'authenticated-target-source-owner-with-moved-static-coverage-no-wiring',
    )
  },
)

function assertStateDescriptor(actual, expected) {
  return (
    actual.bytes === expected.bytes && actual.sha256 === expected.sha256
  )
}

function expectedSourceNode(expected) {
  return {
    start: expected.start,
    end: expected.end,
    chars: expected.chars,
    bytes: expected.bytes,
    sha256: expected.sha256,
  }
}
