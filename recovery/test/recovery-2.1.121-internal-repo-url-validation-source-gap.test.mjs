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
  applyTarget121InternalRepoUrlSourceRecovery,
  buildTarget121InternalRepoUrlOutput,
  TARGET121_INTERNAL_REPO_URL_INPUT_FILES,
  TARGET121_INTERNAL_REPO_URL_OUTPUT_FILES,
  TARGET121_INTERNAL_REPO_URL_OWNER_OVERRIDES,
} from '../cases/2.1.120-to-2.1.121/recovered/replay-internal-repo-url-validation-source-gap.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.121-internal-repo-url-validation-source-gap.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })
const artifactDescriptor = row => ({ bytes: row.bytes, sha256: row.sha256 })
const occurrenceCount = (source, needle) => source.split(needle).length - 1

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
    fixture.inputs.sourceFile.path,
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

function variableStatement(ts, parsed, name) {
  const matches = parsed.statements.filter(
    statement =>
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        declaration => ts.isIdentifier(declaration.name) && declaration.name.text === name,
      ),
  )
  assert.equal(matches.length, 1, name)
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

function canonicalAst(node, parent = null, key = null) {
  if (Array.isArray(node)) return node.map(child => canonicalAst(child, parent, key))
  if (!node || typeof node !== 'object') return node
  if (node.type === 'Identifier') {
    const semanticName =
      (parent?.type === 'MemberExpression' &&
        key === 'property' &&
        !parent.computed) ||
      (parent?.type === 'Property' && key === 'key' && !parent.computed) ||
      (parent?.type === 'MethodDefinition' && key === 'key' && !parent.computed)
    return { type: 'Identifier', name: semanticName ? node.name : '@id' }
  }
  if (node.type === 'VariableDeclaration') {
    return {
      type: 'VariableDeclaration',
      kind: 'var',
      declarations: canonicalAst(node.declarations, node, 'declarations'),
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
  })
  assert.equal(result.status, 0, result.stderr?.toString())
  return result.stdout.toString()
}

function materializeRawSource() {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target121-internal-repo-url-'),
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

function sourceMatcher(ts, recovered, allowlist) {
  const parsed = sourceFile(ts, recovered)
  const declaration = functionDeclaration(
    ts,
    parsed,
    fixture.sourceRegions.recoveredHelper.name,
  )
  const compiled = compileWithFrozenBun(declaration.getText(parsed))
  const context = { INTERNAL_MODEL_REPOS: allowlist }
  vm.createContext(context)
  vm.runInContext(
    `${compiled};globalThis.match=isInternalModelRepoUrl`,
    context,
  )
  return context.match
}

function bundleMatcher(bundle, unit, globalName, functionName, allowlist) {
  const declaration = parseUnit(bundle, unit).source
  const context = { [globalName]: allowlist }
  vm.createContext(context)
  vm.runInContext(`${declaration};globalThis.match=${functionName}`, context)
  return context.match
}

test('fixture freezes the exact u11275 strict-row evolution', () => {
  assert.equal(
    sha256(fixtureBytes),
    'ccae6b32d4d81e4dbd4d56f9fd26eb8b21380039aa1ef31ea7a221fcaa410d43',
  )
  assert.equal(fixture.schemaVersion, 1)
  assert.deepEqual(TARGET121_INTERNAL_REPO_URL_INPUT_FILES, [
    { path: fixture.inputs.sourceFile.path, ...fixture.inputs.sourceFile.input },
  ])
  assert.deepEqual(TARGET121_INTERNAL_REPO_URL_OUTPUT_FILES, [
    { path: fixture.inputs.sourceFile.path, ...fixture.inputs.sourceFile.output },
  ])
  assert.deepEqual(
    TARGET121_INTERNAL_REPO_URL_OWNER_OVERRIDES.map(row => ({
      declarations: [...row.declarations],
      paths: [...row.paths],
      targetIndex: row.targetIndex,
    })),
    [
      {
        declarations: fixture.strictRows[0].declarations,
        paths: [fixture.strictRows[0].ownerPath],
        targetIndex: 11275,
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
  assert.deepEqual(after.indices, before.indices.filter(index => index !== 11275))
  assert.equal(before.units - after.units, 1)
  assert.equal(before.residues - after.residues, 4)

  const identity = fixture.strictRows.map(row => [
    row.targetIndex,
    row.literalKind,
    row.pattern,
    row.flags,
    row.start,
    row.end,
    row.targetOccurrenceNumber,
  ])
  assert.equal(sha256(JSON.stringify(identity)), fixture.strictRowsIdentitySha256)
})

test('authenticated bundles prove the complete URL-validation unit and consumer', () => {
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

  const baselineStructural = ledger.unmatchedBaseline.find(
    row => row.index === fixture.baselineUnit.index,
  )
  assert(baselineStructural)
  assert.deepEqual(
    [
      baselineStructural.nodeType,
      baselineStructural.start,
      baselineStructural.end,
      baselineStructural.tokenCount,
      baselineStructural.sourceHash,
      baselineStructural.coarseHash,
    ],
    [
      fixture.baselineUnit.nodeType,
      fixture.baselineUnit.start,
      fixture.baselineUnit.end,
      fixture.baselineUnit.tokenCount,
      fixture.baselineUnit.sourceHash,
      fixture.baselineUnit.coarseHash,
    ],
  )
  parseUnit(baselineBundle, fixture.baselineUnit)

  const targetStructural = ledger.regions.find(
    row => row.target?.index === fixture.targetUnit.index,
  )
  assert(targetStructural)
  assert.equal(targetStructural.classification, 'unresolved')
  assert.equal(
    targetStructural.unknownFreeIdentifierCount,
    fixture.targetUnit.unknownFreeIdentifierCount,
  )
  assert.deepEqual(
    [
      targetStructural.target.nodeType,
      targetStructural.target.start,
      targetStructural.target.end,
      targetStructural.target.tokenCount,
      targetStructural.target.sourceHash,
      targetStructural.target.coarseHash,
    ],
    [
      fixture.targetUnit.nodeType,
      fixture.targetUnit.start,
      fixture.targetUnit.end,
      fixture.targetUnit.tokenCount,
      fixture.targetUnit.sourceHash,
      fixture.targetUnit.coarseHash,
    ],
  )
  const targetParsed = parseUnit(targetBundle, fixture.targetUnit)

  const initializer = ledger.regions.find(
    row => row.target?.index === fixture.moduleInitializer.target.index,
  )
  assert(initializer)
  assert.equal(initializer.classification, fixture.moduleInitializer.classification)
  assert.equal(
    initializer.baselineUnitIndex,
    fixture.moduleInitializer.baseline.index,
  )
  assert.equal(initializer.pairReason, fixture.moduleInitializer.pairReason)
  const baselineInitializer = parseUnit(
    baselineBundle,
    fixture.moduleInitializer.baseline,
  ).source
  const targetInitializer = parseUnit(
    targetBundle,
    fixture.moduleInitializer.target,
  ).source
  assert.match(baselineInitializer, /YH_=\[\]/)
  assert.match(baselineInitializer, /OH_\(q\)/)
  assert.match(targetInitializer, /o\$1=\[\]/)
  assert.match(targetInitializer, /a\$1\(q\)/)

  for (const fragment of fixture.bundleFragments) {
    const bundle = fragment.bundle === 'baseline' ? baselineBundle : targetBundle
    const value = bundle.subarray(fragment.start, fragment.end)
    assert.deepEqual(descriptor(value), artifactDescriptor(fragment))
    assert.equal(value.toString(), fragment.text)
  }

  const regexes = []
  ;(function visit(node) {
    if (!node || typeof node !== 'object') return
    if (node.type === 'Literal' && node.regex) regexes.push(node.regex.pattern)
    for (const [key, child] of Object.entries(node)) {
      if (['start', 'end', 'loc', 'range', 'raw'].includes(key)) continue
      if (Array.isArray(child)) child.forEach(visit)
      else visit(child)
    }
  })(targetParsed.ast)
  assert.deepEqual(regexes, [
    '^https?:\\/\\/',
    '^ssh:\\/\\/',
    '^git@',
    '^https?:\\/\\/',
    '^ssh:\\/\\/',
    '^[^@/]+@',
    '\\/$',
  ])
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
    const recovered = buildTarget121InternalRepoUrlOutput(raw)
    assert.deepEqual(
      descriptor(Buffer.from(recovered)),
      fixture.inputs.sourceFile.output,
    )
    assert.equal(occurrenceCount(raw, 'function isInternalModelRepoUrl'), 0)
    assert.equal(occurrenceCount(recovered, 'function isInternalModelRepoUrl'), 1)
    assert.equal(
      occurrenceCount(raw, 'remoteUrl.includes(repo)'),
      1,
    )
    assert.equal(
      occurrenceCount(recovered, 'isInternalModelRepoUrl(remoteUrl)'),
      1,
    )

    const ts = await loadTypeScript()
    const rawParsed = sourceFile(ts, raw)
    const recoveredParsed = sourceFile(ts, recovered)
    const allowlist = variableStatement(ts, rawParsed, 'INTERNAL_MODEL_REPOS')
    assert.equal(allowlist.getStart(rawParsed), fixture.sourceRegions.rawAllowlist.charStart)
    assert.equal(allowlist.end, fixture.sourceRegions.rawAllowlist.charEnd)
    assert.deepEqual(
      descriptor(
        Buffer.from(raw.slice(allowlist.getStart(rawParsed), allowlist.end)),
      ),
      artifactDescriptor(fixture.sourceRegions.rawAllowlist),
    )

    for (const [parsed, source, expected] of [
      [rawParsed, raw, fixture.sourceRegions.rawConsumer],
      [recoveredParsed, recovered, fixture.sourceRegions.recoveredConsumer],
    ]) {
      const declaration = variableStatement(ts, parsed, expected.name)
      assert.equal(declaration.getStart(parsed), expected.charStart)
      assert.equal(declaration.end, expected.charEnd)
      assert.deepEqual(
        descriptor(
          Buffer.from(source.slice(declaration.getStart(parsed), declaration.end)),
        ),
        artifactDescriptor(expected),
      )
    }

    const helper = functionDeclaration(
      ts,
      recoveredParsed,
      fixture.sourceRegions.recoveredHelper.name,
    )
    assert.equal(helper.getStart(recoveredParsed), fixture.sourceRegions.recoveredHelper.charStart)
    assert.equal(helper.end, fixture.sourceRegions.recoveredHelper.charEnd)
    assert.deepEqual(
      descriptor(
        Buffer.from(recovered.slice(helper.getStart(recoveredParsed), helper.end)),
      ),
      artifactDescriptor(fixture.sourceRegions.recoveredHelper),
    )

    for (const [source, expected, needle] of [
      [raw, fixture.sourceRegions.rawCall, 'const isInternal = INTERNAL_MODEL_REPOS.some'],
      [recovered, fixture.sourceRegions.recoveredCall, 'const isInternal = isInternalModelRepoUrl'],
    ]) {
      const start = source.indexOf(needle)
      assert.equal(start, expected.charStart)
      const value = source.slice(expected.charStart, expected.charEnd)
      assert.deepEqual(descriptor(Buffer.from(value)), artifactDescriptor(expected))
    }
  } finally {
    fs.rmSync(materialized.temporary, { recursive: true, force: true })
  }
})

test('recovered helper compiles to the exact target whole-unit AST', async () => {
  const version = spawnSync(
    path.join(root, fixture.wholeUnitProof.compiler.path),
    ['--version'],
    { cwd: root, encoding: 'utf8' },
  )
  assert.equal(version.status, 0, version.stderr)
  assert.equal(version.stdout.trim(), fixture.wholeUnitProof.compiler.version)

  const materialized = materializeRawSource()
  try {
    const recovered = buildTarget121InternalRepoUrlOutput(materialized.source)
    const ts = await loadTypeScript()
    const parsed = sourceFile(ts, recovered)
    const declaration = functionDeclaration(
      ts,
      parsed,
      fixture.sourceRegions.recoveredHelper.name,
    )
    const compiled = compileWithFrozenBun(declaration.getText(parsed))
    assert.deepEqual(descriptor(Buffer.from(compiled)), {
      bytes: fixture.sourceRegions.recoveredHelper.compiledBytes,
      sha256: fixture.sourceRegions.recoveredHelper.compiledSha256,
    })
    const compiledAst = parse(compiled, {
      ecmaVersion: 'latest',
      sourceType: 'script',
    }).body[0]
    const targetBundle = fs.readFileSync(
      path.join(root, fixture.inputs.targetBundle.path),
    )
    const targetAst = parseUnit(targetBundle, fixture.targetUnit).ast
    const sourceCanonical = JSON.stringify(canonicalAst(compiledAst))
    const targetCanonical = JSON.stringify(canonicalAst(targetAst))
    assert.equal(sourceCanonical, targetCanonical)
    assert.equal(Buffer.byteLength(sourceCanonical), fixture.wholeUnitProof.canonicalBytes)
    assert.equal(sha256(sourceCanonical), fixture.wholeUnitProof.canonicalSha256)
  } finally {
    fs.rmSync(materialized.temporary, { recursive: true, force: true })
  }
})

test('recovered matcher has runtime parity with Target121 and closes baseline spoofing', async () => {
  const allowlist = [
    'github.com/anthropics/private',
    'github.com:anthropics/private',
  ]
  const materialized = materializeRawSource()
  try {
    const recovered = buildTarget121InternalRepoUrlOutput(materialized.source)
    const ts = await loadTypeScript()
    const source = sourceMatcher(ts, recovered, allowlist)
    const baselineBundle = fs.readFileSync(
      path.join(root, fixture.inputs.baselineBundle.path),
    )
    const targetBundle = fs.readFileSync(
      path.join(root, fixture.inputs.targetBundle.path),
    )
    const baseline = bundleMatcher(
      baselineBundle,
      fixture.baselineUnit,
      'YH_',
      'OH_',
      allowlist,
    )
    const target = bundleMatcher(
      targetBundle,
      fixture.targetUnit,
      'o$1',
      'a$1',
      allowlist,
    )

    for (const [remote, expected] of fixture.runtimeCases) {
      assert.equal(source(remote), expected, `source: ${remote}`)
      assert.equal(target(remote), expected, `target: ${remote}`)
    }
    for (const spoof of [
      'github.com/anthropics/private',
      'git://github.com/anthropics/private',
      'https://attacker.example/github.com/anthropics/private',
      'https://github.com/anthropics/private/../github.com/anthropics/private',
    ]) {
      assert.equal(baseline(spoof), true, `baseline accepted ${spoof}`)
      assert.equal(target(spoof), false, `target rejected ${spoof}`)
    }
  } finally {
    fs.rmSync(materialized.temporary, { recursive: true, force: true })
  }
})

test('replay accepts exactly raw or recovered state and fails closed otherwise', () => {
  const materialized = materializeRawSource()
  try {
    assert.deepEqual(
      applyTarget121InternalRepoUrlSourceRecovery({
        sourceRoot: materialized.sourceRoot,
      }),
      {
        status: 'recovered',
        files: [fixture.inputs.sourceFile.path],
      },
    )
    const once = fs.readFileSync(materialized.filename)
    assert.deepEqual(descriptor(once), fixture.inputs.sourceFile.output)
    assert.deepEqual(
      applyTarget121InternalRepoUrlSourceRecovery({
        sourceRoot: materialized.sourceRoot,
      }),
      { status: 'already-recovered', files: [] },
    )
    assert.deepEqual(fs.readFileSync(materialized.filename), once)

    const selectedRoot =
      process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
      path.join(root, '.recovery-tmp/semantic-trees/2.1.121/src')
    const selected = path.join(selectedRoot, 'utils/commitAttribution.ts')
    const selectedIdentity = descriptor(fs.readFileSync(selected))
    const selectedState =
      selectedIdentity.bytes === fixture.inputs.sourceFile.input.bytes &&
      selectedIdentity.sha256 === fixture.inputs.sourceFile.input.sha256
        ? 'raw'
        : 'recovered'
    if (selectedState === 'recovered') {
      assert.deepEqual(selectedIdentity, fixture.inputs.sourceFile.output)
    }
    const packageCopy = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target121-internal-repo-url-package-'),
    )
    try {
      const packageRoot = path.join(packageCopy, 'src')
      const packageFile = path.join(packageRoot, 'utils/commitAttribution.ts')
      fs.mkdirSync(path.dirname(packageFile), { recursive: true })
      fs.copyFileSync(selected, packageFile)
      assert.deepEqual(
        applyTarget121InternalRepoUrlSourceRecovery({ sourceRoot: packageRoot }),
        selectedState === 'raw'
          ? {
              status: 'recovered',
              files: [fixture.inputs.sourceFile.path],
            }
          : { status: 'already-recovered', files: [] },
      )
      assert.deepEqual(
        descriptor(fs.readFileSync(packageFile)),
        fixture.inputs.sourceFile.output,
      )
    } finally {
      fs.rmSync(packageCopy, { recursive: true, force: true })
    }
  } finally {
    fs.rmSync(materialized.temporary, { recursive: true, force: true })
  }

  assert.throws(
    () => applyTarget121InternalRepoUrlSourceRecovery(),
    /sourceRoot is required/,
  )
  assert.throws(
    () => buildTarget121InternalRepoUrlOutput('export const x = 1'),
    /allowlist tail expected one anchor, got 0/,
  )
  const drifted = materializeRawSource()
  try {
    fs.appendFileSync(drifted.filename, '\n// drift\n')
    const before = fs.readFileSync(drifted.filename)
    assert.throws(
      () =>
        applyTarget121InternalRepoUrlSourceRecovery({
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
        applyTarget121InternalRepoUrlSourceRecovery({
          sourceRoot: linked.sourceRoot,
        }),
      /expected a real source file/,
    )
  } finally {
    fs.rmSync(linked.temporary, { recursive: true, force: true })
  }
})
