import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import {
  applyTarget119HookBackgroundSkipSpillSourceRecovery,
  buildTarget119HookBackgroundSkipSpillOutput,
  TARGET119_HOOK_BACKGROUND_SKIP_SPILL_EVIDENCE_IDS,
  TARGET119_HOOK_BACKGROUND_SKIP_SPILL_INPUT,
  TARGET119_HOOK_BACKGROUND_SKIP_SPILL_OUTPUT,
  TARGET119_HOOK_BACKGROUND_SKIP_SPILL_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/replay-hook-background-skip-spill-source-gap.mjs'

const root = process.cwd()
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-hook-background-skip-spill-source-gap.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'a242549e736f59964d5021a2262308bdccf381dea56a08f6b4f5b831f4877b07'
const configuredSourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src'),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function readPinned(input) {
  const value = fs.readFileSync(path.join(root, input.path))
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return value
}

function gitSource() {
  const input = fixture.inputs.source
  const tree = spawnSync('git', ['rev-parse', `${input.commit}^{tree}`], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(tree.status, 0, tree.stderr)
  assert.equal(tree.stdout.trim(), input.tree)
  const blob = spawnSync(
    'git',
    ['rev-parse', `${input.commit}:${input.path}`],
    { cwd: root, encoding: 'utf8' },
  )
  assert.equal(blob.status, 0, blob.stderr)
  assert.equal(blob.stdout.trim(), input.blob)
  const result = spawnSync('git', ['show', `${input.commit}:${input.path}`], {
    cwd: root,
    encoding: null,
  })
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), input.input)
  return result.stdout
}

function sourceFilename(sourceRoot) {
  return path.join(
    path.resolve(sourceRoot),
    fixture.inputs.source.path.slice('src/'.length),
  )
}

function materialize(bytes, prefix = 'target119-hook-skip-spill-') {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporary, 'src')
  const filename = sourceFilename(sourceRoot)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, bytes)
  return { temporary, sourceRoot, filename }
}

function canonicalToken(token) {
  if (token.type.label === 'name') return 'ID'
  if (token.type.label === 'string') return `S:${JSON.stringify(token.value)}`
  if (token.type.label === 'num') return `N:${token.value}`
  if (token.type.label === 'regexp') {
    return `R:${token.value.pattern}/${token.value.flags}`
  }
  return token.type.label
}

function canonicalTokens(source) {
  return [...tokenizer(source, { ecmaVersion: 'latest' })].map(canonicalToken)
}

function structuralUnit(input, targetIndex) {
  const ledger = JSON.parse(gunzipSync(readPinned(input)))
  const unit = ledger.regions.find(row => row.target.index === targetIndex)?.target
  assert.ok(unit, `missing structural unit ${targetIndex}`)
  return unit
}

function unitDescriptor(unit) {
  return {
    targetIndex: unit.index,
    nodeType: unit.nodeType,
    start: unit.start,
    end: unit.end,
    tokenCount: unit.tokenCount,
    sourceHash: unit.sourceHash,
    coarseHash: unit.coarseHash,
  }
}

function expectedUnitDescriptor(unit) {
  return {
    targetIndex: unit.targetIndex,
    nodeType: unit.nodeType,
    start: unit.start,
    end: unit.end,
    tokenCount: unit.tokenCount,
    sourceHash: unit.sourceHash,
    coarseHash: unit.coarseHash,
  }
}

function rowTuple(row) {
  return [
    row.structural.index,
    row.literalKind,
    row.value,
    row.target.start,
    row.target.end,
    row.baselineOccurrenceCount,
    row.targetOccurrenceNumber,
    row.targetAdded,
    row.disposition,
    row.ownerPaths,
  ]
}

function canonicalRows(rows) {
  const value = rows.map(JSON.stringify).join('\n')
  return { ...descriptor(Buffer.from(value)), tuples: rows }
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

function sourceFile(ts, bytes) {
  const parsed = ts.createSourceFile(
    fixture.inputs.source.path,
    bytes.toString('utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(parsed.parseDiagnostics.length, 0)
  return parsed
}

function executeDeclaration(ts, parsed, bytes, expected) {
  const matches = parsed.statements.filter(
    row =>
      ts.isFunctionDeclaration(row) &&
      row.name?.text === expected.name,
  )
  assert.equal(matches.length, 1)
  const declaration = matches[0]
  const start = declaration.getStart(parsed)
  const end = declaration.end
  assert.deepEqual(
    { name: declaration.name.text, start, end, ...descriptor(bytes.subarray(start, end)) },
    expected,
  )
  return declaration
}

function backgroundCalls(ts, declaration) {
  const calls = []
  const visit = node => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText() === 'shellCommand' &&
      node.expression.name.text === 'background'
    ) {
      calls.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(declaration)
  return calls
}

test('Target119 hook skipSpill fixture and override are frozen', { skip: !selected }, () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.case, caseName)
  assert.deepEqual(
    descriptor(fs.readFileSync(path.join(root, fixture.inputs.helper.path))),
    { bytes: fixture.inputs.helper.bytes, sha256: fixture.inputs.helper.sha256 },
  )
  assert.deepEqual(TARGET119_HOOK_BACKGROUND_SKIP_SPILL_INPUT, {
    path: fixture.inputs.source.path,
    ...fixture.inputs.source.input,
  })
  assert.deepEqual(TARGET119_HOOK_BACKGROUND_SKIP_SPILL_OUTPUT, {
    path: fixture.inputs.source.path,
    ...fixture.inputs.source.output,
  })
  assert.deepEqual(
    TARGET119_HOOK_BACKGROUND_SKIP_SPILL_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
  assert.deepEqual(
    TARGET119_HOOK_BACKGROUND_SKIP_SPILL_OWNER_OVERRIDES.map(row => ({
      targetIndex: row.targetIndex,
      paths: [...row.paths],
      declarations: [...row.declarations],
      evidenceIds: [...row.evidenceIds],
      behavior: row.behavior,
    })),
    [{ targetIndex: fixture.targetUnit.targetIndex, ...fixture.ownerOverride }],
  )
})

test('complete bundle units differ only by the skipSpill call option', { skip: !selected }, () => {
  const baselineBundle = readPinned(fixture.inputs.baselineBundle)
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  for (const [input, ledger] of [
    [fixture.baselineUnit, fixture.inputs.baselineStructuralLedger],
    [fixture.targetUnit, fixture.inputs.targetStructuralLedger],
  ]) {
    assert.deepEqual(
      unitDescriptor(structuralUnit(ledger, input.targetIndex)),
      expectedUnitDescriptor(input),
    )
  }
  const baseline = baselineBundle.subarray(
    fixture.baselineUnit.start,
    fixture.baselineUnit.end,
  )
  const target = targetBundle.subarray(
    fixture.targetUnit.start,
    fixture.targetUnit.end,
  )
  assert.deepEqual(descriptor(baseline), {
    bytes: fixture.baselineUnit.bytes,
    sha256: fixture.baselineUnit.sourceHash,
  })
  assert.deepEqual(descriptor(target), {
    bytes: fixture.targetUnit.bytes,
    sha256: fixture.targetUnit.sourceHash,
  })
  const baselineText = baseline.toString('utf8')
  const targetText = target.toString('utf8')
  assert.equal(baselineText.split(fixture.compiledDelta.baseline).length - 1, 1)
  assert.equal(targetText.split(fixture.compiledDelta.target).length - 1, 1)
  const normalizedTarget = targetText.replace(
    fixture.compiledDelta.target,
    fixture.compiledDelta.baseline,
  )
  const baselineTokens = canonicalTokens(baselineText)
  const targetTokens = canonicalTokens(targetText)
  const normalizedTokens = canonicalTokens(normalizedTarget)
  assert.equal(baselineTokens.length, fixture.baselineUnit.tokenCount)
  assert.equal(targetTokens.length, fixture.targetUnit.tokenCount)
  assert.equal(
    targetTokens.length - normalizedTokens.length,
    fixture.compiledDelta.targetOnlyTokens,
  )
  assert.equal(normalizedTokens.length, fixture.compiledDelta.normalizedTokenCount)
  assert.deepEqual(normalizedTokens, baselineTokens)
  assert.deepEqual(
    descriptor(Buffer.from(JSON.stringify(normalizedTokens))),
    {
      bytes: fixture.compiledDelta.normalizedCanonicalBytes,
      sha256: fixture.compiledDelta.normalizedCanonicalSha256,
    },
  )
})

test('typed owner rows accept only exact provisional or replayed states', { skip: !selected }, () => {
  const report = JSON.parse(
    fs.readFileSync(path.join(root, fixture.inputs.typedReport.path), 'utf8'),
  )
  const observedAdded = report.sourceRuntimeAddedOwnerResidueRows
    .filter(row => row.structural.index === fixture.targetUnit.targetIndex)
    .map(rowTuple)
  const observedOwner = report.sourceRuntimeOwnerResidueRows
    .filter(row => row.structural.index === fixture.targetUnit.targetIndex)
    .map(rowTuple)
  const provisional =
    same(observedAdded, fixture.rows.addedOwner.tuples) &&
    same(observedOwner, fixture.rows.owner.tuples)
  const correctedAdded = fixture.rows.addedOwner.tuples.filter(
    row => row[2] !== 'skipSpill',
  )
  const correctedOwner = fixture.rows.owner.tuples.filter(
    row => row[2] !== 'skipSpill',
  )
  const corrected =
    same(observedAdded, correctedAdded) &&
    same(observedOwner, correctedOwner)
  assert.equal(provisional || corrected, true)
  if (provisional) {
    assert.deepEqual(canonicalRows(observedAdded), {
      bytes: fixture.rows.addedOwner.canonicalBytes,
      sha256: fixture.rows.addedOwner.canonicalSha256,
      tuples: fixture.rows.addedOwner.tuples,
    })
    assert.deepEqual(canonicalRows(observedOwner), {
      bytes: fixture.rows.owner.canonicalBytes,
      sha256: fixture.rows.owner.canonicalSha256,
      tuples: fixture.rows.owner.tuples,
    })
  }
  const target = readPinned(fixture.inputs.targetBundle)
  for (const row of fixture.rows.addedOwner.tuples) {
    assert.equal(target.subarray(row[3], row[4]).toString(), row[2])
  }
})

test('source replay is exact, typed, idempotent, and fail closed', { skip: !selected }, async () => {
  const raw = gitSource()
  const output = buildTarget119HookBackgroundSkipSpillOutput(raw)
  assert.deepEqual(descriptor(output), fixture.inputs.source.output)
  const ts = await loadTypeScript()
  for (const [bytes, expected, argumentCount] of [
    [raw, fixture.inputs.source.rawDeclaration, 1],
    [output, fixture.inputs.source.outputDeclaration, 2],
  ]) {
    const parsed = sourceFile(ts, bytes)
    const declaration = executeDeclaration(ts, parsed, bytes, expected)
    const calls = backgroundCalls(ts, declaration)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].arguments.length, argumentCount)
    if (argumentCount === 2) {
      const options = calls[0].arguments[1]
      assert.ok(ts.isObjectLiteralExpression(options))
      assert.equal(options.properties.length, 1)
      const property = options.properties[0]
      assert.ok(ts.isPropertyAssignment(property))
      assert.equal(property.name.getText(parsed), 'skipSpill')
      assert.equal(property.initializer.kind, ts.SyntaxKind.TrueKeyword)
    }
  }
  const rawCall = Buffer.from(raw.toString('utf8').slice(
    fixture.inputs.source.rawCall.start,
    fixture.inputs.source.rawCall.start + fixture.inputs.source.rawCall.bytes,
  ))
  const outputCall = Buffer.from(output.toString('utf8').slice(
    fixture.inputs.source.outputCall.start,
    fixture.inputs.source.outputCall.start + fixture.inputs.source.outputCall.bytes,
  ))
  assert.equal(rawCall.toString(), fixture.inputs.source.rawCall.text)
  assert.equal(outputCall.toString(), fixture.inputs.source.outputCall.text)
  assert.deepEqual(descriptor(rawCall), {
    bytes: fixture.inputs.source.rawCall.bytes,
    sha256: fixture.inputs.source.rawCall.sha256,
  })
  assert.deepEqual(descriptor(outputCall), {
    bytes: fixture.inputs.source.outputCall.bytes,
    sha256: fixture.inputs.source.outputCall.sha256,
  })

  const materialized = materialize(raw)
  assert.deepEqual(
    applyTarget119HookBackgroundSkipSpillSourceRecovery({
      sourceRoot: materialized.sourceRoot,
    }),
    { status: 'recovered', files: [fixture.inputs.source.path] },
  )
  assert.deepEqual(descriptor(fs.readFileSync(materialized.filename)), fixture.inputs.source.output)
  assert.deepEqual(
    applyTarget119HookBackgroundSkipSpillSourceRecovery({
      sourceRoot: materialized.sourceRoot,
    }),
    { status: 'already-recovered', files: [] },
  )
  const drift = materialize(Buffer.concat([raw, Buffer.from('\n')]), 'target119-hook-drift-')
  assert.throws(
    () =>
      applyTarget119HookBackgroundSkipSpillSourceRecovery({
        sourceRoot: drift.sourceRoot,
      }),
    /requires exact raw or recovered/,
  )
  const selectedBytes = fs.readFileSync(sourceFilename(configuredSourceRoot))
  assert.equal(
    [fixture.inputs.source.input, fixture.inputs.source.output].some(expected =>
      same(descriptor(selectedBytes), expected),
    ),
    true,
  )
})

test('recovered execution passes skipSpill only on the registered background path', { skip: !selected }, async () => {
  const ts = await loadTypeScript()
  const output = buildTarget119HookBackgroundSkipSpillOutput(gitSource())
  const parsed = sourceFile(ts, output)
  const declaration = executeDeclaration(
    ts,
    parsed,
    output,
    fixture.inputs.source.outputDeclaration,
  )
  const source = output.subarray(declaration.getStart(parsed), declaration.end).toString()
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
    },
  }).outputText
  const registrations = []
  const context = {
    setImmediate,
    emitHookResponse() {},
    enqueuePendingNotification() {},
    wrapInSystemReminder(value) { return value },
    registerPendingAsyncHook(value) { registrations.push(value) },
  }
  vm.runInNewContext(`${javascript}\nglobalThis.execute = executeInBackground`, context)
  const calls = []
  const shellCommand = {
    background(...args) {
      calls.push(args)
      return true
    },
  }
  const result = context.execute({
    processId: 'pid',
    hookId: 'hook',
    shellCommand,
    asyncResponse: {},
    hookEvent: 'Stop',
    hookName: 'name',
    command: 'command',
    pluginId: 'plugin',
  })
  assert.equal(result, true)
  assert.deepEqual(
    calls.map(([processId, options]) => [
      processId,
      { skipSpill: options.skipSpill },
    ]),
    [['pid', { skipSpill: true }]],
  )
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].shellCommand, shellCommand)

  calls.length = 0
  registrations.length = 0
  shellCommand.background = (...args) => {
    calls.push(args)
    return false
  }
  assert.equal(
    context.execute({
      processId: 'pid',
      hookId: 'hook',
      shellCommand,
      asyncResponse: {},
      hookEvent: 'Stop',
      hookName: 'name',
      command: 'command',
    }),
    false,
  )
  assert.deepEqual(
    calls.map(([processId, options]) => [
      processId,
      { skipSpill: options.skipSpill },
    ]),
    [['pid', { skipSpill: true }]],
  )
  assert.equal(registrations.length, 0)
})
