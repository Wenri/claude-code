import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import * as ownerProofModule from '../cases/2.1.120-to-2.1.121/recovered/memory-write-survey-hook-owner-overrides.mjs'

const {
  TARGET121_MEMORY_WRITE_SURVEY_HOOK_EVIDENCE_IDS,
  TARGET121_MEMORY_WRITE_SURVEY_HOOK_OWNER_OVERRIDES,
} = ownerProofModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const gitEvidenceRepositoryRoot = path.resolve(
  process.env.CLAUDE_CODE_2_1_121_REPOSITORY_ROOT ?? repositoryRoot,
)
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-memory-write-survey-hook-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'd6166a170200b994638966ca3a96cb3d376c2214604f7aa711edc7d5e8c4021e'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function expectedDescriptor(expected) {
  return { bytes: expected.bytes, sha256: expected.sha256 }
}

function canonicalDigest(value) {
  return descriptor(Buffer.from(JSON.stringify(value)))
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), expectedDescriptor(expected), label)
  return bytes
}

function matchExactSnapshot(actual, snapshots, label) {
  const matches = Object.entries(snapshots).filter(([, expected]) =>
    Object.entries(expectedDescriptor(expected)).every(
      ([key, value]) => actual[key] === value,
    ),
  )
  assert.equal(
    matches.length,
    1,
    `${label}: unsupported exact snapshot ${actual.bytes}/${actual.sha256}`,
  )
  return { expected: matches[0][1], state: matches[0][0] }
}

function readExactSnapshot(filename, snapshots, label) {
  const bytes = fs.readFileSync(filename)
  return { bytes, ...matchExactSnapshot(descriptor(bytes), snapshots, label) }
}

function commonSnapshotPath(snapshots) {
  const paths = [...new Set(Object.values(snapshots).map(row => row.path))]
  assert.equal(paths.length, 1, 'evolution snapshots must share one path')
  return path.join(repositoryRoot, paths[0])
}

function localEvolutionState(state) {
  if (state === 'provisional') {
    return {
      ownerResidues: fixture.ownerResidues,
      sourceCoverageClaim: fixture.sourceCoverageClaim,
    }
  }
  const value = fixture[state]
  assert.ok(value, `local evolution state ${state}`)
  if (value.projection) return localEvolutionState(value.projection)
  return value
}

function assertCompatibleEvolutionPair(reportState, coverageState) {
  assert.equal(
    (fixture.inputs.evolutionCompatibility[reportState] ?? []).includes(
      coverageState,
    ),
    true,
    `unsupported report/coverage hybrid ${reportState}/${coverageState}`,
  )
}

function exactBufferSlice(bytes, expected, label) {
  const value = bytes.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(value), expectedDescriptor(expected), label)
  if (expected.exact !== undefined) {
    assert.equal(value.toString('utf8'), expected.exact, label)
  }
  return value.toString('utf8')
}

function artifactPath(environmentName, expected) {
  return path.resolve(
    process.env[environmentName] ?? path.join(repositoryRoot, expected.path),
  )
}

function baselineSourceRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_120_SOURCE_ROOT ??
      path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.120/src'),
  )
}

function targetSourceRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_121_SOURCE_ROOT ??
      process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
      path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.121/src'),
  )
}

function freshPackageSourceRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_121_FRESH_PACKAGE_SOURCE_ROOT ??
      fixture.sourceState.freshPackage.defaultSourceRoot,
  )
}

function sourceFilename(root, sourcePath) {
  assert.ok(sourcePath.startsWith('src/'))
  return path.join(root, sourcePath.slice(4))
}

function countOccurrences(source, needle) {
  let count = 0
  let offset = 0
  while (true) {
    const next = source.indexOf(needle, offset)
    if (next < 0) return count
    count += 1
    offset = next + needle.length
  }
}

function occurrenceStarts(source, needle) {
  const starts = []
  let offset = 0
  while (true) {
    const next = source.indexOf(needle, offset)
    if (next < 0) return starts
    starts.push(next)
    offset = next + needle.length
  }
}

function walk(node, visit, currentPath = [], parent = null, key = null) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach((child, index) =>
      walk(child, visit, [...currentPath, index], parent, index),
    )
    return
  }
  if (typeof node.type === 'string') visit(node, currentPath, parent, key)
  for (const [childKey, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start'].includes(childKey)) {
      walk(child, visit, [...currentPath, childKey], node, childKey)
    }
  }
}

function canonicalize(value, parent = null, key = null) {
  if (Array.isArray(value)) {
    return value.map((child, index) => canonicalize(child, parent, index))
  }
  if (value === null || typeof value !== 'object') return value
  const result = {}
  for (const [childKey, child] of Object.entries(value)) {
    if (['end', 'loc', 'range', 'raw', 'start'].includes(childKey)) continue
    if (value.type === 'Identifier' && childKey === 'name') {
      const preserve =
        (parent?.type === 'MemberExpression' &&
          key === 'property' &&
          !parent.computed) ||
        (parent?.type === 'Property' &&
          key === 'key' &&
          !parent.computed &&
          !parent.shorthand) ||
        (parent?.type === 'MethodDefinition' &&
          key === 'key' &&
          !parent.computed) ||
        (parent?.type === 'PropertyDefinition' &&
          key === 'key' &&
          !parent.computed)
      result[childKey] = preserve ? child : '@id'
    } else {
      result[childKey] = canonicalize(child, value, childKey)
    }
  }
  return result
}

function canonicalDescriptor(node) {
  return canonicalDigest(canonicalize(node))
}

function normalizedToken(token) {
  return [
    token.type.label,
    token.type.label === 'name' ? '@id' : (token.value ?? null),
  ]
}

function parseUnit(bundle, expected, label) {
  const source = exactBufferSlice(bundle, expected, label)
  const program = parse(source, { ecmaVersion: 'latest' })
  assert.equal(program.body.length, 1, `${label}: one top-level unit`)
  const node = program.body[0]
  assert.equal(node.type, expected.nodeType)
  if (expected.bodyStatementCount !== undefined) {
    assert.equal(node.body.body.length, expected.bodyStatementCount)
  }
  const tokens = [...tokenizer(source, { ecmaVersion: 'latest' })]
  assert.equal(tokens.length, expected.tokenCount)
  return { node, source, tokens, unitStart: expected.start }
}

function assertBundleNode(unit, expected, label) {
  const matches = []
  walk(unit.node, (node, nodePath) => {
    if (
      node.type === expected.nodeType &&
      node.start === expected.localStart &&
      node.end === expected.localEnd
    ) {
      matches.push({ node, path: nodePath.join('.') })
    }
  })
  assert.equal(matches.length, 1, `${label}: unique node`)
  assert.equal(matches[0].path, expected.path)
  const raw = unit.source.slice(matches[0].node.start, matches[0].node.end)
  assert.deepEqual(descriptor(raw), expectedDescriptor(expected), label)
  assert.equal(raw, expected.exact, label)
  return matches[0].node
}

function lcsAlignmentRuns(left, right) {
  const rows = Array.from(
    { length: left.length + 1 },
    () => new Uint16Array(right.length + 1),
  )
  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (
      let rightIndex = right.length - 1;
      rightIndex >= 0;
      rightIndex -= 1
    ) {
      rows[leftIndex][rightIndex] =
        left[leftIndex] === right[rightIndex]
          ? rows[leftIndex + 1][rightIndex + 1] + 1
          : Math.max(
              rows[leftIndex + 1][rightIndex],
              rows[leftIndex][rightIndex + 1],
            )
    }
  }
  let leftIndex = 0
  let rightIndex = 0
  const operations = []
  while (leftIndex < left.length || rightIndex < right.length) {
    if (
      leftIndex < left.length &&
      rightIndex < right.length &&
      left[leftIndex] === right[rightIndex]
    ) {
      operations.push('=')
      leftIndex += 1
      rightIndex += 1
    } else if (
      rightIndex < right.length &&
      (leftIndex === left.length ||
        rows[leftIndex][rightIndex + 1] >= rows[leftIndex + 1][rightIndex])
    ) {
      operations.push('+')
      rightIndex += 1
    } else {
      operations.push('-')
      leftIndex += 1
    }
  }
  const runs = []
  for (const operation of operations) {
    if (runs.at(-1)?.[0] === operation) runs.at(-1)[1] += 1
    else runs.push([operation, 1])
  }
  return { equalTokens: rows[0][0], runs }
}

function assertTargetLedgerUnit(ledger, expected) {
  const region = ledger.regions.find(
    row => row.target?.index === expected.targetIndex,
  )
  assert.ok(region, `u${expected.targetIndex}`)
  assert.deepEqual(
    {
      classification: region.classification,
      unknownFreeIdentifierCount: region.unknownFreeIdentifierCount,
      nodeType: region.target.nodeType,
      parseStatus: region.target.parseStatus,
      start: region.target.start,
      end: region.target.end,
      tokenCount: region.target.tokenCount,
      sourceHash: region.target.sourceHash,
      coarseHash: region.target.coarseHash,
      topDefinitionCount: region.target.topDefinitionCount,
    },
    {
      classification: expected.classification,
      unknownFreeIdentifierCount: expected.unknownFreeIdentifierCount,
      nodeType: expected.nodeType,
      parseStatus: expected.parseStatus,
      start: expected.start,
      end: expected.end,
      tokenCount: expected.tokenCount,
      sourceHash: expected.sha256,
      coarseHash: expected.coarseHash,
      topDefinitionCount: expected.topDefinitionCount,
    },
  )
}

function assertBaselineLedgerUnit(ledger, expected) {
  const unit = ledger.unmatchedBaseline.find(
    row => row.index === expected.baselineUnitIndex,
  )
  assert.ok(unit, `baseline u${expected.baselineUnitIndex}`)
  assert.deepEqual(
    {
      nodeType: unit.nodeType,
      parseStatus: unit.parseStatus,
      start: unit.start,
      end: unit.end,
      tokenCount: unit.tokenCount,
      sourceHash: unit.sourceHash,
      coarseHash: unit.coarseHash,
      topDefinitionCount: unit.topDefinitionCount,
    },
    {
      nodeType: expected.nodeType,
      parseStatus: expected.parseStatus,
      start: expected.start,
      end: expected.end,
      tokenCount: expected.tokenCount,
      sourceHash: expected.sha256,
      coarseHash: expected.coarseHash,
      topDefinitionCount: expected.topDefinitionCount,
    },
  )
}

function typescript() {
  return require(
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  )
}

function findTsNodes(ts, root, predicate) {
  const matches = []
  function visit(node) {
    if (predicate(node)) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(root)
  return matches
}

function tsNodeDescriptor(ts, sourceFile, source, node, expected, extra = {}) {
  const start = node.getStart(sourceFile)
  const end = node.end
  const text = source.slice(start, end)
  const { exact, ...nodeExpected } = expected
  assert.deepEqual(
    {
      start,
      end,
      chars: text.length,
      ...descriptor(text),
      line: sourceFile.getLineAndCharacterOfPosition(start).line + 1,
      endLine: sourceFile.getLineAndCharacterOfPosition(end).line + 1,
      ...extra,
    },
    nodeExpected,
  )
  if (exact !== undefined) assert.equal(text, exact)
  return text
}

function parseTsFile(ts, root, sourcePath, expected, kind) {
  const filename = sourceFilename(root, sourcePath)
  const bytes = readExact(filename, expected, filename)
  const source = bytes.toString('utf8')
  assert.equal(source.length, expected.chars)
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    kind,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  return { filename, source, sourceFile }
}

function markerCounts(source, expected) {
  return Object.fromEntries(
    Object.keys(expected).map(marker => [marker, countOccurrences(source, marker)]),
  )
}

function ownerSourceEvidence(ts, root, fileExpected) {
  const parsed = parseTsFile(
    ts,
    root,
    fixture.sourceState.path,
    fileExpected,
    ts.ScriptKind.TS,
  )
  const hooks = findTsNodes(
    ts,
    parsed.sourceFile,
    node =>
      ts.isFunctionDeclaration(node) &&
      node.name?.text === fixture.sourceState.functionName,
  )
  assert.equal(hooks.length, 1)
  const hook = hooks[0]
  tsNodeDescriptor(
    ts,
    parsed.sourceFile,
    parsed.source,
    hook,
    fixture.sourceState.hook,
    {
      parameterCount: hook.parameters.length,
      bodyStatementCount: hook.body.statements.length,
    },
  )
  const stateTypes = findTsNodes(
    ts,
    parsed.sourceFile,
    node => ts.isTypeAliasDeclaration(node) && node.name.text === 'MemoryWriteSurveyState',
  )
  assert.equal(stateTypes.length, 1)
  const stateType = stateTypes[0]
  assert.ok(ts.isTypeLiteralNode(stateType.type))
  const stateNames = stateType.type.members
    .map(member => member.name?.getText(parsed.sourceFile))
    .filter(Boolean)
  tsNodeDescriptor(
    ts,
    parsed.sourceFile,
    parsed.source,
    stateType,
    fixture.sourceState.stateType,
    {
      memberCount: stateNames.length,
      memberNames: canonicalDigest(stateNames),
    },
  )
  const closed = findTsNodes(
    ts,
    parsed.sourceFile,
    node => ts.isVariableDeclaration(node) && node.name.getText(parsed.sourceFile) === 'CLOSED_STATE',
  )
  assert.equal(closed.length, 1)
  assert.ok(ts.isObjectLiteralExpression(closed[0].initializer))
  const closedNames = closed[0].initializer.properties
    .map(property => property.name?.getText(parsed.sourceFile))
    .filter(Boolean)
  tsNodeDescriptor(
    ts,
    parsed.sourceFile,
    parsed.source,
    closed[0],
    fixture.sourceState.closedState,
    {
      memberCount: closedNames.length,
      memberNames: canonicalDigest(closedNames),
    },
  )
  const countCalls = findTsNodes(
    ts,
    hook,
    node =>
      ts.isCallExpression(node) &&
      node.expression.getText(parsed.sourceFile) === 'countMemoryWriteLines',
  )
  assert.equal(countCalls.length, 1)
  tsNodeDescriptor(
    ts,
    parsed.sourceFile,
    parsed.source,
    countCalls[0],
    fixture.sourceState.logicalCountCall,
    { argumentCount: countCalls[0].arguments.length },
  )
  const close = findTsNodes(
    ts,
    hook,
    node => ts.isVariableDeclaration(node) && node.name.getText(parsed.sourceFile) === 'close',
  )
  assert.equal(close.length, 1)
  tsNodeDescriptor(
    ts,
    parsed.sourceFile,
    parsed.source,
    close[0],
    fixture.sourceState.close,
  )
  assert.equal(countOccurrences(close[0].getText(parsed.sourceFile), 'removeRecord'), 2)
  const cleanups = findTsNodes(
    ts,
    hook,
    node =>
      ts.isCallExpression(node) &&
      node.expression.getText(parsed.sourceFile) === 'useEffect' &&
      node.arguments[0]?.getText(parsed.sourceFile).startsWith('() => () =>'),
  )
  assert.equal(cleanups.length, 1)
  tsNodeDescriptor(
    ts,
    parsed.sourceFile,
    parsed.source,
    cleanups[0],
    fixture.sourceState.cleanup,
  )
  const returns = findTsNodes(
    ts,
    hook,
    node =>
      ts.isReturnStatement(node) &&
      node.expression &&
      ts.isObjectLiteralExpression(node.expression) &&
      node.expression.properties.some(
        property => property.name?.getText(parsed.sourceFile) === 'state',
      ),
  )
  assert.equal(returns.length, 1)
  const returnNames = returns[0].expression.properties
    .map(property => property.name?.getText(parsed.sourceFile))
    .filter(Boolean)
  tsNodeDescriptor(
    ts,
    parsed.sourceFile,
    parsed.source,
    returns[0],
    fixture.sourceState.openReturn,
    {
      memberCount: returnNames.length,
      memberNames: canonicalDigest(returnNames),
    },
  )
  assert.deepEqual(markerCounts(parsed.source, fixture.sourceState.markerCounts), fixture.sourceState.markerCounts)
  assert.equal(stateNames.includes('postReject'), false)
  assert.equal(closedNames.includes('postReject'), false)
  assert.equal(returnNames.includes('lineCount'), true)
  assert.equal(returnNames.includes('postReject'), false)
  return parsed.source
}

function reportedSourceEvidence(ts, root) {
  const expected = fixture.sourceState.reportedSource
  const parsed = parseTsFile(
    ts,
    root,
    expected.path,
    expected.file,
    ts.ScriptKind.TSX,
  )
  const declarations = findTsNodes(
    ts,
    parsed.sourceFile,
    node => ts.isFunctionDeclaration(node) && node.name?.text === expected.functionName,
  )
  assert.equal(declarations.length, 1)
  tsNodeDescriptor(
    ts,
    parsed.sourceFile,
    parsed.source,
    declarations[0],
    expected.function,
    {
      parameterCount: declarations[0].parameters.length,
      bodyStatementCount: declarations[0].body.statements.length,
    },
  )
  assert.deepEqual(markerCounts(parsed.source, expected.markerCounts), expected.markerCounts)
}

function uiSourceEvidence(ts, root) {
  const expected = fixture.sourceState.memoryWriteSurveyUi
  const parsed = parseTsFile(
    ts,
    root,
    expected.path,
    expected.file,
    ts.ScriptKind.TSX,
  )
  const declarations = findTsNodes(
    ts,
    parsed.sourceFile,
    node =>
      ts.isVariableDeclaration(node) &&
      ['{ columns }', 'contentWidth'].includes(node.name.getText(parsed.sourceFile)),
  )
  assert.equal(declarations.length, 2)
  tsNodeDescriptor(ts, parsed.sourceFile, parsed.source, declarations[0], expected.columns)
  tsNodeDescriptor(ts, parsed.sourceFile, parsed.source, declarations[1], expected.contentWidth)
  assert.deepEqual(markerCounts(parsed.source, expected.markerCounts), expected.markerCounts)
}

function modelSourceEvidence(ts, root) {
  const expected = fixture.sourceState.memoryWriteSurveyModel
  const filename = sourceFilename(root, expected.path)
  const bytes = fs.readFileSync(filename)
  const state = expected.acceptedFileStates.find(
    candidate =>
      candidate.bytes === bytes.length && candidate.sha256 === sha256(bytes),
  )
  assert.ok(state, `${filename}: exact raw or producer-recovered source`)
  const source = bytes.toString('utf8')
  assert.equal(source.length, state.chars)
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  const declarations = findTsNodes(
    ts,
    sourceFile,
    node => ts.isFunctionDeclaration(node) && node.name?.text === 'countMemoryWriteLines',
  )
  assert.equal(declarations.length, 1)
  const declaration = declarations[0]
  const text = source.slice(declaration.getStart(sourceFile), declaration.end)
  assert.deepEqual(descriptor(text), expectedDescriptor(expected.logicalCountDeclaration))
  assert.equal(text, expected.logicalCountDeclaration.exact)
  assert.equal(declaration.parameters.length, expected.logicalCountDeclaration.parameterCount)
  assert.equal(countOccurrences(source, 'postReject'), 0)
}

function replSourceEvidence(ts, root) {
  const expected = fixture.sourceState.repl
  const parsed = parseTsFile(
    ts,
    root,
    expected.path,
    expected.target121File,
    ts.ScriptKind.TSX,
  )
  const calls = findTsNodes(
    ts,
    parsed.sourceFile,
    node =>
      ts.isCallExpression(node) &&
      node.expression.getText(parsed.sourceFile) === 'useMemoryWriteSurvey',
  )
  assert.equal(calls.length, 1)
  tsNodeDescriptor(
    ts,
    parsed.sourceFile,
    parsed.source,
    calls[0],
    expected.hookCall,
    { argumentCount: calls[0].arguments.length },
  )
  const elements = findTsNodes(
    ts,
    parsed.sourceFile,
    node =>
      ts.isJsxSelfClosingElement(node) &&
      node.tagName.getText(parsed.sourceFile) === 'MemoryWriteSurvey',
  )
  assert.equal(elements.length, 1)
  const attributeNames = elements[0].attributes.properties
    .map(property => property.name?.getText(parsed.sourceFile))
    .filter(Boolean)
  tsNodeDescriptor(
    ts,
    parsed.sourceFile,
    parsed.source,
    elements[0],
    expected.surveyJsx,
    {
      attributeCount: attributeNames.length,
      attributeNames: canonicalDigest(attributeNames),
    },
  )
  assert.deepEqual(markerCounts(parsed.source, expected.markerCounts), expected.markerCounts)
}

function git(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: gitEvidenceRepositoryRoot,
    encoding: options.encoding ?? 'utf8',
  })
  assert.equal(result.status, 0, result.stderr?.toString())
  return result.stdout
}

test(
  'Target121 memory-write hook fixture and static override are exact',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.targetUnit.targetIndex, 21015)
    assert.deepEqual(
      TARGET121_MEMORY_WRITE_SURVEY_HOOK_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(TARGET121_MEMORY_WRITE_SURVEY_HOOK_OWNER_OVERRIDES, [
      {
        key: `${caseName}:21015`,
        targetIndex: 21015,
        paths: [fixture.ownerResidues.correctedOwner],
        declarations: fixture.ownerResidues.declarations,
        evidenceIds: fixture.evidenceIds,
        behavior:
          TARGET121_MEMORY_WRITE_SURVEY_HOOK_OWNER_OVERRIDES[0].behavior,
      },
    ])
    assert.equal(Object.isFrozen(TARGET121_MEMORY_WRITE_SURVEY_HOOK_OWNER_OVERRIDES), true)
    assert.deepEqual(Object.keys(ownerProofModule).sort(), [
      'TARGET121_MEMORY_WRITE_SURVEY_HOOK_EVIDENCE_IDS',
      'TARGET121_MEMORY_WRITE_SURVEY_HOOK_OWNER_OVERRIDES',
    ])
    readExact(
      path.join(repositoryRoot, fixture.inputs.ownerOverride.path),
      fixture.inputs.ownerOverride,
    )
    assert.equal(fixture.generatorWiring.replayHelper, null)
    for (const snapshots of [
      fixture.inputs.typedReportSnapshots,
      fixture.inputs.sourceCoverageSnapshots,
    ]) {
      assert.equal(
        new Set(
          Object.values(snapshots).map(
            snapshot => `${snapshot.bytes}/${snapshot.sha256}`,
          ),
        ).size,
        Object.keys(snapshots).length,
      )
      for (const [state, snapshot] of Object.entries(snapshots)) {
        assert.equal(
          matchExactSnapshot(
            expectedDescriptor(snapshot),
            snapshots,
            `${state} contract`,
          ).state,
          state,
        )
      }
    }
    assert.doesNotThrow(() =>
      assertCompatibleEvolutionPair('provisional', 'provisional'),
    )
    assert.doesNotThrow(() =>
      assertCompatibleEvolutionPair('postFocusedBatch', 'postFocusedBatch'),
    )
    assert.doesNotThrow(() =>
      assertCompatibleEvolutionPair('postDaemonOwner', 'postDaemonOwner'),
    )
    assert.throws(
      () => assertCompatibleEvolutionPair('provisional', 'postFocusedBatch'),
      /unsupported report\/coverage hybrid/,
    )
    assert.throws(
      () => assertCompatibleEvolutionPair('postFocusedBatch', 'provisional'),
      /unsupported report\/coverage hybrid/,
    )
    assert.throws(
      () =>
        assertCompatibleEvolutionPair('postDaemonOwner', 'postFocusedBatch'),
      /unsupported report\/coverage hybrid/,
    )
  },
)

test(
  'u21015 ledger, frozen report partition, and provisional coverage are pinned',
  { skip: !selected },
  () => {
    const ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
          fixture.inputs.structuralLedger,
          'Target121 structural ledger',
        ),
      ),
    )
    assertTargetLedgerUnit(ledger, fixture.targetUnit)
    assertBaselineLedgerUnit(ledger, fixture.baselineSemanticCounterpart)
    for (const key of [
      'visualRowCounter',
      'contentWidth',
      'closedStateInitializer',
      'memoryWriteSurveyUi',
      'repl',
      'surveyObjectConsumer',
    ]) {
      assertTargetLedgerUnit(ledger, fixture.supportingUnits[key])
    }
    assertBaselineLedgerUnit(
      ledger,
      fixture.supportingUnits.baselineClosedStateInitializer,
    )
    assertBaselineLedgerUnit(
      ledger,
      fixture.supportingUnits.baselineSurveyObjectConsumer,
    )

    const reportSnapshot = readExactSnapshot(
      commonSnapshotPath(fixture.inputs.typedReportSnapshots),
      fixture.inputs.typedReportSnapshots,
      'Target121 typed report snapshot',
    )
    const reportState = localEvolutionState(reportSnapshot.state).ownerResidues
    const report = JSON.parse(reportSnapshot.bytes)
    const ownerRows = report.sourceRuntimeOwnerResidueRows.filter(
      row => row.structural.index === fixture.targetUnit.targetIndex,
    )
    const addedRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
      row => row.structural.index === fixture.targetUnit.targetIndex,
    )
    const strictRows = report.rows.filter(
      row => row.structural.index === fixture.targetUnit.targetIndex,
    )
    assert.equal(ownerRows.length, reportState.totalRows)
    assert.equal(addedRows.length, fixture.ownerResidues.targetAddedRows)
    assert.equal(strictRows.length, fixture.ownerResidues.strictRows)
    assert.ok(
      ownerRows.every(
        row =>
          JSON.stringify(row.ownerPaths) ===
          JSON.stringify([reportState.reportedOwner]),
      ),
    )
    const rowIdentities = ownerRows.map(row => [
      row.literalKind,
      row.value,
      row.target.start,
      row.target.end,
      row.baselineOccurrenceCount,
      row.targetOccurrenceNumber,
      row.targetAdded,
    ])
    if (reportState.allRowsExact) {
      assert.deepEqual(rowIdentities, reportState.allRowsExact)
    }
    assert.deepEqual(canonicalDigest(rowIdentities), reportState.rowIdentities)
    assert.deepEqual(
      canonicalDigest(
        ownerRows.map((row, index) => [
          ...rowIdentities[index],
          row.ownerPaths,
          row.ownerSourceMatches,
        ]),
      ),
      reportState.ownerIdentities,
    )
    const addedIdentities = addedRows.map(row => [
      row.literalKind,
      row.value,
      row.target.start,
      row.target.end,
      row.baselineOccurrenceCount,
      row.targetOccurrenceNumber,
      row.targetAdded,
    ])
    assert.deepEqual(addedIdentities, fixture.ownerResidues.targetAddedRowsExact)
    assert.deepEqual(
      canonicalDigest(addedIdentities),
      fixture.ownerResidues.targetAddedIdentities,
    )
    const strictIdentities = strictRows.map(row => [
      row.structural.index,
      row.literalKind,
      row.value,
      row.target.start,
      row.target.end,
      row.targetOccurrenceNumber,
    ])
    assert.deepEqual(strictIdentities, fixture.ownerResidues.strictRowsExact)
    assert.deepEqual(
      canonicalDigest(strictIdentities),
      fixture.ownerResidues.strictIdentities,
    )

    const coverageSnapshot = readExactSnapshot(
      commonSnapshotPath(fixture.inputs.sourceCoverageSnapshots),
      fixture.inputs.sourceCoverageSnapshots,
      'Target121 frozen source coverage',
    )
    assertCompatibleEvolutionPair(reportSnapshot.state, coverageSnapshot.state)
    const coverageState = localEvolutionState(
      coverageSnapshot.state,
    ).sourceCoverageClaim
    const rawCoverage = gunzipSync(coverageSnapshot.bytes)
    assert.deepEqual(descriptor(rawCoverage), {
      bytes: coverageSnapshot.expected.rawBytes,
      sha256: coverageSnapshot.expected.rawSha256,
    })
    const coverage = JSON.parse(rawCoverage)
    const rows = coverage.rows.filter(
      row => row.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert.deepEqual(rows, [coverageState.row])
    assert.deepEqual(
      canonicalDigest(rows[0]),
      coverageState.rowCanonical ?? coverageState.provisionalRow,
    )
    assert.deepEqual(
      coverage.owners.filter(owner => rows[0].ownerIds.includes(owner.id)),
      [coverageState.owner ?? coverageState.reportedOwner],
    )
  },
)

test(
  'complete bundles prove the predecessor and exact width/reject graph',
  { skip: !selected },
  () => {
    const baselineBundle = readExact(
      artifactPath(
        'CLAUDE_CODE_2_1_120_INNER_BUNDLE',
        fixture.inputs.baselineBundle,
      ),
      fixture.inputs.baselineBundle,
      'Target120 bundle',
    )
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_121_INNER_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'Target121 bundle',
    )
    const baseline = parseUnit(
      baselineBundle,
      fixture.baselineSemanticCounterpart,
      'Target120 useMemoryWriteSurvey predecessor',
    )
    const target = parseUnit(
      targetBundle,
      fixture.targetUnit,
      'Target121 useMemoryWriteSurvey',
    )
    assert.deepEqual(
      canonicalDescriptor(baseline.node),
      fixture.wholeUnitLineage.baselineCanonical,
    )
    assert.deepEqual(
      canonicalDescriptor(target.node),
      fixture.wholeUnitLineage.targetCanonical,
    )
    const alignment = lcsAlignmentRuns(
      baseline.tokens.map(token => JSON.stringify(normalizedToken(token))),
      target.tokens.map(token => JSON.stringify(normalizedToken(token))),
    )
    assert.deepEqual(alignment, {
      equalTokens: fixture.wholeUnitLineage.lcsAlignment.equalTokens,
      runs: fixture.wholeUnitLineage.lcsAlignment.runs,
    })
    assert.deepEqual(
      canonicalDigest(alignment.runs),
      fixture.wholeUnitLineage.lcsAlignment.runsDescriptor,
    )
    for (const key of [
      'columnsDeclarator',
      'contentWidthDeclarator',
      'visualRowCountCall',
      'postRejectState',
      'postRejectTimerRef',
      'effectGuard',
      'closeWithoutRemoval',
      'closeAndRemove',
      'cleanup',
      'openReturn',
      'postRejectProperty',
    ]) {
      assertBundleNode(target, fixture.compiledGraph[key], key)
    }
    for (const key of [
      'baselineLogicalCountCall',
      'baselineCloseAndRemove',
      'baselineOpenReturn',
    ]) {
      assertBundleNode(baseline, fixture.compiledGraph[key], key)
    }
    const identifierCounts = new Map([['j', 0], ['X', 0], ['J', 0]])
    walk(target.node, node => {
      if (node.type === 'Identifier' && identifierCounts.has(node.name)) {
        identifierCounts.set(node.name, identifierCounts.get(node.name) + 1)
      }
    })
    assert.deepEqual(Object.fromEntries(identifierCounts), {
      j: fixture.compiledGraph.postRejectIdentifierCounts.state.identifierNodes,
      X: fixture.compiledGraph.postRejectIdentifierCounts.setter.identifierNodes,
      J: fixture.compiledGraph.postRejectIdentifierCounts.timerRef.identifierNodes,
    })
    const setterCalls = []
    walk(target.node, node => {
      if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'X') {
        setterCalls.push(node)
      }
    })
    assert.deepEqual(setterCalls, [])

    const closed = parseUnit(
      targetBundle,
      fixture.supportingUnits.closedStateInitializer,
      'Target121 closed state initializer',
    )
    const ui = parseUnit(
      targetBundle,
      fixture.supportingUnits.memoryWriteSurveyUi,
      'Target121 MemoryWriteSurvey UI',
    )
    const repl = parseUnit(
      targetBundle,
      fixture.supportingUnits.repl,
      'Target121 REPL',
    )
    const consumer = parseUnit(
      targetBundle,
      fixture.supportingUnits.surveyObjectConsumer,
      'Target121 survey-object consumer',
    )
    const baselineConsumer = parseUnit(
      baselineBundle,
      fixture.supportingUnits.baselineSurveyObjectConsumer,
      'Target120 survey-object consumer',
    )
    assertBundleNode(closed, fixture.compiledGraph.closedStatePostReject, 'closed postReject')
    assertBundleNode(ui, fixture.compiledGraph.uiContentWidthCall, 'UI width call')
    assertBundleNode(repl, fixture.compiledGraph.replHookCall, 'REPL hook call')
    assert.deepEqual(
      occurrenceStarts(consumer.source, 'lineCount').map(
        start => consumer.unitStart + start,
      ),
      fixture.supportingUnits.surveyObjectConsumer.lineCountStarts,
    )
    assert.deepEqual(
      occurrenceStarts(consumer.source, 'postReject').map(
        start => consumer.unitStart + start,
      ),
      fixture.supportingUnits.surveyObjectConsumer.postRejectStarts,
    )
    assert.deepEqual(
      occurrenceStarts(baselineConsumer.source, 'lineCount').map(
        start => baselineConsumer.unitStart + start,
      ),
      fixture.supportingUnits.baselineSurveyObjectConsumer.lineCountStarts,
    )
    assert.deepEqual(
      occurrenceStarts(baselineConsumer.source, 'postReject').map(
        start => baselineConsumer.unitStart + start,
      ),
      fixture.supportingUnits.baselineSurveyObjectConsumer.postRejectStarts,
    )
    for (const [needle, starts] of [
      ['postReject', fixture.compiledGraph.targetBundleOccurrences.postReject],
      ['fT4(', fixture.compiledGraph.targetBundleOccurrences.hookName],
      ['ww8(', fixture.compiledGraph.targetBundleOccurrences.contentWidthName],
      ['INK(', fixture.compiledGraph.targetBundleOccurrences.visualRowCounterName],
    ]) {
      assert.deepEqual(occurrenceStarts(targetBundle.toString('utf8'), needle), starts)
    }
    assert.equal(countOccurrences(baselineBundle.toString('utf8'), 'postReject'), 0)
  },
)

test(
  'the exact authored hook proves the corrected owner and source omission',
  { skip: !selected },
  () => {
    const ts = typescript()
    const baselineSource = ownerSourceEvidence(
      ts,
      baselineSourceRoot(),
      fixture.sourceState.target120,
    )
    const targetSource = ownerSourceEvidence(
      ts,
      targetSourceRoot(),
      fixture.sourceState.target121,
    )
    assert.equal(baselineSource, targetSource)
    reportedSourceEvidence(ts, targetSourceRoot())
    for (const expected of [fixture.sourceState.target120, fixture.sourceState.target121]) {
      const tree = git(['ls-tree', expected.gitCommit, fixture.sourceState.path])
      assert.match(tree, new RegExp(`blob ${expected.gitBlob}\\s`))
      const blob = git(
        ['show', `${expected.gitCommit}:${fixture.sourceState.path}`],
        { encoding: null },
      )
      assert.deepEqual(descriptor(blob), expectedDescriptor(expected))
    }
  },
)

test(
  'authored producer and consumer files leave the compiled graph incomplete',
  { skip: !selected },
  () => {
    const ts = typescript()
    const root = targetSourceRoot()
    uiSourceEvidence(ts, root)
    modelSourceEvidence(ts, root)
    replSourceEvidence(ts, root)
    assert.equal(
      fixture.sourceReplayBlocker.decision,
      'static complete-unit owner proof only; no replay helper and no source writes',
    )
    assert.deepEqual(fixture.generatorWiring.expectedAddedOwnerImpact, {
      units: -1,
      residues: -2,
    })
    assert.deepEqual(fixture.generatorWiring.expectedRawStrictImpact, {
      units: -1,
      residues: -1,
    })
  },
)

test(
  'fresh Target121 package independently preserves the complete memory-write source blocker',
  { skip: !selected },
  t => {
    const root = freshPackageSourceRoot()
    if (!fs.existsSync(root)) {
      t.skip(`fresh Target121 package source is unavailable: ${root}`)
      return
    }
    const ts = typescript()
    const targetSource = ownerSourceEvidence(
      ts,
      targetSourceRoot(),
      fixture.sourceState.target121,
    )
    const freshSource = ownerSourceEvidence(
      ts,
      root,
      fixture.sourceState.target121,
    )
    assert.equal(targetSource, freshSource)
    reportedSourceEvidence(ts, root)
    uiSourceEvidence(ts, root)
    modelSourceEvidence(ts, root)
    replSourceEvidence(ts, root)
  },
)

test(
  'u21015 ownership is bounded away from adjacent strict obligations',
  { skip: !selected },
  () => {
    assert.equal(fixture.ownerResidues.strictRowsExact.length, 1)
    assert.equal(fixture.ownerResidues.strictRowsExact[0][2], 'postReject')
    assert.equal(fixture.ownerResidues.targetAddedRowsExact.length, 2)
    assert.deepEqual(
      fixture.compiledGraph.targetBundleOccurrences.postReject,
      [
        fixture.ownerResidues.strictRowsExact[0][3],
        fixture.compiledGraph.closedStatePostReject.start,
      ],
    )
    assert.notEqual(
      fixture.compiledGraph.closedStatePostReject.targetIndex,
      fixture.targetUnit.targetIndex,
    )
    assert.notEqual(
      fixture.compiledGraph.uiContentWidthCall.targetIndex,
      fixture.targetUnit.targetIndex,
    )
    assert.notEqual(
      fixture.compiledGraph.replHookCall.targetIndex,
      fixture.targetUnit.targetIndex,
    )
    assert.notEqual(
      fixture.supportingUnits.surveyObjectConsumer.targetIndex,
      fixture.targetUnit.targetIndex,
    )
    assert.match(fixture.compiledGraph.boundary, /remain distinct unit obligations/)
  },
)
