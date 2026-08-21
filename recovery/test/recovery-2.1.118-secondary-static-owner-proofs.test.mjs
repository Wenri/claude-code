import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { TARGET118_SECONDARY_STATIC_OWNER_OVERRIDES } from '../cases/2.1.117-to-2.1.118/recovered/secondary-static-owner-overrides.mjs'

const root = process.cwd()
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      'recovery/test/recovery-2.1.118-secondary-static-owner-proofs.json',
    ),
    'utf8',
  ),
)
const targetBundlePath =
  process.env.CLAUDE_CODE_2_1_118_BUNDLE ??
  path.join(
    root,
    '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
  )
const sourceRoot =
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
  path.join(root, '.recovery-tmp/semantic-trees/2.1.118/src')

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })

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

async function assertDeclaration(filename, declarationName) {
  const imported = await import(
    pathToFileURL(
      path.join(
        root,
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      ),
    ).href
  )
  const ts = imported.default ?? imported
  const source = fs.readFileSync(filename, 'utf8')
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, filename)
  const matches = sourceFile.statements.filter(statement =>
    declarationName === '@default-export'
      ? ts.isExportAssignment(statement)
      : ts.isFunctionDeclaration(statement) &&
        statement.name?.text === declarationName,
  )
  assert.equal(matches.length, 1, `${filename}:${declarationName}`)
}

test('Target118 secondary static-owner fixture is complete and deterministic', () => {
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.117-to-2.1.118')
  assert.equal(fixture.summary.units, 3)
  assert.equal(fixture.summary.residues, 3)
  assert.deepEqual(
    fixture.rows.map(row => row.targetIndex),
    [13032, 17153, 18389],
  )
  assert.equal(
    sha256(JSON.stringify(fixture.rows.map(row => row.targetIndex))),
    fixture.summary.indicesSha256,
  )
  assert.equal(
    sha256(JSON.stringify(fixture.rows.flatMap(row => row.residues))),
    fixture.summary.residueIdentitiesSha256,
  )
  assert.deepEqual(
    TARGET118_SECONDARY_STATIC_OWNER_OVERRIDES.map(row => row.targetIndex),
    fixture.rows.map(row => row.targetIndex),
  )
})

test('authenticated Target118 bundle pins all secondary static units', () => {
  if (!fs.existsSync(targetBundlePath)) {
    return test.skip('authenticated Target118 bundle is unavailable')
  }
  const bundle = fs.readFileSync(targetBundlePath)
  assert.deepEqual(descriptor(bundle), fixture.inputs.targetBundle)
  for (const row of fixture.rows) {
    const slice = bundle.subarray(row.target.start, row.target.end)
    assert.equal(slice.length, row.target.bytes, `u${row.targetIndex}: bytes`)
    assert.equal(sha256(slice), row.target.sourceHash, `u${row.targetIndex}: hash`)
    for (const residue of row.residues) {
      assert(residue[2] >= row.target.start)
      assert(residue[3] <= row.target.end)
    }
  }
})

test('historical Target118 source AST pins every secondary static owner', async () => {
  const files = new Map(
    fixture.inputs.sourceFiles.map(row => [row.sourcePath, row]),
  )
  for (const row of fixture.rows) {
    const filename = path.join(sourceRoot, row.ownerPath.replace(/^src\//, ''))
    const source = fs.readFileSync(filename)
    const expected = files.get(row.ownerPath)
    assert(expected)
    assert.deepEqual(descriptor(source), {
      bytes: expected.bytes,
      sha256: expected.sha256,
    })
    await assertDeclaration(filename, row.declaration)
    const text = source.toString('utf8')
    for (const marker of row.sourceMarkers) {
      assert(text.includes(marker), `u${row.targetIndex}:${marker}`)
    }
  }
})

test('Target118 secondary static evidence changes only as one proof set', () => {
  const coverage = readCoverage()
  const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
  const rows = new Map(coverage.rows.map(row => [row.targetIndex, row]))
  const states = []
  for (const expected of TARGET118_SECONDARY_STATIC_OWNER_OVERRIDES) {
    const row = rows.get(expected.targetIndex)
    assert(row)
    assert.deepEqual(row.ownerIds.map(id => owners.get(id)), expected.paths)
    const state = expected.evidenceIds.map(id => row.evidenceIds.includes(id))
    assert.equal(new Set(state).size, 1, `u${expected.targetIndex}: partial evidence`)
    states.push(state[0] ? 'proved' : 'provisional')
  }
  assert.equal(new Set(states).size, 1, `mixed proof state: ${states}`)
})
