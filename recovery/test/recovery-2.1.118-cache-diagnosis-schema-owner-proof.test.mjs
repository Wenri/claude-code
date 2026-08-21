import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import { TARGET118_CACHE_DIAGNOSIS_SCHEMA_OWNER_OVERRIDES } from '../cases/2.1.117-to-2.1.118/recovered/cache-diagnosis-schema-owner-overrides.mjs'

const root = process.cwd()
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      'recovery/test/recovery-2.1.118-cache-diagnosis-schema-owner-proof.json',
    ),
    'utf8',
  ),
)
const baselineBundlePath =
  process.env.CLAUDE_CODE_2_1_117_BUNDLE ??
  path.join(
    root,
    '.recovery-tmp/authenticated-artifacts/2.1.117-linux-x64/cli.inner.js',
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

function schemaObject(unit) {
  const ast = parse(unit.toString(), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  })
  const matches = walk(
    ast,
    node =>
      node.type === 'ObjectExpression' &&
      node.properties.some(
        property => property.key?.name === 'systemHash',
      ) &&
      node.properties.some(
        property => property.key?.name === 'messageHashes',
      ),
  )
  assert.equal(matches.length, 1)
  return matches[0]
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

function gitSource(input) {
  const result = spawnSync('git', ['show', `${input.commit}:${input.path}`], {
    cwd: root,
    encoding: null,
  })
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return result.stdout.toString('utf8')
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

test('Target118 cache-diagnosis schema fixture and override are deterministic', () => {
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.117-to-2.1.118')
  assert.equal(fixture.summary.units, 1)
  assert.equal(fixture.summary.residues, 1)
  assert.equal(
    sha256(JSON.stringify([fixture.targetUnit.targetIndex])),
    fixture.summary.indicesSha256,
  )
  assert.equal(
    sha256(JSON.stringify(fixture.targetUnit.residues)),
    fixture.summary.residueIdentitiesSha256,
  )
  assert.deepEqual(
    TARGET118_CACHE_DIAGNOSIS_SCHEMA_OWNER_OVERRIDES.map(row => ({
      targetIndex: row.targetIndex,
      paths: [...row.paths],
      evidenceIds: [...row.evidenceIds],
    })),
    [
      {
        targetIndex: fixture.targetUnit.targetIndex,
        paths: [fixture.transition.ownerPath],
        evidenceIds: fixture.evidenceIds,
      },
    ],
  )
})

test('authenticated schema transition adds only cacheDiagnosis with false default', () => {
  if (!fs.existsSync(baselineBundlePath) || !fs.existsSync(targetBundlePath)) {
    return test.skip('authenticated Target117/118 bundles are unavailable')
  }
  const baseline = fs.readFileSync(baselineBundlePath)
  const target = fs.readFileSync(targetBundlePath)
  assert.deepEqual(descriptor(baseline), fixture.inputs.baselineBundle)
  assert.deepEqual(descriptor(target), fixture.inputs.targetBundle)
  const baselineUnit = baseline.subarray(
    fixture.baselineUnit.start,
    fixture.baselineUnit.end,
  )
  const targetUnit = target.subarray(
    fixture.targetUnit.start,
    fixture.targetUnit.end,
  )
  assert.deepEqual(descriptor(baselineUnit), {
    bytes: fixture.baselineUnit.bytes,
    sha256: fixture.baselineUnit.sourceHash,
  })
  assert.deepEqual(descriptor(targetUnit), {
    bytes: fixture.targetUnit.bytes,
    sha256: fixture.targetUnit.sourceHash,
  })
  for (const residue of fixture.targetUnit.residues) {
    assert.equal(target.subarray(residue[2], residue[3]).toString(), residue[1])
  }

  const baselineSchema = schemaObject(baselineUnit)
  const targetSchema = schemaObject(targetUnit)
  const keys = object => object.properties.map(property => property.key.name)
  const baselineKeys = keys(baselineSchema)
  const targetKeys = keys(targetSchema)
  assert(!baselineKeys.includes(fixture.transition.field))
  assert.deepEqual(
    targetKeys.filter(key => key !== fixture.transition.field),
    baselineKeys,
  )
  const field = targetSchema.properties.find(
    property => property.key.name === fixture.transition.field,
  )
  assert.equal(field.value.type, 'CallExpression')
  assert.equal(field.value.callee.type, 'MemberExpression')
  assert.equal(field.value.callee.property.name, 'default')
  assert.equal(field.value.arguments.length, 1)
  assert.equal(field.value.arguments[0].type, 'UnaryExpression')
  assert.equal(field.value.arguments[0].operator, '!')
  assert.equal(field.value.arguments[0].argument.value, 1)
  const booleanCall = field.value.callee.object
  assert.equal(booleanCall.type, 'CallExpression')
  assert.equal(booleanCall.callee.type, 'MemberExpression')
  assert.equal(booleanCall.callee.property.name, 'boolean')
  assert.equal(booleanCall.arguments.length, 0)
})

test('historical source transition owns the cacheDiagnosis schema field', async () => {
  const ts = await loadTypeScript()
  const baselineText = gitSource(fixture.inputs.baselineSource)
  const targetFilename = path.join(
    sourceRoot,
    fixture.inputs.targetSource.path.replace(/^src\//, ''),
  )
  const targetBytes = fs.readFileSync(targetFilename)
  assert.deepEqual(descriptor(targetBytes), {
    bytes: fixture.inputs.targetSource.bytes,
    sha256: fixture.inputs.targetSource.sha256,
  })
  const targetText = targetBytes.toString('utf8')

  const parseSource = (text, filename) => {
    const sourceFile = ts.createSourceFile(
      filename,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    assert.equal(sourceFile.parseDiagnostics.length, 0)
    return sourceFile
  }
  const baselineSource = parseSource(baselineText, 'baseline.ts')
  const targetSource = parseSource(targetText, targetFilename)
  const declaration = (sourceFile, name) => {
    const matches = []
    for (const statement of sourceFile.statements) {
      if (
        (ts.isTypeAliasDeclaration(statement) ||
          ts.isFunctionDeclaration(statement)) &&
        statement.name?.text === name
      ) {
        matches.push(statement)
      }
    }
    assert.equal(matches.length, 1, name)
    return matches[0]
  }
  for (const version of ['baseline', 'target']) {
    const sourceFile = version === 'baseline' ? baselineSource : targetSource
    for (const [name, expected] of Object.entries(
      fixture.sourceDeclarations[version],
    )) {
      const node = declaration(sourceFile, name)
      const text = node.getText(sourceFile)
      assert.equal(node.getStart(sourceFile), expected.start, `${version}:${name}:start`)
      assert.equal(node.end, expected.end, `${version}:${name}:end`)
      assert.deepEqual(descriptor(Buffer.from(text)), {
        bytes: expected.bytes,
        sha256: expected.sha256,
      })
    }
  }

  const propertyNames = (sourceFile, typeName) => {
    const node = declaration(sourceFile, typeName)
    assert(ts.isTypeLiteralNode(node.type))
    return node.type.members.map(member => member.name?.getText(sourceFile))
  }
  for (const typeName of ['PreviousState', 'PromptStateSnapshot']) {
    assert(!propertyNames(baselineSource, typeName).includes(fixture.transition.field))
    assert(propertyNames(targetSource, typeName).includes(fixture.transition.field))
  }

  const record = declaration(targetSource, 'recordPromptState')
  const nodes = predicate => {
    const values = []
    const visit = node => {
      if (predicate(node)) values.push(node)
      ts.forEachChild(node, visit)
    }
    visit(record)
    return values
  }
  assert.equal(
    nodes(
      node =>
        ts.isBindingElement(node) &&
        node.name.getText(targetSource) === fixture.transition.field &&
        node.initializer?.kind === ts.SyntaxKind.FalseKeyword,
    ).length,
    1,
  )
  assert.equal(
    nodes(
      node =>
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken &&
        node.left.getText(targetSource) === fixture.transition.field &&
        node.right.getText(targetSource) === `prev.${fixture.transition.field}`,
    ).length,
    1,
  )
  assert.equal(
    nodes(
      node =>
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        node.left.getText(targetSource) === `prev.${fixture.transition.field}` &&
        node.right.getText(targetSource) === fixture.transition.field,
    ).length,
    1,
  )
  assert(targetText.includes(`parts.push('${fixture.transition.diagnostic}')`))
  assert(!baselineText.includes(fixture.transition.field))
  assert(targetText.includes(fixture.transition.field))
})

test('Target118 cache-diagnosis evidence changes atomically', () => {
  const coverage = readCoverage()
  const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
  const row = coverage.rows.find(row => row.targetIndex === 8881)
  assert(row)
  const expected = TARGET118_CACHE_DIAGNOSIS_SCHEMA_OWNER_OVERRIDES[0]
  const evidenceState = expected.evidenceIds.map(id => row.evidenceIds.includes(id))
  assert.equal(new Set(evidenceState).size, 1, 'partial evidence state')
  if (evidenceState[0]) {
    assert.deepEqual(row.ownerIds.map(id => owners.get(id)), [...expected.paths])
  } else {
    assert.deepEqual(row.ownerIds.map(id => owners.get(id)), [
      fixture.transition.rejectedOwnerPath,
    ])
  }
})
