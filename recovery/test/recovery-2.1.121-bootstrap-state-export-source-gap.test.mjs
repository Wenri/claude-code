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
  applyTarget121BootstrapStateExportSourceRecovery,
  TARGET121_BOOTSTRAP_STATE_EXPORT_INPUT_FILE,
  TARGET121_BOOTSTRAP_STATE_EXPORT_OUTPUT_FILE,
  TARGET121_BOOTSTRAP_STATE_EXPORT_OWNER_OVERRIDES,
} from '../cases/2.1.120-to-2.1.121/recovered/replay-bootstrap-state-export-source-gap.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.121-bootstrap-state-export-source-gap.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })

let typescriptPromise
function loadTypeScript() {
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

function materializeRawState() {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target121-bootstrap-state-export-'),
  )
  const sourceRoot = path.join(temporary, 'src')
  const filename = path.join(sourceRoot, 'bootstrap/state.ts')
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  const result = spawnSync(
    'git',
    ['show', `${fixture.sourceCommit}:${fixture.inputs.sourceFile.path}`],
    { cwd: root, encoding: null },
  )
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), fixture.inputs.sourceFile.input)
  fs.writeFileSync(filename, result.stdout)
  return { temporary, sourceRoot, filename }
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (!['start', 'end', 'loc', 'range'].includes(key)) walk(child, visit)
  }
}

function acornPath(node) {
  if (node?.type === 'Identifier') return node.name
  if (
    node?.type === 'MemberExpression' &&
    !node.computed &&
    node.property?.type === 'Identifier'
  ) {
    return `${acornPath(node.object)}.${node.property.name}`
  }
  return undefined
}

function assertTargetDefinition(node, binding) {
  assert.equal(node.type, 'FunctionDeclaration')
  assert.equal(node.id?.name, binding.localName)
  const statement = node.body.body[0]
  assert.equal(node.body.body.length, 1)
  if (binding.exportName === 'resetStartTime') {
    assert.equal(node.params.length, 0)
    assert.equal(statement.type, 'ExpressionStatement')
    assert.equal(statement.expression.type, 'AssignmentExpression')
    assert.equal(acornPath(statement.expression.left), 'g$.startTime')
    assert.equal(statement.expression.operator, '=')
    assert.equal(statement.expression.right.type, 'CallExpression')
    assert.equal(acornPath(statement.expression.right.callee), 'Date.now')
    assert.equal(statement.expression.right.arguments.length, 0)
    return
  }

  const isGetter = binding.exportName === 'getThinkingTypeOverride'
  assert.deepEqual(
    node.params.map(parameter => parameter.name),
    isGetter ? ['H'] : ['H', '$'],
  )
  const call = isGetter ? statement.argument : statement.expression
  assert.equal(
    statement.type,
    isGetter ? 'ReturnStatement' : 'ExpressionStatement',
  )
  assert.equal(call.type, 'CallExpression')
  assert.equal(
    acornPath(call.callee),
    `g$.thinkingTypeOverrides.${isGetter ? 'get' : 'set'}`,
  )
  assert.deepEqual(
    call.arguments.map(argument => argument.name),
    isGetter ? ['H'] : ['H', '$'],
  )
}

function sourceDeclarationMap(ts, text) {
  const parsed = ts.createSourceFile(
    'state.ts',
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(parsed.parseDiagnostics.length, 0)
  const wanted = new Set(fixture.sourceDeclarations.map(row => row.name))
  const declarations = new Map()
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && wanted.has(node.name?.text)) {
      assert(!declarations.has(node.name.text), node.name.text)
      declarations.set(node.name.text, node)
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  assert.equal(declarations.size, wanted.size)
  return { parsed, declarations }
}

function tsPropertyPath(ts, node) {
  if (ts.isIdentifier(node)) return node.text
  if (ts.isPropertyAccessExpression(node)) {
    return `${tsPropertyPath(ts, node.expression)}.${node.name.text}`
  }
  return undefined
}

function assertSourceDeclaration(ts, parsed, declaration, expectedName) {
  assert(
    declaration.modifiers?.some(
      modifier => modifier.kind === ts.SyntaxKind.ExportKeyword,
    ),
  )
  const statement = declaration.body?.statements[0]
  assert.equal(declaration.body?.statements.length, 1)
  if (expectedName === 'resetStartTime') {
    assert.equal(declaration.parameters.length, 0)
    assert(ts.isExpressionStatement(statement))
    assert(ts.isBinaryExpression(statement.expression))
    assert.equal(
      statement.expression.operatorToken.kind,
      ts.SyntaxKind.EqualsToken,
    )
    assert.equal(tsPropertyPath(ts, statement.expression.left), 'STATE.startTime')
    assert(ts.isCallExpression(statement.expression.right))
    assert.equal(tsPropertyPath(ts, statement.expression.right.expression), 'Date.now')
    assert.equal(statement.expression.right.arguments.length, 0)
    return
  }

  const isGetter = expectedName === 'getThinkingTypeOverride'
  assert.deepEqual(
    declaration.parameters.map(parameter => parameter.name.getText(parsed)),
    isGetter ? ['model'] : ['model', 'type'],
  )
  const call = isGetter
    ? assertReturnCall(ts, statement)
    : assertExpressionCall(ts, statement)
  assert.equal(
    tsPropertyPath(ts, call.expression),
    `STATE.thinkingTypeOverrides.${isGetter ? 'get' : 'set'}`,
  )
  assert.deepEqual(
    call.arguments.map(argument => argument.getText(parsed)),
    isGetter ? ['model'] : ['model', 'type'],
  )
}

function assertReturnCall(ts, statement) {
  assert(ts.isReturnStatement(statement))
  assert(ts.isCallExpression(statement.expression))
  return statement.expression
}

function assertExpressionCall(ts, statement) {
  assert(ts.isExpressionStatement(statement))
  assert(ts.isCallExpression(statement.expression))
  return statement.expression
}

test('Target121 bootstrap-state fixture freezes one exact source-gap unit', () => {
  assert.equal(
    sha256(fixtureBytes),
    'fafd8728a6886a0a7e21b8483e8929ca56504663bd55cc721a887dca4a2acd46',
  )
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.120-to-2.1.121')
  assert.deepEqual(fixture.summary, {
    units: 1,
    residues: 3,
    indicesSha256: sha256(JSON.stringify([fixture.row.targetIndex])),
    residueIdentitiesSha256: sha256(
      JSON.stringify(fixture.row.residueIdentities),
    ),
  })
  assert.deepEqual(TARGET121_BOOTSTRAP_STATE_EXPORT_INPUT_FILE, {
    path: fixture.inputs.sourceFile.path,
    ...fixture.inputs.sourceFile.input,
  })
  assert.deepEqual(TARGET121_BOOTSTRAP_STATE_EXPORT_OUTPUT_FILE, {
    path: fixture.inputs.sourceFile.path,
    ...fixture.inputs.sourceFile.output,
  })
  assert.deepEqual(
    TARGET121_BOOTSTRAP_STATE_EXPORT_OWNER_OVERRIDES.map(row => ({
      targetIndex: row.targetIndex,
      paths: [...row.paths],
      evidenceIds: [...row.evidenceIds],
    })),
    [
      {
        targetIndex: fixture.row.targetIndex,
        paths: [fixture.row.ownerPath],
        evidenceIds: fixture.row.evidenceIds,
      },
    ],
  )
})

test('authenticated export getters bind the three complete target functions', () => {
  const baselineBundle = fs.readFileSync(
    path.join(root, fixture.inputs.baselineBundle.path),
  )
  const targetBundle = fs.readFileSync(
    path.join(root, fixture.inputs.targetBundle.path),
  )
  const ledgerBytes = fs.readFileSync(
    path.join(root, fixture.inputs.structuralLedger.path),
  )
  assert.deepEqual(
    descriptor(baselineBundle),
    (({ bytes, sha256 }) => ({ bytes, sha256 }))(
      fixture.inputs.baselineBundle,
    ),
  )
  assert.deepEqual(
    descriptor(targetBundle),
    (({ bytes, sha256 }) => ({ bytes, sha256 }))(
      fixture.inputs.targetBundle,
    ),
  )
  assert.deepEqual(
    descriptor(ledgerBytes),
    (({ bytes, sha256 }) => ({ bytes, sha256 }))(
      fixture.inputs.structuralLedger,
    ),
  )

  const ledger = JSON.parse(gunzipSync(ledgerBytes))
  const region = ledger.regions.find(
    candidate => candidate.target?.index === fixture.row.targetIndex,
  )
  assert(region)
  assert.deepEqual(
    {
      targetIndex: region.target.index,
      nodeType: region.target.nodeType,
      start: region.target.start,
      end: region.target.end,
      sourceHash: region.target.sourceHash,
      coarseHash: region.target.coarseHash,
    },
    {
      targetIndex: fixture.row.targetIndex,
      nodeType: fixture.row.nodeType,
      start: fixture.row.start,
      end: fixture.row.end,
      sourceHash: fixture.row.sourceHash,
      coarseHash: fixture.row.coarseHash,
    },
  )
  const targetSlice = targetBundle.subarray(fixture.row.start, fixture.row.end)
  assert.deepEqual(descriptor(targetSlice), {
    bytes: fixture.row.bytes,
    sha256: fixture.row.targetSliceSha256,
  })

  const unitAst = parse(targetSlice.toString('utf8'), {
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  assert.equal(unitAst.body.length, 1)
  assert.equal(unitAst.body[0].type, fixture.row.nodeType)
  const properties = []
  walk(unitAst, node => {
    if (node.type === 'Property') properties.push(node)
  })
  for (const binding of fixture.targetBindings) {
    assert.equal(baselineBundle.toString('utf8').includes(binding.exportName), false)
    assert.equal(
      targetBundle.toString('utf8').split(binding.exportName).length - 1,
      1,
    )
    const matches = properties.filter(
      property => (property.key.name ?? property.key.value) === binding.exportName,
    )
    assert.equal(matches.length, 1)
    const property = matches[0]
    assert.equal(property.start + fixture.row.start, binding.propertyStart)
    assert.equal(property.end + fixture.row.start, binding.propertyEnd)
    assert.equal(property.value.type, 'ArrowFunctionExpression')
    assert.equal(property.value.params.length, 0)
    assert.equal(property.value.body.type, 'Identifier')
    assert.equal(property.value.body.name, binding.localName)

    const definitionBytes = targetBundle.subarray(
      binding.definition.start,
      binding.definition.end,
    )
    assert.deepEqual(descriptor(definitionBytes), {
      bytes: binding.definition.bytes,
      sha256: binding.definition.sha256,
    })
    const definitionAst = parse(definitionBytes.toString('utf8'), {
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    assert.equal(definitionAst.body.length, 1)
    assertTargetDefinition(definitionAst.body[0], binding)
  }

  for (const [targetIndex, kind, value, start, end, occurrence] of fixture.row
    .residueIdentities) {
    assert.equal(targetIndex, fixture.row.targetIndex)
    assert.equal(kind, 'property')
    assert.equal(occurrence, 1)
    assert(start >= fixture.row.start && end <= fixture.row.end)
    assert.equal(targetBundle.subarray(start, end).toString('utf8'), value)
  }
})

test('bootstrap-state replay is exact, typed, idempotent, and fail-closed', async t => {
  const ts = await loadTypeScript()
  const { temporary, sourceRoot, filename } = materializeRawState()
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  assert.deepEqual(
    applyTarget121BootstrapStateExportSourceRecovery({ sourceRoot }),
    { status: 'recovered', files: [fixture.inputs.sourceFile.path] },
  )
  assert.deepEqual(
    applyTarget121BootstrapStateExportSourceRecovery({ sourceRoot }),
    { status: 'already-recovered', files: [] },
  )
  const output = fs.readFileSync(filename)
  assert.deepEqual(descriptor(output), fixture.inputs.sourceFile.output)

  const text = output.toString('utf8')
  const { parsed, declarations } = sourceDeclarationMap(ts, text)
  for (const expected of fixture.sourceDeclarations) {
    const declaration = declarations.get(expected.name)
    assert(declaration)
    const declarationText = text.slice(
      declaration.getStart(parsed),
      declaration.end,
    )
    assert.deepEqual(
      {
        charStart: declaration.getStart(parsed),
        charEnd: declaration.end,
        ...descriptor(Buffer.from(declarationText, 'utf8')),
      },
      {
        charStart: expected.charStart,
        charEnd: expected.charEnd,
        bytes: expected.bytes,
        sha256: expected.sha256,
      },
    )
    assertSourceDeclaration(ts, parsed, declaration, expected.name)
  }

  const invalid = materializeRawState()
  t.after(() => fs.rmSync(invalid.temporary, { recursive: true, force: true }))
  fs.appendFileSync(invalid.filename, '\n')
  assert.throws(
    () =>
      applyTarget121BootstrapStateExportSourceRecovery({
        sourceRoot: invalid.sourceRoot,
      }),
    /requires its exact raw or recovered source state/,
  )
})

test('recovered source and authenticated target have equivalent state behavior', async t => {
  const ts = await loadTypeScript()
  const targetBundle = fs.readFileSync(
    path.join(root, fixture.inputs.targetBundle.path),
    'utf8',
  )
  const targetDefinitions = fixture.targetBindings
    .map(binding =>
      targetBundle.slice(binding.definition.start, binding.definition.end),
    )
    .join('\n')
  const targetState = { startTime: 1, thinkingTypeOverrides: new Map() }
  const targetContext = {
    g$: targetState,
    Date: Object.freeze({ now: () => 424242 }),
  }
  vm.runInNewContext(
    `${targetDefinitions}\nglobalThis.api = { resetStartTime: tX8, getThinkingTypeOverride: RL8, setThinkingTypeOverride: CL8 }`,
    targetContext,
  )

  const { temporary, sourceRoot, filename } = materializeRawState()
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  applyTarget121BootstrapStateExportSourceRecovery({ sourceRoot })
  const sourceText = fs.readFileSync(filename, 'utf8')
  const { parsed, declarations } = sourceDeclarationMap(ts, sourceText)
  const sourceDefinitions = fixture.sourceDeclarations
    .map(expected => {
      const declaration = declarations.get(expected.name)
      return sourceText
        .slice(declaration.getStart(parsed), declaration.end)
        .replace(/^export /, '')
    })
    .join('\n')
  const transpiled = ts.transpileModule(
    `const STATE = globalState;\n${sourceDefinitions}\nglobalThis.api = { resetStartTime, getThinkingTypeOverride, setThinkingTypeOverride }`,
    {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
      },
      reportDiagnostics: true,
    },
  )
  assert.equal(
    transpiled.diagnostics?.filter(
      diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
    ).length,
    0,
  )
  const sourceState = { startTime: 1, thinkingTypeOverrides: new Map() }
  const sourceContext = {
    globalState: sourceState,
    Date: Object.freeze({ now: () => 424242 }),
  }
  vm.runInNewContext(transpiled.outputText, sourceContext)

  for (const [model, type] of [
    ['anthropic.claude-opus', 'adaptive'],
    ['arn:aws:bedrock:profile/sonnet', 'enabled'],
  ]) {
    assert.equal(targetContext.api.getThinkingTypeOverride(model), undefined)
    assert.equal(sourceContext.api.getThinkingTypeOverride(model), undefined)
    targetContext.api.setThinkingTypeOverride(model, type)
    sourceContext.api.setThinkingTypeOverride(model, type)
    assert.equal(targetContext.api.getThinkingTypeOverride(model), type)
    assert.equal(sourceContext.api.getThinkingTypeOverride(model), type)
  }
  targetContext.api.resetStartTime()
  sourceContext.api.resetStartTime()
  assert.equal(targetState.startTime, 424242)
  assert.equal(sourceState.startTime, 424242)
  assert.deepEqual(
    [...targetState.thinkingTypeOverrides],
    [...sourceState.thinkingTypeOverrides],
  )
})
