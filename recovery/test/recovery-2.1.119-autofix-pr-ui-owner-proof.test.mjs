import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import { TARGET119_AUTOFIX_PR_RUNTIME_EVIDENCE_IDS } from '../cases/2.1.118-to-2.1.119/recovered/autofix-pr-runtime-owner-overrides.mjs'
import {
  TARGET119_AUTOFIX_PR_UI_EVIDENCE_IDS,
  TARGET119_AUTOFIX_PR_UI_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/autofix-pr-ui-owner-overrides.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-autofix-pr-ui-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '9723acaa3c27b5ac77184cbd77f58137ec2b973cf812b7f5bd541f14eac20f04'
const configuredSourceRoot = process.env.CLAUDE_CODE_2_1_119_SOURCE_ROOT

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })

function readPinned(input) {
  const value = fs.readFileSync(path.join(root, input.path))
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return value
}

function slicePinned(bundle, input) {
  const value = bundle.subarray(input.start, input.end)
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sha256,
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

function ledger(input) {
  return JSON.parse(gunzipSync(readPinned(input)))
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
    ).href,
  ).then(imported => imported.default ?? imported)
  return typescriptPromise
}

test('Target119 autofix-pr UI fixture exposes one static whole-unit override', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.118-to-2.1.119')
  assert.equal(fixture.summary.sourceReplayHelpers, 0)
  assert.deepEqual(TARGET119_AUTOFIX_PR_UI_EVIDENCE_IDS, fixture.evidenceIds)
  assert.ok(
    TARGET119_AUTOFIX_PR_RUNTIME_EVIDENCE_IDS.includes(
      fixture.runtimeDependency.requiredEvidenceId,
    ),
  )
  assert.deepEqual(
    TARGET119_AUTOFIX_PR_UI_OWNER_OVERRIDES.map(row => ({
      key: row.key,
      targetIndex: row.targetIndex,
      paths: [...row.paths],
      declarations: [...row.declarations],
      evidenceIds: [...row.evidenceIds],
      behavior: row.behavior,
    })),
    [
      {
        key: `${fixture.case}:${fixture.targetUnit.targetIndex}`,
        targetIndex: fixture.targetUnit.targetIndex,
        paths: [fixture.sourceReplayBlocker.path],
        declarations: ['AutofixPr', 'call'],
        evidenceIds: fixture.evidenceIds,
        behavior: fixture.ownerBehavior,
      },
    ],
  )
})

test('authenticated Target119 UI unit binds its complete structure and four residues', () => {
  const bundle = readPinned(fixture.inputs.targetBundle)
  const structural = ledger(fixture.inputs.targetStructuralLedger)
  const region = structural.regions.find(
    candidate => candidate.target.index === fixture.targetUnit.targetIndex,
  )
  assert(region)
  assert.deepEqual(
    {
      classification: region.classification,
      nodeType: region.target.nodeType,
      start: region.target.start,
      end: region.target.end,
      bytes: region.target.end - region.target.start,
      tokenCount: region.target.tokenCount,
      unknownFreeIdentifierCount: region.unknownFreeIdentifierCount,
      sha256: region.target.sourceHash,
      coarseHash: region.target.coarseHash,
    },
    {
      classification: fixture.targetUnit.classification,
      nodeType: fixture.targetUnit.nodeType,
      start: fixture.targetUnit.start,
      end: fixture.targetUnit.end,
      bytes: fixture.targetUnit.bytes,
      tokenCount: fixture.targetUnit.tokenCount,
      unknownFreeIdentifierCount: fixture.targetUnit.unknownFreeIdentifierCount,
      sha256: fixture.targetUnit.sha256,
      coarseHash: fixture.targetUnit.coarseHash,
    },
  )
  const unitBytes = slicePinned(bundle, fixture.targetUnit)
  const unit = parseUnit(unitBytes).body[0]
  const statementRows = unit.body.body.map((statement, index) => {
    const bytes = unitBytes.subarray(statement.start, statement.end)
    return [
      index,
      statement.type,
      fixture.targetUnit.start + statement.start,
      fixture.targetUnit.start + statement.end,
      bytes.length,
      sha256(bytes),
    ]
  })
  const serializedStatements = JSON.stringify(statementRows)
  assert.deepEqual(
    {
      statements: statementRows.length,
      jsonBytes: Buffer.byteLength(serializedStatements),
      sha256: sha256(serializedStatements),
    },
    fixture.targetUnit.bodyStatements,
  )

  const { phase, report, coverage } = loadArtifactState()
  assert.ok(fixture.latestArtifactProjection.phases.includes(phase))
  assertLatestArtifactProjection(report, coverage)
})

test('Target119 autofix-pr UI artifact generations are exact and fail closed', () => {
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
        current.sourceCoverage,
        {...current.sourceCoverageRaw, sha256: '0'.repeat(64)},
      ),
    /unknown or hybrid/,
  )
})

test('UI cache, wrapper result projection, controls, and render contract are exact', () => {
  const bundle = readPinned(fixture.inputs.targetBundle)
  const unitBytes = slicePinned(bundle, fixture.targetUnit)
  const unit = parseUnit(unitBytes).body[0]
  assert.equal(unit.type, 'FunctionDeclaration')
  assert.equal(unit.params.length, 1)
  const declarations = walk(unit, node => node.type === 'VariableDeclarator')
  const cache = declarations.find(
    declaration =>
      declaration.init?.type === 'CallExpression' &&
      declaration.init.arguments[0]?.value === fixture.uiContract.compilerCache.size,
  )
  assert(cache)
  const cacheName = cache.id.name
  const cacheIdentifiers = walk(
    unit,
    node => node.type === 'Identifier' && node.name === cacheName,
  )
  const cacheMembers = walk(
    unit,
    node =>
      node.type === 'MemberExpression' &&
      node.computed === true &&
      node.object.type === 'Identifier' &&
      node.object.name === cacheName &&
      node.property.type === 'Literal' &&
      Number.isInteger(node.property.value),
  )
  const indices = cacheMembers.map(member => member.property.value)
  const unique = [...new Set(indices)].sort((left, right) => left - right)
  assert.deepEqual(
    {
      size: cache.init.arguments[0].value,
      identifierOccurrences: cacheIdentifiers.length,
      memberOccurrences: cacheMembers.length,
      uniqueIndices: unique.length,
      minIndex: Math.min(...unique),
      maxIndex: Math.max(...unique),
      occurrencesPerIndex: Math.min(
        ...unique.map(index => indices.filter(value => value === index).length),
      ),
    },
    fixture.uiContract.compilerCache,
  )
  assert.ok(
    unique.every(
      (value, index) =>
        value === index &&
        indices.filter(candidate => candidate === value).length ===
          fixture.uiContract.compilerCache.occurrencesPerIndex,
    ),
  )

  const props = declarations.find(
    declaration =>
      declaration.id.type === 'ObjectPattern' &&
      declaration.id.properties.some(
        property => propertyName(property) === 'onDone',
      ),
  )
  assert.deepEqual(props.id.properties.map(propertyName), fixture.uiContract.props)
  assert.deepEqual(
    walk(
      unit,
      node =>
        node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        node.callee.property.name === 'useState',
    ).map(call => call.arguments[0].value),
    fixture.uiContract.initialStateValues,
  )
  const refCalls = walk(
    unit,
    node =>
      node.type === 'CallExpression' &&
      node.callee.type === 'MemberExpression' &&
      node.callee.property.name === 'useRef',
  )
  assert.equal(refCalls.length, 1)
  assert.equal(refCalls[0].arguments[0].value, fixture.uiContract.useRefInitialValue)
  assert.equal(
    walk(
      unit,
      node =>
        node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        node.callee.property.name === 'useEffect',
    ).length,
    fixture.uiContract.useEffectCalls,
  )

  const wrapper = parseUnit(
    slicePinned(bundle, fixture.runtimeDependency.wrapperUnit),
  ).body[0]
  const wrapperCalls = walk(
    unit,
    node =>
      node.type === 'CallExpression' &&
      node.callee.type === 'Identifier' &&
      node.callee.name === wrapper.id.name,
  )
  assert.equal(wrapperCalls.length, 1)
  const wrapperCall = wrapperCalls[0]
  assert.deepEqual(
    descriptor(unitBytes.subarray(wrapperCall.start, wrapperCall.end)),
    {
      bytes: fixture.uiContract.wrapperCall.bytes,
      sha256: fixture.uiContract.wrapperCall.sha256,
    },
  )
  assert.equal(
    fixture.targetUnit.start + wrapperCall.start,
    fixture.uiContract.wrapperCall.start,
  )
  assert.deepEqual(
    wrapperCall.arguments[2].properties.map(propertyName),
    fixture.uiContract.wrapperCall.controlProperties,
  )

  const switches = walk(unit, node => node.type === 'SwitchStatement')
  assert.equal(switches.length, 1)
  const resultSwitch = switches[0]
  assert.deepEqual(
    descriptor(unitBytes.subarray(resultSwitch.start, resultSwitch.end)),
    {
      bytes: fixture.uiContract.resultSwitch.bytes,
      sha256: fixture.uiContract.resultSwitch.sha256,
    },
  )
  assert.equal(
    fixture.targetUnit.start + resultSwitch.start,
    fixture.uiContract.resultSwitch.start,
  )
  assert.deepEqual(
    resultSwitch.cases.map(caseNode => caseNode.test.value),
    fixture.uiContract.resultSwitch.cases,
  )
  assert.equal(
    walk(
      resultSwitch,
      node =>
        node.type === 'MemberExpression' &&
        node.property.name === fixture.uiContract.remoteControlProperty,
    ).length,
    1,
  )
  assert.equal(
    walk(
      resultSwitch,
      node =>
        node.type === 'TemplateElement' &&
        node.value.cooked === fixture.uiContract.remoteControlHint,
    ).length,
    1,
  )
  for (const literal of [
    fixture.uiContract.cancelMessage,
    fixture.uiContract.keybinding,
    fixture.uiContract.keybindingContext,
    fixture.uiContract.dialog.title,
    fixture.uiContract.dialog.subtitle,
  ]) {
    assert.equal(
      walk(unit, node => node.type === 'Literal' && node.value === literal).length,
      1,
      `missing or duplicated ${literal}`,
    )
  }
  const properties = walk(unit, node => node.type === 'Property')
  assert.equal(
    properties.filter(
      property =>
        propertyName(property) === 'hideInputGuide' &&
        property.value.type === 'UnaryExpression' &&
        property.value.operator === '!' &&
        property.value.argument.value === 0,
    ).length,
    1,
  )
  for (const shortcut of [
    fixture.uiContract.failureShortcut,
    fixture.uiContract.loadingShortcut,
  ]) {
    assert.equal(
      properties.filter(property => {
        if (propertyName(property) !== 'action') return false
        return property.value.value === shortcut.action
      }).length,
      1,
    )
  }
})

test('export adapter, initializer edge, and command loader close the caller boundary', () => {
  const bundle = readPinned(fixture.inputs.targetBundle)
  slicePinned(bundle, fixture.callerBoundary.combined)
  const structural = ledger(fixture.inputs.targetStructuralLedger)
  for (const entry of [
    fixture.callerBoundary.exportRegistration,
    fixture.callerBoundary.callAdapter,
    fixture.callerBoundary.uiInitializer,
    fixture.callerBoundary.commandInitializer,
  ]) {
    const region = structural.regions.find(
      candidate => candidate.target.index === entry.targetIndex,
    )
    assert(region)
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
        start: entry.start,
        end: entry.end,
        bytes: entry.bytes,
        tokenCount: entry.tokenCount,
        sha256: entry.sha256,
        coarseHash: entry.coarseHash,
      },
    )
  }
  const uiBytes = slicePinned(bundle, fixture.targetUnit)
  const uiName = parseUnit(uiBytes).body[0].id.name
  const adapterBytes = slicePinned(bundle, fixture.callerBoundary.callAdapter)
  const adapter = parseUnit(adapterBytes)
  assert.equal(
    walk(
      adapter,
      node =>
        node.type === 'CallExpression' &&
        node.arguments[0]?.type === 'Identifier' &&
        node.arguments[0].name === uiName,
    ).length,
    1,
  )
  const adapterName = adapter.body[0].declarations.at(-1).id.name
  const registration = parseUnit(
    slicePinned(bundle, fixture.callerBoundary.exportRegistration),
  )
  assert.equal(
    walk(
      registration,
      node =>
        node.type === 'Property' &&
        propertyName(node) === 'call' &&
        walk(
          node.value,
          child => child.type === 'Identifier' && child.name === adapterName,
        ).length === 1,
    ).length,
    1,
  )

  const coreInitializer = parseUnit(
    slicePinned(bundle, fixture.runtimeDependency.coreInitializer),
  ).body[0].declarations[0].id.name
  const initializerBytes = slicePinned(
    bundle,
    fixture.callerBoundary.uiInitializer,
  )
  const initializer = parseUnit(initializerBytes)
  const calls = walk(
    initializer,
    node =>
      node.type === 'CallExpression' &&
      node.callee.type === 'Identifier' &&
      node.callee.name === coreInitializer,
  )
  assert.equal(calls.length, 1)
  assert.deepEqual(
    descriptor(initializerBytes.subarray(calls[0].start, calls[0].end)),
    {
      bytes: fixture.callerBoundary.uiInitializer.coreInitializerCall.bytes,
      sha256: fixture.callerBoundary.uiInitializer.coreInitializerCall.sha256,
    },
  )
  const initializerName = initializer.body[0].declarations[0].id.name
  assert.equal(
    walk(
      parseUnit(slicePinned(bundle, fixture.callerBoundary.commandInitializer)),
      node =>
        node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        node.callee.name === initializerName,
    ).length,
    1,
  )
})

test('Targets120 and 121 preserve the complete UI unit canonically', () => {
  const target = canonicalDescriptor(
    slicePinned(readPinned(fixture.inputs.targetBundle), fixture.targetUnit),
  )
  assert.deepEqual(target, {
    bytes: fixture.targetUnit.canonicalAstBytes,
    sha256: fixture.targetUnit.canonicalAstSha256,
  })
  for (const lineage of fixture.laterLineage) {
    const input = fixture.inputs.laterBundles.find(
      candidate => candidate.version === lineage.version,
    )
    assert(input)
    const bundle = readPinned(input)
    const structural = ledger({
      path: input.ledgerPath,
      bytes: input.ledgerBytes,
      sha256: input.ledgerSha256,
    })
    const region = structural.regions.find(
      candidate => candidate.target.index === lineage.targetIndex,
    )
    assert(region)
    assert.equal(region.baselineUnitIndex, lineage.baselineUnitIndex)
    assert.equal(region.classification, lineage.classification)
    assert.equal(region.pairReason, lineage.pairReason)
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
        start: lineage.start,
        end: lineage.end,
        bytes: lineage.bytes,
        tokenCount: lineage.tokenCount,
        sha256: lineage.sha256,
        coarseHash: lineage.coarseHash,
      },
    )
    assert.deepEqual(canonicalDescriptor(slicePinned(bundle, lineage)), target)
  }
})

test('historical autofix-pr source is a stale inline owner, not a replay donor', async () => {
  const blocker = fixture.sourceReplayBlocker
  const structural = ledger(fixture.inputs.targetStructuralLedger)
  const baseline = structural.unmatchedBaseline.find(
    unit => unit.index === fixture.baselineInlineUnit.baselineIndex,
  )
  assert(baseline)
  assert.deepEqual(
    {
      nodeType: baseline.nodeType,
      start: baseline.start,
      end: baseline.end,
      bytes: baseline.end - baseline.start,
      tokenCount: baseline.tokenCount,
      sha256: baseline.sourceHash,
      coarseHash: baseline.coarseHash,
    },
    {
      nodeType: fixture.baselineInlineUnit.nodeType,
      start: fixture.baselineInlineUnit.start,
      end: fixture.baselineInlineUnit.end,
      bytes: fixture.baselineInlineUnit.bytes,
      tokenCount: fixture.baselineInlineUnit.tokenCount,
      sha256: fixture.baselineInlineUnit.sha256,
      coarseHash: fixture.baselineInlineUnit.coarseHash,
    },
  )
  slicePinned(readPinned(fixture.inputs.baselineBundle), fixture.baselineInlineUnit)

  const sourceBytes = gitShow(blocker.commit, blocker.path)
  assert.deepEqual(descriptor(sourceBytes), {
    bytes: blocker.bytes,
    sha256: blocker.sha256,
  })
  const tree = spawnSync('git', ['rev-parse', `${blocker.commit}^{tree}`], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(tree.status, 0, tree.stderr)
  assert.equal(tree.stdout.trim(), blocker.tree)
  for (const commit of blocker.versionCommits) {
    assert.deepEqual(descriptor(gitShow(commit, blocker.path)), {
      bytes: blocker.bytes,
      sha256: blocker.sha256,
    })
  }
  const source = sourceBytes.toString()
  assert.equal(source.length, blocker.chars)
  for (const marker of blocker.missingExtractedUiMarkers) {
    assert.equal(source.includes(marker), false, `source unexpectedly has ${marker}`)
  }
  for (const marker of blocker.staleInlineMarkers) {
    assert.equal(source.includes(marker), true, `source lacks ${marker}`)
  }
  const targetText = slicePinned(
    readPinned(fixture.inputs.targetBundle),
    fixture.targetUnit,
  ).toString()
  for (const marker of blocker.targetUiAbsentInlineLiterals) {
    assert.equal(targetText.includes(marker), false)
  }

  const ts = await loadTypeScript()
  const sourceFile = ts.createSourceFile(
    blocker.path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  const declarations = new Map(
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
    const declaration = declarations.get(expected.name)
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
  const commandBytes = gitShow(blocker.commit, blocker.commandFile.path)
  assert.deepEqual(descriptor(commandBytes), {
    bytes: blocker.commandFile.bytes,
    sha256: blocker.commandFile.sha256,
  })
  assert.ok(
    commandBytes.toString().includes(`import('${blocker.commandFile.lazyModule}')`),
  )
})

test('latest packaged Target119 retains the exact blocked inline source', t => {
  if (!configuredSourceRoot) {
    t.skip('CLAUDE_CODE_2_1_119_SOURCE_ROOT is not configured')
    return
  }
  const blocker = fixture.sourceReplayBlocker
  const sourceBytes = fs.readFileSync(
    path.join(configuredSourceRoot, blocker.path.replace(/^src\//, '')),
  )
  assert.deepEqual(descriptor(sourceBytes), {
    bytes: blocker.bytes,
    sha256: blocker.sha256,
  })
  for (const marker of blocker.missingExtractedUiMarkers) {
    assert.equal(sourceBytes.toString().includes(marker), false)
  }
})
