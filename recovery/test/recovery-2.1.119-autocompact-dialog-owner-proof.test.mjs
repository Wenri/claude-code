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
  TARGET119_AUTOCOMPACT_DIALOG_EVIDENCE_IDS,
  TARGET119_AUTOCOMPACT_DIALOG_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/autocompact-dialog-owner-overrides.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-autocompact-dialog-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'd2bf6ad91aa52de6771f0ddcf329dcea99779c090473c61c7efc35cb8f3a0344'
const configuredSourceRoot = process.env.CLAUDE_CODE_2_1_119_SOURCE_ROOT

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({
  bytes: Buffer.byteLength(value),
  sha256: sha256(value),
})

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

function propertyValue(object, name) {
  return object.properties.find(property => propertyName(property) === name)
    ?.value
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

function assertRegion(structural, expected) {
  const region = structural.regions.find(
    candidate => candidate.target.index === expected.targetIndex,
  )
  assert(region, `u${expected.targetIndex}`)
  assert.deepEqual(
    {
      classification: region.classification,
      start: region.target.start,
      end: region.target.end,
      bytes: region.target.end - region.target.start,
      tokenCount: region.target.tokenCount,
      sha256: region.target.sourceHash,
      coarseHash: region.target.coarseHash,
    },
    {
      classification: expected.classification,
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
  return region
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
      bytes: Buffer.byteLength(value),
      chars: value.length,
      sha256: sha256(value),
    },
  }
}

function countOccurrences(value, needle) {
  let count = 0
  let offset = -1
  while ((offset = value.indexOf(needle, offset + 1)) !== -1) count += 1
  return count
}

test('Target119 autocompact fixture exposes one static whole-unit override', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.118-to-2.1.119')
  assert.equal(fixture.summary.sourceReplayHelpers, 0)
  assert.equal(fixture.replayDecision.mode, 'static-only')
  assert.deepEqual(
    TARGET119_AUTOCOMPACT_DIALOG_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
  assert.deepEqual(
    TARGET119_AUTOCOMPACT_DIALOG_OWNER_OVERRIDES.map(row => ({
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
        declarations: ['AutoCompactDialog', 'call'],
        evidenceIds: fixture.evidenceIds,
        behavior: fixture.ownerBehavior,
      },
    ],
  )
})

test('authenticated Target119 unit and exact 17-row correction are fail closed', () => {
  const baseline = readPinned(fixture.inputs.baselineBundle).toString()
  for (const marker of fixture.baselineAbsence.uniqueTargetMarkers) {
    assert.equal(
      countOccurrences(baseline, marker),
      fixture.baselineAbsence.occurrencesPerMarker,
      marker,
    )
  }

  const bundle = readPinned(fixture.inputs.targetBundle)
  const structural = ledger(fixture.inputs.targetStructuralLedger)
  const region = assertRegion(structural, fixture.targetUnit)
  assert.equal(region.target.nodeType, fixture.targetUnit.nodeType)
  assert.equal(
    region.unknownFreeIdentifierCount,
    fixture.targetUnit.unknownFreeIdentifierCount,
  )
  const unitBytes = slicePinned(bundle, fixture.targetUnit)
  assert.deepEqual(canonicalDescriptor(unitBytes), {
    bytes: fixture.targetUnit.canonicalAstBytes,
    sha256: fixture.targetUnit.canonicalAstSha256,
  })
  const unitText = unitBytes.toString()
  const unit = parseUnit(unitText).body[0]
  const statements = unit.body.body.map((statement, index) => {
    const value = unitText.slice(statement.start, statement.end)
    return [
      index,
      statement.type,
      fixture.targetUnit.start + statement.start,
      fixture.targetUnit.start + statement.end,
      Buffer.byteLength(value),
      sha256(value),
    ]
  })
  const serialized = JSON.stringify(statements)
  assert.deepEqual(
    {
      statements: statements.length,
      jsonBytes: Buffer.byteLength(serialized),
      sha256: sha256(serialized),
    },
    fixture.targetUnit.bodyStatements,
  )

  const { phase, report, coverage } = loadArtifactState()
  assert.ok(fixture.latestArtifactProjection.phases.includes(phase))
  assertLatestArtifactProjection(report, coverage)
})

test('Target119 AutoCompactDialog artifact generations are exact and fail closed', () => {
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
        {...current.sourceCoverageRaw, bytes: 0},
      ),
    /unknown or hybrid/,
  )
})

test('49-slot UI cache, selection controls, warnings, and chord guide are exact', () => {
  const bundle = readPinned(fixture.inputs.targetBundle)
  const unitText = slicePinned(bundle, fixture.targetUnit).toString()
  const unit = parseUnit(unitText).body[0]
  const declarations = walk(unit, node => node.type === 'VariableDeclarator')
  const cache = declarations.find(
    declaration =>
      declaration.init?.type === 'CallExpression' &&
      declaration.init.arguments[0]?.value === fixture.uiContract.compilerCache.size,
  )
  assert(cache)
  const cacheName = cache.id.name
  const identifiers = walk(
    unit,
    node => node.type === 'Identifier' && node.name === cacheName,
  )
  const members = walk(
    unit,
    node =>
      node.type === 'MemberExpression' &&
      node.computed === true &&
      node.object.type === 'Identifier' &&
      node.object.name === cacheName &&
      node.property.type === 'Literal' &&
      Number.isInteger(node.property.value),
  )
  const indices = members.map(member => member.property.value)
  const unique = [...new Set(indices)].sort((left, right) => left - right)
  const counts = unique.map(index =>
    indices.filter(candidate => candidate === index).length,
  )
  assert.deepEqual(
    {
      size: cache.init.arguments[0].value,
      identifierOccurrences: identifiers.length,
      memberOccurrences: members.length,
      uniqueIndices: unique.length,
      minIndex: unique[0],
      maxIndex: unique.at(-1),
      indexCountSha256: sha256(JSON.stringify(counts)),
    },
    fixture.uiContract.compilerCache,
  )
  assert.ok(unique.every((value, index) => value === index))

  const objectPatterns = declarations.filter(
    declaration => declaration.id.type === 'ObjectPattern',
  )
  assert.deepEqual(
    objectPatterns[0].id.properties.map(propertyName),
    fixture.uiContract.props,
  )
  assert.deepEqual(
    objectPatterns[1].id.properties.map(propertyName),
    fixture.uiContract.resolutionProperties,
  )

  const contextObjects = walk(
    unit,
    node =>
      node.type === 'ObjectExpression' &&
      node.properties.length === 1 &&
      propertyName(node.properties[0]) === 'context',
  )
  assert.deepEqual(
    contextObjects.map(object => propertyValue(object, 'context').value),
    fixture.uiContract.keybindingContexts,
  )
  for (const expected of [
    fixture.uiContract.selectActions,
    fixture.uiContract.tabActions,
  ]) {
    assert.equal(
      walk(
        unit,
        node =>
          node.type === 'ObjectExpression' &&
          JSON.stringify(node.properties.map(propertyName)) ===
            JSON.stringify(expected),
      ).length,
      1,
    )
  }

  const inputStatement = unit.body.body[fixture.uiContract.inputGuideStatement.statementIndex]
  const inputValue = unitText.slice(inputStatement.start, inputStatement.end)
  assert.deepEqual(
    {
      start: fixture.targetUnit.start + inputStatement.start,
      end: fixture.targetUnit.start + inputStatement.end,
      ...descriptor(inputValue),
    },
    {
      start: fixture.uiContract.inputGuideStatement.start,
      end: fixture.uiContract.inputGuideStatement.end,
      bytes: fixture.uiContract.inputGuideStatement.bytes,
      sha256: fixture.uiContract.inputGuideStatement.sha256,
    },
  )
  const keyboard = parseUnit(
    slicePinned(bundle, fixture.keyboardShortcutDependency.targetUnit),
  ).body[0]
  const shortcutCalls = walk(
    inputStatement,
    node =>
      node.type === 'CallExpression' &&
      node.callee.type === 'MemberExpression' &&
      node.callee.property.name === 'createElement' &&
      node.arguments[0]?.type === 'Identifier' &&
      node.arguments[0].name === keyboard.id.name,
  )
  assert.deepEqual(
    shortcutCalls.map(call => {
      const props = call.arguments[1]
      const chord = propertyValue(props, 'chord')
      return {
        chord:
          chord.type === 'ArrayExpression'
            ? chord.elements.map(element => element.value)
            : chord.value,
        action: propertyValue(props, 'action').value,
      }
    }),
    fixture.uiContract.inputGuideShortcuts,
  )

  for (const literal of [
    ...fixture.uiContract.sourceLabels,
    fixture.uiContract.selectedAutoLabel,
    fixture.uiContract.dialog.title,
    fixture.uiContract.dialog.currentPrefix,
    fixture.uiContract.dialog.environmentWarning,
    fixture.uiContract.dialog.disabledWarning,
    fixture.uiContract.dialog.overrideWarning,
  ]) {
    assert.ok(
      walk(
        unit,
        node =>
          (node.type === 'Literal' && node.value === literal) ||
          (node.type === 'TemplateElement' &&
            (node.value.cooked === literal || node.value.raw === literal)),
      ).length >= 1,
      literal,
    )
  }
})

test('module registration, adapter, initializer, and command loader close the boundary', () => {
  const bundle = readPinned(fixture.inputs.targetBundle)
  const structural = ledger(fixture.inputs.targetStructuralLedger)
  slicePinned(bundle, fixture.callerBoundary.combined)
  for (const expected of [
    fixture.callerBoundary.exportRegistration,
    fixture.callerBoundary.stateSelector,
    fixture.callerBoundary.callAdapter,
    fixture.callerBoundary.uiInitializer,
    fixture.callerBoundary.commandInitializer,
    fixture.callerBoundary.applyDependency,
    fixture.keyboardShortcutDependency.targetUnit,
  ]) {
    assertRegion(structural, expected)
  }

  const ui = parseUnit(slicePinned(bundle, fixture.targetUnit)).body[0]
  const selector = parseUnit(
    slicePinned(bundle, fixture.callerBoundary.stateSelector),
  ).body[0]
  assert.equal(
    walk(
      ui,
      node =>
        node.type === 'CallExpression' &&
        node.arguments[0]?.type === 'Identifier' &&
        node.arguments[0].name === selector.id.name,
    ).length,
    1,
  )

  const registration = parseUnit(
    slicePinned(bundle, fixture.callerBoundary.exportRegistration),
  ).body[0].expression
  const moduleName = registration.arguments[0].name
  const callProperty = registration.arguments[1].properties.find(
    property => propertyName(property) === 'call',
  )
  const adapterName = callProperty.value.body.name
  const adapterBytes = slicePinned(bundle, fixture.callerBoundary.callAdapter)
  const adapterAst = parseUnit(adapterBytes)
  const adapter = walk(
    adapterAst,
    node => node.type === 'VariableDeclarator' && node.id.name === adapterName,
  )[0]
  assert(adapter)
  const dialogCall = walk(
    adapter,
    node =>
      node.type === 'CallExpression' &&
      node.arguments[0]?.type === 'Identifier' &&
      node.arguments[0].name === ui.id.name,
  )[0]
  assert(dialogCall)
  assert.deepEqual(
    descriptor(adapterBytes.toString().slice(dialogCall.start, dialogCall.end)),
    {
      bytes: fixture.callerBoundary.callAdapter.dialogCall.bytes,
      sha256: fixture.callerBoundary.callAdapter.dialogCall.sha256,
    },
  )
  const apply = parseUnit(
    slicePinned(bundle, fixture.callerBoundary.applyDependency),
  ).body[0]
  assert.equal(
    walk(
      adapter,
      node =>
        node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        node.callee.name === apply.id.name,
    ).length,
    1,
  )
  assert.equal(
    walk(
      adapter,
      node =>
        node.type === 'Literal' &&
        node.value === 'tengu_autocompact_dialog_opened',
    ).length,
    1,
  )

  const initializer = parseUnit(
    slicePinned(bundle, fixture.callerBoundary.uiInitializer),
  ).body[0]
  const initializerName = initializer.declarations[0].id.name
  const command = parseUnit(
    slicePinned(bundle, fixture.callerBoundary.commandInitializer),
  )
  const localJsx = walk(
    command,
    node =>
      node.type === 'ObjectExpression' &&
      propertyValue(node, 'type')?.value === 'local-jsx' &&
      propertyValue(node, 'name')?.value === 'autocompact',
  )[0]
  assert(localJsx)
  const loader = propertyValue(localJsx, 'load')
  assert.equal(
    walk(
      loader,
      node => node.type === 'Identifier' && node.name === initializerName,
    ).length,
    1,
  )
  assert.equal(
    walk(loader, node => node.type === 'Identifier' && node.name === moduleName)
      .length,
    1,
  )
  const loadCall = walk(loader, node => node.type === 'CallExpression')[0]
  const commandBytes = slicePinned(bundle, fixture.callerBoundary.commandInitializer)
  const expectedLoad = fixture.callerBoundary.commandInitializer.localJsxLoad
  const absoluteStart =
    fixture.callerBoundary.commandInitializer.start + loadCall.start
  const exactLoad = commandBytes
    .toString()
    .slice(loadCall.start, loadCall.end)
  assert.deepEqual(
    { start: absoluteStart, end: absoluteStart + exactLoad.length, ...descriptor(exactLoad) },
    expectedLoad,
  )
})

async function verifySourceRoot(sourceRoot) {
  const ts = await loadTypeScript()
  const owner = fixture.sourceOwner
  const resolveSourcePath = relativePath => {
    const projectRelative = path.join(sourceRoot, relativePath)
    if (fs.existsSync(projectRelative)) return projectRelative
    assert.ok(relativePath.startsWith('src/'))
    const srcRelative = path.join(sourceRoot, relativePath.slice(4))
    assert.ok(fs.existsSync(srcRelative), relativePath)
    return srcRelative
  }
  const sourcePath = resolveSourcePath(owner.path)
  const source = fs.readFileSync(sourcePath, 'utf8')
  assert.deepEqual(
    { bytes: Buffer.byteLength(source), chars: source.length, sha256: sha256(source) },
    { bytes: owner.bytes, chars: owner.chars, sha256: owner.sha256 },
  )
  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  const dialog = tsDeclarationDescriptor(
    ts,
    sourceFile,
    source,
    'AutoCompactDialog',
  )
  const call = tsDeclarationDescriptor(ts, sourceFile, source, 'call')
  assert.deepEqual(dialog.descriptor, owner.declarations.AutoCompactDialog)
  assert.deepEqual(call.descriptor, owner.declarations.call)

  const imports = sourceFile.statements.filter(ts.isImportDeclaration)
  const shortcutImport = imports.find(
    declaration =>
      declaration.moduleSpecifier.text === owner.shortcutImport.module,
  )
  assert(shortcutImport)
  const importStart = shortcutImport.getStart(sourceFile)
  const importEnd = shortcutImport.getEnd()
  assert.deepEqual(
    {
      start: importStart,
      end: importEnd,
      ...descriptor(source.slice(importStart, importEnd)),
    },
    {
      start: owner.shortcutImport.start,
      end: owner.shortcutImport.end,
      bytes: owner.shortcutImport.bytes,
      sha256: owner.shortcutImport.sha256,
    },
  )

  const shortcuts = []
  let inputGuide
  const visit = node => {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      node.tagName.getText(sourceFile) === owner.sourceShortcutComponent
    ) {
      shortcuts.push(node)
    }
    if (ts.isJsxAttribute(node) && node.name.text === 'inputGuide') {
      inputGuide = node
    }
    ts.forEachChild(node, visit)
  }
  visit(dialog.declaration)
  assert.equal(shortcuts.length, owner.sourceShortcutCount)
  assert(inputGuide)
  const inputStart = inputGuide.getStart(sourceFile)
  const inputEnd = inputGuide.getEnd()
  const inputValue = source.slice(inputStart, inputEnd)
  assert.deepEqual(
    {
      start: inputStart,
      end: inputEnd,
      ...descriptor(inputValue),
      chars: inputValue.length,
    },
    owner.inputGuide,
  )

  const stringValues = []
  const propertyValues = []
  const collect = node => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      node.kind === ts.SyntaxKind.TemplateHead ||
      node.kind === ts.SyntaxKind.TemplateMiddle ||
      node.kind === ts.SyntaxKind.TemplateTail
    ) {
      stringValues.push(node.text)
    }
    if (node.kind === ts.SyntaxKind.JsxText) {
      stringValues.push(
        node.text
          .replaceAll('&apos;', "'")
          .replace(/\s+/g, ' ')
          .trim(),
      )
    }
    if (ts.isBindingElement(node)) {
      propertyValues.push((node.propertyName ?? node.name).getText(sourceFile))
    }
    ts.forEachChild(node, collect)
  }
  collect(dialog.declaration)
  for (const row of fixture.ownerResidues.rows) {
    const [, kind, value] = row
    if (kind === 'property') {
      assert.ok(propertyValues.includes(value), value)
    } else {
      const normalized = value.replace(/\s+/g, ' ').trim()
      assert.ok(
        stringValues.some(candidate => candidate === value || candidate === normalized),
        value,
      )
    }
  }

  const keyboardInput = fixture.keyboardShortcutDependency.packagedSource
  const keyboardPath = resolveSourcePath(keyboardInput.path)
  const keyboardSource = fs.readFileSync(keyboardPath, 'utf8')
  assert.deepEqual(
    {
      bytes: Buffer.byteLength(keyboardSource),
      chars: keyboardSource.length,
      sha256: sha256(keyboardSource),
    },
    {
      bytes: keyboardInput.bytes,
      chars: keyboardInput.chars,
      sha256: keyboardInput.sha256,
    },
  )
  const keyboardFile = ts.createSourceFile(
    keyboardPath,
    keyboardSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(keyboardFile.parseDiagnostics.length, 0)
  const props = keyboardFile.statements.find(
    statement =>
      ts.isTypeAliasDeclaration(statement) && statement.name.text === 'Props',
  )
  assert(props)
  const propNames = props.type.members.map(member => member.name?.getText(keyboardFile))
  assert.ok(propNames.includes(keyboardInput.requiredProperty))
  assert.ok(!propNames.includes(keyboardInput.missingProperty))
  return { source, sourceFile }
}

test('Git source owns every residue but its shortcut dependency blocks replay', async () => {
  const owner = fixture.sourceOwner
  const source = gitShow(owner.commit, owner.path)
  assert.deepEqual(descriptor(source), { bytes: owner.bytes, sha256: owner.sha256 })
  assert.deepEqual(
    descriptor(gitShow(owner.commit, owner.commandIndex.path)),
    { bytes: owner.commandIndex.bytes, sha256: owner.commandIndex.sha256 },
  )
  assert.deepEqual(
    descriptor(gitShow(owner.commit, owner.noninteractiveDependency.path)),
    {
      bytes: owner.noninteractiveDependency.bytes,
      sha256: owner.noninteractiveDependency.sha256,
    },
  )
  assert.deepEqual(
    descriptor(
      gitShow(
        owner.commit,
        fixture.keyboardShortcutDependency.packagedSource.path,
      ),
    ),
    {
      bytes: fixture.keyboardShortcutDependency.packagedSource.bytes,
      sha256: fixture.keyboardShortcutDependency.packagedSource.sha256,
    },
  )

  const temporaryRoot = path.join(root, '.recovery-tmp/semantic-trees/2.1.119')
  await verifySourceRoot(temporaryRoot)

  const commandSource = gitShow(owner.commit, owner.commandIndex.path).toString()
  assert.equal(countOccurrences(commandSource, owner.commandIndex.lazyModule), 1)
  assert.equal(fixture.replayDecision.sourceReplayHelpers.length, 0)
})

test('Target120 evolution is stable in Target121 and cannot be backported', () => {
  const target = canonicalDescriptor(
    slicePinned(readPinned(fixture.inputs.targetBundle), fixture.targetUnit),
  )
  let laterCanonical
  for (const evolution of fixture.laterEvolution) {
    const input = fixture.inputs.laterBundles.find(
      candidate => candidate.version === evolution.version,
    )
    assert(input)
    const bundle = readPinned(input)
    const structural = ledger({
      path: input.ledgerPath,
      bytes: input.ledgerBytes,
      sha256: input.ledgerSha256,
    })
    assertRegion(structural, evolution)
    const unitBytes = slicePinned(bundle, evolution)
    const canonical = canonicalDescriptor(unitBytes)
    assert.deepEqual(canonical, {
      bytes: evolution.canonicalAstBytes,
      sha256: evolution.canonicalAstSha256,
    })
    laterCanonical ??= canonical
    assert.deepEqual(canonical, laterCanonical)
    const unit = parseUnit(unitBytes).body[0]
    assert.equal(
      walk(unit, node => node.type === 'Literal' && node.value === 'Auto').length,
      0,
    )
    assert.ok(
      walk(
        unit,
        node =>
          node.type === 'ConditionalExpression' &&
          node.consequent?.type === 'Literal' &&
          node.consequent.value === 'auto' &&
          node.alternate?.type === 'TemplateLiteral',
      ).length >= 2,
    )
  }
  assert.notDeepEqual(target, laterCanonical)
  const targetUnit = parseUnit(
    slicePinned(readPinned(fixture.inputs.targetBundle), fixture.targetUnit),
  ).body[0]
  assert.equal(
    walk(
      targetUnit,
      node => node.type === 'Literal' && node.value === fixture.uiContract.selectedAutoLabel,
    ).length,
    1,
  )
})

test(
  'latest packaged Target119 preserves the exact static source blocker',
  { skip: !configuredSourceRoot },
  async () => {
    await verifySourceRoot(configuredSourceRoot)
  },
)
