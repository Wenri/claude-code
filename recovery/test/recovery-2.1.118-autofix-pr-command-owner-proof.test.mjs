import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import { TARGET118_AUTOFIX_PR_COMMAND_OWNER_OVERRIDES } from '../cases/2.1.117-to-2.1.118/recovered/autofix-pr-command-owner-overrides.mjs'

const root = process.cwd()
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      'recovery/test/recovery-2.1.118-autofix-pr-command-owner-proof.json',
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

function propertyName(property) {
  return property.key?.name ?? property.key?.value
}

function gitSource() {
  const file = fixture.inputs.source.file
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

test('Target118 autofix-pr command fixture and override are deterministic', () => {
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.117-to-2.1.118')
  assert.deepEqual(
    TARGET118_AUTOFIX_PR_COMMAND_OWNER_OVERRIDES.map(row => ({
      targetIndex: row.targetIndex,
      paths: [...row.paths],
      evidenceIds: [...row.evidenceIds],
      behavior: row.behavior,
    })),
    [
      {
        targetIndex: fixture.targetUnit.targetIndex,
        paths: [fixture.targetUnit.ownerPath],
        evidenceIds: fixture.evidenceIds,
        behavior: fixture.targetUnit.behavior,
      },
    ],
  )
  assert.notEqual(
    fixture.targetUnit.ownerPath,
    fixture.targetUnit.provisionalOwnerPath,
  )
  const indices = [fixture.targetUnit.targetIndex]
  const residues = fixture.targetUnit.residues.map(residue => [
    fixture.targetUnit.targetIndex,
    ...residue,
  ])
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
})

test('authenticated Target118 unit pins the complete autofix-pr command object', () => {
  if (!fs.existsSync(targetBundlePath)) {
    return test.skip('authenticated Target118 bundle is unavailable')
  }
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
  const region = structural.regions.find(
    candidate => candidate.target.index === fixture.targetUnit.targetIndex,
  )
  assert(region)
  assert.deepEqual(
    {
      start: region.target.start,
      end: region.target.end,
      bytes: region.target.end - region.target.start,
      nodeType: region.target.nodeType,
      sourceHash: region.target.sourceHash,
      coarseHash: region.target.coarseHash,
      classification: region.classification,
    },
    {
      start: fixture.targetUnit.start,
      end: fixture.targetUnit.end,
      bytes: fixture.targetUnit.bytes,
      nodeType: fixture.targetUnit.nodeType,
      sourceHash: fixture.targetUnit.sourceHash,
      coarseHash: fixture.targetUnit.coarseHash,
      classification: 'unresolved',
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
  for (const [kind, value, start, end] of fixture.targetUnit.residues) {
    assert.equal(kind, 'string')
    const source = bundle.subarray(start, end).toString()
    if (source !== value) assert.equal(JSON.parse(source), value)
  }
  const unit = parse(unitBytes.toString(), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  })
  const commandObjects = walk(
    unit,
    node =>
      node.type === 'ObjectExpression' &&
      node.properties.some(
        property =>
          propertyName(property) === 'description' &&
          property.value?.value === fixture.commandContract.description,
      ),
  )
  assert.equal(commandObjects.length, 1)
  const command = commandObjects[0]
  assert.deepEqual(
    command.properties.map(propertyName),
    fixture.commandContract.requiredProperties,
  )
  const property = name =>
    command.properties.find(candidate => propertyName(candidate) === name)
  assert.equal(property('type').value.value, fixture.commandContract.type)
  assert.equal(property('name').value.value, fixture.commandContract.name)
  assert.equal(
    property('description').value.value,
    fixture.commandContract.description,
  )
  assert.equal(property('argumentHint').value.type, 'UnaryExpression')
  assert.equal(property('argumentHint').value.operator, 'void')
  assert.equal(property('argumentHint').value.argument.value, 0)
  assert.equal(property('isHidden').kind, 'get')
  assert.equal(property('load').method, true)
  assert.equal(property('userFacingName').method, true)
  assert.equal(
    walk(
      property('isEnabled').value,
      node =>
        node.type === 'Literal' && node.value === fixture.commandContract.policy,
    ).length,
    1,
  )
  assert.equal(
    walk(
      property('load'),
      node => node.type === 'AwaitExpression',
    ).length,
    1,
  )
  assert.equal(property('load').value.async, true)

  const coverage = readCoverage()
  const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
  const row = coverage.rows.find(
    candidate => candidate.targetIndex === fixture.targetUnit.targetIndex,
  )
  assert(row)
  const paths = row.ownerIds.map(ownerId => owners.get(ownerId))
  const provisional =
    JSON.stringify(paths) ===
      JSON.stringify([fixture.targetUnit.provisionalOwnerPath]) &&
    JSON.stringify(row.evidenceIds) ===
      JSON.stringify(['source-map-attribution', 'semantic-test'])
  const corrected =
    JSON.stringify(paths) === JSON.stringify([fixture.targetUnit.ownerPath]) &&
    JSON.stringify(row.evidenceIds) === JSON.stringify(fixture.evidenceIds) &&
    row.behavior === fixture.targetUnit.behavior
  assert.ok(provisional || corrected)
})

test('historical and packaged source AST reproduce the complete command declaration', async () => {
  const ts = await loadTypeScript()
  const historical = gitSource().toString('utf8')
  const configured = fs.readFileSync(
    path.join(
      sourceRoot,
      fixture.inputs.source.file.path.replace(/^src\//, ''),
    ),
    'utf8',
  )
  for (const [label, text] of [
    ['historical', historical],
    ['configured', configured],
  ]) {
    const sourceFile = ts.createSourceFile(
      fixture.inputs.source.file.path,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    assert.equal(sourceFile.parseDiagnostics.length, 0, label)
    const declarations = sourceFile.statements.filter(
      statement =>
        ts.isVariableStatement(statement) &&
        statement.declarationList.declarations.some(
          declaration =>
            declaration.name.getText(sourceFile) ===
            fixture.sourceDeclaration.name,
        ),
    )
    assert.equal(declarations.length, 1, label)
    const declarationText = declarations[0].getText(sourceFile)
    assert.deepEqual(descriptor(Buffer.from(declarationText)), {
      bytes: fixture.sourceDeclaration.bytes,
      sha256: fixture.sourceDeclaration.sha256,
    })
    const declaration = declarations[0].declarationList.declarations.find(
      candidate =>
        candidate.name.getText(sourceFile) === fixture.sourceDeclaration.name,
    )
    assert(ts.isSatisfiesExpression(declaration.initializer))
    const object = declaration.initializer.expression
    assert(ts.isObjectLiteralExpression(object))
    assert.deepEqual(
      object.properties.map(item => item.name?.getText(sourceFile)),
      fixture.commandContract.requiredProperties,
    )
    assert.match(declarationText, /isClaudeAISubscriber\(\)/)
    assert.match(
      declarationText,
      /isPolicyAllowed\('allow_remote_sessions'\)/,
    )
    assert.match(declarationText, /import\('\.\/autofix-pr\.js'\)/)
    assert.match(declarationText, /return 'autofix-pr'/)
  }
})
