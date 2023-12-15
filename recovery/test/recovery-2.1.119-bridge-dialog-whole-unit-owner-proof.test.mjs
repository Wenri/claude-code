import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import { indexGeneratedBundle } from '../lib/structural-delta.mjs'
import * as ownerProofModule from '../cases/2.1.118-to-2.1.119/recovered/bridge-dialog-whole-unit-owner-overrides.mjs'
import {
  TARGET119_BRIDGE_DIALOG_WHOLE_UNIT_EVIDENCE_IDS,
  TARGET119_BRIDGE_DIALOG_WHOLE_UNIT_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/bridge-dialog-whole-unit-owner-overrides.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-bridge-dialog-whole-unit-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '92181f992540816a6ec8128dc56b636e27a1e8cc54fc88270260e3bece836bf9'
const configuredSourceRoot =
  process.env.CLAUDE_CODE_2_1_119_SOURCE_ROOT ??
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
const sourceRoot = configuredSourceRoot
  ? path.resolve(configuredSourceRoot)
  : path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src')

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
  return { bytes: Buffer.byteLength(value), sha256: sha256(value) }
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

function readLedger(input) {
  return JSON.parse(gunzipSync(readPinned(input)))
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
      nodeType: expected.nodeType ?? 'FunctionDeclaration',
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

function walk(node, predicate, values = []) {
  if (!node || typeof node !== 'object') return values
  if (predicate(node)) values.push(node)
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'loc', 'range', 'parent'].includes(key)) continue
    if (Array.isArray(value)) {
      for (const child of value) walk(child, predicate, values)
    } else {
      walk(value, predicate, values)
    }
  }
  return values
}

function countOffsets(value, needle) {
  const offsets = []
  let offset = -1
  while ((offset = value.indexOf(needle, offset + 1)) !== -1) {
    offsets.push(offset)
  }
  return offsets
}

function cacheFacts(value) {
  const ast = parse(value.toString(), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  })
  assert.equal(ast.body.length, 1)
  const declaration = ast.body[0].body.body[0].declarations[0]
  assert.equal(declaration.id.type, 'Identifier')
  assert.equal(declaration.init.type, 'CallExpression')
  assert.equal(declaration.init.arguments.length, 1)
  const binding = declaration.id.name
  const members = walk(
    ast,
    node =>
      node.type === 'MemberExpression' &&
      node.computed === true &&
      node.object.type === 'Identifier' &&
      node.object.name === binding &&
      node.property.type === 'Literal' &&
      Number.isInteger(node.property.value),
  )
  const indices = members.map(member => member.property.value)
  const unique = [...new Set(indices)].sort((left, right) => left - right)
  const counts = unique.map(index => [
    index,
    indices.filter(candidate => candidate === index).length,
  ])
  const serialized = JSON.stringify(counts)
  const size = declaration.init.arguments[0].value
  return {
    size,
    members: members.length,
    uniqueIndices: unique.length,
    minIndex: unique[0],
    maxIndex: unique.at(-1),
    missingIndices: Array.from({ length: size }, (_, index) => index).filter(
      index => !unique.includes(index),
    ),
    indexCountsBytes: Buffer.byteLength(serialized),
    indexCountsSha256: sha256(serialized),
  }
}

function normalizedTokens(unit) {
  return unit.tokens.map(token => {
    let value = token.raw
    if (token.label === 'name') {
      const identity = unit.identity.identifierAt.get(token.start)
      value = identity ? `@${identity.kind}` : `name:${token.raw}`
    }
    return [token.label, value]
  })
}

function setDescriptor(rows) {
  const serialized = JSON.stringify(rows)
  return {
    rows: rows.length,
    jsonBytes: Buffer.byteLength(serialized),
    sha256: sha256(serialized),
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

function gitShow(commit, filename) {
  const result = spawnSync('git', ['show', `${commit}:${filename}`], {
    cwd: root,
    encoding: null,
  })
  assert.equal(result.status, 0, result.stderr?.toString())
  return result.stdout
}

function inlineSourceMap(value) {
  const match = value.match(/\/\/# sourceMappingURL=data:[^,]+,([^\n]+)/)
  assert(match)
  return JSON.parse(Buffer.from(match[1], 'base64'))
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

function tsSource(ts, filename, value) {
  const sourceFile = ts.createSourceFile(
    filename,
    value,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, filename)
  return sourceFile
}

function tsDeclaration(ts, sourceFile, source, name) {
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
      name,
      start,
      end,
      chars: value.length,
      bytes: Buffer.byteLength(value),
      sha256: sha256(value),
    },
  }
}

function tsImport(ts, sourceFile, source, moduleName) {
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
    module: moduleName,
    start,
    end,
    bytes: Buffer.byteLength(value),
    sha256: sha256(value),
  }
}

function sliceSourcePinned(source, expected) {
  const value = source.slice(expected.start, expected.end)
  assert.deepEqual(descriptor(value), {
    bytes: expected.bytes,
    sha256: expected.sha256,
  })
  return value
}

test('Target119 BridgeDialog fixture exposes one static complete-unit override', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.118-to-2.1.119')
  assert.equal(fixture.summary.units, 1)
  assert.equal(fixture.summary.sourceReplayHelpers, 0)
  assert.equal(fixture.replayDecision.mode, 'static-only')
  assert.equal(fixture.replayDecision.graphClosed, false)
  assert.deepEqual(
    TARGET119_BRIDGE_DIALOG_WHOLE_UNIT_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
  assert.deepEqual(Object.keys(ownerProofModule).sort(), [
    'TARGET119_BRIDGE_DIALOG_WHOLE_UNIT_EVIDENCE_IDS',
    'TARGET119_BRIDGE_DIALOG_WHOLE_UNIT_OWNER_OVERRIDES',
  ])
  assert.deepEqual(
    TARGET119_BRIDGE_DIALOG_WHOLE_UNIT_OWNER_OVERRIDES.map(row => ({
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
        declarations: ['BridgeDialog'],
        evidenceIds: fixture.evidenceIds,
        behavior: fixture.ownerBehavior,
      },
    ],
  )
})

test('complete unit has exactly one normalized config-call delta and an inherited 96-slot footer graph', () => {
  const baselineBundle = readPinned(fixture.inputs.baselineBundle)
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const baselineLedger = readLedger(fixture.inputs.baselineStructuralLedger)
  const targetLedger = readLedger(fixture.inputs.targetStructuralLedger)
  assertRegion(baselineLedger, fixture.baselineUnit)
  assertRegion(targetLedger, fixture.targetUnit)
  const baselineUnit = slicePinned(baselineBundle, fixture.baselineUnit)
  const targetUnit = slicePinned(targetBundle, fixture.targetUnit)

  assert.deepEqual(cacheFacts(baselineUnit), fixture.cacheTopology.baseline)
  assert.deepEqual(cacheFacts(targetUnit), fixture.cacheTopology.target)
  for (const marker of fixture.inheritedContract.markers) {
    assert.deepEqual(countOffsets(baselineUnit.toString(), marker.value), marker.baselineLocalOffsets)
    assert.deepEqual(countOffsets(targetUnit.toString(), marker.value), marker.targetLocalOffsets)
  }

  const baselineIndex = indexGeneratedBundle(
    path.join(root, fixture.inputs.baselineBundle.path),
  )
  const targetIndex = indexGeneratedBundle(
    path.join(root, fixture.inputs.targetBundle.path),
  )
  const baselineTokens = normalizedTokens(
    baselineIndex.units[fixture.baselineUnit.targetIndex],
  )
  const targetTokens = normalizedTokens(
    targetIndex.units[fixture.targetUnit.targetIndex],
  )
  assert.deepEqual(setDescriptor(baselineTokens), {
    rows: fixture.wholeUnitDelta.baseline.tokens,
    jsonBytes: fixture.wholeUnitDelta.baseline.jsonBytes,
    sha256: fixture.wholeUnitDelta.baseline.sha256,
  })
  assert.deepEqual(setDescriptor(targetTokens), {
    rows: fixture.wholeUnitDelta.target.tokens,
    jsonBytes: fixture.wholeUnitDelta.target.jsonBytes,
    sha256: fixture.wholeUnitDelta.target.sha256,
  })
  const prefix = fixture.wholeUnitDelta.commonPrefixTokens
  assert.deepEqual(baselineTokens.slice(0, prefix), targetTokens.slice(0, prefix))
  assert.deepEqual(
    baselineTokens.slice(
      fixture.wholeUnitDelta.commonSuffixBaselineStart,
    ),
    targetTokens.slice(fixture.wholeUnitDelta.commonSuffixTargetStart),
  )
  assert.deepEqual(
    baselineTokens.slice(
      prefix,
      fixture.wholeUnitDelta.commonSuffixBaselineStart,
    ),
    fixture.wholeUnitDelta.baselineReplacement,
  )
  assert.deepEqual(
    targetTokens.slice(prefix, fixture.wholeUnitDelta.commonSuffixTargetStart),
    fixture.wholeUnitDelta.targetReplacement,
  )
  assert.equal(
    targetTokens.length - baselineTokens.length,
    fixture.wholeUnitDelta.netTokenIncrease,
  )
  const collapsedBaseline = [...baselineTokens]
  const collapsedTarget = [...targetTokens]
  collapsedBaseline.splice(prefix, 1, ['proof', 'CONFIG_UPDATER_CALL'])
  collapsedTarget.splice(prefix, 4, ['proof', 'CONFIG_UPDATER_CALL'])
  assert.deepEqual(collapsedTarget, collapsedBaseline)
  assert.deepEqual(setDescriptor(collapsedTarget), {
    rows: fixture.wholeUnitDelta.collapsed.tokens,
    jsonBytes: fixture.wholeUnitDelta.collapsed.jsonBytes,
    sha256: fixture.wholeUnitDelta.collapsed.sha256,
  })
  assert.equal(
    slicePinned(baselineBundle, fixture.wholeUnitDelta.baselineArgument).toString(),
    'Tt1',
  )
  assert.equal(
    slicePinned(targetBundle, fixture.wholeUnitDelta.targetArguments).toString(),
    '"remoteControlAtStartup",!1',
  )

  const dependencyBaseline = assertRegion(
    baselineLedger,
    fixture.keyboardShortcutDependency.baselineUnit,
  )
  const dependencyTarget = assertRegion(
    targetLedger,
    fixture.keyboardShortcutDependency.targetUnit,
  )
  assert.equal(dependencyTarget.baselineUnitIndex, dependencyBaseline.target.index)
  const baselineDependency = slicePinned(
    baselineBundle,
    fixture.keyboardShortcutDependency.baselineUnit,
  ).toString()
  const targetDependency = slicePinned(
    targetBundle,
    fixture.keyboardShortcutDependency.targetUnit,
  ).toString()
  for (const value of fixture.keyboardShortcutDependency.props) {
    assert.equal(countOffsets(baselineDependency, value).length > 0, true, value)
    assert.equal(countOffsets(targetDependency, value).length > 0, true, value)
  }
  assert.match(baselineDependency, /\.c\(12\)/)
  assert.match(targetDependency, /\.c\(12\)/)
  assert.match(targetDependency, /typeof [A-Za-z_$][\w$]*==="string"\?\[[A-Za-z_$][\w$]*\]:[A-Za-z_$][\w$]*/)
})

test('Target120 and Target121 retain the exact Target119 structural and footer shape', () => {
  for (const [position, inputNames] of [
    [0, ['target120Bundle', 'target120StructuralLedger']],
    [1, ['target121Bundle', 'target121StructuralLedger']],
  ]) {
    const expected = fixture.forwardUnits[position]
    const bundle = readPinned(fixture.inputs[inputNames[0]])
    const ledger = readLedger(fixture.inputs[inputNames[1]])
    assertRegion(ledger, expected)
    const unit = slicePinned(bundle, expected).toString()
    assert.equal(expected.tokenCount, fixture.targetUnit.tokenCount)
    assert.equal(expected.coarseHash, fixture.targetUnit.coarseHash)
    for (const marker of fixture.inheritedContract.markers) {
      assert.deepEqual(
        countOffsets(unit, marker.value),
        marker.forwardLocalOffsets,
      )
    }
  }
})

test('all owner residues, sole source owner, and coverage evolution are atomic', () => {
  const report = JSON.parse(
    fs.readFileSync(path.join(root, fixture.inputs.targetReport.path)),
  )
  const ownerRows = report.sourceRuntimeOwnerResidueRows.filter(
    row => row.structural.index === fixture.targetUnit.targetIndex,
  )
  const addedRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
    row => row.structural.index === fixture.targetUnit.targetIndex,
  )
  const ownerIdentities = ownerRows.map(sourceRowIdentity)
  const addedIdentities = addedRows.map(sourceRowIdentity)
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
  assert.equal(
    sha256(JSON.stringify([...new Set(addedRows.map(row => row.structural.index))])),
    fixture.ownerResidues.added.indexSha256,
  )
  for (const row of ownerRows) {
    assert.deepEqual(row.ownerPaths, ['components/BridgeDialog.tsx'])
    assert.equal(row.disposition, 'source-runtime-covered')
  }

  const allOwners = JSON.parse(readPinned(fixture.inputs.allOwners))
  const attribution = allOwners.rows.find(
    row => row.targetIndex === fixture.targetUnit.targetIndex,
  )
  assert(attribution)
  assert.deepEqual(
    attribution.owners.map(row => [row.source, row.score]),
    fixture.attribution.owners,
  )
  assert.deepEqual(
    attribution.candidateOwners.map(row => [row.source, row.score]),
    fixture.attribution.candidateOwners,
  )
  assert.equal(attribution.semanticOwnership, fixture.attribution.semanticOwnership)
  assert.equal(attribution.sourceHash, fixture.targetUnit.sha256)
  assert.equal(attribution.coarseHash, fixture.targetUnit.coarseHash)

  const coverage = JSON.parse(
    gunzipSync(
      fs.readFileSync(
        path.join(
          root,
          'recovery/cases/2.1.118-to-2.1.119/semantic/source-coverage.json.gz',
        ),
      ),
    ),
  )
  const coverageRow = coverage.rows.find(
    row => row.targetIndex === fixture.targetUnit.targetIndex,
  )
  assert(coverageRow)
  assert.deepEqual(coverageRow.ownerIds, fixture.coverageEvolution.ownerIds)
  const provisional = fixture.coverageEvolution.provisionalEvidenceIds
  const corrected = fixture.coverageEvolution.correctedEvidenceIds
  const state = JSON.stringify(coverageRow.evidenceIds)
  assert(
    state === JSON.stringify(provisional) || state === JSON.stringify(corrected),
    `unexpected u20251 coverage evidence: ${state}`,
  )
  if (state === JSON.stringify(corrected)) {
    assert.equal(coverageRow.behavior, fixture.ownerBehavior)
    assert.deepEqual(
      corrected.map(id => coverage.evidence.find(row => row.id === id)),
      fixture.evidenceCatalog,
    )
  } else {
    assert.equal(
      corrected.some(id => coverage.evidence.some(row => row.id === id)),
      false,
      'the exact BridgeDialog evidence catalog must not be partially wired',
    )
  }
})

test('historical source authenticates BridgeDialog but fails the target dependency graph closed', async () => {
  const ts = await loadTypeScript()
  const bridgePath = path.join(sourceRoot, fixture.sourceOwner.path.slice(4))
  const keyboardPath = path.join(sourceRoot, fixture.sourceDependency.path.slice(4))
  const bridge = fs.readFileSync(bridgePath, 'utf8')
  const keyboard = fs.readFileSync(keyboardPath, 'utf8')
  assert.deepEqual(sourceDescriptor(bridge), fixture.sourceOwner.generatedFile)
  assert.deepEqual(sourceDescriptor(keyboard), fixture.sourceDependency.generatedFile)
  assert.deepEqual(
    gitShow(fixture.sourceOwner.commit, fixture.sourceOwner.path),
    Buffer.from(bridge),
  )
  assert.deepEqual(
    gitShow(fixture.sourceOwner.commit, fixture.sourceDependency.path),
    Buffer.from(keyboard),
  )

  const bridgeAst = tsSource(ts, fixture.sourceOwner.path, bridge)
  const keyboardAst = tsSource(ts, fixture.sourceDependency.path, keyboard)
  const bridgeDeclaration = tsDeclaration(
    ts,
    bridgeAst,
    bridge,
    fixture.sourceOwner.declaration.name,
  )
  assert.deepEqual(bridgeDeclaration.descriptor, fixture.sourceOwner.declaration)
  assert.deepEqual(
    fixture.sourceOwner.imports.map(input =>
      tsImport(ts, bridgeAst, bridge, input.module),
    ),
    fixture.sourceOwner.imports,
  )
  const keyboardDeclaration = tsDeclaration(
    ts,
    keyboardAst,
    keyboard,
    fixture.sourceDependency.declaration.name,
  )
  assert.deepEqual(
    keyboardDeclaration.descriptor,
    fixture.sourceDependency.declaration,
  )

  assert.equal(
    sliceSourcePinned(bridge, fixture.sourceOwner.generatedFragments.cache),
    'const $ = _c(87);',
  )
  assert.equal(
    sliceSourcePinned(bridge, fixture.sourceOwner.generatedFragments.configCall),
    "setConfigValue('remoteControlAtStartup', false);",
  )
  assert.equal(
    sliceSourcePinned(bridge, fixture.sourceOwner.generatedFragments.manualFooter),
    '<Text dimColor={true}>d to disconnect · space for QR code · Enter/Esc to close</Text>',
  )
  const calls = walk(bridgeAst, node => ts.isCallExpression(node))
  const configCalls = calls.filter(
    call => ts.isIdentifier(call.expression) && call.expression.text === 'setConfigValue',
  )
  assert.equal(configCalls.length, 1)
  assert.equal(configCalls[0].arguments[0].text, 'remoteControlAtStartup')
  assert.equal(configCalls[0].arguments[1].kind, ts.SyntaxKind.FalseKeyword)
  assert.equal(
    calls.some(call => ts.isIdentifier(call.expression) && call.expression.text === 'basename'),
    true,
  )
  assert.equal(
    calls.some(call => ts.isIdentifier(call.expression) && call.expression.text === 'qrToString'),
    true,
  )
  const bridgeIdentifiers = new Set(
    walk(bridgeAst, node => ts.isIdentifier(node)).map(node => node.text),
  )
  assert.equal(bridgeIdentifiers.has('KeyboardShortcutHint'), false)
  assert.equal(bridgeIdentifiers.has('Byline'), false)

  const bridgeMap = inlineSourceMap(bridge)
  assert.deepEqual(bridgeMap.sources, fixture.sourceOwner.sourceMap.sources)
  assert.equal(bridgeMap.names.length, fixture.sourceOwner.sourceMap.names)
  assert.deepEqual(descriptor(bridgeMap.mappings), {
    bytes: fixture.sourceOwner.sourceMap.mappingsBytes,
    sha256: fixture.sourceOwner.sourceMap.mappingsSha256,
  })
  const bridgeAuthored = bridgeMap.sourcesContent[0]
  assert.deepEqual(
    sourceDescriptor(bridgeAuthored),
    fixture.sourceOwner.sourceMap.authoredContent,
  )
  assert.match(
    sliceSourcePinned(
      bridgeAuthored,
      fixture.sourceOwner.sourceMap.authoredUpdater,
    ),
    /^saveGlobalConfig\(current =>/,
  )
  assert.equal(
    sliceSourcePinned(
      bridgeAuthored,
      fixture.sourceOwner.sourceMap.authoredFooter,
    ),
    'd to disconnect · space for QR code · Enter/Esc to close',
  )
  assert.equal(bridgeMap.names.includes('basename'), true)
  assert.equal(bridgeMap.names.includes('toString'), true)
  assert.equal(bridgeMap.names.includes('qrToString'), true)
  assert.equal(bridgeMap.names.includes('BridgeDialog'), true)
  assert.equal(bridgeMap.names.includes('saveGlobalConfig'), true)

  const props = keyboardAst.statements.find(
    statement =>
      ts.isTypeAliasDeclaration(statement) && statement.name.text === 'Props',
  )
  assert(props)
  const propsStart = props.getStart(keyboardAst)
  const propsEnd = props.getEnd()
  const propsSource = keyboard.slice(propsStart, propsEnd)
  assert.deepEqual(
    {
      start: propsStart,
      end: propsEnd,
      chars: propsSource.length,
      bytes: Buffer.byteLength(propsSource),
      sha256: sha256(propsSource),
      keys: props.type.members.map(member => member.name.text),
    },
    fixture.sourceDependency.props,
  )
  assert.equal(
    sliceSourcePinned(keyboard, fixture.sourceDependency.generatedCache),
    'const $ = _c(9);',
  )
  const keyboardMap = inlineSourceMap(keyboard)
  assert.deepEqual(keyboardMap.sources, fixture.sourceDependency.sourceMap.sources)
  assert.equal(keyboardMap.names.length, fixture.sourceDependency.sourceMap.names)
  assert.deepEqual(descriptor(keyboardMap.mappings), {
    bytes: fixture.sourceDependency.sourceMap.mappingsBytes,
    sha256: fixture.sourceDependency.sourceMap.mappingsSha256,
  })
  const keyboardAuthored = keyboardMap.sourcesContent[0]
  assert.deepEqual(
    sourceDescriptor(keyboardAuthored),
    fixture.sourceDependency.sourceMap.authoredContent,
  )
  sliceSourcePinned(
    keyboardAuthored,
    fixture.sourceDependency.sourceMap.authoredProps,
  )

  assert.equal(fixture.replayDecision.bridgeTargetCacheSize, 96)
  assert.equal(fixture.replayDecision.bridgeSourceCacheSize, 87)
  assert.equal(fixture.replayDecision.keyboardTargetCacheSize, 12)
  assert.equal(fixture.replayDecision.keyboardSourceCacheSize, 9)
  assert.equal(props.type.members.some(member => member.name.text === 'chord'), false)
  assert.equal(props.type.members.some(member => member.name.text === 'shortcut'), true)
  assert.equal(fixture.replayDecision.sourceReplayHelpers.length, 0)
  assert.equal(
    fs.existsSync(
      path.join(
        root,
        'recovery/cases/2.1.118-to-2.1.119/recovered/replay-bridge-dialog-whole-unit-source-gap.mjs',
      ),
    ),
    false,
  )
})
