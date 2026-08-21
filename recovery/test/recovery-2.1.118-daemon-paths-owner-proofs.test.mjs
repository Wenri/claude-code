import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import { TARGET118_DAEMON_PATHS_OWNER_OVERRIDES } from '../cases/2.1.117-to-2.1.118/recovered/daemon-paths-owner-overrides.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-daemon-paths-owner-proofs.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'b7824bd5a8b48a11a9b4a41c2d81bd9e98bd011f80f58f1e209db796fcae8b00'
const targetBundlePath =
  process.env.CLAUDE_CODE_2_1_118_BUNDLE ??
  path.join(
    root,
    '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
  )
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.118/src'),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
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

function propertyName(node) {
  if (node.computed) return undefined
  if (node.key?.type === 'Identifier') return node.key.name
  if (node.key?.type === 'Literal') return node.key.value
  return undefined
}

function memberName(node) {
  if (node?.type !== 'MemberExpression' || node.computed) return undefined
  return node.property?.name
}

function gitSource() {
  const source = fixture.inputs.source.file
  const result = spawnSync(
    'git',
    ['show', `${fixture.inputs.source.commit}:${source.path}`],
    { cwd: root, encoding: null },
  )
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), {
    bytes: source.bytes,
    sha256: source.sha256,
  })
  return result.stdout
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

function descendants(ts, rootNode, predicate) {
  const matches = []
  function visit(node) {
    if (predicate(node)) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(rootNode)
  return matches
}

test(
  'Target118 daemon-path fixture and two owner overrides are deterministic',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    const overrideBytes = fs.readFileSync(
      path.join(root, fixture.inputs.override.path),
    )
    assert.deepEqual(descriptor(overrideBytes), {
      bytes: fixture.inputs.override.bytes,
      sha256: fixture.inputs.override.sha256,
    })
    assert.deepEqual(
      TARGET118_DAEMON_PATHS_OWNER_OVERRIDES.map(row => ({
        targetIndex: row.targetIndex,
        paths: [...row.paths],
        declarations: [...row.declarations],
        evidenceIds: [...row.evidenceIds],
        behavior: row.behavior,
      })),
      fixture.rows.map(row => ({
        targetIndex: row.targetIndex,
        paths: [row.ownerPath],
        declarations: row.declarations,
        evidenceIds: fixture.evidenceIds,
        behavior: row.behavior,
      })),
    )
    assert.ok(
      fixture.rows.every(row => row.ownerPath !== row.provisionalOwnerPath),
    )
    const indices = fixture.rows.map(row => row.targetIndex)
    const residues = fixture.rows.flatMap(row =>
      row.residues.map(residue => [row.targetIndex, ...residue]),
    )
    assert.deepEqual(
      { units: indices.length, residues: residues.length },
      { units: fixture.summary.units, residues: fixture.summary.residues },
    )
    assert.equal(
      sha256(JSON.stringify(indices)),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      sha256(JSON.stringify(residues)),
      fixture.summary.residueIdentitiesSha256,
    )
    assert.equal(
      spawnSync(
        'git',
        ['rev-parse', `${fixture.inputs.source.commit}^{tree}`],
        { cwd: root, encoding: 'utf8' },
      ).stdout.trim(),
      fixture.inputs.source.tree,
    )
    assert.equal(
      spawnSync(
        'git',
        [
          'rev-parse',
          `${fixture.inputs.source.commit}:${fixture.inputs.source.file.path}`,
        ],
        { cwd: root, encoding: 'utf8' },
      ).stdout.trim(),
      fixture.inputs.source.file.blob,
    )
  },
)

test(
  'authenticated Target118 units bind the complete daemon directory and pipe-key behaviors',
  { skip: !selected },
  () => {
    const bundle = fs.readFileSync(targetBundlePath)
    assert.deepEqual(descriptor(bundle), {
      bytes: fixture.inputs.targetBundle.bytes,
      sha256: fixture.inputs.targetBundle.sha256,
    })
    const structuralBytes = fs.readFileSync(
      path.join(root, fixture.inputs.targetStructuralLedger.path),
    )
    assert.deepEqual(descriptor(structuralBytes), {
      bytes: fixture.inputs.targetStructuralLedger.bytes,
      sha256: fixture.inputs.targetStructuralLedger.sha256,
    })
    const structural = JSON.parse(gunzipSync(structuralBytes))

    const units = new Map()
    for (const expected of fixture.rows) {
      const region = structural.regions.find(
        candidate => candidate.target.index === expected.targetIndex,
      )
      assert.ok(region, `u${expected.targetIndex}`)
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
          classification: expected.classification,
          start: expected.start,
          end: expected.end,
          bytes: expected.bytes,
          tokenCount: expected.tokenCount,
          nodeType: expected.nodeType,
          sourceHash: expected.sourceHash,
          coarseHash: expected.coarseHash,
        },
      )
      const bytes = bundle.subarray(expected.start, expected.end)
      assert.deepEqual(descriptor(bytes), {
        bytes: expected.bytes,
        sha256: expected.sourceHash,
      })
      const unit = parse(bytes.toString(), {
        ecmaVersion: 'latest',
        sourceType: 'script',
      }).body[0]
      assert.equal(unit.type, expected.nodeType)
      units.set(expected.targetIndex, unit)
      for (const residue of expected.residues) {
        const [kind, value, start, end] = residue
        const text = bundle.subarray(start, end).toString()
        assert.equal(kind === 'string' ? JSON.parse(text) : text, value)
      }
    }

    const daemonDir = units.get(15796)
    const daemonReturns = walk(
      daemonDir,
      node =>
        node.type === 'ReturnStatement' &&
        node.argument?.type === 'CallExpression' &&
        memberName(node.argument.callee) === 'join' &&
        node.argument.arguments.length === 2 &&
        node.argument.arguments[1].value === 'daemon',
    )
    assert.equal(daemonReturns.length, 1)

    const pipeModule = units.get(15798)
    const calls = walk(pipeModule, node => node.type === 'CallExpression')
    const callsNamed = name =>
      calls.filter(call => memberName(call.callee) === name)
    assert.equal(callsNamed('readFileSync').length, 2)
    assert.equal(callsNamed('mkdirSync').length, 1)
    assert.equal(callsNamed('writeFileSync').length, 1)
    assert.equal(callsNamed('randomBytes').length, 1)
    assert.equal(callsNamed('randomBytes')[0].arguments[0].value, 8)
    const writeCall = callsNamed('writeFileSync')[0]
    assert.equal(writeCall.arguments.length, 3)
    assert.deepEqual(
      writeCall.arguments[2].properties.map(property => [
        propertyName(property),
        property.value.value,
      ]),
      [['flag', 'wx']],
    )
    const mkdirCall = callsNamed('mkdirSync')[0]
    assert.deepEqual(
      mkdirCall.arguments[1].properties.map(property => [
        propertyName(property),
        property.value.type === 'UnaryExpression' &&
          property.value.operator === '!' &&
          property.value.argument.value === 0,
      ]),
      [['recursive', true]],
    )
    assert.equal(
      walk(
        pipeModule,
        node =>
          node.type === 'BinaryExpression' &&
          node.operator === '!==' &&
          node.right?.value === 'EEXIST',
      ).length,
      1,
    )
  },
)

test(
  'historical and packaged daemon source reproduce both complete declarations and coverage evolves atomically',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const historical = gitSource()
    const packaged = fs.readFileSync(
      path.join(
        sourceRoot,
        fixture.inputs.source.file.path.replace(/^src\//, ''),
      ),
    )
    assert.deepEqual(descriptor(packaged), {
      bytes: fixture.inputs.source.file.bytes,
      sha256: fixture.inputs.source.file.sha256,
    })

    for (const [label, bytes] of [
      ['historical', historical],
      ['packaged', packaged],
    ]) {
      const sourceFile = ts.createSourceFile(
        fixture.inputs.source.file.path,
        bytes.toString('utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      )
      assert.equal(sourceFile.parseDiagnostics.length, 0, label)
      const declarations = new Map()
      for (const expected of fixture.inputs.source.declarations) {
        const matches = descendants(ts, sourceFile, node => {
          if (
            ts.isFunctionDeclaration(node) &&
            node.name?.text === expected.name
          ) {
            return true
          }
          return (
            ts.isVariableStatement(node) &&
            node.declarationList.declarations.some(
              declaration => declaration.name.getText(sourceFile) === expected.name,
            )
          )
        })
        assert.equal(matches.length, 1, `${label}: ${expected.name}`)
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
        declarations.set(expected.name, declaration.getText(sourceFile))
      }
      assert.ok(
        declarations
          .get('getDaemonDir')
          .includes("join(getClaudeConfigHomeDir(), 'daemon')"),
      )
      const pipeKey = declarations.get('getPipeKey')
      for (const marker of [
        "join(getDaemonDir(), 'pipe.key')",
        "readFileSync(path, 'utf8').trim()",
        "randomBytes(8).toString('hex')",
        'mkdirSync(getDaemonDir(), { recursive: true })',
        "writeFileSync(path, key, { flag: 'wx' })",
        "getErrnoCode(error) !== 'EEXIST'",
      ]) {
        assert.ok(pipeKey.includes(marker), `${label}: ${marker}`)
      }
    }

    const coverage = readCoverage()
    const owners = new Map(
      coverage.owners.map(owner => [owner.id, owner.path]),
    )
    const states = new Set()
    for (const expected of fixture.rows) {
      const row = coverage.rows.find(
        candidate => candidate.targetIndex === expected.targetIndex,
      )
      assert.ok(row, `u${expected.targetIndex}`)
      const paths = row.ownerIds.map(ownerId => owners.get(ownerId))
      const provisional =
        JSON.stringify(paths) ===
          JSON.stringify([expected.provisionalOwnerPath]) &&
        JSON.stringify(row.evidenceIds) ===
          JSON.stringify(['source-map-attribution', 'semantic-test'])
      const corrected =
        JSON.stringify(paths) === JSON.stringify([expected.ownerPath]) &&
        JSON.stringify(row.evidenceIds) ===
          JSON.stringify(fixture.evidenceIds) &&
        row.behavior === expected.behavior
      assert.ok(provisional || corrected, `u${expected.targetIndex}`)
      states.add(corrected ? 'corrected' : 'provisional')
    }
    assert.equal(states.size, 1, 'daemon-path owner coverage evolves atomically')
  },
)
