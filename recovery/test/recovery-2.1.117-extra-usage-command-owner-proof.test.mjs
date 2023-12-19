import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET117_EXTRA_USAGE_COMMAND_EVIDENCE_IDS,
  TARGET117_EXTRA_USAGE_COMMAND_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/extra-usage-command-owner-overrides.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.117-extra-usage-command-owner-proof.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '02f7d043f1bf3e79eb3459fcb754a0c432057ee9e12f997e4f40e31aa1d31fb0'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function canonicalDigest(value) {
  return sha256(Buffer.from(`${JSON.stringify(value)}\n`, 'utf8'))
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), {
    bytes: expected.bytes,
    sha256: expected.sha256,
  }, label)
  return bytes
}

function bundlePath(environmentName, input) {
  const explicit = process.env[environmentName]
  return path.resolve(explicit ?? path.join(repositoryRoot, input.path))
}

function walk(node, visit) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (typeof node.type === 'string') visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
      walk(child, visit)
    }
  }
}

function propertyName(node) {
  if (node.computed) return undefined
  if (node.key?.type === 'Identifier') return node.key.name
  if (node.key?.type === 'Literal' && typeof node.key.value === 'string') {
    return node.key.value
  }
  return undefined
}

function propertyPositions(program, values) {
  const result = Object.fromEntries(values.map(value => [value, []]))
  walk(program, node => {
    if (node.type !== 'Property') return
    const name = propertyName(node)
    if (Object.hasOwn(result, name)) {
      result[name].push({ start: node.key.start, end: node.key.end })
    }
  })
  for (const positions of Object.values(result)) {
    positions.sort((left, right) => left.start - right.start)
  }
  return result
}

function objectProperties(node) {
  assert.equal(node.type, 'ObjectExpression')
  return new Map(node.properties.map(property => [propertyName(property), property]))
}

function assertTruthyMinified(node) {
  assert.equal(node.type, 'UnaryExpression')
  assert.equal(node.operator, '!')
  assert.equal(node.argument.type, 'Literal')
  assert.equal(node.argument.value, 0)
}

let typescriptPromise
async function loadTypeScript() {
  typescriptPromise ??= import(
    pathToFileURL(
      path.join(
        repositoryRoot,
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      ),
    ).href,
  ).then(imported => imported.default ?? imported)
  return typescriptPromise
}

function sourceFilename(sourceRoot) {
  return path.join(path.resolve(sourceRoot), fixture.source.path.slice('src/'.length))
}

function findNamedDeclaration(ts, sourceFile, name) {
  let result
  function visit(node) {
    if (node.name && ts.isIdentifier(node.name) && node.name.text === name) {
      if (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) {
        assert.equal(result, undefined, `${name}: one declaration`)
        result = node
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.ok(result, `${name}: declaration`)
  return result
}

function tsPropertyName(ts, node, sourceFile) {
  if (
    ts.isIdentifier(node.name) ||
    ts.isStringLiteral(node.name) ||
    ts.isNumericLiteral(node.name)
  ) {
    return node.name.text
  }
  return node.name.getText(sourceFile)
}

function unwrapSatisfies(ts, node) {
  return ts.isSatisfiesExpression(node) ? node.expression : node
}

function assertSourceOwner(ts, bytes, label) {
  assert.deepEqual(descriptor(bytes), {
    bytes: fixture.source.bytes,
    sha256: fixture.source.sha256,
  }, `${label}: complete source`)
  const text = bytes.toString('utf8')
  const sourceFile = ts.createSourceFile(
    fixture.source.path,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${label}: parse diagnostics`)

  const imports = sourceFile.statements
    .filter(statement => ts.isImportDeclaration(statement))
    .map(statement => ({
      module: statement.moduleSpecifier.text,
      names:
        statement.importClause?.namedBindings?.elements.map(element =>
          element.name.text,
        ) ?? [],
      typeOnly: statement.importClause?.isTypeOnly ?? false,
    }))
  assert.deepEqual(imports, fixture.source.imports, `${label}: import graph`)

  for (const expected of fixture.source.declarations) {
    const declaration = findNamedDeclaration(ts, sourceFile, expected.name)
    const start = declaration.getStart(sourceFile)
    const end = declaration.end
    assert.deepEqual({
      name: expected.name,
      start,
      end,
      ...descriptor(bytes.subarray(start, end)),
    }, expected, `${label}: ${expected.name}`)
  }

  const eligibility = findNamedDeclaration(
    ts,
    sourceFile,
    'isExtraUsageAllowed',
  )
  assert.ok(ts.isFunctionDeclaration(eligibility))
  assert.equal(
    eligibility.body.getText(sourceFile),
    '{\n  if (isEnvTruthy(process.env.DISABLE_EXTRA_USAGE_COMMAND)) {\n    return false\n  }\n  return isOverageProvisioningAllowed()\n}',
    `${label}: eligibility gate`,
  )

  const interactive = findNamedDeclaration(ts, sourceFile, 'extraUsage')
  const interactiveObject = unwrapSatisfies(ts, interactive.initializer)
  assert.ok(ts.isObjectLiteralExpression(interactiveObject))
  const interactiveProperties = new Map(
    interactiveObject.properties.map(property => [
      tsPropertyName(ts, property, sourceFile),
      property,
    ]),
  )
  assert.deepEqual([...interactiveProperties.keys()], [
    'type',
    'name',
    'requires',
    'description',
    'isEnabled',
    'load',
  ])
  assert.equal(interactiveProperties.get('type').initializer.text, 'local-jsx')
  assert.equal(interactiveProperties.get('name').initializer.text, 'extra-usage')
  assert.equal(
    interactiveProperties.get('description').initializer.text,
    'Configure extra usage to keep working when limits are hit',
  )
  assert.equal(
    interactiveProperties.get('isEnabled').initializer.body.getText(sourceFile),
    'isExtraUsageAllowed() && !getIsNonInteractiveSession()',
  )
  assert.equal(
    interactiveProperties.get('load').initializer.body.getText(sourceFile),
    "import('./extra-usage.js')",
  )
  const requires = interactiveProperties.get('requires')
  assert.ok(ts.isPropertyAssignment(requires))
  assert.equal(requires.name.getStart(sourceFile), fixture.residues[0].sourceStart)
  assert.equal(requires.name.end, fixture.residues[0].sourceEnd)
  assert.ok(ts.isObjectLiteralExpression(requires.initializer))
  assert.equal(requires.initializer.properties.length, 1)
  const ink = requires.initializer.properties[0]
  assert.equal(tsPropertyName(ts, ink, sourceFile), 'ink')
  assert.equal(ink.name.getStart(sourceFile), fixture.residues[1].sourceStart)
  assert.equal(ink.name.end, fixture.residues[1].sourceEnd)
  assert.equal(ink.initializer.kind, ts.SyntaxKind.TrueKeyword)

  const nonInteractive = findNamedDeclaration(
    ts,
    sourceFile,
    'extraUsageNonInteractive',
  )
  const nonInteractiveObject = unwrapSatisfies(ts, nonInteractive.initializer)
  assert.ok(ts.isObjectLiteralExpression(nonInteractiveObject))
  const nonInteractiveProperties = new Map(
    nonInteractiveObject.properties.map(property => [
      tsPropertyName(ts, property, sourceFile),
      property,
    ]),
  )
  assert.deepEqual([...nonInteractiveProperties.keys()], [
    'type',
    'name',
    'supportsNonInteractive',
    'description',
    'isEnabled',
    'isHidden',
    'load',
  ])
  assert.equal(nonInteractiveProperties.get('type').initializer.text, 'local')
  assert.equal(
    nonInteractiveProperties.get('supportsNonInteractive').initializer.kind,
    ts.SyntaxKind.TrueKeyword,
  )
  assert.equal(
    nonInteractiveProperties.get('isEnabled').initializer.body.getText(sourceFile),
    'isExtraUsageAllowed() && getIsNonInteractiveSession()',
  )
  assert.match(
    nonInteractiveProperties.get('isHidden').body.getText(sourceFile),
    /return !getIsNonInteractiveSession\(\)/,
  )
  assert.equal(
    nonInteractiveProperties.get('load').initializer.body.getText(sourceFile),
    "import('./extra-usage-noninteractive.js')",
  )
}

test(
  '2.1.117 extra-usage fixture freezes one complete owner correction',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(
      [...TARGET117_EXTRA_USAGE_COMMAND_EVIDENCE_IDS],
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET117_EXTRA_USAGE_COMMAND_OWNER_OVERRIDES.map(override => ({
        key: override.key,
        targetIndex: override.targetIndex,
        paths: [...override.paths],
        declarations: [...override.declarations],
        evidenceIds: [...override.evidenceIds],
      })),
      [{
        key: `${caseName}:12311`,
        targetIndex: fixture.targetUnit.targetIndex,
        paths: [fixture.source.path],
        declarations: fixture.source.declarations.map(row => row.name),
        evidenceIds: fixture.evidenceIds,
      }],
    )
    assert.match(
      TARGET117_EXTRA_USAGE_COMMAND_OWNER_OVERRIDES[0].behavior,
      /owns the first target requires\.ink capability pair/,
    )
    assert.notEqual(
      TARGET117_EXTRA_USAGE_COMMAND_OWNER_OVERRIDES[0].paths[0],
      fixture.rejectedOwner,
    )
    assert.equal(
      canonicalDigest([fixture.targetUnit.targetIndex]),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      canonicalDigest(
        fixture.residues.map(row => [
          fixture.targetUnit.targetIndex,
          row.literalKind,
          row.value,
          row.start,
          row.end,
          row.baselineOccurrenceCount,
          row.targetOccurrenceNumber,
          fixture.targetUnit.sha256,
        ]),
      ),
      fixture.summary.residueIdentitiesSha256,
    )
    assert.deepEqual(fixture.summary.units, 1)
    assert.deepEqual(fixture.summary.residues, 2)
    assert.equal(
      execFileSync(
        'git',
        ['rev-parse', `${fixture.source.rawTargetSourceCommit}^{tree}`],
        { cwd: repositoryRoot, encoding: 'utf8' },
      ).trim(),
      fixture.source.rawTargetSourceTree,
    )
    assert.equal(
      execFileSync(
        'git',
        [
          'rev-parse',
          `${fixture.source.rawTargetSourceCommit}:${fixture.source.path}`,
        ],
        { cwd: repositoryRoot, encoding: 'utf8' },
      ).trim(),
      fixture.source.blob,
    )
  },
)

test(
  '2.1.117 bundle authenticates u12311 and the first requires.ink pair',
  { skip: !selected },
  () => {
    const baselineBytes = readExact(
      bundlePath('CLAUDE_CODE_2_1_116_BUNDLE', fixture.baselineBundle),
      fixture.baselineBundle,
      'baseline bundle',
    )
    const targetBytes = readExact(
      bundlePath('CLAUDE_CODE_2_1_117_BUNDLE', fixture.targetBundle),
      fixture.targetBundle,
      'target bundle',
    )
    const structural = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.structuralLedger.path),
          fixture.structuralLedger,
          'structural ledger',
        ),
      ),
    )
    const region = structural.regions.find(
      row => row.target.index === fixture.targetUnit.targetIndex,
    )
    assert.ok(region, `u${fixture.targetUnit.targetIndex}`)
    assert.deepEqual({
      classification: region.classification,
      nodeType: region.target.nodeType,
      start: region.target.start,
      end: region.target.end,
      tokenCount: region.target.tokenCount,
      sourceHash: region.target.sourceHash,
      coarseHash: region.target.coarseHash,
    }, {
      classification: fixture.targetUnit.classification,
      nodeType: fixture.targetUnit.nodeType,
      start: fixture.targetUnit.start,
      end: fixture.targetUnit.end,
      tokenCount: fixture.targetUnit.tokenCount,
      sourceHash: fixture.targetUnit.sha256,
      coarseHash: fixture.targetUnit.coarseHash,
    })

    const unitBytes = targetBytes.subarray(
      fixture.targetUnit.start,
      fixture.targetUnit.end,
    )
    assert.deepEqual(descriptor(unitBytes), {
      bytes: fixture.targetUnit.bytes,
      sha256: fixture.targetUnit.sha256,
    })
    const unitAst = parse(unitBytes.toString('utf8'), {
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    assert.equal(unitAst.body.length, 1)
    assert.equal(unitAst.body[0].type, fixture.targetUnit.nodeType)
    const wrapper = unitAst.body[0].declarations[0].init
    assert.equal(wrapper.type, 'CallExpression')
    assert.equal(wrapper.arguments.length, 1)
    const moduleBody = wrapper.arguments[0].body.body
    assert.equal(moduleBody.length, 5)
    assert.ok(
      moduleBody.slice(0, 4).every(statement =>
        statement.expression?.type === 'CallExpression' &&
        statement.expression.arguments.length === 0,
      ),
      'four dependency initializers precede the command declarations',
    )
    const assignments = moduleBody[4].expression.expressions
    assert.equal(assignments.length, 2)
    const interactive = objectProperties(assignments[0].right)
    const nonInteractive = objectProperties(assignments[1].right)
    assert.deepEqual([...interactive.keys()], [
      'type',
      'name',
      'description',
      'isEnabled',
      'requires',
      'load',
    ])
    assert.deepEqual([...nonInteractive.keys()], [
      'type',
      'name',
      'supportsNonInteractive',
      'description',
      'isEnabled',
      'isHidden',
      'load',
    ])
    assert.equal(interactive.get('type').value.value, 'local-jsx')
    assert.equal(interactive.get('name').value.value, 'extra-usage')
    assert.equal(nonInteractive.get('type').value.value, 'local')
    assert.equal(nonInteractive.get('name').value.value, 'extra-usage')
    assertTruthyMinified(nonInteractive.get('supportsNonInteractive').value)
    const requires = objectProperties(interactive.get('requires').value)
    assert.deepEqual([...requires.keys()], ['ink'])
    assertTruthyMinified(requires.get('ink').value)

    const interactiveGate = interactive.get('isEnabled').value.body
    const nonInteractiveGate = nonInteractive.get('isEnabled').value.body
    assert.equal(interactiveGate.type, 'LogicalExpression')
    assert.equal(nonInteractiveGate.type, 'LogicalExpression')
    assert.equal(interactiveGate.operator, '&&')
    assert.equal(nonInteractiveGate.operator, '&&')
    assert.equal(
      interactiveGate.left.callee.name,
      nonInteractiveGate.left.callee.name,
      'both commands share the eligibility helper',
    )
    assert.equal(interactiveGate.right.type, 'UnaryExpression')
    assert.equal(interactiveGate.right.operator, '!')
    assert.equal(nonInteractiveGate.right.type, 'CallExpression')
    assert.equal(
      interactiveGate.right.argument.callee.name,
      nonInteractiveGate.right.callee.name,
      'interactive and non-interactive gates are complementary',
    )
    const hiddenGetter = nonInteractive.get('isHidden')
    assert.equal(hiddenGetter.kind, 'get')
    const hiddenReturn = hiddenGetter.value.body.body[0]
    assert.equal(hiddenReturn.type, 'ReturnStatement')
    assert.equal(hiddenReturn.argument.operator, '!')
    assert.equal(
      hiddenReturn.argument.argument.callee.name,
      nonInteractiveGate.right.callee.name,
    )

    const baselineProgram = parse(baselineBytes.toString('utf8'), {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    })
    const targetProgram = parse(targetBytes.toString('utf8'), {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    })
    const values = fixture.residues.map(row => row.value)
    const baselinePositions = propertyPositions(baselineProgram, values)
    const targetPositions = propertyPositions(targetProgram, values)
    for (const row of fixture.residues) {
      assert.equal(
        baselinePositions[row.value].length,
        row.baselineOccurrenceCount,
        `${row.value}: baseline count`,
      )
      assert.equal(
        targetPositions[row.value].length,
        row.targetOccurrenceCount,
        `${row.value}: target count`,
      )
      assert.deepEqual(
        targetPositions[row.value][row.targetOccurrenceNumber - 1],
        { start: row.start, end: row.end },
        `${row.value}: target occurrence`,
      )
      assert.ok(row.start >= fixture.targetUnit.start)
      assert.ok(row.end <= fixture.targetUnit.end)
    }
  },
)

test(
  '2.1.117 raw and packaged source prove the exact extra-usage declarations',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const rawBytes = execFileSync(
      'git',
      ['show', `${fixture.source.rawTargetSourceCommit}:${fixture.source.path}`],
      { cwd: repositoryRoot },
    )
    assertSourceOwner(ts, rawBytes, 'raw ff0339 source')

    const packagedRoot = path.resolve(
      process.env.CLAUDE_CODE_RECOVERED_2_1_117_SOURCE_ROOT ??
        path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.117/src'),
    )
    assert.ok(fs.existsSync(packagedRoot), 'packaged Target117 source root exists')
    assertSourceOwner(
      ts,
      fs.readFileSync(sourceFilename(packagedRoot)),
      'packaged Target117 source',
    )
  },
)
