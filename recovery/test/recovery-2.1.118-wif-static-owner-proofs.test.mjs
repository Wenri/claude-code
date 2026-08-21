import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET118_WIF_STATIC_OWNER_EVIDENCE_IDS,
  TARGET118_WIF_STATIC_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/wif-static-owner-overrides.mjs'

const root = process.cwd()
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(root, 'recovery/test/recovery-2.1.118-wif-static-owner-proofs.json'),
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
const sliceDescriptor = (value, start, end) => ({
  start,
  end,
  ...descriptor(value.subarray(start, end)),
})

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

function targetExportBinding(unitAst, propertyName) {
  assert.equal(unitAst.body.length, 1)
  const expression = unitAst.body[0]?.expression
  assert.equal(expression?.type, 'CallExpression')
  const exportsObject = expression.arguments[1]
  assert.equal(exportsObject?.type, 'ObjectExpression')
  const matches = exportsObject.properties.filter(
    property =>
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

test('Target118 WIF static-owner fixture is exact and deterministic', () => {
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.117-to-2.1.118')
  assert.deepEqual(fixture.evidenceIds, TARGET118_WIF_STATIC_OWNER_EVIDENCE_IDS)
  assert.equal(fixture.summary.units, 1)
  assert.equal(fixture.summary.residues, 2)
  assert.equal(
    sha256(JSON.stringify([fixture.row.targetIndex])),
    fixture.summary.indicesSha256,
  )
  assert.equal(
    sha256(JSON.stringify(fixture.row.residues)),
    fixture.summary.residueIdentitiesSha256,
  )
  assert.equal(TARGET118_WIF_STATIC_OWNER_OVERRIDES.length, 1)
  const override = TARGET118_WIF_STATIC_OWNER_OVERRIDES[0]
  assert.equal(override.targetIndex, fixture.row.targetIndex)
  assert.deepEqual(override.paths, [fixture.row.ownerPath])
  assert.deepEqual(override.evidenceIds, fixture.evidenceIds)
  assert.equal(override.behavior, fixture.row.behavior)
})

test('authenticated Target118 bundle binds both WIF exports to exact declarations', () => {
  if (!fs.existsSync(targetBundlePath)) {
    return test.skip('authenticated Target118 bundle is unavailable')
  }
  const targetBundle = fs.readFileSync(targetBundlePath)
  assert.deepEqual(descriptor(targetBundle), fixture.inputs.targetBundle)
  const { target } = fixture.row
  assert.deepEqual(
    sliceDescriptor(targetBundle, target.start, target.end),
    {
      start: target.start,
      end: target.end,
      bytes: target.bytes,
      sha256: target.sourceHash,
    },
  )
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
  const unitAst = parse(
    targetText.slice(target.start, target.end),
    { ecmaVersion: 'latest', sourceType: 'script' },
  )
  for (const declaration of fixture.row.declarations) {
    assert.equal(
      targetExportBinding(unitAst, declaration.name),
      declaration.targetBinding,
    )
    const targetDeclaration = targetFunctions.get(declaration.targetBinding)
    assert(targetDeclaration, declaration.targetBinding)
    assert.deepEqual(
      sliceDescriptor(targetBundle, targetDeclaration.start, targetDeclaration.end),
      declaration.targetDeclaration,
    )
    const declarationText = targetText.slice(
      targetDeclaration.start,
      targetDeclaration.end,
    )
    for (const marker of declaration.targetMarkers) {
      assert(declarationText.includes(marker), `${declaration.name}:${marker}`)
    }
  }
  for (const residue of fixture.row.residues) {
    const [kind, value, start, end] = residue
    assert(start >= target.start && end <= target.end)
    const raw = targetText.slice(start, end)
    assert.equal(kind, 'property')
    assert.equal(raw, value)
  }
})

test('historical Target118 source AST proves the corrected WIF owner', async () => {
  const ts = await loadTypeScript()
  const filename = path.join(
    sourceRoot,
    fixture.inputs.sourceFile.sourcePath.replace(/^src\//, ''),
  )
  const source = fs.readFileSync(filename)
  assert.deepEqual(descriptor(source), {
    bytes: fixture.inputs.sourceFile.bytes,
    sha256: fixture.inputs.sourceFile.sha256,
  })
  const sourceText = source.toString()
  const sourceFile = ts.createSourceFile(
    filename,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  for (const declaration of fixture.row.declarations) {
    const matches = sourceFile.statements.filter(
      statement =>
        ts.isFunctionDeclaration(statement) &&
        statement.name?.text === declaration.name,
    )
    assert.equal(matches.length, 1, declaration.name)
    const node = matches[0]
    assert(
      node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword),
      `${declaration.name}: export`,
    )
    assert.deepEqual(
      sliceDescriptor(source, node.getStart(sourceFile), node.end),
      declaration.sourceDeclaration,
    )
    const declarationText = sourceText.slice(node.getStart(sourceFile), node.end)
    for (const marker of declaration.sourceMarkers) {
      assert(declarationText.includes(marker), `${declaration.name}:${marker}`)
    }
  }
  assert.equal(
    sourceText.includes('export function withCredentialsLock'),
    true,
  )
  assert.equal(sourceText.includes('export function getWIFAuthType'), true)
})

test('Target118 coverage uses only the WIF source owner and proof evidence', () => {
  const coverage = JSON.parse(
    gunzipSync(
      fs.readFileSync(
        path.join(
          root,
          'recovery/cases/2.1.117-to-2.1.118/semantic/source-coverage.json.gz',
        ),
      ),
    ),
  )
  const row = coverage.rows.find(row => row.targetIndex === fixture.row.targetIndex)
  assert(row)
  assert.equal(row.disposition, 'source-runtime-covered')
  const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
  assert.deepEqual(row.ownerIds.map(id => owners.get(id)).sort(), [fixture.row.ownerPath])
  for (const evidenceId of fixture.evidenceIds) {
    assert(row.evidenceIds.includes(evidenceId), evidenceId)
    const evidence = coverage.evidence.find(item => item.id === evidenceId)
    assert(evidence)
    assert.equal(
      evidence.path,
      'recovery/test/recovery-2.1.118-wif-static-owner-proofs.test.mjs',
    )
  }
  assert.equal(
    row.ownerIds.some(id => owners.get(id) === fixture.row.provisionalOwnerPath),
    false,
  )
})
