import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import * as helper from '../cases/2.1.118-to-2.1.119/recovered/headless-streaming-strict-residue-owner-overrides.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const artifactRoot = path.join(root, '.recovery-tmp/authenticated-artifacts')
const selectedSourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? path.join(root, 'src'),
)
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-headless-streaming-strict-residue-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const FIXTURE_SHA256 =
  '138ada13ecf04d5033617a74e4d7a6a505d5a2643f8c722cb256af6419abcbe5'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function partitionDescriptor(rows) {
  const bytes = Buffer.from(JSON.stringify(rows))
  return { rows: rows.length, jsonBytes: bytes.length, sha256: sha256(bytes) }
}

function gitBlobSha1(value) {
  return crypto
    .createHash('sha1')
    .update(Buffer.from(`blob ${value.length}\0`))
    .update(value)
    .digest('hex')
}

function readExact(input, base = root) {
  const value = fs.readFileSync(path.join(base, input.path))
  assert.deepEqual(
    descriptor(value),
    { bytes: input.bytes, sha256: input.sha256 },
    input.path,
  )
  return value
}

function readArtifact(input) {
  const value = fs.readFileSync(path.join(artifactRoot, input.artifact))
  assert.deepEqual(
    descriptor(value),
    { bytes: input.bytes, sha256: input.sha256 },
    input.artifact,
  )
  return value
}

function sliceExact(value, input, label) {
  const result = value.subarray(input.start, input.end)
  assert.deepEqual(
    descriptor(result),
    { bytes: input.bytes, sha256: input.sha256 },
    label,
  )
  return result
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

function canonicalToken(token) {
  if (token.type.label === 'name') return 'ID'
  if (token.type.label === 'string') {
    return `S:${JSON.stringify(token.value)}`
  }
  if (token.type.label === 'num') return `N:${token.value}`
  if (token.type.label === 'bigint') return `B:${token.value}`
  if (token.type.label === 'regexp') {
    return `R:${token.value.pattern}/${token.value.flags}`
  }
  return token.type.label
}

function tokens(source, globalOffset = 0) {
  const output = []
  const stream = tokenizer(source, { ecmaVersion: 'latest' })
  while (true) {
    const token = stream.getToken()
    if (token.type.label === 'eof') return output
    output.push({
      canonical: canonicalToken(token),
      raw: source.slice(token.start, token.end),
      start: globalOffset + token.start,
      end: globalOffset + token.end,
    })
  }
}

function canonicalDescriptor(source) {
  const values = tokens(source).map(token => token.canonical)
  const bytes = Buffer.from(JSON.stringify(values))
  return { tokens: values.length, jsonBytes: bytes.length, sha256: sha256(bytes) }
}

function canonicalStreamDescriptor(values) {
  const bytes = Buffer.from(
    JSON.stringify(values.map(token => token.canonical)),
  )
  return {
    tokens: values.length,
    jsonBytes: bytes.length,
    sha256: sha256(bytes),
  }
}

function parseUnit(bundle, input) {
  const bytes = sliceExact(bundle, input, `u${input.index}`)
  const text = bytes.toString('utf8')
  const program = parse(text, { ecmaVersion: 'latest', sourceType: 'script' })
  assert.equal(program.body.length, 1)
  assert.equal(program.body[0].type, input.nodeType)
  const unitTokens = tokens(text, input.start)
  assert.equal(unitTokens.length, input.tokenCount)
  return { bytes, text, node: program.body[0], tokens: unitTokens }
}

function walk(node, visitor, parent = null) {
  if (node === null || typeof node !== 'object') return
  visitor(node, parent)
  for (const [key, child] of Object.entries(node)) {
    if (['end', 'loc', 'range', 'raw', 'start'].includes(key)) continue
    if (Array.isArray(child)) {
      for (const nested of child) walk(nested, visitor, node)
    } else {
      walk(child, visitor, node)
    }
  }
}

function compiledFragments(unit) {
  const ranges = {}
  walk(unit.node, node => {
    if (node.type === 'IfStatement') {
      const testText = unit.text.slice(node.test.start, node.test.end)
      for (const subtype of [
        'get_binary_version',
        'mcp_oauth_callback_url',
        'message_rated',
      ]) {
        if (testText.includes(subtype)) {
          ranges[subtype] = [node.test.start, node.consequent.end]
        }
      }
    }
    if (
      node.type === 'BinaryExpression' &&
      node.operator === 'in' &&
      node.left?.type === 'Literal' &&
      node.left.value === 'pluginSource'
    ) {
      ranges.pluginSource = [node.start, node.end]
    }
    if (node.type === 'CallExpression') {
      const text = unit.text.slice(node.start, node.end)
      if (
        text.length < 250 &&
        text.includes('{response:') &&
        text.includes('synthetic:')
      ) {
        ranges.syntheticCall = [node.start, node.end]
      }
    }
  })
  return Object.fromEntries(
    Object.entries(ranges).map(([name, [start, end]]) => {
      const bytes = unit.bytes.subarray(start, end)
      return [
        name,
        {
          start: unit.tokens.length ? unit.tokens[0].start + start : start,
          end: unit.tokens.length ? unit.tokens[0].start + end : end,
          bytes,
          text: bytes.toString('utf8'),
        },
      ]
    }),
  )
}

function exactFragment(actual, expected, label) {
  assert.deepEqual(
    {
      start: actual.start,
      end: actual.end,
      ...descriptor(actual.bytes),
    },
    {
      start: expected.start,
      end: expected.end,
      bytes: expected.bytes,
      sha256: expected.sha256,
    },
    label,
  )
}

function structuralProjection(unit) {
  return {
    index: unit.index,
    nodeType: unit.nodeType,
    start: unit.start,
    end: unit.end,
    tokenCount: unit.tokenCount,
    sourceHash: unit.sourceHash,
    coarseHash: unit.coarseHash,
  }
}

function expectedStructural(input) {
  return {
    index: input.index,
    nodeType: input.nodeType,
    start: input.start,
    end: input.end,
    tokenCount: input.tokenCount,
    sourceHash: input.sha256,
    coarseHash: input.coarseHash,
  }
}

function normalizedDiff(baselineTokens, targetTokens) {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target119-u21742-diff-'),
  )
  const baselinePath = path.join(temporary, 'baseline.tokens')
  const targetPath = path.join(temporary, 'target.tokens')
  try {
    fs.writeFileSync(
      baselinePath,
      `${baselineTokens.map(token => token.canonical).join('\n')}\n`,
    )
    fs.writeFileSync(
      targetPath,
      `${targetTokens.map(token => token.canonical).join('\n')}\n`,
    )
    const result = spawnSync(
      'diff',
      [
        '-U',
        '0',
        '--label',
        fixture.predecessorProof.normalizedCompleteUnitDiff.baselineLabel,
        '--label',
        fixture.predecessorProof.normalizedCompleteUnitDiff.targetLabel,
        baselinePath,
        targetPath,
      ],
      { encoding: null, maxBuffer: 10_000_000 },
    )
    assert.equal(result.status, 1, result.stderr?.toString())
    const lines = result.stdout.toString('utf8').split('\n')
    return {
      bytes: result.stdout,
      hunks: lines.filter(line => line.startsWith('@@')).length,
      addedTokens: lines.filter(
        line => line.startsWith('+') && !line.startsWith('+++'),
      ).length,
      deletedTokens: lines.filter(
        line => line.startsWith('-') && !line.startsWith('---'),
      ).length,
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
}

function selectArtifactPhase(typedAudit, sourceCoverage, sourceCoverageRaw) {
  const phase = fixture.artifactPhasePolicy.acceptedPairs.find(
    pair =>
      pair.typedAudit.bytes === typedAudit.bytes &&
      pair.typedAudit.sha256 === typedAudit.sha256 &&
      pair.sourceCoverage.bytes === sourceCoverage.bytes &&
      pair.sourceCoverage.sha256 === sourceCoverage.sha256 &&
      (pair.sourceCoverageRaw === undefined
        ? sourceCoverageRaw === undefined
        : sourceCoverageRaw !== undefined &&
          pair.sourceCoverageRaw.bytes === sourceCoverageRaw.bytes &&
          pair.sourceCoverageRaw.sha256 === sourceCoverageRaw.sha256),
  )
  assert.ok(phase, 'unknown or hybrid report/coverage pair')
  return phase.phase
}

function clone(value) {
  return structuredClone(value)
}

let typescriptPromise
function loadTypeScript() {
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

function byteOffset(source, characterOffset) {
  return Buffer.byteLength(source.slice(0, characterOffset))
}

function declarationRecord(bytes, source, sourceFile, node) {
  const characterStart = node.getStart(sourceFile)
  const characterEnd = node.end
  const byteStart = byteOffset(source, characterStart)
  const byteEnd = byteOffset(source, characterEnd)
  return {
    characterStart,
    characterEnd,
    byteStart,
    byteEnd,
    ...descriptor(bytes.subarray(byteStart, byteEnd)),
    text: source.slice(characterStart, characterEnd),
  }
}

function recordProjection(record) {
  const { text: _text, ...projection } = record
  return projection
}

async function inspectSource(bytes, input, label) {
  assert.deepEqual(
    descriptor(bytes),
    { bytes: input.file.bytes, sha256: input.file.sha256 },
    `${label} file`,
  )
  assert.equal(gitBlobSha1(bytes), input.file.gitBlobSha1)
  const ts = await loadTypeScript()
  const source = bytes.toString('utf8')
  const sourceFile = ts.createSourceFile(
    fixture.sourceGraph.sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, label)
  const functions = new Map()
  const branches = new Map()
  let pluginSourceInExpression = null
  const visit = node => {
    if (
      ts.isFunctionDeclaration(node) &&
      ['runHeadless', 'runHeadlessStreaming'].includes(node.name?.text)
    ) {
      assert.equal(functions.has(node.name.text), false)
      functions.set(node.name.text, node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.deepEqual([...functions.keys()].sort(), [
    'runHeadless',
    'runHeadlessStreaming',
  ])
  const streamingNode = functions.get('runHeadlessStreaming')
  const callerNode = functions.get('runHeadless')
  const visitStreaming = node => {
    if (ts.isIfStatement(node)) {
      const expression = node.expression.getText(sourceFile)
      for (const subtype of [
        'get_binary_version',
        'mcp_oauth_callback_url',
        'message_rated',
      ]) {
        if (expression.includes(`'${subtype}'`)) {
          const characterStart = node.expression.getStart(sourceFile)
          const characterEnd = node.thenStatement.end
          const byteStart = byteOffset(source, characterStart)
          const byteEnd = byteOffset(source, characterEnd)
          branches.set(subtype, {
            characterStart,
            characterEnd,
            byteStart,
            byteEnd,
            ...descriptor(bytes.subarray(byteStart, byteEnd)),
            text: source.slice(characterStart, characterEnd),
          })
        }
      }
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.InKeyword &&
      node.left.getText(sourceFile).includes('pluginSource')
    ) {
      const characterStart = node.getStart(sourceFile)
      const characterEnd = node.end
      const byteStart = byteOffset(source, characterStart)
      const byteEnd = byteOffset(source, characterEnd)
      pluginSourceInExpression = {
        characterStart,
        characterEnd,
        byteStart,
        byteEnd,
        ...descriptor(bytes.subarray(byteStart, byteEnd)),
        text: source.slice(characterStart, characterEnd),
      }
    }
    ts.forEachChild(node, visitStreaming)
  }
  visitStreaming(streamingNode)
  const streaming = declarationRecord(
    bytes,
    source,
    sourceFile,
    streamingNode,
  )
  const caller = declarationRecord(bytes, source, sourceFile, callerNode)
  assert.deepEqual(
    recordProjection(streaming),
    input.streamingDeclaration,
    `${label} streaming declaration`,
  )
  assert.deepEqual(
    {
      ...recordProjection(caller),
      runHeadlessStreamingOccurrences: countOccurrences(
        caller.text,
        'runHeadlessStreaming',
      ),
    },
    input.callerDeclaration,
    `${label} caller declaration`,
  )
  assert.deepEqual(
    fixture.sourceGraph.markers.map(marker =>
      countOccurrences(streaming.text, marker),
    ),
    input.markerCounts,
    `${label} source markers`,
  )
  const actualBranches = {
    oauthCallbackBranch: branches.get('mcp_oauth_callback_url') ?? null,
    getBinaryVersionBranch: branches.get('get_binary_version') ?? null,
    messageRatedBranch: branches.get('message_rated') ?? null,
    pluginSourceInExpression,
  }
  for (const [name, expected] of Object.entries({
    oauthCallbackBranch: input.oauthCallbackBranch,
    getBinaryVersionBranch: input.getBinaryVersionBranch,
    messageRatedBranch: input.messageRatedBranch,
    pluginSourceInExpression: input.pluginSourceInExpression,
  })) {
    const actual = actualBranches[name]
    if (expected === null) {
      assert.equal(actual, null, `${label} ${name}`)
      continue
    }
    assert.ok(actual, `${label} ${name}`)
    const { canonical: _canonical, ...expectedProjection } = expected
    assert.deepEqual(
      recordProjection(actual),
      expectedProjection,
      `${label} ${name}`,
    )
  }
  return { streaming, caller, ...actualBranches }
}

function gitFile(commit, input) {
  const result = spawnSync(
    'git',
    ['show', `${commit}:${fixture.sourceGraph.sourcePath}`],
    { cwd: root, encoding: null },
  )
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), {
    bytes: input.file.bytes,
    sha256: input.file.sha256,
  })
  const tree = spawnSync('git', ['rev-parse', `${commit}^{tree}`], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(tree.status, 0, tree.stderr)
  return result.stdout
}

test('u21742 fixture, helper, artifact selector, and frozen partitions are exact', {
  skip: !selected,
}, () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  readExact(fixture.inputs.helper)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, caseName)
  assert.equal(
    fixture.status,
    'authenticated-static-complete-unit-production-strict-residue-owner-proof-no-replay',
  )
  assert.deepEqual(
    helper.TARGET119_HEADLESS_STREAMING_STRICT_RESIDUE_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
  assert.deepEqual(
    helper.TARGET119_HEADLESS_STREAMING_STRICT_RESIDUE_DEPENDENCY_TARGET_INDICES,
    fixture.dependencyGraph.dependencyTargetIndices,
  )
  const overrides =
    helper.TARGET119_HEADLESS_STREAMING_STRICT_RESIDUE_OWNER_OVERRIDES
  assert.equal(overrides.length, 1)
  assert.deepEqual(
    {
      key: overrides[0].key,
      targetIndex: overrides[0].targetIndex,
      paths: [...overrides[0].paths],
      declarations: [...overrides[0].declarations],
      dependencyTargetIndices: [...overrides[0].dependencyTargetIndices],
      evidenceIds: [...overrides[0].evidenceIds],
    },
    {
      key: fixture.override.key,
      targetIndex: fixture.override.targetIndex,
      paths: fixture.override.ownerPaths,
      declarations: fixture.override.declarations,
      dependencyTargetIndices: fixture.override.dependencyTargetIndices,
      evidenceIds: fixture.evidenceIds,
    },
  )
  assert.match(overrides[0].behavior, /complete runHeadlessStreaming successor/)
  assert.match(overrides[0].behavior, /no source replay is authorized/)

  const [accepted, postStreaming] =
    fixture.artifactPhasePolicy.acceptedPairs
  assert.equal(
    selectArtifactPhase(accepted.typedAudit, accepted.sourceCoverage),
    'post-rendezvous',
  )
  assert.equal(
    selectArtifactPhase(
      postStreaming.typedAudit,
      postStreaming.sourceCoverage,
      postStreaming.sourceCoverageRaw,
    ),
    'post-streaming',
  )
  assert.throws(
    () =>
      selectArtifactPhase(
        postStreaming.typedAudit,
        postStreaming.sourceCoverage,
      ),
    /unknown or hybrid/,
  )
  const unknownReport = clone(accepted.typedAudit)
  unknownReport.sha256 = '0'.repeat(64)
  assert.throws(
    () => selectArtifactPhase(unknownReport, accepted.sourceCoverage),
    /unknown or hybrid/,
  )
  const unknownCoverage = clone(accepted.sourceCoverage)
  unknownCoverage.bytes += 1
  assert.throws(
    () => selectArtifactPhase(accepted.typedAudit, unknownCoverage),
    /unknown or hybrid/,
  )

  const snapshots = fixture.snapshotPartitions
  assert.deepEqual(
    partitionDescriptor(snapshots.typedResidues),
    snapshots.typedResiduesDescriptor,
  )
  assert.deepEqual(
    partitionDescriptor(snapshots.coverageTarget),
    snapshots.coverageTargetDescriptor,
  )
  assert.deepEqual(
    partitionDescriptor(snapshots.coverageGraphTuples),
    snapshots.coverageGraphDescriptor,
  )
  assert.deepEqual(
    partitionDescriptor(snapshots.ownerCatalog),
    snapshots.ownerCatalogDescriptor,
  )
  assert.deepEqual(
    snapshots.typedResidues.map(row => row.target.start),
    [
      ...fixture.strictPartition.newDiffRowOffsets,
      ...fixture.strictPartition.inheritedRowOffsets,
    ],
  )
  assert.equal(
    snapshots.typedResidues.every(
      row =>
        row.structural.index === fixture.units.targetStreaming.index &&
        row.structural.sourceHash === fixture.units.targetStreaming.sha256 &&
        row.disposition === 'source-runtime-covered' &&
        row.ownerPaths.length === 1 &&
        row.ownerPaths[0] === 'cli/print.ts',
    ),
    true,
  )
  assert.deepEqual(
    snapshots.coverageGraphTuples.map(row => row[0]),
    [20928, 21741, 21742],
  )
  const override =
    helper.TARGET119_HEADLESS_STREAMING_STRICT_RESIDUE_OWNER_OVERRIDES[0]
  const strengthened = [
    {
      ...snapshots.coverageTarget[0],
      evidenceIds: [...override.evidenceIds],
      behavior: override.behavior,
    },
  ]
  assert.deepEqual(
    partitionDescriptor(strengthened),
    fixture.postStreaming.coverageTargetDescriptor,
  )
  const callerProof = JSON.parse(
    readExact(fixture.inputs.dependencyProofs.target119Caller),
  )
  const strengthenedGraphTuples = snapshots.coverageGraphTuples.map(row => {
    if (row[0] === 21741) {
      return [...row.slice(0, 8), [...callerProof.evidenceIds]]
    }
    if (row[0] === 21742) {
      return [...row.slice(0, 8), [...override.evidenceIds]]
    }
    return row
  })
  assert.deepEqual(
    partitionDescriptor(strengthenedGraphTuples),
    fixture.postStreaming.coverageGraphTupleDescriptor,
  )
  assert.deepEqual(fixture.postStreaming, {
    typedResiduesDescriptor: snapshots.typedResiduesDescriptor,
    coverageTargetDescriptor: {
      rows: 1,
      jsonBytes: 1915,
      sha256:
        '9a8b494c5702a48b189167a711f633736c1e96df6f5794ee1bcc86015cd59217',
    },
    coverageGraphTupleDescriptor: {
      rows: 3,
      jsonBytes: 1607,
      sha256:
        '6acc35e423a9c213e6b152a1484a81f5cb6582602718b7b458ec98122b78b50b',
    },
    typedResiduesUnchangedFromPostRendezvous: true,
    coverageTargetEqualsPostWiringProjection: true,
  })
})

test('u21742 and manual predecessor u20836 are complete authenticated units with an exact thirteen-hunk diff', {
  skip: !selected,
}, () => {
  const structuralBytes = readExact(fixture.inputs.structural)
  const structural = JSON.parse(gunzipSync(structuralBytes))
  const targetRegion = structural.regions.find(
    region => region.target?.index === fixture.units.targetStreaming.index,
  )
  assert.ok(targetRegion)
  assert.equal(targetRegion.classification, 'unresolved')
  assert.equal(
    targetRegion.unknownFreeIdentifierCount,
    fixture.units.targetStreaming.unknownFreeIdentifierCount,
  )
  assert.deepEqual(
    structuralProjection(targetRegion.target),
    expectedStructural(fixture.units.targetStreaming),
  )
  const baselineUnit = structural.unmatchedBaseline.find(
    unit => unit.index === fixture.units.baselineStreaming.index,
  )
  assert.ok(baselineUnit)
  assert.deepEqual(
    structuralProjection(baselineUnit),
    expectedStructural(fixture.units.baselineStreaming),
  )

  const baseline = parseUnit(
    readArtifact(fixture.inputs.baselineBundle),
    fixture.units.baselineStreaming,
  )
  const target = parseUnit(
    readArtifact(fixture.inputs.targetBundle),
    fixture.units.targetStreaming,
  )
  assert.deepEqual(
    canonicalStreamDescriptor(baseline.tokens),
    fixture.predecessorProof.canonicalTokenStreams.baseline,
  )
  assert.deepEqual(
    canonicalStreamDescriptor(target.tokens),
    fixture.predecessorProof.canonicalTokenStreams.target,
  )
  const diff = normalizedDiff(baseline.tokens, target.tokens)
  const expected = fixture.predecessorProof.normalizedCompleteUnitDiff
  assert.deepEqual(
    {
      ...descriptor(diff.bytes),
      hunks: diff.hunks,
      addedTokens: diff.addedTokens,
      deletedTokens: diff.deletedTokens,
    },
    {
      bytes: expected.bytes,
      sha256: expected.sha256,
      hunks: expected.hunks,
      addedTokens: expected.addedTokens,
      deletedTokens: expected.deletedTokens,
    },
  )
})

test('all fifteen strict rows are either exact new diff fragments or unique inherited predecessors', {
  skip: !selected,
}, () => {
  const baseline = parseUnit(
    readArtifact(fixture.inputs.baselineBundle),
    fixture.units.baselineStreaming,
  )
  const target = parseUnit(
    readArtifact(fixture.inputs.targetBundle),
    fixture.units.targetStreaming,
  )
  const baselineFragments = compiledFragments(baseline)
  const targetFragments = compiledFragments(target)

  const newFragments = fixture.strictPartition.newCompiledFragments
  exactFragment(
    targetFragments.pluginSource,
    newFragments.pluginSourceInExpression,
    'compiled pluginSource expression',
  )
  assert.deepEqual(
    canonicalDescriptor(targetFragments.pluginSource.text),
    newFragments.pluginSourceInExpression.canonical,
  )
  assert.equal(baselineFragments.pluginSource, undefined)
  exactFragment(
    targetFragments.get_binary_version,
    newFragments.getBinaryVersionBranch,
    'compiled get_binary_version branch',
  )
  assert.deepEqual(
    canonicalDescriptor(targetFragments.get_binary_version.text),
    newFragments.getBinaryVersionBranch.canonical,
  )
  assert.equal(baselineFragments.get_binary_version, undefined)
  for (const [value, count] of Object.entries(
    newFragments.getBinaryVersionBranch.expandedValues,
  )) {
    assert.equal(countOccurrences(targetFragments.get_binary_version.text, value), count)
    assert.equal(countOccurrences(baseline.text, value), 0)
  }

  const inherited = fixture.strictPartition.inheritedCompiledFragments
  for (const [name, baselineName, targetName] of [
    ['oauthCallback', 'mcp_oauth_callback_url', 'mcp_oauth_callback_url'],
    ['syntheticResponseCall', 'syntheticCall', 'syntheticCall'],
    ['messageRatedBranch', 'message_rated', 'message_rated'],
  ]) {
    exactFragment(
      baselineFragments[baselineName],
      inherited[name].baseline,
      `${name} baseline`,
    )
    exactFragment(
      targetFragments[targetName],
      inherited[name].target,
      `${name} target`,
    )
    assert.deepEqual(
      canonicalDescriptor(baselineFragments[baselineName].text),
      inherited[name].canonical,
    )
    assert.deepEqual(
      canonicalDescriptor(targetFragments[targetName].text),
      inherited[name].canonical,
    )
  }

  const radius = fixture.predecessorProof.neighborhoodRadius
  const inheritedRows = fixture.snapshotPartitions.typedResidues.filter(row =>
    fixture.strictPartition.inheritedRowOffsets.includes(row.target.start),
  )
  assert.equal(
    inheritedRows.length,
    fixture.predecessorProof.inheritedResiduePredecessors.length,
  )
  for (const [index, proof] of
    fixture.predecessorProof.inheritedResiduePredecessors.entries()) {
    const row = inheritedRows[index]
    const targetToken = target.tokens[proof.targetTokenIndex]
    const baselineToken = baseline.tokens[proof.baselineTokenIndex]
    assert.deepEqual(
      [targetToken.start, targetToken.end, targetToken.raw, targetToken.canonical],
      proof.target,
    )
    assert.deepEqual(
      [
        baselineToken.start,
        baselineToken.end,
        baselineToken.raw,
        baselineToken.canonical,
      ],
      proof.baseline,
    )
    assert.deepEqual([targetToken.start, targetToken.end], [row.target.start, row.target.end])
    assert.equal(proof.value, row.value)
    const targetContext = target.tokens
      .slice(proof.targetTokenIndex - radius, proof.targetTokenIndex + radius + 1)
      .map(token => token.canonical)
    assert.equal(
      sha256(Buffer.from(JSON.stringify(targetContext))),
      proof.canonicalNeighborhoodSha256,
    )
    const candidates = []
    for (
      let candidateIndex = radius;
      candidateIndex < baseline.tokens.length - radius;
      candidateIndex += 1
    ) {
      const candidate = baseline.tokens[candidateIndex]
      if (
        candidate.raw === targetToken.raw &&
        candidate.canonical === targetToken.canonical
      ) {
        const candidateContext = baseline.tokens
          .slice(candidateIndex - radius, candidateIndex + radius + 1)
          .map(token => token.canonical)
        if (
          sha256(Buffer.from(JSON.stringify(candidateContext))) ===
          proof.canonicalNeighborhoodSha256
        ) {
          candidates.push(candidateIndex)
        }
      }
    }
    assert.deepEqual(candidates, [proof.baselineTokenIndex])
  }
})

test('exact cli/print.ts source states close the caller and authored branch graph without authorizing replay', {
  skip: !selected,
}, async () => {
  const baselineCommit = fixture.inputs.sourceCommits.baseline
  const targetCommit = fixture.inputs.sourceCommits.target
  const baselineTree = spawnSync(
    'git',
    ['rev-parse', `${baselineCommit.commit}^{tree}`],
    { cwd: root, encoding: 'utf8' },
  )
  const targetTree = spawnSync(
    'git',
    ['rev-parse', `${targetCommit.commit}^{tree}`],
    { cwd: root, encoding: 'utf8' },
  )
  assert.equal(baselineTree.status, 0, baselineTree.stderr)
  assert.equal(targetTree.status, 0, targetTree.stderr)
  assert.equal(baselineTree.stdout.trim(), baselineCommit.tree)
  assert.equal(targetTree.stdout.trim(), targetCommit.tree)

  const baselineSource = await inspectSource(
    gitFile(baselineCommit.commit, fixture.sourceGraph.baselineHistorical),
    fixture.sourceGraph.baselineHistorical,
    'historical Target118',
  )
  const historicalInput = fixture.sourceGraph.targetStates.find(
    state => state.name === 'historical-target119',
  )
  const historicalSource = await inspectSource(
    gitFile(targetCommit.commit, historicalInput),
    historicalInput,
    'historical Target119',
  )
  assert.equal(baselineSource.getBinaryVersionBranch, null)
  assert.ok(historicalSource.getBinaryVersionBranch)
  assert.equal(
    historicalSource.getBinaryVersionBranch.text.includes(
      'version: MACRO.VERSION',
    ),
    true,
  )
  assert.equal(
    historicalSource.getBinaryVersionBranch.text.includes(
      'buildTime: MACRO.BUILD_TIME',
    ),
    true,
  )
  assert.equal(
    baselineSource.oauthCallbackBranch.text,
    historicalSource.oauthCallbackBranch.text,
  )

  const selectedBytes = fs.readFileSync(
    path.join(selectedSourceRoot, 'cli/print.ts'),
  )
  const selectedDescriptor = descriptor(selectedBytes)
  const selectedInput = fixture.sourceGraph.targetStates.find(
    state =>
      state.file.bytes === selectedDescriptor.bytes &&
      state.file.sha256 === selectedDescriptor.sha256,
  )
  assert.ok(selectedInput, 'selected Target119/later source state is exact')
  const selectedSource = await inspectSource(
    selectedBytes,
    selectedInput,
    selectedInput.name,
  )
  assert.ok(selectedSource.getBinaryVersionBranch)
  assert.equal(
    selectedSource.getBinaryVersionBranch.text.includes(
      'version: MACRO.VERSION',
    ),
    true,
  )
  assert.equal(
    selectedSource.streaming.text.includes('synthetic:'),
    false,
  )
  if (selectedInput.pluginSourceInExpression) {
    assert.deepEqual(
      canonicalDescriptor(selectedSource.pluginSourceInExpression.text),
      selectedInput.pluginSourceInExpression.canonical,
    )
    assert.deepEqual(
      selectedInput.pluginSourceInExpression.canonical,
      fixture.strictPartition.newCompiledFragments.pluginSourceInExpression
        .canonical,
    )
    assert.ok(selectedSource.messageRatedBranch)
  } else {
    assert.equal(selectedSource.pluginSourceInExpression, null)
    assert.equal(selectedSource.messageRatedBranch, null)
  }

  assert.equal(fixture.replayDisposition.mode, 'static-only')
  assert.equal(fixture.replayDisposition.sourceReplayAuthorized, false)
  assert.equal(fixture.replayDisposition.replayHelper, null)
  assert.equal(fixture.units.targetStreaming.unknownFreeIdentifierCount, 20)
})

test('the exact caller, SDK schema, and inherited predecessor proofs close the static dependency graph', {
  skip: !selected,
}, () => {
  const dependencies = fixture.inputs.dependencyProofs
  const caller = JSON.parse(readExact(dependencies.target119Caller))
  assert.equal(caller.units.targetHeadless.index, 21741)
  assert.equal(caller.override.targetIndex, 21741)
  assert.deepEqual(caller.override.ownerPaths, ['src/cli/print.ts'])

  const sdk = JSON.parse(readExact(dependencies.target119SdkControl))
  assert.equal(sdk.targetUnit.targetIndex, 20928)
  assert.equal(sdk.forwardSubagentRuntimeGraph.unitIndices.includes(21742), true)
  assert.deepEqual(
    sdk.forwardSubagentRuntimeGraph.occurrences.filter(row => row[1] === 21742),
    [
      [13536673, 21742],
      [13536695, 21742],
    ],
  )
  const messageRated = sdk.inheritedReplayContracts.find(
    contract => contract.name === 'SDKControlMessageRatedRequestSchema',
  )
  assert.deepEqual(
    messageRated.properties,
    fixture.dependencyGraph.sdkControlSchema.messageRatedRequestFields,
  )
  assert.deepEqual(
    messageRated.literals,
    fixture.dependencyGraph.sdkControlSchema.messageRatedLiterals,
  )
  assert.equal(sdk.sourceReplay.authorized, false)

  const target118 = JSON.parse(
    readExact(dependencies.target118HeadlessStreaming),
  )
  const target117 = JSON.parse(
    readExact(dependencies.target117HeadlessStreaming),
  )
  assert.equal(target118.targetUnit.targetIndex, 20836)
  assert.equal(target118.baselineUnit.targetIndex, 20646)
  assert.equal(target117.targetUnit.targetIndex, 20646)
  assert.equal(target118.sourceReplayBlocker.replayHelper, null)
  assert.match(target117.sourceReplayBlocker.decision, /no replay/)

  assert.deepEqual(
    fixture.override.dependencyTargetIndices,
    fixture.dependencyGraph.dependencyTargetIndices,
  )
  assert.deepEqual(fixture.postWiring.expectedImpact, {
    coverageRowsChanged: 1,
    coverageCardinalityDelta: 0,
    ownerPathChanges: 0,
    evidenceBehaviorCorrections: 1,
    replayOutputs: 0,
  })
  assert.equal(fixture.wiringRecipe.replayExport, null)
  assert.equal(fixture.wiringRecipe.combinedHarnessChangeRequired, false)
})
