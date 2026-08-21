import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET119_MAIN_RUN_BUILD_PROFILE_EVIDENCE_IDS,
  TARGET119_MAIN_RUN_BUILD_PROFILE_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/main-run-build-profile-owner-overrides.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src'),
)
const artifactRoot = path.join(root, '.recovery-tmp/authenticated-artifacts')
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-main-run-build-profile-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'ad3b6d0e77bdaf4c816d562b504eade06ee574e92b6f624cc61250ea518fe2ed'
const HELPER_SHA256 =
  '49b3ef98ee4f0a60485033672764ddc7ed0a0627296a02c78a256ac5641f8ae4'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function jsonDescriptor(value) {
  const bytes = Buffer.from(JSON.stringify(value))
  return { jsonBytes: bytes.length, sha256: sha256(bytes) }
}

function partitionDescriptor(rows) {
  return { rows: rows.length, ...jsonDescriptor(rows) }
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

function residueTuple(row) {
  return [
    row.literalKind,
    row.value,
    row.target.start,
    row.target.end,
    row.baselineOccurrenceCount,
    row.targetOccurrenceNumber,
  ]
}

function selectArtifactPhase(typedAudit, sourceCoverage, sourceCoverageRaw) {
  const matches = fixture.artifactPhasePolicy.acceptedPairs.filter(
    pair =>
      pair.typedAudit.bytes === typedAudit.bytes &&
      pair.typedAudit.sha256 === typedAudit.sha256 &&
      pair.sourceCoverage.bytes === sourceCoverage.bytes &&
      pair.sourceCoverage.sha256 === sourceCoverage.sha256 &&
      pair.sourceCoverageRaw.bytes === sourceCoverageRaw.bytes &&
      pair.sourceCoverageRaw.sha256 === sourceCoverageRaw.sha256,
  )
  assert.equal(matches.length, 1, 'unknown or hybrid report/coverage pair')
  return matches[0].phase
}

const macroKinds = new Map([
  ...fixture.canonicalTokenProof.macroValues.baseline.map((value, index) => [
    value,
    fixture.canonicalTokenProof.macroValues.canonical[index],
  ]),
  ...fixture.canonicalTokenProof.macroValues.target.map((value, index) => [
    value,
    fixture.canonicalTokenProof.macroValues.canonical[index],
  ]),
])

function canonicalToken(token) {
  if (token.type.label === 'name') return 'ID'
  if (token.type.label === 'string') {
    return macroKinds.get(token.value) ?? `S:${JSON.stringify(token.value)}`
  }
  if (token.type.label === 'num') return `N:${token.value}`
  if (token.type.label === 'bigint') return `B:${token.value}`
  if (token.type.label === 'regexp') {
    return `R:${token.value.pattern}/${token.value.flags}`
  }
  return token.type.label
}

function tokens(source, offset = 0) {
  const output = []
  const stream = tokenizer(source, { ecmaVersion: 'latest' })
  while (true) {
    const token = stream.getToken()
    if (token.type.label === 'eof') return output
    output.push({
      canonical: canonicalToken(token),
      raw: source.slice(token.start, token.end),
      start: offset + token.start,
      end: offset + token.end,
    })
  }
}

function unitSlice(bundle, input) {
  const value = bundle.subarray(input.start, input.end)
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sourceHash,
  })
  return value
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
    sourceHash: input.sourceHash,
    coarseHash: input.coarseHash,
  }
}

function walk(node, visit) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (typeof node.type === 'string') visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
      walk(child, visit)
    }
  }
}

function smallestIf(unit, globalPosition) {
  const source = unit.bytes.toString('utf8')
  const ast = parse(source, { ecmaVersion: 'latest' })
  const localPosition = globalPosition - unit.start
  const matches = []
  walk(ast, node => {
    if (
      node.type === 'IfStatement' &&
      node.start <= localPosition &&
      node.end >= localPosition
    ) {
      matches.push(node)
    }
  })
  matches.sort((left, right) =>
    left.end - left.start - (right.end - right.start),
  )
  assert.ok(matches.length > 0)
  const node = matches[0]
  const graphSource = source.slice(node.start, node.end)
  const graphBytes = Buffer.from(graphSource)
  const graphTokens = tokens(graphSource, unit.start + node.start)
  return {
    start: unit.start + node.start,
    end: unit.start + node.end,
    ...descriptor(graphBytes),
    tokenCount: graphTokens.length,
    canonicalDescriptor: descriptor(
      Buffer.from(JSON.stringify(graphTokens.map(token => token.canonical))),
    ),
    tokens: graphTokens,
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

async function runDeclaration(filename, expected) {
  const ts = await loadTypeScript()
  const bytes = fs.readFileSync(filename)
  const source = bytes.toString('utf8')
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, filename)
  const matches = []
  const visit = node => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'run') {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(matches.length, 1, `${filename}: one run declaration`)
  const node = matches[0]
  const characterStart = node.getStart(sourceFile)
  const characterEnd = node.end
  const byteStart = Buffer.byteLength(source.slice(0, characterStart))
  const byteEnd = Buffer.byteLength(source.slice(0, characterEnd))
  const declarationBytes = bytes.subarray(byteStart, byteEnd)
  const { name: _name, ...expectedDescriptor } = expected
  assert.deepEqual(
    {
      characterStart,
      characterEnd,
      byteStart,
      byteEnd,
      ...descriptor(declarationBytes),
    },
    expectedDescriptor,
  )
  return { bytes, source: declarationBytes.toString('utf8') }
}

function sourceSegment(source, kind) {
  let characterStart
  let characterEnd
  if (kind === 'includeHook') {
    characterStart = source.indexOf(
      '    // Enable all hook event types when explicitly requested via SDK option',
    )
    characterEnd = source.indexOf(
      '\n\n    // Auto-set input/output formats',
      characterStart,
    )
  } else if (kind === 'ccr') {
    characterStart = source.indexOf(
      '        // Create remote session config for the REPL',
    )
    characterEnd = source.indexOf(
      '\n\n        // Add remote session info as initial system message',
      characterStart,
    )
  } else {
    const marker = source.indexOf('          // Check for ccshare URL')
    characterStart = source.lastIndexOf(
      '      if ("external" === \'ant\') {',
      marker,
    )
    characterEnd = source.indexOf(
      '\n\n      // If not loaded as a file, try as session ID',
      marker,
    )
  }
  assert.ok(characterStart >= 0 && characterEnd > characterStart, kind)
  const before = source.slice(0, characterStart)
  const value = Buffer.from(source.slice(characterStart, characterEnd))
  return {
    characterStart,
    characterEnd,
    byteStart: Buffer.byteLength(before),
    byteEnd: Buffer.byteLength(before) + value.length,
    ...descriptor(value),
    source: value.toString('utf8'),
  }
}

function segmentProjection(segment) {
  const { source: _source, ...projection } = segment
  return projection
}

function rawOccurrences(tokens_, raw) {
  return tokens_
    .filter(token => token.raw === raw)
    .map(token => [token.start, token.end])
}

test('Target119 u21878 helper, fixture, and prior lineage are frozen', {
  skip: !selected,
}, () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(sha256(readExact(fixture.inputs.helper)), HELPER_SHA256)
  assert.equal(fixture.case, caseName)
  assert.equal(
    fixture.status,
    'authenticated-complete-unit-static-owner-proof-no-replay',
  )
  assert.equal(fixture.replay, null)
  assert.deepEqual(
    TARGET119_MAIN_RUN_BUILD_PROFILE_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
  assert.deepEqual(
    TARGET119_MAIN_RUN_BUILD_PROFILE_OWNER_OVERRIDES.map(row => ({
      key: row.key,
      targetIndex: row.targetIndex,
      paths: [...row.paths],
      declarations: [...row.declarations],
      evidenceIds: [...row.evidenceIds],
      behavior: row.behavior,
    })),
    [fixture.ownerOverride],
  )
  assert.deepEqual(fixture.expectedImpact, {
    ownerPathChanges: 0,
    ownerRowsChanged: 0,
    addedRowsChanged: 0,
    strictRowsChanged: 0,
    coverageRowsStrengthened: 1,
    coverageOwnerIdChanges: 0,
    newSourceFiles: 0,
    replayHelpers: 0,
  })
  const prior = JSON.parse(readExact(fixture.inputs.target118Proof))
  assert.equal(prior.case, '2.1.117-to-2.1.118')
  assert.equal(prior.targetUnit.targetIndex, fixture.units.baselineRun.index)
  assert.equal(prior.targetUnit.bytes, fixture.units.baselineRun.bytes)
  assert.equal(prior.targetUnit.tokenCount, fixture.units.baselineRun.tokenCount)
  assert.equal(
    prior.targetUnit.sourceHash,
    fixture.units.baselineRun.sourceHash,
  )
  assert.deepEqual(prior.targetUnit.ownerPath, 'src/main.tsx')
  assert.deepEqual(prior.targetUnit.declarations, ['run'])
})

test('Target119 u21878 frozen owner, added, strict, and coverage partitions are exact', {
  skip: !selected,
}, () => {
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
  assert.ok(['post-u21759', 'post-u21878'].includes(artifactPhase))
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
  const [postU21759, postU21878] = fixture.artifactPhasePolicy.acceptedPairs
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
  assert.throws(
    () =>
      selectArtifactPhase(
        typedAuditDescriptor,
        sourceCoverageDescriptor,
        { ...sourceCoverageRawDescriptor, bytes: 0 },
      ),
    /unknown or hybrid/,
  )

  const report = JSON.parse(typedAuditBytes)
  const coverage = JSON.parse(sourceCoverageRaw)
  const ownerRows = report.sourceRuntimeOwnerResidueRows.filter(
    row => row.structural.index === fixture.units.targetRun.index,
  )
  const addedRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
    row => row.structural.index === fixture.units.targetRun.index,
  )
  const strictRows = report.rows.filter(
    row => row.structural.index === fixture.units.targetRun.index,
  )
  const retainedRows = ownerRows.filter(row => row.targetAdded === false)
  assert.deepEqual(
    {
      owner: ownerRows.length,
      added: addedRows.length,
      strict: strictRows.length,
      retainedOwner: retainedRows.length,
    },
    fixture.snapshotPartitions.counts,
  )
  assert.deepEqual(
    partitionDescriptor(ownerRows),
    fixture.snapshotPartitions.ownerDescriptor,
  )
  assert.deepEqual(
    partitionDescriptor(ownerRows.map(rowTuple)),
    fixture.snapshotPartitions.ownerTupleDescriptor,
  )
  assert.deepEqual(
    partitionDescriptor(addedRows),
    fixture.snapshotPartitions.addedDescriptor,
  )
  assert.deepEqual(
    partitionDescriptor(addedRows.map(rowTuple)),
    fixture.snapshotPartitions.addedTupleDescriptor,
  )
  assert.deepEqual(
    partitionDescriptor(addedRows.map(residueTuple)),
    fixture.snapshotPartitions.addedResidueTupleDescriptor,
  )
  assert.deepEqual(
    partitionDescriptor(strictRows),
    fixture.snapshotPartitions.strictDescriptor,
  )
  assert.deepEqual(
    partitionDescriptor(strictRows.map(rowTuple)),
    fixture.snapshotPartitions.strictTupleDescriptor,
  )
  assert.deepEqual(
    partitionDescriptor(retainedRows),
    fixture.snapshotPartitions.retainedOwnerDescriptor,
  )
  assert.deepEqual(
    partitionDescriptor(retainedRows.map(rowTuple)),
    fixture.snapshotPartitions.retainedOwnerTupleDescriptor,
  )
  assert.ok(
    ownerRows.every(
      row =>
        row.disposition === 'source-runtime-covered' &&
        JSON.stringify(row.ownerPaths) === JSON.stringify(['main.tsx']),
    ),
  )
  const addedIndexByTuple = new Map(
    addedRows.map((row, index) => [JSON.stringify(rowTuple(row)), index]),
  )
  assert.deepEqual(
    strictRows.map(row => addedIndexByTuple.get(JSON.stringify(rowTuple(row)))),
    fixture.strictProof.strictRowIndexes,
  )

  const coverageTarget = coverage.rows.filter(
    row => row.targetIndex === fixture.units.targetRun.index,
  )
  const coverageProjection =
    artifactPhase === 'post-u21878'
      ? fixture.coverageSnapshot.postU21878
      : fixture.coverageSnapshot
  assert.deepEqual(coverageTarget, coverageProjection.target)
  assert.deepEqual(
    partitionDescriptor(coverageTarget),
    coverageProjection.targetDescriptor,
  )
  const ownerIds = new Set(coverageTarget.flatMap(row => row.ownerIds))
  const ownerCatalog = coverage.owners.filter(owner => ownerIds.has(owner.id))
  assert.deepEqual(ownerCatalog, fixture.coverageSnapshot.ownerCatalog)
  assert.deepEqual(
    partitionDescriptor(ownerCatalog),
    fixture.coverageSnapshot.ownerCatalogDescriptor,
  )
  assert.deepEqual(
    {
      ...coverageTarget[0],
      evidenceIds: fixture.evidenceIds,
      behavior: fixture.ownerOverride.behavior,
    },
    {
      ...coverageProjection.target[0],
      evidenceIds: TARGET119_MAIN_RUN_BUILD_PROFILE_EVIDENCE_IDS,
      behavior:
        TARGET119_MAIN_RUN_BUILD_PROFILE_OWNER_OVERRIDES[0].behavior,
    },
  )
})

test('Target119 u21878 has exactly fifty-four unique 121-token u20972 predecessor windows', {
  skip: !selected,
}, () => {
  const structural = JSON.parse(gunzipSync(readExact(fixture.inputs.structural)))
  const targetRegion = structural.regions[fixture.units.targetRun.index]
  assert.equal(targetRegion.classification, 'unresolved')
  assert.equal(
    targetRegion.unknownFreeIdentifierCount,
    fixture.units.targetRun.unknownFreeIdentifierCount,
  )
  assert.deepEqual(
    structuralProjection(targetRegion.target),
    expectedStructural(fixture.units.targetRun),
  )
  const baselineStructural = structural.unmatchedBaseline.find(
    unit => unit.index === fixture.units.baselineRun.index,
  )
  assert.ok(baselineStructural)
  assert.deepEqual(
    structuralProjection(baselineStructural),
    expectedStructural(fixture.units.baselineRun),
  )

  const baselineBundle = readArtifact(fixture.inputs.baselineBundle)
  const targetBundle = readArtifact(fixture.inputs.targetBundle)
  const baselineBytes = unitSlice(baselineBundle, fixture.units.baselineRun)
  const targetBytes = unitSlice(targetBundle, fixture.units.targetRun)
  const baselineTokens = tokens(
    baselineBytes.toString('utf8'),
    fixture.units.baselineRun.start,
  )
  const targetTokens = tokens(
    targetBytes.toString('utf8'),
    fixture.units.targetRun.start,
  )
  for (const [actual, expected] of [
    [baselineTokens, fixture.canonicalTokenProof.baselineCanonicalStream],
    [targetTokens, fixture.canonicalTokenProof.targetCanonicalStream],
  ]) {
    assert.equal(actual.length, expected.tokens)
    assert.deepEqual(
      descriptor(
        Buffer.from(JSON.stringify(actual.map(token => token.canonical))),
      ),
      { bytes: expected.bytes, sha256: expected.sha256 },
    )
  }

  const accepted = fixture.artifactPhasePolicy.acceptedPairs[0]
  const report = JSON.parse(
    fs.readFileSync(
      path.resolve(
        process.env.CLAUDE_CODE_TYPED_AUDIT_PATH ??
          path.join(root, accepted.typedAudit.path),
      ),
    ),
  )
  const addedRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
    row => row.structural.index === fixture.units.targetRun.index,
  )
  const contextLength = fixture.canonicalTokenProof.windowTokens
  const radius = fixture.canonicalTokenProof.windowRadius
  assert.equal(contextLength, radius * 2 + 1)
  const baselineWindowStarts = new Map()
  for (
    let start = 0;
    start + contextLength <= baselineTokens.length;
    start += 1
  ) {
    const contextJson = JSON.stringify(
      baselineTokens
        .slice(start, start + contextLength)
        .map(token => token.canonical),
    )
    const starts = baselineWindowStarts.get(contextJson) ?? []
    starts.push(start)
    baselineWindowStarts.set(contextJson, starts)
  }

  const mappings = []
  const exceptions = []
  for (const [rowIndex, row] of addedRows.entries()) {
    const targetTokenIndex = targetTokens.findIndex(
      token =>
        token.start === row.target.start && token.end === row.target.end,
    )
    assert.ok(targetTokenIndex >= 0, `row ${rowIndex}: exact target token`)
    const targetToken = targetTokens[targetTokenIndex]
    const windows = []
    for (
      let relativeOffset = 0;
      relativeOffset < contextLength;
      relativeOffset += 1
    ) {
      const targetWindowStart = targetTokenIndex - relativeOffset
      if (
        targetWindowStart < 0 ||
        targetWindowStart + contextLength > targetTokens.length
      ) {
        continue
      }
      const contextJson = JSON.stringify(
        targetTokens
          .slice(targetWindowStart, targetWindowStart + contextLength)
          .map(token => token.canonical),
      )
      for (const baselineWindowStart of
        baselineWindowStarts.get(contextJson) ?? []) {
        const baselineTokenIndex = baselineWindowStart + relativeOffset
        const candidate = baselineTokens[baselineTokenIndex]
        const macro = targetToken.canonical.startsWith('BUILD:')
        if (candidate.canonical !== targetToken.canonical) continue
        if (!macro && candidate.raw !== targetToken.raw) continue
        windows.push({
          relativeOffset,
          targetWindowStart,
          baselineWindowStart,
          baselineTokenIndex,
          contextHash: sha256(Buffer.from(contextJson)),
        })
      }
    }
    const candidateIndices = [
      ...new Set(windows.map(window => window.baselineTokenIndex)),
    ]
    windows.sort(
      (left, right) =>
        Math.abs(left.relativeOffset - radius) -
          Math.abs(right.relativeOffset - radius) ||
        left.relativeOffset - right.relativeOffset,
    )
    if (candidateIndices.length === 1) {
      const chosen = windows[0]
      const baselineToken = baselineTokens[chosen.baselineTokenIndex]
      mappings.push([
        rowIndex,
        targetTokenIndex,
        chosen.baselineTokenIndex,
        chosen.relativeOffset,
        chosen.targetWindowStart,
        chosen.baselineWindowStart,
        baselineToken.start,
        baselineToken.end,
        baselineToken.raw,
        chosen.contextHash,
      ])
    } else {
      assert.deepEqual(candidateIndices, [], `row ${rowIndex}: no predecessor`)
      exceptions.push([
        rowIndex,
        targetTokenIndex,
        targetToken.raw,
        targetToken.start,
        targetToken.end,
      ])
    }
  }
  assert.deepEqual(
    mappings.map(row => row[0]),
    fixture.canonicalTokenProof.mappedRowIndexes,
  )
  assert.deepEqual(
    partitionDescriptor(mappings),
    fixture.canonicalTokenProof.mappingDescriptor,
  )
  assert.deepEqual(exceptions, fixture.canonicalTokenProof.exceptionRows)
  assert.deepEqual(
    partitionDescriptor(exceptions),
    fixture.canonicalTokenProof.exceptionDescriptor,
  )
  const mappedIndexes = new Set(
    fixture.canonicalTokenProof.mappedRowIndexes,
  )
  const exceptionIndexes = new Set(
    fixture.canonicalTokenProof.exceptionRows.map(row => row[0]),
  )
  assert.ok(
    fixture.strictProof.rawPredecessorRowIndexes.every(
      index => mappedIndexes.has(index) && !macroKinds.has(addedRows[index].value),
    ),
  )
  assert.ok(
    fixture.strictProof.macroNormalizedRowIndexes.every(
      index => mappedIndexes.has(index) && macroKinds.has(addedRows[index].value),
    ),
  )
  assert.ok(
    fixture.strictProof.retainedGraphOccurrenceRowIndexes.every(index =>
      exceptionIndexes.has(index),
    ),
  )
  assert.deepEqual(
    fixture.strictProof.retainedGraphOccurrenceRowIndexes.map(index =>
      addedRows[index].value,
    ),
    ['not_found_explicit_id', 'failure_reason'],
  )
  assert.deepEqual(
    fixture.strictProof.buildProfileMaterializedRowIndexes.map(index =>
      addedRows[index].value,
    ),
    ['parseCcshareId'],
  )
})

test('Target119 u21878 source and compiled graphs close the five exceptions without replay', {
  skip: !selected,
}, async () => {
  const baselineSourceBytes = readExact(fixture.inputs.target118HistoricalSource)
  const baselineDeclaration = await runDeclaration(
    path.join(root, fixture.inputs.target118HistoricalSource.path),
    fixture.inputs.target118HistoricalSource.declaration,
  )
  assert.deepEqual(descriptor(baselineDeclaration.bytes), {
    bytes: baselineSourceBytes.length,
    sha256: fixture.inputs.target118HistoricalSource.sha256,
  })
  const historicalTargetBytes = readExact(fixture.inputs.target119HistoricalSource)
  const historicalTargetDeclaration = await runDeclaration(
    path.join(root, fixture.inputs.target119HistoricalSource.path),
    fixture.inputs.target119HistoricalSource.declaration,
  )
  assert.deepEqual(descriptor(historicalTargetDeclaration.bytes), {
    bytes: historicalTargetBytes.length,
    sha256: fixture.inputs.target119HistoricalSource.sha256,
  })

  const selectedFilename = path.join(sourceRoot, 'main.tsx')
  const selectedBytes = fs.readFileSync(selectedFilename)
  const selectedVariant = fixture.inputs.target119SourceVariants.find(
    variant =>
      JSON.stringify(descriptor(selectedBytes)) ===
      JSON.stringify(variant.file),
  )
  assert.ok(selectedVariant, 'selected source is exact raw/historical or package')
  const selectedDeclaration = await runDeclaration(
    selectedFilename,
    selectedVariant.declaration,
  )
  assert.deepEqual(
    descriptor(Buffer.from(selectedDeclaration.source)),
    {
      bytes: fixture.inputs.target119HistoricalSource.declaration.bytes,
      sha256: fixture.inputs.target119HistoricalSource.declaration.sha256,
    },
  )

  const baselineInclude = sourceSegment(
    baselineDeclaration.source,
    'includeHook',
  )
  const targetInclude = sourceSegment(selectedDeclaration.source, 'includeHook')
  assert.deepEqual(
    segmentProjection(baselineInclude),
    fixture.sourceGraph.target118IncludeHookGraph,
  )
  assert.deepEqual(
    segmentProjection(targetInclude),
    fixture.sourceGraph.target119IncludeHookGraph,
  )
  assert.equal(baselineInclude.source, targetInclude.source)
  assert.equal(
    baselineInclude.source.split('includeHookEvents').length - 1,
    1,
  )

  const baselineCcr = sourceSegment(baselineDeclaration.source, 'ccr')
  const targetCcr = sourceSegment(selectedDeclaration.source, 'ccr')
  const {
    handleOAuth401ErrorOccurrences: _baselineHandleOccurrences,
    ...baselineCcrExpected
  } = fixture.sourceGraph.target118CcrGraph
  const {
    handleOAuth401ErrorOccurrences: _targetHandleOccurrences,
    ...targetCcrExpected
  } = fixture.sourceGraph.target119CcrGraph
  assert.deepEqual(segmentProjection(baselineCcr), baselineCcrExpected)
  assert.deepEqual(segmentProjection(targetCcr), targetCcrExpected)
  assert.equal(
    baselineCcr.source.split('handleOAuth401Error').length - 1,
    fixture.sourceGraph.target118CcrGraph.handleOAuth401ErrorOccurrences,
  )
  assert.equal(
    targetCcr.source.split('handleOAuth401Error').length - 1,
    fixture.sourceGraph.target119CcrGraph.handleOAuth401ErrorOccurrences,
  )

  const baselineCcshare = sourceSegment(baselineDeclaration.source, 'ccshare')
  const targetCcshare = sourceSegment(selectedDeclaration.source, 'ccshare')
  const {
    parseCcshareIdOccurrences: _baselineParseOccurrences,
    loadCcshareOccurrences: _baselineLoadOccurrences,
    ...baselineCcshareExpected
  } = fixture.sourceGraph.target118CcshareGraph
  const {
    parseCcshareIdOccurrences: _targetParseOccurrences,
    loadCcshareOccurrences: _targetLoadOccurrences,
    ...targetCcshareExpected
  } = fixture.sourceGraph.target119CcshareGraph
  assert.deepEqual(segmentProjection(baselineCcshare), baselineCcshareExpected)
  assert.deepEqual(segmentProjection(targetCcshare), targetCcshareExpected)
  assert.equal(baselineCcshare.source, targetCcshare.source)
  for (const [needle, field] of [
    ['parseCcshareId', 'parseCcshareIdOccurrences'],
    ['loadCcshare', 'loadCcshareOccurrences'],
  ]) {
    assert.equal(
      targetCcshare.source.split(needle).length - 1,
      fixture.sourceGraph.target119CcshareGraph[field],
    )
  }

  const baselineBundle = readArtifact(fixture.inputs.baselineBundle)
  const targetBundle = readArtifact(fixture.inputs.targetBundle)
  const baselineUnit = {
    start: fixture.units.baselineRun.start,
    bytes: unitSlice(baselineBundle, fixture.units.baselineRun),
  }
  const targetUnit = {
    start: fixture.units.targetRun.start,
    bytes: unitSlice(targetBundle, fixture.units.targetRun),
  }
  const targetBuildGraph = smallestIf(targetUnit, 13690212)
  assert.deepEqual(
    {
      start: targetBuildGraph.start,
      end: targetBuildGraph.end,
      bytes: targetBuildGraph.bytes,
      sha256: targetBuildGraph.sha256,
      tokenCount: targetBuildGraph.tokenCount,
      canonicalDescriptor: targetBuildGraph.canonicalDescriptor,
      parseCcshareId: rawOccurrences(
        targetBuildGraph.tokens,
        'parseCcshareId',
      ),
      isAbsolute: rawOccurrences(targetBuildGraph.tokens, 'isAbsolute'),
      notFoundExplicitId: rawOccurrences(
        targetBuildGraph.tokens,
        '"not_found_explicit_id"',
      ),
      failureReason: rawOccurrences(
        targetBuildGraph.tokens,
        'failure_reason',
      ),
    },
    fixture.sourceGraph.targetBuildProfileGraph,
  )

  const baselineCliGraph = smallestIf(baselineUnit, 13208325)
  const targetCliGraph = smallestIf(targetUnit, 13691259)
  for (const [actual, expected] of [
    [baselineCliGraph, fixture.sourceGraph.baselineCliResumeGraph],
    [targetCliGraph, fixture.sourceGraph.targetCliResumeGraph],
  ]) {
    assert.deepEqual(
      {
        start: actual.start,
        end: actual.end,
        bytes: actual.bytes,
        sha256: actual.sha256,
        tokenCount: actual.tokenCount,
        canonicalDescriptor: actual.canonicalDescriptor,
        notFoundExplicitId: rawOccurrences(
          actual.tokens,
          '"not_found_explicit_id"',
        ),
        failureReason: rawOccurrences(actual.tokens, 'failure_reason'),
      },
      expected,
    )
  }
  assert.deepEqual(
    baselineCliGraph.tokens.map(token => token.canonical),
    targetCliGraph.tokens.map(token => token.canonical),
  )

  const strictGroups = fixture.strictProof
  assert.deepEqual(
    [...strictGroups.rawPredecessorRowIndexes,
      ...strictGroups.macroNormalizedRowIndexes,
      ...strictGroups.retainedGraphOccurrenceRowIndexes,
      ...strictGroups.buildProfileMaterializedRowIndexes].sort(
      (left, right) => left - right,
    ),
    strictGroups.strictRowIndexes,
  )
  assert.deepEqual(strictGroups.counts, {
    rawPredecessor: 13,
    macroNormalized: 6,
    retainedGraphOccurrence: 2,
    buildProfileMaterialized: 1,
    total: 22,
  })
  assert.deepEqual(strictGroups.retainedGraphOccurrenceRowIndexes, [35, 36])
  assert.deepEqual(strictGroups.buildProfileMaterializedRowIndexes, [33])
  assert.equal(fixture.replay, null)
})
