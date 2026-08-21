import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { TARGET118_QUATERNARY_STATIC_OWNER_OVERRIDES } from '../cases/2.1.117-to-2.1.118/recovered/quaternary-static-owner-overrides.mjs'

const root = process.cwd()
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      'recovery/test/recovery-2.1.118-quaternary-static-owner-proofs.json',
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

function identifiers(ts, declaration, name) {
  return visit(
    ts,
    declaration,
    node => ts.isIdentifier(node) && node.text === name,
  )
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
  const text = declaration.getText(sourceFile)
  for (const marker of row.sourceProof.sourceMarkers) {
    assert(text.includes(marker), `u${row.targetIndex}:${marker}`)
  }

  const proof = row.sourceProof
  if (proof.role === 'module-state-object-lowering') {
    assert(identifiers(ts, declaration, proof.identifiers[0]).length >= 1)
    assert.equal(
      visit(
        ts,
        declaration,
        node =>
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
          identifiers(ts, node.left, proof.identifiers[0]).length === 1,
      ).length,
      1,
    )
    return
  }

  if (proof.role === 'binding-elements') {
    for (const identifier of proof.identifiers) {
      assert.equal(
        visit(
          ts,
          declaration,
          node =>
            ts.isBindingElement(node) &&
            ts.isIdentifier(node.name) &&
            node.name.text === identifier,
        ).length,
        1,
        `u${row.targetIndex}:${identifier} binding`,
      )
    }
    return
  }

  if (proof.role === 'binding-and-optional-call') {
    const identifier = proof.identifiers[0]
    assert.equal(
      visit(
        ts,
        declaration,
        node =>
          ts.isBindingElement(node) &&
          ts.isIdentifier(node.name) &&
          node.name.text === identifier,
      ).length,
      1,
    )
    assert.equal(
      visit(
        ts,
        declaration,
        node =>
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === identifier &&
          node.questionDotToken !== undefined,
      ).length,
      1,
    )
    return
  }

  if (proof.role === 'jsx-key-lowering') {
    assert.equal(
      visit(
        ts,
        declaration,
        node =>
          ts.isJsxAttribute(node) &&
          ts.isIdentifier(node.name) &&
          node.name.text === 'key',
      ).length,
      1,
    )
    return
  }

  if (proof.role === 'static-string-length-fold') {
    assert.equal(proof.staticString.length, proof.foldedValue)
    const lengths = visit(
      ts,
      declaration,
      node =>
        ts.isPropertyAccessExpression(node) &&
        node.name.text === 'length' &&
        ts.isStringLiteral(node.expression) &&
        node.expression.text === proof.staticString,
    )
    assert.equal(lengths.length, 1)
    return
  }

  if (proof.role === 'react-compiler-cache-call') {
    assert.equal(
      visit(
        ts,
        declaration,
        node =>
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === proof.identifiers[0] &&
          node.arguments.length === 1 &&
          ts.isNumericLiteral(node.arguments[0]) &&
          Number(node.arguments[0].text) === proof.cacheSlots,
      ).length,
      1,
    )
    return
  }

  if (proof.role === 'named-import-call-lowering') {
    const identifier = proof.identifiers[0]
    assert.equal(
      visit(
        ts,
        sourceFile,
        node =>
          ts.isImportSpecifier(node) &&
          ts.isIdentifier(node.name) &&
          node.name.text === identifier &&
          ts.isImportDeclaration(node.parent.parent.parent) &&
          ts.isStringLiteral(node.parent.parent.parent.moduleSpecifier) &&
          node.parent.parent.parent.moduleSpecifier.text === proof.importModule,
      ).length,
      1,
    )
    assert.equal(
      visit(
        ts,
        declaration,
        node =>
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === identifier,
      ).length,
      1,
    )
    return
  }

  assert.fail(`unknown proof role ${proof.role}`)
}

test('Target118 quaternary static-owner fixture is complete and deterministic', () => {
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.117-to-2.1.118')
  assert.equal(fixture.summary.units, 10)
  assert.equal(fixture.summary.residues, 11)
  assert.deepEqual(
    fixture.rows.map(row => row.targetIndex),
    [6796, 15447, 18758, 20441, 20443, 20523, 20897, 20898, 20908, 20916],
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
    TARGET118_QUATERNARY_STATIC_OWNER_OVERRIDES.map(row => row.targetIndex),
    fixture.rows.map(row => row.targetIndex),
  )
})

test('authenticated Target118 bundle pins every quaternary static unit and residue', () => {
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
      assert.equal(bundle.subarray(residue[2], residue[3]).toString(), String(residue[1]))
    }
  }
})

test('historical Target118 source AST proves each quaternary static owner', async () => {
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

test('Target118 quaternary static evidence changes only as one proof set', () => {
  const coverage = readCoverage()
  const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
  const rows = new Map(coverage.rows.map(row => [row.targetIndex, row]))
  const states = []
  for (const expected of TARGET118_QUATERNARY_STATIC_OWNER_OVERRIDES) {
    const row = rows.get(expected.targetIndex)
    assert(row)
    const ownerPaths = row.ownerIds.map(id => owners.get(id))
    const evidenceState = expected.evidenceIds.map(id =>
      row.evidenceIds.includes(id),
    )
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
