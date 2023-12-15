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
  TARGET119_DOCTOR_WHOLE_UNIT_EVIDENCE_IDS,
  TARGET119_DOCTOR_WHOLE_UNIT_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/doctor-whole-unit-owner-overrides.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-doctor-whole-unit-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '457ff1eab1b03bbdc198e037fe3922190c2990f48b4a4580a89ff94cb4429007'
const configuredSourceRoot =
  process.env.CLAUDE_CODE_2_1_119_SOURCE_ROOT ??
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
const sourceRoot = configuredSourceRoot
  ? path.resolve(configuredSourceRoot)
  : path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src')
const immutableSourceRoot = path.join(
  root,
  '.recovery-tmp/semantic-trees/2.1.119/src',
)

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
  return {
    bytes: Buffer.byteLength(value),
    sha256: sha256(value),
  }
}

function sourceDescriptor(value) {
  return {
    chars: value.length,
    bytes: Buffer.byteLength(value),
    sha256: sha256(value),
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

function slicePinned(bundle, input) {
  const value = bundle.subarray(input.start, input.end)
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return value
}

function ledger(input) {
  return JSON.parse(gunzipSync(readPinned(input)))
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

function canonicalNodeDescriptor(node) {
  const serialized = JSON.stringify(canonicalAst(node))
  return [Buffer.byteLength(serialized), sha256(serialized)]
}

function normalizeReleaseLiteral(node) {
  if (node.type !== 'Literal' || typeof node.value !== 'string') return
  if (/^2\.1\.(118|119|120)$/.test(node.value)) {
    node.value = '<VERSION>'
    return
  }
  if (/^2026-04-(22|23|24)T/.test(node.value)) {
    node.value = '<BUILD_TIME>'
    return
  }
  if (/^(ef88b5|6f6855|080f07)[0-9a-f]+$/.test(node.value)) {
    node.value = '<GIT_SHA>'
  }
}

function mutateAst(node, visitor, parent = null, parentKey = null) {
  if (!node || typeof node !== 'object') return
  if (visitor(node, parent, parentKey) === false) return
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'loc', 'range'].includes(key)) continue
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        mutateAst(value[index], visitor, value, index)
      }
    } else {
      mutateAst(value, visitor, node, key)
    }
  }
}

function normalizedDoctorDescriptor(value, options = {}) {
  const unitText = value.toString()
  const ast = parseUnit(value)
  mutateAst(ast, (node, parent, parentKey) => {
    normalizeReleaseLiteral(node)
    if (
      options.collapseTargetDelta &&
      node.type === 'CallExpression' &&
      node.arguments.some(
        argument =>
          argument.type === 'Literal' &&
          argument.value === 'Auto-update channel:',
      )
    ) {
      const index = node.arguments.findIndex(
        argument =>
          argument.type === 'Literal' &&
          argument.value === 'Auto-update channel:',
      )
      node.arguments.splice(
        index,
        node.arguments.length - index,
        {type: 'Literal', value: 'Auto-update channel: '},
        {type: 'Identifier', name: '@id'},
      )
    }
    if (
      options.collapseTargetDelta &&
      node.type === 'ConditionalExpression' &&
      options.absoluteStart + node.start === fixture.backgroundSlot.target.start
    ) {
      parent[parentKey] = {type: 'Literal', value: null}
      return false
    }
    if (
      options.normalizeLaterWarning &&
      node.type === 'Literal' &&
      typeof node.value === 'string' &&
      node.value.includes(
        ' (daemon.json) only run while a foreground client or background job',
      )
    ) {
      node.value =
        ' (daemon.json) will only run while a Claude Code session is open. They will not run after reboot or after you close all sessions.'
    }
  })
  const serialized = JSON.stringify(canonicalAst(ast))
  return {
    bytes: Buffer.byteLength(serialized),
    sha256: sha256(serialized),
    serialized,
    unitText,
    ast,
  }
}

function assertRegion(structural, expected) {
  const region = structural.regions.find(
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
  if ('unknownFreeIdentifierCount' in expected) {
    assert.equal(
      region.unknownFreeIdentifierCount,
      expected.unknownFreeIdentifierCount,
    )
  }
  if ('baselineUnitIndex' in expected) {
    assert.equal(region.baselineUnitIndex, expected.baselineUnitIndex)
    assert.equal(region.pairReason, expected.pairReason)
  }
  return region
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

function tsSource(ts, filename, value) {
  const sourceFile = ts.createSourceFile(
    filename,
    value,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, filename)
  return sourceFile
}

function tsDeclarationDescriptor(ts, sourceFile, source, name) {
  const declaration = sourceFile.statements.find(
    statement => statement.name?.text === name,
  )
  assert(declaration, name)
  const start = declaration.getStart(sourceFile)
  const end = declaration.getEnd()
  const value = source.slice(start, end)
  return {
    declaration,
    descriptor: {
      start,
      end,
      chars: value.length,
      bytes: Buffer.byteLength(value),
      sha256: sha256(value),
    },
  }
}

function tsImportDescriptor(ts, sourceFile, source, moduleName) {
  const declaration = sourceFile.statements.find(
    statement =>
      ts.isImportDeclaration(statement) &&
      statement.moduleSpecifier.text === moduleName,
  )
  assert(declaration, moduleName)
  const start = declaration.getStart(sourceFile)
  const end = declaration.getEnd()
  const value = source.slice(start, end)
  return {
    start,
    end,
    chars: value.length,
    bytes: Buffer.byteLength(value),
    sha256: sha256(value),
  }
}

function countOccurrences(value, needle) {
  let count = 0
  let offset = -1
  while ((offset = value.indexOf(needle, offset + 1)) !== -1) count += 1
  return count
}

test('Target119 Doctor fixture exposes one static whole-unit override', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.118-to-2.1.119')
  assert.equal(fixture.summary.units, 1)
  assert.equal(fixture.summary.sourceReplayHelpers, 0)
  assert.equal(fixture.replayDecision.mode, 'static-only')
  assert.equal(fixture.replayDecision.sourceReplayAuthorized, false)
  assert.deepEqual(
    TARGET119_DOCTOR_WHOLE_UNIT_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
  assert.deepEqual(
    TARGET119_DOCTOR_WHOLE_UNIT_OWNER_OVERRIDES.map(row => ({
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
        paths: [fixture.sourceOwner.path],
        declarations: ['Doctor'],
        evidenceIds: fixture.evidenceIds,
        behavior: fixture.ownerBehavior,
      },
    ],
  )
})

test('Target119 Doctor is an exact whole-unit delta from Target118', () => {
  const baselineBundle = readPinned(fixture.inputs.baselineBundle)
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const baselineStructural = ledger(fixture.inputs.baselineStructuralLedger)
  const targetStructural = ledger(fixture.inputs.targetStructuralLedger)
  assertRegion(baselineStructural, fixture.baselineUnit)
  assertRegion(targetStructural, fixture.targetUnit)
  const unmatchedBaseline = targetStructural.unmatchedBaseline.find(
    unit => unit.index === fixture.baselineUnit.targetIndex,
  )
  assert(unmatchedBaseline)
  assert.deepEqual(
    {
      start: unmatchedBaseline.start,
      end: unmatchedBaseline.end,
      bytes: unmatchedBaseline.end - unmatchedBaseline.start,
      tokenCount: unmatchedBaseline.tokenCount,
      sha256: unmatchedBaseline.sourceHash,
      coarseHash: unmatchedBaseline.coarseHash,
    },
    {
      start: fixture.baselineUnit.start,
      end: fixture.baselineUnit.end,
      bytes: fixture.baselineUnit.bytes,
      tokenCount: fixture.baselineUnit.tokenCount,
      sha256: fixture.baselineUnit.sha256,
      coarseHash: fixture.baselineUnit.coarseHash,
    },
  )

  const baselineUnit = slicePinned(baselineBundle, fixture.baselineUnit)
  const targetUnit = slicePinned(targetBundle, fixture.targetUnit)
  assert.deepEqual(canonicalDescriptor(baselineUnit), {
    bytes: fixture.baselineUnit.canonicalAstBytes,
    sha256: fixture.baselineUnit.canonicalAstSha256,
  })
  assert.deepEqual(canonicalDescriptor(targetUnit), {
    bytes: fixture.targetUnit.canonicalAstBytes,
    sha256: fixture.targetUnit.canonicalAstSha256,
  })

  const statementRows = value => {
    const functionNode = parseUnit(value).body[0]
    return functionNode.body.body.map((statement, index) => [
      index,
      statement.type,
      ...canonicalNodeDescriptor(statement),
    ])
  }
  const baselineRows = statementRows(baselineUnit)
  const targetRows = statementRows(targetUnit)
  assert.deepEqual(baselineRows, fixture.wholeUnitDelta.baselineStatementRows)
  assert.deepEqual(targetRows, fixture.wholeUnitDelta.targetStatementRows)
  assert.equal(baselineRows.length, fixture.wholeUnitDelta.bodyStatements)
  for (const index of fixture.wholeUnitDelta.unchangedCanonicalStatementIndices) {
    assert.deepEqual(targetRows[index], baselineRows[index])
  }
  assert.notDeepEqual(
    targetRows[fixture.wholeUnitDelta.changedCanonicalStatementIndex],
    baselineRows[fixture.wholeUnitDelta.changedCanonicalStatementIndex],
  )

  const baselineNormalized = normalizedDoctorDescriptor(baselineUnit)
  const targetNormalized = normalizedDoctorDescriptor(targetUnit, {
    collapseTargetDelta: true,
    absoluteStart: fixture.targetUnit.start,
  })
  assert.equal(targetNormalized.serialized, baselineNormalized.serialized)
  assert.deepEqual(
    {
      bytes: targetNormalized.bytes,
      sha256: targetNormalized.sha256,
    },
    fixture.wholeUnitDelta.normalizedCanonicalAst,
  )
})

test('release, channel, background, and retained-Tree changes are exact', () => {
  const baselineBundle = readPinned(fixture.inputs.baselineBundle)
  const targetBundle = readPinned(fixture.inputs.targetBundle)

  const baselineMetadata = fixture.releaseMetadata.baselineLiteralSpans.map(
    ([start, end]) => baselineBundle.subarray(start, end).toString(),
  )
  const targetMetadata = fixture.releaseMetadata.targetLiteralSpans.map(
    ([start, end]) => targetBundle.subarray(start, end).toString(),
  )
  assert.deepEqual(
    baselineMetadata,
    fixture.releaseMetadata.baselineValues
      .concat(fixture.releaseMetadata.baselineValues)
      .map(value => JSON.stringify(value)),
  )
  assert.deepEqual(
    targetMetadata,
    fixture.releaseMetadata.targetValues
      .concat(fixture.releaseMetadata.targetValues)
      .map(value => JSON.stringify(value)),
  )
  for (const value of fixture.releaseMetadata.baselineValues) {
    assert.equal(
      baselineMetadata.filter(candidate => candidate === JSON.stringify(value))
        .length,
      fixture.releaseMetadata.occurrencesPerValue,
    )
  }
  for (const value of fixture.releaseMetadata.targetValues) {
    assert.equal(
      targetMetadata.filter(candidate => candidate === JSON.stringify(value))
        .length,
      fixture.releaseMetadata.occurrencesPerValue,
    )
  }

  const baselineCall = slicePinned(
    baselineBundle,
    fixture.channelDelta.baselineCall,
  ).toString()
  const targetCall = slicePinned(
    targetBundle,
    fixture.channelDelta.targetCall,
  ).toString()
  const targetConditional = slicePinned(
    targetBundle,
    fixture.channelDelta.targetConditional,
  ).toString()
  assert.match(baselineCall, /"Auto-update channel: ",[A-Za-z_$][\w$]*\)$/)
  assert.match(
    targetCall,
    /"Auto-update channel:"," ",[A-Za-z_$][\w$]*==="rc"\?"slow":[A-Za-z_$][\w$]*\)$/,
  )
  const conditionalAst = parseUnit(`(${targetConditional})`).body[0].expression
  assert.equal(conditionalAst.type, 'ConditionalExpression')
  assert.equal(conditionalAst.test.operator, '===')
  assert.equal(conditionalAst.test.right.value, fixture.channelDelta.targetConditional.input)
  assert.equal(
    conditionalAst.consequent.value,
    fixture.channelDelta.targetConditional.display,
  )

  const baselineUnit = parseUnit(
    slicePinned(baselineBundle, fixture.baselineUnit),
  )
  const targetUnit = parseUnit(slicePinned(targetBundle, fixture.targetUnit))
  const atPath = (value, keys) => keys.reduce((current, key) => current[key], value)
  const baselineSlot = atPath(baselineUnit, fixture.backgroundSlot.astPath)
  const targetSlot = atPath(targetUnit, fixture.backgroundSlot.astPath)
  assert.equal(baselineSlot.type, 'Literal')
  assert.equal(baselineSlot.value, null)
  assert.equal(targetSlot.type, 'ConditionalExpression')
  assert.equal(targetSlot.alternate.value, null)
  assert.equal(targetSlot.test.type, 'CallExpression')
  assert.equal(targetSlot.consequent.type, 'CallExpression')
  assert.equal(
    slicePinned(baselineBundle, fixture.backgroundSlot.baseline).toString(),
    'null',
  )
  assert.match(
    slicePinned(targetBundle, fixture.backgroundSlot.target).toString(),
    /^\w+\(\)\?\w+\.default\.createElement\(\w+,null\):null$/,
  )
  slicePinned(targetBundle, fixture.backgroundSlot.target.gateCall)
  slicePinned(targetBundle, fixture.backgroundSlot.target.componentBinding)

  for (const occurrence of fixture.retainedOccurrenceRows) {
    const target = targetBundle.subarray(...occurrence.target)
    const baseline = baselineBundle.subarray(...occurrence.baseline)
    assert.equal(sha256(target), occurrence.sha256)
    assert.equal(sha256(baseline), occurrence.sha256)
    assert.equal(target.toString(), baseline.toString())
    assert.equal(
      target.toString(),
      occurrence.value === 'tree' ? '"tree"' : occurrence.value,
    )
  }
})

test('BackgroundServer dependency, export, initializer, and later runtime lineage are exact', () => {
  const baselineBundle = readPinned(fixture.inputs.baselineBundle)
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const laterBundle = readPinned(fixture.inputs.laterBundle)
  const baselineStructural = ledger(fixture.inputs.baselineStructuralLedger)
  const targetStructural = ledger(fixture.inputs.targetStructuralLedger)
  const laterStructural = ledger(fixture.inputs.laterStructuralLedger)

  for (const expected of [
    fixture.backgroundDependency.detailsUnit,
    fixture.backgroundDependency.componentUnit,
    fixture.backgroundDependency.initializerUnit,
    fixture.backgroundDependency.statusUnit,
    fixture.moduleBoundary.exportRegistration,
    fixture.moduleBoundary.targetInitializer,
  ]) {
    assertRegion(targetStructural, expected)
  }
  for (const expected of [
    fixture.laterRuntimeLineage.detailsUnit,
    fixture.laterRuntimeLineage.componentUnit,
    fixture.laterRuntimeLineage.doctorUnit,
  ]) {
    assertRegion(laterStructural, expected)
  }

  const component = slicePinned(
    targetBundle,
    fixture.backgroundDependency.componentUnit,
  )
  assert.deepEqual(canonicalDescriptor(component), {
    bytes: fixture.backgroundDependency.componentUnit.canonicalAstBytes,
    sha256: fixture.backgroundDependency.componentUnit.canonicalAstSha256,
  })
  const componentText = component.toString()
  assert.match(componentText, /\.c\(3\)/)
  assert.equal(countOccurrences(componentText, 'Background server'), 1)
  assert.equal(countOccurrences(componentText, 'Probing background server\\u2026'), 1)
  slicePinned(targetBundle, fixture.backgroundDependency.statusCall)
  const details = slicePinned(
    targetBundle,
    fixture.backgroundDependency.detailsUnit,
  ).toString()
  assert.equal(
    targetBundle
      .subarray(
        fixture.backgroundDependency.target119Warning.start,
        fixture.backgroundDependency.target119Warning.end,
      )
      .toString(),
    ' (daemon.json) will only run while a Claude Code session is open. They will not run after reboot or after you close all sessions.',
  )
  assert.equal(
    sha256(
      targetBundle.subarray(
        fixture.backgroundDependency.target119Warning.start,
        fixture.backgroundDependency.target119Warning.end,
      ),
    ),
    fixture.backgroundDependency.target119Warning.sha256,
  )
  assert.match(details, /\.c\(19\)/)

  const gateText = slicePinned(
    targetBundle,
    fixture.backgroundDependency.gateUnit,
  ).toString()
  const gateFunction = parseUnit(gateText).body[0]
  assert.equal(gateFunction.body.body.length, 1)
  assert.equal(gateFunction.body.body[0].type, 'ReturnStatement')
  assert.equal(gateFunction.body.body[0].argument.type, 'UnaryExpression')
  assert.equal(gateFunction.body.body[0].argument.operator, '!')
  assert.equal(
    !gateFunction.body.body[0].argument.argument.value,
    fixture.backgroundDependency.gateUnit.returnValue,
  )

  const exportText = slicePinned(
    targetBundle,
    fixture.moduleBoundary.exportRegistration,
  ).toString()
  assert.match(exportText, /Doctor:\(\)=>[A-Za-z_$][\w$]*/)
  const exportAst = parseUnit(exportText)
  const doctorProperties = walk(
    exportAst,
    node =>
      node.type === 'Property' &&
      (node.key.name === 'Doctor' || node.key.value === 'Doctor'),
  )
  assert.equal(doctorProperties.length, 1)

  const baselineInitializer = slicePinned(
    baselineBundle,
    fixture.moduleBoundary.baselineInitializer,
  )
  const targetInitializer = slicePinned(
    targetBundle,
    fixture.moduleBoundary.targetInitializer,
  )
  const normalizeInitializer = (value, removeStart = null, absoluteStart = 0) => {
    const ast = parseUnit(value)
    if (removeStart !== null) {
      const arrow = ast.body[0].declarations[0].init.arguments[0]
      const index = arrow.body.body.findIndex(
        statement => absoluteStart + statement.start === removeStart,
      )
      assert.notEqual(index, -1)
      arrow.body.body.splice(index, 1)
    }
    const serialized = JSON.stringify(canonicalAst(ast))
    return {
      bytes: Buffer.byteLength(serialized),
      sha256: sha256(serialized),
      serialized,
    }
  }
  const baselineNormalized = normalizeInitializer(baselineInitializer)
  const targetNormalized = normalizeInitializer(
    targetInitializer,
    fixture.moduleBoundary.backgroundInitializerCall.start,
    fixture.moduleBoundary.targetInitializer.start,
  )
  assert.equal(targetNormalized.serialized, baselineNormalized.serialized)
  assert.deepEqual(
    {
      bytes: targetNormalized.bytes,
      sha256: targetNormalized.sha256,
    },
    fixture.moduleBoundary.normalizedWithoutBackgroundCall,
  )
  assert.equal(
    slicePinned(
      targetBundle,
      fixture.moduleBoundary.backgroundInitializerCall,
    ).toString(),
    'og7();',
  )

  const targetDoctor = slicePinned(targetBundle, fixture.targetUnit)
  const laterDoctor = slicePinned(
    laterBundle,
    fixture.laterRuntimeLineage.doctorUnit,
  )
  const targetReleaseNormalized = normalizedDoctorDescriptor(targetDoctor)
  const laterReleaseNormalized = normalizedDoctorDescriptor(laterDoctor)
  assert.equal(
    laterReleaseNormalized.serialized,
    targetReleaseNormalized.serialized,
  )
  assert.deepEqual(
    {
      bytes: laterReleaseNormalized.bytes,
      sha256: laterReleaseNormalized.sha256,
    },
    fixture.laterRuntimeLineage.normalizedDoctor,
  )

  const laterComponent = slicePinned(
    laterBundle,
    fixture.laterRuntimeLineage.componentUnit,
  )
  assert.deepEqual(
    canonicalDescriptor(laterComponent),
    canonicalDescriptor(component),
  )
  const laterDetails = slicePinned(
    laterBundle,
    fixture.laterRuntimeLineage.detailsUnit,
  )
  const targetDetailsNormalized = normalizedDoctorDescriptor(
    Buffer.from(details),
  )
  const laterDetailsNormalized = normalizedDoctorDescriptor(laterDetails, {
    normalizeLaterWarning: true,
  })
  assert.equal(
    laterDetailsNormalized.serialized,
    targetDetailsNormalized.serialized,
  )
  assert.deepEqual(
    {
      bytes: laterDetailsNormalized.bytes,
      sha256: laterDetailsNormalized.sha256,
    },
    fixture.laterRuntimeLineage.normalizedDetails,
  )
  slicePinned(laterBundle, fixture.laterRuntimeLineage.target120Warning)
})

test('the exact 15-row owner admission is fail closed and report-state tolerant', () => {
  const reportPath = path.join(root, fixture.inputs.targetReport.path)
  if (!fs.existsSync(reportPath)) return
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  const select = rows =>
    rows.filter(row => row.structural.index === fixture.targetUnit.targetIndex)
  const allOwnerRows = select(report.sourceRuntimeOwnerResidueRows)
  const addedOwnerRows = select(report.sourceRuntimeAddedOwnerResidueRows)
  const rawRows = select(report.rows)

  assert.ok(
    addedOwnerRows.length === 0 ||
      JSON.stringify(addedOwnerRows.map(sourceRowIdentity)) ===
        JSON.stringify(fixture.ownerResidues.rows),
    'scanner is exact pre-correction or corrected state',
  )
  if (addedOwnerRows.length > 0) {
    assert.deepEqual(
      rowSetDescriptor(addedOwnerRows),
      fixture.ownerResidues.preCorrectionAddedOwnerRows,
    )
    for (const row of addedOwnerRows) {
      assert.deepEqual(row.ownerPaths, [fixture.ownerResidues.ownerPath])
      assert.deepEqual(row.ownerSourceMatches, [])
    }
  }
  if (allOwnerRows.length > 0) {
    assert.deepEqual(
      rowSetDescriptor(allOwnerRows),
      fixture.ownerResidues.preCorrectionAllOwnerRows,
    )
  }
  if (rawRows.length > 0) {
    assert.deepEqual(
      rowSetDescriptor(rawRows),
      fixture.ownerResidues.preCorrectionRawRows,
    )
    assert.deepEqual(
      rawRows.map(sourceRowIdentity),
      fixture.ownerResidues.rows.slice(0, rawRows.length),
    )
  }
})

test('source lineage proves the owner and blocks partial or later-source replay', async () => {
  const ts = await loadTypeScript()
  const sourcePath = path.join(
    sourceRoot,
    fixture.sourceOwner.path.replace(/^src\//, ''),
  )
  const source = fs.readFileSync(sourcePath, 'utf8')
  assert.deepEqual(sourceDescriptor(source), {
    chars: fixture.sourceOwner.chars,
    bytes: fixture.sourceOwner.bytes,
    sha256: fixture.sourceOwner.sha256,
  })
  assert.equal(
    sha256(gitShow(fixture.sourceOwner.commit, fixture.sourceOwner.path)),
    fixture.sourceOwner.sha256,
  )
  const sourceFile = tsSource(ts, fixture.sourceOwner.path, source)
  assert.deepEqual(
    tsDeclarationDescriptor(ts, sourceFile, source, 'Doctor').descriptor,
    fixture.sourceOwner.doctor,
  )
  assert.equal(
    countOccurrences(source, fixture.sourceOwner.simpleChannelExpression),
    1,
  )
  for (const marker of fixture.sourceOwner.missingMarkers) {
    assert.equal(countOccurrences(source, marker), 0, marker)
  }

  const sourceMapMatch = source.match(
    /\/\/# sourceMappingURL=data:application\/json;charset=utf-8;base64,([^\n]+)/,
  )
  assert(sourceMapMatch)
  const inlineSource = JSON.parse(
    Buffer.from(sourceMapMatch[1], 'base64').toString(),
  ).sourcesContent[0]
  assert.deepEqual(sourceDescriptor(inlineSource), {
    chars: fixture.sourceOwner.inlineSource.chars,
    bytes: fixture.sourceOwner.inlineSource.bytes,
    sha256: fixture.sourceOwner.inlineSource.sha256,
  })
  const inlineSourceFile = tsSource(ts, 'Doctor.inline.tsx', inlineSource)
  assert.deepEqual(
    tsDeclarationDescriptor(
      ts,
      inlineSourceFile,
      inlineSource,
      'Doctor',
    ).descriptor,
    fixture.sourceOwner.inlineSource.doctor,
  )
  for (const marker of fixture.sourceOwner.missingMarkers) {
    assert.equal(countOccurrences(inlineSource, marker), 0, `inline ${marker}`)
  }

  const laterSource = fs.readFileSync(
    path.join(root, fixture.laterSourceWitness.path),
    'utf8',
  )
  assert.deepEqual(sourceDescriptor(laterSource), {
    chars: fixture.laterSourceWitness.chars,
    bytes: fixture.laterSourceWitness.bytes,
    sha256: fixture.laterSourceWitness.sha256,
  })
  assert.equal(
    sha256(
      gitShow(
        fixture.laterSourceWitness.commit,
        fixture.sourceOwner.path,
      ),
    ),
    fixture.laterSourceWitness.sha256,
  )
  const laterSourceFile = tsSource(ts, fixture.sourceOwner.path, laterSource)
  assert.deepEqual(
    tsDeclarationDescriptor(
      ts,
      laterSourceFile,
      laterSource,
      'BackgroundServerDetails',
    ).descriptor,
    fixture.laterSourceWitness.backgroundDetails,
  )
  assert.deepEqual(
    tsDeclarationDescriptor(
      ts,
      laterSourceFile,
      laterSource,
      'BackgroundServer',
    ).descriptor,
    fixture.laterSourceWitness.background,
  )
  assert.deepEqual(
    tsDeclarationDescriptor(
      ts,
      laterSourceFile,
      laterSource,
      'Doctor',
    ).descriptor,
    fixture.laterSourceWitness.doctor,
  )
  assert.deepEqual(
    tsImportDescriptor(
      ts,
      laterSourceFile,
      laterSource,
      '../daemon/status.js',
    ),
    fixture.laterSourceWitness.daemonStatusImport,
  )
  assert.deepEqual(
    tsImportDescriptor(
      ts,
      laterSourceFile,
      laterSource,
      '../utils/agentsFleet.js',
    ),
    fixture.laterSourceWitness.agentsFleetImport,
  )
  assert.equal(
    countOccurrences(laterSource, fixture.laterSourceWitness.laterOnlyWarning),
    1,
  )
  assert.equal(
    countOccurrences(laterSource, fixture.laterSourceWitness.stillMissingMarker),
    0,
  )
  const laterMapMatch = laterSource.match(
    /\/\/# sourceMappingURL=data:application\/json;charset=utf-8;base64,([^\n]+)/,
  )
  assert(laterMapMatch)
  const laterInlineSource = JSON.parse(
    Buffer.from(laterMapMatch[1], 'base64').toString(),
  ).sourcesContent[0]
  assert.equal(sha256(laterInlineSource), fixture.laterSourceWitness.inlineSourceSha256)
  assert.equal(laterInlineSource, inlineSource)

  for (const [name, input] of Object.entries(fixture.sourceDependencies)) {
    const dependencyPath = path.join(
      immutableSourceRoot,
      input.path.replace(/^src\//, ''),
    )
    const dependency = fs.readFileSync(dependencyPath, 'utf8')
    assert.deepEqual(sourceDescriptor(dependency), {
      chars: input.chars,
      bytes: input.bytes,
      sha256: input.sha256,
    })
    const dependencyFile = tsSource(ts, input.path, dependency)
    const declarationName =
      name === 'gate' ? 'isDaemonCliEnabled' : 'getBgDaemonStatus'
    assert.deepEqual(
      tsDeclarationDescriptor(
        ts,
        dependencyFile,
        dependency,
        declarationName,
      ).descriptor,
      input.declaration,
    )
  }
})
