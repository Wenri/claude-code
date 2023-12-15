import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  applyTarget118FastCommandThinClientDispatchSourceRecovery,
  TARGET118_FAST_COMMAND_THIN_CLIENT_DISPATCH_INPUT,
  TARGET118_FAST_COMMAND_THIN_CLIENT_DISPATCH_OUTPUT,
  TARGET118_FAST_COMMAND_THIN_CLIENT_DISPATCH_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/replay-fast-command-thin-client-dispatch-source-gap.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-fast-command-thin-client-dispatch-source-gap.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '80a23c4b5c97e8db201ff359e827202bd867a1a66ad59c96f278eb8397131d9c'
const targetBundlePath =
  process.env.CLAUDE_CODE_2_1_118_BUNDLE ??
  path.join(
    root,
    '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
  )
const configuredSourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.118/src'),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function sameDescriptor(actual, expected) {
  return actual.bytes === expected.bytes && actual.sha256 === expected.sha256
}

function sourceFilename(sourceRoot) {
  const resolvedRoot = path.resolve(sourceRoot)
  const filename = path.resolve(
    resolvedRoot,
    fixture.inputs.rawSource.file.path.slice('src/'.length),
  )
  assert.ok(filename.startsWith(`${resolvedRoot}${path.sep}`))
  return filename
}

function gitSource() {
  const input = fixture.inputs.rawSource
  const result = spawnSync(
    'git',
    ['show', `${input.commit}:${input.file.path}`],
    { cwd: root, encoding: null },
  )
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), {
    bytes: input.file.bytes,
    sha256: input.file.sha256,
  })
  return result.stdout
}

function materializeSource(bytes, prefix = 'target118-fast-command-') {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporary, 'src')
  const filename = sourceFilename(sourceRoot)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, bytes)
  return { temporary, sourceRoot, filename }
}

function readCoverage() {
  return JSON.parse(
    gunzipSync(
      fs.readFileSync(
        path.join(
          root,
          'recovery/cases/2.1.117-to-2.1.118/semantic/source-coverage.json.gz',
        ),
      ),
    ),
  )
}

function walk(node, predicate, matches = []) {
  if (!node || typeof node !== 'object') return matches
  if (predicate(node)) matches.push(node)
  for (const [key, child] of Object.entries(node)) {
    if (['end', 'loc', 'range', 'raw', 'start'].includes(key)) continue
    if (Array.isArray(child)) {
      for (const value of child) walk(value, predicate, matches)
    } else {
      walk(child, predicate, matches)
    }
  }
  return matches
}

function propertyName(node) {
  if (node?.computed) return undefined
  return node?.key?.name ?? node?.key?.value
}

function objectProperty(object, name) {
  return object.properties.find(property => propertyName(property) === name)
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

function parseSource(ts, bytes) {
  const sourceFile = ts.createSourceFile(
    fixture.inputs.rawSource.file.path,
    bytes.toString('utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  return sourceFile
}

function fastDeclaration(ts, sourceFile, bytes, expected) {
  const matches = []
  function visit(node) {
    if (
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(
        declaration => declaration.name.getText(sourceFile) === expected.name,
      )
    ) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(matches.length, 1)
  const declaration = matches[0]
  const start = declaration.getStart(sourceFile)
  const end = declaration.end
  assert.deepEqual(
    {
      name: expected.name,
      start,
      end,
      ...descriptor(bytes.subarray(start, end)),
    },
    expected,
  )
  const variable = declaration.declarationList.declarations.find(
    candidate => candidate.name.getText(sourceFile) === expected.name,
  )
  assert.ok(variable)
  return { declaration, variable }
}

function sourceObject(ts, variable) {
  assert.ok(ts.isSatisfiesExpression(variable.initializer))
  const object = variable.initializer.expression
  assert.ok(ts.isObjectLiteralExpression(object))
  return object
}

test(
  'Target118 fast-command fixture freezes helper and authenticated source input',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(
      descriptor(fs.readFileSync(path.join(root, fixture.inputs.helper.path))),
      {
        bytes: fixture.inputs.helper.bytes,
        sha256: fixture.inputs.helper.sha256,
      },
    )
    assert.deepEqual(TARGET118_FAST_COMMAND_THIN_CLIENT_DISPATCH_INPUT, {
      path: fixture.inputs.rawSource.file.path,
      bytes: fixture.inputs.rawSource.file.bytes,
      sha256: fixture.inputs.rawSource.file.sha256,
    })
    assert.deepEqual(TARGET118_FAST_COMMAND_THIN_CLIENT_DISPATCH_OUTPUT, {
      path: fixture.inputs.recoveredSource.file.path,
      bytes: fixture.inputs.recoveredSource.file.bytes,
      sha256: fixture.inputs.recoveredSource.file.sha256,
    })
    assert.deepEqual(
      TARGET118_FAST_COMMAND_THIN_CLIENT_DISPATCH_OWNER_OVERRIDES.map(row => ({
        targetIndex: row.targetIndex,
        paths: [...row.paths],
        declarations: [...row.declarations],
        evidenceIds: [...row.evidenceIds],
        behavior: row.behavior,
      })),
      [
        {
          targetIndex: fixture.targetUnit.targetIndex,
          paths: fixture.ownerOverride.paths,
          declarations: fixture.targetUnit.declarations,
          evidenceIds: fixture.ownerOverride.evidenceIds,
          behavior: fixture.ownerOverride.behavior,
        },
      ],
    )
    assert.equal(
      sha256(JSON.stringify([fixture.targetUnit.targetIndex])),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      sha256(
        JSON.stringify(
          fixture.targetUnit.residues.map(residue => [
            fixture.targetUnit.targetIndex,
            ...residue,
          ]),
        ),
      ),
      fixture.summary.residueIdentitiesSha256,
    )
    assert.equal(
      spawnSync(
        'git',
        ['rev-parse', `${fixture.inputs.rawSource.commit}^{tree}`],
        { cwd: root, encoding: 'utf8' },
      ).stdout.trim(),
      fixture.inputs.rawSource.tree,
    )
    assert.equal(
      spawnSync(
        'git',
        [
          'rev-parse',
          `${fixture.inputs.rawSource.commit}:${fixture.inputs.rawSource.file.path}`,
        ],
        { cwd: root, encoding: 'utf8' },
      ).stdout.trim(),
      fixture.inputs.rawSource.file.blob,
    )
    gitSource()
  },
)

test(
  'authenticated Target118 u17142 is the complete fast command descriptor',
  { skip: !selected },
  () => {
    const bundle = fs.readFileSync(targetBundlePath)
    assert.deepEqual(descriptor(bundle), {
      bytes: fixture.inputs.targetBundle.bytes,
      sha256: fixture.inputs.targetBundle.sha256,
    })
    const ledgerBytes = fs.readFileSync(
      path.join(root, fixture.inputs.targetStructuralLedger.path),
    )
    assert.deepEqual(descriptor(ledgerBytes), {
      bytes: fixture.inputs.targetStructuralLedger.bytes,
      sha256: fixture.inputs.targetStructuralLedger.sha256,
    })
    const ledger = JSON.parse(gunzipSync(ledgerBytes))
    const region = ledger.regions.find(
      candidate => candidate.target.index === fixture.targetUnit.targetIndex,
    )
    assert.ok(region)
    assert.deepEqual(
      {
        classification: region.classification,
        start: region.target.start,
        end: region.target.end,
        bytes: region.target.end - region.target.start,
        tokenCount: region.target.tokenCount,
        nodeType: region.target.nodeType,
        sourceHash: region.target.sourceHash,
        coarseHash: region.target.coarseHash,
      },
      {
        classification: fixture.targetUnit.classification,
        start: fixture.targetUnit.start,
        end: fixture.targetUnit.end,
        bytes: fixture.targetUnit.bytes,
        tokenCount: fixture.targetUnit.tokenCount,
        nodeType: fixture.targetUnit.nodeType,
        sourceHash: fixture.targetUnit.sourceHash,
        coarseHash: fixture.targetUnit.coarseHash,
      },
    )
    const unitBytes = bundle.subarray(
      fixture.targetUnit.start,
      fixture.targetUnit.end,
    )
    assert.deepEqual(descriptor(unitBytes), {
      bytes: fixture.targetUnit.bytes,
      sha256: fixture.targetUnit.sourceHash,
    })
    const ast = parse(unitBytes.toString('utf8'), {
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    const fastObjects = walk(
      ast,
      node =>
        node.type === 'ObjectExpression' &&
        objectProperty(node, 'name')?.value?.value === 'fast' &&
        objectProperty(node, 'type')?.value?.value === 'local-jsx',
    )
    assert.equal(fastObjects.length, 1)
    const fast = fastObjects[0]
    assert.deepEqual(fast.properties.map(propertyName), [
      'type',
      'name',
      'description',
      'isEnabled',
      'isHidden',
      'argumentHint',
      'immediate',
      'requires',
      'thinClientDispatch',
      'load',
    ])
    assert.equal(
      objectProperty(fast, 'thinClientDispatch').value.value,
      'control-request',
    )
    const requires = objectProperty(fast, 'requires').value
    const ink = objectProperty(requires, 'ink').value
    assert.equal(ink.type, 'UnaryExpression')
    assert.equal(ink.operator, '!')
    assert.equal(ink.argument.value, 0)
    for (const [kind, value, start, end] of fixture.targetUnit.residues) {
      const raw = bundle.subarray(start, end).toString('utf8')
      assert.equal(kind, 'string')
      assert.equal(JSON.parse(raw), value)
      assert.ok(start >= fixture.targetUnit.start && end <= fixture.targetUnit.end)
    }
  },
)

test(
  'recovered fast source binds thin-client dispatch to the exact command declaration',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const raw = gitSource()
    const rawSourceFile = parseSource(ts, raw)
    const rawDeclaration = fastDeclaration(
      ts,
      rawSourceFile,
      raw,
      fixture.inputs.rawSource.declaration,
    )
    const rawObject = sourceObject(ts, rawDeclaration.variable)
    assert.equal(
      rawObject.properties.filter(
        property => property.name?.getText(rawSourceFile) === 'thinClientDispatch',
      ).length,
      0,
    )

    const materialized = materializeSource(raw)
    try {
      assert.equal(
        applyTarget118FastCommandThinClientDispatchSourceRecovery({
          sourceRoot: materialized.sourceRoot,
        }).status,
        'recovered',
      )
      const recovered = fs.readFileSync(materialized.filename)
      assert.deepEqual(descriptor(recovered), {
        bytes: fixture.inputs.recoveredSource.file.bytes,
        sha256: fixture.inputs.recoveredSource.file.sha256,
      })
      const sourceFile = parseSource(ts, recovered)
      const { declaration, variable } = fastDeclaration(
        ts,
        sourceFile,
        recovered,
        fixture.inputs.recoveredSource.declaration,
      )
      const object = sourceObject(ts, variable)
      const properties = object.properties.map(property =>
        property.name?.getText(sourceFile),
      )
      assert.deepEqual(properties, [
        'type',
        'name',
        'description',
        'availability',
        'isEnabled',
        'isHidden',
        'argumentHint',
        'immediate',
        'thinClientDispatch',
        'load',
      ])
      const dispatch = object.properties.filter(
        property => property.name?.getText(sourceFile) === 'thinClientDispatch',
      )
      assert.equal(dispatch.length, 1)
      assert.equal(dispatch[0].initializer.text, 'control-request')

      const harness = `${declaration.getText(sourceFile)}\nexports.fast = fast`
      const javascript = ts.transpileModule(harness, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText
      const module = { exports: {} }
      new Function(
        'exports',
        'module',
        'FAST_MODE_MODEL_DISPLAY',
        'isFastModeEnabled',
        'shouldInferenceConfigCommandBeImmediate',
        javascript,
      )(
        module.exports,
        module,
        'Opus',
        () => true,
        () => false,
      )
      assert.equal(module.exports.fast.name, 'fast')
      assert.equal(module.exports.fast.type, 'local-jsx')
      assert.equal(module.exports.fast.description, 'Toggle fast mode (Opus only)')
      assert.deepEqual(module.exports.fast.availability, ['claude-ai', 'console'])
      assert.equal(module.exports.fast.isEnabled(), true)
      assert.equal(module.exports.fast.isHidden, false)
      assert.equal(module.exports.fast.immediate, false)
      assert.equal(module.exports.fast.thinClientDispatch, 'control-request')
      assert.equal(typeof module.exports.fast.load, 'function')
    } finally {
      fs.rmSync(materialized.temporary, { recursive: true, force: true })
    }
  },
)

test(
  'fast-command replay is idempotent and rejects source drift',
  { skip: !selected },
  () => {
    const materialized = materializeSource(gitSource())
    try {
      assert.equal(
        applyTarget118FastCommandThinClientDispatchSourceRecovery({
          sourceRoot: materialized.sourceRoot,
        }).status,
        'recovered',
      )
      assert.equal(
        applyTarget118FastCommandThinClientDispatchSourceRecovery({
          sourceRoot: materialized.sourceRoot,
        }).status,
        'already-recovered',
      )
    } finally {
      fs.rmSync(materialized.temporary, { recursive: true, force: true })
    }

    const mutated = materializeSource(
      Buffer.concat([gitSource(), Buffer.from('\n// drift\n')]),
      'target118-fast-command-drift-',
    )
    try {
      const before = fs.readFileSync(mutated.filename)
      assert.throws(
        () =>
          applyTarget118FastCommandThinClientDispatchSourceRecovery({
            sourceRoot: mutated.sourceRoot,
          }),
        /requires the exact raw or recovered source/,
      )
      assert.deepEqual(fs.readFileSync(mutated.filename), before)
    } finally {
      fs.rmSync(mutated.temporary, { recursive: true, force: true })
    }

    const configured = descriptor(
      fs.readFileSync(sourceFilename(configuredSourceRoot)),
    )
    assert.ok(
      sameDescriptor(configured, fixture.inputs.rawSource.file) ||
        sameDescriptor(configured, fixture.inputs.recoveredSource.file),
      `configured fast source must be exact raw or recovered: ${JSON.stringify(configured)}`,
    )
  },
)

test(
  'fast-command thin-client owner coverage evolves atomically',
  { skip: !selected },
  () => {
    const coverage = readCoverage()
    const owners = new Map(
      coverage.owners.map(owner => [owner.id, owner.path]),
    )
    const row = coverage.rows.find(
      candidate => candidate.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert.ok(row)
    const paths = row.ownerIds.map(ownerId => owners.get(ownerId))
    const provisional =
      JSON.stringify(paths) ===
        JSON.stringify([fixture.targetUnit.provisionalOwnerPath]) &&
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(['source-map-attribution', 'semantic-test'])
    const corrected =
      JSON.stringify(paths) === JSON.stringify(fixture.ownerOverride.paths) &&
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(fixture.ownerOverride.evidenceIds) &&
      row.behavior === fixture.ownerOverride.behavior
    assert.ok(provisional || corrected)
  },
)
