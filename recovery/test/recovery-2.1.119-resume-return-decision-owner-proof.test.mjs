import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET119_RESUME_RETURN_DECISION_EVIDENCE_IDS,
  TARGET119_RESUME_RETURN_DECISION_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/resume-return-decision-owner-overrides.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const options = { skip: selected ? false : `not applicable to ${selectedCase}` }
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-resume-return-decision-owner-proof.json',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/resume-return-decision-owner-overrides.mjs',
)
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    process.env.CLAUDE_CODE_2_1_119_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src'),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const FIXTURE_SHA256 =
  '1c23958d361e7d437ea01f47bf78f147de1192fa2e93d3258cca40be24f8b960'
const HELPER_SHA256 =
  'a87e1615b727a991380e9a564c5a82d36f88f2aa2d7fefe314c9becf5d5067d0'
const RECOVERED_TARGET119_SOURCE_FILES = Object.freeze({
  'src/screens/REPL.tsx': Object.freeze({
    bytes: 909236,
    sha256: '1f80c57ab7ad18b2ace737e30fd24718e30e9d301d9fa82b24feb0414781c38d',
  }),
})

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function readPinned(input, environmentName) {
  const filename =
    environmentName && process.env[environmentName]
      ? path.resolve(process.env[environmentName])
      : path.join(root, input.path)
  const value = fs.readFileSync(filename)
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

function canonicalAst(value, parent = null, parentKey = null) {
  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      canonicalAst(entry, value, index),
    )
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
  const ast = parse(value.toString(), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  })
  const serialized = JSON.stringify(canonicalAst(ast))
  return descriptor(serialized)
}

function rowSetDescriptor(rows) {
  return {
    rows: rows.length,
    jsonBytes: Buffer.byteLength(JSON.stringify(rows)),
    sha256: sha256(JSON.stringify(rows)),
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

function gitPathExists(commit, filename) {
  return (
    spawnSync('git', ['cat-file', '-e', `${commit}:${filename}`], {
      cwd: root,
    }).status === 0
  )
}

function gitBlob(commit, filename) {
  const result = spawnSync('git', ['rev-parse', `${commit}:${filename}`], {
    cwd: root,
    encoding: 'utf8',
  })
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

function functionDeclaration(ts, sourceFile, name) {
  let result
  function visit(node) {
    if (result) return
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      result = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return result
}

function namedImports(ts, sourceFile) {
  const rows = []
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    const bindings = statement.importClause?.namedBindings
    if (!bindings || !ts.isNamedImports(bindings)) continue
    for (const element of bindings.elements) {
      if (statement.importClause?.isTypeOnly || element.isTypeOnly) continue
      rows.push([
        statement.moduleSpecifier.text,
        element.propertyName?.text ?? element.name.text,
      ])
    }
  }
  return rows.sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  )
}

function assertSourceDescriptor(value, expected) {
  assert.deepEqual(descriptor(value), {
    bytes: expected.bytes,
    sha256: expected.sha256,
  })
}

test('Target119 resume-return fixture exposes one frozen static override', options, () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, caseName)
  assert.deepEqual(fixture.summary, {
    units: 1,
    allOwnerRows: 23,
    addedOwnerRows: 4,
    strictRows: 4,
    ownerOverrides: 1,
    sourceReplayHelpers: 0,
  })
  assert.deepEqual(
    TARGET119_RESUME_RETURN_DECISION_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
  assert.deepEqual(
    TARGET119_RESUME_RETURN_DECISION_OWNER_OVERRIDES.map(row => ({
      key: row.key,
      targetIndex: row.targetIndex,
      paths: [...row.paths],
      declarations: [...row.declarations],
      evidenceIds: [...row.evidenceIds],
    })),
    [
      {
        key: `${caseName}:${fixture.unit.targetIndex}`,
        targetIndex: fixture.unit.targetIndex,
        paths: [fixture.unit.ownerPath],
        declarations: [fixture.unit.declaration],
        evidenceIds: fixture.evidenceIds,
      },
    ],
  )
  assert.match(
    TARGET119_RESUME_RETURN_DECISION_OWNER_OVERRIDES[0].behavior,
    /never authorizes a partial or later-source replay/,
  )
})

test('complete Target118/119 units and every owner residue are exact', options, () => {
  const baseline = readPinned(
    fixture.inputs.baselineBundle,
    'CLAUDE_CODE_2_1_118_BUNDLE',
  )
  const target = readPinned(
    fixture.inputs.targetBundle,
    'CLAUDE_CODE_2_1_119_BUNDLE',
  )
  const structural = ledger(fixture.inputs.targetStructuralLedger)
  const region = structural.regions[fixture.unit.targetIndex]
  assert.deepEqual(
    {
      classification: region.classification,
      baselineUnitIndex: region.baselineUnitIndex,
      pairReason: region.pairReason,
      nodeType: region.target.nodeType,
      start: region.target.start,
      end: region.target.end,
      tokenCount: region.target.tokenCount,
      sourceHash: region.target.sourceHash,
      coarseHash: region.target.coarseHash,
    },
    {
      classification: fixture.unit.classification,
      baselineUnitIndex: fixture.unit.baseline.targetIndex,
      pairReason: fixture.unit.pairReason,
      nodeType: fixture.unit.target.nodeType,
      start: fixture.unit.target.start,
      end: fixture.unit.target.end,
      tokenCount: fixture.unit.target.tokenCount,
      sourceHash: fixture.unit.target.sha256,
      coarseHash: fixture.unit.target.coarseHash,
    },
  )
  const baselineUnit = slicePinned(baseline, fixture.unit.baseline)
  const targetUnit = slicePinned(target, fixture.unit.target)
  assert.deepEqual(
    canonicalDescriptor(baselineUnit),
    fixture.unit.canonicalAst,
  )
  assert.deepEqual(canonicalDescriptor(targetUnit), fixture.unit.canonicalAst)
  assert.equal(fixture.unit.baseline.coarseHash, fixture.unit.target.coarseHash)

  assert.deepEqual(
    rowSetDescriptor(fixture.ownerResidues.rows),
    fixture.ownerResidues.allRows,
  )
  const addedRows = fixture.ownerResidues.rows.filter(row => row[7])
  assert.deepEqual(
    rowSetDescriptor(addedRows),
    fixture.ownerResidues.addedRows,
  )
  for (const row of fixture.ownerResidues.rows) {
    const [targetIndex, kind, value, start, end] = row
    assert.equal(targetIndex, fixture.unit.targetIndex)
    assert.ok(start >= fixture.unit.target.start)
    assert.ok(end <= fixture.unit.target.end)
    const raw = target.subarray(start, end).toString()
    if (kind === 'string') assert.equal(JSON.parse(raw), value)
    else if (kind === 'number') assert.equal(String(Number(raw)), value)
    else assert.equal(raw, value)
  }
})

test('runtime gates and supplied token estimator reproduce the complete decision table', options, () => {
  const target = readPinned(
    fixture.inputs.targetBundle,
    'CLAUDE_CODE_2_1_119_BUNDLE',
  )
  const targetUnit = slicePinned(target, fixture.unit.target).toString()
  const envInput = fixture.runtimeGraph.dependencies.find(
    row => row.role === 'environment-number-parser',
  )
  assert(envInput)
  const envUnit = slicePinned(target, envInput).toString()
  const parseEnvironmentNumber = new Function(
    `'use strict';${envUnit};return ${envInput.symbol}`,
  )()
  assert.equal(parseEnvironmentNumber(undefined, 70), 70)
  assert.equal(parseEnvironmentNumber('91', 70), 91)
  assert.equal(parseEnvironmentNumber('not-a-number', 70), 70)

  const now = Date.parse('2026-01-01T12:00:00.000Z')
  const DateBoundary = Object.freeze({ now: () => now, parse: Date.parse })
  const oldUser = { type: 'user', timestamp: '2026-01-01T10:00:00.000Z' }
  const recentAssistant = {
    type: 'assistant',
    timestamp: '2026-01-01T11:59:30.000Z',
  }
  const oldAssistant = {
    type: 'assistant',
    timestamp: '2026-01-01T10:30:00.000Z',
  }

  function run({
    enabled = true,
    dismissed = false,
    ageThreshold,
    tokenThreshold,
    messages = [oldUser, recentAssistant, oldAssistant],
    tokens = 100_000,
  } = {}) {
    let tokenCalls = 0
    const processBoundary = {
      env: {
        ...(ageThreshold === undefined
          ? {}
          : { CLAUDE_CODE_RESUME_THRESHOLD_MINUTES: ageThreshold }),
        ...(tokenThreshold === undefined
          ? {}
          : { CLAUDE_CODE_RESUME_TOKEN_THRESHOLD: tokenThreshold }),
      },
    }
    const helper = new Function(
      'k$',
      'y$',
      'ex',
      'Date',
      'process',
      `'use strict';${targetUnit};return WO4`,
    )(
      () => enabled,
      () => ({ resumeReturnDismissed: dismissed }),
      parseEnvironmentNumber,
      DateBoundary,
      processBoundary,
    )
    const result = helper(messages, () => {
      tokenCalls += 1
      return tokens
    })
    return { result, tokenCalls }
  }

  assert.deepEqual(run(), {
    result: { sessionAgeMinutes: 90, estimatedTokens: 100_000 },
    tokenCalls: 1,
  })
  assert.deepEqual(run({ enabled: false }), { result: null, tokenCalls: 0 })
  assert.deepEqual(run({ dismissed: true }), { result: null, tokenCalls: 0 })
  assert.deepEqual(run({ messages: [recentAssistant] }), {
    result: null,
    tokenCalls: 0,
  })
  assert.deepEqual(run({ ageThreshold: '91' }), {
    result: null,
    tokenCalls: 0,
  })
  assert.deepEqual(run({ tokens: 99_999 }), {
    result: null,
    tokenCalls: 1,
  })
  assert.deepEqual(
    run({ ageThreshold: 'bad', tokenThreshold: 'bad' }),
    {
      result: { sessionAgeMinutes: 90, estimatedTokens: 100_000 },
      tokenCalls: 1,
    },
  )
})

test('the sole REPL call and all compiled dependency boundaries remain pinned', options, () => {
  const target = readPinned(
    fixture.inputs.targetBundle,
    'CLAUDE_CODE_2_1_119_BUNDLE',
  )
  const targetText = target.toString()
  assert.equal(
    targetText.split(`function ${fixture.runtimeGraph.definitionName}(`).length -
      1,
    fixture.runtimeGraph.definitionOccurrences,
  )
  assert.equal(
    targetText.split(`${fixture.runtimeGraph.definitionName}(`).length - 1,
    fixture.runtimeGraph.totalCallSyntaxOccurrences,
  )
  const structural = ledger(fixture.inputs.targetStructuralLedger)
  for (const input of [
    fixture.runtimeGraph.caller,
    fixture.runtimeGraph.dialog,
    ...fixture.runtimeGraph.dependencies,
  ]) {
    const region = structural.regions[input.targetIndex]
    assert.equal(region.target.start, input.start)
    assert.equal(region.target.end, input.end)
    assert.equal(region.target.tokenCount, input.tokenCount)
    assert.equal(region.target.sourceHash, input.sha256)
    slicePinned(target, input)
  }
  assert.equal(
    slicePinned(target, fixture.runtimeGraph.caller.callback).toString(),
    'Gc=s$.useCallback((O$)=>{let r$=WO4(O$,LX);if(r$)zG(r$)},[])',
  )
  assert.equal(
    slicePinned(target, fixture.runtimeGraph.caller.call).toString(),
    'WO4(O$,LX)',
  )

  const sourceChecks = new Map([
    [
      'src/services/analytics/growthbook.ts',
      'export function getFeatureValue_CACHED_MAY_BE_STALE',
    ],
    ['src/utils/config.ts', 'export function getGlobalConfig()'],
    [
      'src/services/compact/microCompact.ts',
      'export function estimateMessageTokens',
    ],
  ])
  for (const [relative, marker] of sourceChecks) {
    const source = fs.readFileSync(
      path.join(sourceRoot, relative.replace(/^src\//, '')),
      'utf8',
    )
    assert.ok(source.includes(marker), `${relative}: ${marker}`)
  }
})

test('Targets120 and 121 preserve the helper canonically and expose its true owner', options, async () => {
  let previousIndex = fixture.unit.targetIndex
  for (let index = 0; index < fixture.compiledLineage.length; index += 1) {
    const expected = fixture.compiledLineage[index]
    const input = fixture.inputs.later[index]
    assert.equal(input.version, expected.version)
    const bundle = readPinned(input.bundle)
    const structural = ledger(input.ledger)
    const region = structural.regions[expected.targetIndex]
    assert.equal(region.baselineUnitIndex, previousIndex)
    assert.equal(region.classification, expected.classification)
    assert.equal(region.pairReason, expected.pairReason)
    assert.equal(region.target.start, expected.start)
    assert.equal(region.target.end, expected.end)
    assert.equal(region.target.sourceHash, expected.sha256)
    assert.equal(region.target.coarseHash, expected.coarseHash)
    const unit = slicePinned(bundle, expected)
    assert.deepEqual(canonicalDescriptor(unit), fixture.unit.canonicalAst)
    previousIndex = expected.targetIndex
  }

  const graph = fixture.sourceGraph.target121
  const ownerBytes = gitShow(graph.commit, graph.owner.path)
  assert.equal(gitBlob(graph.commit, graph.owner.path), graph.owner.blob)
  assertSourceDescriptor(ownerBytes, graph.owner)
  const ts = await loadTypeScript()
  const source = ownerBytes.toString()
  const sourceFile = ts.createSourceFile(
    graph.owner.path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  const declaration = functionDeclaration(
    ts,
    sourceFile,
    graph.owner.declaration.name,
  )
  assert(declaration)
  const start = declaration.getStart(sourceFile)
  const end = declaration.end
  const declarationText = source.slice(start, end)
  assert.deepEqual(
    {
      name: declaration.name.text,
      start,
      end,
      chars: declarationText.length,
      sha256: sha256(declarationText),
    },
    graph.owner.declaration,
  )
  assert.deepEqual(
    namedImports(ts, sourceFile),
    [...graph.ownerRuntimeImports].sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    ),
  )
  for (const marker of [
    'tengu_gleaming_fair',
    'resumeReturnDismissed',
    'CLAUDE_CODE_RESUME_THRESHOLD_MINUTES',
    'CLAUDE_CODE_RESUME_TOKEN_THRESHOLD',
    'findLast',
    'Date.parse',
    'estimateMessageTokens',
    'sessionAgeMinutes',
    'estimatedTokens',
  ]) {
    assert.ok(declarationText.includes(marker), marker)
  }
  assert.ok(
    declarationText.indexOf('sessionAgeMinutes < ageThresholdMinutes') <
      declarationText.indexOf('estimateMessageTokens(messages)'),
  )
})

test('Target119 source graph is exactly absent and no partial replay is authorized', options, () => {
  const graph = fixture.sourceGraph
  const target = graph.target119
  const packagedTargetSource = []
  for (const input of [target.repl, target.config]) {
    const sourceBytes = gitShow(target.commit, input.path)
    assert.equal(gitBlob(target.commit, input.path), input.blob)
    assertSourceDescriptor(sourceBytes, input)
    const packagedBytes = fs.readFileSync(
      path.join(sourceRoot, input.path.replace(/^src\//, '')),
    )
    const packagedDescriptor = descriptor(packagedBytes)
    const acceptedDescriptors = [
      { bytes: input.bytes, sha256: input.sha256 },
      RECOVERED_TARGET119_SOURCE_FILES[input.path],
    ].filter(Boolean)
    assert.ok(
      acceptedDescriptors.some(
        expected =>
          expected.bytes === packagedDescriptor.bytes &&
          expected.sha256 === packagedDescriptor.sha256,
      ),
      `${input.path}: unrecognized Target119 source phase ${JSON.stringify(packagedDescriptor)}`,
    )
    packagedTargetSource.push(packagedBytes.toString())
  }
  for (const relative of target.absentPaths) {
    assert.equal(gitPathExists(target.commit, relative), false)
    assert.equal(
      fs.existsSync(path.join(sourceRoot, relative.replace(/^src\//, ''))),
      false,
    )
  }
  const targetSource = [target.repl, target.config]
    .map(input => gitShow(target.commit, input.path).toString())
    .join('\n')
  for (const marker of target.absentMarkers) {
    assert.equal(targetSource.includes(marker), false, marker)
    assert.equal(packagedTargetSource.join('\n').includes(marker), false, marker)
  }

  const predecessor = graph.predecessorRecovery
  for (const input of [
    predecessor.repl,
    predecessor.dialog,
    predecessor.config,
  ]) {
    const bytes = gitShow(predecessor.commit, input.path)
    assert.equal(gitBlob(predecessor.commit, input.path), input.blob)
    assertSourceDescriptor(bytes, input)
  }
  assert.equal(
    gitPathExists(predecessor.commit, predecessor.ownerPathAbsent),
    false,
  )
  const predecessorRepl = gitShow(
    predecessor.commit,
    predecessor.repl.path,
  ).toString()
  assert.ok(predecessorRepl.includes("import('../utils/tokens.js')"))
  assert.ok(predecessorRepl.includes('setResumeReturnPending({'))
  assert.equal(predecessorRepl.includes('getResumeReturnInfo'), false)

  const later = graph.target121
  for (const input of [later.repl, later.dialog, later.config]) {
    const bytes = gitShow(later.commit, input.path)
    assert.equal(gitBlob(later.commit, input.path), input.blob)
    assertSourceDescriptor(bytes, input)
  }
  const laterRepl = gitShow(later.commit, later.repl.path).toString()
  const laterConfig = gitShow(later.commit, later.config.path).toString()
  assert.ok(laterRepl.includes("import { getResumeReturnInfo } from '../utils/resumeReturn.js'"))
  assert.equal((laterRepl.match(/getResumeReturnInfo/g) ?? []).length, 3)
  assert.ok(laterRepl.includes('tengu_resume_return_action'))
  assert.ok(laterConfig.includes('resumeReturnDismissed?: boolean'))

  assert.equal(fixture.summary.sourceReplayHelpers, 0)
  assert.equal(
    graph.replayBlocker.operation,
    'static-proof-only-until-complete-target119-owner-graph-is-authenticated',
  )
  assert.deepEqual(graph.replayBlocker.requiredGraph, [
    'src/utils/resumeReturn.ts',
    'src/components/ResumeReturnDialog.tsx',
    'src/screens/REPL.tsx',
    'src/utils/config.ts',
  ])
  assert.match(graph.replayBlocker.reason, /No partial or later-source replay/)
})
