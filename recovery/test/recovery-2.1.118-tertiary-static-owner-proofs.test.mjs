import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { TARGET118_TERTIARY_STATIC_OWNER_OVERRIDES } from '../cases/2.1.117-to-2.1.118/recovered/tertiary-static-owner-overrides.mjs'

const root = process.cwd()
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      'recovery/test/recovery-2.1.118-tertiary-static-owner-proofs.json',
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

function visit(ts, node, predicate, values = []) {
  if (predicate(node)) values.push(node)
  ts.forEachChild(node, child => {
    visit(ts, child, predicate, values)
  })
  return values
}

function findDeclaration(ts, sourceFile, name) {
  const matches = []
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) {
      matches.push(statement)
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === name) {
          matches.push(declaration)
        }
      }
    }
  }
  assert.equal(matches.length, 1, `${sourceFile.fileName}:${name}`)
  return matches[0]
}

function staticString(ts, node) {
  if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node)
  ) {
    return node.text
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = staticString(ts, node.left)
    const right = staticString(ts, node.right)
    return left === undefined || right === undefined ? undefined : left + right
  }
  return undefined
}

async function assertSourceProof(filename, row) {
  const ts = await loadTypeScript()
  const source = fs.readFileSync(filename, 'utf8')
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, filename)
  const declaration = findDeclaration(ts, sourceFile, row.sourceProof.declaration)
  const declarationText = declaration.getText(sourceFile)
  for (const marker of row.sourceProof.sourceMarkers) {
    assert(declarationText.includes(marker), `u${row.targetIndex}:${marker}`)
  }

  const residueValue = row.residues[0][1]
  if (row.sourceProof.role === 'folded-string-property') {
    const matches = visit(
      ts,
      declaration,
      node =>
        ts.isPropertyAssignment(node) &&
        node.name.getText(sourceFile) === row.sourceProof.property &&
        staticString(ts, node.initializer) === residueValue,
    )
    assert.equal(matches.length, 1, `u${row.targetIndex}: folded message`)
    return
  }

  const identifier = row.sourceProof.identifier
  const bindings = visit(
    ts,
    declaration,
    node =>
      ts.isBindingElement(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === identifier,
  )
  assert.equal(bindings.length, 1, `u${row.targetIndex}: binding`)

  if (row.sourceProof.role === 'dynamic-import-binding-and-call') {
    const calls = visit(
      ts,
      declaration,
      node =>
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === identifier,
    )
    assert.equal(calls.length, 1, `u${row.targetIndex}: call`)
    return
  }

  assert.equal(row.sourceProof.role, 'binding-and-return')
  const returns = visit(
    ts,
    declaration,
    node =>
      ts.isReturnStatement(node) &&
      node.expression !== undefined &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === identifier,
  )
  assert.equal(returns.length, 1, `u${row.targetIndex}: return`)
}

test('Target118 tertiary static-owner fixture is complete and deterministic', () => {
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.117-to-2.1.118')
  assert.equal(fixture.summary.units, 4)
  assert.equal(fixture.summary.residues, 4)
  assert.deepEqual(
    fixture.rows.map(row => row.targetIndex),
    [2523, 6249, 15337, 20013],
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
    TARGET118_TERTIARY_STATIC_OWNER_OVERRIDES.map(row => row.targetIndex),
    fixture.rows.map(row => row.targetIndex),
  )
})

test('authenticated Target118 bundle pins every tertiary static unit and residue', () => {
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
      const targetText = bundle.subarray(residue[2], residue[3]).toString()
      assert.equal(
        residue[0] === 'string' ? targetText.slice(1, -1) : targetText,
        residue[1],
      )
    }
  }
})

test('historical Target118 source AST proves each tertiary static owner', async () => {
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
    await assertSourceProof(filename, row)
  }
})

test('Target118 tertiary static evidence changes only as one proof set', () => {
  const coverage = readCoverage()
  const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
  const rows = new Map(coverage.rows.map(row => [row.targetIndex, row]))
  const states = []
  for (const expected of TARGET118_TERTIARY_STATIC_OWNER_OVERRIDES) {
    const row = rows.get(expected.targetIndex)
    assert(row)
    const ownerPaths = row.ownerIds.map(id => owners.get(id))
    const evidenceState = expected.evidenceIds.map(id => row.evidenceIds.includes(id))
    assert.equal(
      new Set(evidenceState).size,
      1,
      `u${expected.targetIndex}: partial evidence`,
    )
    const proved = evidenceState[0]
    if (proved) assert.deepEqual(ownerPaths, expected.paths)
    states.push(proved ? 'proved' : 'provisional')
  }
  assert.equal(new Set(states).size, 1, `mixed proof state: ${states}`)
})
