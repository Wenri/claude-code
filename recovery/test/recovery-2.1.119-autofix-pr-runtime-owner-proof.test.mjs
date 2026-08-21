import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET119_AUTOFIX_PR_RUNTIME_EVIDENCE_IDS,
  TARGET119_AUTOFIX_PR_RUNTIME_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/autofix-pr-runtime-owner-overrides.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-autofix-pr-runtime-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '31be1e1d2aae70601cf733e6ca6ab5f671b9c82d31270bf32ec63113528b4b47'
const configuredSourceRoot = process.env.CLAUDE_CODE_2_1_119_SOURCE_ROOT

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function readPinned(input) {
  const value = fs.readFileSync(path.join(root, input.path))
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return value
}

function unitBytes(bundle, unit) {
  const value = bundle.subarray(unit.start, unit.end)
  assert.deepEqual(descriptor(value), {
    bytes: unit.bytes,
    sha256: unit.sha256,
  })
  return value
}

function parseUnit(value) {
  return parse(value.toString(), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  })
}

function walk(node, predicate, values = []) {
  if (!node || typeof node !== 'object') return values
  if (predicate(node)) values.push(node)
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'loc', 'range'].includes(key)) continue
    if (Array.isArray(value)) {
      for (const child of value) walk(child, predicate, values)
    } else {
      walk(value, predicate, values)
    }
  }
  return values
}

function propertyName(property) {
  return property.key?.name ?? property.key?.value
}

function canonicalAst(value, parent = null, parentKey = null) {
  if (Array.isArray(value)) {
    return value.map((entry, index) => canonicalAst(entry, value, index))
  }
  if (!value || typeof value !== 'object') return value
  const result = {}
  for (const [key, child] of Object.entries(value)) {
    if (['start', 'end', 'loc', 'range', 'raw'].includes(key)) continue
    if (key === 'name' && value.type === 'Identifier') {
      const preserve =
        (parent?.type === 'MemberExpression' &&
          parent.computed === false &&
          parentKey === 'property') ||
        (parent?.type === 'Property' &&
          parent.computed === false &&
          parent.shorthand === false &&
          parentKey === 'key') ||
        (parent?.type === 'MethodDefinition' &&
          parent.computed === false &&
          parentKey === 'key')
      result[key] = preserve ? child : '@id'
    } else {
      result[key] = canonicalAst(child, value, key)
    }
  }
  return result
}

function canonicalDescriptor(value) {
  const serialized = JSON.stringify(canonicalAst(parseUnit(value)))
  return {
    bytes: Buffer.byteLength(serialized),
    sha256: sha256(serialized),
  }
}

function structuralLedger(input) {
  return JSON.parse(gunzipSync(readPinned(input)))
}

function regionDescriptor(region) {
  return {
    targetIndex: region.target.index,
    classification: region.classification,
    nodeType: region.target.nodeType,
    start: region.target.start,
    end: region.target.end,
    bytes: region.target.end - region.target.start,
    tokenCount: region.target.tokenCount,
    sha256: region.target.sourceHash,
    coarseHash: region.target.coarseHash,
  }
}

function sourceRowIdentity(row) {
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

function rowSetDescriptor(rows) {
  const serialized = JSON.stringify(rows.map(sourceRowIdentity))
  return {
    rows: rows.length,
    jsonBytes: Buffer.byteLength(serialized),
    sha256: sha256(serialized),
  }
}

function fullPartitionDescriptor(rows) {
  const serialized = JSON.stringify(rows)
  return {
    rows: rows.length,
    jsonBytes: Buffer.byteLength(serialized),
    sha256: sha256(serialized),
  }
}

function selectArtifactPhase(typedAudit, sourceCoverage, sourceCoverageRaw) {
  const matches = fixture.artifactPhasePolicy.acceptedPairs.filter(
    pair =>
      pair.typedAudit.bytes === typedAudit.bytes &&
      pair.typedAudit.sha256 === typedAudit.sha256 &&
      pair.sourceCoverage.bytes === sourceCoverage.bytes &&
      pair.sourceCoverage.sha256 === sourceCoverage.sha256 &&
      pair.sourceCoverageRaw.bytes === sourceCoverageRaw.bytes &&
      pair.sourceCoverageRaw.sha256 === sourceCoverageRaw.sha256,
  )
  if (matches.length !== 1) {
    throw new Error('unknown or hybrid Target119 artifact phase')
  }
  return matches[0].phase
}

let artifactState
function loadArtifactState() {
  if (artifactState) return artifactState
  const expected = fixture.artifactPhasePolicy.acceptedPairs.at(-1)
  const typedAuditBytes = fs.readFileSync(
    path.resolve(
      process.env.CLAUDE_CODE_TYPED_AUDIT_PATH ??
        path.join(root, expected.typedAudit.path),
    ),
  )
  const sourceCoverageBytes = fs.readFileSync(
    path.resolve(
      process.env.CLAUDE_CODE_SOURCE_COVERAGE_PATH ??
        path.join(root, expected.sourceCoverage.path),
    ),
  )
  const sourceCoverageRaw = gunzipSync(sourceCoverageBytes)
  artifactState = {
    phase: selectArtifactPhase(
      descriptor(typedAuditBytes),
      descriptor(sourceCoverageBytes),
      descriptor(sourceCoverageRaw),
    ),
    report: JSON.parse(typedAuditBytes),
    coverage: JSON.parse(sourceCoverageRaw),
  }
  return artifactState
}

function assertLatestArtifactProjection(report, coverage) {
  for (const unit of fixture.latestArtifactProjection.units) {
    for (const [key, expected] of Object.entries(unit.partitions)) {
      const rows = report[key].filter(
        row => row.structural.index === unit.targetIndex,
      )
      assert.deepEqual(fullPartitionDescriptor(rows), expected.full)
      assert.deepEqual(rowSetDescriptor(rows), expected.identities)
    }
    const coverageRows = coverage.rows.filter(
      row => row.targetIndex === unit.targetIndex,
    )
    assert.deepEqual(
      fullPartitionDescriptor(coverageRows),
      unit.coverageRows,
    )
    const ownerIds = new Set(coverageRows.flatMap(row => row.ownerIds))
    assert.deepEqual(
      coverage.owners.filter(owner => ownerIds.has(owner.id)),
      unit.ownerCatalog,
    )
  }
}

function gitShow(commit, filename) {
  const result = spawnSync('git', ['show', `${commit}:${filename}`], {
    cwd: root,
    encoding: null,
  })
  assert.equal(result.status, 0, result.stderr?.toString())
  return result.stdout
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

test('Target119 autofix-pr runtime fixture exposes one atomic static pair', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.118-to-2.1.119')
  assert.equal(fixture.summary.sourceReplayHelpers, 0)
  assert.equal(fixture.sourceReplayBlocker.exactExtractedCoreAuthoredPath, null)
  assert.deepEqual(
    TARGET119_AUTOFIX_PR_RUNTIME_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
  assert.deepEqual(
    TARGET119_AUTOFIX_PR_RUNTIME_OWNER_OVERRIDES.map(row => ({
      key: row.key,
      targetIndex: row.targetIndex,
      paths: [...row.paths],
      declarations: [...row.declarations],
      evidenceIds: [...row.evidenceIds],
      behavior: row.behavior,
    })),
    [fixture.targetCluster.wrapper, fixture.targetCluster.core].map(unit => ({
      key: `${fixture.case}:${unit.targetIndex}`,
      targetIndex: unit.targetIndex,
      paths: [fixture.sourceReplayBlocker.publicOwnerPath],
      declarations: ['AutofixPr', 'call'],
      evidenceIds: fixture.evidenceIds,
      behavior: fixture.ownerBehavior,
    })),
  )
  const indices = TARGET119_AUTOFIX_PR_RUNTIME_OWNER_OVERRIDES.map(
    row => row.targetIndex,
  )
  assert.deepEqual(indices, [15463, 15464])
  assert.equal(sha256(JSON.stringify(indices)), fixture.summary.targetIndicesSha256)
})

test('authenticated Target119 wrapper and full async core bind every owner residue', () => {
  const bundle = readPinned(fixture.inputs.targetBundle)
  const ledger = structuralLedger(fixture.inputs.targetStructuralLedger)
  const units = [fixture.targetCluster.wrapper, fixture.targetCluster.core]
  for (const unit of units) {
    const region = ledger.regions.find(
      candidate => candidate.target.index === unit.targetIndex,
    )
    assert(region)
    assert.deepEqual(regionDescriptor(region), {
      targetIndex: unit.targetIndex,
      classification: unit.classification,
      nodeType: unit.nodeType,
      start: unit.start,
      end: unit.end,
      bytes: unit.bytes,
      tokenCount: unit.tokenCount,
      sha256: unit.sha256,
      coarseHash: unit.coarseHash,
    })
    unitBytes(bundle, unit)
  }
  unitBytes(bundle, fixture.targetCluster.combined)

  const { phase, report, coverage } = loadArtifactState()
  assert.ok(fixture.latestArtifactProjection.phases.includes(phase))
  assertLatestArtifactProjection(report, coverage)
})

test('Target119 autofix-pr runtime artifact generations are exact and fail closed', () => {
  const { phase } = loadArtifactState()
  assert.ok(fixture.latestArtifactProjection.phases.includes(phase))
  for (const pair of fixture.artifactPhasePolicy.acceptedPairs) {
    assert.equal(
      selectArtifactPhase(
        pair.typedAudit,
        pair.sourceCoverage,
        pair.sourceCoverageRaw,
      ),
      pair.phase,
    )
  }
  const [prior, current] = fixture.artifactPhasePolicy.acceptedPairs
  assert.throws(
    () =>
      selectArtifactPhase(
        prior.typedAudit,
        current.sourceCoverage,
        prior.sourceCoverageRaw,
      ),
    /unknown or hybrid/,
  )
  assert.throws(
    () =>
      selectArtifactPhase(
        current.typedAudit,
        {...current.sourceCoverage, sha256: '0'.repeat(64)},
        current.sourceCoverageRaw,
      ),
    /unknown or hybrid/,
  )
})

test('wrapper, core, result helpers, and JSX consumer form one exact runtime contract', () => {
  const bundle = readPinned(fixture.inputs.targetBundle)
  const wrapperBytes = unitBytes(bundle, fixture.targetCluster.wrapper)
  const coreBytes = unitBytes(bundle, fixture.targetCluster.core)
  const wrapper = parseUnit(wrapperBytes).body[0]
  const core = parseUnit(coreBytes).body[0]
  assert.equal(wrapper.type, 'FunctionDeclaration')
  assert.equal(wrapper.async, fixture.runtimeContract.wrapper.async)
  assert.equal(wrapper.params.length, fixture.runtimeContract.wrapper.parameterCount)
  assert.equal(
    wrapper.body.body.length,
    fixture.runtimeContract.wrapper.bodyStatementCount,
  )
  assert.equal(wrapper.body.body[0].type, 'VariableDeclaration')
  assert.equal(wrapper.body.body[0].declarations.length, 2)
  const sequence = wrapper.body.body[1].argument
  assert.equal(sequence.type, 'SequenceExpression')
  assert.equal(sequence.expressions.length, 3)
  assert.equal(sequence.expressions[0].type, 'AssignmentExpression')
  assert.deepEqual(
    walk(
      sequence.expressions[0].right,
      node => node.type === 'Literal' && typeof node.value === 'string',
    ).map(node => node.value),
    fixture.runtimeContract.wrapper.stopAliases,
  )
  const requestAssignment = sequence.expressions[1]
  assert.equal(requestAssignment.type, 'AssignmentExpression')
  assert.equal(requestAssignment.right.type, 'ObjectExpression')
  assert.deepEqual(
    requestAssignment.right.properties.map(propertyName),
    fixture.runtimeContract.wrapper.requestProperties,
  )
  const coreCall = sequence.expressions[2]
  assert.equal(coreCall.type, 'CallExpression')
  assert.equal(coreCall.callee.name, core.id.name)
  assert.equal(
    coreCall.arguments.length,
    fixture.runtimeContract.wrapper.coreArgumentCount,
  )
  assert.equal(coreCall.arguments[0].name, requestAssignment.left.name)
  assert.equal(coreCall.arguments[1].name, wrapper.params[1].name)
  assert.equal(coreCall.arguments[2].name, wrapper.params[2].name)

  assert.equal(core.type, 'FunctionDeclaration')
  assert.equal(core.async, fixture.runtimeContract.core.async)
  assert.equal(core.params.length, fixture.runtimeContract.core.parameterCount)
  assert.deepEqual(
    core.params[2].properties.map(propertyName),
    fixture.runtimeContract.core.controlProperties,
  )
  assert.equal(core.body.body.length, fixture.runtimeContract.core.bodyStatementCount)
  const telemetry = core.body.body[0].expression
  assert.equal(telemetry.type, 'CallExpression')
  assert.equal(telemetry.arguments[0].value, fixture.runtimeContract.core.telemetryEvent)
  assert.deepEqual(
    telemetry.arguments[1].properties.map(propertyName),
    fixture.runtimeContract.core.telemetryProperties,
  )
  assert.deepEqual(
    core.body.body[1].declarations[0].id.properties.map(propertyName),
    fixture.runtimeContract.core.inputProperties,
  )
  assert.equal(core.body.body[2].type, 'TryStatement')

  const properties = walk(core, node => node.type === 'Property')
  assert.deepEqual(
    properties
      .filter(property => propertyName(property) === 'step')
      .map(property => property.value.value),
    fixture.runtimeContract.core.progressSteps,
  )
  assert.equal(
    walk(
      core,
      node =>
        node.type === 'MemberExpression' &&
        node.computed === false &&
        node.property.name === 'aborted',
    ).length,
    fixture.runtimeContract.core.abortChecks,
  )

  const errorHelperBytes = unitBytes(bundle, fixture.runtimeContract.errorHelper)
  const cancelHelperBytes = unitBytes(bundle, fixture.runtimeContract.cancelHelper)
  const errorHelper = parseUnit(errorHelperBytes).body[0]
  const cancelHelper = parseUnit(cancelHelperBytes).body[0]
  assert.equal(
    walk(
      core,
      node =>
        node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        node.callee.name === errorHelper.id.name,
    ).length,
    fixture.runtimeContract.core.errorHelperCalls,
  )
  assert.equal(
    walk(
      core,
      node =>
        node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        node.callee.name === cancelHelper.id.name,
    ).length,
    fixture.runtimeContract.core.cancelHelperCalls,
  )
  const resultKinds = properties
    .filter(property => propertyName(property) === 'kind')
    .map(property => property.value.value)
  assert.deepEqual(
    resultKinds,
    Array(fixture.runtimeContract.core.successResultObjects).fill('ok'),
  )
  assert.equal(
    properties.filter(
      property =>
        propertyName(property) === 'isRemoteControl' &&
        property.value.type === 'UnaryExpression' &&
        property.value.operator === '!' &&
        property.value.argument.value === 0,
    ).length,
    fixture.runtimeContract.core.successRemoteControlObjects,
  )
  for (const [helper, expected] of [
    [errorHelper, fixture.runtimeContract.errorHelper.kind],
    [cancelHelper, fixture.runtimeContract.cancelHelper.kind],
  ]) {
    assert.equal(
      walk(
        helper,
        node =>
          node.type === 'Property' &&
          propertyName(node) === 'kind' &&
          node.value.value === expected,
      ).length,
      1,
    )
  }

  const coreInitializerBytes = unitBytes(
    bundle,
    fixture.moduleBoundary.coreInitializer,
  )
  const uiBytes = unitBytes(bundle, fixture.moduleBoundary.uiConsumer)
  const uiExportBytes = unitBytes(bundle, fixture.moduleBoundary.uiExport)
  const uiInitializerBytes = unitBytes(
    bundle,
    fixture.moduleBoundary.uiInitializer,
  )
  const commandInitializerBytes = unitBytes(
    bundle,
    fixture.moduleBoundary.commandInitializer,
  )
  const ui = parseUnit(uiBytes)
  const wrapperCalls = walk(
    ui,
    node =>
      node.type === 'CallExpression' &&
      node.callee.type === 'Identifier' &&
      node.callee.name === wrapper.id.name,
  )
  assert.equal(wrapperCalls.length, 1)
  const wrapperConsumerBytes = uiBytes.subarray(
    wrapperCalls[0].start,
    wrapperCalls[0].end,
  )
  assert.deepEqual(descriptor(wrapperConsumerBytes), {
    bytes: fixture.moduleBoundary.uiConsumer.wrapperCall.bytes,
    sha256: fixture.moduleBoundary.uiConsumer.wrapperCall.sha256,
  })
  assert.equal(
    fixture.moduleBoundary.uiConsumer.start + wrapperCalls[0].start,
    fixture.moduleBoundary.uiConsumer.wrapperCall.start,
  )
  assert.equal(
    fixture.moduleBoundary.uiConsumer.start + wrapperCalls[0].end,
    fixture.moduleBoundary.uiConsumer.wrapperCall.end,
  )
  assert.deepEqual(
    wrapperCalls[0].arguments[2].properties.map(propertyName),
    fixture.runtimeContract.core.controlProperties,
  )

  const coreInitializer = parseUnit(coreInitializerBytes).body[0]
  const coreInitializerName = coreInitializer.declarations[0].id.name
  const uiInitializer = parseUnit(uiInitializerBytes)
  const initializerCalls = walk(
    uiInitializer,
    node =>
      node.type === 'CallExpression' &&
      node.callee.type === 'Identifier' &&
      node.callee.name === coreInitializerName,
  )
  assert.equal(initializerCalls.length, 1)
  const initializerCallBytes = uiInitializerBytes.subarray(
    initializerCalls[0].start,
    initializerCalls[0].end,
  )
  assert.deepEqual(descriptor(initializerCallBytes), {
    bytes: fixture.moduleBoundary.uiInitializer.coreInitializerCall.bytes,
    sha256:
      fixture.moduleBoundary.uiInitializer.coreInitializerCall.sha256,
  })
  assert.equal(
    fixture.moduleBoundary.uiInitializer.start + initializerCalls[0].start,
    fixture.moduleBoundary.uiInitializer.coreInitializerCall.start,
  )

  const uiFunctionName = ui.body[0].id.name
  const uiExport = parseUnit(uiExportBytes)
  assert.equal(
    walk(
      uiExport,
      node =>
        node.type === 'CallExpression' &&
        node.arguments[0]?.type === 'Identifier' &&
        node.arguments[0].name === uiFunctionName,
    ).length,
    1,
  )
  const uiInitializerName = parseUnit(uiInitializerBytes).body[0].declarations[0]
    .id.name
  assert.equal(
    walk(
      parseUnit(commandInitializerBytes),
      node =>
        node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        node.callee.name === uiInitializerName,
    ).length,
    1,
  )
})

test('Targets120 and 121 preserve the complete wrapper/core semantics', () => {
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const targetCanonical = {
    wrapper: canonicalDescriptor(
      unitBytes(targetBundle, fixture.targetCluster.wrapper),
    ),
    core: canonicalDescriptor(unitBytes(targetBundle, fixture.targetCluster.core)),
  }
  assert.deepEqual(targetCanonical.wrapper, {
    bytes: fixture.targetCluster.wrapper.canonicalAstBytes,
    sha256: fixture.targetCluster.wrapper.canonicalAstSha256,
  })
  assert.deepEqual(targetCanonical.core, {
    bytes: fixture.targetCluster.core.canonicalAstBytes,
    sha256: fixture.targetCluster.core.canonicalAstSha256,
  })

  for (const lineage of fixture.laterLineage) {
    const input = fixture.inputs.laterBundles.find(
      candidate => candidate.version === lineage.version,
    )
    assert(input)
    const bundle = readPinned(input)
    const ledger = structuralLedger({
      path: input.ledgerPath,
      bytes: input.ledgerBytes,
      sha256: input.ledgerSha256,
    })
    for (const kind of ['wrapper', 'core']) {
      const unit = lineage[kind]
      const region = ledger.regions.find(
        candidate => candidate.target.index === unit.targetIndex,
      )
      assert(region)
      assert.equal(region.baselineUnitIndex, unit.baselineUnitIndex)
      assert.equal(region.pairReason, unit.pairReason)
      assert.equal(
        region.classification,
        unit.pairReason === 'exact-scope-normalized-token-hash'
          ? 'matched'
          : 'changed',
      )
      assert.deepEqual(
        {
          start: region.target.start,
          end: region.target.end,
          bytes: region.target.end - region.target.start,
          tokenCount: region.target.tokenCount,
          sha256: region.target.sourceHash,
          coarseHash: region.target.coarseHash,
        },
        {
          start: unit.start,
          end: unit.end,
          bytes: unit.bytes,
          tokenCount: unit.tokenCount,
          sha256: unit.sha256,
          coarseHash: unit.coarseHash,
        },
      )
      assert.deepEqual(
        canonicalDescriptor(unitBytes(bundle, unit)),
        targetCanonical[kind],
      )
    }
  }
})

test('Target118 inline implementation proves lineage but not a Target119 replay', () => {
  const baselineBundle = readPinned(fixture.inputs.baselineBundle)
  const ledger = structuralLedger(fixture.inputs.targetStructuralLedger)
  for (const unit of [
    fixture.baselineImplementation.componentUnit,
    fixture.baselineImplementation.localAgentHelperUnit,
  ]) {
    const unmatched = ledger.unmatchedBaseline.find(
      candidate => candidate.index === unit.baselineIndex,
    )
    assert(unmatched)
    assert.deepEqual(
      {
        nodeType: unmatched.nodeType,
        start: unmatched.start,
        end: unmatched.end,
        bytes: unmatched.end - unmatched.start,
        tokenCount: unmatched.tokenCount,
        sha256: unmatched.sourceHash,
        coarseHash: unmatched.coarseHash,
      },
      {
        nodeType: unit.nodeType,
        start: unit.start,
        end: unit.end,
        bytes: unit.bytes,
        tokenCount: unit.tokenCount,
        sha256: unit.sha256,
        coarseHash: unit.coarseHash,
      },
    )
    unitBytes(baselineBundle, unit)
  }
  unitBytes(baselineBundle, fixture.baselineImplementation.combined)
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const coreText = unitBytes(targetBundle, fixture.targetCluster.core).toString()
  const baselineText = unitBytes(
    baselineBundle,
    fixture.baselineImplementation.componentUnit,
  ).toString()
  for (const sentinel of fixture.sourceReplayBlocker.sharedSemanticSentinels) {
    assert.ok(coreText.includes(sentinel), `target core lacks ${sentinel}`)
    assert.ok(
      baselineText.includes(sentinel),
      `baseline inline implementation lacks ${sentinel}`,
    )
  }
  for (const marker of fixture.sourceReplayBlocker.missingMarkers) {
    assert.ok(coreText.includes(marker), `target core lacks ${marker}`)
  }
})

test('all authenticated source snapshots fail closed for wrapper/core replay', async () => {
  const ts = await loadTypeScript()
  const blocker = fixture.sourceReplayBlocker
  for (const snapshot of blocker.versionSnapshots) {
    const tree = spawnSync('git', ['rev-parse', `${snapshot.commit}^{tree}`], {
      cwd: root,
      encoding: 'utf8',
    })
    assert.equal(tree.status, 0, tree.stderr)
    assert.equal(tree.stdout.trim(), snapshot.tree)
    const sourceBytes = gitShow(snapshot.commit, blocker.publicOwnerPath)
    assert.deepEqual(descriptor(sourceBytes), {
      bytes: blocker.file.bytes,
      sha256: blocker.file.sha256,
    })
    const source = sourceBytes.toString()
    for (const marker of blocker.missingMarkers) {
      assert.equal(
        source.includes(marker),
        false,
        `${snapshot.version} unexpectedly contains ${marker}`,
      )
    }
  }

  const sourceBytes = gitShow(
    blocker.versionSnapshots.find(row => row.version === '2.1.119').commit,
    blocker.publicOwnerPath,
  )
  const source = sourceBytes.toString()
  assert.equal(source.length, blocker.file.chars)
  const sourceFile = ts.createSourceFile(
    blocker.publicOwnerPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  const functions = new Map(
    sourceFile.statements
      .filter(
        statement =>
          ts.isFunctionDeclaration(statement) && statement.name !== undefined,
      )
      .map(statement => [statement.name.text, statement]),
  )
  for (const expected of [
    blocker.autofixPrDeclaration,
    blocker.callDeclaration,
  ]) {
    const declaration = functions.get(expected.name)
    assert(declaration)
    const start = declaration.getStart(sourceFile)
    const text = source.slice(start, declaration.end)
    assert.deepEqual(
      {
        name: declaration.name.text,
        start,
        end: declaration.end,
        bytes: Buffer.byteLength(text),
        chars: text.length,
        sha256: sha256(text),
      },
      expected,
    )
  }

  const commandBytes = gitShow(
    blocker.versionSnapshots.find(row => row.version === '2.1.119').commit,
    blocker.commandFile.path,
  )
  assert.deepEqual(descriptor(commandBytes), {
    bytes: blocker.commandFile.bytes,
    sha256: blocker.commandFile.sha256,
  })
  assert.ok(
    commandBytes.toString().includes(`import('${blocker.commandFile.lazyModule}')`),
  )
  for (const sentinel of blocker.sharedSemanticSentinels) {
    assert.ok(source.includes(sentinel), `source lineage lacks ${sentinel}`)
  }

  const api = blocker.laterApiFile
  const apiBytes = gitShow(
    blocker.versionSnapshots.find(row => row.version === api.version).commit,
    api.path,
  )
  assert.deepEqual(descriptor(apiBytes), {
    bytes: api.bytes,
    sha256: api.sha256,
  })
  for (const marker of api.missingMarkers) {
    assert.equal(apiBytes.toString().includes(marker), false)
  }
})

test('packaged Target119 keeps the exact stale owner snapshot', t => {
  if (!configuredSourceRoot) {
    t.skip('CLAUDE_CODE_2_1_119_SOURCE_ROOT is not configured')
    return
  }
  const blocker = fixture.sourceReplayBlocker
  const sourceBytes = fs.readFileSync(
    path.join(
      configuredSourceRoot,
      blocker.publicOwnerPath.replace(/^src\//, ''),
    ),
  )
  assert.deepEqual(descriptor(sourceBytes), {
    bytes: blocker.file.bytes,
    sha256: blocker.file.sha256,
  })
  for (const marker of blocker.missingMarkers) {
    assert.equal(sourceBytes.toString().includes(marker), false)
  }
})
