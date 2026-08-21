import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { createRequire } from 'node:module'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET119_REMOTE_SESSION_ACTION_DISPATCH_EVIDENCE_IDS,
  TARGET119_REMOTE_SESSION_ACTION_DISPATCH_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/remote-session-action-dispatch-owner-overrides.mjs'

const root = process.cwd()
const require = createRequire(import.meta.url)
const ts = require(
  path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  ),
)
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-remote-session-action-dispatch-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '357b6b67c4d820611c578dc58e891dc00f6cd7f7466c036503cfeb22814c7675'
const RECOVERED_TARGET_REPL = Object.freeze({
  path: 'src/screens/REPL.tsx',
  chars: 908834,
  bytes: 909236,
  sha256: '1f80c57ab7ad18b2ace737e30fd24718e30e9d301d9fa82b24feb0414781c38d',
  declaration: Object.freeze({
    start: 38309,
    end: 271016,
    chars: 232707,
    bytes: 233049,
    sha256: '4f251b5cea8b714c94db78b67a211be04b092f735d42069ff10981d2c4beb71e',
  }),
  state: Object.freeze({
    start: 82086,
    end: 82168,
    bytes: 82,
    sha256: 'd69a7f774463edf0bb36fab4a95cf89f6ec627e5d1a020688d5962de005847ae',
  }),
  hookCall: Object.freeze({
    start: 82349,
    end: 82674,
    bytes: 325,
    sha256: 'a953e2422be98a390d617f284ce371ce1cb899be384e299412688f8be8ec8312',
  }),
  hookSetterProperty: Object.freeze({
    start: 82598,
    end: 82621,
    bytes: 23,
    sha256: 'c1d81f1ecd2b09c30439227502fa3e7e08719d2b04e58a368cae1e47a53b93ff',
  }),
  toolContextSetterProperty: Object.freeze({
    start: 137655,
    end: 137678,
    bytes: 23,
    sha256: 'c1d81f1ecd2b09c30439227502fa3e7e08719d2b04e58a368cae1e47a53b93ff',
  }),
})
const configuredSourceRoot =
  process.env.CLAUDE_CODE_2_1_119_SOURCE_ROOT ??
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
const sourceRoot = configuredSourceRoot
  ? path.resolve(configuredSourceRoot)
  : path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src')

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

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

function assertRegion(ledger, expected) {
  const region = ledger.regions.find(
    candidate => candidate.target.index === expected.targetIndex,
  )
  assert.ok(region, `u${expected.targetIndex}`)
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
      unknownFreeIdentifierCount: region.unknownFreeIdentifierCount,
      ...(region.baselineUnitIndex == null
        ? {}
        : {
            baselineUnitIndex: region.baselineUnitIndex,
            pairReason: region.pairReason,
          }),
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
      unknownFreeIdentifierCount: expected.unknownFreeIdentifierCount,
      ...(expected.baselineUnitIndex == null
        ? {}
        : {
            baselineUnitIndex: expected.baselineUnitIndex,
            pairReason: expected.pairReason,
          }),
    },
  )
  return region
}

function walk(node, predicate, values = [], parent = null, parentKey = null) {
  if (!node || typeof node !== 'object') return values
  if (predicate(node, parent, parentKey)) {
    values.push({ node, parent, parentKey })
  }
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'loc', 'range', 'raw'].includes(key)) continue
    if (Array.isArray(value)) {
      for (const child of value) walk(child, predicate, values, node, key)
    } else {
      walk(value, predicate, values, node, key)
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

function canonicalDescriptor(ast) {
  const value = JSON.stringify(canonicalAst(ast))
  return { jsonBytes: Buffer.byteLength(value), sha256: sha256(value) }
}

function parseUnit(value) {
  return parse(value.toString(), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  }).body[0]
}

function nodeDescriptor(source, node, absoluteStart = 0) {
  const value = source.slice(node.start, node.end)
  return {
    start: absoluteStart + node.start,
    end: absoluteStart + node.end,
    bytes: Buffer.byteLength(value),
    sha256: sha256(value),
  }
}

function actionCalls(unit, source, absoluteStart) {
  const properties = walk(
    unit,
    node =>
      node.type === 'Property' &&
      node.computed === false &&
      node.key?.name === 'action' &&
      node.value?.type === 'Literal',
  )
  return properties.map(({ node: property }) => {
    const objects = walk(
      unit,
      candidate =>
        candidate.type === 'ObjectExpression' &&
        candidate.start <= property.start &&
        candidate.end >= property.end,
    ).map(entry => entry.node)
    const object = objects.sort(
      (left, right) => left.end - left.start - (right.end - right.start),
    )[0]
    const calls = walk(
      unit,
      candidate =>
        candidate.type === 'CallExpression' &&
        candidate.start <= object.start &&
        candidate.end >= object.end,
    ).map(entry => entry.node)
    const call = calls.sort(
      (left, right) => left.end - left.start - (right.end - right.start),
    )[0]
    return {
      action: property.value.value,
      node: call,
      ...nodeDescriptor(source, call, absoluteStart),
    }
  })
}

function orderedObjectKeys(object) {
  return object.properties.map(
    property => property.key?.name ?? property.key?.value ?? null,
  )
}

function jsonDescriptor(value) {
  const serialized = JSON.stringify(value)
  return { jsonBytes: Buffer.byteLength(serialized), sha256: sha256(serialized) }
}

function gitText(commit, filePath) {
  const result = spawnSync('git', ['show', `${commit}:${filePath}`], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout
}

function gitBlob(commit, filePath) {
  const result = spawnSync('git', ['rev-parse', `${commit}:${filePath}`], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function parseTs(filePath, text) {
  const source = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(source.parseDiagnostics.length, 0)
  return source
}

function tsNodes(node, values = []) {
  values.push(node)
  node.forEachChild(child => {
    tsNodes(child, values)
  })
  return values
}

function tsDescriptor(source, node) {
  const start = node.getStart(source)
  const end = node.end
  const value = source.text.slice(start, end)
  return {
    start,
    end,
    chars: end - start,
    bytes: Buffer.byteLength(value),
    sha256: sha256(value),
  }
}

function assertTsDescriptor(source, node, expected) {
  const actual = tsDescriptor(source, node)
  assert.deepEqual(
    actual,
    {
      start: expected.start,
      end: expected.end,
      chars: expected.chars ?? expected.end - expected.start,
      bytes: expected.bytes,
      sha256: expected.sha256,
    },
  )
}

function findTsCalls(source, name) {
  return tsNodes(source).filter(
    node =>
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === name,
  )
}

function assertSourceFile(value, expected) {
  assert.deepEqual(sourceDescriptor(value), {
    chars: expected.chars,
    bytes: expected.bytes,
    sha256: expected.sha256,
  })
}

test('pins immutable inputs and exposes fail-closed static owner wiring', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  readPinned(fixture.inputs.ownerOverride)
  for (const name of [
    'baselineBundle',
    'targetBundle',
    'target120Bundle',
    'target121Bundle',
    'baselineLedger',
    'targetLedger',
    'target120Ledger',
    'target121Ledger',
  ]) {
    readPinned(fixture.inputs[name])
  }
  assert.deepEqual(
    TARGET119_REMOTE_SESSION_ACTION_DISPATCH_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
  assert.equal(TARGET119_REMOTE_SESSION_ACTION_DISPATCH_OWNER_OVERRIDES.length, 1)
  const override = TARGET119_REMOTE_SESSION_ACTION_DISPATCH_OWNER_OVERRIDES[0]
  assert.deepEqual(
    {
      key: override.key,
      targetIndex: override.targetIndex,
      paths: override.paths,
      declarations: override.declarations,
      evidenceIds: override.evidenceIds,
    },
    {
      key: '2.1.118-to-2.1.119:20541',
      targetIndex: 20541,
      paths: ['src/hooks/useRemoteSession.ts'],
      declarations: ['useRemoteSession'],
      evidenceIds: fixture.evidenceIds,
    },
  )
  assert.match(override.behavior, /static whole-unit owner proof only/)
  assert.match(override.behavior, /never authorizes source replay/)
  assert.equal(fixture.inputs.observedReport.mutableAfterCorrection, true)
  assert.equal(fixture.inputs.observedCoverage.mutableAfterCorrection, true)
})

test('freezes the complete historical row partition without a mutable report dependency', () => {
  const ownerRows = fixture.residueSnapshot.ownerRows
  const addedRows = fixture.residueSnapshot.addedOwnerRows
  assert.equal(ownerRows.tuples.length, ownerRows.count)
  assert.deepEqual(jsonDescriptor(ownerRows.tuples), {
    jsonBytes: ownerRows.jsonBytes,
    sha256: ownerRows.sha256,
  })
  assert.equal(addedRows.tuples.length, addedRows.count)
  assert.deepEqual(jsonDescriptor(addedRows.tuples), {
    jsonBytes: addedRows.jsonBytes,
    sha256: addedRows.sha256,
  })
  assert.deepEqual(
    ownerRows.tuples.filter(tuple => tuple[7]),
    addedRows.tuples,
  )
  assert.deepEqual(
    addedRows.tuples.map(tuple => [tuple[2], tuple[3], tuple[4]]),
    [
      ['remove', 12431022, 12431030],
      ['clear', 12433377, 12433384],
    ],
  )
  for (const name of ['rawReportRows', 'unclassifiedRows']) {
    assert.deepEqual(jsonDescriptor([]), {
      jsonBytes: fixture.residueSnapshot[name].jsonBytes,
      sha256: fixture.residueSnapshot[name].sha256,
    })
  }
})

test('authenticates the predecessor and target whole units and partitions retained remove from new preflight clear', () => {
  const baselineLedger = readLedger(fixture.inputs.baselineLedger)
  const targetLedger = readLedger(fixture.inputs.targetLedger)
  assertRegion(baselineLedger, fixture.wholeUnits.baseline)
  assertRegion(targetLedger, fixture.wholeUnits.target)
  const baselineBundle = readPinned(fixture.inputs.baselineBundle)
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const baselineBytes = slicePinned(baselineBundle, fixture.wholeUnits.baseline)
  const targetBytes = slicePinned(targetBundle, fixture.wholeUnits.target)
  const baselineUnit = parseUnit(baselineBytes)
  const targetUnit = parseUnit(targetBytes)
  assert.deepEqual(canonicalDescriptor(baselineUnit), {
    jsonBytes: fixture.wholeUnits.baseline.canonicalJsonBytes,
    sha256: fixture.wholeUnits.baseline.canonicalSha256,
  })
  assert.deepEqual(canonicalDescriptor(targetUnit), {
    jsonBytes: fixture.wholeUnits.target.canonicalJsonBytes,
    sha256: fixture.wholeUnits.target.canonicalSha256,
  })

  const baselineCalls = actionCalls(
    baselineUnit,
    baselineBytes.toString(),
    fixture.wholeUnits.baseline.start,
  )
  const targetCalls = actionCalls(
    targetUnit,
    targetBytes.toString(),
    fixture.wholeUnits.target.start,
  )
  assert.deepEqual(
    baselineCalls.map(({ action, start, end, bytes, sha256 }) => ({
      action,
      start,
      end,
      bytes,
      sha256,
    })),
    fixture.actionDelta.baselineCalls,
  )
  assert.deepEqual(
    targetCalls.map(({ action, start, end, bytes, sha256 }) => ({
      action,
      start,
      end,
      bytes,
      sha256,
    })),
    fixture.actionDelta.targetCalls,
  )
  assert.deepEqual(
    jsonDescriptor(baselineCalls.map(call => call.action)),
    {
      jsonBytes: fixture.actionDelta.baselineSequence.jsonBytes,
      sha256: fixture.actionDelta.baselineSequence.sha256,
    },
  )
  assert.deepEqual(
    jsonDescriptor(targetCalls.map(call => call.action)),
    {
      jsonBytes: fixture.actionDelta.targetSequence.jsonBytes,
      sha256: fixture.actionDelta.targetSequence.sha256,
    },
  )
  for (const action of ['clear', 'remove', 'add']) {
    const baselineCall = baselineCalls.find(call => call.action === action)
    const targetCall = targetCalls.find(call => call.action === action)
    assert.deepEqual(
      canonicalDescriptor(baselineCall.node),
      fixture.actionDelta.canonicalCalls[action],
    )
    assert.deepEqual(
      canonicalDescriptor(targetCall.node),
      fixture.actionDelta.canonicalCalls[action],
    )
  }
  assert.equal(
    walk(baselineUnit, node => node.type === 'Identifier' && node.name === 'preflightCheck')
      .length,
    fixture.actionDelta.preflightFailure.baselinePreflightIdentifierCount,
  )
  assert.equal(
    walk(targetUnit, node => node.type === 'Identifier' && node.name === 'preflightCheck')
      .length,
    fixture.actionDelta.preflightFailure.targetPreflightIdentifierCount,
  )
  const preflight = slicePinned(
    targetBundle,
    fixture.actionDelta.preflightFailure,
  ).toString()
  for (const fragment of [
    'preflightCheck?.catch',
    '.disconnect()',
    '.current=null',
    '"disconnected"',
    '.current.clear()',
    '{action:"clear"}',
  ]) {
    assert.ok(preflight.includes(fragment), fragment)
  }
  for (const literal of fixture.actionDelta.addedLiteralSlices) {
    assert.equal(slicePinned(targetBundle, literal).toString(), `"${literal.value}"`)
  }
  assert.equal(
    fixture.actionDelta.addedLiteralSlices[0].classification,
    'retained-global-occurrence-drift',
  )
  assert.equal(
    fixture.actionDelta.addedLiteralSlices[1].classification,
    'target119-preflight-teardown',
  )
})

test('proves the target unit continues unchanged through Target121', () => {
  const expectedCanonical = {
    jsonBytes: fixture.wholeUnits.target.canonicalJsonBytes,
    sha256: fixture.wholeUnits.target.canonicalSha256,
  }
  for (const [release, ledgerInput, bundleInput] of [
    ['target120', fixture.inputs.target120Ledger, fixture.inputs.target120Bundle],
    ['target121', fixture.inputs.target121Ledger, fixture.inputs.target121Bundle],
  ]) {
    const expected = fixture.wholeUnits[release]
    assertRegion(readLedger(ledgerInput), expected)
    const value = slicePinned(readPinned(bundleInput), expected)
    assert.deepEqual(canonicalDescriptor(parseUnit(value)), expectedCanonical)
  }
})

test('authenticates the retained action dispatcher and both target caller consumers', () => {
  const baselineLedger = readLedger(fixture.inputs.baselineLedger)
  const targetLedger = readLedger(fixture.inputs.targetLedger)
  assertRegion(baselineLedger, fixture.callerBoundary.baselineUnit)
  assertRegion(targetLedger, fixture.callerBoundary.targetUnit)
  const baselineBundle = readPinned(fixture.inputs.baselineBundle)
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const baselineValue = slicePinned(
    baselineBundle,
    fixture.callerBoundary.baselineUnit,
  )
  const targetValue = slicePinned(targetBundle, fixture.callerBoundary.targetUnit)
  const baselineUnit = parseUnit(baselineValue)
  const targetUnit = parseUnit(targetValue)
  for (const [unit, value, absoluteStart, expected] of [
    [
      baselineUnit,
      baselineValue.toString(),
      fixture.callerBoundary.baselineUnit.start,
      fixture.callerBoundary.baselineDispatcher,
    ],
    [
      targetUnit,
      targetValue.toString(),
      fixture.callerBoundary.targetUnit.start,
      fixture.callerBoundary.targetDispatcher,
    ],
  ]) {
    const switches = walk(
      unit,
      node =>
        node.type === 'SwitchStatement' &&
        node.cases.map(entry => entry.test?.value).filter(Boolean).join(',') ===
          'add,remove,clear',
    ).map(entry => entry.node)
    assert.equal(switches.length, 1)
    const candidates = walk(
      unit,
      node =>
        node.type === 'VariableDeclarator' &&
        node.start <= switches[0].start &&
        node.end >= switches[0].end,
    ).map(entry => entry.node)
    const dispatcher = candidates.sort(
      (left, right) => left.end - left.start - (right.end - right.start),
    )[0]
    assert.deepEqual(nodeDescriptor(value, dispatcher, absoluteStart), expected)
    assert.deepEqual(
      canonicalDescriptor(dispatcher),
      fixture.callerBoundary.dispatcherCanonical,
    )
  }

  const baselineCalls = walk(
    baselineUnit,
    node =>
      node.type === 'CallExpression' &&
      node.arguments[0]?.type === 'ObjectExpression' &&
      orderedObjectKeys(node.arguments[0]).includes('recordApiMetricsEvent'),
  ).map(entry => entry.node)
  const targetCalls = walk(
    targetUnit,
    node =>
      node.type === 'CallExpression' &&
      node.arguments[0]?.type === 'ObjectExpression' &&
      orderedObjectKeys(node.arguments[0]).includes('recordApiMetricsEvent'),
  ).map(entry => entry.node)
  assert.equal(baselineCalls.length, 1)
  assert.equal(targetCalls.length, 1)
  assert.deepEqual(
    nodeDescriptor(
      baselineValue.toString(),
      baselineCalls[0],
      fixture.callerBoundary.baselineUnit.start,
    ),
    fixture.callerBoundary.baselineHookCall,
  )
  assert.deepEqual(
    nodeDescriptor(
      targetValue.toString(),
      targetCalls[0],
      fixture.callerBoundary.targetUnit.start,
    ),
    fixture.callerBoundary.targetHookCall,
  )
  assert.deepEqual(
    canonicalDescriptor(baselineCalls[0]),
    fixture.callerBoundary.hookCallCanonical,
  )
  assert.deepEqual(
    canonicalDescriptor(targetCalls[0]),
    fixture.callerBoundary.hookCallCanonical,
  )
  assert.deepEqual(
    jsonDescriptor(orderedObjectKeys(targetCalls[0].arguments[0])),
    {
      jsonBytes: fixture.callerBoundary.orderedHookProperties.jsonBytes,
      sha256: fixture.callerBoundary.orderedHookProperties.sha256,
    },
  )
  slicePinned(targetBundle, fixture.callerBoundary.targetHookDispatcherProperty)
  slicePinned(
    targetBundle,
    fixture.callerBoundary.targetToolContextDispatcherProperty,
  )
  const context = slicePinned(
    targetBundle,
    fixture.callerBoundary.targetToolContextObject,
  ).toString()
  assert.ok(context.includes('setInProgressToolUseIDs:JKH'))

  const reduce = (state, action) => {
    if (action.action === 'add') return new Set([...state, ...action.ids])
    if (action.action === 'remove') {
      const next = new Set(state)
      for (const id of action.ids) next.delete(id)
      return next.size === state.size ? state : next
    }
    if (action.action === 'clear') return state.size > 0 ? new Set() : state
    throw new Error('unreachable')
  }
  const original = new Set(['a', 'b'])
  assert.deepEqual([...reduce(original, { action: 'add', ids: ['b', 'c'] })], [
    'a',
    'b',
    'c',
  ])
  assert.deepEqual([...reduce(original, { action: 'remove', ids: ['b'] })], ['a'])
  assert.equal(reduce(original, { action: 'remove', ids: ['missing'] }), original)
  assert.deepEqual([...reduce(original, { action: 'clear' })], [])
  const empty = new Set()
  assert.equal(reduce(empty, { action: 'clear' }), empty)
})

test('proves authored source is a stale and incomplete replay graph', () => {
  for (const expected of fixture.sourceBoundary.hookLineage) {
    const value = gitText(expected.commit, fixture.sourceBoundary.targetHook.path)
    assert.equal(
      gitBlob(expected.commit, fixture.sourceBoundary.targetHook.path),
      expected.blob,
    )
    assertSourceFile(value, expected)
  }

  const targetHookExpected = fixture.sourceBoundary.hookLineage.find(
    entry => entry.release === '2.1.119',
  )
  const targetHookText = gitText(
    targetHookExpected.commit,
    fixture.sourceBoundary.targetHook.path,
  )
  const targetHookSource = parseTs(
    fixture.sourceBoundary.targetHook.path,
    targetHookText,
  )
  const targetHookNodes = tsNodes(targetHookSource)
  const props = targetHookNodes.find(
    node => ts.isTypeAliasDeclaration(node) && node.name.text === 'UseRemoteSessionProps',
  )
  const declaration = targetHookNodes.find(
    node => ts.isFunctionDeclaration(node) && node.name?.text === 'useRemoteSession',
  )
  const actionProp = props.type.members.find(
    node => node.name?.getText(targetHookSource) === 'setInProgressToolUseIDs',
  )
  assertTsDescriptor(targetHookSource, props, fixture.sourceBoundary.targetHook.props)
  assertTsDescriptor(
    targetHookSource,
    actionProp,
    fixture.sourceBoundary.targetHook.actionProp,
  )
  assertTsDescriptor(
    targetHookSource,
    declaration,
    fixture.sourceBoundary.targetHook.declaration,
  )
  const propNames = props.type.members.map(node => node.name?.getText(targetHookSource))
  assert.deepEqual(propNames, fixture.sourceBoundary.targetHook.orderedPropNames)
  assert.deepEqual(jsonDescriptor(propNames), {
    jsonBytes: fixture.sourceBoundary.targetHook.propNamesJsonBytes,
    sha256: fixture.sourceBoundary.targetHook.propNamesSha256,
  })
  const targetSourceCalls = findTsCalls(targetHookSource, 'setInProgressToolUseIDs')
  assert.deepEqual(
    targetSourceCalls.map(node => tsDescriptor(targetHookSource, node)),
    fixture.sourceBoundary.targetHook.actionCalls.map(expected => ({
      start: expected.start,
      end: expected.end,
      chars: expected.end - expected.start,
      bytes: expected.bytes,
      sha256: expected.sha256,
    })),
  )
  assert.equal(targetHookText.match(/action\s*:/g)?.length ?? 0, 0)
  assert.equal(targetSourceCalls.length, 5)
  const preflight = targetHookNodes.find(
    node =>
      ts.isCallExpression(node) &&
      node.expression.getText(targetHookSource).endsWith('preflightCheck?.catch'),
  )
  assertTsDescriptor(
    targetHookSource,
    preflight,
    fixture.sourceBoundary.targetHook.preflightCall,
  )

  const target121Expected = fixture.sourceBoundary.hookLineage.find(
    entry => entry.release === '2.1.121',
  )
  const target121Text = gitText(
    target121Expected.commit,
    fixture.sourceBoundary.targetHook.path,
  )
  const target121Source = parseTs(
    fixture.sourceBoundary.targetHook.path,
    target121Text,
  )
  const target121Nodes = tsNodes(target121Source)
  const target121Calls = findTsCalls(target121Source, 'setInProgressToolUseIDs')
  assert.deepEqual(
    target121Calls.map(node => tsDescriptor(target121Source, node)),
    fixture.sourceBoundary.target121PartialMigration.actionCalls.map(expected => ({
      start: expected.start,
      end: expected.end,
      chars: expected.end - expected.start,
      bytes: expected.bytes,
      sha256: expected.sha256,
    })),
  )
  const target121Props = target121Nodes.find(
    node => ts.isTypeAliasDeclaration(node) && node.name.text === 'UseRemoteSessionProps',
  )
  const target121ActionProp = target121Props.type.members.find(
    node => node.name?.getText(target121Source) === 'setInProgressToolUseIDs',
  )
  assertTsDescriptor(
    target121Source,
    target121ActionProp,
    fixture.sourceBoundary.target121PartialMigration.actionProp,
  )
  assert.equal(
    target121Calls.filter(node => node.getText(target121Source).includes('{ action:')).length,
    4,
  )
  assert.ok(target121Calls.at(-1).getText(target121Source).includes('prev =>'))

  for (const expected of Object.values(
    fixture.sourceBoundary.toolContextTypeLineage,
  )) {
    const value = gitText(expected.commit, expected.path)
    assert.equal(gitBlob(expected.commit, expected.path), expected.blob)
    assertSourceFile(value, expected)
    const source = parseTs(expected.path, value)
    const nodes = tsNodes(source)
    const property = nodes.find(
      node =>
        ts.isPropertySignature(node) &&
        node.name.getText(source) === 'setInProgressToolUseIDs',
    )
    assertTsDescriptor(source, property, expected.actionProp)
    if (expected.actionTypeDeclarationCount != null) {
      assert.equal(
        nodes.filter(
          node =>
            ts.isTypeAliasDeclaration(node) &&
            node.name.text === 'InProgressToolUseIDsAction',
        ).length,
        expected.actionTypeDeclarationCount,
      )
    }
  }
})

function assertTargetSourceRoot() {
  const resolveSourcePath = relativePath => {
    const direct = path.join(sourceRoot, relativePath)
    if (fs.existsSync(direct)) return direct
    const withoutSrc = path.join(sourceRoot, relativePath.replace(/^src\//, ''))
    assert.ok(fs.existsSync(withoutSrc), relativePath)
    return withoutSrc
  }
  const targetHookExpected = fixture.sourceBoundary.hookLineage.find(
    entry => entry.release === '2.1.119',
  )
  const hookText = fs.readFileSync(
    resolveSourcePath(fixture.sourceBoundary.targetHook.path),
    'utf8',
  )
  assertSourceFile(hookText, targetHookExpected)
  const hookSource = parseTs(fixture.sourceBoundary.targetHook.path, hookText)
  const hookNodes = tsNodes(hookSource)
  const declaration = hookNodes.find(
    node => ts.isFunctionDeclaration(node) && node.name?.text === 'useRemoteSession',
  )
  assertTsDescriptor(
    hookSource,
    declaration,
    fixture.sourceBoundary.targetHook.declaration,
  )

  const historicalRepl = fixture.sourceBoundary.targetRepl
  const replText = fs.readFileSync(resolveSourcePath(historicalRepl.path), 'utf8')
  const replDescriptor = sourceDescriptor(replText)
  const replExpected = [historicalRepl, RECOVERED_TARGET_REPL].find(
    candidate =>
      candidate.chars === replDescriptor.chars &&
      candidate.bytes === replDescriptor.bytes &&
      candidate.sha256 === replDescriptor.sha256,
  )
  assert.ok(
    replExpected,
    `unrecognized Target119 REPL phase: ${JSON.stringify(replDescriptor)}`,
  )
  assertSourceFile(replText, replExpected)
  const replSource = parseTs(replExpected.path, replText)
  const replNodes = tsNodes(replSource)
  const state = replNodes.find(
    node =>
      ts.isVariableDeclaration(node) &&
      node.name.getText(replSource).includes('inProgressToolUseIDs'),
  )
  const hookCall = replNodes.find(
    node =>
      ts.isCallExpression(node) && node.expression.getText(replSource) === 'useRemoteSession',
  )
  assertTsDescriptor(replSource, state, replExpected.state)
  assertTsDescriptor(replSource, hookCall, replExpected.hookCall)
  assert.equal(hookCall.getText(replSource).includes('recordApiMetricsEvent'), false)
  const setterProperties = replNodes.filter(
    node =>
      (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) &&
      node.name.getText(replSource) === 'setInProgressToolUseIDs',
  )
  assert.equal(setterProperties.length, 2)
  assertTsDescriptor(replSource, setterProperties[0], replExpected.hookSetterProperty)
  assertTsDescriptor(
    replSource,
    setterProperties[1],
    replExpected.toolContextSetterProperty,
  )

  const configExpected = fixture.sourceBoundary.configLineage.target
  const configText = fs.readFileSync(resolveSourcePath(configExpected.path), 'utf8')
  assert.deepEqual(descriptor(configText), {
    bytes: configExpected.bytes,
    sha256: configExpected.sha256,
  })
  const configSource = parseTs(configExpected.path, configText)
  const configNodes = tsNodes(configSource)
  const configType = configNodes.find(
    node => ts.isTypeAliasDeclaration(node) && node.name.text === 'RemoteSessionConfig',
  )
  const preflightProperty = configType.type.members.find(
    node => node.name?.getText(configSource) === 'preflightCheck',
  )
  assertTsDescriptor(configSource, configType, configExpected.config)
  assertTsDescriptor(
    configSource,
    preflightProperty,
    configExpected.preflightProperty,
  )
}

test('validates the exact raw or packaged Target119 source boundary', () => {
  assertTargetSourceRoot()
})

test('keeps generator wiring static, bounded, and fail closed', () => {
  assert.equal(fixture.status, 'authenticated-static-whole-unit-owner-proof')
  assert.deepEqual(fixture.expectedImpact, {
    strictUnitsRemoved: 1,
    strictResiduesRemoved: 2,
    sourceFilesChanged: 0,
    packageReplayOrder: null,
    sharedGeneratorWiring: {
      ownerOverrideExport: 'TARGET119_REMOTE_SESSION_ACTION_DISPATCH_OWNER_OVERRIDES',
      evidenceIdExport: 'TARGET119_REMOTE_SESSION_ACTION_DISPATCH_EVIDENCE_IDS',
      replayExport: null,
    },
  })
  assert.equal(fixture.sourceBoundary.replayBlocker.mode, 'static-only')
  assert.equal(fixture.sourceBoundary.replayBlocker.reasons.length, 4)
  assert.equal(
    TARGET119_REMOTE_SESSION_ACTION_DISPATCH_OWNER_OVERRIDES[0].targetIndex,
    fixture.wholeUnits.target.targetIndex,
  )
})
