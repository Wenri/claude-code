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
  applyTarget121RelaunchPinSourceRecovery,
  buildTarget121RelaunchPinOutput,
  TARGET121_RELAUNCH_PIN_INPUT_FILES,
  TARGET121_RELAUNCH_PIN_OUTPUT_FILES,
  TARGET121_RELAUNCH_PIN_OWNER_OVERRIDES,
} from '../cases/2.1.120-to-2.1.121/recovered/replay-relaunch-current-binary-pin-source-gap.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.121-relaunch-current-binary-pin-source-gap.json',
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

// The production bundle represents named `path` imports as namespace members.
// Collapse only join/sep, then normalize positions, private identifiers, and
// declaration kind; public property names remain semantic.
function canonicalAst(node, parent = null, key = null) {
  if (Array.isArray(node)) {
    return node.map(child => canonicalAst(child, parent, key))
  }
  if (!node || typeof node !== 'object') return node
  if (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.property?.type === 'Identifier' &&
    ['join', 'sep'].includes(node.property.name)
  ) {
    return { type: 'Identifier', name: '@id' }
  }
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
    path.join(os.tmpdir(), 'target121-relaunch-pin-'),
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

function recoveredDeclarations(ts, recovered) {
  const parsed = sourceFile(ts, recovered)
  return fixture.strictRows[0].declarations.map(name =>
    functionDeclaration(ts, parsed, name),
  )
}

function proofSource(ts, recovered) {
  const parsed = sourceFile(ts, recovered)
  return recoveredDeclarations(ts, recovered)
    .map(declaration => declaration.getText(parsed))
    .join('\n')
    .replaceAll('export function', 'function')
    .replace(
      "    const executable = process.platform === 'win32' ? 'claude.exe' : 'claude'\n",
      '',
    )
    .replace(
      'join(getUserBinDir(), executable)',
      "join(getUserBinDir(), 'claude')",
    )
}

function sourceLauncher(ts, recovered, runtime) {
  const parsed = sourceFile(ts, recovered)
  const declarations = recoveredDeclarations(ts, recovered)
    .map(declaration => declaration.getText(parsed))
    .join('\n')
    .replaceAll('export function', 'function')
  const context = {
    getUserBinDir: () => '/bin',
    getXDGDataHome: () => '/data',
    isInBundledMode: () => runtime.bundled,
    join: path.posix.join,
    process: {
      argv: runtime.argv,
      execPath: runtime.execPath,
      platform: 'linux',
    },
    sep: '/',
  }
  vm.createContext(context)
  vm.runInContext(
    `${compileWithFrozenBun(declarations)};globalThis.launch=getRelaunchLauncher;globalThis.versioned=isRunningFromVersionsDirectory`,
    context,
  )
  return context
}

function targetLauncher(bundle, runtime) {
  const helper = parseUnit(bundle, fixture.targetUnits[0]).source
  const launcher = parseUnit(bundle, fixture.targetUnits[1]).source
  const context = {
    IY$: path.posix,
    Va: () => '/bin',
    Vz: () => runtime.bundled,
    YYH: () => '/data',
    process: { argv: runtime.argv, execPath: runtime.execPath },
  }
  vm.createContext(context)
  vm.runInContext(
    `${helper};${launcher};globalThis.launch=QE;globalThis.versioned=c68`,
    context,
  )
  return context
}

function baselineLauncher(bundle, runtime) {
  const declaration = parseUnit(bundle, fixture.baselineUnit).source
  const context = {
    DfH: () => '/bin',
    MfH: () => '/data',
    process: { argv: runtime.argv, execPath: runtime.execPath },
    vA: () => runtime.bundled,
    vf$: path.posix,
  }
  vm.createContext(context)
  vm.runInContext(`${declaration};globalThis.launch=eo`, context)
  return context.launch
}

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

test('fixture freezes the exact u12210 strict-row evolution', () => {
  assert.equal(
    sha256(fixtureBytes),
    'afe874845fbce08e52405ad0a72b55e8aa22e4a24a9443dbc8c111e20f6d2da5',
  )
  assert.equal(fixture.schemaVersion, 1)
  assert.deepEqual(TARGET121_RELAUNCH_PIN_INPUT_FILES, [
    { path: fixture.inputs.sourceFile.path, ...fixture.inputs.sourceFile.input },
  ])
  assert.deepEqual(TARGET121_RELAUNCH_PIN_OUTPUT_FILES, [
    { path: fixture.inputs.sourceFile.path, ...fixture.inputs.sourceFile.output },
  ])
  assert.deepEqual(
    TARGET121_RELAUNCH_PIN_OWNER_OVERRIDES.map(row => ({
      declarations: [...row.declarations],
      paths: [...row.paths],
      targetIndex: row.targetIndex,
    })),
    [
      {
        declarations: fixture.strictRows[0].declarations,
        paths: [fixture.strictRows[0].ownerPath],
        targetIndex: 12210,
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
  assert.deepEqual(after.indices, before.indices.filter(index => index !== 12210))
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

test('authenticated bundles prove the split helper, pin gate, and all callers', () => {
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

  for (const initializer of Object.values(fixture.pathModuleInitializers)) {
    const sourceBundle =
      initializer === fixture.pathModuleInitializers.baseline
        ? baselineBundle
        : targetBundle
    const collection =
      initializer === fixture.pathModuleInitializers.baseline
        ? ledger.unmatchedBaseline
        : ledger.regions.map(row => row.target).filter(Boolean)
    const structural = collection.find(row => row.index === initializer.index)
    assert(structural)
    parseUnit(sourceBundle, initializer)
  }
  assert.equal(
    fixture.pathModuleInitializers.baseline.coarseHash,
    fixture.pathModuleInitializers.target.coarseHash,
  )

  for (const caller of fixture.callers) {
    const structural = ledger.regions.find(
      row => row.target?.index === caller.targetIndex,
    )
    assert(structural)
    assert.equal(structural.target.start, caller.unitStart)
    assert.equal(structural.target.end, caller.unitEnd)
    assert.equal(structural.target.sourceHash, caller.unitSourceHash)
    const unit = targetBundle.subarray(caller.unitStart, caller.unitEnd)
    assert.deepEqual(descriptor(unit), {
      bytes: caller.unitBytes,
      sha256: caller.unitSourceHash,
    })
    const call = targetBundle.subarray(caller.callStart, caller.callEnd)
    assert.deepEqual(descriptor(call), artifactDescriptor(fixture.callerFragment))
    assert.equal(call.toString(), fixture.callerFragment.text)
  }
  assert.equal(
    occurrenceCount(targetBundle.toString(), fixture.callerFragment.text),
    3,
  )
  assert.equal(
    occurrenceCount(baselineBundle.toString(), 'pinToCurrentBinary'),
    0,
  )

  for (const fragment of fixture.bundleFragments) {
    const bundle = fragment.bundle === 'baseline' ? baselineBundle : targetBundle
    const value = bundle.subarray(fragment.start, fragment.end)
    assert.deepEqual(descriptor(value), artifactDescriptor(fragment))
    assert.equal(value.toString(), fragment.text)
  }
  for (const row of fixture.strictRows) {
    const value = targetBundle.subarray(row.start, row.end)
    assert.deepEqual(descriptor(value), artifactDescriptor(row))
    assert.equal(value.toString(), row.value)
  }
})

test('raw Git source exposes one bounded relaunch gap and replay is parse-clean', async () => {
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
    const recovered = buildTarget121RelaunchPinOutput(raw)
    assert.deepEqual(
      descriptor(Buffer.from(recovered)),
      fixture.inputs.sourceFile.output,
    )
    assert.equal(occurrenceCount(raw, 'pinToCurrentBinary'), 0)
    assert.equal(occurrenceCount(recovered, 'pinToCurrentBinary'), 2)
    assert.equal(occurrenceCount(raw, 'isRunningFromVersionsDirectory'), 0)
    assert.equal(occurrenceCount(recovered, 'isRunningFromVersionsDirectory'), 2)

    const ts = await loadTypeScript()
    const rawParsed = sourceFile(ts, raw)
    const recoveredParsed = sourceFile(ts, recovered)
    const rawLauncher = functionDeclaration(ts, rawParsed, 'getRelaunchLauncher')
    assert.equal(rawLauncher.getStart(rawParsed), fixture.sourceRegions.rawLauncher.charStart)
    assert.equal(rawLauncher.end, fixture.sourceRegions.rawLauncher.charEnd)
    assert.deepEqual(
      descriptor(
        Buffer.from(
          raw.slice(rawLauncher.getStart(rawParsed), rawLauncher.end),
        ),
      ),
      artifactDescriptor(fixture.sourceRegions.rawLauncher),
    )

    for (const expected of [
      fixture.sourceRegions.recoveredHelper,
      fixture.sourceRegions.recoveredLauncher,
    ]) {
      const declaration = functionDeclaration(ts, recoveredParsed, expected.name)
      assert.equal(declaration.getStart(recoveredParsed), expected.charStart)
      assert.equal(declaration.end, expected.charEnd)
      assert.deepEqual(
        descriptor(
          Buffer.from(
            recovered.slice(declaration.getStart(recoveredParsed), declaration.end),
          ),
        ),
        artifactDescriptor(expected),
      )
    }

    for (const [source, expected, needle] of [
      [raw, fixture.sourceRegions.rawReplayAnchor, '/**\n * Resolve the stable launcher.'],
      [
        recovered,
        fixture.sourceRegions.recoveredReplayAnchor,
        'export function isRunningFromVersionsDirectory',
      ],
    ]) {
      const start = source.indexOf(needle)
      assert.equal(start, expected.charStart)
      const value = source.slice(expected.charStart, expected.charEnd)
      assert.deepEqual(descriptor(Buffer.from(value)), artifactDescriptor(expected))
    }
    for (const expected of fixture.sourceRegions.recoveredOptionOccurrences) {
      const value = recovered.slice(expected.charStart, expected.charEnd)
      assert.equal(value, 'pinToCurrentBinary')
      assert.deepEqual(descriptor(Buffer.from(value)), artifactDescriptor(expected))
    }
  } finally {
    fs.rmSync(materialized.temporary, { recursive: true, force: true })
  }
})

test('retained bundled-mode and XDG dependencies remain exact', async () => {
  const ts = await loadTypeScript()
  for (const dependency of fixture.retainedDependencies) {
    const filename = path.join(root, dependency.sourcePath)
    const bytes = fs.readFileSync(filename)
    assert.deepEqual(descriptor(bytes), dependency.sourceFile)
    const source = bytes.toString()
    const parsed = sourceFile(ts, source)
    const declarations = dependency.sourceDeclaration
      ? [dependency.sourceDeclaration]
      : dependency.sourceDeclarations
    for (const expected of declarations) {
      const declaration = functionDeclaration(ts, parsed, expected.name)
      assert.equal(declaration.getStart(parsed), expected.charStart)
      assert.equal(declaration.end, expected.charEnd)
      assert.deepEqual(
        descriptor(
          Buffer.from(source.slice(declaration.getStart(parsed), declaration.end)),
        ),
        artifactDescriptor(expected),
      )
    }
  }
})

test('recovered declarations compile to the exact Target121 helper and launcher ASTs', async () => {
  const version = spawnSync(
    path.join(root, fixture.wholeUnitProof.compiler.path),
    ['--version'],
    { cwd: root, encoding: 'utf8' },
  )
  assert.equal(version.status, 0, version.stderr)
  assert.equal(version.stdout.trim(), fixture.wholeUnitProof.compiler.version)

  const materialized = materializeRawSource()
  try {
    const recovered = buildTarget121RelaunchPinOutput(materialized.source)
    const ts = await loadTypeScript()
    const proof = proofSource(ts, recovered)
    assert.deepEqual(descriptor(Buffer.from(proof)), {
      bytes: fixture.wholeUnitProof.proofSourceBytes,
      sha256: fixture.wholeUnitProof.proofSourceSha256,
    })
    const compiled = compileWithFrozenBun(proof)
    assert.deepEqual(descriptor(Buffer.from(compiled)), {
      bytes: fixture.wholeUnitProof.compiledBytes,
      sha256: fixture.wholeUnitProof.compiledSha256,
    })
    const compiledAst = parse(compiled, {
      ecmaVersion: 'latest',
      sourceType: 'script',
    }).body
    assert.equal(compiledAst.length, 2)

    const targetBundle = fs.readFileSync(
      path.join(root, fixture.inputs.targetBundle.path),
    )
    const targetAst = fixture.targetUnits.map(
      unit => parseUnit(targetBundle, unit).ast,
    )
    const sourceCanonical = JSON.stringify(canonicalAst(compiledAst))
    const targetCanonical = JSON.stringify(canonicalAst(targetAst))
    assert.equal(sourceCanonical, targetCanonical)
    assert.equal(
      Buffer.byteLength(sourceCanonical),
      fixture.wholeUnitProof.canonicalBytes,
    )
    assert.equal(
      sha256(sourceCanonical),
      fixture.wholeUnitProof.canonicalSha256,
    )
  } finally {
    fs.rmSync(materialized.temporary, { recursive: true, force: true })
  }
})

test('recovered launcher has runtime parity and the pin closes version drift', async () => {
  const baselineBundle = fs.readFileSync(
    path.join(root, fixture.inputs.baselineBundle.path),
  )
  const targetBundle = fs.readFileSync(
    path.join(root, fixture.inputs.targetBundle.path),
  )
  const materialized = materializeRawSource()
  try {
    const recovered = buildTarget121RelaunchPinOutput(materialized.source)
    const ts = await loadTypeScript()
    for (const runtime of fixture.runtimeCases) {
      const source = sourceLauncher(ts, recovered, runtime)
      const target = targetLauncher(targetBundle, runtime)
      const sourceResult =
        runtime.options === null
          ? source.launch()
          : source.launch(runtime.options)
      const targetResult =
        runtime.options === null
          ? target.launch()
          : target.launch(runtime.options)
      assert.deepEqual(plain(sourceResult), runtime.expected, `source: ${runtime.name}`)
      assert.deepEqual(plain(targetResult), runtime.expected, `target: ${runtime.name}`)
      assert.equal(
        source.versioned(),
        runtime.bundled && runtime.execPath.startsWith('/data/claude/versions/'),
        `source predicate: ${runtime.name}`,
      )
      assert.equal(
        target.versioned(),
        runtime.bundled && runtime.execPath.startsWith('/data/claude/versions/'),
        `target predicate: ${runtime.name}`,
      )
    }

    const pinned = fixture.runtimeCases.find(
      row => row.options?.pinToCurrentBinary === true && row.bundled,
    )
    const baseline = baselineLauncher(baselineBundle, pinned)
    assert.deepEqual(plain(baseline()), {
      cmd: '/bin/claude',
      prefixArgs: [],
    })
    assert.notDeepEqual(plain(baseline()), pinned.expected)
  } finally {
    fs.rmSync(materialized.temporary, { recursive: true, force: true })
  }
})

test('replay accepts exactly raw or recovered state and fails closed otherwise', () => {
  const materialized = materializeRawSource()
  try {
    assert.deepEqual(
      applyTarget121RelaunchPinSourceRecovery({
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
      applyTarget121RelaunchPinSourceRecovery({
        sourceRoot: materialized.sourceRoot,
      }),
      { status: 'already-recovered', files: [] },
    )
    assert.deepEqual(fs.readFileSync(materialized.filename), once)

    const selectedRoot =
      process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
      path.join(root, '.recovery-tmp/semantic-trees/2.1.121/src')
    const selected = path.join(selectedRoot, 'utils/relaunch.ts')
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
      path.join(os.tmpdir(), 'target121-relaunch-pin-package-'),
    )
    try {
      const packageRoot = path.join(packageCopy, 'src')
      const packageFile = path.join(packageRoot, 'utils/relaunch.ts')
      fs.mkdirSync(path.dirname(packageFile), { recursive: true })
      fs.copyFileSync(selected, packageFile)
      assert.deepEqual(
        applyTarget121RelaunchPinSourceRecovery({ sourceRoot: packageRoot }),
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
    () => applyTarget121RelaunchPinSourceRecovery(),
    /sourceRoot is required/,
  )
  assert.throws(
    () => buildTarget121RelaunchPinOutput('export const x = 1'),
    /relaunch launcher expected one anchor, got 0/,
  )
  const drifted = materializeRawSource()
  try {
    fs.appendFileSync(drifted.filename, '\n// drift\n')
    const before = fs.readFileSync(drifted.filename)
    assert.throws(
      () =>
        applyTarget121RelaunchPinSourceRecovery({
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
        applyTarget121RelaunchPinSourceRecovery({
          sourceRoot: linked.sourceRoot,
        }),
      /expected a real source file/,
    )
  } finally {
    fs.rmSync(linked.temporary, { recursive: true, force: true })
  }
})
