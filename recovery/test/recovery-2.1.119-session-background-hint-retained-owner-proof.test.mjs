import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET119_SESSION_BACKGROUND_HINT_EVIDENCE_IDS,
  TARGET119_SESSION_BACKGROUND_HINT_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/session-background-hint-retained-owner-overrides.mjs'

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
  'recovery/test/recovery-2.1.119-session-background-hint-retained-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '1336190f0f4884042998677a39427c3d707fd4b0fff0dd44e1fc5cc6abd871e1'
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

function slicePinned(bundle, input) {
  const value = bundle.subarray(input.start, input.end)
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return value
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

function tokenCount(value) {
  const tokens = tokenizer(value.toString(), { ecmaVersion: 'latest' })
  let count = 0
  while (tokens.getToken().type.label !== 'eof') count += 1
  return count
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

function parseSource(filePath, source) {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  return sourceFile
}

function sourceMapContent(source) {
  const match = source.match(/sourceMappingURL=data:[^,]+,([^\n]+)/)
  assert.ok(match)
  const map = JSON.parse(Buffer.from(match[1], 'base64').toString())
  assert.equal(map.sourcesContent.length, 1)
  return map.sourcesContent[0]
}

function tsNodeDescriptor(sourceFile, source, node) {
  const start = node.getStart(sourceFile)
  const end = node.end
  return { start, end, ...sourceDescriptor(source.slice(start, end)) }
}

function namedDeclaration(sourceFile, name) {
  return sourceFile.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  )
}

function propsNames(sourceFile) {
  const props = sourceFile.statements.find(
    statement => ts.isTypeAliasDeclaration(statement) && statement.name.text === 'Props',
  )
  assert.ok(props)
  assert.ok(ts.isTypeLiteralNode(props.type))
  return props.type.members.map(member => member.name.getText(sourceFile))
}

function shortcutJsx(sourceFile, declaration) {
  const values = []
  function visit(node) {
    if (
      ts.isJsxSelfClosingElement(node) &&
      node.tagName.getText(sourceFile) === 'KeyboardShortcutHint'
    ) {
      values.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(declaration)
  return values
}

test('freezes the exact u20791 partition and the case-only owner evidence', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  readPinned(fixture.inputs.helper)
  assert.deepEqual(
    TARGET119_SESSION_BACKGROUND_HINT_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
  const override = TARGET119_SESSION_BACKGROUND_HINT_OWNER_OVERRIDES[0]
  assert.deepEqual(
    {
      key: override.key,
      targetIndex: override.targetIndex,
      paths: [...override.paths],
      declarations: [...override.declarations],
    },
    fixture.ownerOverride,
  )
  for (const key of ['addedRows', 'strictRows', 'unclassifiedRows']) {
    assert.deepEqual(jsonDescriptor(fixture.snapshotPartition[key].rows), {
      jsonBytes: fixture.snapshotPartition[key].jsonBytes,
      sha256: fixture.snapshotPartition[key].sha256,
    })
  }
  assert.equal(fixture.snapshotPartition.ownerRows.count, 21)
  assert.equal(fixture.snapshotPartition.coverage.rows, 1)
  assert.match(
    fixture.inputs.frozenMutableSnapshot.readPolicy,
    /must not reopen mutable report or coverage/,
  )
})

test('proves the complete Target119 unit is the retained Target118 unit under alpha-renaming', () => {
  const baselineBundle = readPinned(fixture.inputs.bundles['2.1.118'])
  const targetBundle = readPinned(fixture.inputs.bundles['2.1.119'])
  const ledger = readLedger(fixture.inputs.ledgers['2.1.118-to-2.1.119'])
  assertRegion(ledger, fixture.wholeUnitPair.target)
  const baseline = slicePinned(baselineBundle, fixture.wholeUnitPair.baseline)
  const target = slicePinned(targetBundle, fixture.wholeUnitPair.target)
  assert.equal(tokenCount(baseline), fixture.wholeUnitPair.baseline.tokenCount)
  assert.equal(tokenCount(target), fixture.wholeUnitPair.target.tokenCount)
  assert.deepEqual(
    canonicalDescriptor(parseProgram(baseline)),
    fixture.wholeUnitPair.canonicalProgram,
  )
  assert.deepEqual(
    canonicalDescriptor(parseProgram(target)),
    fixture.wholeUnitPair.canonicalProgram,
  )
  for (const [source, expected] of [
    [baseline.toString(), fixture.wholeUnitPair.baseline],
    [target.toString(), fixture.wholeUnitPair.target],
  ]) {
    const cache = walk(
      parseProgram(source),
      node =>
        node.type === 'CallExpression' &&
        node.callee?.type === 'MemberExpression' &&
        node.callee.property?.name === 'c',
    ).map(({ node }) => ({
      ...nodeDescriptor(source, node, expected.start),
      size: node.arguments[0]?.value,
    }))
    assert.deepEqual(cache, [expected.cacheCall])
  }
})

test('pins every apparent added residue to the same baseline subtree', () => {
  const bundles = {
    baseline: readPinned(fixture.inputs.bundles['2.1.118']),
    target: readPinned(fixture.inputs.bundles['2.1.119']),
  }
  const programs = {}
  for (const side of ['baseline', 'target']) {
    const expected = fixture.wholeUnitPair[side]
    const source = slicePinned(bundles[side], expected).toString()
    programs[side] = { source, expected, program: parseProgram(source) }
  }
  for (const residue of fixture.wholeUnitPair.retainedResidues) {
    for (const side of ['baseline', 'target']) {
      const { source, expected, program } = programs[side]
      const nodes = walk(
        program,
        node =>
          (residue.name === 'lower' &&
            node.type === 'Literal' &&
            node.value === 'lower') ||
          (residue.name !== 'lower' &&
            node.type === 'Property' &&
            node.computed === false &&
            (node.key.name ?? node.key.value) === residue.name),
      ).map(({ node }) =>
        residue.name === 'lower' ? node : node.key,
      )
      assert.equal(nodes.length, 1, `${side}:${residue.name}`)
      assert.deepEqual(
        nodeDescriptor(source, nodes[0], expected.start),
        residue[side],
      )
    }
  }

  for (const side of ['baseline', 'target']) {
    const { source, expected, program } = programs[side]
    const calls = walk(
      program,
      node =>
        node.type === 'CallExpression' &&
        walk(
          node,
          candidate =>
            candidate.type === 'Property' &&
            (candidate.key.name ?? candidate.key.value) === 'chord',
        ).length > 0,
    ).map(({ node }) => node)
    calls.sort((left, right) => left.end - left.start - (right.end - right.start))
    const call = calls[0]
    assert.deepEqual(
      nodeDescriptor(source, call, expected.start),
      fixture.wholeUnitPair.keyboardCall[side],
    )
    assert.deepEqual(
      canonicalDescriptor(call),
      fixture.wholeUnitPair.keyboardCall.canonical,
    )
    const props = walk(
      call,
      node => node.type === 'Property' && node.computed === false,
    ).map(({ node }) => node.key.name ?? node.key.value)
    assert.deepEqual(props, fixture.wholeUnitPair.keyboardCall.properties)
  }
})

test('authenticates the retained chord-and-format KeyboardShortcutHint runtime dependency', () => {
  const baselineBundle = readPinned(fixture.inputs.bundles['2.1.118'])
  const targetBundle = readPinned(fixture.inputs.bundles['2.1.119'])
  const ledger = readLedger(fixture.inputs.ledgers['2.1.118-to-2.1.119'])
  assertRegion(ledger, fixture.keyboardRuntimeBoundary.target)
  for (const [bundle, expected] of [
    [baselineBundle, fixture.keyboardRuntimeBoundary.baseline],
    [targetBundle, fixture.keyboardRuntimeBoundary.target],
  ]) {
    const source = slicePinned(bundle, expected)
    const program = parseProgram(source)
    assert.equal(tokenCount(source), expected.tokenCount)
    assert.deepEqual(
      canonicalDescriptor(program),
      fixture.keyboardRuntimeBoundary.canonicalProgram,
    )
    const functionNode = program.body[0]
    const patterns = walk(
      functionNode,
      node => node.type === 'ObjectPattern',
    ).map(({ node }) => node)
    const props = patterns
      .flatMap(pattern => pattern.properties)
      .map(property => property.key.name)
      .filter(name => fixture.keyboardRuntimeBoundary.props.includes(name))
    assert.deepEqual(props, fixture.keyboardRuntimeBoundary.props)
    const cacheSizes = walk(
      program,
      node =>
        node.type === 'CallExpression' &&
        node.callee?.type === 'MemberExpression' &&
        node.callee.property?.name === 'c',
    ).map(({ node }) => node.arguments[0].value)
    assert.deepEqual(cacheSizes, [fixture.keyboardRuntimeBoundary.cacheSize])
  }
})

test('proves the Target119 authored caller and dependency graph is stale in raw and package mode', () => {
  for (const component of ['caller', 'dependency']) {
    const expected = fixture.sourceBoundary[component]
    const cooked = fs.readFileSync(sourceFilename(expected.path), 'utf8')
    assert.deepEqual(sourceDescriptor(cooked), expected.cooked)
    for (const commit of fixture.sourceBoundary.commits) {
      assert.equal(gitBlob(commit, expected.path), expected.blob)
      assert.equal(gitText(commit, expected.path), cooked)
    }
    const raw = sourceMapContent(cooked)
    assert.deepEqual(sourceDescriptor(raw), expected.raw)
  }

  const callerExpected = fixture.sourceBoundary.caller
  const caller = fs.readFileSync(sourceFilename(callerExpected.path), 'utf8')
  const callerFile = parseSource(callerExpected.path, caller)
  const callerDeclaration = namedDeclaration(callerFile, 'SessionBackgroundHint')
  const callerCacheSizes = []
  function visitCaller(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === '_c'
    ) {
      callerCacheSizes.push(Number(node.arguments[0].text))
    }
    ts.forEachChild(node, visitCaller)
  }
  visitCaller(callerDeclaration)
  assert.deepEqual(
    {
      ...tsNodeDescriptor(callerFile, caller, callerDeclaration),
      cacheSize: callerCacheSizes[0],
    },
    callerExpected.cookedDeclaration,
  )
  const callerJsx = shortcutJsx(callerFile, callerDeclaration)
  assert.equal(callerJsx.length, 1)
  assert.deepEqual(
    callerJsx[0].attributes.properties.map(attribute =>
      attribute.name.getText(callerFile),
    ),
    callerExpected.staleShortcutJsx.attributes,
  )
  assert.deepEqual(
    tsNodeDescriptor(callerFile, caller, callerJsx[0]),
    callerExpected.staleShortcutJsx.cooked,
  )
  const rawCaller = sourceMapContent(caller)
  const rawCallerFile = parseSource(callerExpected.path, rawCaller)
  const rawDeclaration = namedDeclaration(rawCallerFile, 'SessionBackgroundHint')
  assert.deepEqual(
    tsNodeDescriptor(rawCallerFile, rawCaller, rawDeclaration),
    callerExpected.rawDeclaration,
  )
  assert.deepEqual(
    tsNodeDescriptor(
      rawCallerFile,
      rawCaller,
      shortcutJsx(rawCallerFile, rawDeclaration)[0],
    ),
    callerExpected.staleShortcutJsx.raw,
  )

  const dependencyExpected = fixture.sourceBoundary.dependency
  const dependency = fs.readFileSync(
    sourceFilename(dependencyExpected.path),
    'utf8',
  )
  const dependencyFile = parseSource(dependencyExpected.path, dependency)
  assert.deepEqual(propsNames(dependencyFile), dependencyExpected.declaredProps)
  for (const missing of dependencyExpected.missingProps) {
    assert.equal(propsNames(dependencyFile).includes(missing), false)
  }
})

test('proves the retained whole unit persists through Target120 and Target121', () => {
  for (const expected of fixture.crossReleaseLineage) {
    const ledger = readLedger(fixture.inputs.ledgers[expected.case])
    assertRegion(ledger, expected)
    const bundle = readPinned(fixture.inputs.bundles[expected.version])
    const source = slicePinned(bundle, expected)
    assert.equal(tokenCount(source), fixture.wholeUnitPair.target.tokenCount)
    assert.deepEqual(
      canonicalDescriptor(parseProgram(source)),
      fixture.wholeUnitPair.canonicalProgram,
    )
  }
})

test('rejects the semantically later source graph and remains static-only', async () => {
  const later = fixture.sourceBoundary.laterSource
  for (const component of ['caller', 'dependency']) {
    const expected = later[component]
    const pathName = fixture.sourceBoundary[component].path
    assert.equal(gitBlob(later.commit, pathName), expected.blob)
    const source = gitText(later.commit, pathName)
    assert.deepEqual(sourceDescriptor(source), expected.file)
    const sourceFile = parseSource(pathName, source)
    const declaration = namedDeclaration(
      sourceFile,
      component === 'caller' ? 'SessionBackgroundHint' : 'KeyboardShortcutHint',
    )
    assert.deepEqual(
      tsNodeDescriptor(sourceFile, source, declaration),
      expected.declaration,
    )
    if (component === 'caller') {
      assert.deepEqual(propsNames(sourceFile), expected.props)
      assert.deepEqual(
        shortcutJsx(sourceFile, declaration)[0].attributes.properties.map(
          attribute => attribute.name.getText(sourceFile),
        ),
        expected.shortcutAttributes,
      )
      assert.ok(expected.semanticDrift.length >= 4)
    }
  }
  assert.deepEqual(fixture.decision, {
    mode: 'static-owner-proof-only',
    sourceReplay: false,
    sourceFilesChanged: 0,
    replayExport: null,
    requiredOrder: null,
    expectedStrictImpact: { units: -1, residues: -1 },
    reason:
      'The runtime delta is entirely retained from Target118, while the available Target119 source graph is stale and the later source graph changes unrelated lifecycle semantics; no authenticated graph-closed Target119 replay exists.',
  })
  const helper = await import(
    '../cases/2.1.118-to-2.1.119/recovered/session-background-hint-retained-owner-overrides.mjs'
  )
  assert.equal(
    Object.hasOwn(helper, 'replayTarget119SessionBackgroundHint'),
    false,
  )
})
