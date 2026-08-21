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
  TARGET119_PROMPT_INPUT_FOOTER_BACKGROUND_EXIT_EVIDENCE_IDS,
  TARGET119_PROMPT_INPUT_FOOTER_BACKGROUND_EXIT_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/prompt-input-footer-background-exit-owner-overrides.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-prompt-input-footer-background-exit-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '9900566d0f77983c8e60c864d68822a5adb14624bb218ba8bb7250b77e7d3fbf'
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

function assertTargetRegion(ledger, expected) {
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

function canonicalDescriptor(ast) {
  const serialized = JSON.stringify(canonicalAst(ast))
  return {
    jsonBytes: Buffer.byteLength(serialized),
    sha256: sha256(serialized),
  }
}

function parseUnit(value) {
  return parse(value.toString(), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  })
}

function findExitMessage(unit) {
  const branches = walk(
    unit,
    node =>
      node.type === 'IfStatement' &&
      walk(
        node.test,
        candidate =>
          candidate.type === 'MemberExpression' &&
          candidate.computed === false &&
          candidate.property?.name === 'show',
      ).length === 1,
  )
  assert.equal(branches.length, 1)
  const branch = branches[0]
  const calls = walk(
    branch.consequent,
    node =>
      node.type === 'CallExpression' &&
      node.callee?.type === 'MemberExpression' &&
      node.callee.computed === false &&
      node.callee.property?.name === 'createElement' &&
      node.arguments.some(
        argument =>
          argument.type === 'ObjectExpression' &&
          argument.properties.some(
            property =>
              property.key?.name === 'key' &&
              property.value?.value === 'exit-message',
          ),
      ),
  )
  assert.equal(calls.length, 1)
  return { branch, call: calls[0] }
}

function normalizeExitArgumentTail(unit) {
  const { call } = findExitMessage(unit)
  assert.ok(call.arguments.length >= 5)
  call.arguments.splice(4, call.arguments.length - 4, {
    type: 'Literal',
    value: 'EXIT_ACTION',
    raw: '"EXIT_ACTION"',
  })
  return canonicalDescriptor(unit)
}

function cacheFacts(unit) {
  const calls = walk(
    unit,
    node =>
      node.type === 'CallExpression' &&
      node.arguments.length === 1 &&
      node.arguments[0]?.type === 'Literal' &&
      node.arguments[0].value === fixture.wholeUnitDelta.cache.capacity &&
      node.callee?.type === 'MemberExpression' &&
      node.callee.property?.name === 'c',
  )
  assert.equal(calls.length, 1)
  const indices = walk(
    unit,
    node =>
      node.type === 'MemberExpression' &&
      node.computed === true &&
      node.object?.type === 'Identifier' &&
      node.object.name === '$' &&
      node.property?.type === 'Literal' &&
      Number.isInteger(node.property.value),
  ).map(node => node.property.value)
  const unique = [...new Set(indices)].sort((left, right) => left - right)
  const max = Math.max(...indices)
  return {
    capacity: calls[0].arguments[0].value,
    memberOccurrences: indices.length,
    uniqueIndices: unique.length,
    min: Math.min(...indices),
    max,
    missing: Array.from({ length: max + 1 }, (_, index) => index).filter(
      index => !unique.includes(index),
    ),
    sequenceJsonSha256: sha256(JSON.stringify(indices)),
  }
}

function findRuntimeComponentCall(ast) {
  const calls = walk(
    ast,
    node =>
      node.type === 'CallExpression' &&
      node.arguments?.[1]?.type === 'ObjectExpression' &&
      node.arguments[1].properties.some(
        property => property.key?.name === 'exitMessage',
      ) &&
      node.arguments[1].properties.some(
        property => property.key?.name === 'isInputEmpty',
      ),
  )
  assert.equal(calls.length, 1)
  return calls[0]
}

function runtimePropertyNames(call) {
  return call.arguments[1].properties.map(
    property => property.key.name ?? property.key.value,
  )
}

function rowSetDescriptor(rows) {
  const serialized = JSON.stringify(rows)
  return {
    rows: rows.length,
    jsonBytes: Buffer.byteLength(serialized),
    sha256: sha256(serialized),
  }
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

function readSource(input) {
  const sourcePath = path.join(sourceRoot, input.path.replace(/^src\//, ''))
  const stat = fs.lstatSync(sourcePath)
  assert.equal(stat.isFile(), true)
  assert.equal(stat.isSymbolicLink(), false)
  const value = fs.readFileSync(sourcePath, 'utf8')
  assert.deepEqual(sourceDescriptor(value), input.file)
  return value
}

function assertSourceSlice(source, input) {
  const value = source.slice(input.start, input.end)
  assert.deepEqual(sourceDescriptor(value), {
    chars: input.chars,
    bytes: input.bytes,
    sha256: input.sha256,
  })
  if (input.text != null) assert.equal(value, input.text)
  return value
}

function runGit(args, options = {}) {
  return spawnSync('git', args, {
    cwd: root,
    encoding: options.encoding ?? null,
  })
}

function gitShow(commit, sourcePath) {
  const result = runGit(['show', `${commit}:${sourcePath}`])
  assert.equal(result.status, 0, result.stderr?.toString())
  return result.stdout
}

function gitRevParse(spec) {
  const result = runGit(['rev-parse', spec], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
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

function findTsNodes(ts, sourceFile, predicate) {
  const values = []
  function visit(node) {
    if (predicate(node)) values.push(node)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return values
}

test('Target119 footer fixture exposes one frozen static whole-unit override', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.118-to-2.1.119')
  assert.equal(fixture.status, 'authenticated-static-whole-unit-owner-proof')
  assert.deepEqual(
    TARGET119_PROMPT_INPUT_FOOTER_BACKGROUND_EXIT_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
  assert.deepEqual(
    TARGET119_PROMPT_INPUT_FOOTER_BACKGROUND_EXIT_OWNER_OVERRIDES,
    [
      {
        key: '2.1.118-to-2.1.119:20455',
        targetIndex: 20455,
        paths: [
          'src/components/PromptInput/PromptInputFooterLeftSide.tsx',
        ],
        declarations: ['PromptInputFooterLeftSide'],
        evidenceIds: fixture.evidenceIds,
        behavior:
          TARGET119_PROMPT_INPUT_FOOTER_BACKGROUND_EXIT_OWNER_OVERRIDES[0]
            .behavior,
      },
    ],
  )
  readPinned(fixture.inputs.ownerOverride)
  assert.deepEqual(fixture.expectedImpact, {
    ownerOverrideCount: 1,
    strictUnitsRemoved: 1,
    strictResiduesRemoved: 5,
    sourceFilesReplayed: 0,
    packageCallOrder: null,
    mode: 'static-coverage-only',
  })
})

test('authenticated whole units differ only in the background-aware exit tail', () => {
  const baselineBundle = readPinned(fixture.inputs.baselineBundle)
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const baselineLedger = readLedger(fixture.inputs.baselineLedger)
  const targetLedger = readLedger(fixture.inputs.targetLedger)
  assertTargetRegion(baselineLedger, fixture.baselineUnit)
  assertTargetRegion(targetLedger, fixture.targetUnit)

  const baselineText = slicePinned(baselineBundle, fixture.baselineUnit)
  const targetText = slicePinned(targetBundle, fixture.targetUnit)
  assert.equal(
    targetText.length - baselineText.length,
    fixture.wholeUnitDelta.bytesAdded,
  )
  assert.equal(
    fixture.targetUnit.tokenCount - fixture.baselineUnit.tokenCount,
    fixture.wholeUnitDelta.tokensAdded,
  )

  const baselineAst = parseUnit(baselineText)
  const targetAst = parseUnit(targetText)
  const baselineExit = findExitMessage(baselineAst)
  const targetExit = findExitMessage(targetAst)
  assert.deepEqual(
    {
      start: fixture.baselineUnit.start + baselineExit.branch.start,
      end: fixture.baselineUnit.start + baselineExit.branch.end,
      ...descriptor(
        baselineText.subarray(
          baselineExit.branch.start,
          baselineExit.branch.end,
        ),
      ),
    },
    fixture.wholeUnitDelta.baselineExitBranch,
  )
  assert.deepEqual(
    {
      start: fixture.targetUnit.start + targetExit.branch.start,
      end: fixture.targetUnit.start + targetExit.branch.end,
      ...descriptor(
        targetText.subarray(targetExit.branch.start, targetExit.branch.end),
      ),
    },
    fixture.wholeUnitDelta.targetExitBranch,
  )

  for (const [text, unit, found, expected] of [
    [
      baselineText,
      fixture.baselineUnit,
      baselineExit,
      fixture.wholeUnitDelta.baselineExitCall,
    ],
    [
      targetText,
      fixture.targetUnit,
      targetExit,
      fixture.wholeUnitDelta.targetExitCall,
    ],
  ]) {
    const callText = text.subarray(found.call.start, found.call.end)
    assert.deepEqual(
      {
        start: unit.start + found.call.start,
        end: unit.start + found.call.end,
        ...descriptor(callText),
        text: callText.toString(),
      },
      expected,
    )
  }

  assert.equal(baselineExit.call.arguments.length, 5)
  assert.equal(baselineExit.call.arguments[4].value, ' again to exit')
  assert.equal(targetExit.call.arguments.length, 6)
  assert.equal(targetExit.call.arguments[4].value, ' again to ')
  const action = targetExit.call.arguments[5]
  assert.equal(action.type, 'ConditionalExpression')
  assert.equal(action.test.type, 'CallExpression')
  assert.equal(action.test.callee.name, 'S9')
  assert.equal(action.consequent.value, 'detach')
  assert.equal(action.alternate.value, 'exit')
  const actionText = targetText.subarray(action.start, action.end)
  assert.deepEqual(
    {
      start: fixture.targetUnit.start + action.start,
      end: fixture.targetUnit.start + action.end,
      ...descriptor(actionText),
      text: actionText.toString(),
    },
    fixture.wholeUnitDelta.targetActionExpression,
  )
  const truthTable = [false, true].map(isBackground => [
    isBackground,
    isBackground ? action.consequent.value : action.alternate.value,
  ])
  assert.deepEqual(truthTable, fixture.wholeUnitDelta.actionTruthTable.rows)
  assert.deepEqual(
    {
      jsonBytes: Buffer.byteLength(JSON.stringify(truthTable)),
      sha256: sha256(JSON.stringify(truthTable)),
    },
    {
      jsonBytes: fixture.wholeUnitDelta.actionTruthTable.jsonBytes,
      sha256: fixture.wholeUnitDelta.actionTruthTable.sha256,
    },
  )

  const baselineNormalized = normalizeExitArgumentTail(baselineAst)
  const targetNormalized = normalizeExitArgumentTail(targetAst)
  assert.deepEqual(baselineNormalized, {
    jsonBytes: fixture.wholeUnitDelta.normalizedAstJsonBytes,
    sha256: fixture.wholeUnitDelta.normalizedAstSha256,
  })
  assert.deepEqual(targetNormalized, baselineNormalized)
})

test('the complete 31-slot cache and both slot-30 literals are retained', () => {
  const baselineBundle = readPinned(fixture.inputs.baselineBundle)
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const baselineUnit = parseUnit(slicePinned(baselineBundle, fixture.baselineUnit))
  const targetUnit = parseUnit(slicePinned(targetBundle, fixture.targetUnit))
  const expectedCache = {
    capacity: fixture.wholeUnitDelta.cache.capacity,
    memberOccurrences: fixture.wholeUnitDelta.cache.memberOccurrences,
    uniqueIndices: fixture.wholeUnitDelta.cache.uniqueIndices,
    min: fixture.wholeUnitDelta.cache.min,
    max: fixture.wholeUnitDelta.cache.max,
    missing: fixture.wholeUnitDelta.cache.missing,
    sequenceJsonSha256:
      fixture.wholeUnitDelta.cache.sequenceJsonSha256,
  }
  assert.deepEqual(cacheFacts(baselineUnit), expectedCache)
  assert.deepEqual(cacheFacts(targetUnit), expectedCache)

  for (const [bundle, rows] of [
    [baselineBundle, fixture.wholeUnitDelta.cache.baselineSlot30],
    [targetBundle, fixture.wholeUnitDelta.cache.targetSlot30],
  ]) {
    for (const input of rows) {
      const value = slicePinned(bundle, input)
      assert.equal(value.toString(), '30')
    }
  }
})

test('retained caller, initializer, and isBgSession dependency close the runtime boundary', () => {
  const baselineBundle = readPinned(fixture.inputs.baselineBundle)
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const baselineLedger = readLedger(fixture.inputs.baselineLedger)
  const targetLedger = readLedger(fixture.inputs.targetLedger)

  for (const input of [
    fixture.runtimeBoundary.baselineInitializer,
    fixture.runtimeBoundary.baselineCaller,
  ]) {
    assertTargetRegion(baselineLedger, input)
  }
  for (const input of [
    fixture.runtimeBoundary.targetInitializer,
    fixture.runtimeBoundary.targetCaller,
    fixture.dependencyBoundary.targetEnvSessionKind,
    fixture.dependencyBoundary.targetIsBgSession,
  ]) {
    assertTargetRegion(targetLedger, input)
  }

  const baselineInitializer = parseUnit(
    slicePinned(
      baselineBundle,
      fixture.runtimeBoundary.baselineInitializer,
    ),
  )
  const targetInitializer = parseUnit(
    slicePinned(targetBundle, fixture.runtimeBoundary.targetInitializer),
  )
  assert.deepEqual(
    canonicalDescriptor(baselineInitializer),
    fixture.runtimeBoundary.initializerCanonical,
  )
  assert.deepEqual(
    canonicalDescriptor(targetInitializer),
    canonicalDescriptor(baselineInitializer),
  )

  const baselineCallerText = slicePinned(
    baselineBundle,
    fixture.runtimeBoundary.baselineCaller,
  )
  const targetCallerText = slicePinned(
    targetBundle,
    fixture.runtimeBoundary.targetCaller,
  )
  const baselineCaller = parseUnit(baselineCallerText)
  const targetCaller = parseUnit(targetCallerText)
  assert.deepEqual(
    canonicalDescriptor(baselineCaller),
    fixture.runtimeBoundary.callerCanonical,
  )
  assert.deepEqual(
    canonicalDescriptor(targetCaller),
    canonicalDescriptor(baselineCaller),
  )
  const baselineCall = findRuntimeComponentCall(baselineCaller)
  const targetCall = findRuntimeComponentCall(targetCaller)
  const expectedProperties = fixture.runtimeBoundary.callerProperties.ordered
  assert.deepEqual(runtimePropertyNames(baselineCall), expectedProperties)
  assert.deepEqual(runtimePropertyNames(targetCall), expectedProperties)
  assert.deepEqual(
    {
      jsonBytes: Buffer.byteLength(JSON.stringify(expectedProperties)),
      sha256: sha256(JSON.stringify(expectedProperties)),
    },
    {
      jsonBytes: fixture.runtimeBoundary.callerProperties.jsonBytes,
      sha256: fixture.runtimeBoundary.callerProperties.sha256,
    },
  )
  for (const [text, unit, call, expected] of [
    [
      baselineCallerText,
      fixture.runtimeBoundary.baselineCaller,
      baselineCall,
      fixture.runtimeBoundary.baselineComponentCall,
    ],
    [
      targetCallerText,
      fixture.runtimeBoundary.targetCaller,
      targetCall,
      fixture.runtimeBoundary.targetComponentCall,
    ],
  ]) {
    assert.deepEqual(
      {
        start: unit.start + call.start,
        end: unit.start + call.end,
        ...descriptor(text.subarray(call.start, call.end)),
      },
      expected,
    )
  }

  const baselineWrapper = parseUnit(
    slicePinned(
      baselineBundle,
      fixture.dependencyBoundary.baselineIsBgSession,
    ),
  )
  const targetWrapper = parseUnit(
    slicePinned(targetBundle, fixture.dependencyBoundary.targetIsBgSession),
  )
  assert.deepEqual(
    canonicalDescriptor(baselineWrapper),
    fixture.dependencyBoundary.wrapperCanonical,
  )
  assert.deepEqual(
    canonicalDescriptor(targetWrapper),
    canonicalDescriptor(baselineWrapper),
  )
  for (const [bundle, input] of [
    [baselineBundle, fixture.dependencyBoundary.baselineEnvSessionKind],
    [baselineBundle, fixture.dependencyBoundary.baselineIsBgSession],
    [targetBundle, fixture.dependencyBoundary.targetEnvSessionKind],
    [targetBundle, fixture.dependencyBoundary.targetIsBgSession],
  ]) {
    assert.equal(slicePinned(bundle, input).toString(), input.text)
  }
})

test('all five added owner residues are authenticated inside the whole unit', () => {
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  assert.deepEqual(
    rowSetDescriptor(fixture.residueProof.ownerRows),
    fixture.residueProof.allOwnerRows,
  )
  assert.deepEqual(
    rowSetDescriptor(fixture.residueProof.addedRows),
    fixture.residueProof.addedOwnerRows,
  )
  assert.deepEqual(
    rowSetDescriptor(fixture.residueProof.rawRows),
    fixture.residueProof.rawReportRows,
  )
  assert.deepEqual(
    rowSetDescriptor([]),
    fixture.residueProof.unclassifiedRows,
  )
  assert.deepEqual(
    fixture.residueProof.ownerRows.filter(row => row[7]),
    fixture.residueProof.addedRows,
  )

  for (const row of fixture.residueProof.ownerRows) {
    assert.equal(row[0], fixture.targetUnit.targetIndex)
    assert.ok(row[3] >= fixture.targetUnit.start)
    assert.ok(row[4] <= fixture.targetUnit.end)
    const value = targetBundle.subarray(row[3], row[4]).toString()
    if (row[1] === 'string') assert.equal(JSON.parse(value), row[2])
    else assert.equal(value, row[2])
  }

  const reportPath = path.join(root, fixture.inputs.observedReport.path)
  if (!fs.existsSync(reportPath)) return
  const bytes = fs.readFileSync(reportPath)
  if (sha256(bytes) === fixture.inputs.observedReport.observedSha256) {
    assert.equal(bytes.length, fixture.inputs.observedReport.observedBytes)
  }
  const report = JSON.parse(bytes)
  const select = rows =>
    rows
      .filter(row => row.structural.index === fixture.targetUnit.targetIndex)
      .map(rowIdentity)
  const allOwnerRows = select(report.sourceRuntimeOwnerResidueRows)
  const addedOwnerRows = select(report.sourceRuntimeAddedOwnerResidueRows)
  const rawRows = select(report.rows)
  if (allOwnerRows.length > 0) {
    assert.deepEqual(allOwnerRows, fixture.residueProof.ownerRows)
  }
  assert.ok(
    addedOwnerRows.length === 0 ||
      JSON.stringify(addedOwnerRows) ===
        JSON.stringify(fixture.residueProof.addedRows),
  )
  assert.ok(
    rawRows.length === 0 ||
      JSON.stringify(rawRows) === JSON.stringify(fixture.residueProof.rawRows),
  )
})

test('source graph is stale at both owner and caller, while the dependency is exact', async () => {
  const ts = await loadTypeScript()
  const ownerInput = fixture.sourceBoundary.owner
  const callerInput = fixture.sourceBoundary.caller
  const dependencyInput = fixture.sourceBoundary.dependency
  const owner = readSource(ownerInput)
  const caller = readSource(callerInput)
  const dependency = readSource(dependencyInput)

  for (const [source, relative, input] of [
    [owner, ownerInput.path, ownerInput.file],
    [caller, callerInput.path, callerInput.file],
    [dependency, dependencyInput.path, dependencyInput.file],
  ]) {
    const sourceFile = ts.createSourceFile(
      relative,
      source,
      ts.ScriptTarget.Latest,
      true,
      relative.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    assert.equal(sourceFile.parseDiagnostics.length, 0)
  }

  const ownerProps = assertSourceSlice(owner, ownerInput.props)
  const ownerDeclaration = assertSourceSlice(owner, ownerInput.declaration)
  const callerDeclaration = assertSourceSlice(caller, callerInput.declaration)
  const callerCall = assertSourceSlice(caller, callerInput.componentCall)
  assertSourceSlice(owner, ownerInput.isBgSessionImport)
  assertSourceSlice(owner, ownerInput.cacheCall)
  assertSourceSlice(owner, ownerInput.exitJsx)
  assertSourceSlice(owner, ownerInput.modeInputBinding)
  assertSourceSlice(caller, callerInput.props)
  assertSourceSlice(dependency, dependencyInput.envSessionKind)
  assertSourceSlice(dependency, dependencyInput.isBgSession)

  assert.equal(ownerProps.includes('isInputEmpty'), false)
  assert.equal(ownerDeclaration.includes('isInputEmpty,'), false)
  assert.equal(ownerDeclaration.includes('isBgSession()'), false)
  assert.equal(ownerDeclaration.includes(' again to exit</Text>'), true)
  assert.equal(
    ownerDeclaration.includes('isInputEmpty={!suppressHint}'),
    true,
  )
  assert.equal(callerCall.includes('isInputEmpty='), false)
  assert.equal(callerDeclaration.includes('suppressHintFromProps'), true)
  assert.equal(dependency.includes("return envSessionKind() === 'bg'"), true)

  const sourceCache = [...ownerDeclaration.matchAll(/\$\[(\d+)\]/g)].map(
    match => Number(match[1]),
  )
  const unique = [...new Set(sourceCache)].sort((left, right) => left - right)
  const max = Math.max(...sourceCache)
  assert.deepEqual(
    {
      capacity: Number(ownerInput.cacheCall.text.match(/_c\((\d+)\)/)[1]),
      memberOccurrences: sourceCache.length,
      uniqueIndices: unique.length,
      min: Math.min(...sourceCache),
      max,
      missing: Array.from({ length: max + 1 }, (_, index) => index).filter(
        index => !unique.includes(index),
      ),
      sequenceJsonBytes: Buffer.byteLength(JSON.stringify(sourceCache)),
      sequenceJsonSha256: sha256(JSON.stringify(sourceCache)),
    },
    ownerInput.cache,
  )

  for (const input of [ownerInput, callerInput, dependencyInput]) {
    assert.equal(
      gitRevParse(`${fixture.sourceBoundary.target119Commit}:${input.path}`),
      input.blob,
    )
    assert.deepEqual(
      descriptor(
        gitShow(fixture.sourceBoundary.target119Commit, input.path),
      ),
      { bytes: input.file.bytes, sha256: input.file.sha256 },
    )
  }

  const later = fixture.sourceBoundary.laterTarget120
  const laterOwnerBytes = gitShow(later.commit, ownerInput.path)
  const laterCallerBytes = gitShow(later.commit, callerInput.path)
  assert.equal(gitRevParse(`${later.commit}:${ownerInput.path}`), later.ownerBlob)
  assert.equal(
    gitRevParse(`${later.commit}:${callerInput.path}`),
    later.callerBlob,
  )
  assert.deepEqual(descriptor(laterOwnerBytes), {
    bytes: later.ownerFile.bytes,
    sha256: later.ownerFile.sha256,
  })
  assert.deepEqual(descriptor(laterCallerBytes), {
    bytes: later.callerFile.bytes,
    sha256: later.callerFile.sha256,
  })
  const laterOwner = laterOwnerBytes.toString()
  const laterCaller = laterCallerBytes.toString()
  const laterOwnerDeclaration = assertSourceSlice(
    laterOwner,
    later.ownerDeclaration,
  )
  const laterCallerDeclaration = assertSourceSlice(
    laterCaller,
    later.callerDeclaration,
  )
  const laterCall = assertSourceSlice(laterCaller, later.componentCall)
  assert.equal(laterOwnerDeclaration.includes('isInputEmpty,'), true)
  assert.equal(
    laterCall.includes('isInputEmpty={!suppressHintFromProps}'),
    true,
  )
  assert.equal(laterCall.includes('hideVimModeIndicator='), true)
  for (const fragment of later.incompatibleExitFragments) {
    assert.equal(laterOwnerDeclaration.includes(fragment), true, fragment)
  }
  assert.equal(laterCallerDeclaration.includes('footerStates'), true)

  assert.deepEqual(fixture.replayDecision, {
    mode: 'static-coverage-only',
    sourceFilesReplayed: 0,
    packageCallOrder: null,
    reason: fixture.replayDecision.reason,
  })
})
