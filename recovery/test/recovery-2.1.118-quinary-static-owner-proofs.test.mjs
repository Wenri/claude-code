import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import { TARGET118_QUINARY_STATIC_OWNER_OVERRIDES } from '../cases/2.1.117-to-2.1.118/recovered/quinary-static-owner-overrides.mjs'

const root = process.cwd()
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      'recovery/test/recovery-2.1.118-quinary-static-owner-proofs.json',
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
const descriptorAt = (value, start, end) => ({
  start,
  end,
  ...descriptor(value.subarray(start, end)),
})

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

function walk(node, visit) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (!['start', 'end', 'loc', 'range'].includes(key)) walk(child, visit)
  }
}

function countTargetIdentifier(node, name) {
  let count = 0
  walk(node, child => {
    if (child.type === 'Identifier' && child.name === name) count += 1
  })
  return count
}

function targetExportBinding(unitAst, propertyName) {
  const statement = unitAst.body[0]
  const call = statement?.type === 'ExpressionStatement' ? statement.expression : null
  assert.equal(call?.type, 'CallExpression')
  assert.equal(call.arguments[1]?.type, 'ObjectExpression')
  const matches = call.arguments[1].properties.filter(property =>
    property.type === 'Property' &&
    !property.computed &&
    ((property.key.type === 'Identifier' && property.key.name === propertyName) ||
      (property.key.type === 'Literal' && property.key.value === propertyName)),
  )
  assert.equal(matches.length, 1, propertyName)
  const value = matches[0].value
  assert.equal(value.type, 'ArrowFunctionExpression', propertyName)
  assert.equal(value.params.length, 0, propertyName)
  assert.equal(value.body.type, 'Identifier', propertyName)
  return value.body.name
}

function visitTs(ts, node, predicate, values = []) {
  if (predicate(node)) values.push(node)
  ts.forEachChild(node, child => {
    visitTs(ts, child, predicate, values)
  })
  return values
}

function findSourceFunction(ts, sourceFile, name) {
  const matches = sourceFile.statements.filter(
    statement =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  )
  assert.equal(matches.length, 1, `${sourceFile.fileName}:${name}`)
  return matches[0]
}

test('Target118 quinary static-owner fixture is complete and deterministic', () => {
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.117-to-2.1.118')
  assert.equal(fixture.summary.units, 3)
  assert.equal(fixture.summary.residues, 5)
  assert.deepEqual(
    fixture.rows.map(row => row.targetIndex),
    [6166, 15119, 17959],
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
    TARGET118_QUINARY_STATIC_OWNER_OVERRIDES.map(row => row.targetIndex),
    fixture.rows.map(row => row.targetIndex),
  )
})

test('authenticated Target118 bundle binds each quinary residue to its runtime declaration', () => {
  if (!fs.existsSync(targetBundlePath)) {
    return test.skip('authenticated Target118 bundle is unavailable')
  }
  const targetBundle = fs.readFileSync(targetBundlePath)
  assert.deepEqual(descriptor(targetBundle), fixture.inputs.targetBundle)
  const targetText = targetBundle.toString()
  const targetAst = parse(targetText, {
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const targetFunctions = new Map(
    targetAst.body
      .filter(node => node.type === 'FunctionDeclaration' && node.id)
      .map(node => [node.id.name, node]),
  )

  for (const row of fixture.rows) {
    const targetSlice = targetBundle.subarray(row.target.start, row.target.end)
    assert.equal(targetSlice.length, row.target.bytes, `u${row.targetIndex}: bytes`)
    assert.equal(sha256(targetSlice), row.target.sourceHash, `u${row.targetIndex}: hash`)
    for (const residue of row.residues) {
      assert(residue[2] >= row.target.start)
      assert(residue[3] <= row.target.end)
      const text = targetBundle.subarray(residue[2], residue[3]).toString()
      assert.equal(residue[0] === 'string' ? text.slice(1, -1) : text, residue[1])
    }

    const unitAst = parse(targetSlice.toString(), {
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    if (row.sourceProof.role === 'module-export-registry') {
      for (const declaration of row.sourceProof.declarations) {
        assert.equal(
          targetExportBinding(unitAst, declaration.name),
          declaration.targetBinding,
        )
        const targetDeclaration = targetFunctions.get(declaration.targetBinding)
        assert(targetDeclaration, declaration.targetBinding)
        assert.deepEqual(
          descriptorAt(targetBundle, targetDeclaration.start, targetDeclaration.end),
          declaration.targetDeclaration,
        )
        const declarationText = targetText.slice(
          targetDeclaration.start,
          targetDeclaration.end,
        )
        for (const marker of declaration.targetMarkers) {
          assert(
            declarationText.includes(marker),
            `u${row.targetIndex}:${declaration.name}:${marker}`,
          )
        }
      }
      continue
    }

    assert.equal(row.sourceProof.role, 'common-template-prefix-extraction')
    const residue = row.residues[0][1]
    const declarators = unitAst.body.flatMap(statement =>
      statement.type === 'VariableDeclaration' ? statement.declarations : [],
    )
    const literalBindings = declarators.filter(
      declaration =>
        declaration.id.type === 'Identifier' &&
        declaration.init?.type === 'Literal' &&
        declaration.init.value === residue,
    )
    assert.equal(literalBindings.length, 1)
    assert.equal(literalBindings[0].id.name, row.sourceProof.targetBinding)
    const consumer = targetFunctions.get(row.sourceProof.targetConsumerBinding)
    assert(consumer)
    assert.deepEqual(
      descriptorAt(targetBundle, consumer.start, consumer.end),
      row.sourceProof.targetConsumer,
    )
    assert.equal(
      countTargetIdentifier(consumer.body, row.sourceProof.targetBinding),
      row.sourceProof.targetConsumerReferenceCount,
    )
    const consumerText = targetText.slice(consumer.start, consumer.end)
    for (const marker of row.sourceProof.targetMarkers) {
      assert(consumerText.includes(marker), `u${row.targetIndex}:${marker}`)
    }
  }
})

test('historical Target118 source AST proves each quinary owner and lowering', async () => {
  const ts = await loadTypeScript()
  const sourceFiles = new Map(
    fixture.inputs.sourceFiles.map(({ sourcePath, ...file }) => [sourcePath, file]),
  )
  for (const row of fixture.rows) {
    const filename = path.join(sourceRoot, row.ownerPath.replace(/^src\//, ''))
    const source = fs.readFileSync(filename)
    assert.deepEqual(descriptor(source), sourceFiles.get(row.ownerPath))
    const sourceFile = ts.createSourceFile(
      filename,
      source.toString(),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    assert.equal(sourceFile.parseDiagnostics.length, 0, filename)

    if (row.sourceProof.role === 'module-export-registry') {
      for (const declarationProof of row.sourceProof.declarations) {
        const declaration = findSourceFunction(
          ts,
          sourceFile,
          declarationProof.name,
        )
        assert(
          declaration.modifiers?.some(
            modifier => modifier.kind === ts.SyntaxKind.ExportKeyword,
          ),
          `${row.ownerPath}:${declarationProof.name}: export`,
        )
        assert.deepEqual(
          descriptorAt(
            source,
            declaration.getStart(sourceFile),
            declaration.end,
          ),
          declarationProof.sourceDeclaration,
        )
        const declarationText = declaration.getText(sourceFile)
        for (const marker of declarationProof.sourceMarkers) {
          assert(
            declarationText.includes(marker),
            `${row.ownerPath}:${declarationProof.name}:${marker}`,
          )
        }
      }
      continue
    }

    const declaration = findSourceFunction(
      ts,
      sourceFile,
      row.sourceProof.sourceDeclarationName,
    )
    assert.deepEqual(
      descriptorAt(source, declaration.getStart(sourceFile), declaration.end),
      row.sourceProof.sourceDeclaration,
    )
    const declarationText = declaration.getText(sourceFile)
    for (const marker of row.sourceProof.sourceMarkers) {
      assert(declarationText.includes(marker), `${row.ownerPath}:${marker}`)
    }
    const residue = row.residues[0][1]
    const templatePrefixes = visitTs(
      ts,
      declaration,
      node =>
        ts.isTemplateExpression(node) &&
        node.head.text.startsWith(residue) &&
        node.head.text.slice(residue.length).startsWith('\n\n## Plan File Info:'),
    )
    assert.equal(
      templatePrefixes.length,
      row.sourceProof.sourceTemplatePrefixCount,
    )
  }
})

test('Target118 quinary static evidence changes only as one proof set', () => {
  const coverage = readCoverage()
  const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
  const rows = new Map(coverage.rows.map(row => [row.targetIndex, row]))
  const states = []
  for (const expected of TARGET118_QUINARY_STATIC_OWNER_OVERRIDES) {
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
