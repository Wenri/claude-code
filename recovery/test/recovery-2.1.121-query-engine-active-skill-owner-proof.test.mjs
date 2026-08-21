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
import * as ownerProofModule from '../cases/2.1.120-to-2.1.121/recovered/query-engine-active-skill-owner-overrides.mjs'

const {
  TARGET121_QUERY_ENGINE_ACTIVE_SKILL_EVIDENCE_IDS,
  TARGET121_QUERY_ENGINE_ACTIVE_SKILL_OWNER_OVERRIDES,
} = ownerProofModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-query-engine-active-skill-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '3240f047ee80a80f2447457437c7027bd953e58e5bf52ab76d7d0fd8772e87b1'

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

function coverageClaim(state) {
  if (state === 'provisional') return fixture.sourceCoverageClaim
  const local = fixture[state]
  if (local?.projection) return coverageClaim(local.projection)
  const value = local?.sourceCoverageClaim
  assert.ok(value, `source-coverage state ${state}`)
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
  if (typeof node.type === 'string') {
    visit(node, currentPath, parent, key)
  }
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
  assert.equal(node.body.body.length, expected.classMemberCount)
  const tokens = [...tokenizer(source, { ecmaVersion: 'latest' })]
  assert.equal(tokens.length, expected.tokenCount)
  return { node, source, tokens, unitStart: expected.start }
}

function findNode(unit, predicate, label) {
  const matches = []
  walk(unit.node, (node, nodePath, parent, key) => {
    const raw = unit.source.slice(node.start, node.end)
    if (predicate(node, raw)) {
      matches.push({ node, path: nodePath.join('.'), parent, key, raw })
    }
  })
  assert.equal(matches.length, 1, `${label}: unique AST node`)
  return matches[0]
}

function assertBundleNode(unit, expected, label) {
  const candidate = findNode(
    unit,
    node =>
      node.type === expected.nodeType &&
      unit.unitStart + node.start === expected.start &&
      unit.unitStart + node.end === expected.end,
    label,
  )
  assert.equal(candidate.node.start, expected.localStart)
  assert.equal(candidate.node.end, expected.localEnd)
  assert.equal(candidate.path, expected.path)
  if (expected.exact !== undefined) assert.equal(candidate.raw, expected.exact)
  assert.deepEqual(descriptor(candidate.raw), expectedDescriptor(expected))
  if (expected.canonicalBytes !== undefined) {
    assert.deepEqual(canonicalDescriptor(candidate.node), {
      bytes: expected.canonicalBytes,
      sha256: expected.canonicalSha256,
    })
  }
  return candidate
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
        rows[leftIndex][rightIndex + 1] >=
          rows[leftIndex + 1][rightIndex])
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
    const last = runs.at(-1)
    if (last?.[0] === operation) last[1] += 1
    else runs.push([operation, 1])
  }
  return { equalTokens: rows[0][0], runs }
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
    expected,
  )
  return text
}

function queryEngineSourceEvidence(ts, root, expected) {
  const filename = sourceFilename(root, fixture.sourceState.path)
  const bytes = readExact(filename, expected, filename)
  const source = bytes.toString('utf8')
  assert.equal(source.length, expected.chars)
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  const classes = findTsNodes(
    ts,
    sourceFile,
    node =>
      ts.isClassDeclaration(node) &&
      node.name?.text === fixture.sourceState.className,
  )
  assert.equal(classes.length, 1)
  const classNode = classes[0]
  const memberNames = classNode.members
    .map(member => member.name?.getText(sourceFile))
    .filter(Boolean)
  tsNodeDescriptor(ts, sourceFile, source, classNode, expected.class, {
    memberCount: classNode.members.length,
    memberNames: canonicalDigest(memberNames),
  })
  const method = classNode.members.find(
    member =>
      ts.isMethodDeclaration(member) &&
      member.name.getText(sourceFile) === fixture.sourceState.methodName,
  )
  assert.ok(method?.body)
  tsNodeDescriptor(ts, sourceFile, source, method, expected.submitMessage, {
    parameterCount: method.parameters.length,
    bodyStatementCount: method.body.statements.length,
  })
  const initialContexts = findTsNodes(
    ts,
    method,
    node =>
      ts.isVariableDeclaration(node) &&
      node.name.getText(sourceFile) === 'processUserInputContext',
  )
  assert.equal(initialContexts.length, 1)
  tsNodeDescriptor(
    ts,
    sourceFile,
    source,
    initialContexts[0],
    expected.initialContext,
    { type: initialContexts[0].type.getText(sourceFile) },
  )
  const assignments = findTsNodes(
    ts,
    method,
    node =>
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      node.left.getText(sourceFile) === 'processUserInputContext',
  )
  assert.equal(assignments.length, 1)
  const assignment = assignments[0]
  assert.ok(ts.isObjectLiteralExpression(assignment.right))
  const options = assignment.right.properties.find(
    property => property.name?.getText(sourceFile) === 'options',
  )
  assert.ok(options?.initializer && ts.isObjectLiteralExpression(options.initializer))
  const optionNames = options.initializer.properties
    .map(property => property.name?.getText(sourceFile))
    .filter(Boolean)
  tsNodeDescriptor(
    ts,
    sourceFile,
    source,
    assignment,
    expected.replacementAssignment,
    {
      left: assignment.left.getText(sourceFile),
      optionsMemberCount: optionNames.length,
      optionsMemberNames: canonicalDigest(optionNames),
    },
  )
  assert.equal(optionNames.includes('activeSkill'), false)
  for (const marker of ['activeSkill', 'spawnedBySkill']) {
    assert.equal(countOccurrences(source, marker), 0, `${filename}: ${marker}`)
  }
  return source
}

function toolUseContextEvidence(ts, root, expected) {
  const filename = sourceFilename(root, expected.path)
  const bytes = readExact(filename, expected.file, filename)
  const source = bytes.toString('utf8')
  assert.equal(source.length, expected.file.chars)
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
    node => ts.isTypeAliasDeclaration(node) && node.name.text === 'ToolUseContext',
  )
  assert.equal(declarations.length, 1)
  const declaration = declarations[0]
  assert.ok(ts.isTypeLiteralNode(declaration.type))
  tsNodeDescriptor(ts, sourceFile, source, declaration, expected.declaration, {
    memberCount: declaration.type.members.length,
  })
  const options = declaration.type.members.find(
    member => member.name?.getText(sourceFile) === 'options',
  )
  assert.ok(options?.type && ts.isTypeLiteralNode(options.type))
  const optionNames = options.type.members
    .map(member => member.name?.getText(sourceFile))
    .filter(Boolean)
  tsNodeDescriptor(ts, sourceFile, source, options.type, expected.optionsType, {
    memberCount: optionNames.length,
    memberNames: canonicalDigest(optionNames),
  })
  assert.equal(optionNames.includes('activeSkill'), false)
  assert.equal(optionNames.includes('spawnedBySkill'), false)
}

function processUserInputContextEvidence(ts, root, expected) {
  const filename = sourceFilename(root, expected.path)
  const bytes = readExact(filename, expected.file, filename)
  const source = bytes.toString('utf8')
  assert.equal(source.length, expected.file.chars)
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
    node =>
      ts.isTypeAliasDeclaration(node) &&
      node.name.text === 'ProcessUserInputContext',
  )
  assert.equal(declarations.length, 1)
  const { exact, ...nodeExpected } = expected.declaration
  const text = tsNodeDescriptor(
    ts,
    sourceFile,
    source,
    declarations[0],
    nodeExpected,
  )
  assert.equal(text, exact)
}

function sourceRootMarkerCounts(root) {
  const counts = Object.fromEntries(
    Object.keys(fixture.sourceState.sourceRootMarkerCounts).map(marker => [
      marker,
      0,
    ]),
  )
  const pending = [root]
  while (pending.length > 0) {
    const current = pending.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const filename = path.join(current, entry.name)
      if (entry.isDirectory()) pending.push(filename)
      else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
        const source = fs.readFileSync(filename, 'utf8')
        for (const marker of Object.keys(counts)) {
          counts[marker] += countOccurrences(source, marker)
        }
      }
    }
  }
  return counts
}

function git(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

test(
  'Target121 QueryEngine active-skill fixture and override are exact',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.targetUnit.targetIndex, 21925)
    assert.deepEqual(
      TARGET121_QUERY_ENGINE_ACTIVE_SKILL_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET121_QUERY_ENGINE_ACTIVE_SKILL_OWNER_OVERRIDES,
      [
        {
          key: `${caseName}:21925`,
          targetIndex: 21925,
          paths: [fixture.ownerResidues.correctedOwner],
          declarations: fixture.ownerResidues.declarations,
          evidenceIds: fixture.evidenceIds,
          behavior:
            TARGET121_QUERY_ENGINE_ACTIVE_SKILL_OWNER_OVERRIDES[0].behavior,
        },
      ],
    )
    assert.equal(
      Object.isFrozen(TARGET121_QUERY_ENGINE_ACTIVE_SKILL_OWNER_OVERRIDES),
      true,
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
    assert.deepEqual(Object.keys(ownerProofModule).sort(), [
      'TARGET121_QUERY_ENGINE_ACTIVE_SKILL_EVIDENCE_IDS',
      'TARGET121_QUERY_ENGINE_ACTIVE_SKILL_OWNER_OVERRIDES',
    ])
  },
)

test(
  'u21925 ledger, exact report partition, and provisional coverage row are pinned',
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
    const targetRegion = ledger.regions.find(
      row => row.target.index === fixture.targetUnit.targetIndex,
    )
    assert.ok(targetRegion)
    assert.equal(targetRegion.classification, fixture.targetUnit.classification)
    assert.equal(targetRegion.baselineUnitIndex, undefined)
    assert.deepEqual(
      {
        nodeType: targetRegion.target.nodeType,
        parseStatus: targetRegion.target.parseStatus,
        start: targetRegion.target.start,
        end: targetRegion.target.end,
        tokenCount: targetRegion.target.tokenCount,
        sourceHash: targetRegion.target.sourceHash,
        coarseHash: targetRegion.target.coarseHash,
        topDefinitionCount: targetRegion.target.topDefinitionCount,
        unknownFreeIdentifierCount: targetRegion.unknownFreeIdentifierCount,
      },
      {
        nodeType: fixture.targetUnit.nodeType,
        parseStatus: fixture.targetUnit.parseStatus,
        start: fixture.targetUnit.start,
        end: fixture.targetUnit.end,
        tokenCount: fixture.targetUnit.tokenCount,
        sourceHash: fixture.targetUnit.sha256,
        coarseHash: fixture.targetUnit.coarseHash,
        topDefinitionCount: fixture.targetUnit.topDefinitionCount,
        unknownFreeIdentifierCount: fixture.targetUnit.unknownFreeIdentifierCount,
      },
    )
    const baselineRegion = ledger.unmatchedBaseline.find(
      row => row.index === fixture.baselineSemanticCounterpart.baselineUnitIndex,
    )
    assert.ok(baselineRegion)
    assert.deepEqual(
      {
        nodeType: baselineRegion.nodeType,
        parseStatus: baselineRegion.parseStatus,
        start: baselineRegion.start,
        end: baselineRegion.end,
        tokenCount: baselineRegion.tokenCount,
        sourceHash: baselineRegion.sourceHash,
        coarseHash: baselineRegion.coarseHash,
        topDefinitionCount: baselineRegion.topDefinitionCount,
      },
      {
        nodeType: fixture.baselineSemanticCounterpart.nodeType,
        parseStatus: fixture.baselineSemanticCounterpart.parseStatus,
        start: fixture.baselineSemanticCounterpart.start,
        end: fixture.baselineSemanticCounterpart.end,
        tokenCount: fixture.baselineSemanticCounterpart.tokenCount,
        sourceHash: fixture.baselineSemanticCounterpart.sha256,
        coarseHash: fixture.baselineSemanticCounterpart.coarseHash,
        topDefinitionCount:
          fixture.baselineSemanticCounterpart.topDefinitionCount,
      },
    )

    const reportSnapshot = readExactSnapshot(
      commonSnapshotPath(fixture.inputs.typedReportSnapshots),
      fixture.inputs.typedReportSnapshots,
      'Target121 typed report snapshot',
    )
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
    assert.equal(ownerRows.length, fixture.ownerResidues.totalRows)
    assert.equal(addedRows.length, fixture.ownerResidues.targetAddedRows)
    assert.equal(strictRows.length, fixture.ownerResidues.strictRows)
    assert.ok(
      ownerRows.every(
        row =>
          JSON.stringify(row.ownerPaths) ===
            JSON.stringify([fixture.ownerResidues.reportedOwner]) &&
          row.ownerSourceMatches.length === 0,
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
    assert.deepEqual(canonicalDigest(rowIdentities), fixture.ownerResidues.rowIdentities)
    assert.deepEqual(
      canonicalDigest(
        ownerRows.map((row, index) => [
          ...rowIdentities[index],
          row.ownerPaths,
          row.ownerSourceMatches,
        ]),
      ),
      fixture.ownerResidues.ownerIdentities,
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
    const addedKeys = new Set(
      addedRows.map(row =>
        JSON.stringify([
          row.literalKind,
          row.value,
          row.target.start,
          row.target.end,
          row.targetOccurrenceNumber,
        ]),
      ),
    )
    assert.ok(
      strictRows.every(row =>
        addedKeys.has(
          JSON.stringify([
            row.literalKind,
            row.value,
            row.target.start,
            row.target.end,
            row.targetOccurrenceNumber,
          ]),
        ),
      ),
    )

    const coverageSnapshot = readExactSnapshot(
      commonSnapshotPath(fixture.inputs.sourceCoverageSnapshots),
      fixture.inputs.sourceCoverageSnapshots,
      'Target121 source-coverage snapshot',
    )
    assertCompatibleEvolutionPair(reportSnapshot.state, coverageSnapshot.state)
    const coverageState = coverageClaim(coverageSnapshot.state)
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
      coverageState.rowCanonical,
    )
    assert.deepEqual(
      coverage.owners.filter(owner => rows[0].ownerIds.includes(owner.id)),
      [coverageState.owner],
    )
  },
)

test(
  'complete-class lineage proves exact active-skill capture and restore',
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
      'Target120 QueryEngine predecessor',
    )
    const target = parseUnit(targetBundle, fixture.targetUnit, 'Target121 u21925')
    assert.equal(
      fixture.targetUnit.bytes - fixture.baselineSemanticCounterpart.bytes,
      fixture.wholeUnitLineage.rawByteDelta,
    )
    assert.equal(
      fixture.targetUnit.tokenCount -
        fixture.baselineSemanticCounterpart.tokenCount,
      fixture.wholeUnitLineage.tokenDelta,
    )
    assert.deepEqual(
      canonicalDescriptor(baseline.node),
      fixture.wholeUnitLineage.baselineCanonical,
    )
    assert.deepEqual(
      canonicalDescriptor(target.node),
      fixture.wholeUnitLineage.targetCanonical,
    )

    const expected = fixture.wholeUnitLineage.captureRestore
    const declaration = assertBundleNode(
      target,
      expected.captureDeclaration,
      'capture declaration',
    )
    const capture = assertBundleNode(
      target,
      expected.captureDeclarator,
      'capture declarator',
    )
    const replacement = assertBundleNode(
      target,
      expected.replacementAssignment,
      'replacement assignment',
    )
    const restore = assertBundleNode(
      target,
      expected.restoreProperty,
      'restore property',
    )
    assertBundleNode(
      baseline,
      expected.baselineModelDeclaration,
      'baseline model declaration',
    )
    assertBundleNode(
      baseline,
      expected.baselineReplacementAssignment,
      'baseline replacement assignment',
    )
    assert.equal(declaration.node.declarations.length, 2)
    assert.equal(declaration.node.declarations[1], capture.node)
    assert.equal(capture.node.init.property.name, 'activeSkill')
    assert.equal(capture.node.init.object.property.name, 'options')
    assert.equal(capture.node.init.object.object.name, replacement.node.left.name)
    assert.equal(restore.node.key.name, 'activeSkill')
    assert.equal(restore.node.value.name, capture.node.id.name)
    assert.equal(restore.parent.properties.at(-1), restore.node)
    assert.equal(
      target.source.slice(
        expected.captureInsertion.localStart,
        expected.captureInsertion.localEnd,
      ),
      expected.captureInsertion.exact,
    )
    assert.deepEqual(
      descriptor(
        target.source.slice(
          expected.captureInsertion.localStart,
          expected.captureInsertion.localEnd,
        ),
      ),
      expectedDescriptor(expected.captureInsertion),
    )
    assert.equal(
      target.source.slice(
        expected.restoreInsertion.localStart,
        expected.restoreInsertion.localEnd,
      ),
      expected.restoreInsertion.exact,
    )
    assert.deepEqual(
      descriptor(
        target.source.slice(
          expected.restoreInsertion.localStart,
          expected.restoreInsertion.localEnd,
        ),
      ),
      expectedDescriptor(expected.restoreInsertion),
    )

    const normalizedBaseline = baseline.tokens.map(normalizedToken)
    const normalizedTarget = target.tokens.map(normalizedToken)
    assert.deepEqual(
      { count: normalizedBaseline.length, ...canonicalDigest(normalizedBaseline) },
      fixture.wholeUnitLineage.identifierNormalizedTokens.baseline,
    )
    assert.deepEqual(
      { count: normalizedTarget.length, ...canonicalDigest(normalizedTarget) },
      fixture.wholeUnitLineage.identifierNormalizedTokens.target,
    )
    const alignment = lcsAlignmentRuns(
      normalizedBaseline.map(JSON.stringify),
      normalizedTarget.map(JSON.stringify),
    )
    assert.deepEqual(alignment, {
      equalTokens: fixture.wholeUnitLineage.lcsAlignment.equalTokens,
      runs: fixture.wholeUnitLineage.lcsAlignment.runs,
    })
    assert.deepEqual(
      canonicalDigest(alignment.runs),
      fixture.wholeUnitLineage.lcsAlignment.runsDescriptor,
    )
    for (const [name, range] of [
      ['captureInsertion', expected.captureInsertion],
      ['restoreInsertion', expected.restoreInsertion],
    ]) {
      const insertionTokens = target.tokens.filter(
        token =>
          token.start >= range.localStart && token.end <= range.localEnd,
      )
      assert.deepEqual(
        {
          count: insertionTokens.length,
          ...canonicalDigest(insertionTokens.map(normalizedToken)),
        },
        fixture.wholeUnitLineage.identifierNormalizedTokens[name],
      )
    }
    const reconstructedTokens = target.tokens
      .filter(
        token =>
          !(
            token.start >= expected.captureInsertion.localStart &&
            token.end <= expected.captureInsertion.localEnd
          ) &&
          !(
            token.start >= expected.restoreInsertion.localStart &&
            token.end <= expected.restoreInsertion.localEnd
          ),
      )
      .map(normalizedToken)
    assert.deepEqual(reconstructedTokens, normalizedBaseline)
    assert.deepEqual(
      {
        count: reconstructedTokens.length,
        ...canonicalDigest(reconstructedTokens),
      },
      fixture.wholeUnitLineage.identifierNormalizedTokens
        .targetWithoutCaptureRestore,
    )

    capture.parent.declarations.splice(capture.key, 1)
    restore.parent.properties.splice(restore.key, 1)
    assert.deepEqual(canonicalize(target.node), canonicalize(baseline.node))
    assert.deepEqual(
      canonicalDescriptor(target.node),
      fixture.wholeUnitLineage.targetWithoutCaptureRestoreCanonical,
    )

    const targetSource = targetBundle.toString('utf8')
    const baselineSource = baselineBundle.toString('utf8')
    assert.deepEqual(
      occurrenceStarts(targetSource, 'activeSkill'),
      fixture.provenanceBoundary.activeSkillOccurrenceStarts,
    )
    for (const [property, count] of Object.entries(
      fixture.provenanceBoundary.bundleOccurrenceCounts.target,
    )) {
      assert.equal(countOccurrences(targetSource, property), count)
    }
    for (const [property, count] of Object.entries(
      fixture.provenanceBoundary.bundleOccurrenceCounts.baseline,
    )) {
      assert.equal(countOccurrences(baselineSource, property), count)
    }
    for (const anchor of fixture.provenanceBoundary.producerAnchors) {
      assert.equal(targetSource.slice(anchor.start, anchor.end), anchor.exact)
      assert.deepEqual(
        descriptor(targetSource.slice(anchor.start, anchor.end)),
        expectedDescriptor(anchor),
      )
    }
    const repl = fixture.provenanceBoundary.distinctReplUnit
    assert.deepEqual(
      descriptor(targetBundle.subarray(repl.start, repl.end)),
      { bytes: repl.bytes, sha256: repl.sha256 },
    )
    assert.equal(
      targetSource.slice(repl.occurrence[1], repl.occurrence[2]),
      repl.occurrence[0],
    )
    assert.equal(
      targetSource.slice(repl.anchor.start, repl.anchor.end),
      repl.anchor.exact,
    )
    assert.deepEqual(
      descriptor(targetSource.slice(repl.anchor.start, repl.anchor.end)),
      expectedDescriptor(repl.anchor),
    )
    assert.deepEqual(
      fixture.provenanceBoundary.ownedOccurrences,
      fixture.ownerResidues.strictRowsExact.map(row => [
        row[2],
        row[3],
        row[4],
        row[5],
      ]),
    )
    assert.match(fixture.provenanceBoundary.boundary, /Only u21925/)
    assert.match(fixture.provenanceBoundary.boundary, /u21373 occurrence 12/)
  },
)

test(
  'raw source authenticates QueryEngine while proving the type graph incomplete',
  { skip: !selected },
  () => {
    const ts = typescript()
    const baselineRoot = baselineSourceRoot()
    const targetRoot = targetSourceRoot()
    const baseline = queryEngineSourceEvidence(
      ts,
      baselineRoot,
      fixture.sourceState.target120,
    )
    const target = queryEngineSourceEvidence(
      ts,
      targetRoot,
      fixture.sourceState.target121,
    )
    assert.notEqual(baseline, target)
    toolUseContextEvidence(ts, targetRoot, fixture.sourceState.toolUseContext)
    processUserInputContextEvidence(
      ts,
      targetRoot,
      fixture.sourceState.processUserInputContext,
    )
    assert.deepEqual(
      sourceRootMarkerCounts(baselineRoot),
      fixture.sourceState.sourceRootMarkerCounts,
    )
    assert.deepEqual(
      sourceRootMarkerCounts(targetRoot),
      fixture.sourceState.sourceRootMarkerCounts,
    )
    assert.equal(
      git(path.dirname(baselineRoot), ['rev-parse', 'HEAD']),
      fixture.sourceState.target120.gitCommit,
    )
    assert.equal(
      git(path.dirname(baselineRoot), [
        'rev-parse',
        `HEAD:${fixture.sourceState.path}`,
      ]),
      fixture.sourceState.target120.gitBlob,
    )
    assert.equal(
      git(path.dirname(targetRoot), ['rev-parse', 'HEAD']),
      fixture.sourceState.target121.gitCommit,
    )
    assert.equal(
      git(path.dirname(targetRoot), [
        'rev-parse',
        `HEAD:${fixture.sourceState.path}`,
      ]),
      fixture.sourceState.target121.gitBlob,
    )
  },
)

test(
  'fresh Target121 package independently preserves the QueryEngine blocker',
  { skip: !selected },
  t => {
    const root = freshPackageSourceRoot()
    if (!fs.existsSync(root)) {
      t.skip(`fresh Target121 package source is unavailable: ${root}`)
      return
    }
    const ts = typescript()
    const raw = queryEngineSourceEvidence(
      ts,
      targetSourceRoot(),
      fixture.sourceState.target121,
    )
    const fresh = queryEngineSourceEvidence(
      ts,
      root,
      fixture.sourceState.target121,
    )
    assert.equal(fresh, raw)
    toolUseContextEvidence(ts, root, fixture.sourceState.toolUseContext)
    processUserInputContextEvidence(
      ts,
      root,
      fixture.sourceState.processUserInputContext,
    )
    assert.deepEqual(
      sourceRootMarkerCounts(root),
      fixture.sourceState.sourceRootMarkerCounts,
    )
  },
)

test(
  'the static proof removes exactly two residues and is import-idempotent',
  { skip: !selected },
  async () => {
    const evolution = fixture.strictEvolution
    assert.deepEqual(evolution.removes.targetIndices, [21925])
    assert.equal(evolution.removes.units, 1)
    assert.equal(evolution.removes.residueCount, 2)
    assert.deepEqual(evolution.removes.residues, fixture.ownerResidues.strictRowsExact)
    assert.equal(
      evolution.before.unsupportedUnits - evolution.removes.units,
      evolution.predictedAfter.unsupportedUnits,
    )
    assert.equal(
      evolution.before.unsupportedResidues - evolution.removes.residueCount,
      evolution.predictedAfter.unsupportedResidues,
    )
    assert.match(fixture.sourceReplayBlocker.decision, /static whole-class/)
    assert.equal(fixture.sourceReplayBlocker.reasons.length, 4)
    const moduleUrl = new URL(
      '../cases/2.1.120-to-2.1.121/recovered/query-engine-active-skill-owner-overrides.mjs',
      import.meta.url,
    )
    const freshImport = await import(`${moduleUrl.href}?proof=${Date.now()}`)
    assert.deepEqual(
      freshImport.TARGET121_QUERY_ENGINE_ACTIVE_SKILL_OWNER_OVERRIDES,
      TARGET121_QUERY_ENGINE_ACTIVE_SKILL_OWNER_OVERRIDES,
    )
    assert.deepEqual(
      freshImport.TARGET121_QUERY_ENGINE_ACTIVE_SKILL_EVIDENCE_IDS,
      TARGET121_QUERY_ENGINE_ACTIVE_SKILL_EVIDENCE_IDS,
    )
  },
)
