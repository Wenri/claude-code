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
  applyTarget121FileEditUnicodeSourceRecovery,
  buildTarget121FileEditUnicodeOutput,
  TARGET121_FILE_EDIT_UNICODE_INPUT_FILES,
  TARGET121_FILE_EDIT_UNICODE_OUTPUT_FILES,
  TARGET121_FILE_EDIT_UNICODE_OWNER_OVERRIDES,
} from '../cases/2.1.120-to-2.1.121/recovered/replay-file-edit-unicode-escape-case-source-gap.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.121-file-edit-unicode-escape-case-source-gap.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })
const artifactDescriptor = row => ({ bytes: row.bytes, sha256: row.sha256 })
const occurrenceCount = (source, needle) => source.split(needle).length - 1

function targetSourceRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_121_SOURCE_ROOT ??
      process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
      path.join(root, '.recovery-tmp/semantic-trees/2.1.121/src'),
  )
}

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

function sourceFile(ts, source) {
  const parsed = ts.createSourceFile(
    'src/tools/FileEditTool/utils.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
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

function stringUtilsImport(ts, parsed) {
  const matches = parsed.statements.filter(
    statement =>
      ts.isImportDeclaration(statement) &&
      statement.moduleSpecifier.text === 'src/utils/stringUtils.js',
  )
  assert.equal(matches.length, 1)
  return matches[0]
}

function parseUnit(bundle, unit) {
  const value = bundle.subarray(unit.start, unit.end)
  assert.deepEqual(descriptor(value), {
    bytes: unit.bytes,
    sha256: unit.sourceHash,
  })
  const ast = parse(value.toString(), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  })
  assert.equal(ast.body.length, 1)
  assert.equal(ast.body[0].type, unit.nodeType)
  return { ast: ast.body[0], source: value.toString() }
}

function stringConcatParts(node) {
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    return [...stringConcatParts(node.left), ...stringConcatParts(node.right)]
  }
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return [{ type: 'StringPart', value: node.value }]
  }
  return [canonicalAst(node)]
}

function canonicalAst(node, parent = null, key = null) {
  if (Array.isArray(node)) {
    const result = []
    for (const child of node) {
      if (key === 'body' && child?.type === 'VariableDeclaration') {
        for (const declaration of child.declarations) {
          result.push(
            canonicalAst(
              {
                type: 'VariableDeclaration',
                kind: child.kind,
                declarations: [declaration],
              },
              parent,
              key,
            ),
          )
        }
      } else {
        result.push(canonicalAst(child, parent, key))
      }
    }
    return result
  }
  if (!node || typeof node !== 'object') return node
  if (node.type === 'Identifier') {
    const semanticName =
      (parent?.type === 'MemberExpression' &&
        key === 'property' &&
        !parent.computed) ||
      (parent?.type === 'Property' && key === 'key' && !parent.computed) ||
      (parent?.type === 'MethodDefinition' &&
        key === 'key' &&
        !parent.computed)
    return { type: 'Identifier', name: semanticName ? node.name : '@id' }
  }
  if (node.type === 'VariableDeclaration') {
    return {
      type: 'VariableDeclaration',
      kind: 'var',
      declarations: canonicalAst(node.declarations, node, 'declarations'),
    }
  }
  if (node.type === 'TemplateLiteral') {
    const parts = []
    for (let index = 0; index < node.quasis.length; index++) {
      const value =
        node.quasis[index].value.cooked ?? node.quasis[index].value.raw
      if (value !== '') parts.push({ type: 'StringPart', value })
      if (index < node.expressions.length) {
        parts.push(canonicalAst(node.expressions[index], node, 'expressions'))
      }
    }
    return { type: 'Concat', parts }
  }
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    return {
      type: 'Concat',
      parts: stringConcatParts(node).filter(
        part => part.type !== 'StringPart' || part.value !== '',
      ),
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

function compileWithFrozenBun(source) {
  const executable = path.join(root, fixture.wholeUnitProof.compiler.path)
  const program = [
    'const input = await Bun.stdin.text()',
    `const transpiler = new Bun.Transpiler(${JSON.stringify({
      loader: 'ts',
      target: 'bun',
      minifyWhitespace: true,
      minifySyntax: true,
    })})`,
    'process.stdout.write(await transpiler.transform(input))',
  ].join(';')
  const result = spawnSync(executable, ['-e', program], {
    cwd: root,
    encoding: null,
    input: Buffer.from(source),
    maxBuffer: 1024 * 1024,
  })
  assert.equal(result.status, 0, result.stderr?.toString())
  return result.stdout.toString()
}

function materializeRawSource() {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target121-file-edit-unicode-'),
  )
  const sourceRoot = path.join(temporary, 'src')
  const spec = fixture.inputs.sourceFiles[0]
  const result = spawnSync(
    'git',
    ['show', `${fixture.sourceCommit}:${spec.path}`],
    { cwd: root, encoding: null },
  )
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), spec.input)
  const filename = path.join(sourceRoot, spec.path.slice(4))
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, result.stdout)
  return {
    filename,
    source: result.stdout.toString(),
    sourceRoot,
    temporary,
  }
}

function createSourceRuntime(ts, recovered) {
  const parsed = sourceFile(ts, recovered)
  const declarations = fixture.sourceRegions.recoveredDeclarations.map(row =>
    functionDeclaration(ts, parsed, row.name)
      .getText(parsed)
      .replace(/^export /, ''),
  )
  const compiled = compileWithFrozenBun(declarations.join('\n'))
  const context = {
    UNICODE_CHARACTER_REGEX: /[\u0080-\uffff]/,
    UNICODE_ESCAPE_REGEX: /\\u[0-9a-fA-F]{4}/,
    decodeUnicodeEscapes: value =>
      value.replace(
        /(\\\\)|\\u([0-9a-fA-F]{4})/g,
        (match, escapedBackslash, hex) =>
          escapedBackslash !== undefined
            ? match
            : String.fromCharCode(parseInt(hex, 16)),
      ),
    escapeRegExp: value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    normalizeQuotes: value =>
      value
        .replaceAll('‘', "'")
        .replaceAll('’', "'")
        .replaceAll('“', '"')
        .replaceAll('”', '"'),
  }
  vm.createContext(context)
  vm.runInContext(
    `${compiled};globalThis.api={unicodeStringToRegex,preserveUnicodeRepresentation,findActualString}`,
    context,
  )
  return context.api
}

function createTargetRuntime(targetBundle) {
  const units = fixture.targetUnits
    .map(unit => targetBundle.subarray(unit.start, unit.end).toString())
    .join('\n')
  const context = {
    I96: /[\u0080-\uffff]/,
    h96: /\\u[0-9a-fA-F]{4}/,
    V96: value =>
      value.replace(
        /(\\\\)|\\u([0-9a-fA-F]{4})/g,
        (match, escapedBackslash, hex) =>
          escapedBackslash !== undefined
            ? match
            : String.fromCharCode(parseInt(hex, 16)),
      ),
    nl: value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    _QK: value =>
      value
        .replaceAll('‘', "'")
        .replaceAll('’', "'")
        .replaceAll('“', '"')
        .replaceAll('”', '"'),
  }
  vm.createContext(context)
  vm.runInContext(`${units};globalThis.api={AQK,fQK,z2H}`, context)
  return context.api
}

test('fixture freezes the exact u10152 strict-row evolution', () => {
  assert.equal(
    sha256(fixtureBytes),
    'a1e3351f1566f280bab3e3c38df1ba6a4584f927b9d54c01e21fd1359888d13f',
  )
  assert.equal(fixture.schemaVersion, 1)
  assert.deepEqual(
    TARGET121_FILE_EDIT_UNICODE_INPUT_FILES,
    fixture.inputs.sourceFiles.slice(0, 1).map(row => ({
      path: row.path,
      ...row.input,
    })),
  )
  assert.deepEqual(
    TARGET121_FILE_EDIT_UNICODE_OUTPUT_FILES,
    fixture.inputs.sourceFiles.slice(0, 1).map(row => ({
      path: row.path,
      ...row.output,
    })),
  )
  assert.deepEqual(
    TARGET121_FILE_EDIT_UNICODE_OWNER_OVERRIDES.map(row => ({
      declarations: [...row.declarations],
      paths: [...row.paths],
      targetIndex: row.targetIndex,
    })),
    fixture.strictRows.map(row => ({
      declarations: row.declarations,
      paths: [row.ownerPath],
      targetIndex: row.targetIndex,
    })),
  )
  const helper = fs.readFileSync(path.join(root, fixture.inputs.replayHelper.path))
  assert.deepEqual(descriptor(helper), artifactDescriptor(fixture.inputs.replayHelper))

  const { before, after } = fixture.strictEvolution
  assert.equal(before.indices.length, before.units)
  assert.equal(after.indices.length, after.units)
  assert.equal(sha256(JSON.stringify(before.indices)), before.indicesSha256)
  assert.equal(sha256(JSON.stringify(after.indices)), after.indicesSha256)
  assert.deepEqual(after.indices, before.indices.filter(index => index !== 10152))
  assert.equal(before.units - after.units, 1)
  assert.equal(before.residues - after.residues, 1)

  const row = fixture.strictRows[0]
  const identity = [[
    row.targetIndex,
    row.literalKind,
    row.value,
    row.start,
    row.end,
    row.targetOccurrenceNumber,
  ]]
  assert.equal(sha256(JSON.stringify(identity)), row.identitySha256)
})

test('authenticated bundles prove the complete three-unit Unicode lane', () => {
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
    artifactDescriptor(fixture.inputs.baselineBundle),
  )
  assert.deepEqual(
    descriptor(targetBundle),
    artifactDescriptor(fixture.inputs.targetBundle),
  )
  assert.deepEqual(
    descriptor(ledgerBytes),
    artifactDescriptor(fixture.inputs.structuralLedger),
  )
  const ledger = JSON.parse(gunzipSync(ledgerBytes))

  for (const unit of fixture.baselineUnits) {
    const structural = ledger.unmatchedBaseline.find(row => row.index === unit.index)
    assert(structural)
    assert.deepEqual(
      [
        structural.nodeType,
        structural.start,
        structural.end,
        structural.tokenCount,
        structural.sourceHash,
        structural.coarseHash,
      ],
      [
        unit.nodeType,
        unit.start,
        unit.end,
        unit.tokenCount,
        unit.sourceHash,
        unit.coarseHash,
      ],
    )
    parseUnit(baselineBundle, unit)
  }
  for (const unit of fixture.targetUnits) {
    const structural = ledger.regions.find(row => row.target?.index === unit.index)
    assert(structural)
    assert.equal(structural.classification, 'unresolved')
    assert.equal(
      structural.unknownFreeIdentifierCount,
      unit.unknownFreeIdentifierCount,
    )
    assert.deepEqual(
      [
        structural.target.nodeType,
        structural.target.start,
        structural.target.end,
        structural.target.tokenCount,
        structural.target.sourceHash,
        structural.target.coarseHash,
      ],
      [
        unit.nodeType,
        unit.start,
        unit.end,
        unit.tokenCount,
        unit.sourceHash,
        unit.coarseHash,
      ],
    )
    parseUnit(targetBundle, unit)
  }

  const dependency = fixture.retainedDependency.targetUnit
  const dependencyRegion = ledger.regions.find(
    row => row.target?.index === dependency.index,
  )
  assert(dependencyRegion)
  assert.equal(dependencyRegion.classification, dependency.classification)
  assert.equal(dependencyRegion.baselineUnitIndex, dependency.baselineUnitIndex)
  parseUnit(targetBundle, dependency)

  for (const fragment of fixture.bundleFragments) {
    const bundle = fragment.bundle === 'baseline' ? baselineBundle : targetBundle
    const value = bundle.subarray(fragment.start, fragment.end)
    assert.deepEqual(descriptor(value), artifactDescriptor(fragment))
    assert.equal(value.toString(), fragment.text)
  }
  const targetText = targetBundle.toString()
  for (const [needle, count] of Object.entries(fixture.bundleCallCounts)) {
    assert.equal(occurrenceCount(targetText, needle), count, needle)
  }
})

test('raw Git source exposes the exact gap and replay is parse-clean', async () => {
  const materialized = materializeRawSource()
  try {
    const tree = spawnSync(
      'git',
      ['ls-tree', fixture.sourceCommit, fixture.sourceBlob.path],
      { cwd: root, encoding: 'utf8' },
    )
    assert.equal(tree.status, 0, tree.stderr)
    assert.match(tree.stdout, new RegExp(`blob ${fixture.sourceBlob.gitObject}\\s`))
    const raw = materialized.source
    const recovered = buildTarget121FileEditUnicodeOutput(raw)
    assert.deepEqual(
      descriptor(Buffer.from(recovered)),
      fixture.inputs.sourceFiles[0].output,
    )

    const ts = await loadTypeScript()
    const rawParsed = sourceFile(ts, raw)
    const recoveredParsed = sourceFile(ts, recovered)
    for (const [parsed, source, rows] of [
      [rawParsed, raw, fixture.sourceRegions.rawDeclarations],
      [recoveredParsed, recovered, fixture.sourceRegions.recoveredDeclarations],
    ]) {
      for (const row of rows) {
        const declaration = functionDeclaration(ts, parsed, row.name)
        assert.equal(declaration.getStart(parsed), row.charStart)
        assert.equal(declaration.end, row.charEnd)
        assert.deepEqual(
          descriptor(
            Buffer.from(
              source.slice(declaration.getStart(parsed), declaration.end),
            ),
          ),
          artifactDescriptor(row),
        )
      }
    }
    for (const [parsed, source, expected] of [
      [rawParsed, raw, fixture.sourceRegions.rawImport],
      [recoveredParsed, recovered, fixture.sourceRegions.recoveredImport],
    ]) {
      const declaration = stringUtilsImport(ts, parsed)
      assert.equal(declaration.getStart(parsed), expected.charStart)
      assert.equal(declaration.end, expected.charEnd)
      assert.deepEqual(
        descriptor(
          Buffer.from(source.slice(declaration.getStart(parsed), declaration.end)),
        ),
        artifactDescriptor(expected),
      )
    }
    assert.equal(occurrenceCount(raw, 'unicodeStringToRegex'), 0)
    assert.equal(occurrenceCount(recovered, 'encodeUnicodeCharacters'), 0)
    assert.equal(occurrenceCount(recovered, 'unicodeStringToRegex'), 3)
    assert.equal(occurrenceCount(recovered, 'escapeRegExp'), 2)

    const dependencyFile = fs.readFileSync(
      path.join(targetSourceRoot(), 'utils/stringUtils.ts'),
    )
    assert.deepEqual(
      descriptor(dependencyFile),
      fixture.inputs.sourceFiles[1].retained,
    )
    const dependencyParsed = ts.createSourceFile(
      'src/utils/stringUtils.ts',
      dependencyFile.toString(),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    const dependencyDeclaration = functionDeclaration(
      ts,
      dependencyParsed,
      fixture.retainedDependency.sourceDeclaration,
    )
    const dependencyRegion = fixture.retainedDependency.sourceRegion
    assert.equal(dependencyDeclaration.getStart(dependencyParsed), dependencyRegion.charStart)
    assert.equal(dependencyDeclaration.end, dependencyRegion.charEnd)
    assert.deepEqual(
      descriptor(
        dependencyFile.subarray(
          dependencyRegion.charStart,
          dependencyRegion.charEnd,
        ),
      ),
      artifactDescriptor(dependencyRegion),
    )
  } finally {
    fs.rmSync(materialized.temporary, { recursive: true, force: true })
  }
})

test('recovered declarations compile to all three target whole-unit ASTs', async () => {
  const version = spawnSync(
    path.join(root, fixture.wholeUnitProof.compiler.path),
    ['--version'],
    { cwd: root, encoding: 'utf8' },
  )
  assert.equal(version.status, 0, version.stderr)
  assert.equal(version.stdout.trim(), fixture.wholeUnitProof.compiler.version)

  const materialized = materializeRawSource()
  try {
    const recovered = buildTarget121FileEditUnicodeOutput(materialized.source)
    const ts = await loadTypeScript()
    const parsed = sourceFile(ts, recovered)
    const targetBundle = fs.readFileSync(
      path.join(root, fixture.inputs.targetBundle.path),
    )
    for (const proof of fixture.wholeUnitProof.units) {
      const sourceRow = fixture.sourceRegions.recoveredDeclarations.find(
        row => row.name === proof.sourceDeclaration,
      )
      const targetUnit = fixture.targetUnits.find(
        row => row.index === proof.targetIndex,
      )
      assert(sourceRow)
      assert(targetUnit)
      const declaration = functionDeclaration(ts, parsed, sourceRow.name)
      const sourceText = declaration.getText(parsed).replace(/^export /, '')
      const compiled = compileWithFrozenBun(sourceText)
      assert.deepEqual(descriptor(Buffer.from(compiled)), {
        bytes: sourceRow.compiledBytes,
        sha256: sourceRow.compiledSha256,
      })
      const compiledAst = parse(compiled, {
        ecmaVersion: 'latest',
        sourceType: 'script',
      }).body[0]
      const targetAst = parseUnit(targetBundle, targetUnit).ast
      const sourceCanonical = JSON.stringify(canonicalAst(compiledAst))
      const targetCanonical = JSON.stringify(canonicalAst(targetAst))
      assert.equal(sourceCanonical, targetCanonical, sourceRow.name)
      assert.equal(Buffer.byteLength(sourceCanonical), proof.canonicalBytes)
      assert.equal(sha256(sourceCanonical), proof.canonicalSha256)
    }
  } finally {
    fs.rmSync(materialized.temporary, { recursive: true, force: true })
  }
})

test('recovered source has runtime parity with the target Unicode units', async () => {
  const materialized = materializeRawSource()
  try {
    const recovered = buildTarget121FileEditUnicodeOutput(materialized.source)
    const ts = await loadTypeScript()
    const source = createSourceRuntime(ts, recovered)
    const target = createTargetRuntime(
      fs.readFileSync(path.join(root, fixture.inputs.targetBundle.path)),
    )

    for (const value of ['é', 'a.b[é]', 'Ωß', '😀', 'x+y?(é)']) {
      assert.equal(
        source.unicodeStringToRegex(value),
        target.AQK(value),
        value,
      )
    }
    const findCases = [
      ['x a.b[\\u00E9] y', 'a.b[é]'],
      ['x \\u00E9 y', 'é'],
      ['x \\u00e9 y', 'é'],
      ['x “quoted” y', 'x "quoted" y'],
      ['literal text', 'text'],
      ['no match', 'é'],
    ]
    for (const [fileContent, searchString] of findCases) {
      assert.equal(
        source.findActualString(fileContent, searchString),
        target.z2H(fileContent, searchString),
        JSON.stringify([fileContent, searchString]),
      )
    }
    const preserveCases = [
      ['AéΩ', 'A\\u00E9\\u03a9', 'BéΩß'],
      ['éΩ', '\\u00E9\\u03A9', 'éΩß'],
      ['éΩ', '\\u00e9\\u03a9', 'éΩß'],
      ['é', '\\u00E9', 'ß'],
      ['\\u00e9', 'é', '\\u03a9'],
      ['same', 'same', 'é'],
    ]
    for (const [oldString, actualOldString, newString] of preserveCases) {
      assert.equal(
        source.preserveUnicodeRepresentation(
          oldString,
          actualOldString,
          newString,
        ),
        target.fQK(oldString, actualOldString, newString),
        JSON.stringify([oldString, actualOldString, newString]),
      )
    }
    assert.equal(
      source.findActualString('x a.b[\\u00E9] y', 'a.b[é]'),
      'a.b[\\u00E9]',
    )
    assert.equal(
      source.preserveUnicodeRepresentation(
        'éΩ',
        '\\u00E9\\u03A9',
        'éΩß',
      ),
      '\\u00E9\\u03A9\\u00DF',
    )
  } finally {
    fs.rmSync(materialized.temporary, { recursive: true, force: true })
  }
})

test('replay accepts exactly raw or recovered state and fails closed otherwise', () => {
  const materialized = materializeRawSource()
  try {
    assert.deepEqual(
      applyTarget121FileEditUnicodeSourceRecovery({
        sourceRoot: materialized.sourceRoot,
      }),
      {
        status: 'recovered',
        files: ['src/tools/FileEditTool/utils.ts'],
      },
    )
    const once = fs.readFileSync(materialized.filename)
    assert.deepEqual(descriptor(once), fixture.inputs.sourceFiles[0].output)
    assert.deepEqual(
      applyTarget121FileEditUnicodeSourceRecovery({
        sourceRoot: materialized.sourceRoot,
      }),
      { status: 'already-recovered', files: [] },
    )
    assert.deepEqual(fs.readFileSync(materialized.filename), once)

    const selectedRoot = targetSourceRoot()
    const selected = path.join(selectedRoot, 'tools/FileEditTool/utils.ts')
    const selectedIdentity = descriptor(fs.readFileSync(selected))
    const selectedState =
      selectedIdentity.bytes === fixture.inputs.sourceFiles[0].input.bytes &&
      selectedIdentity.sha256 === fixture.inputs.sourceFiles[0].input.sha256
        ? 'raw'
        : 'recovered'
    if (selectedState === 'recovered') {
      assert.deepEqual(selectedIdentity, fixture.inputs.sourceFiles[0].output)
    }
    const packageCopy = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target121-file-edit-unicode-package-'),
    )
    try {
      const packageRoot = path.join(packageCopy, 'src')
      const packageFile = path.join(packageRoot, 'tools/FileEditTool/utils.ts')
      fs.mkdirSync(path.dirname(packageFile), { recursive: true })
      fs.copyFileSync(selected, packageFile)
      assert.deepEqual(
        applyTarget121FileEditUnicodeSourceRecovery({ sourceRoot: packageRoot }),
        selectedState === 'raw'
          ? {
              status: 'recovered',
              files: ['src/tools/FileEditTool/utils.ts'],
            }
          : { status: 'already-recovered', files: [] },
      )
      assert.deepEqual(
        descriptor(fs.readFileSync(packageFile)),
        fixture.inputs.sourceFiles[0].output,
      )
    } finally {
      fs.rmSync(packageCopy, { recursive: true, force: true })
    }
  } finally {
    fs.rmSync(materialized.temporary, { recursive: true, force: true })
  }

  assert.throws(
    () => applyTarget121FileEditUnicodeSourceRecovery(),
    /sourceRoot is required/,
  )
  assert.throws(
    () => buildTarget121FileEditUnicodeOutput('export const x = 1'),
    /stringUtils import expected one anchor, got 0/,
  )
  const drifted = materializeRawSource()
  try {
    fs.appendFileSync(drifted.filename, '\n// drift\n')
    const before = fs.readFileSync(drifted.filename)
    assert.throws(
      () =>
        applyTarget121FileEditUnicodeSourceRecovery({
          sourceRoot: drifted.sourceRoot,
        }),
      /requires exact raw or recovered/,
    )
    assert.deepEqual(fs.readFileSync(drifted.filename), before)
  } finally {
    fs.rmSync(drifted.temporary, { recursive: true, force: true })
  }

  const linked = materializeRawSource()
  try {
    const real = `${linked.filename}.real`
    fs.renameSync(linked.filename, real)
    fs.symlinkSync(real, linked.filename)
    assert.throws(
      () =>
        applyTarget121FileEditUnicodeSourceRecovery({
          sourceRoot: linked.sourceRoot,
        }),
      /expected a real source file/,
    )
  } finally {
    fs.rmSync(linked.temporary, { recursive: true, force: true })
  }
})
