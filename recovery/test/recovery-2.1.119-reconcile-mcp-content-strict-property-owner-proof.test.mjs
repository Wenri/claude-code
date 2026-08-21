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
import * as helper from '../cases/2.1.118-to-2.1.119/recovered/reconcile-mcp-content-strict-property-owner-overrides.mjs'

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
  'recovery/test/recovery-2.1.119-reconcile-mcp-content-strict-property-owner-proof.json',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/reconcile-mcp-content-strict-property-owner-overrides.mjs',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const FIXTURE_SHA256 =
  'e3277f562aeb0510067d246a023406dde9531df5424c800539f72d0001d0b997'
const HELPER_SHA256 =
  '90da75942c14f33345d50c4e4508661973c99f0b35671c9347eaf1e31155bcc7'

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
  if (token.type.label === 'string') return `S:${JSON.stringify(token.value)}`
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

function canonicalStreamDescriptor(value) {
  const bytes = Buffer.from(JSON.stringify(value.map(token => token.canonical)))
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
  return { bytes, text, node: program.body[0], tokens: unitTokens, input }
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

function localRecord(unit, node, kind) {
  const bytes = unit.bytes.subarray(node.start, node.end)
  return {
    kind,
    start: unit.input.start + node.start,
    end: unit.input.start + node.end,
    ...descriptor(bytes),
    text: bytes.toString('utf8'),
  }
}

function strictFragments(unit, propertyName) {
  const output = []
  walk(unit.node, node => {
    if (node.type === 'Property') {
      const key = node.key?.type === 'Identifier' ? node.key.name : node.key?.value
      if (key === propertyName) output.push(localRecord(unit, node, 'property'))
    }
    if (
      node.type === 'MemberExpression' &&
      !node.computed &&
      node.property?.type === 'Identifier' &&
      node.property.name === propertyName
    ) {
      output.push(localRecord(unit, node, 'member'))
    }
  })
  return output.sort((left, right) => left.start - right.start)
}

function strictOccurrenceRecords(unit, propertyName, radius = 40) {
  const fragments = strictFragments(unit, propertyName)
  return unit.tokens.flatMap((token, tokenIndex) => {
    if (token.raw !== propertyName) return []
    const fragment = fragments.find(
      candidate => candidate.start <= token.start && token.end <= candidate.end,
    )
    assert.ok(fragment, `${propertyName} occurrence lacks property/member AST owner`)
    const neighborhood = unit.tokens.slice(
      Math.max(0, tokenIndex - radius),
      Math.min(unit.tokens.length, tokenIndex + radius + 1),
    )
    const canonical = canonicalStreamDescriptor(neighborhood)
    return [
      {
        kind: fragment.kind,
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

function normalizedDiff(baselineTokens, targetTokens, expected) {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target119-u21759-diff-'),
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
        expected.baselineLabel ?? 'baseline',
        '--label',
        expected.targetLabel ?? 'target',
        baselinePath,
        targetPath,
      ],
      { encoding: null, maxBuffer: 1_000_000 },
    )
    assert.ok([0, 1].includes(result.status), result.stderr?.toString())
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

  const imports = new Map()
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue
    const moduleName = statement.moduleSpecifier.text
    const clause = statement.importClause
    if (clause?.name) imports.set(clause.name.text, moduleName)
    const bindings = clause?.namedBindings
    if (bindings && ts.isNamespaceImport(bindings)) {
      imports.set(bindings.name.text, moduleName)
    }
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        imports.set(element.name.text, moduleName)
      }
    }
  }

  let reconcileNode
  let callerNode
  const visitFile = node => {
    if (ts.isFunctionDeclaration(node)) {
      if (node.name?.text === 'reconcileMcpServers') reconcileNode = node
      if (node.name?.text === 'handleMcpSetServers') callerNode = node
    }
    ts.forEachChild(node, visitFile)
  }
  visitFile(sourceFile)
  assert.ok(reconcileNode, `${label} reconcileMcpServers`)
  assert.ok(callerNode, `${label} handleMcpSetServers`)
  assert.deepEqual(
    sourceRecordProjection(
      sourceNodeRecord(bytes, source, sourceFile, reconcileNode),
    ),
    input.reconcileMcpServers,
    `${label} reconcile declaration`,
  )
  assert.deepEqual(
    sourceRecordProjection(sourceNodeRecord(bytes, source, sourceFile, callerNode)),
    input.handleMcpSetServers,
    `${label} caller declaration`,
  )

  let reconcileCallCountInCaller = 0
  const visitCaller = node => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'reconcileMcpServers'
    ) {
      reconcileCallCountInCaller += 1
    }
    ts.forEachChild(node, visitCaller)
  }
  visitCaller(callerNode)
  assert.equal(
    reconcileCallCountInCaller,
    input.reconcileCallCountInCaller,
    `${label} caller count`,
  )

  const reconcileText = reconcileNode.getText(sourceFile)
  const markers = Object.keys(
    label.startsWith('baseline')
      ? fixture.sourceGraph.baselineHistorical.markerCounts
      : fixture.sourceGraph.targetMarkerCounts,
  )
  const markerCounts = Object.fromEntries(
    markers.map(marker => [marker, reconcileText.split(marker).length - 1]),
  )
  const directCalls = new Set()
  const fragments = { fetchedObject: [], commandsState: [], resourcesState: [] }
  const visitReconcile = node => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      directCalls.add(node.expression.text)
    }
    if (ts.isObjectLiteralExpression(node)) {
      const text = node.getText(sourceFile)
      if (text.includes('name, commands, resources')) {
        fragments.fetchedObject.push(sourceNodeRecord(bytes, source, sourceFile, node))
      }
    }
    if (ts.isPropertyAssignment(node)) {
      const key = node.name.getText(sourceFile).replaceAll(/["']/g, '')
      const text = node.getText(sourceFile)
      if (key === 'commands' && text.includes('fetchedContent.flatMap')) {
        fragments.commandsState.push(sourceNodeRecord(bytes, source, sourceFile, node))
      }
      if (key === 'resources' && text.includes('fetchedContent.map')) {
        fragments.resourcesState.push(sourceNodeRecord(bytes, source, sourceFile, node))
      }
    }
    ts.forEachChild(node, visitReconcile)
  }
  visitReconcile(reconcileNode)
  const calls = [...directCalls].sort()
  const runtimeDependencyBindings = calls
    .filter(call => imports.has(call))
    .map(call => [call, imports.get(call)])
  return {
    markerCounts,
    directIdentifierCalls: calls,
    runtimeDependencyBindings,
    fragments,
  }
}

function fragmentProjection(record) {
  return {
    bytes: record.bytes,
    sha256: record.sha256,
    ...(record.text === fixture.sourceGraph.targetFragments.fetchedObject.text
      ? { text: record.text }
      : {}),
  }
}

test(
  'Target119 u21759 helper contracts freeze one static-only owner correction',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.deepEqual(
      helper.TARGET119_RECONCILE_MCP_CONTENT_STRICT_PROPERTY_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      helper.TARGET119_RECONCILE_MCP_CONTENT_DEPENDENCY_TARGET_INDICES,
      fixture.override.dependencyTargetIndices,
    )
    const overrides =
      helper.TARGET119_RECONCILE_MCP_CONTENT_STRICT_PROPERTY_OWNER_OVERRIDES
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
    assert.ok(overrides[0].behavior.includes('Target118 u20853'))
    assert.ok(overrides[0].behavior.includes('u21758/u20852'))
    assert.ok(overrides[0].behavior.includes('no source replay'))
    assert.ok(Object.isFrozen(overrides))
    assert.ok(Object.isFrozen(overrides[0]))
    assert.ok(Object.isFrozen(overrides[0].paths))
    assert.ok(Object.isFrozen(overrides[0].declarations))
    assert.ok(Object.isFrozen(overrides[0].dependencyTargetIndices))
    assert.ok(Object.isFrozen(overrides[0].evidenceIds))
  },
)

test(
  'Target119 u21759 frozen exact-phase owner, added, strict, and coverage partitions are exact',
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
      row => row.structural.index === 21759,
    )
    const addedRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
      row => row.structural.index === 21759,
    )
    const strictRows = report.rows.filter(
      row => row.structural.index === 21759,
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
    assert.deepEqual(ownerTuples, fixture.snapshotPartitions.ownerTuples)
    assert.deepEqual(addedRows.map(rowTuple), ownerTuples)
    assert.deepEqual(strictRows.map(rowTuple), ownerTuples)
    assert.deepEqual(
      partitionDescriptor(ownerTuples),
      fixture.snapshotPartitions.ownerTupleDescriptor,
    )
    assert.deepEqual(
      partitionDescriptor(addedRows.map(rowTuple)),
      fixture.snapshotPartitions.addedTupleDescriptor,
    )
    assert.deepEqual(
      partitionDescriptor(strictRows.map(rowTuple)),
      fixture.snapshotPartitions.strictTupleDescriptor,
    )

    const coverageTarget = coverage.rows.filter(row => row.targetIndex === 21759)
    const coverageProjection =
      artifactPhase === 'post-streaming'
        ? fixture.snapshotPartitions
        : fixture.snapshotPartitions.postU21759Coverage
    assert.deepEqual(coverageTarget, coverageProjection.coverageTarget)
    assert.deepEqual(
      partitionDescriptor(coverageTarget),
      coverageProjection.coverageTargetDescriptor,
    )
    assert.deepEqual(
      partitionDescriptor(coverage.rows.filter(row => row.targetIndex === 21758)),
      fixture.snapshotPartitions.matchedCallerCoverageDescriptor,
    )
    const owners = coverage.owners.filter(
      owner => owner.id === 'owner-src-cli-print-ts',
    )
    assert.deepEqual(owners, fixture.snapshotPartitions.ownerCatalog)
    assert.deepEqual(
      partitionDescriptor(owners),
      fixture.snapshotPartitions.ownerCatalogDescriptor,
    )
  },
)

test(
  'Target119 u21759 complete predecessor and matched caller authenticate all four genuine rows',
  { skip: !selected },
  () => {
    const structural = JSON.parse(gunzipSync(readExact(fixture.inputs.structural)))
    const baselineBundle = readArtifact(fixture.inputs.baselineBundle)
    const targetBundle = readArtifact(fixture.inputs.targetBundle)
    const baseline = parseUnit(baselineBundle, fixture.units.baselineReconcile)
    const target = parseUnit(targetBundle, fixture.units.targetReconcile)
    const baselineCaller = parseUnit(baselineBundle, fixture.units.baselineCaller)
    const targetCaller = parseUnit(targetBundle, fixture.units.targetCaller)

    assert.equal(
      baseline.node.body.body.length,
      fixture.units.baselineReconcile.bodyStatements,
    )
    assert.equal(target.node.body.body.length, fixture.units.targetReconcile.bodyStatements)
    assert.equal(
      baselineCaller.node.body.body.length,
      fixture.units.baselineCaller.bodyStatements,
    )
    assert.equal(
      targetCaller.node.body.body.length,
      fixture.units.targetCaller.bodyStatements,
    )

    const structuralTarget = structural.regions[21759]
    assert.equal(structuralTarget.classification, 'unresolved')
    assert.equal(structuralTarget.unknownFreeIdentifierCount, 0)
    assert.deepEqual(
      structuralProjection(structuralTarget.target),
      expectedStructural(fixture.units.targetReconcile),
    )
    const structuralBaseline = structural.unmatchedBaseline.find(
      unit => unit.index === 20853,
    )
    assert.ok(structuralBaseline)
    assert.deepEqual(
      structuralProjection(structuralBaseline),
      expectedStructural(fixture.units.baselineReconcile),
    )
    const structuralCaller = structural.regions[21758]
    assert.equal(structuralCaller.classification, 'matched')
    assert.equal(structuralCaller.baselineUnitIndex, 20852)
    assert.equal(structuralCaller.pairReason, 'exact-scope-normalized-token-hash')
    assert.equal(structuralCaller.unknownFreeIdentifierCount, 0)
    assert.deepEqual(
      structuralProjection(structuralCaller.target),
      expectedStructural(fixture.units.targetCaller),
    )
    assert.equal(
      fixture.units.baselineCaller.index,
      structuralCaller.baselineUnitIndex,
    )

    assert.deepEqual(
      canonicalStreamDescriptor(baseline.tokens),
      fixture.predecessorProof.canonicalTokenStreams.baseline,
    )
    assert.deepEqual(
      canonicalStreamDescriptor(target.tokens),
      fixture.predecessorProof.canonicalTokenStreams.target,
    )
    assert.deepEqual(
      canonicalStreamDescriptor(baselineCaller.tokens),
      fixture.predecessorProof.canonicalTokenStreams.baselineCaller,
    )
    assert.deepEqual(
      canonicalStreamDescriptor(targetCaller.tokens),
      fixture.predecessorProof.canonicalTokenStreams.targetCaller,
    )
    assert.deepEqual(
      normalizedDiff(
        baseline.tokens,
        target.tokens,
        fixture.predecessorProof.normalizedCompleteUnitDiff,
      ),
      {
        bytes: fixture.predecessorProof.normalizedCompleteUnitDiff.bytes,
        sha256: fixture.predecessorProof.normalizedCompleteUnitDiff.sha256,
        hunks: fixture.predecessorProof.normalizedCompleteUnitDiff.hunks,
        addedTokens: fixture.predecessorProof.normalizedCompleteUnitDiff.addedTokens,
        deletedTokens:
          fixture.predecessorProof.normalizedCompleteUnitDiff.deletedTokens,
      },
    )
    assert.deepEqual(
      normalizedDiff(
        baselineCaller.tokens,
        targetCaller.tokens,
        fixture.predecessorProof.normalizedCallerDiff,
      ),
      fixture.predecessorProof.normalizedCallerDiff,
    )

    for (const propertyName of ['cmds', 'res']) {
      const proof = fixture.strictPropertyProof[propertyName]
      assert.deepEqual(strictOccurrenceRecords(baseline, propertyName), [])
      assert.deepEqual(
        strictOccurrenceRecords(target, propertyName),
        proof.targetUnitOccurrences,
      )
      assert.deepEqual(strictFragments(baseline, propertyName), [])
      assert.deepEqual(strictFragments(target, propertyName), proof.fragments)
    }
    assert.equal(fixture.strictPropertyProof.classification, 'genuine-successor-additions')
    assert.equal(
      fixture.units.targetReconcile.manualPredecessorUnitIndex,
      fixture.units.baselineReconcile.index,
    )
  },
)

test(
  'Target119 u21759 exact source states close the command/resource dependency graph',
  { skip: !selected },
  async () => {
    const baselineInput = fixture.sourceGraph.baselineHistorical
    const baselineInspection = await inspectPrintSource(
      readExact(baselineInput.file),
      baselineInput,
      'baseline historical print',
    )
    assert.deepEqual(baselineInspection.markerCounts, baselineInput.markerCounts)
    assert.deepEqual(
      baselineInspection.directIdentifierCalls,
      baselineInput.directIdentifierCalls,
    )
    assert.deepEqual(
      baselineInspection.runtimeDependencyBindings,
      baselineInput.runtimeDependencyBindings,
    )
    assert.deepEqual(baselineInspection.fragments, {
      fetchedObject: [],
      commandsState: [],
      resourcesState: [],
    })

    const targetHistoricalInput = fixture.sourceGraph.targetHistorical
    const targetHistoricalInspection = await inspectPrintSource(
      readExact(targetHistoricalInput.file),
      targetHistoricalInput,
      'target historical print',
    )
    assert.deepEqual(
      targetHistoricalInspection.markerCounts,
      fixture.sourceGraph.targetMarkerCounts,
    )
    assert.deepEqual(
      targetHistoricalInspection.directIdentifierCalls,
      fixture.sourceGraph.targetDirectIdentifierCalls,
    )
    assert.deepEqual(
      targetHistoricalInspection.runtimeDependencyBindings,
      fixture.sourceGraph.targetRuntimeDependencyBindings,
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
      selectedInspection.markerCounts,
      fixture.sourceGraph.targetMarkerCounts,
    )
    assert.deepEqual(
      selectedInspection.directIdentifierCalls,
      fixture.sourceGraph.targetDirectIdentifierCalls,
    )
    assert.deepEqual(
      selectedInspection.runtimeDependencyBindings,
      fixture.sourceGraph.targetRuntimeDependencyBindings,
    )
    assert.equal(
      selectedInput.reconcileMcpServers.sha256,
      targetHistoricalInput.reconcileMcpServers.sha256,
    )
    assert.equal(
      selectedInput.handleMcpSetServers.sha256,
      targetHistoricalInput.handleMcpSetServers.sha256,
    )

    for (const inspection of [targetHistoricalInspection, selectedInspection]) {
      assert.equal(inspection.fragments.fetchedObject.length, 1)
      assert.equal(inspection.fragments.commandsState.length, 1)
      assert.equal(inspection.fragments.resourcesState.length, 1)
      assert.deepEqual(
        fragmentProjection(inspection.fragments.fetchedObject[0]),
        fixture.sourceGraph.targetFragments.fetchedObject,
      )
      assert.deepEqual(
        fragmentProjection(inspection.fragments.commandsState[0]),
        fixture.sourceGraph.targetFragments.commandsState,
      )
      assert.deepEqual(
        fragmentProjection(inspection.fragments.resourcesState[0]),
        fixture.sourceGraph.targetFragments.resourcesState,
      )
    }
    assert.equal(fixture.sourceGraph.targetRuntimeDependencyBindings.length, 16)
    assert.equal(fixture.sourceGraph.targetDirectIdentifierCalls.length, 20)
  },
)

test(
  'Target119 u21759 disposition and wiring authorize evidence only, never replay',
  { skip: !selected },
  () => {
    assert.equal(fixture.replayDisposition.mode, 'static-only')
    assert.equal(fixture.replayDisposition.sourceReplayAuthorized, false)
    assert.equal(fixture.replayDisposition.replayHelper, null)
    assert.equal(fixture.wiringRecipe.replayExport, null)
    assert.equal(
      fixture.wiringRecipe.ownerOverrideExport,
      'TARGET119_RECONCILE_MCP_CONTENT_STRICT_PROPERTY_OWNER_OVERRIDES',
    )
    assert.equal(
      fixture.wiringRecipe.ownerOverrideSpread,
      '...TARGET119_RECONCILE_MCP_CONTENT_STRICT_PROPERTY_OWNER_OVERRIDES',
    )
    assert.deepEqual(fixture.postWiring.expectedImpact, {
      productionStrictRowsChanged: 0,
      ownerPathsChanged: 0,
      coverageRowsEvidenceStrengthened: 1,
      sourceReplayFiles: 0,
    })
  },
)
