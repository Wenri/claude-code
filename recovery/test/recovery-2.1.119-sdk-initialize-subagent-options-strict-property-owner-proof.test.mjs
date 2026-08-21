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
import * as helper from '../cases/2.1.118-to-2.1.119/recovered/sdk-initialize-subagent-options-strict-property-owner-overrides.mjs'
import * as schemaHelper from '../cases/2.1.118-to-2.1.119/recovered/sdk-control-inherited-schema-owner-overrides.mjs'
import * as streamingHelper from '../cases/2.1.118-to-2.1.119/recovered/headless-streaming-strict-residue-owner-overrides.mjs'

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
  'recovery/test/recovery-2.1.119-sdk-initialize-subagent-options-strict-property-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const FIXTURE_SHA256 =
  '3d04031053780f11f30db599a0dbf8fb68de33b1ac4a7001fb8e922ac7e5cd03'

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

function canonicalDescriptor(value) {
  const canonical = tokens(value).map(token => token.canonical)
  const bytes = Buffer.from(JSON.stringify(canonical))
  return {
    tokens: canonical.length,
    jsonBytes: bytes.length,
    sha256: sha256(bytes),
  }
}

function canonicalStreamDescriptor(value) {
  const bytes = Buffer.from(
    JSON.stringify(value.map(token => token.canonical)),
  )
  return {
    tokens: value.length,
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

function walk(node, visitor) {
  if (node === null || typeof node !== 'object') return
  visitor(node)
  for (const [key, child] of Object.entries(node)) {
    if (['end', 'loc', 'range', 'raw', 'start'].includes(key)) continue
    if (Array.isArray(child)) {
      for (const nested of child) walk(nested, visitor)
    } else {
      walk(child, visitor)
    }
  }
}

function localRecord(unit, node) {
  const bytes = unit.bytes.subarray(node.start, node.end)
  return {
    start: unit.tokens[0].start + node.start,
    end: unit.tokens[0].start + node.end,
    ...descriptor(bytes),
    text: bytes.toString('utf8'),
    canonical: canonicalDescriptor(bytes.toString('utf8')),
  }
}

function compiledFragments(unit) {
  const result = {}
  walk(unit.node, node => {
    if (node.type === 'IfStatement') {
      const text = unit.text.slice(node.start, node.end)
      for (const marker of [
        'appendSubagentSystemPrompt',
        'forwardSubagentText',
      ]) {
        if (text.includes(marker) && result[marker] === undefined) {
          result[marker] = localRecord(unit, node)
        }
      }
    }
    if (node.type === 'ConditionalExpression') {
      const text = unit.text.slice(node.start, node.end)
      if (text.includes('.aliases') && result.aliasesConditional === undefined) {
        result.aliasesConditional = localRecord(unit, node)
      }
    }
  })
  return result
}

function propertyFragments(unit, propertyName) {
  const output = []
  walk(unit.node, node => {
    if (node.type !== 'Property') return
    const key =
      node.key?.type === 'Identifier' ? node.key.name : node.key?.value
    if (key === propertyName) output.push(localRecord(unit, node))
  })
  return output
}

function occurrenceRecords(unit, value, radius = 40) {
  return unit.tokens.flatMap((token, tokenIndex) => {
    if (token.raw !== value) return []
    const neighborhood = unit.tokens.slice(
      Math.max(0, tokenIndex - radius),
      Math.min(unit.tokens.length, tokenIndex + radius + 1),
    )
    const canonical = canonicalStreamDescriptor(neighborhood)
    return [
      {
        tokenIndex,
        start: token.start,
        end: token.end,
        neighborhoodRadius: radius,
        neighborhoodTokens: canonical.tokens,
        neighborhoodJsonBytes: canonical.jsonBytes,
        neighborhoodSha256: canonical.sha256,
      },
    ]
  })
}

function normalizedDiff(baselineTokens, targetTokens) {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target119-u21747-diff-'),
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
    const expected = fixture.predecessorProof.normalizedCompleteUnitDiff
    const result = spawnSync(
      'diff',
      [
        '-U',
        '0',
        '--label',
        expected.baselineLabel,
        '--label',
        expected.targetLabel,
        baselinePath,
        targetPath,
      ],
      { encoding: null, maxBuffer: 1_000_000 },
    )
    assert.equal(result.status, 1, result.stderr?.toString())
    const lines = result.stdout.toString('utf8').split('\n')
    return {
      ...descriptor(result.stdout),
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

function rowTuple(row) {
  return [
    row.value,
    row.literalKind,
    row.targetAdded,
    row.baselineOccurrenceCount,
    row.targetOccurrenceNumber,
    row.target.start,
    row.target.end,
    row.structural.index,
    row.structural.classification,
    row.structural.sourceHash,
    row.disposition,
    row.ownerPaths,
  ]
}

function coverageTuple(row) {
  return [
    row.targetIndex,
    row.start,
    row.end,
    row.nodeType,
    row.sourceHash,
    row.structuralClass,
    row.disposition,
    row.ownerIds,
    row.evidenceIds,
  ]
}

function selectArtifactPhase(typedAudit, sourceCoverage, sourceCoverageRaw) {
  const phase = fixture.artifactPhasePolicy.acceptedPairs.find(
    pair =>
      pair.typedAudit.bytes === typedAudit.bytes &&
      pair.typedAudit.sha256 === typedAudit.sha256 &&
      pair.sourceCoverage.bytes === sourceCoverage.bytes &&
      pair.sourceCoverage.sha256 === sourceCoverage.sha256 &&
      pair.sourceCoverageRaw.bytes === sourceCoverageRaw.bytes &&
      pair.sourceCoverageRaw.sha256 === sourceCoverageRaw.sha256,
  )
  assert.ok(phase, 'unknown or hybrid report/coverage pair')
  return phase.phase
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

function occurrencesInBundle(bundle, value, targetUnits) {
  const output = []
  let offset = 0
  while (true) {
    const start = bundle.indexOf(value, offset)
    if (start < 0) return output
    const owner = targetUnits.find(
      unit => unit.start <= start && start < unit.end,
    )
    assert.ok(owner, `${value} at ${start} has no structural owner`)
    output.push([start, owner.index])
    offset = start + value.length
  }
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

function sourceNodeRecord(bytes, source, sourceFile, node) {
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

function sourceRecordProjection(record) {
  const { text: _text, ...projection } = record
  return projection
}

async function inspectPrintSource(bytes, input, label) {
  assert.deepEqual(descriptor(bytes), {
    bytes: input.file.bytes,
    sha256: input.file.sha256,
  })
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
  let initializeNode
  let streamingNode
  const visit = node => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === 'handleInitializeRequest'
    ) {
      assert.equal(initializeNode, undefined, label)
      initializeNode = node
    }
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === 'runHeadlessStreaming'
    ) {
      assert.equal(streamingNode, undefined, label)
      streamingNode = node
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.ok(initializeNode, label)
  assert.ok(streamingNode, label)
  const initialize = sourceNodeRecord(
    bytes,
    source,
    sourceFile,
    initializeNode,
  )
  assert.deepEqual(
    sourceRecordProjection(initialize),
    input.handleInitializeRequest,
    `${label} declaration`,
  )
  const markers = [
    'appendSubagentSystemPrompt',
    'forwardSubagentText',
    'excludeDynamicSections',
    'aliases',
    'tengu_sdk_init_handshake',
    'uptime_ms',
    'mcp_client_count',
    'mcp_pending_count',
    'randomUUID',
  ]
  const markerCounts = Object.fromEntries(
    markers.map(marker => [
      marker,
      initialize.text.split(marker).length - 1,
    ]),
  )
  assert.deepEqual(markerCounts, input.markerCounts, `${label} markers`)

  const calls = new Set()
  const transfers = {}
  const visitInitialize = node => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      calls.add(node.expression.text)
    }
    if (ts.isIfStatement(node)) {
      const text = node.getText(sourceFile)
      for (const marker of [
        'appendSubagentSystemPrompt',
        'forwardSubagentText',
      ]) {
        if (text.includes(marker) && transfers[marker] === undefined) {
          transfers[marker] = sourceNodeRecord(
            bytes,
            source,
            sourceFile,
            node,
          )
        }
      }
    }
    ts.forEachChild(node, visitInitialize)
  }
  visitInitialize(initializeNode)

  let streamingForwardProperty
  const visitStreaming = node => {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(sourceFile) === 'forwardSubagentText'
    ) {
      streamingForwardProperty = sourceNodeRecord(
        bytes,
        source,
        sourceFile,
        node,
      )
    }
    ts.forEachChild(node, visitStreaming)
  }
  visitStreaming(streamingNode)
  return {
    calls: [...calls].sort(),
    transfers,
    streamingForwardProperty,
  }
}

async function inspectControlSchema(bytes, input, label) {
  assert.deepEqual(descriptor(bytes), {
    bytes: input.file.bytes,
    sha256: input.file.sha256,
  })
  assert.equal(gitBlobSha1(bytes), input.file.gitBlobSha1)
  const ts = await loadTypeScript()
  const source = bytes.toString('utf8')
  const sourceFile = ts.createSourceFile(
    'src/entrypoints/sdk/controlSchemas.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, label)
  let declaration
  let forwardProperty
  const visit = node => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(sourceFile) === 'SDKControlInitializeRequestSchema'
    ) {
      declaration = node
    }
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(sourceFile) === 'forwardSubagentText'
    ) {
      forwardProperty = node
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.ok(declaration, label)
  assert.deepEqual(
    sourceRecordProjection(
      sourceNodeRecord(bytes, source, sourceFile, declaration),
    ),
    input.initializeDeclaration,
  )
  const markerCounts = Object.fromEntries(
    ['appendSubagentSystemPrompt', 'forwardSubagentText'].map(marker => [
      marker,
      source.split(marker).length - 1,
    ]),
  )
  assert.deepEqual(markerCounts, input.markerCounts)
  return forwardProperty
    ? sourceNodeRecord(bytes, source, sourceFile, forwardProperty)
    : null
}

test(
  'Target119 u21747 helper and dependency contracts are frozen static-only evidence',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.deepEqual(
      helper.TARGET119_SDK_INITIALIZE_SUBAGENT_OPTIONS_STRICT_PROPERTY_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      helper.TARGET119_SDK_INITIALIZE_SUBAGENT_OPTIONS_STRICT_PROPERTY_DEPENDENCY_TARGET_INDICES,
      fixture.override.dependencyTargetIndices,
    )
    const overrides =
      helper.TARGET119_SDK_INITIALIZE_SUBAGENT_OPTIONS_STRICT_PROPERTY_OWNER_OVERRIDES
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
    assert.ok(overrides[0].behavior.includes('Target118 u20841'))
    assert.ok(overrides[0].behavior.includes('u20928'))
    assert.ok(overrides[0].behavior.includes('u21742'))
    assert.ok(overrides[0].behavior.includes('no source replay'))
    assert.ok(Object.isFrozen(overrides))
    assert.ok(Object.isFrozen(overrides[0]))
    assert.ok(Object.isFrozen(overrides[0].paths))
    assert.ok(Object.isFrozen(overrides[0].declarations))
    assert.equal(fixture.replayDisposition.mode, 'static-only')
    assert.equal(fixture.replayDisposition.sourceReplayAuthorized, false)
    assert.equal(fixture.wiringRecipe.replayExport, null)

    for (const input of Object.values(fixture.inputs.dependencyProofs)) {
      readExact(input)
    }
    const schemaOverride =
      schemaHelper.TARGET119_SDK_CONTROL_INHERITED_SCHEMA_OWNER_OVERRIDES[0]
    const streamingOverride =
      streamingHelper.TARGET119_HEADLESS_STREAMING_STRICT_RESIDUE_OWNER_OVERRIDES[0]
    assert.equal(schemaOverride.targetIndex, 20928)
    assert.equal(streamingOverride.targetIndex, 21742)
    assert.ok(streamingOverride.dependencyTargetIndices.includes(20928))
    assert.deepEqual(
      fixture.compiledDependencyGraph.dependencyProofContracts,
      {
        schemaTargetIndex: schemaOverride.targetIndex,
        schemaExport:
          'TARGET119_SDK_CONTROL_INHERITED_SCHEMA_OWNER_OVERRIDES',
        streamingTargetIndex: streamingOverride.targetIndex,
        streamingExport:
          'TARGET119_HEADLESS_STREAMING_STRICT_RESIDUE_OWNER_OVERRIDES',
        streamingDependsOnSchema:
          streamingOverride.dependencyTargetIndices.includes(20928),
      },
    )
  },
)

test(
  'Target119 u21747 frozen exact-phase owner, added, strict, and coverage partitions are exact',
  { skip: !selected },
  () => {
    const accepted = fixture.artifactPhasePolicy.acceptedPairs[0]
    const typedAuditPath = path.resolve(
      process.env.CLAUDE_CODE_TYPED_AUDIT_PATH ??
        path.join(root, accepted.typedAudit.path),
    )
    const sourceCoveragePath = path.resolve(
      process.env.CLAUDE_CODE_SOURCE_COVERAGE_PATH ??
        path.join(root, accepted.sourceCoverage.path),
    )
    const typedAuditBytes = fs.readFileSync(typedAuditPath)
    const sourceCoverageBytes = fs.readFileSync(sourceCoveragePath)
    const sourceCoverageRaw = gunzipSync(sourceCoverageBytes)
    const typedAuditDescriptor = descriptor(typedAuditBytes)
    const sourceCoverageDescriptor = descriptor(sourceCoverageBytes)
    const sourceCoverageRawDescriptor = descriptor(sourceCoverageRaw)
    const artifactPhase = selectArtifactPhase(
      typedAuditDescriptor,
      sourceCoverageDescriptor,
      sourceCoverageRawDescriptor,
    )
    assert.ok(
      ['post-streaming', 'post-u21759', 'post-u21878'].includes(artifactPhase),
    )
    for (const pair of fixture.artifactPhasePolicy.acceptedPairs) {
      assert.equal(
        selectArtifactPhase(
          pair.typedAudit,
          pair.sourceCoverage,
          pair.sourceCoverageRaw,
        ),
        pair.phase,
      )
    }
    assert.throws(
      () =>
        selectArtifactPhase(
          { ...typedAuditDescriptor, bytes: typedAuditDescriptor.bytes + 1 },
          sourceCoverageDescriptor,
          sourceCoverageRawDescriptor,
        ),
      /unknown or hybrid/,
    )
    const [postStreaming, postU21759, postU21878] =
      fixture.artifactPhasePolicy.acceptedPairs
    assert.throws(
      () =>
        selectArtifactPhase(
          postStreaming.typedAudit,
          postStreaming.sourceCoverage,
          postU21759.sourceCoverageRaw,
        ),
      /unknown or hybrid/,
    )
    assert.throws(
      () =>
        selectArtifactPhase(
          postU21759.typedAudit,
          postU21878.sourceCoverage,
          postU21759.sourceCoverageRaw,
        ),
      /unknown or hybrid/,
    )
    assert.throws(
      () =>
        selectArtifactPhase(
          typedAuditDescriptor,
          { ...sourceCoverageDescriptor, sha256: '0'.repeat(64) },
          sourceCoverageRawDescriptor,
        ),
      /unknown or hybrid/,
    )

    const report = JSON.parse(typedAuditBytes)
    const coverage = JSON.parse(sourceCoverageRaw)
    const ownerRows = report.sourceRuntimeOwnerResidueRows.filter(
      row => row.structural.index === 21747,
    )
    const addedRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
      row => row.structural.index === 21747,
    )
    const strictRows = report.rows.filter(
      row => row.structural.index === 21747,
    )
    assert.deepEqual(
      partitionDescriptor(ownerRows),
      fixture.snapshotPartitions.ownerDescriptor,
    )
    assert.deepEqual(
      partitionDescriptor(addedRows),
      fixture.snapshotPartitions.addedDescriptor,
    )
    assert.deepEqual(
      partitionDescriptor(strictRows),
      fixture.snapshotPartitions.strictDescriptor,
    )
    const ownerTuples = ownerRows.map(rowTuple)
    const addedTuples = addedRows.map(rowTuple)
    const strictTuples = strictRows.map(rowTuple)
    assert.deepEqual(ownerTuples, fixture.snapshotPartitions.ownerTuples)
    assert.deepEqual(
      partitionDescriptor(ownerTuples),
      fixture.snapshotPartitions.ownerTupleDescriptor,
    )
    assert.deepEqual(
      addedTuples,
      fixture.snapshotPartitions.addedTupleIndexesIntoOwner.map(
        index => ownerTuples[index],
      ),
    )
    assert.deepEqual(
      strictTuples,
      fixture.snapshotPartitions.strictTupleIndexesIntoOwner.map(
        index => ownerTuples[index],
      ),
    )
    assert.deepEqual(
      partitionDescriptor(addedTuples),
      fixture.snapshotPartitions.addedTupleDescriptor,
    )
    assert.deepEqual(
      partitionDescriptor(strictTuples),
      fixture.snapshotPartitions.strictTupleDescriptor,
    )

    const coverageTarget = coverage.rows.filter(
      row => row.targetIndex === 21747,
    )
    const coverageProjection =
      artifactPhase === 'post-streaming'
        ? fixture.snapshotPartitions
        : fixture.snapshotPartitions.postU21759Coverage
    assert.deepEqual(
      partitionDescriptor(coverageTarget),
      coverageProjection.coverageTargetDescriptor,
    )
    const graphRows = coverage.rows.filter(row =>
      [20928, 21742, 21747].includes(row.targetIndex),
    )
    assert.deepEqual(
      partitionDescriptor(graphRows),
      coverageProjection.coverageGraphDescriptor,
    )
    const graphTuples = graphRows.map(coverageTuple)
    assert.deepEqual(
      graphTuples,
      coverageProjection.coverageGraphTuples,
    )
    assert.deepEqual(
      partitionDescriptor(graphTuples),
      coverageProjection.coverageGraphTupleDescriptor,
    )
    const owners = coverage.owners.filter(owner =>
      [
        'owner-src-cli-print-ts',
        'owner-src-entrypoints-sdk-controlSchemas-ts',
      ].includes(owner.id),
    )
    assert.deepEqual(owners, fixture.snapshotPartitions.ownerCatalog)
    assert.deepEqual(
      partitionDescriptor(owners),
      fixture.snapshotPartitions.ownerCatalogDescriptor,
    )
  },
)

test(
  'Target119 u21747 complete predecessor diff authenticates all six strict property rows',
  { skip: !selected },
  () => {
    const structuralBytes = readExact(fixture.inputs.structural)
    const structural = JSON.parse(gunzipSync(structuralBytes))
    const baselineBundle = readArtifact(fixture.inputs.baselineBundle)
    const targetBundle = readArtifact(fixture.inputs.targetBundle)
    const baselineInput = fixture.units.baselineInitialize
    const targetInput = fixture.units.targetInitialize
    const baselineUnit = parseUnit(baselineBundle, baselineInput)
    const targetUnit = parseUnit(targetBundle, targetInput)
    assert.equal(baselineUnit.node.body.body.length, baselineInput.bodyStatements)
    assert.equal(targetUnit.node.body.body.length, targetInput.bodyStatements)

    const structuralTarget = structural.regions[targetInput.index]
    assert.equal(structuralTarget.classification, targetInput.classification)
    assert.equal(
      structuralTarget.unknownFreeIdentifierCount,
      targetInput.unknownFreeIdentifierCount,
    )
    assert.deepEqual(
      structuralProjection(structuralTarget.target),
      expectedStructural(targetInput),
    )
    const structuralBaseline = structural.unmatchedBaseline.find(
      unit => unit.index === baselineInput.index,
    )
    assert.ok(structuralBaseline)
    assert.deepEqual(
      structuralProjection(structuralBaseline),
      expectedStructural(baselineInput),
    )

    assert.deepEqual(
      canonicalStreamDescriptor(baselineUnit.tokens),
      fixture.predecessorProof.canonicalTokenStreams.baseline,
    )
    assert.deepEqual(
      canonicalStreamDescriptor(targetUnit.tokens),
      fixture.predecessorProof.canonicalTokenStreams.target,
    )
    assert.deepEqual(
      normalizedDiff(baselineUnit.tokens, targetUnit.tokens),
      {
        bytes: fixture.predecessorProof.normalizedCompleteUnitDiff.bytes,
        sha256: fixture.predecessorProof.normalizedCompleteUnitDiff.sha256,
        hunks: fixture.predecessorProof.normalizedCompleteUnitDiff.hunks,
        addedTokens:
          fixture.predecessorProof.normalizedCompleteUnitDiff.addedTokens,
        deletedTokens:
          fixture.predecessorProof.normalizedCompleteUnitDiff.deletedTokens,
      },
    )

    const baselineFragments = compiledFragments(baselineUnit)
    const targetFragments = compiledFragments(targetUnit)
    const expectedFragments = fixture.predecessorProof.fragments
    const inheritedBaseline = baselineFragments.appendSubagentSystemPrompt
    const inheritedTarget = targetFragments.appendSubagentSystemPrompt
    assert.deepEqual(
      {
        start: inheritedBaseline.start,
        end: inheritedBaseline.end,
        bytes: inheritedBaseline.bytes,
        sha256: inheritedBaseline.sha256,
      },
      expectedFragments.inheritedAppendSubagentSystemPrompt.baseline,
    )
    assert.deepEqual(
      {
        start: inheritedTarget.start,
        end: inheritedTarget.end,
        bytes: inheritedTarget.bytes,
        sha256: inheritedTarget.sha256,
      },
      expectedFragments.inheritedAppendSubagentSystemPrompt.target,
    )
    assert.deepEqual(
      inheritedBaseline.canonical,
      expectedFragments.inheritedAppendSubagentSystemPrompt.canonical,
    )
    assert.deepEqual(inheritedTarget.canonical, inheritedBaseline.canonical)
    assert.equal(inheritedTarget.text, inheritedBaseline.text)

    const forward = targetFragments.forwardSubagentText
    assert.equal(baselineFragments.forwardSubagentText, undefined)
    assert.deepEqual(
      {
        start: forward.start,
        end: forward.end,
        bytes: forward.bytes,
        sha256: forward.sha256,
      },
      expectedFragments.newForwardSubagentText.target,
    )
    assert.deepEqual(
      forward.canonical,
      expectedFragments.newForwardSubagentText.canonical,
    )
    const aliases = targetFragments.aliasesConditional
    assert.equal(baselineFragments.aliasesConditional, undefined)
    assert.deepEqual(
      {
        start: aliases.start,
        end: aliases.end,
        bytes: aliases.bytes,
        sha256: aliases.sha256,
      },
      expectedFragments.newAliasesConditional.target,
    )
    assert.deepEqual(
      aliases.canonical,
      expectedFragments.newAliasesConditional.canonical,
    )

    const baselineAppend = occurrenceRecords(
      baselineUnit,
      'appendSubagentSystemPrompt',
    )
    const targetAppend = occurrenceRecords(
      targetUnit,
      'appendSubagentSystemPrompt',
    )
    assert.deepEqual(
      baselineAppend,
      fixture.strictPropertyProof.appendSubagentSystemPrompt
        .baselineUnitOccurrences,
    )
    assert.deepEqual(
      targetAppend,
      fixture.strictPropertyProof.appendSubagentSystemPrompt.targetUnitOccurrences.map(
        ({ targetOccurrenceNumber: _ordinal, ...record }) => record,
      ),
    )
    assert.deepEqual(
      baselineAppend.map(record => [
        record.tokenIndex,
        record.neighborhoodSha256,
      ]),
      targetAppend.map(record => [
        record.tokenIndex,
        record.neighborhoodSha256,
      ]),
    )
    assert.deepEqual(
      occurrenceRecords(targetUnit, 'forwardSubagentText').map(
        ({
          neighborhoodRadius: _radius,
          neighborhoodTokens: _tokens,
          neighborhoodJsonBytes: _bytes,
          neighborhoodSha256: _sha,
          ...record
        }) => record,
      ),
      fixture.strictPropertyProof.forwardSubagentText.targetUnitOccurrences.map(
        ({ targetOccurrenceNumber: _ordinal, ...record }) => record,
      ),
    )
    assert.deepEqual(
      occurrenceRecords(baselineUnit, 'forwardSubagentText'),
      [],
    )

    const targetUnits = structural.regions
      .map(region => region.target)
      .filter(Boolean)
    const appendGraph = occurrencesInBundle(
      targetBundle,
      'appendSubagentSystemPrompt',
      targetUnits,
    )
    const forwardGraph = occurrencesInBundle(
      targetBundle,
      'forwardSubagentText',
      targetUnits,
    )
    assert.deepEqual(
      appendGraph,
      fixture.compiledDependencyGraph.appendSubagentSystemPromptOccurrences,
    )
    assert.deepEqual(
      forwardGraph,
      fixture.compiledDependencyGraph.forwardSubagentTextOccurrences,
    )
    assert.equal(
      baselineBundle.toString('utf8').split('appendSubagentSystemPrompt')
        .length - 1,
      fixture.strictPropertyProof.appendSubagentSystemPrompt
        .baselineGlobalCount,
    )
    assert.equal(
      appendGraph.length,
      fixture.strictPropertyProof.appendSubagentSystemPrompt.targetGlobalCount,
    )
    assert.equal(
      baselineBundle.toString('utf8').split('forwardSubagentText').length - 1,
      fixture.strictPropertyProof.forwardSubagentText.baselineGlobalCount,
    )
    assert.equal(
      forwardGraph.length,
      fixture.strictPropertyProof.forwardSubagentText.targetGlobalCount,
    )
  },
)

test(
  'Target119 u20928 schema, u21742 streaming, and u21747 transfer form the authenticated compiled graph',
  { skip: !selected },
  () => {
    const targetBundle = readArtifact(fixture.inputs.targetBundle)
    const schemaUnit = parseUnit(
      targetBundle,
      fixture.units.schemaDependency,
    )
    const streamingUnit = parseUnit(
      targetBundle,
      fixture.units.streamingDependency,
    )
    const initializeUnit = parseUnit(
      targetBundle,
      fixture.units.targetInitialize,
    )
    const schemaFragments = propertyFragments(
      schemaUnit,
      'forwardSubagentText',
    )
    const streamingFragments = propertyFragments(
      streamingUnit,
      'forwardSubagentText',
    )
    assert.equal(schemaFragments.length, 1)
    assert.equal(streamingFragments.length, 1)
    const initialize = compiledFragments(initializeUnit).forwardSubagentText
    for (const [actual, expected] of [
      [schemaFragments[0], fixture.compiledDependencyGraph.fragments.schemaEndpoint],
      [
        streamingFragments[0],
        fixture.compiledDependencyGraph.fragments.streamingConsumer,
      ],
      [
        initialize,
        fixture.compiledDependencyGraph.fragments.initializeTransfer,
      ],
    ]) {
      assert.deepEqual(
        {
          start: actual.start,
          end: actual.end,
          bytes: actual.bytes,
          sha256: actual.sha256,
          text: actual.text,
        },
        {
          start: expected.start,
          end: expected.end,
          bytes: expected.bytes,
          sha256: expected.sha256,
          text: expected.text,
        },
      )
    }
  },
)

test(
  'Target119 u21747 exact source states prove ownership and forbid partial replay',
  { skip: !selected },
  async () => {
    const baselineBytes = fs.readFileSync(
      path.join(
        root,
        '.recovery-tmp/semantic-trees/2.1.118/src/cli/print.ts',
      ),
    )
    await inspectPrintSource(
      baselineBytes,
      fixture.sourceGraph.baselineHistorical,
      'baseline historical print',
    )

    const selectedBytes = fs.readFileSync(
      path.join(
        selectedSourceRoot,
        fixture.sourceGraph.sourcePath.replace(/^src\//, ''),
      ),
    )
    const selectedDescriptor = descriptor(selectedBytes)
    const selectedInput = fixture.sourceGraph.targetStates.find(
      state =>
        state.file.bytes === selectedDescriptor.bytes &&
        state.file.sha256 === selectedDescriptor.sha256,
    )
    assert.ok(selectedInput, 'unknown selected Target119 cli/print.ts state')
    const selectedInspection = await inspectPrintSource(
      selectedBytes,
      selectedInput,
      selectedInput.name,
    )
    assert.deepEqual(
      selectedInspection.calls,
      fixture.sourceGraph.targetDirectIdentifierCalls,
    )
    assert.deepEqual(selectedInspection.transfers, {})
    assert.equal(selectedInspection.streamingForwardProperty, undefined)

    const laterBytes = fs.readFileSync(
      path.join(
        root,
        '.recovery-tmp/semantic-trees/2.1.121/src/cli/print.ts',
      ),
    )
    const laterInspection = await inspectPrintSource(
      laterBytes,
      fixture.sourceGraph.laterSource121,
      'later source 121 print',
    )
    assert.deepEqual(
      sourceRecordProjection(
        laterInspection.transfers.appendSubagentSystemPrompt,
      ),
      fixture.sourceGraph.laterSource121.appendTransfer,
    )
    assert.deepEqual(
      sourceRecordProjection(laterInspection.transfers.forwardSubagentText),
      fixture.sourceGraph.laterSource121.forwardTransfer,
    )
    assert.deepEqual(
      sourceRecordProjection(laterInspection.streamingForwardProperty),
      fixture.sourceGraph.laterSource121.streamingForwardProperty,
    )

    const historicalSchemaBytes = fs.readFileSync(
      path.join(
        root,
        '.recovery-tmp/semantic-trees/2.1.119/src/entrypoints/sdk/controlSchemas.ts',
      ),
    )
    const historicalForward = await inspectControlSchema(
      historicalSchemaBytes,
      fixture.sourceGraph.controlSchemas.historicalTarget119,
      'historical target119 control schemas',
    )
    assert.equal(historicalForward, null)
    const laterSchemaBytes = fs.readFileSync(
      path.join(
        root,
        '.recovery-tmp/semantic-trees/2.1.121/src/entrypoints/sdk/controlSchemas.ts',
      ),
    )
    const laterForward = await inspectControlSchema(
      laterSchemaBytes,
      fixture.sourceGraph.controlSchemas.laterSource121,
      'later source 121 control schemas',
    )
    assert.deepEqual(
      sourceRecordProjection(laterForward),
      fixture.sourceGraph.controlSchemas.laterSource121.forwardProperty,
    )

    assert.equal(
      fixture.sourceGraph.targetDirectIdentifierCalls.length,
      23,
    )
    assert.equal(fixture.replayDisposition.mode, 'static-only')
    assert.equal(fixture.replayDisposition.sourceReplayAuthorized, false)
    assert.equal(fixture.replayDisposition.replayHelper, null)
    assert.equal(fixture.postWiring.expectedImpact.productionStrictRowsChanged, 0)
    assert.equal(fixture.postWiring.expectedImpact.ownerPathsChanged, 0)
    assert.equal(
      fixture.postWiring.expectedImpact.coverageRowsEvidenceStrengthened,
      1,
    )
    assert.equal(fixture.postWiring.expectedImpact.sourceReplayFiles, 0)
  },
)
