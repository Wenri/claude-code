import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import { TARGET118_WITH_RETRY_OVERAGE_HEADER_OWNER_OVERRIDES } from '../cases/2.1.117-to-2.1.118/recovered/with-retry-overage-header-owner-overrides.mjs'

const root = process.cwd()
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      'recovery/test/recovery-2.1.118-with-retry-overage-header-owner-proof.json',
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

function gitSource(file) {
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

function targetIdentifierUses(node, name) {
  return walk(
    node,
    child => child.type === 'Identifier' && child.name === name,
  )
}

test('Target118 withRetry overage-header fixture and override are deterministic', () => {
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.117-to-2.1.118')
  assert.deepEqual(
    TARGET118_WITH_RETRY_OVERAGE_HEADER_OWNER_OVERRIDES.map(row => ({
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

test('authenticated Target118 retry unit closes the overage-header control-flow binding', () => {
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
  const unit = parse(unitBytes.toString(), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  }).body[0]
  assert.equal(unit.type, 'FunctionDeclaration')
  assert.equal(unit.async, true)
  assert.equal(unit.generator, true)
  const headerLiteral = fixture.targetUnit.residues[0]
  const headerSource = bundle
    .subarray(headerLiteral[2], headerLiteral[3])
    .toString()
  if (headerSource !== headerLiteral[1]) {
    assert.equal(JSON.parse(headerSource), headerLiteral[1])
  }
  const headerVariables = walk(
    unit,
    node =>
      node.type === 'VariableDeclarator' &&
      walk(
        node.init,
        child =>
          child.type === 'Literal' && child.value === headerLiteral[1],
      ).length === 1,
  )
  assert.equal(headerVariables.length, 1)
  assert.equal(headerVariables[0].id.type, 'Identifier')
  const reasonBinding = headerVariables[0].id.name
  const guardedBranches = walk(
    unit,
    node =>
      node.type === 'IfStatement' &&
      targetIdentifierUses(node.test, reasonBinding).length === 2 &&
      walk(
        node.consequent,
        child =>
          child.type === 'CallExpression' &&
          child.callee?.type === 'Identifier' &&
          child.callee.name === fixture.targetHandlerBinding.name &&
          child.arguments.length === 1 &&
          child.arguments[0].type === 'Identifier' &&
          child.arguments[0].name === reasonBinding,
      ).length === 1,
  )
  assert.equal(guardedBranches.length, 1)
  assert.equal(
    walk(
      guardedBranches[0].consequent,
      node =>
        node.type === 'AssignmentExpression' &&
        node.left?.type === 'MemberExpression' &&
        node.left.property?.name === 'fastMode' &&
        node.right?.type === 'UnaryExpression' &&
        node.right.operator === '!' &&
        node.right.argument?.value === 1,
    ).length,
    1,
  )
  assert.equal(
    walk(
      guardedBranches[0].consequent,
      node => node.type === 'ContinueStatement',
    ).length,
    1,
  )

  const handler = bundle.subarray(
    fixture.targetHandlerBinding.start,
    fixture.targetHandlerBinding.end,
  )
  assert.deepEqual(descriptor(handler), {
    bytes: fixture.targetHandlerBinding.bytes,
    sha256: fixture.targetHandlerBinding.sha256,
  })
  const handlerText = handler.toString()
  for (const required of fixture.targetHandlerBinding.requiredStrings) {
    assert(handlerText.includes(required), required)
  }

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

test('historical and packaged source AST pin the exact withRetry owner and handler', async () => {
  const ts = await loadTypeScript()
  const historical = new Map(
    fixture.inputs.source.files.map(file => [
      file.path,
      gitSource(file).toString('utf8'),
    ]),
  )
  const configured = new Map(
    fixture.inputs.source.files.map(file => [
      file.path,
      fs.readFileSync(
        path.join(sourceRoot, file.path.replace(/^src\//, '')),
        'utf8',
      ),
    ]),
  )

  const prove = (files, label, requireWholeDeclarations) => {
    const parsed = new Map()
    for (const [sourcePath, text] of files) {
      const sourceFile = ts.createSourceFile(
        sourcePath,
        text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      )
      assert.equal(sourceFile.parseDiagnostics.length, 0, `${label}:${sourcePath}`)
      parsed.set(sourcePath, { sourceFile, text })
    }
    const declaration = expected => {
      const { sourceFile, text } = parsed.get(expected.path)
      const matches = sourceFile.statements.filter(
        statement =>
          ts.isFunctionDeclaration(statement) &&
          statement.name?.text === expected.name,
      )
      assert.equal(matches.length, 1, `${label}:${expected.name}`)
      const declarationText = matches[0].getText(sourceFile)
      if (requireWholeDeclarations) {
        assert.deepEqual(descriptor(Buffer.from(declarationText)), {
          bytes: expected.bytes,
          sha256: expected.sha256,
        })
      }
      return { node: matches[0], sourceFile, text }
    }
    const withRetry = declaration(fixture.sourceDeclarations.withRetry)
    assert.equal(withRetry.node.asteriskToken?.kind, ts.SyntaxKind.AsteriskToken)
    assert(
      withRetry.node.modifiers?.some(
        modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword,
      ),
    )
    const overageVariables = []
    const visit = node => {
      if (
        ts.isVariableDeclaration(node) &&
        node.name.getText(withRetry.sourceFile) === 'overageReason'
      ) {
        overageVariables.push(node)
      }
      ts.forEachChild(node, visit)
    }
    visit(withRetry.node)
    assert.equal(overageVariables.length, 1)
    const variableStatement = overageVariables[0].parent.parent
    const block = variableStatement.parent
    assert(ts.isBlock(block))
    const position = block.statements.indexOf(variableStatement)
    const guarded = block.statements[position + 1]
    assert(ts.isIfStatement(guarded))
    const branchText = withRetry.text.slice(
      variableStatement.getStart(withRetry.sourceFile),
      guarded.end,
    )
    assert.deepEqual(descriptor(Buffer.from(branchText)), {
      bytes: fixture.sourceDeclarations.overageBranch.bytes,
      sha256: fixture.sourceDeclarations.overageBranch.sha256,
    })
    assert.match(branchText, /error\.headers\?\.get\(/)
    assert.match(
      branchText,
      /handleFastModeOverageRejection\(overageReason\)/,
    )
    assert.match(branchText, /retryContext\.fastMode = false/)
    assert.match(branchText, /continue/)

    const handler = declaration(
      fixture.sourceDeclarations.handleFastModeOverageRejection,
    )
    const handlerText = handler.node.getText(handler.sourceFile)
    assert.deepEqual(descriptor(Buffer.from(handlerText)), {
      bytes: fixture.sourceDeclarations.handleFastModeOverageRejection.bytes,
      sha256:
        fixture.sourceDeclarations.handleFastModeOverageRejection.sha256,
    })
    for (const required of fixture.targetHandlerBinding.requiredStrings) {
      assert(handlerText.includes(required), `${label}:${required}`)
    }
  }

  prove(historical, 'historical', true)
  prove(configured, 'configured', false)
})
