import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { indexGeneratedBundle } from '../lib/structural-delta.mjs'
import * as ownerProofModule from '../cases/2.1.118-to-2.1.119/recovered/use-can-use-tool-denial-history-owner-overrides.mjs'
import {
  TARGET119_USE_CAN_USE_TOOL_DENIAL_HISTORY_EVIDENCE_IDS,
  TARGET119_USE_CAN_USE_TOOL_DENIAL_HISTORY_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/use-can-use-tool-denial-history-owner-overrides.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-use-can-use-tool-denial-history-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '1d56d2cc70f349ce036b82946c63e6d613e310b493dae37c1bc5a33a9f3e76dc'
const configuredSourceRoot =
  process.env.CLAUDE_CODE_2_1_119_SOURCE_ROOT ??
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
const sourceRoot = configuredSourceRoot
  ? path.resolve(configuredSourceRoot)
  : path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src')

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

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
  assert(region, `u${expected.targetIndex}`)
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
    },
  )
  if ('baselineUnitIndex' in expected) {
    assert.equal(region.baselineUnitIndex, expected.baselineUnitIndex)
    assert.equal(region.pairReason, expected.pairReason)
  }
  if ('unknownFreeIdentifierCount' in expected) {
    assert.equal(
      region.unknownFreeIdentifierCount,
      expected.unknownFreeIdentifierCount,
    )
  }
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

function normalizedTokens(unit) {
  return unit.tokens.map(token => {
    let value = token.raw
    if (token.label === 'name') {
      const identity = unit.identity.identifierAt.get(token.start)
      value = identity ? `@${identity.kind}` : `name:${token.raw}`
    }
    return [token.label, value]
  })
}

function normalizedDescriptor(tokens) {
  const value = JSON.stringify(tokens)
  return {
    tokens: tokens.length,
    jsonBytes: Buffer.byteLength(value),
    sha256: sha256(value),
  }
}

function changedEditRuns(baseline, target) {
  const baselineLength = baseline.length
  const targetLength = target.length
  const width = targetLength + 1
  const lcs = new Uint16Array((baselineLength + 1) * width)
  const equal = (left, right) =>
    left[0] === right[0] && left[1] === right[1]

  for (let baselineIndex = baselineLength - 1; baselineIndex >= 0; baselineIndex--) {
    for (let targetIndex = targetLength - 1; targetIndex >= 0; targetIndex--) {
      lcs[baselineIndex * width + targetIndex] = equal(
        baseline[baselineIndex],
        target[targetIndex],
      )
        ? 1 + lcs[(baselineIndex + 1) * width + targetIndex + 1]
        : Math.max(
            lcs[(baselineIndex + 1) * width + targetIndex],
            lcs[baselineIndex * width + targetIndex + 1],
          )
    }
  }

  let baselineIndex = 0
  let targetIndex = 0
  const operations = []
  while (baselineIndex < baselineLength || targetIndex < targetLength) {
    let type
    if (
      baselineIndex < baselineLength &&
      targetIndex < targetLength &&
      equal(baseline[baselineIndex], target[targetIndex])
    ) {
      type = '='
    } else if (
      targetIndex < targetLength &&
      (baselineIndex === baselineLength ||
        lcs[baselineIndex * width + targetIndex + 1] >=
          lcs[(baselineIndex + 1) * width + targetIndex])
    ) {
      type = '+'
    } else {
      type = '-'
    }

    let operation = operations.at(-1)
    if (!operation || operation.type !== type) {
      operation = {
        type,
        aStart: baselineIndex,
        bStart: targetIndex,
        tokens: [],
      }
      operations.push(operation)
    }
    if (type === '=') {
      operation.tokens.push(baseline[baselineIndex])
      baselineIndex++
      targetIndex++
    } else if (type === '+') {
      operation.tokens.push(target[targetIndex])
      targetIndex++
    } else {
      operation.tokens.push(baseline[baselineIndex])
      baselineIndex++
    }
    operation.aEnd = baselineIndex
    operation.bEnd = targetIndex
  }

  const changed = operations
    .filter(operation => operation.type !== '=')
    .map(operation => ({
      type: operation.type,
      aStart: operation.aStart,
      aEnd: operation.aEnd,
      bStart: operation.bStart,
      bEnd: operation.bEnd,
      tokens: operation.tokens.length,
      tokenSha256: sha256(JSON.stringify(operation.tokens)),
    }))
  const serialized = JSON.stringify(changed)
  return {
    lcsTokens: lcs[0],
    deletedTokens: baselineLength - lcs[0],
    insertedTokens: targetLength - lcs[0],
    changedRuns: changed.length,
    editScriptJsonBytes: Buffer.byteLength(serialized),
    editScriptSha256: sha256(serialized),
  }
}

function rowIdentities(rows) {
  return rows.map(row => [
    row.structural.index,
    row.literalKind,
    row.value,
    row.target.start,
    row.target.end,
    row.baselineOccurrenceCount,
    row.targetOccurrenceNumber,
    row.targetAdded,
  ])
}

function assertIdentitySet(rows, expected) {
  const identities = rowIdentities(rows)
  assert.deepEqual(identities, expected.identities)
  assert.deepEqual(
    {
      rows: identities.length,
      jsonBytes: Buffer.byteLength(JSON.stringify(identities)),
      sha256: sha256(JSON.stringify(identities)),
    },
    {
      rows: expected.rows,
      jsonBytes: expected.jsonBytes,
      sha256: expected.sha256,
    },
  )
}

function gitBuffer(args) {
  const result = spawnSync('git', args, {
    cwd: root,
    maxBuffer: 32 * 1024 * 1024,
  })
  assert.equal(result.status, 0, result.stderr.toString())
  return result.stdout
}

function gitSource(commit, sourcePath) {
  return gitBuffer(['show', `${commit}:${sourcePath}`]).toString('utf8')
}

function assertBlob(commit, sourcePath, expected) {
  const blob = gitBuffer(['rev-parse', `${commit}:${sourcePath}`])
    .toString('utf8')
    .trim()
  assert.equal(blob, expected)
}

function parseInlineSourceMap(source) {
  const match = source.match(
    /\/\/# sourceMappingURL=data:application\/json;charset=utf-8;base64,([^\n]+)$/m,
  )
  assert(match)
  const raw = Buffer.from(match[1], 'base64')
  return {
    base64: match[1],
    raw,
    value: JSON.parse(raw),
  }
}

let typescriptPromise
async function loadTypeScript() {
  typescriptPromise ??= import(
    pathToFileURL(
      path.join(
        root,
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      ),
    ).href
  ).then(module => module.default ?? module)
  return typescriptPromise
}

function findFunction(ts, sourceFile, name) {
  const matches = []
  function visit(node) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.getText(sourceFile) === name
    ) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(matches.length, 1, name)
  return matches[0]
}

let runtimeCache
function loadRuntime() {
  if (runtimeCache) return runtimeCache
  const baselineBundle = readPinned(fixture.inputs.baselineBundle)
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const baselineLedger = readLedger(fixture.inputs.baselineStructuralLedger)
  const targetLedger = readLedger(fixture.inputs.targetStructuralLedger)
  const baselineRegion = assertRegion(baselineLedger, fixture.baselineUnit)
  const targetRegion = assertRegion(targetLedger, fixture.targetUnit)
  const baselineIndex = indexGeneratedBundle(
    path.join(root, fixture.inputs.baselineBundle.path),
  )
  const targetIndex = indexGeneratedBundle(
    path.join(root, fixture.inputs.targetBundle.path),
  )
  const baselineUnit = baselineIndex.units.find(
    unit =>
      unit.start === fixture.baselineUnit.start &&
      unit.end === fixture.baselineUnit.end,
  )
  const targetUnit = targetIndex.units.find(
    unit =>
      unit.start === fixture.targetUnit.start &&
      unit.end === fixture.targetUnit.end,
  )
  assert(baselineUnit)
  assert(targetUnit)
  runtimeCache = {
    baselineBundle,
    targetBundle,
    baselineLedger,
    targetLedger,
    baselineRegion,
    targetRegion,
    baselineUnit,
    targetUnit,
    baselineText: slicePinned(baselineBundle, fixture.baselineUnit).toString(),
    targetText: slicePinned(targetBundle, fixture.targetUnit).toString(),
  }
  return runtimeCache
}

test('Target119 denial-history fixture exposes one static useCanUseTool override', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.case, '2.1.118-to-2.1.119')
  assert.equal(fixture.status, 'static-complete-unit-proof')
  assert.deepEqual(
    Object.keys(ownerProofModule).sort(),
    [
      'TARGET119_USE_CAN_USE_TOOL_DENIAL_HISTORY_EVIDENCE_IDS',
      'TARGET119_USE_CAN_USE_TOOL_DENIAL_HISTORY_OWNER_OVERRIDES',
    ],
  )
  assert.deepEqual(
    TARGET119_USE_CAN_USE_TOOL_DENIAL_HISTORY_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
  assert.deepEqual(TARGET119_USE_CAN_USE_TOOL_DENIAL_HISTORY_OWNER_OVERRIDES, [
    {
      key: '2.1.118-to-2.1.119:20652',
      targetIndex: 20652,
      paths: ['src/hooks/useCanUseTool.tsx'],
      declarations: ['useCanUseTool'],
      evidenceIds: fixture.evidenceIds,
      behavior: fixture.ownerBehavior,
    },
  ])
  assert(Object.isFrozen(TARGET119_USE_CAN_USE_TOOL_DENIAL_HISTORY_EVIDENCE_IDS))
  assert(Object.isFrozen(TARGET119_USE_CAN_USE_TOOL_DENIAL_HISTORY_OWNER_OVERRIDES))
  assert(Object.isFrozen(TARGET119_USE_CAN_USE_TOOL_DENIAL_HISTORY_OWNER_OVERRIDES[0]))
  assert.equal(fixture.replayDecision.mode, 'static-only')
  assert.equal(fixture.replayDecision.graphClosed, false)
  assert.deepEqual(fixture.replayDecision.sourceReplayHelpers, [])
})

test('complete Target119 useCanUseTool delta is pinned to its predecessor and descendants', () => {
  const runtime = loadRuntime()
  const baselineTokens = normalizedTokens(runtime.baselineUnit)
  const targetTokens = normalizedTokens(runtime.targetUnit)
  assert.deepEqual(
    normalizedDescriptor(baselineTokens),
    fixture.normalizedDelta.baseline,
  )
  assert.deepEqual(
    normalizedDescriptor(targetTokens),
    fixture.normalizedDelta.target,
  )
  assert.deepEqual(changedEditRuns(baselineTokens, targetTokens), {
    lcsTokens: fixture.normalizedDelta.lcsTokens,
    deletedTokens: fixture.normalizedDelta.deletedTokens,
    insertedTokens: fixture.normalizedDelta.insertedTokens,
    changedRuns: fixture.normalizedDelta.changedRuns,
    editScriptJsonBytes: fixture.normalizedDelta.editScriptJsonBytes,
    editScriptSha256: fixture.normalizedDelta.editScriptSha256,
  })

  const helperRegion = assertRegion(runtime.targetLedger, fixture.inputKeyHelper)
  assert.equal(helperRegion.unknownFreeIdentifierCount, 0)
  assert.equal(
    slicePinned(runtime.targetBundle, fixture.inputKeyHelper).toString(),
    fixture.inputKeyHelper.text,
  )

  const persistenceInputs = [
    [fixture.inputs.target120Bundle, fixture.inputs.target120StructuralLedger],
    [fixture.inputs.target121Bundle, fixture.inputs.target121StructuralLedger],
  ]
  for (let index = 0; index < fixture.persistentRuntime.length; index++) {
    const expected = fixture.persistentRuntime[index]
    const [bundleInput, ledgerInput] = persistenceInputs[index]
    const bundle = readPinned(bundleInput)
    const ledger = readLedger(ledgerInput)
    assertRegion(ledger, expected)
    slicePinned(bundle, expected)
  }
  assert.equal(
    fixture.persistentRuntime[0].coarseHash,
    fixture.targetUnit.coarseHash,
  )
  assert.equal(
    fixture.persistentRuntime[1].coarseHash,
    fixture.targetUnit.coarseHash,
  )
})

test('all owner residues, sole owner, and coverage correction remain atomic', () => {
  const report = JSON.parse(
    fs.readFileSync(path.join(root, fixture.inputs.targetReport.path)),
  )
  const ownerRows = report.sourceRuntimeOwnerResidueRows.filter(
    row => row.structural.index === fixture.targetUnit.targetIndex,
  )
  const addedRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
    row => row.structural.index === fixture.targetUnit.targetIndex,
  )
  const strictRows = report.rows.filter(
    row => row.structural.index === fixture.targetUnit.targetIndex,
  )
  assertIdentitySet(ownerRows, fixture.ownerResidues.all)
  assertIdentitySet(addedRows, fixture.ownerResidues.added)
  assertIdentitySet(strictRows, fixture.ownerResidues.strict)
  assert(
    ownerRows.every(
      row =>
        JSON.stringify(row.ownerPaths) ===
        JSON.stringify(['hooks/useCanUseTool.tsx']),
    ),
  )

  const allOwners = JSON.parse(readPinned(fixture.inputs.allOwners))
  const owner = allOwners.rows.find(
    row => row.targetIndex === fixture.targetUnit.targetIndex,
  )
  assert(owner)
  assert.deepEqual(owner.owners, [fixture.attribution.owner])
  assert.deepEqual(
    owner.candidateOwners.map(candidate => [candidate.source, candidate.score]),
    fixture.attribution.candidateOwners,
  )
  assert.equal(owner.semanticOwnership, fixture.attribution.semanticOwnership)

  const coverage = JSON.parse(
    gunzipSync(
      fs.readFileSync(
        path.join(
          root,
          'recovery/cases/2.1.118-to-2.1.119/semantic/source-coverage.json.gz',
        ),
      ),
    ),
  )
  const coverageRow = coverage.rows.find(
    row => row.targetIndex === fixture.targetUnit.targetIndex,
  )
  assert(coverageRow)
  assert.deepEqual(coverageRow.ownerIds, fixture.coverageEvolution.ownerIds)
  const provisional = fixture.coverageEvolution.provisionalEvidenceIds
  const corrected = fixture.coverageEvolution.correctedEvidenceIds
  const evidenceState = JSON.stringify(coverageRow.evidenceIds)
  assert(
    evidenceState === JSON.stringify(provisional) ||
      evidenceState === JSON.stringify(corrected),
    `unexpected u20652 evidence state ${evidenceState}`,
  )
  if (evidenceState === JSON.stringify(corrected)) {
    assert.deepEqual(
      corrected.map(id => coverage.evidence.find(entry => entry.id === id)),
      fixture.evidenceCatalog,
    )
  } else {
    assert(
      !corrected.some(id => coverage.evidence.some(entry => entry.id === id)),
      'u20652 correction catalog must not be partially installed',
    )
  }
})

test('historical source authenticates behavior but not the compiled provider topology', async () => {
  const runtime = loadRuntime()
  const graph = fixture.sourceGraph
  const useCanBaseline = gitSource(
    graph.baselineCommit,
    graph.useCanUseTool.path,
  )
  const useCanTarget = gitSource(graph.targetCommit, graph.useCanUseTool.path)
  assertBlob(
    graph.baselineCommit,
    graph.useCanUseTool.path,
    graph.useCanUseTool.baselineBlob,
  )
  assertBlob(
    graph.targetCommit,
    graph.useCanUseTool.path,
    graph.useCanUseTool.targetBlob,
  )
  assert.deepEqual(
    sourceDescriptor(useCanBaseline),
    graph.useCanUseTool.baselineFile,
  )
  assert.deepEqual(
    sourceDescriptor(useCanTarget),
    graph.useCanUseTool.targetFile,
  )
  const packagedUseCan = fs.readFileSync(
    path.join(sourceRoot, 'hooks/useCanUseTool.tsx'),
    'utf8',
  )
  assert.equal(packagedUseCan, useCanTarget)

  const ts = await loadTypeScript()
  for (const [source, expected] of [
    [useCanBaseline, graph.useCanUseTool.baselineDeclaration],
    [useCanTarget, graph.useCanUseTool.targetDeclaration],
  ]) {
    const sourceFile = ts.createSourceFile(
      graph.useCanUseTool.path,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    const declaration = findFunction(ts, sourceFile, 'useCanUseTool')
    const start = declaration.getStart(sourceFile)
    const text = source.slice(start, declaration.end)
    assert.deepEqual(
      { start, end: declaration.end, ...sourceDescriptor(text) },
      expected,
    )
  }

  const functionalDiff = gitBuffer([
    ...graph.useCanUseTool.functionalDiff.gitArgs,
    graph.baselineCommit,
    graph.targetCommit,
    '--',
    graph.useCanUseTool.path,
  ])
  assert.deepEqual(descriptor(functionalDiff), {
    bytes: graph.useCanUseTool.functionalDiff.bytes,
    sha256: graph.useCanUseTool.functionalDiff.sha256,
  })
  assert.equal(
    functionalDiff.toString().split('\n').filter(line => /^\+[^+]/.test(line))
      .length,
    graph.useCanUseTool.functionalDiff.insertions,
  )
  assert.equal(
    functionalDiff.toString().split('\n').filter(line => /^-[^-]/.test(line))
      .length,
    graph.useCanUseTool.functionalDiff.deletions,
  )

  const baselineMap = parseInlineSourceMap(useCanBaseline)
  const targetMap = parseInlineSourceMap(useCanTarget)
  assert.equal(baselineMap.base64, targetMap.base64)
  const mapExpected = graph.useCanUseTool.inlineSourceMap
  assert.deepEqual(descriptor(targetMap.raw), {
    bytes: mapExpected.rawBytes,
    sha256: mapExpected.rawSha256,
  })
  assert.deepEqual(descriptor(targetMap.base64), {
    bytes: mapExpected.base64Chars,
    sha256: mapExpected.base64Sha256,
  })
  assert.deepEqual(targetMap.value.sources, mapExpected.sources)
  assert.equal(targetMap.value.names.length, mapExpected.names)
  assert.deepEqual(descriptor(targetMap.value.mappings), {
    bytes: mapExpected.mappingsBytes,
    sha256: mapExpected.mappingsSha256,
  })
  assert.deepEqual(
    sourceDescriptor(targetMap.value.sourcesContent[0]),
    mapExpected.authoredContent,
  )
  for (const marker of mapExpected.missingMarkers) {
    assert(!targetMap.value.sourcesContent[0].includes(marker), marker)
    assert(useCanTarget.includes(marker), marker)
  }

  const autoBaseline = gitSource(
    graph.baselineCommit,
    graph.autoModeDenials.path,
  )
  const autoTarget = gitSource(graph.targetCommit, graph.autoModeDenials.path)
  assertBlob(
    graph.baselineCommit,
    graph.autoModeDenials.path,
    graph.autoModeDenials.baselineBlob,
  )
  assertBlob(
    graph.targetCommit,
    graph.autoModeDenials.path,
    graph.autoModeDenials.targetBlob,
  )
  assert.deepEqual(
    sourceDescriptor(autoBaseline),
    graph.autoModeDenials.baselineFile,
  )
  assert.deepEqual(sourceDescriptor(autoTarget), graph.autoModeDenials.targetFile)
  assert.equal(
    fs.readFileSync(path.join(sourceRoot, 'utils/autoModeDenials.ts'), 'utf8'),
    autoTarget,
  )
  const autoDiff = gitBuffer([
    'diff',
    '--unified=0',
    graph.baselineCommit,
    graph.targetCommit,
    '--',
    graph.autoModeDenials.path,
  ])
  assert.deepEqual(descriptor(autoDiff), {
    bytes: graph.autoModeDenials.diff.bytes,
    sha256: graph.autoModeDenials.diff.sha256,
  })
  for (const marker of graph.autoModeDenials.requiredMarkers) {
    assert(autoTarget.includes(marker), marker)
  }
  for (const marker of graph.autoModeDenials.missingRuntimeMarkers) {
    assert(!autoTarget.includes(marker), marker)
  }

  const appBaseline = gitSource(graph.baselineCommit, graph.app.path)
  const appTarget = gitSource(graph.targetCommit, graph.app.path)
  assertBlob(graph.baselineCommit, graph.app.path, graph.app.baselineBlob)
  assertBlob(graph.targetCommit, graph.app.path, graph.app.targetBlob)
  assert.equal(appBaseline, appTarget)
  assert.deepEqual(sourceDescriptor(appTarget), graph.app.file)
  assert.equal(
    fs.readFileSync(path.join(sourceRoot, 'components/App.tsx'), 'utf8'),
    appTarget,
  )
  assert.equal(
    appTarget.split('AutoModeDenialsProvider').length - 1,
    graph.app.providerOccurrences,
  )

  const providerFixture = JSON.parse(
    readPinned(fixture.inputs.contextProviderProof),
  )
  assert.equal(providerFixture.targetUnits.provider.targetIndex, 17435)
  assert.equal(providerFixture.targetUnits.initializer.targetIndex, 17438)
  assert.deepEqual(
    providerFixture.sourceGraph.target119.missingMarkers,
    ['AutoModeDenialsProvider', 'useAutoModeDenials', 'removeDenial:'],
  )
  assert.equal(providerFixture.sourceGraph.target119App.providerOccurrences, 0)
  assertRegion(runtime.targetLedger, providerFixture.targetUnits.provider)
  assertRegion(runtime.targetLedger, providerFixture.targetUnits.initializer)
  slicePinned(runtime.targetBundle, providerFixture.targetUnits.provider)
  slicePinned(runtime.targetBundle, providerFixture.targetUnits.initializer)
  assert.equal(
    slicePinned(runtime.targetBundle, fixture.semanticContract.compiledContextHook)
      .toString(),
    fixture.semanticContract.compiledContextHook.text,
  )
})

test('denial identity and allow-only continuation are exhaustive and replay stays blocked', () => {
  const runtime = loadRuntime()
  for (const marker of fixture.semanticContract.compiledMarkers) {
    assert(runtime.targetText.includes(marker), marker)
  }
  for (const marker of fixture.semanticContract.baselineMissingMarkers) {
    assert(!runtime.baselineText.includes(marker), marker)
  }

  const inputKey = (toolName, input) =>
    toolName === 'Bash'
      ? JSON.stringify({ command: input.command })
      : JSON.stringify(input)
  const advance = ({ denials, toolName, input, behavior, now, reasonType }) => {
    const key = inputKey(toolName, input)
    const previous = denials.find(
      denial => denial.toolName === toolName && denial.inputKey === key,
    )
    const events = []
    let remaining = [...denials]
    if (previous && behavior === 'allow') {
      events.push({
        event: 'tengu_auto_mode_subsequent_approval',
        toolName: toolName.toLowerCase(),
        msSinceDeny: now - previous.timestamp,
        allowReasonType: reasonType,
      })
      remaining = remaining.filter(denial => denial !== previous)
    }
    return { key, previous, events, remaining }
  }

  const bashDenial = {
    toolName: 'Bash',
    inputKey: JSON.stringify({ command: 'git status' }),
    timestamp: 900,
  }
  const bashAllowed = advance({
    denials: [bashDenial],
    toolName: 'Bash',
    input: { command: 'git status', description: 'ignored for identity' },
    behavior: 'allow',
    now: 1000,
    reasonType: 'user',
  })
  assert.equal(bashAllowed.previous, bashDenial)
  assert.deepEqual(bashAllowed.events, [
    {
      event: 'tengu_auto_mode_subsequent_approval',
      toolName: 'bash',
      msSinceDeny: 100,
      allowReasonType: 'user',
    },
  ])
  assert.deepEqual(bashAllowed.remaining, [])

  const readDenial = {
    toolName: 'Read',
    inputKey: JSON.stringify({ file_path: '/a', offset: 1 }),
    timestamp: 800,
  }
  assert.equal(
    advance({
      denials: [readDenial],
      toolName: 'Read',
      input: { file_path: '/a', offset: 2 },
      behavior: 'allow',
      now: 1000,
      reasonType: 'user',
    }).previous,
    undefined,
  )
  for (const behavior of ['ask', 'deny']) {
    const result = advance({
      denials: [readDenial],
      toolName: 'Read',
      input: { file_path: '/a', offset: 1 },
      behavior,
      now: 1000,
      reasonType: 'user',
    })
    assert.equal(result.previous, readDenial)
    assert.deepEqual(result.events, [])
    assert.deepEqual(result.remaining, [readDenial])
  }

  assert.equal(fixture.replayDecision.graphClosed, false)
  assert.equal(fixture.replayDecision.sourceAppProviderOccurrences, 0)
  assert.equal(fixture.replayDecision.inlineSourceMapTracksDelta, false)
  assert.notEqual(
    fixture.replayDecision.compiledStorage,
    fixture.replayDecision.sourceStorage,
  )
  assert.deepEqual(fixture.replayDecision.sourceReplayHelpers, [])
})
