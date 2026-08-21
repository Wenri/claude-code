import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import { TARGET118_WSL_FINGERPRINT_PROPERTY_OWNER_OVERRIDES } from '../cases/2.1.117-to-2.1.118/recovered/wsl-fingerprint-property-owner-overrides.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-wsl-fingerprint-property-owner-proof.json',
)
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
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

function visit(node, predicate, values = []) {
  if (predicate(node)) values.push(node)
  for (const value of Object.values(node ?? {})) {
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child.type === 'string') visit(child, predicate, values)
      }
    } else if (value && typeof value.type === 'string') {
      visit(value, predicate, values)
    }
  }
  return values
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

function readSourceDescriptor(sourcePath) {
  const value = fs.readFileSync(path.join(sourceRoot, sourcePath.replace(/^src\//, '')))
  return descriptor(value)
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

test('Target118 WSL fingerprint fixture and override are deterministic', () => {
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.117-to-2.1.118')
  assert.equal(fixture.summary.units, 1)
  assert.equal(fixture.summary.residues, 2)
  assert.equal(fixture.targetUnit.targetIndex, 8094)
  assert.equal(
    sha256(JSON.stringify([fixture.targetUnit.targetIndex])),
    fixture.summary.indicesSha256,
  )
  assert.equal(
    sha256(JSON.stringify(fixture.targetUnit.residues)),
    fixture.summary.residueIdentitiesSha256,
  )
  assert.deepEqual(
    TARGET118_WSL_FINGERPRINT_PROPERTY_OWNER_OVERRIDES.map(row => ({
      targetIndex: row.targetIndex,
      paths: [...row.paths],
      evidenceIds: [...row.evidenceIds],
    })),
    [
      {
        targetIndex: 8094,
        paths: [fixture.sourceProof.ownerPath],
        evidenceIds: fixture.evidenceIds,
      },
    ],
  )
})

test('authenticated Target118 fragments pin both snapshot keys to one helper binding', () => {
  if (!fs.existsSync(targetBundlePath)) {
    return test.skip('authenticated Target118 bundle is unavailable')
  }
  const bundle = fs.readFileSync(targetBundlePath)
  assert.deepEqual(descriptor(bundle), fixture.inputs.targetBundle)

  const unit = bundle.subarray(fixture.targetUnit.start, fixture.targetUnit.end)
  assert.deepEqual(descriptor(unit), {
    bytes: fixture.targetUnit.bytes,
    sha256: fixture.targetUnit.sourceHash,
  })
  for (const residue of fixture.targetUnit.residues) {
    assert.equal(
      bundle.subarray(residue[2], residue[3]).toString(),
      residue[1],
    )
  }

  const unitAst = parse(unit.toString(), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  })
  const snapshotObjects = visit(
    unitAst,
    node =>
      node.type === 'ObjectExpression' &&
      node.properties.some(
        property =>
          property.type === 'Property' &&
          property.key.type === 'Identifier' &&
          property.key.name === fixture.sourceProof.targetSnapshotKey,
      ),
  )
  assert.equal(snapshotObjects.length, 2)
  for (const object of snapshotObjects) {
    const properties = new Map(
      object.properties.map(property => [property.key.name ?? property.key.value, property]),
    )
    for (const key of fixture.sourceProof.commonSnapshotKeys) assert(properties.has(key))
    const fingerprint = properties.get(fixture.sourceProof.targetSnapshotKey)
    assert.equal(fingerprint.value.type, 'CallExpression')
    assert.equal(fingerprint.value.arguments.length, 0)
    assert.equal(fingerprint.value.callee.type, 'Identifier')
    assert.equal(fingerprint.value.callee.name, fixture.sourceProof.targetHelperBinding)
  }

  const helper = bundle.subarray(
    fixture.targetFingerprintHelper.start,
    fixture.targetFingerprintHelper.end,
  )
  assert.deepEqual(descriptor(helper), {
    bytes: fixture.targetFingerprintHelper.bytes,
    sha256: fixture.targetFingerprintHelper.sha256,
  })
  const helperAst = parse(helper.toString(), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  })
  assert.equal(helperAst.body[0].id.name, fixture.targetFingerprintHelper.name)
  for (const marker of [
    'managed-settings.json',
    'managed-settings.d',
    '.json',
    '.',
  ]) {
    assert(
      visit(helperAst, node => node.type === 'Literal' && node.value === marker).length >= 1,
      `target helper marker ${JSON.stringify(marker)}`,
    )
  }
  assert(helper.toString().includes(String.raw`\x00`))
  assert(helper.toString().includes(String.raw`\x01`))
})

test('historical source AST proves the local-key compiler equivalence', async () => {
  const ts = await loadTypeScript()
  for (const input of fixture.inputs.sourceFiles) {
    assert.deepEqual(readSourceDescriptor(input.sourcePath), {
      bytes: input.bytes,
      sha256: input.sha256,
    })
  }

  const parseSource = sourcePath => {
    const filename = path.join(sourceRoot, sourcePath.replace(/^src\//, ''))
    const source = fs.readFileSync(filename, 'utf8')
    const sourceFile = ts.createSourceFile(
      filename,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    assert.equal(sourceFile.parseDiagnostics.length, 0)
    return { source, sourceFile }
  }
  const findFunction = (sourceFile, name) => {
    const matches = []
    const walk = node => {
      if (ts.isFunctionDeclaration(node) && node.name?.text === name) matches.push(node)
      ts.forEachChild(node, walk)
    }
    walk(sourceFile)
    assert.equal(matches.length, 1, name)
    return matches[0]
  }

  const owner = parseSource(fixture.sourceProof.ownerPath)
  const declaration = findFunction(
    owner.sourceFile,
    fixture.sourceProof.ownerDeclaration.name,
  )
  const declarationText = declaration.getText(owner.sourceFile)
  assert.equal(declaration.getStart(owner.sourceFile), fixture.sourceProof.ownerDeclaration.start)
  assert.equal(declaration.end, fixture.sourceProof.ownerDeclaration.end)
  assert.deepEqual(descriptor(Buffer.from(declarationText)), {
    bytes: fixture.sourceProof.ownerDeclaration.bytes,
    sha256: fixture.sourceProof.ownerDeclaration.sha256,
  })

  const snapshotProperties = []
  const walkOwner = node => {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === fixture.sourceProof.sourceSnapshotKey
    ) {
      snapshotProperties.push(node)
    }
    ts.forEachChild(node, walkOwner)
  }
  walkOwner(declaration)
  assert.equal(snapshotProperties.length, 2)
  for (const property of snapshotProperties) {
    assert(ts.isCallExpression(property.initializer))
    assert.equal(property.initializer.arguments.length, 0)
    assert(ts.isIdentifier(property.initializer.expression))
    assert.equal(
      property.initializer.expression.text,
      fixture.sourceProof.sourceHelperBinding,
    )
    const object = property.parent
    const keys = new Set(
      object.properties
        .filter(
          item =>
            ts.isPropertyAssignment(item) ||
            ts.isShorthandPropertyAssignment(item),
        )
        .map(item => item.name.getText(owner.sourceFile)),
    )
    for (const key of fixture.sourceProof.commonSnapshotKeys) assert(keys.has(key))
  }
  assert.equal(
    owner.sourceFile.statements.filter(
      statement =>
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        statement.moduleSpecifier.text === './mdm/settings.js' &&
        statement.importClause?.namedBindings?.elements.some(
          element => element.name.text === fixture.sourceProof.sourceHelperBinding,
        ),
    ).length,
    1,
  )

  const helper = parseSource(fixture.sourceProof.helperPath)
  const helperDeclaration = findFunction(
    helper.sourceFile,
    fixture.sourceProof.helperDeclaration.name,
  )
  const helperText = helperDeclaration.getText(helper.sourceFile)
  assert.equal(
    helperDeclaration.getStart(helper.sourceFile),
    fixture.sourceProof.helperDeclaration.start,
  )
  assert.equal(helperDeclaration.end, fixture.sourceProof.helperDeclaration.end)
  assert.deepEqual(descriptor(Buffer.from(helperText)), {
    bytes: fixture.sourceProof.helperDeclaration.bytes,
    sha256: fixture.sourceProof.helperDeclaration.sha256,
  })
  for (const marker of [
    "'managed-settings.json'",
    "'managed-settings.d'",
    "endsWith('.json')",
    "startsWith('.')",
    "join('\\x01')",
  ]) {
    assert(helperText.includes(marker), marker)
  }
})

test('Target118 WSL fingerprint evidence changes atomically', () => {
  const coverage = readCoverage()
  const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
  const row = coverage.rows.find(row => row.targetIndex === 8094)
  assert(row)
  const expected = TARGET118_WSL_FINGERPRINT_PROPERTY_OWNER_OVERRIDES[0]
  const evidenceState = expected.evidenceIds.map(id => row.evidenceIds.includes(id))
  assert.equal(new Set(evidenceState).size, 1, 'partial evidence state')
  if (evidenceState[0]) {
    assert.deepEqual(row.ownerIds.map(id => owners.get(id)), [...expected.paths])
  } else {
    assert.deepEqual(row.evidenceIds, ['source-map-attribution', 'semantic-test'])
  }
})
