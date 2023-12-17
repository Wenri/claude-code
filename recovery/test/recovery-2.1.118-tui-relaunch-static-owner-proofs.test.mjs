import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import { TARGET118_TUI_RELAUNCH_STATIC_OWNER_OVERRIDES } from '../cases/2.1.117-to-2.1.118/recovered/tui-relaunch-static-owner-overrides.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-tui-relaunch-static-owner-proofs.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '5aac3dd04f0279ed78a08cde58ea2a6cfdc174be18b8780b602570ef3fe24ef5'
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

function memberName(node) {
  if (node?.type !== 'MemberExpression' || node.computed) return undefined
  return node.property?.name
}

function gitSource(file) {
  const result = spawnSync(
    'git',
    ['show', `${fixture.inputs.source.commit}:${file.path}`],
    { cwd: root, encoding: null },
  )
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), {
    bytes: file.bytes,
    sha256: file.sha256,
  })
  assert.equal(
    spawnSync(
      'git',
      ['rev-parse', `${fixture.inputs.source.commit}:${file.path}`],
      { cwd: root, encoding: 'utf8' },
    ).stdout.trim(),
    file.blob,
  )
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

function declarationNamed(ts, sourceFile, name) {
  const matches = []
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      matches.push(node)
    }
    if (
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(
        declaration => declaration.name.getText(sourceFile) === name,
      )
    ) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(matches.length, 1, name)
  return matches[0]
}

test(
  'Target118 TUI/relaunch fixture and owner overrides are deterministic',
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
      TARGET118_TUI_RELAUNCH_STATIC_OWNER_OVERRIDES.map(row => ({
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
    for (const file of fixture.inputs.source.files) gitSource(file)
  },
)

test(
  'authenticated Target118 units close relaunch environment and renderer-domain behavior',
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
      units.set(
        expected.targetIndex,
        parse(bytes.toString(), {
          ecmaVersion: 'latest',
          sourceType: 'script',
        }).body[0],
      )
      for (const residue of expected.residues) {
        const [kind, value, start, end] = residue
        const text = bundle.subarray(start, end).toString()
        assert.equal(kind === 'string' ? JSON.parse(text) : text, value)
      }
    }

    const relaunch = units.get(17052)
    const deletes = walk(
      relaunch,
      node => node.type === 'UnaryExpression' && node.operator === 'delete',
    )
    assert.equal(deletes.length, 4)
    assert.deepEqual(
      deletes
        .map(operation => memberName(operation.argument))
        .filter(Boolean),
      [
        'CLAUDE_CODE_TUI_JUST_SWITCHED',
        'CLAUDE_BRIDGE_REATTACH_SESSION',
        'CLAUDE_BRIDGE_REATTACH_SEQ',
      ],
    )
    const assign = walk(
      relaunch,
      node =>
        node.type === 'CallExpression' &&
        node.callee?.type === 'MemberExpression' &&
        node.callee.object?.name === 'Object' &&
        memberName(node.callee) === 'assign',
    )
    assert.equal(assign.length, 1)
    assert.ok(
      deletes.slice(0, 3).every(operation => operation.start < assign[0].start),
    )
    assert.ok(deletes[3].start > assign[0].start)
    const spawn = walk(
      relaunch,
      node =>
        node.type === 'CallExpression' && memberName(node.callee) === 'spawn',
    )
    assert.equal(spawn.length, 1)

    const rendererModule = units.get(17059)
    const arrays = walk(
      rendererModule,
      node =>
        node.type === 'ArrayExpression' &&
        JSON.stringify(node.elements.map(element => element?.value)) ===
          JSON.stringify(['default', 'fullscreen']),
    )
    assert.equal(arrays.length, 1)
  },
)

test(
  'historical and packaged sources retain exact relaunch and renderer declarations',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    for (const file of fixture.inputs.source.files) {
      const historical = gitSource(file)
      const packaged = fs.readFileSync(
        path.join(sourceRoot, file.path.replace(/^src\//, '')),
      )
      if (file.path === 'src/utils/relaunch.ts') {
        assert.deepEqual(descriptor(packaged), {
          bytes: file.bytes,
          sha256: file.sha256,
        })
      }
      for (const [label, bytes] of [
        ['historical', historical],
        ['packaged', packaged],
      ]) {
        const text = bytes.toString('utf8')
        const sourceFile = ts.createSourceFile(
          file.path,
          text,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TS,
        )
        assert.equal(sourceFile.parseDiagnostics.length, 0, file.path)
        for (const expected of file.declarations) {
          const declaration = declarationNamed(ts, sourceFile, expected.name)
          const start = declaration.getStart(sourceFile)
          const end = declaration.end
          assert.deepEqual(
            descriptor(Buffer.from(text.slice(start, end))),
            { bytes: expected.bytes, sha256: expected.sha256 },
            `${label}: ${expected.name}`,
          )
          if (label === 'historical') {
            assert.deepEqual(
              { start, end },
              { start: expected.start, end: expected.end },
              expected.name,
            )
          }
          if (expected.name === 'relaunch') {
            const deleteNames = []
            function visit(node) {
              if (ts.isDeleteExpression(node)) {
                deleteNames.push(node.expression.name?.text)
              }
              ts.forEachChild(node, visit)
            }
            visit(declaration)
            assert.equal(deleteNames.length, 4)
            assert.deepEqual(deleteNames.filter(Boolean), [
              'CLAUDE_CODE_TUI_JUST_SWITCHED',
              'CLAUDE_BRIDGE_REATTACH_SESSION',
              'CLAUDE_BRIDGE_REATTACH_SEQ',
            ])
          } else {
            const variable = declaration.declarationList.declarations[0]
            const initializer = ts.isAsExpression(variable.initializer)
              ? variable.initializer.expression
              : variable.initializer
            assert.ok(ts.isArrayLiteralExpression(initializer))
            assert.deepEqual(
              initializer.elements.map(element => element.text),
              ['default', 'fullscreen'],
            )
          }
        }
      }
    }
  },
)

test(
  'TUI/relaunch static owner coverage evolves atomically',
  { skip: !selected },
  () => {
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
    assert.equal(states.size, 1, 'TUI/relaunch coverage evolves atomically')
  },
)
