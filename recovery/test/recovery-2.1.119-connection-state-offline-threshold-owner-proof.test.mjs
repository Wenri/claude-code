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
  TARGET119_CONNECTION_STATE_OFFLINE_THRESHOLD_EVIDENCE_IDS,
  TARGET119_CONNECTION_STATE_OFFLINE_THRESHOLD_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/connection-state-offline-threshold-owner-overrides.mjs'

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
  'recovery/test/recovery-2.1.119-connection-state-offline-threshold-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '66eff0b359febc1c3a3090e9caf46bff6662ac655106184170300c181c7af052'
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

function findRegion(ledger, targetIndex) {
  return [...ledger.regions, ...ledger.unresolvedTarget].find(
    candidate => candidate.target.index === targetIndex,
  )
}

function assertRegion(ledger, expected) {
  const region = findRegion(ledger, expected.targetIndex)
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
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  return sourceFile
}

function tsNodeDescriptor(sourceFile, text, node) {
  const start = node.getStart(sourceFile)
  const end = node.end
  return { start, end, ...sourceDescriptor(text.slice(start, end)) }
}

test('freezes the current partition and the case-only static override', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  readPinned(fixture.inputs.helper)
  assert.deepEqual(
    TARGET119_CONNECTION_STATE_OFFLINE_THRESHOLD_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
  assert.equal(
    TARGET119_CONNECTION_STATE_OFFLINE_THRESHOLD_OWNER_OVERRIDES.length,
    1,
  )
  const override =
    TARGET119_CONNECTION_STATE_OFFLINE_THRESHOLD_OWNER_OVERRIDES[0]
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
  assert.match(
    fixture.inputs.frozenMutableSnapshot.readPolicy,
    /must not reopen mutable report or coverage/,
  )
  assert.deepEqual(fixture.decision.expectedStrictImpact, {
    units: -1,
    residues: -1,
  })
})

test('authenticates the complete constant unit and adjacent class consumer', () => {
  const bundle = readPinned(fixture.inputs.bundles['2.1.119'])
  const ledger = readLedger(fixture.inputs.ledgers['2.1.118-to-2.1.119'])
  assertRegion(ledger, fixture.runtimeBoundary.consumerClass)
  assertRegion(ledger, fixture.runtimeBoundary.constants)

  const constants = slicePinned(bundle, fixture.runtimeBoundary.constants)
  const constantsProgram = parseProgram(constants)
  assert.deepEqual(
    canonicalDescriptor(constantsProgram),
    fixture.runtimeBoundary.constants.canonicalProgram,
  )
  const declarations = constantsProgram.body[0].declarations.map(node => ({
    binding: node.id.name,
    declaration: nodeDescriptor(
      constants.toString(),
      node,
      fixture.runtimeBoundary.constants.start,
    ),
    initializer: {
      value: node.init.value,
      ...nodeDescriptor(
        constants.toString(),
        node.init,
        fixture.runtimeBoundary.constants.start,
      ),
    },
  }))
  assert.deepEqual(declarations, fixture.runtimeBoundary.constants.declarations)

  const consumer = slicePinned(bundle, fixture.runtimeBoundary.consumerClass)
  const consumerProgram = parseProgram(consumer)
  const uses = walk(
    consumerProgram,
    node =>
      node.type === 'Identifier' && ['pL5', 'BL5'].includes(node.name),
  ).map(({ node, parent }) => ({
    binding: node.name,
    identifier: nodeDescriptor(
      consumer.toString(),
      node,
      fixture.runtimeBoundary.consumerClass.start,
    ),
    expression: nodeDescriptor(
      consumer.toString(),
      parent,
      fixture.runtimeBoundary.consumerClass.start,
    ),
  }))
  assert.deepEqual(uses, fixture.runtimeBoundary.bindingUses)
})

test('authenticates the exact Target119 source constants and class uses', () => {
  const input = fixture.sourceBoundary.target
  const absent = git('cat-file', '-e', `${fixture.sourceBoundary.baseline.commit}:${input.path}`)
  assert.notEqual(absent.status, 0)

  const gitSource = gitText(input.commit, input.path)
  assert.equal(gitBlob(input.commit, input.path), input.blob)
  assert.deepEqual(sourceDescriptor(gitSource), input.file)
  const source = readSource(input.path)
  assert.equal(source, gitSource)
  const sourceFile = parseSource(input.path, source)

  const constantStatements = sourceFile.statements.filter(
    statement =>
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(declaration =>
        ['OFFLINE_FAILURE_WINDOW_MS', 'OFFLINE_FAILURE_THRESHOLD'].includes(
          declaration.name.getText(sourceFile),
        ),
      ),
  )
  assert.deepEqual(
    constantStatements.map(statement => ({
      ...tsNodeDescriptor(sourceFile, source, statement),
      declarations: statement.declarationList.declarations.map(declaration => ({
        name: declaration.name.getText(sourceFile),
        ...tsNodeDescriptor(sourceFile, source, declaration),
        initializer: {
          value: declaration.initializer.text,
          ...tsNodeDescriptor(sourceFile, source, declaration.initializer),
        },
      })),
    })),
    input.constantStatements,
  )

  const classDeclaration = sourceFile.statements.find(
    statement =>
      ts.isClassDeclaration(statement) &&
      statement.name?.text === 'ConnectionLifecycleTracker',
  )
  assert.ok(classDeclaration)
  assert.deepEqual(
    tsNodeDescriptor(sourceFile, source, classDeclaration),
    input.classDeclaration,
  )

  const sourceUses = []
  function visit(node) {
    if (
      ts.isIdentifier(node) &&
      ['OFFLINE_FAILURE_WINDOW_MS', 'OFFLINE_FAILURE_THRESHOLD'].includes(
        node.text,
      ) &&
      !(ts.isVariableDeclaration(node.parent) && node.parent.name === node)
    ) {
      sourceUses.push({
        name: node.text,
        identifier: tsNodeDescriptor(sourceFile, source, node),
        expression: tsNodeDescriptor(sourceFile, source, node.parent),
      })
    }
    ts.forEachChild(node, child => {
      visit(child)
    })
  }
  visit(sourceFile)
  assert.deepEqual(sourceUses, input.bindingUses)

  const falseOwner = fixture.sourceBoundary.falseOwner
  const falseSource = readSource(falseOwner.path)
  assert.deepEqual(sourceDescriptor(falseSource), falseOwner.file)
  assert.equal(falseSource.match(/60_?000/g)?.length ?? 0, 0)
  assert.equal(falseSource.match(/OFFLINE_FAILURE/g)?.length ?? 0, 0)
})

test('pins exact source and constant-unit lineage and refuses replay', () => {
  for (const expected of fixture.crossReleaseLineage) {
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
