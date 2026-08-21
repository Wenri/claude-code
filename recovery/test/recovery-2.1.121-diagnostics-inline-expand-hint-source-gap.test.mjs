import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import vm from 'node:vm'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  applyTarget121DiagnosticsHintSourceRecovery,
  buildTarget121DiagnosticsHintOutput,
  TARGET121_DIAGNOSTICS_HINT_INPUT_FILES,
  TARGET121_DIAGNOSTICS_HINT_OUTPUT_FILES,
  TARGET121_DIAGNOSTICS_HINT_OWNER_OVERRIDES,
} from '../cases/2.1.120-to-2.1.121/recovered/replay-diagnostics-inline-expand-hint-source-gap.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.121-diagnostics-inline-expand-hint-source-gap.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })
const artifactDescriptor = row => ({ bytes: row.bytes, sha256: row.sha256 })
const unitDescriptor = row => ({ bytes: row.bytes, sha256: row.sourceHash })
const occurrenceCount = (source, needle) => source.split(needle).length - 1

let typescriptPromise
function loadTypeScript() {
  typescriptPromise ??= import(
    pathToFileURL(
      path.join(
        root,
        fixture.wholeUnitProof.typescript.path,
      ),
    ).href
  ).then(imported => imported.default ?? imported)
  return typescriptPromise
}

function sourceFile(ts, source) {
  const parsed = ts.createSourceFile(
    fixture.inputs.sourceFile.path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(parsed.parseDiagnostics.length, 0)
  return parsed
}

function functionDeclaration(ts, parsed, name) {
  const matches = parsed.statements.filter(
    statement =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  )
  assert.equal(matches.length, 1, name)
  return matches[0]
}

function parseUnit(bundle, unit) {
  const value = bundle.subarray(unit.start, unit.end)
  assert.deepEqual(descriptor(value), unitDescriptor(unit))
  const ast = parse(value.toString(), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  })
  assert.equal(ast.body.length, 1)
  assert.equal(ast.body[0].type, unit.nodeType)
  return { ast: ast.body[0], source: value.toString() }
}

function normalizedStatements(node) {
  const statements = node?.type === 'BlockStatement' ? node.body : [node]
  const result = []
  for (const statement of statements) {
    if (
      statement?.type === 'ExpressionStatement' &&
      statement.expression?.type === 'SequenceExpression'
    ) {
      for (const expression of statement.expression.expressions) {
        result.push({ type: 'ExpressionStatement', expression })
      }
    } else if (statement?.type === 'VariableDeclaration') {
      for (const declaration of statement.declarations) {
        result.push({
          type: 'VariableDeclaration',
          kind: 'var',
          declarations: [declaration],
        })
      }
    } else {
      result.push(statement)
    }
  }
  return result
}

// The frozen source is React-compiler output while the production bundle also
// applies namespace-import lowering and statement compaction. Normalize only
// those mechanics: positions/raw spelling, private identifiers, declaration
// grouping/kind, sequence-vs-block bodies, property shorthand, React's
// namespace `.default`, and compiler-runtime's imported `.c` member.
function canonicalAst(node, parent = null, key = null) {
  if (Array.isArray(node)) {
    return node.map(child => canonicalAst(child, parent, key))
  }
  if (!node || typeof node !== 'object') return node
  if (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.object?.type === 'MemberExpression' &&
    !node.object.computed &&
    node.object.property?.name === 'default'
  ) {
    return canonicalAst({ ...node, object: node.object.object }, parent, key)
  }
  if (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.property?.name === 'c'
  ) {
    return { type: 'Identifier', name: '@id' }
  }
  if (node.type === 'Identifier') {
    const semanticName =
      (parent?.type === 'MemberExpression' &&
        key === 'property' &&
        !parent.computed) ||
      (parent?.type === 'Property' && key === 'key' && !parent.computed)
    return { type: 'Identifier', name: semanticName ? node.name : '@id' }
  }
  if (node.type === 'BlockStatement') {
    return {
      type: 'BlockStatement',
      body: canonicalAst(normalizedStatements(node), node, 'body'),
    }
  }
  if (node.type === 'VariableDeclaration') {
    return {
      type: 'VariableDeclaration',
      kind: 'var',
      declarations: canonicalAst(node.declarations, node, 'declarations'),
    }
  }
  if (node.type === 'Property') {
    return {
      type: 'Property',
      method: node.method,
      shorthand: false,
      computed: node.computed,
      key: canonicalAst(node.key, node, 'key'),
      value: canonicalAst(node.value, node, 'value'),
      kind: node.kind,
    }
  }
  if (node.type === 'IfStatement') {
    return {
      type: 'IfStatement',
      test: canonicalAst(node.test, node, 'test'),
      consequent: canonicalAst(
        normalizedStatements(node.consequent),
        node,
        'consequent',
      ),
      alternate: node.alternate
        ? canonicalAst(normalizedStatements(node.alternate), node, 'alternate')
        : null,
    }
  }
  const result = {}
  for (const [childKey, child] of Object.entries(node)) {
    if (!['start', 'end', 'loc', 'range', 'raw'].includes(childKey)) {
      result[childKey] = canonicalAst(child, node, childKey)
    }
  }
  return result
}

function compileRecoveredDeclaration(ts, declaration) {
  const javascript = ts.transpileModule(
    declaration.replace('export function', 'function'),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.React,
        removeComments: true,
        alwaysStrict: false,
      },
    },
  ).outputText
  const executable = path.join(root, fixture.wholeUnitProof.compiler.path)
  const program = [
    'const input = await Bun.stdin.text()',
    `const transpiler = new Bun.Transpiler(${JSON.stringify(
      fixture.wholeUnitProof.compiler.options,
    )})`,
    'process.stdout.write(await transpiler.transform(input))',
  ].join(';')
  const result = spawnSync(executable, ['-e', program], {
    cwd: root,
    encoding: null,
    input: Buffer.from(javascript),
  })
  assert.equal(result.status, 0, result.stderr?.toString())
  return result.stdout.toString()
}

function materializeRawSource() {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target121-diagnostics-hint-'),
  )
  const sourceRoot = path.join(temporary, 'src')
  const result = spawnSync(
    'git',
    ['show', `${fixture.sourceCommit}:${fixture.sourceBlob.path}`],
    { cwd: root, encoding: null },
  )
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), fixture.inputs.sourceFile.input)
  const filename = path.join(sourceRoot, fixture.sourceBlob.path.slice(4))
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, result.stdout)
  return {
    filename,
    source: result.stdout.toString(),
    sourceRoot,
    temporary,
  }
}

function regionDescriptor(source, region) {
  return descriptor(Buffer.from(source.slice(region.charStart, region.charEnd)))
}

function renderer(source, name, target) {
  let cache
  const createElement = (type, props, ...children) => ({
    type,
    props: props ?? null,
    children,
  })
  const compilerCache = size => {
    cache ??= Array(size)
    assert.equal(cache.length, size)
    return cache
  }
  const context = target
    ? {
        NL7: { c: compilerCache },
        gx: { default: { createElement } },
        p: 'Box',
        k: 'Text',
        j8: 'MessageResponse',
        KW1: (sum, file) => sum + file.diagnostics.length,
        $W1: (file, index) => ({ detail: file.id, index }),
      }
    : {
        _c: compilerCache,
        React: { createElement },
        Box: 'Box',
        Text: 'Text',
        MessageResponse: 'MessageResponse',
        _temp: (sum, file) => sum + file.diagnostics.length,
        _temp3: (file, index) => ({ detail: file.id, index }),
      }
  vm.createContext(context)
  vm.runInContext(`${source};globalThis.render=${name}`, context)
  return { cache: () => cache, render: context.render }
}

function baselineRenderer(source) {
  let cache
  const createElement = (type, props, ...children) => ({
    type,
    props: props ?? null,
    children,
  })
  const context = {
    VX7: {
      c: size => {
        cache ??= Array(size).fill(Symbol.for('react.memo_cache_sentinel'))
        assert.equal(cache.length, size)
        return cache
      },
    },
    SS: { default: { createElement } },
    p: 'Box',
    V: 'Text',
    zw: 'CtrlOToExpand',
    j8: 'MessageResponse',
    hJ_: (sum, file) => sum + file.diagnostics.length,
    yJ_: (file, index) => ({ detail: file.id, index }),
  }
  vm.createContext(context)
  vm.runInContext(`${source};globalThis.render=NX7`, context)
  return { cache: () => cache, render: context.render }
}

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

test('fixture freezes the exact u12768 strict-row evolution', () => {
  assert.equal(
    sha256(fixtureBytes),
    '83d84bf43d84e9f55e0e28c848eb4157c350505518e608cd29959fe4fabe90f5',
  )
  assert.equal(fixture.schemaVersion, 1)
  assert.deepEqual(TARGET121_DIAGNOSTICS_HINT_INPUT_FILES, [
    { path: fixture.inputs.sourceFile.path, ...fixture.inputs.sourceFile.input },
  ])
  assert.deepEqual(TARGET121_DIAGNOSTICS_HINT_OUTPUT_FILES, [
    { path: fixture.inputs.sourceFile.path, ...fixture.inputs.sourceFile.output },
  ])
  assert.deepEqual(
    TARGET121_DIAGNOSTICS_HINT_OWNER_OVERRIDES.map(row => ({
      declarations: [...row.declarations],
      paths: [...row.paths],
      targetIndex: row.targetIndex,
    })),
    [
      {
        declarations: fixture.strictRows[0].declarations,
        paths: [fixture.strictRows[0].ownerPath],
        targetIndex: 12768,
      },
    ],
  )
  const helper = fs.readFileSync(path.join(root, fixture.inputs.replayHelper.path))
  assert.deepEqual(descriptor(helper), artifactDescriptor(fixture.inputs.replayHelper))

  const { before, after } = fixture.strictEvolution
  assert.equal(before.indices.length, before.units)
  assert.equal(after.indices.length, after.units)
  assert.equal(sha256(JSON.stringify(before.indices)), before.indicesSha256)
  assert.equal(sha256(JSON.stringify(after.indices)), after.indicesSha256)
  assert.deepEqual(after.indices, before.indices.filter(index => index !== 12768))
  assert.equal(before.units - after.units, 1)
  assert.equal(before.residues - after.residues, 1)

  const identity = fixture.strictRows.map(row => [
    row.targetIndex,
    row.literalKind,
    row.value,
    row.start,
    row.end,
    row.targetOccurrenceNumber,
  ])
  assert.equal(sha256(JSON.stringify(identity)), fixture.strictRowsIdentitySha256)
})

test('authenticated bundles freeze the whole display-unit evolution', () => {
  const baselineBundle = fs.readFileSync(
    path.join(root, fixture.inputs.baselineBundle.path),
  )
  const targetBundle = fs.readFileSync(
    path.join(root, fixture.inputs.targetBundle.path),
  )
  assert.deepEqual(
    descriptor(baselineBundle),
    artifactDescriptor(fixture.inputs.baselineBundle),
  )
  assert.deepEqual(
    descriptor(targetBundle),
    artifactDescriptor(fixture.inputs.targetBundle),
  )
  const baseline = parseUnit(baselineBundle, fixture.baselineUnit)
  const target = parseUnit(targetBundle, fixture.targetUnit)
  assert.match(baseline.source, /\.c\(14\)/)
  assert.match(baseline.source, /Symbol\.for\("react\.memo_cache_sentinel"\)/)
  assert.doesNotMatch(baseline.source, /isTranscriptMode|ctrl\+o to expand/)
  assert.match(target.source, /\.c\(13\)/)
  assert.match(target.source, /isTranscriptMode/)
  assert.match(target.source, /if\([^)]*\|\|[^)]*\)/)
  assert.equal(occurrenceCount(target.source, ' (ctrl+o to expand)'), 1)
  assert.doesNotMatch(target.source, /react\.memo_cache_sentinel/)

  for (const row of fixture.bundleFragments) {
    const bundle = row.bundle === 'baseline' ? baselineBundle : targetBundle
    const value = bundle.subarray(row.start, row.end)
    assert.deepEqual(descriptor(value), artifactDescriptor(row), row.name)
    assert.equal(value.toString(), row.text, row.name)
  }
  for (const row of Object.values(fixture.moduleInitializers)) {
    const bundle = row === fixture.moduleInitializers.baseline
      ? baselineBundle
      : targetBundle
    parseUnit(bundle, row)
  }
  assert.equal(
    fixture.moduleInitializers.baseline.coarseHash,
    fixture.moduleInitializers.target.coarseHash,
  )
})

test('structural ledger leaves exactly the authenticated pair unresolved', () => {
  const bytes = fs.readFileSync(
    path.join(root, fixture.inputs.structuralLedger.path),
  )
  assert.deepEqual(descriptor(bytes), artifactDescriptor(fixture.inputs.structuralLedger))
  const ledger = JSON.parse(gunzipSync(bytes))
  const target = ledger.unresolvedTarget.filter(
    row => row.target.index === fixture.targetUnit.index,
  )
  assert.equal(target.length, 1)
  assert.deepEqual(
    {
      ...target[0].target,
      bytes: target[0].target.end - target[0].target.start,
    },
    {
      index: fixture.targetUnit.index,
      nodeType: fixture.targetUnit.nodeType,
      parseStatus: 'parsed',
      start: fixture.targetUnit.start,
      end: fixture.targetUnit.end,
      tokenCount: fixture.targetUnit.tokenCount,
      sourceHash: fixture.targetUnit.sourceHash,
      coarseHash: fixture.targetUnit.coarseHash,
      location: target[0].target.location,
      topDefinitionCount: target[0].target.topDefinitionCount,
      bytes: fixture.targetUnit.bytes,
    },
  )
  assert.equal(
    target[0].unknownFreeIdentifierCount,
    fixture.targetUnit.unknownFreeIdentifierCount,
  )
  const baseline = ledger.unmatchedBaseline.filter(
    row => row.index === fixture.baselineUnit.index,
  )
  assert.equal(baseline.length, 1)
  assert.deepEqual(
    {
      index: baseline[0].index,
      nodeType: baseline[0].nodeType,
      start: baseline[0].start,
      end: baseline[0].end,
      tokenCount: baseline[0].tokenCount,
      sourceHash: baseline[0].sourceHash,
      coarseHash: baseline[0].coarseHash,
    },
    {
      index: fixture.baselineUnit.index,
      nodeType: fixture.baselineUnit.nodeType,
      start: fixture.baselineUnit.start,
      end: fixture.baselineUnit.end,
      tokenCount: fixture.baselineUnit.tokenCount,
      sourceHash: fixture.baselineUnit.sourceHash,
      coarseHash: fixture.baselineUnit.coarseHash,
    },
  )
})

test('bounded source replay removes only the stale component/cache surface', async () => {
  const ts = await loadTypeScript()
  const rawResult = spawnSync(
    'git',
    ['show', `${fixture.sourceCommit}:${fixture.sourceBlob.path}`],
    { cwd: root, encoding: null },
  )
  assert.equal(rawResult.status, 0, rawResult.stderr?.toString())
  assert.deepEqual(descriptor(rawResult.stdout), fixture.inputs.sourceFile.input)
  const raw = rawResult.stdout.toString()
  const recovered = buildTarget121DiagnosticsHintOutput(raw)
  assert.deepEqual(
    descriptor(Buffer.from(recovered)),
    fixture.inputs.sourceFile.output,
  )
  assert.equal(occurrenceCount(raw, "from './CtrlOToExpand.js'"), 1)
  assert.equal(occurrenceCount(raw, '<CtrlOToExpand />'), 1)
  assert.equal(occurrenceCount(raw, 'const $ = _c(14);'), 1)
  assert.equal(occurrenceCount(recovered, "from './CtrlOToExpand.js'"), 0)
  assert.equal(occurrenceCount(recovered, '<CtrlOToExpand />'), 0)
  assert.equal(occurrenceCount(recovered, 'const $ = _c(13);'), 1)
  assert.equal(occurrenceCount(recovered, ' (ctrl+o to expand)'), 1)
  assert.equal(occurrenceCount(recovered, 'verbose || isTranscriptMode'), 1)

  const rawParsed = sourceFile(ts, raw)
  const recoveredParsed = sourceFile(ts, recovered)
  const rawDeclaration = functionDeclaration(ts, rawParsed, 'DiagnosticsDisplay')
  const recoveredDeclaration = functionDeclaration(
    ts,
    recoveredParsed,
    'DiagnosticsDisplay',
  )
  assert.deepEqual(
    descriptor(Buffer.from(rawDeclaration.getText(rawParsed))),
    artifactDescriptor(fixture.sourceRegions.rawDeclaration),
  )
  assert.deepEqual(
    descriptor(Buffer.from(recoveredDeclaration.getText(recoveredParsed))),
    artifactDescriptor(fixture.sourceRegions.recoveredDeclaration),
  )
  for (const key of ['rawImport', 'rawCache', 'rawSummary']) {
    assert.deepEqual(
      regionDescriptor(raw, fixture.sourceRegions[key]),
      artifactDescriptor(fixture.sourceRegions[key]),
      key,
    )
  }
  for (const key of ['recoveredCache', 'recoveredSummary', 'recoveredHint']) {
    assert.deepEqual(
      regionDescriptor(recovered, fixture.sourceRegions[key]),
      artifactDescriptor(fixture.sourceRegions[key]),
      key,
    )
  }
  const rawTail = raw.slice(fixture.sourceRegions.sourceMapTail.rawCharStart)
  const recoveredTail = recovered.slice(
    fixture.sourceRegions.sourceMapTail.recoveredCharStart,
  )
  assert.equal(rawTail, recoveredTail)
  assert.deepEqual(
    descriptor(Buffer.from(rawTail)),
    artifactDescriptor(fixture.sourceRegions.sourceMapTail),
  )
})

test('recovered declaration is the complete target u12768 semantic AST', async () => {
  const ts = await loadTypeScript()
  const raw = spawnSync(
    'git',
    ['show', `${fixture.sourceCommit}:${fixture.sourceBlob.path}`],
    { cwd: root, encoding: 'utf8' },
  ).stdout
  const recovered = buildTarget121DiagnosticsHintOutput(raw)
  const parsed = sourceFile(ts, recovered)
  const declaration = functionDeclaration(ts, parsed, 'DiagnosticsDisplay')
  const compiled = compileRecoveredDeclaration(ts, declaration.getText(parsed))
  assert.deepEqual(
    descriptor(Buffer.from(compiled)),
    {
      bytes: fixture.wholeUnitProof.compiledBytes,
      sha256: fixture.wholeUnitProof.compiledSha256,
    },
  )
  const compiledAst = parse(compiled, {
    ecmaVersion: 'latest',
    sourceType: 'script',
  }).body.find(statement => statement.type === 'FunctionDeclaration')
  assert.ok(compiledAst)
  const targetBundle = fs.readFileSync(
    path.join(root, fixture.inputs.targetBundle.path),
  )
  const targetAst = parseUnit(targetBundle, fixture.targetUnit).ast
  const compiledCanonical = JSON.stringify(canonicalAst(compiledAst))
  const targetCanonical = JSON.stringify(canonicalAst(targetAst))
  assert.equal(compiledCanonical, targetCanonical)
  assert.deepEqual(
    descriptor(Buffer.from(compiledCanonical)),
    {
      bytes: fixture.wholeUnitProof.canonicalBytes,
      sha256: fixture.wholeUnitProof.canonicalSha256,
    },
  )
})

test('source replay and authenticated target agree across summary and detail modes', async () => {
  const ts = await loadTypeScript()
  const raw = spawnSync(
    'git',
    ['show', `${fixture.sourceCommit}:${fixture.sourceBlob.path}`],
    { cwd: root, encoding: 'utf8' },
  ).stdout
  const recovered = buildTarget121DiagnosticsHintOutput(raw)
  const parsed = sourceFile(ts, recovered)
  const declaration = functionDeclaration(ts, parsed, 'DiagnosticsDisplay')
  const compiled = compileRecoveredDeclaration(ts, declaration.getText(parsed))
  const targetBundle = fs.readFileSync(
    path.join(root, fixture.inputs.targetBundle.path),
  )
  const baselineBundle = fs.readFileSync(
    path.join(root, fixture.inputs.baselineBundle.path),
  )
  const targetSource = parseUnit(targetBundle, fixture.targetUnit).source
  const baselineSource = parseUnit(baselineBundle, fixture.baselineUnit).source

  const cases = [
    { attachment: { files: [] }, verbose: false, isTranscriptMode: false },
    {
      attachment: { files: [{ id: 'one', diagnostics: [{}, {}] }] },
      verbose: false,
      isTranscriptMode: false,
    },
    {
      attachment: { files: [{ id: 'one', diagnostics: [{}] }] },
      verbose: true,
      isTranscriptMode: false,
    },
    {
      attachment: { files: [{ id: 'one', diagnostics: [{}] }] },
      verbose: false,
      isTranscriptMode: true,
    },
  ]
  for (const props of cases) {
    const source = renderer(compiled, 'DiagnosticsDisplay', false)
    const target = renderer(targetSource, 'EL7', true)
    assert.deepEqual(plain(source.render(props)), plain(target.render(props)))
    assert.equal(source.cache().length, 13)
    assert.equal(target.cache().length, 13)
  }

  const summaryProps = cases[1]
  const source = renderer(compiled, 'DiagnosticsDisplay', false)
  const target = renderer(targetSource, 'EL7', true)
  const sourceFirst = source.render(summaryProps)
  const targetFirst = target.render(summaryProps)
  assert.equal(source.render(summaryProps), sourceFirst)
  assert.equal(target.render(summaryProps), targetFirst)
  assert.match(JSON.stringify(sourceFirst), / \(ctrl\+o to expand\)/)
  assert.doesNotMatch(JSON.stringify(sourceFirst), /CtrlOToExpand/)

  const baseline = baselineRenderer(baselineSource)
  const baselineSummary = plain(baseline.render(summaryProps))
  assert.equal(baseline.cache().length, 14)
  assert.match(JSON.stringify(baselineSummary), /CtrlOToExpand/)
  assert.doesNotMatch(JSON.stringify(baselineSummary), /ctrl\+o to expand/)
  const targetTranscript = renderer(targetSource, 'EL7', true)
  const baselineTranscript = baselineRenderer(baselineSource)
  assert.equal(plain(targetTranscript.render(cases[3])).type, 'Box')
  assert.equal(plain(baselineTranscript.render(cases[3])).type, 'MessageResponse')
})

test('replay is exact, idempotent, and fails closed on altered inputs', () => {
  const raw = materializeRawSource()
  try {
    assert.deepEqual(
      applyTarget121DiagnosticsHintSourceRecovery({
        sourceRoot: raw.sourceRoot,
      }),
      { status: 'recovered', files: [fixture.inputs.sourceFile.path] },
    )
    const recovered = fs.readFileSync(raw.filename)
    assert.deepEqual(descriptor(recovered), fixture.inputs.sourceFile.output)
    assert.deepEqual(
      applyTarget121DiagnosticsHintSourceRecovery({
        sourceRoot: raw.sourceRoot,
      }),
      { status: 'already-recovered', files: [] },
    )
    const altered = Buffer.from(recovered)
    altered[100] ^= 1
    fs.writeFileSync(raw.filename, altered)
    assert.throws(
      () =>
        applyTarget121DiagnosticsHintSourceRecovery({
          sourceRoot: raw.sourceRoot,
        }),
      /requires exact raw or recovered/,
    )
  } finally {
    fs.rmSync(raw.temporary, { recursive: true, force: true })
  }

  assert.throws(
    () => buildTarget121DiagnosticsHintOutput('const unrelated = true\n'),
    /CtrlOToExpand import expected one anchor, got 0/,
  )
  assert.throws(
    () => applyTarget121DiagnosticsHintSourceRecovery(),
    /sourceRoot is required/,
  )
})
