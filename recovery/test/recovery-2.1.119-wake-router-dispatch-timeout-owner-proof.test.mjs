import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import * as ownerProofModule from '../cases/2.1.118-to-2.1.119/recovered/wake-router-dispatch-timeout-owner-overrides.mjs'
import {
  TARGET119_WAKE_ROUTER_DISPATCH_TIMEOUT_EVIDENCE_IDS,
  TARGET119_WAKE_ROUTER_DISPATCH_TIMEOUT_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/wake-router-dispatch-timeout-owner-overrides.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-wake-router-dispatch-timeout-owner-proof.json',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/wake-router-dispatch-timeout-owner-overrides.mjs',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '3ae74729eca9066075588354a8d1b1357a710dd467b9c9a173b90bf97baca699'
const HELPER_SHA256 =
  '90dd589088294d1621869464ebf5ce6f78a434cfb4f4c9dccd5ce4d0a89f2c85'
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_2_1_119_SOURCE_ROOT ??
    process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src'),
)

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function sourceDescriptor(value) {
  return {
    chars: value.length,
    bytes: Buffer.byteLength(value),
    sha256: sha256(value),
  }
}

function setDescriptor(rows) {
  const serialized = JSON.stringify(rows)
  return {
    rows: rows.length,
    jsonBytes: Buffer.byteLength(serialized),
    sha256: sha256(serialized),
  }
}

function listDescriptor(rows) {
  const serialized = JSON.stringify(rows)
  return {
    count: rows.length,
    jsonBytes: Buffer.byteLength(serialized),
    sha256: sha256(serialized),
  }
}

function readPinned(input) {
  const value = fs.readFileSync(path.join(root, input.path))
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return value
}

function readLedger(input) {
  return JSON.parse(gunzipSync(readPinned(input)))
}

function slicePinned(bundle, input) {
  const value = bundle.subarray(input.start, input.end)
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return value
}

function countOffsets(value, needle) {
  const offsets = []
  let offset = -1
  while ((offset = value.indexOf(needle, offset + 1)) !== -1) {
    offsets.push(offset)
  }
  return offsets
}

function unitDescriptor(unit) {
  return {
    targetIndex: unit.targetIndex,
    classification: unit.classification,
    nodeType: unit.nodeType,
    start: unit.start,
    end: unit.end,
    bytes: unit.bytes,
    tokenCount: unit.tokenCount,
    sha256: unit.sha256,
    coarseHash: unit.coarseHash,
    unknownFreeIdentifierCount: unit.unknownFreeIdentifierCount,
  }
}

function assertRegion(ledger, expected) {
  const region = ledger.regions.find(
    candidate => candidate.target.index === expected.targetIndex,
  )
  assert(region, `u${expected.targetIndex}`)
  assert.deepEqual(
    {
      classification: region.classification,
      nodeType: region.target.nodeType,
      start: region.target.start,
      end: region.target.end,
      bytes: region.target.end - region.target.start,
      tokenCount: region.target.tokenCount,
      sha256: region.target.sourceHash,
      coarseHash: region.target.coarseHash,
    },
    {
      classification: expected.classification,
      nodeType: expected.nodeType,
      start: expected.start,
      end: expected.end,
      bytes: expected.bytes,
      tokenCount: expected.tokenCount,
      sha256: expected.sha256,
      coarseHash: expected.coarseHash,
    },
  )
  if ('baselineUnitIndex' in expected) {
    assert.equal(region.baselineUnitIndex, expected.baselineUnitIndex)
    assert.equal(region.pairReason, expected.pairReason)
  }
  if ('unknownFreeIdentifierCount' in expected) {
    assert.equal(
      region.unknownFreeIdentifierCount,
      expected.unknownFreeIdentifierCount,
    )
  }
  return region
}

function rowIdentity(row) {
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

function git(args) {
  return spawnSync('git', args, {
    cwd: root,
    encoding: null,
    maxBuffer: 16 * 1024 * 1024,
  })
}

let typescriptPromise
async function loadTypeScript() {
  typescriptPromise ??= import(
    pathToFileURL(
      path.join(
        root,
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      ),
    ).href
  ).then(imported => imported.default ?? imported)
  return typescriptPromise
}

function sourceFile(ts, filename, value) {
  const kind = filename.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS
  const parsed = ts.createSourceFile(
    filename,
    value,
    ts.ScriptTarget.Latest,
    true,
    kind,
  )
  assert.equal(parsed.parseDiagnostics.length, 0, filename)
  return parsed
}

function declarationNode(ts, parsed, name) {
  for (const statement of parsed.statements) {
    if (statement.name?.text === name) return statement
    if (
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        declaration => declaration.name.getText(parsed) === name,
      )
    ) {
      return statement
    }
  }
  assert.fail(`missing declaration ${name}`)
}

function declarationDescriptor(parsed, source, node) {
  const start = node.getStart(parsed)
  const end = node.getEnd()
  return { start, end, ...sourceDescriptor(source.slice(start, end)) }
}

function collectNodes(ts, node, predicate, values = []) {
  if (predicate(node)) values.push(node)
  ts.forEachChild(node, child => {
    collectNodes(ts, child, predicate, values)
  })
  return values
}

function importGraph(ts, parsed) {
  return parsed.statements
    .filter(statement => ts.isImportDeclaration(statement))
    .map(statement => ({
      module: statement.moduleSpecifier.text,
      names:
        statement.importClause?.namedBindings?.elements.map(
          element => element.name.text,
        ) ?? [],
      typeOnly: statement.importClause?.isTypeOnly ?? false,
    }))
}

function exportedNames(ts, parsed) {
  const names = []
  for (const statement of parsed.statements) {
    const exported = statement.modifiers?.some(
      modifier => modifier.kind === ts.SyntaxKind.ExportKeyword,
    )
    if (!exported) continue
    if (statement.name?.text) names.push(statement.name.text)
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.push(declaration.name.text)
      }
    }
  }
  return names
}

test(
  'Target119 wake-router fixture and owner override remain frozen',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(
      fixture.evidenceIds,
      TARGET119_WAKE_ROUTER_DISPATCH_TIMEOUT_EVIDENCE_IDS,
    )
    assert.deepEqual(Object.keys(ownerProofModule).sort(), [
      'TARGET119_WAKE_ROUTER_DISPATCH_TIMEOUT_EVIDENCE_IDS',
      'TARGET119_WAKE_ROUTER_DISPATCH_TIMEOUT_OWNER_OVERRIDES',
    ])
    assert.deepEqual(
      TARGET119_WAKE_ROUTER_DISPATCH_TIMEOUT_OWNER_OVERRIDES.map(row => ({
        key: row.key,
        targetIndex: row.targetIndex,
        paths: row.paths,
        declarations: row.declarations,
        evidenceIds: row.evidenceIds,
        behavior: row.behavior,
      })),
      [
        {
          key: `${caseName}:20694`,
          targetIndex: 20694,
          paths: [fixture.sourceOwner.path],
          declarations: [
            'WAKE_DISPATCH_TIMEOUT_MS',
            'releaseTimedOutDispatch',
            'useWakeRouter',
          ],
          evidenceIds: fixture.evidenceIds,
          behavior: fixture.ownerBehavior,
        },
      ],
    )
    assert.deepEqual(fixture.summary, {
      units: 1,
      ownerRows: 1,
      addedOwnerRows: 1,
      productionStrictRowsBeforeCorrection: 1,
      productionStrictRowsAfterCorrection: 0,
      ownerOverrides: 1,
      sourceReplayHelpers: 0,
    })
  },
)

test(
  'authenticated u20694 owns the complete wake-router module binding graph',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const baselineBundle = readPinned(fixture.inputs.baselineBundle)
    const targetBundle = readPinned(fixture.inputs.targetBundle)
    const targetLedger = readLedger(fixture.inputs.targetStructuralLedger)
    const baselineText = baselineBundle.toString('utf8')
    const targetText = targetBundle.toString('utf8')
    assert.equal(
      countOffsets(baselineText, fixture.targetModule.diagnostic).length,
      fixture.baselineAbsence.bundleDiagnosticOccurrences,
    )
    assert.equal(countOffsets(targetText, fixture.targetModule.diagnostic).length, 1)

    const targetUnits = fixture.targetModule.units.map(expected => {
      assertRegion(targetLedger, expected)
      slicePinned(targetBundle, expected)
      return unitDescriptor(expected)
    })
    assert.deepEqual(
      {
        units: targetUnits.length,
        jsonBytes: setDescriptor(targetUnits).jsonBytes,
        sha256: setDescriptor(targetUnits).sha256,
      },
      fixture.targetModule.unitsDescriptor,
    )
    const moduleBytes = slicePinned(targetBundle, fixture.targetModule)
    slicePinned(targetBundle, fixture.targetModule.timeoutBearingRange)
    const tree = parse(moduleBytes.toString('utf8'), {
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    assert.equal(tree.body.length, fixture.targetModule.units.length)
    for (const [index, statement] of tree.body.entries()) {
      const expected = fixture.targetModule.units[index]
      assert.equal(statement.type, expected.nodeType)
      assert.equal(statement.start + fixture.targetModule.start, expected.start)
      assert.equal(statement.end + fixture.targetModule.start, expected.end)
    }

    const useUnit = tree.body[2]
    const releaseUnit = tree.body[3]
    const constantUnit = tree.body[4]
    const initializerUnit = tree.body[5]
    assert.equal(constantUnit.declarations.length, 2)
    assert.equal(constantUnit.declarations[0].init, null)
    assert.equal(constantUnit.declarations[1].init.type, 'Literal')
    assert.equal(
      constantUnit.declarations[1].init.value,
      fixture.targetModule.timeoutMilliseconds,
    )
    const reactBinding = constantUnit.declarations[0].id.name
    const timeoutBinding = constantUnit.declarations[1].id.name
    const callbackBinding = releaseUnit.id.name
    const useText = moduleBytes
      .subarray(useUnit.start, useUnit.end)
      .toString('utf8')
    const releaseText = moduleBytes
      .subarray(releaseUnit.start, releaseUnit.end)
      .toString('utf8')
    const initializerText = moduleBytes
      .subarray(initializerUnit.start, initializerUnit.end)
      .toString('utf8')
    assert.match(
      useText,
      new RegExp(
        `setTimeout\\(${callbackBinding},${timeoutBinding},\\{agentId:[^,]+,inFlight:[^}]+\\}\\)`,
      ),
    )
    assert.match(useText, /\.finally\(\(\)=>\{clearTimeout\([^)]*\),[^}]*\.delete\(/)
    assert.equal(
      releaseText.includes(
        `exceeded ${'${'}${timeoutBinding}}ms; releasing inFlight reservation`,
      ),
      true,
    )
    assert.match(releaseText, /\.inFlight\.delete\([^)]*\.agentId\)/)
    assert.match(initializerText, new RegExp(`${reactBinding}=x\\(JH\\(\\),1\\)`))
    assert.deepEqual(
      countOffsets(targetText, timeoutBinding),
      fixture.targetModule.bindingGraph.timeoutOccurrences,
    )
    assert.deepEqual(
      countOffsets(targetText, callbackBinding),
      fixture.targetModule.bindingGraph.callbackOccurrences,
    )
    assert.equal(
      countOffsets(targetText, reactBinding).length,
      fixture.targetModule.bindingGraph.reactBindingOccurrences,
    )
    for (const fragment of Object.values(fixture.targetModule.bindingGraph)) {
      if (fragment && typeof fragment === 'object' && 'start' in fragment) {
        slicePinned(targetBundle, fragment)
      }
    }
  },
)

test(
  'historical source is a whole-file addition with the exact closed timer AST',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  async () => {
    const baselineLookup = git([
      'cat-file',
      '-e',
      `${fixture.sourceOwner.baselineCommit}:${fixture.sourceOwner.path}`,
    ])
    assert.notEqual(baselineLookup.status, 0)
    const parent = git(['rev-parse', `${fixture.sourceOwner.targetCommit}^`])
    assert.equal(parent.status, 0, parent.stderr?.toString())
    assert.equal(parent.stdout.toString().trim(), fixture.sourceOwner.baselineCommit)
    const blob = git([
      'rev-parse',
      `${fixture.sourceOwner.targetCommit}:${fixture.sourceOwner.path}`,
    ])
    assert.equal(blob.status, 0, blob.stderr?.toString())
    assert.equal(blob.stdout.toString().trim(), fixture.sourceOwner.targetBlob)
    const committed = git([
      'show',
      `${fixture.sourceOwner.targetCommit}:${fixture.sourceOwner.path}`,
    ])
    assert.equal(committed.status, 0, committed.stderr?.toString())
    const packageSourcePath = path.join(
      sourceRoot,
      fixture.sourceOwner.path.slice('src/'.length),
    )
    const packageSource = fs.readFileSync(packageSourcePath, 'utf8')
    assert.deepEqual(sourceDescriptor(packageSource), fixture.sourceOwner.file)
    assert.deepEqual(committed.stdout, Buffer.from(packageSource))
    const sourceDiff = git([
      'diff',
      '--no-ext-diff',
      '--unified=0',
      fixture.sourceOwner.baselineCommit,
      fixture.sourceOwner.targetCommit,
      '--',
      fixture.sourceOwner.path,
    ])
    assert.equal(sourceDiff.status, 0, sourceDiff.stderr?.toString())
    assert.deepEqual(descriptor(sourceDiff.stdout), fixture.sourceOwner.wholeFileDiff)

    const ts = await loadTypeScript()
    const parsed = sourceFile(ts, packageSourcePath, packageSource)
    for (const [name, expected] of Object.entries(
      fixture.sourceOwner.declarations,
    )) {
      assert.deepEqual(
        declarationDescriptor(
          parsed,
          packageSource,
          declarationNode(ts, parsed, name),
        ),
        expected,
      )
    }
    assert.deepEqual(importGraph(ts, parsed), fixture.sourceOwner.imports)
    for (const dependency of fixture.sourceOwner.localDependencyExports) {
      const dependencyPath = path.join(sourceRoot, dependency.path)
      const dependencySource = fs.readFileSync(dependencyPath, 'utf8')
      const dependencyAst = sourceFile(ts, dependencyPath, dependencySource)
      const exports = exportedNames(ts, dependencyAst)
      for (const name of dependency.names) {
        assert.equal(exports.includes(name), true, `${dependency.path}#${name}`)
      }
    }

    const constantStatement = declarationNode(
      ts,
      parsed,
      'WAKE_DISPATCH_TIMEOUT_MS',
    )
    const constantDeclaration = constantStatement.declarationList.declarations[0]
    const initializer = constantDeclaration.initializer
    assert(initializer)
    assert.equal(Number(initializer.text), fixture.targetModule.timeoutMilliseconds)
    assert.deepEqual(
      {
        start: initializer.getStart(parsed),
        end: initializer.getEnd(),
        ...descriptor(
          packageSource.slice(initializer.getStart(parsed), initializer.getEnd()),
        ),
      },
      fixture.sourceOwner.graphFragments.numericInitializer,
    )

    const setTimeoutCalls = collectNodes(
      ts,
      parsed,
      node =>
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'setTimeout',
    )
    assert.equal(setTimeoutCalls.length, 1)
    const setTimeoutCall = setTimeoutCalls[0]
    assert.deepEqual(
      setTimeoutCall.arguments.map(argument => argument.getText(parsed)),
      [
        'releaseTimedOutDispatch',
        'WAKE_DISPATCH_TIMEOUT_MS',
        '{ agentId: candidate.agentId, inFlight: reservations }',
      ],
    )
    assert.deepEqual(
      {
        start: setTimeoutCall.getStart(parsed),
        end: setTimeoutCall.getEnd(),
        ...descriptor(
          packageSource.slice(
            setTimeoutCall.getStart(parsed),
            setTimeoutCall.getEnd(),
          ),
        ),
      },
      fixture.sourceOwner.graphFragments.setTimeout,
    )
    const warningCall = collectNodes(
      ts,
      parsed,
      node =>
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'logForDebugging',
    )
    assert.equal(warningCall.length, 1)
    assert.deepEqual(
      {
        start: warningCall[0].getStart(parsed),
        end: warningCall[0].getEnd(),
        ...descriptor(
          packageSource.slice(
            warningCall[0].getStart(parsed),
            warningCall[0].getEnd(),
          ),
        ),
      },
      fixture.sourceOwner.graphFragments.warning,
    )
    const deleteCalls = collectNodes(
      ts,
      parsed,
      node =>
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'delete',
    )
    assert.equal(deleteCalls.length, 2)
    const timeoutDelete = deleteCalls.find(
      node => node.getStart(parsed) === fixture.sourceOwner.graphFragments.timeoutDelete.start,
    )
    assert(timeoutDelete)
    assert.deepEqual(
      {
        start: timeoutDelete.getStart(parsed),
        end: timeoutDelete.getEnd(),
        ...descriptor(
          packageSource.slice(timeoutDelete.getStart(parsed), timeoutDelete.getEnd()),
        ),
      },
      fixture.sourceOwner.graphFragments.timeoutDelete,
    )
    const finallyCall = collectNodes(
      ts,
      parsed,
      node =>
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'finally',
    )
    assert.equal(finallyCall.length, 1)
    const finallyCallback = finallyCall[0].arguments[0]
    assert.deepEqual(
      {
        start: finallyCallback.getStart(parsed),
        end: finallyCallback.getEnd(),
        ...descriptor(
          packageSource.slice(
            finallyCallback.getStart(parsed),
            finallyCallback.getEnd(),
          ),
        ),
      },
      fixture.sourceOwner.graphFragments.finallyCallback,
    )
    const identifiers = collectNodes(ts, parsed, node => ts.isIdentifier(node))
    assert.equal(
      identifiers.filter(node => node.text === 'WAKE_DISPATCH_TIMEOUT_MS').length,
      3,
    )
    assert.equal(
      identifiers.filter(node => node.text === 'releaseTimedOutDispatch').length,
      2,
    )
  },
)

test(
  'one row and one complete source graph reject every incidental 60000 match atomically',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const report = JSON.parse(
      fs.readFileSync(path.join(root, fixture.inputs.targetReport.path)),
    )
    const ownerRows = report.sourceRuntimeOwnerResidueRows.filter(
      row => row.structural.index === 20694,
    )
    const addedRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
      row => row.structural.index === 20694,
    )
    const ownerIdentities = ownerRows.map(rowIdentity)
    const addedIdentities = addedRows.map(rowIdentity)
    const coverage = JSON.parse(
      gunzipSync(
        fs.readFileSync(path.join(root, fixture.inputs.targetCoverage.path)),
      ),
    )
    const coverageRow = coverage.rows.find(row => row.targetIndex === 20694)
    assert(coverageRow)
    const provisional = fixture.coverageEvolution.provisional
    const corrected = fixture.coverageEvolution.corrected
    const observed = {
      ownerIds: coverageRow.ownerIds,
      evidenceIds: coverageRow.evidenceIds,
      behavior: coverageRow.behavior,
    }
    const provisionalState = JSON.stringify(provisional)
    const correctedState = JSON.stringify({
      ...corrected,
      behavior: fixture.ownerBehavior,
    })
    const observedState = JSON.stringify(observed)
    assert(
      observedState === provisionalState || observedState === correctedState,
      `unexpected u20694 coverage state: ${observedState}`,
    )
    if (observedState === correctedState) {
      assert.deepEqual(ownerIdentities, fixture.ownerResidues.corrected.identities)
      assert.deepEqual(addedIdentities, fixture.ownerResidues.corrected.identities)
      assert.deepEqual(
        setDescriptor(ownerIdentities),
        {
          rows: fixture.ownerResidues.corrected.rows,
          jsonBytes: fixture.ownerResidues.corrected.jsonBytes,
          sha256: fixture.ownerResidues.corrected.sha256,
        },
      )
      assert.deepEqual(
        setDescriptor(addedIdentities),
        {
          rows: fixture.ownerResidues.corrected.rows,
          jsonBytes: fixture.ownerResidues.corrected.jsonBytes,
          sha256: fixture.ownerResidues.corrected.sha256,
        },
      )
      assert.deepEqual(
        corrected.evidenceIds.map(id =>
          coverage.evidence.find(evidence => evidence.id === id),
        ),
        fixture.evidenceCatalog,
      )
    } else {
      assert.deepEqual(ownerIdentities, fixture.ownerResidues.all.identities)
      assert.deepEqual(addedIdentities, fixture.ownerResidues.added.identities)
      assert.deepEqual(setDescriptor(ownerIdentities), {
        rows: fixture.ownerResidues.all.rows,
        jsonBytes: fixture.ownerResidues.all.jsonBytes,
        sha256: fixture.ownerResidues.all.sha256,
      })
      assert.deepEqual(setDescriptor(addedIdentities), {
        rows: fixture.ownerResidues.added.rows,
        jsonBytes: fixture.ownerResidues.added.jsonBytes,
        sha256: fixture.ownerResidues.added.sha256,
      })
      const ownerPathState = JSON.stringify(addedRows[0].ownerPaths)
      assert.equal(
        ownerPathState,
        JSON.stringify(fixture.attributionFailure.provisionalOwnerPaths),
        `unexpected provisional u20694 report owner state: ${ownerPathState}`,
      )
      assert.deepEqual(
        addedRows[0].candidates,
        fixture.attributionFailure.candidateOwners,
      )
      assert.deepEqual(
        listDescriptor(addedRows[0].candidates),
        fixture.attributionFailure.candidateDescriptor,
      )
      assert.deepEqual(
        listDescriptor(addedRows[0].sourceMatches),
        fixture.attributionFailure.sourceMatchesDescriptor,
      )
      assert.equal(
        addedRows[0].candidates.includes(
          `../src/${fixture.attributionFailure.soleCompleteGraphSource}`,
        ),
        false,
      )
      const completeGraphSources = addedRows[0].sourceMatches.filter(
        sourcePath => {
          const value = fs.readFileSync(path.join(sourceRoot, sourcePath), 'utf8')
          return [
            'WAKE_DISPATCH_TIMEOUT_MS',
            '[wakeRouter] dispatch for',
            'releaseTimedOutDispatch',
            'setTimeout(',
            'clearTimeout(',
          ].every(marker => value.includes(marker))
        },
      )
      assert.deepEqual(completeGraphSources, [
        fixture.attributionFailure.soleCompleteGraphSource,
      ])
      assert.equal(
        corrected.evidenceIds.some(id =>
          coverage.evidence.some(evidence => evidence.id === id),
        ),
        false,
        'wake-router evidence must not be partially wired',
      )
    }
  },
)

test(
  'timeout and completion paths release only their own reservation and persist through Target121',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const reservations = new Set(['agent-a', 'agent-b'])
    const clearedTimers = []
    const releaseTimedOutDispatch = ({ agentId, inFlight }) =>
      inFlight.delete(agentId)
    const timeoutA = { id: 1, agentId: 'agent-a', inFlight: reservations }
    releaseTimedOutDispatch(timeoutA)
    assert.deepEqual([...reservations], ['agent-b'])
    const complete = (timer, agentId) => {
      clearedTimers.push(timer)
      reservations.delete(agentId)
    }
    complete(2, 'agent-b')
    assert.deepEqual(clearedTimers, [2])
    assert.deepEqual([...reservations], [])

    for (const [position, inputNames] of [
      [0, ['target120Bundle', 'target120StructuralLedger']],
      [1, ['target121Bundle', 'target121StructuralLedger']],
    ]) {
      const bundle = readPinned(fixture.inputs[inputNames[0]])
      const ledger = readLedger(fixture.inputs[inputNames[1]])
      const lineage = fixture.forwardRuntime[position]
      for (const expected of lineage.units) {
        assertRegion(ledger, expected)
        const value = slicePinned(bundle, expected).toString('utf8')
        const targetRole = fixture.targetModule.units.find(
          unit => unit.role === expected.role,
        )
        assert(targetRole, expected.role)
        assert.equal(expected.coarseHash, targetRole.coarseHash)
        if (expected.role === 'WAKE_DISPATCH_TIMEOUT_MS') {
          assert.match(value, /=60000;/)
        }
        if (expected.role === 'releaseTimedOutDispatch') {
          assert.match(value, /\[wakeRouter\] dispatch for/)
        }
      }
    }
    assert.deepEqual(fixture.replayDecision, {
      mode: 'static-owner-correction-exact-source-already-present',
      graphClosed: true,
      sourceAlreadyExact: true,
      sourceReplayHelpers: [],
    })
  },
)
