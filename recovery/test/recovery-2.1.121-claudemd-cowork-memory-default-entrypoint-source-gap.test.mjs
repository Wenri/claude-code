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
  applyTarget121CoworkMemoryEntrypointSourceRecovery,
  buildTarget121CoworkMemoryEntrypointOutput,
  TARGET121_COWORK_MEMORY_ENTRYPOINT_INPUT_FILES,
  TARGET121_COWORK_MEMORY_ENTRYPOINT_OUTPUT_FILES,
  TARGET121_COWORK_MEMORY_ENTRYPOINT_OWNER_OVERRIDES,
} from '../cases/2.1.120-to-2.1.121/recovered/replay-claudemd-cowork-memory-default-entrypoint-source-gap.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.121-claudemd-cowork-memory-default-entrypoint-source-gap.json',
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

function parseUnit(bundle, unit) {
  const value = bundle.subarray(unit.start, unit.end)
  assert.deepEqual(descriptor(value), {
    bytes: unit.bytes,
    sha256: unit.sourceHash,
  })
  const ast = parse(value.toString(), {
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  assert.equal(ast.body.length, 1)
  assert.equal(ast.body[0].type, unit.nodeType)
  return { ast, source: value.toString() }
}

function walk(node, visit, parent = null, key = null, index = null) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (let childIndex = 0; childIndex < node.length; childIndex++) {
      walk(node[childIndex], visit, parent, key, childIndex)
    }
    return
  }
  visit(node, parent, key, index)
  for (const [childKey, child] of Object.entries(node)) {
    if (!['start', 'end', 'loc', 'range'].includes(childKey)) {
      if (Array.isArray(child)) {
        for (let childIndex = 0; childIndex < child.length; childIndex++) {
          walk(child[childIndex], visit, node, childKey, childIndex)
        }
      } else {
        walk(child, visit, node, childKey, null)
      }
    }
  }
}

function canonicalAst(node, parent = null, key = null) {
  if (Array.isArray(node)) {
    return node.map(child => canonicalAst(child, parent, key))
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
  const result = {}
  for (const [childKey, child] of Object.entries(node)) {
    if (!['start', 'end', 'loc', 'range'].includes(childKey)) {
      result[childKey] = canonicalAst(child, node, childKey)
    }
  }
  return result
}

function unwrapTargetGuard(ast, source) {
  const matches = []
  walk(ast, (node, parent, key, index) => {
    if (
      node.type === 'IfStatement' &&
      source.slice(node.test.start, node.test.end) ===
        '!process.env.CLAUDE_COWORK_MEMORY_SKIP_DEFAULT_ENTRYPOINT'
    ) {
      matches.push({ index, key, node, parent })
    }
  })
  assert.equal(matches.length, 1)
  const { index, key, node, parent } = matches[0]
  assert.equal(key, 'body')
  assert(Number.isInteger(index))
  assert(Array.isArray(parent.body))
  assert.equal(node.consequent.type, 'BlockStatement')
  parent.body.splice(index, 1, ...node.consequent.body)
}

function sourceFile(ts, source) {
  const parsed = ts.createSourceFile(
    'src/utils/claudemd.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(parsed.parseDiagnostics.length, 0)
  return parsed
}

function getMemoryFilesDeclaration(ts, parsed) {
  const matches = parsed.statements.filter(
    statement =>
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        declaration =>
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === 'getMemoryFiles',
      ),
  )
  assert.equal(matches.length, 1)
  return matches[0]
}

function findIfByCondition(ts, parsed, condition) {
  const matches = []
  function visit(node) {
    if (ts.isIfStatement(node) && node.expression.getText(parsed) === condition) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  assert.equal(matches.length, 1, condition)
  return matches[0]
}

function materializeRawSource() {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target121-cowork-memory-entrypoint-'),
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

function normalize(value) {
  return JSON.parse(JSON.stringify(value))
}

async function runSourceBranch(statement, options) {
  let reads = 0
  const context = {
    getAutoMemEntrypoint: () => '/memory/MEMORY.md',
    initialProcessed: options.processed ?? [],
    isAutoMemoryEnabled: () => options.enabled,
    normalizePathForComparison: value => value.toLowerCase(),
    process: { env: options.env },
    readCount: () => reads,
    safelyReadMemoryFileAsync: async () => {
      reads++
      return { info: options.entry }
    },
  }
  return vm.runInNewContext(
    `(async () => {
      const processedPaths = new Set(initialProcessed)
      const result = []
      ${statement}
      return { reads: readCount(), result, processed: [...processedPaths] }
    })()`,
    context,
  )
}

async function runTargetBranch(statement, options) {
  let reads = 0
  const context = {
    P9: () => options.enabled,
    aRH: () => '/memory/MEMORY.md',
    dL: value => value.toLowerCase(),
    initialProcessed: options.processed ?? [],
    process: { env: options.env },
    readCount: () => reads,
    rhK: async () => {
      reads++
      return { info: options.entry }
    },
  }
  return vm.runInNewContext(
    `(async () => {
      const K = new Set(initialProcessed)
      const q = []
      ${statement}
      return { reads: readCount(), result: q, processed: [...K] }
    })()`,
    context,
  )
}

test('fixture freezes the bounded u9209 replay and exact strict evolution', () => {
  assert.equal(
    sha256(fixtureBytes),
    '08c2f198f7b409404903522342d843ab014879e6314680804c8ff640dd9c0996',
  )
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.120-to-2.1.121')
  assert.deepEqual(
    TARGET121_COWORK_MEMORY_ENTRYPOINT_INPUT_FILES,
    fixture.inputs.sourceFiles.map(row => ({ path: row.path, ...row.input })),
  )
  assert.deepEqual(
    TARGET121_COWORK_MEMORY_ENTRYPOINT_OUTPUT_FILES,
    fixture.inputs.sourceFiles.map(row => ({ path: row.path, ...row.output })),
  )
  assert.deepEqual(
    TARGET121_COWORK_MEMORY_ENTRYPOINT_OWNER_OVERRIDES.map(row => ({
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
  assert.deepEqual(after.indices, before.indices.filter(index => index !== 9209))
  assert.equal(before.units - after.units, 1)
  assert.equal(before.residues - after.residues, 1)

  const row = fixture.strictRows[0]
  const identity = [[
    row.targetIndex,
    row.literalKind,
    row.value,
    row.start,
    row.end,
    row.baselineOccurrenceCount,
    row.targetOccurrenceNumber,
    row.sourceHash,
  ]]
  assert.equal(sha256(`${JSON.stringify(identity)}\n`), row.identitySha256)
})

test('authenticated bundles prove one complete-unit guard insertion', () => {
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
  const baseline = ledger.unmatchedBaseline.find(
    row => row.index === fixture.baselineUnit.index,
  )
  assert(baseline)
  assert.deepEqual(
    [
      baseline.nodeType,
      baseline.start,
      baseline.end,
      baseline.tokenCount,
      baseline.sourceHash,
      baseline.coarseHash,
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
  const target = ledger.regions.find(
    row => row.target?.index === fixture.targetUnit.index,
  )
  assert(target)
  assert.equal(target.classification, 'unresolved')
  assert.equal(target.unknownFreeIdentifierCount, 3)
  assert.deepEqual(
    [
      target.target.nodeType,
      target.target.start,
      target.target.end,
      target.target.tokenCount,
      target.target.sourceHash,
      target.target.coarseHash,
      target.target.topDefinitionCount,
    ],
    [
      fixture.targetUnit.nodeType,
      fixture.targetUnit.start,
      fixture.targetUnit.end,
      fixture.targetUnit.tokenCount,
      fixture.targetUnit.sourceHash,
      fixture.targetUnit.coarseHash,
      fixture.targetUnit.topDefinitionCount,
    ],
  )

  const baselineParsed = parseUnit(baselineBundle, fixture.baselineUnit)
  const targetParsed = parseUnit(targetBundle, fixture.targetUnit)
  for (const fragment of fixture.bundleFragments) {
    const bundle = fragment.bundle === 'baseline' ? baselineBundle : targetBundle
    const value = bundle.subarray(fragment.start, fragment.end)
    assert.deepEqual(descriptor(value), artifactDescriptor(fragment))
    if (fragment.text !== undefined) assert.equal(value.toString(), fragment.text)
  }
  assert.equal(
    occurrenceCount(
      baselineParsed.source,
      'CLAUDE_COWORK_MEMORY_SKIP_DEFAULT_ENTRYPOINT',
    ),
    0,
  )
  assert.equal(
    occurrenceCount(
      targetParsed.source,
      'CLAUDE_COWORK_MEMORY_SKIP_DEFAULT_ENTRYPOINT',
    ),
    1,
  )

  unwrapTargetGuard(targetParsed.ast, targetParsed.source)
  const baselineCanonical = JSON.stringify(canonicalAst(baselineParsed.ast))
  const targetCanonical = JSON.stringify(canonicalAst(targetParsed.ast))
  assert.equal(baselineCanonical, targetCanonical)
  assert.equal(
    Buffer.byteLength(targetCanonical),
    fixture.wholeUnitProof.canonicalBytes,
  )
  assert.equal(sha256(targetCanonical), fixture.wholeUnitProof.canonicalSha256)
})

test('raw Git source omits the gate and replay adds its exact nested AST', async () => {
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
    assert.equal(
      occurrenceCount(
        raw,
        'CLAUDE_COWORK_MEMORY_SKIP_DEFAULT_ENTRYPOINT',
      ),
      0,
    )
    const rawAnchor = fixture.sourceRegions.rawAnchor
    assert.deepEqual(
      descriptor(Buffer.from(raw.slice(rawAnchor.charStart, rawAnchor.charEnd))),
      artifactDescriptor(rawAnchor),
    )

    const recovered = buildTarget121CoworkMemoryEntrypointOutput(raw)
    assert.deepEqual(
      descriptor(Buffer.from(recovered)),
      fixture.inputs.sourceFiles[0].output,
    )
    assert.equal(
      occurrenceCount(
        recovered,
        'CLAUDE_COWORK_MEMORY_SKIP_DEFAULT_ENTRYPOINT',
      ),
      1,
    )
    const recoveredAnchor = fixture.sourceRegions.recoveredAnchor
    assert.deepEqual(
      descriptor(
        Buffer.from(
          recovered.slice(recoveredAnchor.charStart, recoveredAnchor.charEnd),
        ),
      ),
      artifactDescriptor(recoveredAnchor),
    )

    const ts = await loadTypeScript()
    const rawParsed = sourceFile(ts, raw)
    const recoveredParsed = sourceFile(ts, recovered)
    for (const [parsed, source, expected] of [
      [rawParsed, raw, fixture.sourceRegions.rawDeclaration],
      [
        recoveredParsed,
        recovered,
        fixture.sourceRegions.recoveredDeclaration,
      ],
    ]) {
      const declaration = getMemoryFilesDeclaration(ts, parsed)
      assert.equal(declaration.getStart(parsed), expected.charStart)
      assert.equal(declaration.end, expected.charEnd)
      assert.deepEqual(
        descriptor(
          Buffer.from(source.slice(declaration.getStart(parsed), declaration.end)),
        ),
        artifactDescriptor(expected),
      )
    }
    const guard = findIfByCondition(
      ts,
      recoveredParsed,
      '!process.env.CLAUDE_COWORK_MEMORY_SKIP_DEFAULT_ENTRYPOINT',
    )
    for (const [node, expected] of [
      [guard, fixture.sourceRegions.recoveredGuard],
      [guard.expression, fixture.sourceRegions.recoveredCondition],
    ]) {
      assert.equal(node.getStart(recoveredParsed), expected.charStart)
      assert.equal(node.end, expected.charEnd)
      assert.deepEqual(
        descriptor(
          Buffer.from(
            recovered.slice(node.getStart(recoveredParsed), node.end),
          ),
        ),
        artifactDescriptor(expected),
      )
    }
    const autoGate = findIfByCondition(
      ts,
      recoveredParsed,
      'isAutoMemoryEnabled()',
    )
    assert.equal(autoGate.thenStatement.statements.length, 1)
    assert.equal(autoGate.thenStatement.statements[0], guard)
  } finally {
    fs.rmSync(materialized.temporary, { recursive: true, force: true })
  }
})

test('recovered source branch has runtime parity with target u9209', async () => {
  const materialized = materializeRawSource()
  try {
    const recovered = buildTarget121CoworkMemoryEntrypointOutput(
      materialized.source,
    )
    const ts = await loadTypeScript()
    const parsed = sourceFile(ts, recovered)
    const sourceBranch = findIfByCondition(
      ts,
      parsed,
      'isAutoMemoryEnabled()',
    ).getText(parsed)
    const targetBranch = fixture.bundleFragments.find(
      row => row.name === 'targetAutoMemBranch',
    ).text
    const entry = { path: '/Memory/MEMORY.md', type: 'AutoMem', content: 'x' }
    const cases = [
      { enabled: false, env: {}, entry },
      { enabled: true, env: {}, entry },
      {
        enabled: true,
        env: { CLAUDE_COWORK_MEMORY_SKIP_DEFAULT_ENTRYPOINT: '1' },
        entry,
      },
      {
        enabled: true,
        env: { CLAUDE_COWORK_MEMORY_SKIP_DEFAULT_ENTRYPOINT: '0' },
        entry,
      },
      {
        enabled: true,
        env: { CLAUDE_COWORK_MEMORY_SKIP_DEFAULT_ENTRYPOINT: '' },
        entry,
      },
      { enabled: true, env: {}, entry: null },
      {
        enabled: true,
        env: {},
        entry,
        processed: ['/memory/memory.md'],
      },
    ]
    for (const options of cases) {
      assert.deepEqual(
        normalize(await runSourceBranch(sourceBranch, options)),
        normalize(await runTargetBranch(targetBranch, options)),
        JSON.stringify(options),
      )
    }
    assert.deepEqual(
      normalize(
        await runSourceBranch(sourceBranch, {
          enabled: true,
          env: { CLAUDE_COWORK_MEMORY_SKIP_DEFAULT_ENTRYPOINT: '1' },
          entry,
        }),
      ),
      { reads: 0, result: [], processed: [] },
    )
  } finally {
    fs.rmSync(materialized.temporary, { recursive: true, force: true })
  }
})

test('replay is exact on raw or recovered package state and idempotent', () => {
  const materialized = materializeRawSource()
  try {
    assert.deepEqual(
      applyTarget121CoworkMemoryEntrypointSourceRecovery({
        sourceRoot: materialized.sourceRoot,
      }),
      { status: 'recovered', files: ['src/utils/claudemd.ts'] },
    )
    const once = fs.readFileSync(materialized.filename)
    assert.deepEqual(descriptor(once), fixture.inputs.sourceFiles[0].output)
    assert.deepEqual(
      applyTarget121CoworkMemoryEntrypointSourceRecovery({
        sourceRoot: materialized.sourceRoot,
      }),
      { status: 'already-recovered', files: [] },
    )
    assert.deepEqual(fs.readFileSync(materialized.filename), once)

    const selectedRoot =
      process.env.CLAUDE_CODE_2_1_121_SOURCE_ROOT ??
      process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
      path.join(root, '.recovery-tmp/semantic-trees/2.1.121/src')
    const selected = path.join(selectedRoot, 'utils/claudemd.ts')
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
      path.join(os.tmpdir(), 'target121-cowork-memory-package-'),
    )
    try {
      const packageRoot = path.join(packageCopy, 'src')
      const packageFile = path.join(packageRoot, 'utils/claudemd.ts')
      fs.mkdirSync(path.dirname(packageFile), { recursive: true })
      fs.copyFileSync(selected, packageFile)
      assert.deepEqual(
        applyTarget121CoworkMemoryEntrypointSourceRecovery({
          sourceRoot: packageRoot,
        }),
        selectedState === 'raw'
          ? { status: 'recovered', files: ['src/utils/claudemd.ts'] }
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
})

test('replay fails closed on drift, missing anchors, and symlinks', () => {
  assert.throws(
    () => applyTarget121CoworkMemoryEntrypointSourceRecovery(),
    /sourceRoot is required/,
  )
  assert.throws(
    () => buildTarget121CoworkMemoryEntrypointOutput('export const x = 1'),
    /AutoMem default-entrypoint block expected one anchor, got 0/,
  )
  const materialized = materializeRawSource()
  try {
    fs.appendFileSync(materialized.filename, '\n// drift\n')
    const drift = fs.readFileSync(materialized.filename)
    assert.throws(
      () =>
        applyTarget121CoworkMemoryEntrypointSourceRecovery({
          sourceRoot: materialized.sourceRoot,
        }),
      /requires exact raw or recovered/,
    )
    assert.deepEqual(fs.readFileSync(materialized.filename), drift)
  } finally {
    fs.rmSync(materialized.temporary, { recursive: true, force: true })
  }

  const linked = materializeRawSource()
  try {
    const real = `${linked.filename}.real`
    fs.renameSync(linked.filename, real)
    fs.symlinkSync(real, linked.filename)
    assert.throws(
      () =>
        applyTarget121CoworkMemoryEntrypointSourceRecovery({
          sourceRoot: linked.sourceRoot,
        }),
      /expected a real source file/,
    )
  } finally {
    fs.rmSync(linked.temporary, { recursive: true, force: true })
  }
})
