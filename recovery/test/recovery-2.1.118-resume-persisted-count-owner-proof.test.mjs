import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import { TARGET118_RESUME_PERSISTED_COUNT_OWNER_OVERRIDES } from '../cases/2.1.117-to-2.1.118/recovered/resume-persisted-count-owner-overrides.mjs'

const root = process.cwd()
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      'recovery/test/recovery-2.1.118-resume-persisted-count-owner-proof.json',
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

function propertyName(property) {
  return property.key?.name ?? property.key?.value
}

function exactOccurrences(buffer, needle) {
  const offsets = []
  let offset = -1
  while ((offset = buffer.indexOf(needle, offset + 1)) >= 0) offsets.push(offset)
  return offsets
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

function gitSource(commit, input) {
  const result = spawnSync('git', ['show', `${commit}:${input.path}`], {
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

test('Target118 resumed-prefix fixture and override are deterministic', () => {
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
    TARGET118_RESUME_PERSISTED_COUNT_OWNER_OVERRIDES.map(row => ({
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

test('authenticated Target118 caller and callee pin one resumed-prefix binding', () => {
  if (!fs.existsSync(baselineBundlePath) || !fs.existsSync(targetBundlePath)) {
    return test.skip('authenticated Target117/118 bundles are unavailable')
  }
  const baseline = fs.readFileSync(baselineBundlePath)
  const target = fs.readFileSync(targetBundlePath)
  assert.deepEqual(descriptor(baseline), fixture.inputs.baselineBundle)
  assert.deepEqual(descriptor(target), fixture.inputs.targetBundle)
  assert.deepEqual(
    exactOccurrences(baseline, fixture.transition.field),
    [],
    'Target117 bundle does not contain the resumed-prefix field',
  )
  assert.deepEqual(
    exactOccurrences(target, fixture.transition.field),
    [fixture.targetCallerUnit.propertyStart, fixture.targetUnit.residues[0][2]],
  )

  const caller = target.subarray(
    fixture.targetCallerUnit.start,
    fixture.targetCallerUnit.end,
  )
  const owner = target.subarray(fixture.targetUnit.start, fixture.targetUnit.end)
  assert.deepEqual(descriptor(caller), {
    bytes: fixture.targetCallerUnit.bytes,
    sha256: fixture.targetCallerUnit.sourceHash,
  })
  assert.deepEqual(descriptor(owner), {
    bytes: fixture.targetUnit.bytes,
    sha256: fixture.targetUnit.sourceHash,
  })
  assert.equal(
    target
      .subarray(
        fixture.targetCallerUnit.propertyStart,
        fixture.targetCallerUnit.propertyEnd,
      )
      .toString(),
    fixture.transition.field,
  )
  for (const residue of fixture.targetUnit.residues) {
    assert.equal(target.subarray(residue[2], residue[3]).toString(), residue[1])
  }

  const parseUnit = unit =>
    parse(unit.toString(), { ecmaVersion: 'latest', sourceType: 'script' })
  const callerAst = parseUnit(caller)
  const ownerAst = parseUnit(owner)
  const callerFunction = callerAst.body[0]
  const ownerFunction = ownerAst.body[0]
  assert.equal(callerFunction.type, 'FunctionDeclaration')
  assert.equal(ownerFunction.type, 'FunctionDeclaration')

  const callerProperties = walk(
    callerFunction,
    node => node.type === 'Property' && propertyName(node) === fixture.transition.field,
  )
  assert.equal(callerProperties.length, 1)
  const callerProperty = callerProperties[0]
  assert.equal(callerProperty.value.type, 'MemberExpression')
  assert.equal(callerProperty.value.computed, false)
  assert.equal(callerProperty.value.object.type, 'Identifier')
  assert.equal(callerProperty.value.property.name, 'length')

  const callerObjectBindings = walk(
    callerFunction,
    node =>
      node.type === 'VariableDeclarator' &&
      node.init?.type === 'ObjectExpression' &&
      node.init.properties.includes(callerProperty),
  )
  assert.equal(callerObjectBindings.length, 1)
  const callerObjectBinding = callerObjectBindings[0].id.name
  const ownerCalls = walk(
    callerFunction,
    node =>
      node.type === 'CallExpression' &&
      node.callee?.type === 'Identifier' &&
      node.callee.name === ownerFunction.id.name &&
      node.arguments[0]?.type === 'ObjectExpression' &&
      node.arguments[0].properties.some(
        property =>
          property.type === 'SpreadElement' &&
          property.argument.type === 'Identifier' &&
          property.argument.name === callerObjectBinding,
      ),
  )
  assert.equal(ownerCalls.length, 1)

  assert.equal(ownerFunction.params.length, 1)
  assert.equal(ownerFunction.params[0].type, 'ObjectPattern')
  const ownerParameter = ownerFunction.params[0].properties.find(
    property => propertyName(property) === fixture.transition.field,
  )
  assert(ownerParameter)
  assert.equal(ownerParameter.value.type, 'Identifier')
  const ownerBinding = ownerParameter.value.name
  const resumeBranch = walk(
    ownerFunction,
    node =>
      node.type === 'IfStatement' &&
      node.test.type === 'BinaryExpression' &&
      node.test.operator === '!==' &&
      node.test.left.type === 'Identifier' &&
      node.test.left.name === ownerBinding &&
      node.test.right.type === 'UnaryExpression' &&
      node.test.right.operator === 'void' &&
      node.test.right.argument.value === 0,
  )
  assert.equal(resumeBranch.length, 1)
  assert.equal(
    walk(
      resumeBranch[0].consequent,
      node =>
        node.type === 'CallExpression' &&
        node.callee?.type === 'MemberExpression' &&
        node.callee.property?.name === 'slice' &&
        node.arguments.length === 1 &&
        node.arguments[0].type === 'Identifier' &&
        node.arguments[0].name === ownerBinding,
    ).length,
    1,
  )
  assert.equal(
    walk(
      resumeBranch[0].consequent,
      node =>
        node.type === 'MemberExpression' &&
        node.computed &&
        node.property?.type === 'BinaryExpression' &&
        node.property.operator === '-' &&
        node.property.left.type === 'Identifier' &&
        node.property.left.name === ownerBinding &&
        node.property.right.value === 1,
    ).length,
    1,
  )
})

test('historical Target117-to-118 source transition owns resumed-prefix persistence', async () => {
  const ts = await loadTypeScript()
  const sources = { baseline: new Map(), target: new Map() }
  for (const version of ['baseline', 'target']) {
    const input = fixture.inputs[`${version}Sources`]
    for (const file of input.files) {
      const text = gitSource(input.commit, file)
      if (version === 'target') {
        const live = fs.readFileSync(
          path.join(sourceRoot, file.path.replace(/^src\//, '')),
        )
        assert.deepEqual(descriptor(live), {
          bytes: file.bytes,
          sha256: file.sha256,
        })
        assert.equal(live.toString('utf8'), text)
      }
      const sourceFile = ts.createSourceFile(
        file.path,
        text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      )
      assert.equal(sourceFile.parseDiagnostics.length, 0)
      sources[version].set(file.path, sourceFile)
    }
  }

  const findDeclaration = (sourceFile, name) => {
    const matches = []
    const visit = node => {
      if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
        matches.push(node)
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    assert.equal(matches.length, 1, name)
    return matches[0]
  }
  const declarations = { baseline: {}, target: {} }
  for (const version of ['baseline', 'target']) {
    for (const [name, expected] of Object.entries(
      fixture.sourceDeclarations[version],
    )) {
      const sourceFile = sources[version].get(expected.path)
      const node = findDeclaration(sourceFile, name)
      const text = node.getText(sourceFile)
      assert.equal(node.getStart(sourceFile), expected.start, `${version}:${name}:start`)
      assert.equal(node.end, expected.end, `${version}:${name}:end`)
      assert.deepEqual(descriptor(Buffer.from(text)), {
        bytes: expected.bytes,
        sha256: expected.sha256,
      })
      declarations[version][name] = { node, sourceFile }
    }
  }

  const sourceNodes = ({ node }, predicate) => {
    const values = []
    const visit = child => {
      if (predicate(child)) values.push(child)
      ts.forEachChild(child, visit)
    }
    visit(node)
    return values
  }
  for (const name of [
    fixture.transition.ownerDeclaration,
    fixture.transition.callerDeclaration,
  ]) {
    assert.equal(
      sourceNodes(
        declarations.baseline[name],
        node => ts.isIdentifier(node) && node.text === fixture.transition.field,
      ).length,
      0,
      `Target117 ${name} does not contain ${fixture.transition.field}`,
    )
  }

  const owner = declarations.target[fixture.transition.ownerDeclaration]
  const ownerBinding = sourceNodes(
    owner,
    node =>
      ts.isBindingElement(node) &&
      node.name.getText(owner.sourceFile) === fixture.transition.field,
  )
  assert.equal(ownerBinding.length, 1)
  const ownerTypeField = sourceNodes(
    owner,
    node =>
      ts.isPropertySignature(node) &&
      node.name.getText(owner.sourceFile) === fixture.transition.field &&
      node.questionToken !== undefined &&
      node.type?.kind === ts.SyntaxKind.NumberKeyword,
  )
  assert.equal(ownerTypeField.length, 1)
  const resumeBranch = sourceNodes(
    owner,
    node =>
      ts.isIfStatement(node) &&
      node.expression.getText(owner.sourceFile) ===
        `${fixture.transition.field} !== undefined`,
  )
  assert.equal(resumeBranch.length, 1)
  const branchText = resumeBranch[0].thenStatement.getText(owner.sourceFile)
  assert(branchText.includes(fixture.transition.suffixExpression))
  assert(branchText.includes(fixture.transition.parentExpression))

  const caller = declarations.target[fixture.transition.callerDeclaration]
  const calls = sourceNodes(
    caller,
    node =>
      ts.isCallExpression(node) &&
      node.expression.getText(caller.sourceFile) ===
        fixture.transition.ownerDeclaration,
  )
  assert.equal(calls.length, 1)
  const argument = calls[0].arguments[0]
  assert(ts.isObjectLiteralExpression(argument))
  const parameterObjects = sourceNodes(
    caller,
    node =>
      ts.isVariableDeclaration(node) &&
      node.name.getText(caller.sourceFile) === 'runAgentParams' &&
      ts.isObjectLiteralExpression(node.initializer),
  )
  assert.equal(parameterObjects.length, 1)
  assert.equal(
    argument.properties.filter(
      property =>
        ts.isSpreadAssignment(property) &&
        property.expression.getText(caller.sourceFile) === 'runAgentParams',
    ).length,
    1,
  )
  const countProperties = parameterObjects[0].initializer.properties.filter(
    property =>
      ts.isPropertyAssignment(property) &&
      property.name.getText(caller.sourceFile) === fixture.transition.field,
  )
  assert.equal(countProperties.length, 1)
  assert.equal(
    countProperties[0].initializer.getText(caller.sourceFile),
    fixture.transition.countExpression,
  )
})

test('Target118 resumed-prefix coverage is exactly provisional or authenticated', () => {
  const coverage = readCoverage()
  const row = coverage.rows.find(
    candidate => candidate.targetIndex === fixture.targetUnit.targetIndex,
  )
  assert(row)
  assert.deepEqual(
    {
      start: row.start,
      end: row.end,
      nodeType: row.nodeType,
      sourceHash: row.sourceHash,
      structuralClass: row.structuralClass,
      disposition: row.disposition,
    },
    {
      start: fixture.targetUnit.start,
      end: fixture.targetUnit.end,
      nodeType: fixture.targetUnit.nodeType,
      sourceHash: fixture.targetUnit.sourceHash,
      structuralClass: 'unresolved',
      disposition: 'source-runtime-covered',
    },
  )
  const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
  const paths = row.ownerIds.map(ownerId => owners.get(ownerId))
  assert.deepEqual(paths, [fixture.transition.ownerPath])
  const override = TARGET118_RESUME_PERSISTED_COUNT_OWNER_OVERRIDES[0]
  const provisional =
    JSON.stringify(row.evidenceIds) ===
      JSON.stringify(['source-map-attribution', 'semantic-test']) &&
    row.behavior ===
      `Compiled target unit is attributed to ${fixture.transition.ownerPath}; its authored runtime owner and call path are present in the target semantic tree and current cumulative src/.`
  const corrected =
    JSON.stringify(row.evidenceIds) === JSON.stringify([...override.evidenceIds]) &&
    row.behavior === override.behavior
  assert.ok(provisional || corrected)
})
