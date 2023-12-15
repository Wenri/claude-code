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
  TARGET117_BRIDGE_DIALOG_MEMO_CACHE_EVIDENCE_IDS,
  TARGET117_BRIDGE_DIALOG_MEMO_CACHE_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/bridge-dialog-memo-cache-owner-overrides.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-bridge-dialog-memo-cache-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '6c8741877323dbfd47e6e730440aae0db4584749cb4856d72080ed3e9f6f13b6'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
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
  return path.resolve(
    process.env[environmentName] ?? path.join(repositoryRoot, input.path),
  )
}

function walk(node, visit, parent = undefined) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, parent)
    return
  }
  if (typeof node.type === 'string') visit(node, parent)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
      walk(child, visit, node)
    }
  }
}

function numberLiteralPositions(program, value, offset = 0) {
  const positions = []
  walk(program, node => {
    if (node.type === 'Literal' && node.value === value) {
      positions.push({ start: offset + node.start, end: offset + node.end })
    }
  })
  positions.sort((left, right) => left.start - right.start)
  return positions
}

function assertContiguousCacheSlots(accesses, expected, label) {
  assert.equal(accesses.length, expected.memberAccesses, `${label}: member accesses`)
  assert.equal(
    sha256(Buffer.from(JSON.stringify(accesses))),
    expected.accessSequenceSha256,
    `${label}: access sequence`,
  )
  const slots = [...new Set(accesses)].sort((left, right) => left - right)
  assert.equal(slots.length, expected.uniqueSlots, `${label}: unique slots`)
  assert.equal(slots[0], expected.minimumSlot, `${label}: minimum slot`)
  assert.equal(slots.at(-1), expected.maximumSlot, `${label}: maximum slot`)
  assert.deepEqual(
    slots,
    Array.from({ length: expected.arity }, (_, index) => index),
    `${label}: every allocated slot is addressed exactly within bounds`,
  )
  assert.equal(expected.arity, expected.maximumSlot + 1, `${label}: closed arity`)
}

function assertTargetMemoCache(unitAst) {
  const calls = []
  walk(unitAst, node => {
    if (
      node.type === 'CallExpression' &&
      node.callee?.type === 'MemberExpression' &&
      !node.callee.computed &&
      node.callee.object?.type === 'Identifier' &&
      node.callee.object.name === fixture.targetMemoCache.runtimeObject &&
      node.callee.property?.type === 'Identifier' &&
      node.callee.property.name === fixture.targetMemoCache.property &&
      node.arguments.length === 1 &&
      node.arguments[0].type === 'Literal' &&
      node.arguments[0].value === fixture.targetMemoCache.arity
    ) {
      calls.push(node)
    }
  })
  assert.equal(calls.length, 1, 'one Target117 memo-cache allocation')
  const call = calls[0]
  const offset = fixture.targetUnit.start
  assert.deepEqual(
    [offset + call.start, offset + call.end],
    [fixture.targetMemoCache.callStart, fixture.targetMemoCache.callEnd],
  )
  assert.deepEqual(
    [offset + call.arguments[0].start, offset + call.arguments[0].end],
    [fixture.residue.start, fixture.residue.end],
  )

  const declarators = []
  walk(unitAst, node => {
    if (node.type === 'VariableDeclarator' && node.init === call) {
      declarators.push(node)
    }
  })
  assert.equal(declarators.length, 1, 'cache allocation has one binding')
  const declaration = declarators[0]
  assert.equal(declaration.id.type, 'Identifier')
  assert.equal(declaration.id.name, fixture.targetMemoCache.binding)

  const accesses = []
  const invalidUses = []
  walk(unitAst, (node, parent) => {
    if (
      node.type !== 'Identifier' ||
      node.name !== fixture.targetMemoCache.binding ||
      node === declaration.id
    ) {
      return
    }
    if (
      parent?.type === 'MemberExpression' &&
      parent.object === node &&
      parent.computed &&
      parent.property?.type === 'Literal' &&
      Number.isSafeInteger(parent.property.value)
    ) {
      accesses.push(parent.property.value)
    } else {
      invalidUses.push({ start: offset + node.start, parent: parent?.type })
    }
  })
  assert.deepEqual(invalidUses, [], 'cache binding has no non-slot uses')
  assertContiguousCacheSlots(accesses, fixture.targetMemoCache, 'target cache')
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

function descendants(ts, root) {
  const pairs = []
  function visit(node, parent = undefined) {
    pairs.push([node, parent])
    ts.forEachChild(node, child => visit(child, node))
  }
  visit(root)
  return pairs
}

function assertExactSourceCache(ts, bytes, label) {
  assert.deepEqual(
    descriptor(bytes),
    { bytes: fixture.source.bytes, sha256: fixture.source.sha256 },
    `${label}: complete source`,
  )
  const text = bytes.toString('utf8')
  const sourceFile = ts.createSourceFile(
    fixture.source.path,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${label}: parses`)

  const imports = sourceFile.statements.filter(statement =>
    ts.isImportDeclaration(statement),
  )
  const compilerImport = imports.filter(statement => {
    if (statement.moduleSpecifier.text !== fixture.source.memoCache.importModule) {
      return false
    }
    return statement.importClause?.namedBindings?.elements.some(element =>
      (element.propertyName?.text ?? element.name.text) ===
        fixture.source.memoCache.importedName &&
      element.name.text === fixture.source.memoCache.localName,
    )
  })
  assert.equal(compilerImport.length, 1, `${label}: exact compiler-runtime import`)

  const declarations = sourceFile.statements.filter(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === fixture.source.declaration.name,
  )
  assert.equal(declarations.length, 1, `${label}: one BridgeDialog declaration`)
  const declaration = declarations[0]
  const declarationStart = declaration.getStart(sourceFile)
  assert.deepEqual({
    name: declaration.name.text,
    start: declarationStart,
    end: declaration.end,
    ...descriptor(bytes.subarray(declarationStart, declaration.end)),
  }, fixture.source.declaration, `${label}: declaration identity`)

  const pairs = descendants(ts, declaration)
  const calls = pairs
    .map(([node]) => node)
    .filter(
      node =>
        ts.isCallExpression(node) &&
        node.expression.getText(sourceFile) === fixture.source.memoCache.localName &&
        node.arguments.length === 1 &&
        ts.isNumericLiteral(node.arguments[0]) &&
        Number(node.arguments[0].text) === fixture.source.memoCache.arity,
    )
  assert.equal(calls.length, 1, `${label}: one source memo-cache allocation`)
  const call = calls[0]
  assert.deepEqual(
    [call.getStart(sourceFile), call.end],
    [fixture.source.memoCache.callStart, fixture.source.memoCache.callEnd],
  )
  assert.deepEqual(
    [call.arguments[0].getStart(sourceFile), call.arguments[0].end],
    [fixture.source.memoCache.argumentStart, fixture.source.memoCache.argumentEnd],
  )

  const variableDeclarations = pairs
    .map(([node]) => node)
    .filter(node => ts.isVariableDeclaration(node) && node.initializer === call)
  assert.equal(variableDeclarations.length, 1, `${label}: one cache binding`)
  const variable = variableDeclarations[0]
  assert.equal(variable.name.getText(sourceFile), fixture.source.memoCache.binding)

  const accesses = []
  const invalidUses = []
  for (const [node, parent] of pairs) {
    if (
      !ts.isIdentifier(node) ||
      node.getText(sourceFile) !== fixture.source.memoCache.binding ||
      node === variable.name
    ) {
      continue
    }
    if (
      ts.isElementAccessExpression(parent) &&
      parent.expression === node &&
      parent.argumentExpression &&
      ts.isNumericLiteral(parent.argumentExpression)
    ) {
      accesses.push(Number(parent.argumentExpression.text))
    } else {
      invalidUses.push({
        start: node.getStart(sourceFile),
        parent: ts.SyntaxKind[parent.kind],
      })
    }
  }
  assert.deepEqual(invalidUses, [], `${label}: cache binding has no non-slot uses`)
  assertContiguousCacheSlots(accesses, fixture.source.memoCache, `${label} cache`)
}

test(
  '2.1.117 BridgeDialog memo-cache fixture freezes one compiler-only owner row',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(fixture.summary, {
      units: 1,
      residues: 1,
      sourceFiles: 1,
      sourceReplays: 0,
      ownerOverrides: 1,
    })
    assert.deepEqual(
      [...TARGET117_BRIDGE_DIALOG_MEMO_CACHE_EVIDENCE_IDS],
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET117_BRIDGE_DIALOG_MEMO_CACHE_OWNER_OVERRIDES.map(override => ({
        key: override.key,
        targetIndex: override.targetIndex,
        paths: [...override.paths],
        declarations: [...override.declarations],
        evidenceIds: [...override.evidenceIds],
      })),
      [{
        key: `${caseName}:${fixture.targetUnit.targetIndex}`,
        targetIndex: fixture.targetUnit.targetIndex,
        paths: [fixture.source.path],
        declarations: [fixture.source.declaration.name],
        evidenceIds: fixture.evidenceIds,
      }],
    )
    assert.match(
      TARGET117_BRIDGE_DIALOG_MEMO_CACHE_OWNER_OVERRIDES[0].behavior,
      /compiler memo-cache allocation size/,
    )
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
        ['rev-parse', `${fixture.source.rawTargetSourceCommit}:${fixture.source.path}`],
        { cwd: repositoryRoot, encoding: 'utf8' },
      ).trim(),
      fixture.source.blob,
    )
  },
)

test(
  '2.1.117 authenticated u19151 closes all 96 BridgeDialog memo-cache slots',
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
    const ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.structuralLedger.path),
          fixture.structuralLedger,
          'structural ledger',
        ),
      ),
    )
    const region = ledger.regions.find(
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
    assert.deepEqual(
      descriptor(unitBytes),
      { bytes: fixture.targetUnit.bytes, sha256: fixture.targetUnit.sha256 },
    )
    const unitAst = parse(unitBytes.toString('utf8'), {
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    assert.equal(unitAst.body.length, 1)
    assert.equal(unitAst.body[0].type, fixture.targetUnit.nodeType)
    assert.deepEqual(
      numberLiteralPositions(unitAst, fixture.residue.value, fixture.targetUnit.start),
      [{ start: fixture.residue.start, end: fixture.residue.end }],
      'u19151 has exactly one numeric 96',
    )
    assertTargetMemoCache(unitAst)

    const baselineAst = parse(baselineBytes.toString('utf8'), {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    })
    const targetAst = parse(targetBytes.toString('utf8'), {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    })
    const baselineOccurrences = numberLiteralPositions(
      baselineAst,
      fixture.residue.value,
    )
    const targetOccurrences = numberLiteralPositions(targetAst, fixture.residue.value)
    assert.equal(
      baselineOccurrences.length,
      fixture.residue.baselineOccurrenceCount,
    )
    assert.equal(targetOccurrences.length, fixture.residue.targetOccurrenceCount)
    assert.deepEqual(
      targetOccurrences[fixture.residue.targetOccurrenceNumber - 1],
      { start: fixture.residue.start, end: fixture.residue.end },
    )
  },
)

test(
  '2.1.117 raw and packaged BridgeDialog preserve an exact compiler-runtime cache closure',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const rawBytes = execFileSync(
      'git',
      ['show', `${fixture.source.rawTargetSourceCommit}:${fixture.source.path}`],
      { cwd: repositoryRoot },
    )
    assertExactSourceCache(ts, rawBytes, 'raw ff0339 source')

    const packagedRoot = path.resolve(
      process.env.CLAUDE_CODE_RECOVERED_2_1_117_SOURCE_ROOT ??
        path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.117/src'),
    )
    assert.ok(fs.existsSync(packagedRoot), 'packaged Target117 source root exists')
    assertExactSourceCache(
      ts,
      fs.readFileSync(path.join(packagedRoot, fixture.source.path.slice(4))),
      'packaged Target117 source',
    )
  },
)
