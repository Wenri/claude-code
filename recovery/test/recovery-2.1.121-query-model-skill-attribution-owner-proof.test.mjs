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
import * as ownerProofModule from '../cases/2.1.120-to-2.1.121/recovered/query-model-skill-attribution-owner-overrides.mjs'

const {
  TARGET121_QUERY_MODEL_SKILL_ATTRIBUTION_EVIDENCE_IDS,
  TARGET121_QUERY_MODEL_SKILL_ATTRIBUTION_OWNER_OVERRIDES,
} = ownerProofModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-query-model-skill-attribution-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'd08d75eca83f8ab045f7ba06d345ebd5b5b343f5012967229c3e62f1b9c9a4b5'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function expectedDescriptor(expected) {
  return { bytes: expected.bytes, sha256: expected.sha256 }
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
  assert.equal(paths.length, 1, 'report snapshots must share one path')
  return path.join(repositoryRoot, paths[0])
}

function compatibleEvolutionPair(reportState, coverageState) {
  return (
    fixture.inputs.evolutionCompatibility[reportState] ?? []
  ).includes(coverageState)
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

function canonicalDigest(value) {
  return descriptor(Buffer.from(JSON.stringify(value)))
}

function projectedCoverageState(evolution, state) {
  if (!state.projection) return state
  const projected = evolution.acceptedStates.find(
    candidate => candidate.name === state.projection,
  )
  assert.ok(projected, `coverage projection ${state.projection}`)
  assert.equal(projected.projection, undefined, 'coverage projection must be direct')
  return { ...projected, ...state, projection: state.projection }
}

function exactCoverageEvolutionState(evolution, observed) {
  const matches = evolution.acceptedStates
    .map(state => projectedCoverageState(evolution, state))
    .filter(
      state =>
      JSON.stringify({
        compressed: state.compressed,
        raw: state.raw,
        rowCanonical: state.rowCanonical,
      }) === JSON.stringify(observed),
    )
  assert.equal(
    matches.length,
    1,
    'coverage must be one exact accepted descriptor/raw/row state',
  )
  return matches[0]
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

function walk(node, visit, currentPath = [], parent = null) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach((child, index) =>
      walk(child, visit, [...currentPath, index], parent),
    )
    return
  }
  if (typeof node.type === 'string') visit(node, currentPath, parent)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start'].includes(key)) {
      walk(child, visit, [...currentPath, key], node)
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
  assert.equal(node.async, expected.async)
  assert.equal(node.generator, expected.generator)
  assert.equal(node.body.body.length, expected.bodyStatementCount)
  const tokens = [...tokenizer(source, { ecmaVersion: 'latest' })]
  assert.equal(tokens.length, expected.tokenCount)
  return { node, source, tokens, unitStart: expected.start }
}

function skillAttributionSpreads(unit) {
  const candidates = []
  walk(unit, (node, nodePath, parent) => {
    if (
      node.type !== 'SpreadElement' ||
      node.argument?.type !== 'CallExpression'
    ) {
      return
    }
    const properties = node.argument.arguments.map(argument =>
      argument.type === 'MemberExpression'
        ? argument.property?.name
        : undefined,
    )
    if (
      properties.includes('spawnedBySkill') &&
      properties.includes('activeSkill')
    ) {
      candidates.push({
        node,
        parent,
        path: nodePath.join('.'),
        properties,
      })
    }
  })
  return candidates
}

function myersAlignment(left, right) {
  let frontier = new Map([[1, 0]])
  const trace = []
  let finalDistance = -1
  outer: for (
    let distance = 0;
    distance <= left.length + right.length;
    distance += 1
  ) {
    trace.push(new Map(frontier))
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      let leftIndex
      if (
        diagonal === -distance ||
        (diagonal !== distance &&
          (frontier.get(diagonal - 1) ?? -Infinity) <
            (frontier.get(diagonal + 1) ?? -Infinity))
      ) {
        leftIndex = frontier.get(diagonal + 1) ?? 0
      } else {
        leftIndex = (frontier.get(diagonal - 1) ?? 0) + 1
      }
      let rightIndex = leftIndex - diagonal
      while (
        leftIndex < left.length &&
        rightIndex < right.length &&
        left[leftIndex] === right[rightIndex]
      ) {
        leftIndex += 1
        rightIndex += 1
      }
      frontier.set(diagonal, leftIndex)
      if (leftIndex >= left.length && rightIndex >= right.length) {
        finalDistance = distance
        break outer
      }
    }
  }
  assert.notEqual(finalDistance, -1)

  let leftIndex = left.length
  let rightIndex = right.length
  const operations = []
  for (let distance = finalDistance; distance > 0; distance -= 1) {
    const previous = trace[distance]
    const diagonal = leftIndex - rightIndex
    const previousDiagonal =
      diagonal === -distance ||
      (diagonal !== distance &&
        (previous.get(diagonal - 1) ?? -Infinity) <
          (previous.get(diagonal + 1) ?? -Infinity))
        ? diagonal + 1
        : diagonal - 1
    const previousLeft = previous.get(previousDiagonal) ?? 0
    const previousRight = previousLeft - previousDiagonal
    while (leftIndex > previousLeft && rightIndex > previousRight) {
      operations.push('=')
      leftIndex -= 1
      rightIndex -= 1
    }
    if (leftIndex === previousLeft) {
      operations.push('+')
      rightIndex -= 1
    } else {
      operations.push('-')
      leftIndex -= 1
    }
  }
  while (leftIndex > 0 && rightIndex > 0) {
    operations.push('=')
    leftIndex -= 1
    rightIndex -= 1
  }
  while (leftIndex > 0) {
    operations.push('-')
    leftIndex -= 1
  }
  while (rightIndex > 0) {
    operations.push('+')
    rightIndex -= 1
  }
  operations.reverse()

  const runs = []
  for (const operation of operations) {
    const previous = runs.at(-1)
    if (previous?.[0] === operation) previous[1] += 1
    else runs.push([operation, 1])
  }
  const counts = Object.fromEntries(
    ['=', '-', '+'].map(operation => [
      operation,
      operations.filter(value => value === operation).length,
    ]),
  )
  assert.equal(counts['='] + counts['-'], left.length)
  assert.equal(counts['='] + counts['+'], right.length)
  return {
    editDistance: finalDistance,
    equalTokens: counts['='],
    deletedTokens: counts['-'],
    insertedTokens: counts['+'],
    runCount: runs.length,
    runsBytes: canonicalDigest(runs).bytes,
    runsSha256: canonicalDigest(runs).sha256,
  }
}

function typescript() {
  return require(
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
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

function baselineRepositoryRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_120_REPOSITORY_ROOT ??
      path.dirname(baselineSourceRoot()),
  )
}

function targetRepositoryRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_121_REPOSITORY_ROOT ??
      path.dirname(targetSourceRoot()),
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

function nodeDescriptor(sourceFile, source, node, expected, extra = {}) {
  const start = node.getStart(sourceFile)
  const end = node.end
  const text = source.slice(start, end)
  assert.deepEqual(
    {
      ...extra,
      start,
      end,
      chars: text.length,
      ...descriptor(text),
      line: sourceFile.getLineAndCharacterOfPosition(start).line + 1,
      endLine: sourceFile.getLineAndCharacterOfPosition(end).line + 1,
    },
    expected,
  )
  return text
}

function apiSourceEvidence(ts, root, expected) {
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
  const queryModel = sourceFile.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === fixture.sourceState.declarationName,
  )
  assert.ok(queryModel?.body)
  const queryExpected = expected.queryModel
  const queryText = nodeDescriptor(
    sourceFile,
    source,
    queryModel,
    queryExpected,
    {
      name: queryModel.name.text,
      parameterCount: queryModel.parameters.length,
      bodyStatementCount: queryModel.body.statements.length,
    },
  )
  for (const [marker, count] of Object.entries(
    fixture.sourceState.declarationMarkerCounts,
  )) {
    assert.equal(countOccurrences(queryText, marker), count, marker)
  }
  for (const marker of fixture.wholeUnitLineage.retainedBehavioralAnchors) {
    assert.equal(countOccurrences(queryText, marker), 1, marker)
  }

  const options = sourceFile.statements.find(
    statement =>
      ts.isTypeAliasDeclaration(statement) &&
      statement.name.text === fixture.sourceState.optionsName,
  )
  assert.ok(options && ts.isTypeLiteralNode(options.type))
  const optionsExpected = expected.options
  const optionNames = options.type.members
    .map(member => member.name?.getText(sourceFile))
    .filter(Boolean)
  nodeDescriptor(
    sourceFile,
    source,
    options,
    Object.fromEntries(
      Object.entries(optionsExpected).filter(
        ([key]) => !['memberCount', 'memberNames'].includes(key),
      ),
    ),
    { name: options.name.text },
  )
  assert.equal(optionNames.length, optionsExpected.memberCount)
  assert.deepEqual(canonicalDigest(optionNames), optionsExpected.memberNames)
  for (const marker of ['spawnedBySkill', 'activeSkill']) {
    assert.equal(optionNames.includes(marker), false, marker)
  }
  return { queryText, source }
}

function toolSourceEvidence(ts, root) {
  const expected = fixture.sourceState.toolUseContext
  const filename = sourceFilename(root, expected.path)
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
  const declaration = sourceFile.statements.find(
    statement =>
      ts.isTypeAliasDeclaration(statement) &&
      statement.name.text === 'ToolUseContext',
  )
  assert.ok(declaration && ts.isTypeLiteralNode(declaration.type))
  const optionsMember = declaration.type.members.find(
    member => member.name?.getText(sourceFile) === 'options',
  )
  assert.ok(optionsMember?.type && ts.isTypeLiteralNode(optionsMember.type))
  const options = expected.optionsType
  nodeDescriptor(
    sourceFile,
    source,
    optionsMember.type,
    Object.fromEntries(
      Object.entries(options).filter(
        ([key]) => !['memberCount', 'memberNames'].includes(key),
      ),
    ),
  )
  const names = optionsMember.type.members
    .map(member => member.name?.getText(sourceFile))
    .filter(Boolean)
  assert.equal(names.length, options.memberCount)
  assert.deepEqual(canonicalDigest(names), options.memberNames)
  for (const marker of ['spawnedBySkill', 'activeSkill']) {
    assert.equal(names.includes(marker), false, marker)
  }
}

function sourceRootMarkerCounts(root) {
  const markers = Object.fromEntries(
    Object.keys(fixture.sourceState.sourceRootMarkerCounts).map(marker => [
      marker,
      0,
    ]),
  )
  const pending = [root]
  while (pending.length > 0) {
    const directory = pending.pop()
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) pending.push(filename)
      else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
        const source = fs.readFileSync(filename, 'utf8')
        for (const marker of Object.keys(markers)) {
          markers[marker] += countOccurrences(source, marker)
        }
      }
    }
  }
  return markers
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

test(
  'Target121 query-model attribution fixture and override are exact',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(
      fixture.status,
      'case-owned-static-owner-proof-source-replay-blocked',
    )
    assert.deepEqual(
      TARGET121_QUERY_MODEL_SKILL_ATTRIBUTION_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET121_QUERY_MODEL_SKILL_ATTRIBUTION_OWNER_OVERRIDES,
      [
        {
          key: `${caseName}:19537`,
          targetIndex: 19537,
          paths: [fixture.ownerResidues.correctedOwner],
          declarations: fixture.ownerResidues.declarations,
          evidenceIds: fixture.evidenceIds,
          behavior:
            TARGET121_QUERY_MODEL_SKILL_ATTRIBUTION_OWNER_OVERRIDES[0]
              .behavior,
        },
      ],
    )
    assert.equal(
      Object.isFrozen(
        TARGET121_QUERY_MODEL_SKILL_ATTRIBUTION_OWNER_OVERRIDES,
      ),
      true,
    )
    const coverageStates =
      fixture.inputs.sourceCoverageEvolution.acceptedStates
    assert.deepEqual(
      coverageStates.map(state => state.name),
      [
        'pre-u19537-integration',
        'post-u19537-integration',
        'post-u20775-integration',
        'postFocusedBatch',
        'postDaemonOwner',
      ],
    )
    assert.equal(
      new Set(
        coverageStates.map(state =>
          JSON.stringify({ compressed: state.compressed, raw: state.raw }),
        ),
      ).size,
      coverageStates.length,
    )
    assert.deepEqual(coverageStates[1].rowCanonical, coverageStates[2].rowCanonical)
    assert.deepEqual(coverageStates[1].row, coverageStates[2].row)
    assert.equal(coverageStates[3].projection, coverageStates[1].name)
    assert.notDeepEqual(coverageStates[0].rowCanonical, coverageStates[1].rowCanonical)
    assert.equal(fixture.generatorWiring.replayHelper, null)
    assert.deepEqual(Object.keys(ownerProofModule).sort(), [
      'TARGET121_QUERY_MODEL_SKILL_ATTRIBUTION_EVIDENCE_IDS',
      'TARGET121_QUERY_MODEL_SKILL_ATTRIBUTION_OWNER_OVERRIDES',
    ])
  },
)

test(
  'u19537 ledger, owner rows, strict rows, and source coverage are pinned',
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
    assert.deepEqual(
      canonicalDigest(rowIdentities),
      fixture.ownerResidues.rowIdentities,
    )
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
    assert.deepEqual(addedRows, strictRows)

    const coverageEvolution = fixture.inputs.sourceCoverageEvolution
    const compressedCoverage = fs.readFileSync(
      path.join(repositoryRoot, coverageEvolution.path),
    )
    const rawCoverage = gunzipSync(compressedCoverage)
    const coverage = JSON.parse(rawCoverage)
    const coverageRows = coverage.rows.filter(
      row => row.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert.equal(coverageRows.length, 1)
    const coverageState = exactCoverageEvolutionState(coverageEvolution, {
      compressed: descriptor(compressedCoverage),
      raw: descriptor(rawCoverage),
      rowCanonical: canonicalDigest(coverageRows[0]),
    })
    assert.equal(
      compatibleEvolutionPair(reportSnapshot.state, coverageState.name),
      true,
      `unsupported report/coverage hybrid ${reportSnapshot.state}/${coverageState.name}`,
    )
    assert.deepEqual(coverageRows, [coverageState.row])
    assert.deepEqual(
      canonicalDigest(coverageRows[0]),
      coverageState.rowCanonical,
    )
    assert.deepEqual(
      coverage.owners.filter(owner =>
        coverageRows[0].ownerIds.includes(owner.id),
      ),
      [fixture.sourceCoverageClaim.owner],
    )
  },
)

test(
  'u19537 coverage evolution selector rejects unknown and hybrid states',
  { skip: !selected },
  () => {
    const evolution = fixture.inputs.sourceCoverageEvolution
    const [before, provisional, after, focused, current] =
      evolution.acceptedStates
    for (const state of evolution.acceptedStates) {
      const projected = projectedCoverageState(evolution, state)
      assert.equal(
        exactCoverageEvolutionState(evolution, {
          compressed: state.compressed,
          raw: state.raw,
          rowCanonical: projected.rowCanonical,
        }).name,
        state.name,
      )
    }
    assert.throws(
      () =>
        exactCoverageEvolutionState(evolution, {
          compressed: before.compressed,
          raw: provisional.raw,
          rowCanonical: before.rowCanonical,
        }),
      /one exact accepted descriptor\/raw\/row state/,
    )
    assert.equal(compatibleEvolutionPair('postFocusedBatch', focused.name), true)
    assert.equal(compatibleEvolutionPair('postDaemonOwner', current.name), true)
    assert.equal(
      compatibleEvolutionPair('provisional', 'post-u20775-integration'),
      true,
    )
    for (const [reportState, coverageState] of [
      ['provisional', current.name],
      ['postFocusedBatch', before.name],
      ['postFocusedBatch', after.name],
      ['postDaemonOwner', focused.name],
      ['postFocusedBatch', current.name],
    ]) {
      assert.equal(
        compatibleEvolutionPair(reportState, coverageState),
        false,
        `hybrid ${reportState}/${coverageState}`,
      )
    }
    for (const [state, snapshot] of Object.entries(
      fixture.inputs.typedReportSnapshots,
    )) {
      assert.equal(
        matchExactSnapshot(
          expectedDescriptor(snapshot),
          fixture.inputs.typedReportSnapshots,
          `${state} report contract`,
        ).state,
        state,
      )
    }
    assert.throws(
      () =>
        exactCoverageEvolutionState(evolution, {
          compressed: provisional.compressed,
          raw: after.raw,
          rowCanonical: after.rowCanonical,
        }),
      /one exact accepted descriptor\/raw\/row state/,
    )
    assert.throws(
      () =>
        exactCoverageEvolutionState(evolution, {
          compressed: { bytes: 0, sha256: 'unknown' },
          raw: before.raw,
          rowCanonical: before.rowCanonical,
        }),
      /one exact accepted descriptor\/raw\/row state/,
    )
  },
)

test(
  'complete-unit lineage and the four-call attribution graph are exact',
  { skip: !selected },
  t => {
    const baselinePath = artifactPath(
      'CLAUDE_CODE_2_1_120_INNER_BUNDLE',
      fixture.inputs.baselineBundle,
    )
    const targetPath = artifactPath(
      'CLAUDE_CODE_2_1_121_INNER_BUNDLE',
      fixture.inputs.targetBundle,
    )
    if (!fs.existsSync(baselinePath) || !fs.existsSync(targetPath)) {
      t.skip('authenticated Target120/121 bundles are unavailable')
      return
    }
    const baselineBundle = readExact(
      baselinePath,
      fixture.inputs.baselineBundle,
      'Target120 bundle',
    )
    const targetBundle = readExact(
      targetPath,
      fixture.inputs.targetBundle,
      'Target121 bundle',
    )
    const baseline = parseUnit(
      baselineBundle,
      fixture.baselineSemanticCounterpart,
      'Target120 queryModel unit',
    )
    const target = parseUnit(
      targetBundle,
      fixture.targetUnit,
      'Target121 u19537',
    )
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
    for (const marker of fixture.wholeUnitLineage.retainedBehavioralAnchors) {
      assert.equal(countOccurrences(baseline.source, marker), 1, marker)
      assert.equal(countOccurrences(target.source, marker), 1, marker)
    }

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

    const spreads = skillAttributionSpreads(target.node)
    assert.equal(spreads.length, fixture.skillAttributionGraph.sites.length)
    const tokenRanges = []
    for (let index = 0; index < spreads.length; index += 1) {
      const candidate = spreads[index]
      const expectedSite = fixture.skillAttributionGraph.sites[index]
      const expectedNode = fixture.skillAttributionGraph.spreadNode
      assert.equal(candidate.path, expectedSite.path)
      assert.equal(candidate.node.type, expectedNode.nodeType)
      assert.equal(candidate.node.start, expectedSite.localStart)
      assert.equal(candidate.node.end, expectedSite.localEnd)
      assert.equal(target.unitStart + candidate.node.start, expectedSite.start)
      assert.equal(target.unitStart + candidate.node.end, expectedSite.end)
      const raw = target.source.slice(candidate.node.start, candidate.node.end)
      assert.deepEqual(descriptor(raw), expectedDescriptor(expectedNode))
      assert.equal(raw, expectedNode.exact)
      assert.deepEqual(canonicalDescriptor(candidate.node), {
        bytes: expectedNode.canonicalBytes,
        sha256: expectedNode.canonicalSha256,
      })
      assert.equal(
        candidate.node.argument.arguments.length,
        expectedNode.argumentCount,
      )
      assert.deepEqual(candidate.properties, expectedNode.argumentProperties)
      const withComma = target.source.slice(
        candidate.node.start,
        candidate.node.end + 1,
      )
      assert.deepEqual(descriptor(withComma), {
        bytes: expectedNode.withCommaBytes,
        sha256: expectedNode.withCommaSha256,
      })
      assert.equal(withComma, expectedNode.withCommaExact)
      assert.equal(target.unitStart + candidate.node.end + 1, expectedSite.withCommaEnd)
      assert.equal(target.unitStart + candidate.node.argument.start, expectedSite.callStart)
      assert.equal(target.unitStart + candidate.node.argument.end, expectedSite.callEnd)
      tokenRanges.push([candidate.node.start, candidate.node.end + 1])
    }

    const insertedTokens = target.tokens.filter(token =>
      tokenRanges.some(
        ([start, end]) => token.start >= start && token.end <= end,
      ),
    )
    const targetWithoutTokens = target.tokens.filter(
      token =>
        !tokenRanges.some(
          ([start, end]) => token.start >= start && token.end <= end,
        ),
    )
    const normalizedInserted = insertedTokens.map(normalizedToken)
    const normalizedWithout = targetWithoutTokens.map(normalizedToken)
    assert.deepEqual(
      { count: insertedTokens.length, ...canonicalDigest(normalizedInserted) },
      fixture.wholeUnitLineage.identifierNormalizedTokens
        .skillAttributionInsertions,
    )
    for (let index = 0; index < spreads.length; index += 1) {
      const site = fixture.skillAttributionGraph.sites[index]
      const siteTokens = target.tokens.filter(
        token =>
          token.start >= site.localStart &&
          token.end <= site.withCommaEnd - target.unitStart,
      )
      assert.deepEqual(
        { count: siteTokens.length, ...canonicalDigest(siteTokens.map(normalizedToken)) },
        fixture.wholeUnitLineage.identifierNormalizedTokens.oneInsertion,
      )
    }
    assert.deepEqual(
      { count: normalizedWithout.length, ...canonicalDigest(normalizedWithout) },
      fixture.wholeUnitLineage.identifierNormalizedTokens
        .targetWithoutSkillAttribution,
    )
    assert.deepEqual(
      myersAlignment(
        normalizedBaseline.map(JSON.stringify),
        normalizedTarget.map(JSON.stringify),
      ),
      fixture.wholeUnitLineage.myersAlignment.full,
    )
    assert.deepEqual(
      myersAlignment(
        normalizedBaseline.map(JSON.stringify),
        normalizedWithout.map(JSON.stringify),
      ),
      fixture.wholeUnitLineage.myersAlignment.withoutSkillAttribution,
    )

    for (const candidate of spreads) {
      const index = candidate.parent.properties.indexOf(candidate.node)
      assert.ok(index >= 0)
      candidate.parent.properties.splice(index, 1)
    }
    assert.deepEqual(
      canonicalDescriptor(target.node),
      fixture.wholeUnitLineage.targetWithoutSkillAttributionCanonical,
    )

    const helperExpected = fixture.skillAttributionGraph.attributionHelper
    const helper = parseUnit(
      targetBundle,
      {
        ...helperExpected,
        async: false,
        generator: false,
      },
      'Target121 attribution helper u19494',
    )
    assert.equal(helper.source, helperExpected.exact)
    assert.deepEqual(canonicalDescriptor(helper.node), {
      bytes: helperExpected.canonicalBytes,
      sha256: helperExpected.canonicalSha256,
    })
    assert.equal(helper.node.params.length, 3)
    const helperProperties = []
    walk(helper.node, node => {
      if (node.type === 'Property') helperProperties.push(node.key?.name)
    })
    assert.equal(
      helperProperties.filter(value => value === 'attributionAgent').length,
      2,
    )
    assert.equal(
      helperProperties.filter(value => value === 'attributionSkill').length,
      3,
    )
    assert.equal(
      helperProperties.filter(value => value === 'attributionPlugin').length,
      3,
    )
    for (const [version, bundle, expected] of [
      ['baseline', baselineBundle, fixture.skillAttributionGraph.bundleOccurrenceCounts.baseline],
      ['target', targetBundle, fixture.skillAttributionGraph.bundleOccurrenceCounts.target],
    ]) {
      const source = bundle.toString('utf8')
      for (const [marker, count] of Object.entries(expected)) {
        assert.equal(countOccurrences(source, marker), count, `${version} ${marker}`)
      }
    }
    assert.match(fixture.skillAttributionGraph.boundary, /owns only u19537/)
    assert.match(fixture.skillAttributionGraph.boundary, /u19494/)
  },
)

test(
  'raw source authenticates queryModel while proving an incomplete type graph',
  { skip: !selected },
  () => {
    const ts = typescript()
    const baseline = apiSourceEvidence(
      ts,
      baselineSourceRoot(),
      fixture.sourceState.target120,
    )
    const target = apiSourceEvidence(
      ts,
      targetSourceRoot(),
      fixture.sourceState.target121,
    )
    assert.notEqual(baseline.source, target.source)
    assert.notEqual(baseline.queryText, target.queryText)
    toolSourceEvidence(ts, targetSourceRoot())
    assert.deepEqual(
      sourceRootMarkerCounts(targetSourceRoot()),
      fixture.sourceState.sourceRootMarkerCounts,
    )

    const semanticTrees = [
      baselineRepositoryRoot(),
      targetRepositoryRoot(),
    ]
    const expected = [
      fixture.sourceState.target120,
      fixture.sourceState.target121,
    ]
    for (let index = 0; index < semanticTrees.length; index += 1) {
      assert.equal(git(semanticTrees[index], ['rev-parse', 'HEAD']), expected[index].gitCommit)
      assert.equal(
        git(semanticTrees[index], [
          'rev-parse',
          `HEAD:${fixture.sourceState.path}`,
        ]),
        expected[index].gitBlob,
      )
    }
  },
)

test(
  'fresh Target121 package independently preserves the source blocker',
  { skip: !selected },
  t => {
    const root = freshPackageSourceRoot()
    if (!fs.existsSync(root)) {
      t.skip(`fresh Target121 package source is unavailable: ${root}`)
      return
    }
    const ts = typescript()
    const raw = apiSourceEvidence(
      ts,
      targetSourceRoot(),
      fixture.sourceState.target121,
    )
    const fresh = apiSourceEvidence(
      ts,
      root,
      fixture.sourceState.freshPackage,
    )
    assert.equal(fresh.source, raw.source)
    assert.equal(fresh.queryText, raw.queryText)
    toolSourceEvidence(ts, root)
    assert.deepEqual(
      sourceRootMarkerCounts(root),
      fixture.sourceState.sourceRootMarkerCounts,
    )
  },
)

test(
  'the static proof removes exactly eight residues and is import-idempotent',
  { skip: !selected },
  async () => {
    assert.deepEqual(fixture.strictEvolution.before, {
      unsupportedUnits: 38,
      unsupportedResidues: 416,
    })
    assert.deepEqual(fixture.strictEvolution.removes.targetIndices, [19537])
    assert.equal(fixture.strictEvolution.removes.units, 1)
    assert.equal(fixture.strictEvolution.removes.residueCount, 8)
    assert.deepEqual(
      fixture.strictEvolution.removes.residues,
      fixture.ownerResidues.strictRowsExact,
    )
    assert.deepEqual(fixture.strictEvolution.predictedAfter, {
      unsupportedUnits: 37,
      unsupportedResidues: 408,
    })
    assert.match(
      fixture.sourceReplayBlocker.decision,
      /static whole-unit owner proof only; no replay helper and no source writes/,
    )
    assert.match(
      fixture.sourceReplayBlocker.reason,
      /omit the four attribution spreads.*attribution helper.*type dependencies/,
    )
    const first = await import(
      `../cases/2.1.120-to-2.1.121/recovered/query-model-skill-attribution-owner-overrides.mjs?first`
    )
    const second = await import(
      `../cases/2.1.120-to-2.1.121/recovered/query-model-skill-attribution-owner-overrides.mjs?second`
    )
    assert.deepEqual(
      first.TARGET121_QUERY_MODEL_SKILL_ATTRIBUTION_OWNER_OVERRIDES,
      second.TARGET121_QUERY_MODEL_SKILL_ATTRIBUTION_OWNER_OVERRIDES,
    )
    assert.equal(
      Object.isFrozen(
        first.TARGET121_QUERY_MODEL_SKILL_ATTRIBUTION_OWNER_OVERRIDES[0]
          .paths,
      ),
      true,
    )
  },
)
