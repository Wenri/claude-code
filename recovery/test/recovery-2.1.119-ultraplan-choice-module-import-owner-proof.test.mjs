import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import { indexGeneratedBundle } from '../lib/structural-delta.mjs'
import {
  TARGET119_ULTRAPLAN_CHOICE_MODULE_IMPORT_EVIDENCE_IDS,
  TARGET119_ULTRAPLAN_CHOICE_MODULE_IMPORT_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/ultraplan-choice-module-import-owner-overrides.mjs'

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
  'recovery/test/recovery-2.1.119-ultraplan-choice-module-import-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'c428ca5e6f278df3b546a066035aa123686de8c1aac5247d44e7448cd6a7ffd0'
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

function assertIndexedUnit(indexed, expected) {
  const unit = indexed.units[expected.targetIndex]
  assert.ok(unit, `baseline u${expected.targetIndex}`)
  assert.deepEqual(
    {
      nodeType: unit.nodeType,
      start: unit.start,
      end: unit.end,
      bytes: unit.end - unit.start,
      tokenCount: unit.tokenCount,
      sha256: unit.sourceHash,
      coarseHash: unit.coarseHash,
    },
    {
      nodeType: expected.nodeType,
      start: expected.start,
      end: expected.end,
      bytes: expected.bytes,
      tokenCount: expected.tokenCount,
      sha256: expected.sha256,
      coarseHash: expected.coarseHash,
    },
  )
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

function sourceFilename(relativePath) {
  return path.join(sourceRoot, relativePath.replace(/^src\//, ''))
}

function readSource(relativePath) {
  const filename = sourceFilename(relativePath)
  const stat = fs.lstatSync(filename)
  assert.equal(stat.isSymbolicLink(), false)
  assert.equal(stat.isFile(), true)
  return fs.readFileSync(filename, 'utf8')
}

function parseSource(filePath, text) {
  const sourceFile = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  return sourceFile
}

function tsNodeDescriptor(sourceFile, text, node) {
  const start = node.getStart(sourceFile)
  const end = node.end
  return { start, end, ...sourceDescriptor(text.slice(start, end)) }
}

test('freezes the pre-regeneration partition and case-only static override', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  readPinned(fixture.inputs.helper)
  assert.deepEqual(
    TARGET119_ULTRAPLAN_CHOICE_MODULE_IMPORT_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
  assert.equal(
    TARGET119_ULTRAPLAN_CHOICE_MODULE_IMPORT_OWNER_OVERRIDES.length,
    1,
  )
  const override =
    TARGET119_ULTRAPLAN_CHOICE_MODULE_IMPORT_OWNER_OVERRIDES[0]
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
    assert.deepEqual(jsonDescriptor(fixture.snapshotPartition[key].rows), {
      jsonBytes: fixture.snapshotPartition[key].jsonBytes,
      sha256: fixture.snapshotPartition[key].sha256,
    })
  }
  assert.equal(fixture.snapshotPartition.coverage.rows, 1)
  assert.deepEqual(fixture.snapshotPartition.coverage.staleOwnerPaths, [
    'src/components/SessionBackgroundHint.tsx',
  ])
  assert.match(
    fixture.inputs.frozenMutableSnapshot.readPolicy,
    /must not reopen mutable report or coverage/,
  )
  assert.deepEqual(fixture.decision.expectedStrictImpact, {
    units: -1,
    residues: -2,
  })
})

test('authenticates the complete retained initializer and its exact consumer boundary', () => {
  const baselineBundle = readPinned(fixture.inputs.bundles['2.1.118'])
  const targetBundle = readPinned(fixture.inputs.bundles['2.1.119'])
  const ledger = readLedger(fixture.inputs.ledgers['2.1.118-to-2.1.119'])

  for (const expected of [
    fixture.runtimeBoundary.target.consumer,
    fixture.runtimeBoundary.target.bindings,
    fixture.runtimeBoundary.target.initializer,
  ]) {
    assertRegion(ledger, expected)
  }

  const baselineIndex = indexGeneratedBundle(
    path.join(root, fixture.inputs.bundles['2.1.118'].path),
  )
  for (const expected of [
    fixture.runtimeBoundary.baseline.consumer,
    fixture.runtimeBoundary.baseline.bindings,
    fixture.runtimeBoundary.baseline.initializer,
  ]) {
    assertIndexedUnit(baselineIndex, expected)
  }

  const targetBindings = slicePinned(
    targetBundle,
    fixture.runtimeBoundary.target.bindings,
  )
  assert.equal(
    targetBindings.toString(),
    fixture.runtimeBoundary.target.bindings.text,
  )
  assert.deepEqual(
    parseProgram(targetBindings).body[0].declarations.map(
      declaration => declaration.id.name,
    ),
    ['H24', 'aO8', '$24', 'Sx', 'sO8', 'SL5', 'RL5'],
  )

  const targetInitializer = slicePinned(
    targetBundle,
    fixture.runtimeBoundary.target.initializer,
  )
  const initializerProgram = parseProgram(targetInitializer)
  assert.deepEqual(
    canonicalDescriptor(initializerProgram),
    fixture.runtimeBoundary.target.initializer.canonicalProgram,
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
    module: node.right.arguments[0].value,
    binding: node.left.name,
    assignment: nodeDescriptor(
      targetInitializer.toString(),
      node,
      fixture.runtimeBoundary.target.initializer.start,
    ),
    call: nodeDescriptor(
      targetInitializer.toString(),
      node.right,
      fixture.runtimeBoundary.target.initializer.start,
    ),
    literal: nodeDescriptor(
      targetInitializer.toString(),
      node.right.arguments[0],
      fixture.runtimeBoundary.target.initializer.start,
    ),
  }))
  assert.deepEqual(requires, fixture.runtimeBoundary.target.initializer.requires)

  const targetConsumer = slicePinned(
    targetBundle,
    fixture.runtimeBoundary.target.consumer,
  )
  const consumerProgram = parseProgram(targetConsumer)
  assert.deepEqual(
    canonicalDescriptor(consumerProgram),
    fixture.runtimeBoundary.target.consumer.canonicalProgram,
  )
  const bindingUses = walk(
    consumerProgram,
    (node, parent) =>
      node.type === 'MemberExpression' &&
      node.computed === false &&
      ['aO8', '$24'].includes(node.object?.name) &&
      parent?.type === 'CallExpression' &&
      parent.callee === node,
  ).map(({ node, parent }) => ({
    object: node.object.name,
    property: node.property.name,
    member: nodeDescriptor(
      targetConsumer.toString(),
      node,
      fixture.runtimeBoundary.target.consumer.start,
    ),
    call: nodeDescriptor(
      targetConsumer.toString(),
      parent,
      fixture.runtimeBoundary.target.consumer.start,
    ),
  }))
  assert.deepEqual(bindingUses, fixture.runtimeBoundary.target.bindingUses)

  const baselineConsumer = slicePinned(
    baselineBundle,
    fixture.runtimeBoundary.baseline.consumer,
  )
  const baselineInitializer = slicePinned(
    baselineBundle,
    fixture.runtimeBoundary.baseline.initializer,
  )
  assert.deepEqual(
    canonicalDescriptor(parseProgram(baselineConsumer)),
    fixture.runtimeBoundary.baseline.consumer.canonicalProgram,
  )
  assert.deepEqual(
    canonicalDescriptor(parseProgram(baselineInitializer)),
    fixture.runtimeBoundary.baseline.initializer.canonicalProgram,
  )
  assert.deepEqual(
    fixture.runtimeBoundary.baseline.consumer.canonicalProgram,
    fixture.runtimeBoundary.target.consumer.canonicalProgram,
  )
  assert.deepEqual(
    fixture.runtimeBoundary.baseline.initializer.canonicalProgram,
    fixture.runtimeBoundary.target.initializer.canonicalProgram,
  )
})

test('authenticates the exact Target119 source imports, declarations, and call sites', () => {
  const input = fixture.sourceBoundary.target
  const absent = git('cat-file', '-e', `${fixture.sourceBoundary.baseline.commit}:${input.path}`)
  assert.notEqual(absent.status, 0)

  const gitSource = gitText(input.commit, input.path)
  assert.equal(gitBlob(input.commit, input.path), input.blob)
  assert.deepEqual(sourceDescriptor(gitSource), input.file)

  const source = readSource(input.path)
  assert.equal(source, gitSource)
  const sourceFile = parseSource(input.path, source)

  const imports = sourceFile.statements.filter(
    statement =>
      ts.isImportDeclaration(statement) &&
      ['fs/promises', 'path'].includes(statement.moduleSpecifier.text),
  )
  assert.deepEqual(
    imports.map(statement => ({
      module: statement.moduleSpecifier.text,
      ...tsNodeDescriptor(sourceFile, source, statement),
      names: statement.importClause.namedBindings.elements.map(
        element => element.name.text,
      ),
      elements: statement.importClause.namedBindings.elements.map(element => ({
        name: element.name.text,
        ...tsNodeDescriptor(sourceFile, source, element),
      })),
    })),
    input.imports,
  )

  const declarations = sourceFile.statements
    .filter(
      statement =>
        ts.isFunctionDeclaration(statement) &&
        ['currentTranscriptExists', 'UltraplanChoiceDialog'].includes(
          statement.name?.text,
        ),
    )
    .map(statement => ({
      name: statement.name.text,
      kind: ts.SyntaxKind[statement.kind],
      ...tsNodeDescriptor(sourceFile, source, statement),
    }))
  assert.deepEqual(declarations, input.declarations)

  const calls = []
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ['stat', 'join', 'writeFile'].includes(node.expression.text)
    ) {
      calls.push({
        callee: node.expression.text,
        ...tsNodeDescriptor(sourceFile, source, node),
      })
    }
    ts.forEachChild(node, child => {
      visit(child)
    })
  }
  visit(sourceFile)
  assert.deepEqual(calls, input.calls)

  const falseOwner = fixture.sourceBoundary.falseOwner
  const falseSource = readSource(falseOwner.path)
  assert.deepEqual(sourceDescriptor(falseSource), falseOwner.file)
  assert.equal(gitBlob(input.commit, falseOwner.path), falseOwner.blob)
  assert.equal(falseSource.match(/fs\/promises/g)?.length ?? 0, 0)
  assert.equal(
    falseSource.match(/(?:from|require\()[ ]*['"]path['"]/g)?.length ?? 0,
    0,
  )
})

test('pins the later initializer/source lineage and refuses source replay', () => {
  for (const expected of fixture.crossReleaseInitializerLineage) {
    const ledger = readLedger(fixture.inputs.ledgers[expected.case])
    assertRegion(ledger, expected)
    const bundle = readPinned(fixture.inputs.bundles[expected.version])
    const unit = slicePinned(bundle, expected)
    assert.deepEqual(
      canonicalDescriptor(parseProgram(unit)),
      expected.canonicalProgram,
    )
  }
  for (const witness of fixture.sourceBoundary.exactLaterSource) {
    assert.equal(
      gitBlob(witness.commit, fixture.sourceBoundary.target.path),
      witness.blob,
    )
    assert.equal(witness.blob, fixture.sourceBoundary.target.blob)
  }
  assert.equal(fixture.decision.mode, 'static-exact-source-owner-proof-only')
  assert.equal(fixture.decision.sourceReplay, false)
  assert.equal(fixture.decision.sourceFilesChanged, 0)
  assert.equal(fixture.decision.replayExport, null)
  assert.equal(fixture.decision.requiredOrder, null)
})
