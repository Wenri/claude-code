import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET119_CLI_BG_MODULE_IMPORT_EVIDENCE_IDS,
  TARGET119_CLI_BG_MODULE_IMPORT_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/cli-bg-module-import-owner-overrides.mjs'

const root = process.cwd()
const require = createRequire(import.meta.url)
const ts = require(
  path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  ),
)
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-cli-bg-module-import-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '63bd1d1047c2b3f1c53405b38cdfd11ae5014dd5c9f6d1107e58a8a53337bb12'
const configuredSourceRoot =
  process.env.CLAUDE_CODE_2_1_119_SOURCE_ROOT ??
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
const sourceRoot = configuredSourceRoot
  ? path.resolve(configuredSourceRoot)
  : path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src')

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: Buffer.byteLength(value), sha256: sha256(value) }
}

function sourceDescriptor(value) {
  return {
    chars: value.length,
    bytes: Buffer.byteLength(value),
    sha256: sha256(value),
  }
}

function jsonDescriptor(value) {
  const serialized = JSON.stringify(value)
  return { jsonBytes: Buffer.byteLength(serialized), sha256: sha256(serialized) }
}

function readPinned(input) {
  const value = fs.readFileSync(path.join(root, input.path))
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return value
}

function readLedger(input) {
  return JSON.parse(gunzipSync(readPinned(input)))
}

function assertRegion(ledger, expected) {
  const region = ledger.regions.find(
    candidate => candidate.target.index === expected.targetIndex,
  )
  assert.ok(region, `u${expected.targetIndex}`)
  assert.deepEqual(
    {
      classification: region.classification,
      nodeType: region.target.nodeType,
      start: region.target.start,
      end: region.target.end,
      bytes: region.target.end - region.target.start,
      tokenCount: region.target.tokenCount,
      sha256: region.target.sourceHash,
      coarseHash: region.target.coarseHash,
      unknownFreeIdentifierCount: region.unknownFreeIdentifierCount,
      ...(region.baselineUnitIndex == null
        ? {}
        : {
            baselineUnitIndex: region.baselineUnitIndex,
            pairReason: region.pairReason,
          }),
    },
    {
      classification: expected.classification,
      nodeType: expected.nodeType,
      start: expected.start,
      end: expected.end,
      bytes: expected.bytes,
      tokenCount: expected.tokenCount,
      sha256: expected.sha256,
      coarseHash: expected.coarseHash,
      unknownFreeIdentifierCount: expected.unknownFreeIdentifierCount,
      ...(expected.baselineUnitIndex == null
        ? {}
        : {
            baselineUnitIndex: expected.baselineUnitIndex,
            pairReason: expected.pairReason,
          }),
    },
  )
  return region
}

function slicePinned(bundle, input) {
  const value = bundle.subarray(input.start, input.end)
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return value
}

function walk(node, predicate, result = [], parent = null, parentKey = null) {
  if (!node || typeof node !== 'object') return result
  if (predicate(node, parent, parentKey)) result.push({ node, parent, parentKey })
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'loc', 'range', 'raw'].includes(key)) continue
    if (Array.isArray(value)) {
      for (const child of value) walk(child, predicate, result, node, key)
    } else {
      walk(value, predicate, result, node, key)
    }
  }
  return result
}

function canonicalAst(value, parent = null, parentKey = null) {
  if (Array.isArray(value)) {
    return value.map((entry, index) => canonicalAst(entry, value, index))
  }
  if (!value || typeof value !== 'object') return value
  const result = {}
  for (const [key, child] of Object.entries(value)) {
    if (['start', 'end', 'loc', 'range', 'raw'].includes(key)) continue
    if (key === 'name' && value.type === 'Identifier') {
      const preserve =
        (parent?.type === 'MemberExpression' &&
          parent.computed === false &&
          parentKey === 'property') ||
        (parent?.type === 'Property' &&
          parent.computed === false &&
          parent.shorthand === false &&
          parentKey === 'key') ||
        (parent?.type === 'MethodDefinition' &&
          parent.computed === false &&
          parentKey === 'key')
      result[key] = preserve ? child : '@id'
    } else {
      result[key] = canonicalAst(child, value, key)
    }
  }
  return result
}

function canonicalDescriptor(ast) {
  const serialized = JSON.stringify(canonicalAst(ast))
  return { jsonBytes: Buffer.byteLength(serialized), sha256: sha256(serialized) }
}

function parseProgram(value) {
  return parse(value.toString(), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  })
}

function nodeDescriptor(source, node, absoluteStart = 0) {
  const value = source.slice(node.start, node.end)
  return {
    start: absoluteStart + node.start,
    end: absoluteStart + node.end,
    bytes: Buffer.byteLength(value),
    sha256: sha256(value),
  }
}

function git(...args) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8' })
}

function gitText(commit, filePath) {
  const result = git('show', `${commit}:${filePath}`)
  assert.equal(result.status, 0, result.stderr)
  return result.stdout
}

function gitBlob(commit, filePath) {
  const result = git('rev-parse', `${commit}:${filePath}`)
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function parseSource(filePath, text) {
  const sourceFile = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  return sourceFile
}

function sourceFilename(relativePath) {
  return path.join(sourceRoot, relativePath.replace(/^src\//, ''))
}

function tsNodeDescriptor(sourceFile, text, node) {
  const start = node.getStart(sourceFile)
  const end = node.end
  return { start, end, ...sourceDescriptor(text.slice(start, end)) }
}

test('freezes the exact pre-regeneration partition and case-only owner override', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  readPinned(fixture.inputs.helper)
  assert.deepEqual(
    TARGET119_CLI_BG_MODULE_IMPORT_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
  assert.equal(TARGET119_CLI_BG_MODULE_IMPORT_OWNER_OVERRIDES.length, 1)
  const override = TARGET119_CLI_BG_MODULE_IMPORT_OWNER_OVERRIDES[0]
  assert.deepEqual(
    {
      key: override.key,
      targetIndex: override.targetIndex,
      paths: [...override.paths],
      declarations: [...override.declarations],
    },
    fixture.ownerOverride,
  )
  for (const key of [
    'sourceRuntimeOwnerResidueRows',
    'sourceRuntimeAddedOwnerResidueRows',
    'strictRows',
    'unclassifiedRows',
  ]) {
    assert.deepEqual(
      jsonDescriptor(fixture.snapshotPartition[key].rows),
      {
        jsonBytes: fixture.snapshotPartition[key].jsonBytes,
        sha256: fixture.snapshotPartition[key].sha256,
      },
      key,
    )
  }
  assert.equal(fixture.snapshotPartition.coverage.rows, 1)
  assert.deepEqual(fixture.snapshotPartition.coverage.staleOwnerPaths, [
    'src/utils/sessionRestore.ts',
  ])
  assert.match(
    fixture.inputs.frozenMutableSnapshot.readPolicy,
    /must not reopen mutable report or coverage/,
  )
})

test('authenticates the complete Target119 unit and its adjacent declaration boundary', () => {
  readPinned(fixture.inputs.bundles['2.1.118'])
  const targetBundle = readPinned(fixture.inputs.bundles['2.1.119'])
  const ledger = readLedger(fixture.inputs.ledgers['2.1.118-to-2.1.119'])
  assertRegion(ledger, fixture.targetBoundary.openAgentsFromForeground)
  assertRegion(ledger, fixture.targetBoundary.importBindings)
  assertRegion(ledger, fixture.targetBoundary.moduleInitializer)

  const bindings = slicePinned(targetBundle, fixture.targetBoundary.importBindings)
  assert.equal(bindings.toString(), fixture.targetBoundary.importBindings.text)
  const bindingProgram = parseProgram(bindings)
  assert.deepEqual(
    bindingProgram.body[0].declarations.map(declaration => declaration.id.name),
    ['pW4', 'BW4'],
  )

  const initializer = slicePinned(
    targetBundle,
    fixture.targetBoundary.moduleInitializer,
  )
  const initializerProgram = parseProgram(initializer)
  assert.deepEqual(
    canonicalDescriptor(initializerProgram),
    fixture.targetBoundary.moduleInitializer.canonicalProgram,
  )
  const requires = walk(
    initializerProgram,
    node =>
      node.type === 'AssignmentExpression' &&
      node.left?.type === 'Identifier' &&
      node.right?.type === 'CallExpression' &&
      node.right.callee?.type === 'Identifier' &&
      node.right.callee.name === 'require' &&
      node.right.arguments.length === 1 &&
      node.right.arguments[0].type === 'Literal',
  ).map(({ node }) => ({
    binding: node.left.name,
    module: node.right.arguments[0].value,
    call: nodeDescriptor(
      initializer.toString(),
      node.right,
      fixture.targetBoundary.moduleInitializer.start,
    ),
    literal: nodeDescriptor(
      initializer.toString(),
      node.right.arguments[0],
      fixture.targetBoundary.moduleInitializer.start,
    ),
  }))
  assert.deepEqual(
    requires,
    fixture.targetBoundary.moduleInitializer.requires.map(entry => ({
      binding: entry.binding,
      module: entry.module,
      call: {
        start: entry.call.start,
        end: entry.call.end,
        bytes: entry.call.bytes,
        sha256: entry.call.sha256,
      },
      literal: {
        start: entry.literal.start,
        end: entry.literal.end,
        bytes: entry.literal.bytes,
        sha256: entry.literal.sha256,
      },
    })),
  )
})

test('binds both initializer imports to their only adjacent runtime consumers', () => {
  const targetBundle = readPinned(fixture.inputs.bundles['2.1.119'])
  const expected = fixture.targetBoundary.openAgentsFromForeground
  const source = slicePinned(targetBundle, expected).toString()
  const program = parseProgram(source)
  const calls = walk(
    program,
    node =>
      node.type === 'CallExpression' &&
      node.callee?.type === 'MemberExpression' &&
      node.callee.computed === false &&
      ['pW4', 'BW4'].includes(node.callee.object?.name),
  ).map(({ node }) => ({
    object: node.callee.object.name,
    property: node.callee.property.name,
    ...nodeDescriptor(source, node, expected.start),
  }))
  assert.deepEqual(calls, expected.bindingUses)
  assert.deepEqual(
    calls.map(call => [call.object, call.property]),
    [
      ['pW4', 'randomUUID'],
      ['BW4', 'rm'],
    ],
  )
})

test('authenticates the new Target119 cli/bg source imports and declaration in raw or package mode', () => {
  const expected = fixture.sourceBoundary.target
  const sourcePath = sourceFilename(expected.path)
  const source = fs.readFileSync(sourcePath, 'utf8')
  assert.deepEqual(sourceDescriptor(source), expected.file)
  assert.equal(gitBlob(expected.commit, expected.path), expected.blob)
  assert.equal(gitText(expected.commit, expected.path), source)
  const baselineProbe = git(
    'cat-file',
    '-e',
    `${fixture.sourceBoundary.baseline.commit}:${expected.path}`,
  )
  assert.notEqual(baselineProbe.status, 0)

  const sourceFile = parseSource(expected.path, source)
  const imports = sourceFile.statements.filter(
    statement =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      ['crypto', 'fs/promises'].includes(statement.moduleSpecifier.text),
  )
  assert.equal(imports.length, 2)
  for (const expectedImport of expected.imports) {
    const statement = imports.find(
      candidate => candidate.moduleSpecifier.text === expectedImport.module,
    )
    assert.ok(statement, expectedImport.module)
    assert.deepEqual(tsNodeDescriptor(sourceFile, source, statement), {
      start: expectedImport.start,
      end: expectedImport.end,
      chars: expectedImport.chars,
      bytes: expectedImport.bytes,
      sha256: expectedImport.sha256,
    })
    assert.equal(statement.importClause?.isTypeOnly, false)
    const elements = statement.importClause.namedBindings.elements
    assert.deepEqual(
      elements.map(element => element.name.text),
      expectedImport.names,
    )
    const required = elements.find(
      element => element.name.text === expectedImport.requiredName.name,
    )
    assert.ok(required, expectedImport.requiredName.name)
    assert.deepEqual(tsNodeDescriptor(sourceFile, source, required), {
      start: expectedImport.requiredName.start,
      end: expectedImport.requiredName.end,
      chars: expectedImport.requiredName.end - expectedImport.requiredName.start,
      bytes: expectedImport.requiredName.bytes,
      sha256: expectedImport.requiredName.sha256,
    })
  }

  const declaration = sourceFile.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === expected.declaration.name,
  )
  assert.ok(declaration)
  assert.deepEqual(tsNodeDescriptor(sourceFile, source, declaration), {
    start: expected.declaration.start,
    end: expected.declaration.end,
    chars: expected.declaration.chars,
    bytes: expected.declaration.bytes,
    sha256: expected.declaration.sha256,
  })
  const calls = []
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ['randomUUID', 'rm'].includes(node.expression.text)
    ) {
      calls.push({
        callee: node.expression.text,
        ...tsNodeDescriptor(sourceFile, source, node),
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(declaration)
  assert.deepEqual(calls, expected.declaration.calls)
})

test('rejects the unchanged sessionRestore source-map owner at the import boundary', () => {
  const expected = fixture.sourceBoundary.falseOwner
  const source = fs.readFileSync(sourceFilename(expected.path), 'utf8')
  assert.deepEqual(sourceDescriptor(source), expected.file)
  for (const commit of expected.commits) {
    assert.equal(gitBlob(commit, expected.path), expected.blob)
    assert.equal(gitText(commit, expected.path), source)
  }
  const sourceFile = parseSource(expected.path, source)
  const relevantImports = sourceFile.statements.filter(
    statement =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      ['crypto', 'fs/promises'].includes(statement.moduleSpecifier.text),
  )
  assert.equal(relevantImports.length, 1)
  const cryptoImport = relevantImports[0]
  assert.equal(cryptoImport.moduleSpecifier.text, 'crypto')
  assert.equal(cryptoImport.importClause.isTypeOnly, true)
  assert.deepEqual(
    {
      typeOnly: true,
      ...tsNodeDescriptor(sourceFile, source, cryptoImport),
      text: source.slice(cryptoImport.getStart(sourceFile), cryptoImport.end),
    },
    expected.cryptoImport,
  )
  assert.equal(
    relevantImports.filter(
      statement => statement.moduleSpecifier.text === 'fs/promises',
    ).length,
    expected.fsPromisesLiteralCount,
  )
})

test('proves the exact initializer AST persists through Target120 and Target121', () => {
  const targetCanonical = fixture.targetBoundary.moduleInitializer.canonicalProgram
  for (const expected of fixture.crossReleaseLineage) {
    const ledger = readLedger(fixture.inputs.ledgers[expected.case])
    assertRegion(ledger, expected)
    const bundle = readPinned(fixture.inputs.bundles[expected.version])
    const source = slicePinned(bundle, expected)
    const program = parseProgram(source)
    assert.deepEqual(canonicalDescriptor(program), targetCanonical)
    const modules = walk(
      program,
      node =>
        node.type === 'CallExpression' &&
        node.callee?.name === 'require' &&
        node.arguments.length === 1 &&
        node.arguments[0].type === 'Literal',
    ).map(({ node }) => node.arguments[0].value)
    assert.deepEqual(modules, ['crypto', 'fs/promises'])
  }
})

test('remains fail-closed and static-only', async () => {
  assert.deepEqual(fixture.decision, {
    mode: 'static-owner-proof-only',
    sourceReplay: false,
    sourceFilesChanged: 0,
    replayExport: null,
    requiredOrder: null,
    reason:
      'The authenticated Target119 source is already present and exact. Only the generated coverage owner is false; replaying or rewriting source would add no authenticated behavior.',
    expectedStrictImpact: { units: -1, residues: -2 },
  })
  assert.equal(
    Object.hasOwn(
      await import(
        '../cases/2.1.118-to-2.1.119/recovered/cli-bg-module-import-owner-overrides.mjs'
      ),
      'replayTarget119CliBgModuleImport',
    ),
    false,
  )
})
