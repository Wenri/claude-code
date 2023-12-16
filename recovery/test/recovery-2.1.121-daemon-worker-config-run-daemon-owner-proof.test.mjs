import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import * as ownerProofModule from '../cases/2.1.120-to-2.1.121/recovered/daemon-worker-config-run-daemon-owner-overrides.mjs'
import { buildTarget121DaemonStatusProcStartOutput } from '../cases/2.1.120-to-2.1.121/recovered/replay-daemon-status-supervisor-proc-start-source-gap.mjs'

const {
  TARGET121_DAEMON_WORKER_CONFIG_RUN_DAEMON_EVIDENCE_IDS,
  TARGET121_DAEMON_WORKER_CONFIG_RUN_DAEMON_OWNER_OVERRIDES,
  TARGET121_DAEMON_WORKER_CONFIG_RUN_DAEMON_PROOF_SPEC,
} = ownerProofModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-daemon-worker-config-run-daemon-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '461e571f55ff464efd9717a265a84ee5a735d8f3d1e8e3de424ad625473983b1'
const typedReportPath = path.resolve(
  process.env.CLAUDE_CODE_2_1_121_TYPED_REPORT ??
    path.join(
      repositoryRoot,
      fixture.inputs.frozenPostDaemonOwnerSnapshot.typedReport.path,
    ),
)
const sourceCoveragePath = path.resolve(
  process.env.CLAUDE_CODE_2_1_121_SOURCE_COVERAGE ??
    path.join(
      repositoryRoot,
      fixture.inputs.frozenPostDaemonOwnerSnapshot.sourceCoverage.path,
    ),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function expectedDescriptor(expected) {
  return { bytes: expected.bytes, sha256: expected.sha256 }
}

function canonicalDescriptor(value) {
  return descriptor(JSON.stringify(value))
}

function canonicalPhysicalResidue(row) {
  return [
    row.structural.index,
    row.literalKind,
    row.value,
    row.target.start,
    row.target.end,
    row.baselineOccurrenceCount,
    row.targetOccurrenceNumber,
    row.targetAdded,
  ]
}

function sortPhysicalRows(rows) {
  return [...rows].sort(
    (a, b) => a[0] - b[0] || a[3] - b[3] || a[4] - b[4],
  )
}

function selectedRows(rows) {
  const targetIndices = new Set(fixture.targetIndices)
  return sortPhysicalRows(
    rows
      .filter(row => targetIndices.has(row.structural.index))
      .map(canonicalPhysicalResidue),
  )
}

function selectArtifactPhase(reportDescriptor, gzipDescriptor, rawDescriptor) {
  const matches = fixture.phaseEvolution.acceptedArtifactPairs.filter(
    phase =>
      JSON.stringify(reportDescriptor) ===
        JSON.stringify(phase.typedReport) &&
      JSON.stringify(gzipDescriptor) ===
        JSON.stringify(expectedDescriptor(phase.sourceCoverage)) &&
      JSON.stringify(rawDescriptor) ===
        JSON.stringify({
          bytes: phase.sourceCoverage.rawBytes,
          sha256: phase.sourceCoverage.rawSha256,
        }),
  )
  assert.equal(matches.length, 1, 'unknown or hybrid worker-owner artifact pair')
  return matches[0]
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), expectedDescriptor(expected), label)
  return bytes
}

function artifactPath(environmentName, expected) {
  return path.resolve(
    process.env[environmentName] ?? path.join(repositoryRoot, expected.path),
  )
}

function sourceFilename(root, sourcePath) {
  assert.ok(sourcePath.startsWith('src/'))
  return path.join(root, sourcePath.slice(4))
}

function targetSourceRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_121_SOURCE_ROOT ??
      process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
      path.join(repositoryRoot, fixture.inputs.sourceRoots.raw),
  )
}

function baselineSourceRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_120_SOURCE_ROOT ??
      path.join(repositoryRoot, fixture.inputs.sourceRoots.baseline),
  )
}

function packageSourceRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_121_FRESH_PACKAGE_SOURCE_ROOT ??
      fixture.inputs.sourceRoots.postPrunePackage,
  )
}

function occurrenceCount(source, needle) {
  return source.split(needle).length - 1
}

function parseBundleUnit(bundle, expected, label) {
  const bytes = bundle.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(bytes), {
    bytes: expected.bytes,
    sha256: expected.sha256,
  }, label)
  const source = bytes.toString('utf8')
  const program = parse(source, { ecmaVersion: 'latest' })
  assert.equal(program.body.length, 1, `${label}: one complete unit`)
  const node = program.body[0]
  assert.equal(node.type, expected.nodeType)
  assert.equal(node.id.name, expected.name)
  assert.equal(node.params.length, 1)
  assert.equal(node.body.body.length, expected.bodyStatementCount)
  assert.equal(
    [...tokenizer(source, { ecmaVersion: 'latest' })].length,
    expected.tokenCount,
  )
  return { bytes, node, source }
}

function exactFragment(bundle, expected, unit, label) {
  assert.equal(expected.start, unit.start + expected.localStart, label)
  assert.equal(expected.end, unit.start + expected.localEnd, label)
  const bytes = bundle.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(bytes), expectedDescriptor(expected), label)
  return bytes.toString('utf8')
}

function typescript() {
  return require(
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  )
}

function parseSourceState(root, expectedFile) {
  const filename = sourceFilename(root, fixture.sourceGraph.path)
  const stat = fs.lstatSync(filename)
  assert.equal(stat.isFile(), true)
  assert.equal(stat.isSymbolicLink(), false)
  const bytes = readExact(filename, expectedFile, fixture.sourceGraph.path)
  const source = bytes.toString('utf8')
  assert.equal(source.length, expectedFile.chars)
  const ts = typescript()
  const sourceFile = ts.createSourceFile(
    fixture.sourceGraph.path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  const functions = []
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'runDaemon') {
      functions.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(functions.length, 1)
  return { bytes, filename, functionNode: functions[0], source, sourceFile, ts }
}

function sourceSlice(state, expected, label) {
  const value = state.source.slice(expected.start, expected.end)
  assert.equal(value.length, expected.chars, label)
  assert.deepEqual(descriptor(value), expectedDescriptor(expected), label)
  return value
}

test(
  'fixture freezes the exact two-unit override and all owner/add/strict partitions',
  { skip: !selected },
  () => {
    assert.deepEqual(descriptor(fixtureBytes), {
      bytes: fixtureBytes.length,
      sha256: FIXTURE_SHA256,
    })
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(
      descriptor(
        fs.readFileSync(
          path.join(repositoryRoot, fixture.caseFiles.helper.path),
        ),
      ),
      expectedDescriptor(fixture.caseFiles.helper),
    )
    assert.deepEqual(
      [...TARGET121_DAEMON_WORKER_CONFIG_RUN_DAEMON_EVIDENCE_IDS],
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET121_DAEMON_WORKER_CONFIG_RUN_DAEMON_OWNER_OVERRIDES.map(
        row => row.targetIndex,
      ),
      fixture.targetIndices,
    )
    assert.deepEqual(
      canonicalDescriptor(fixture.targetIndices),
      fixture.targetIndicesDescriptor,
    )
    assert.equal(
      TARGET121_DAEMON_WORKER_CONFIG_RUN_DAEMON_OWNER_OVERRIDES.every(
        row =>
          Object.isFrozen(row) &&
          Object.isFrozen(row.paths) &&
          Object.isFrozen(row.declarations) &&
          row.paths.length === 1 &&
          row.paths[0] === fixture.sourceGraph.path &&
          row.declarations.length === 1 &&
          row.declarations[0] === fixture.sourceGraph.declaration,
      ),
      true,
    )
    assert.equal(
      TARGET121_DAEMON_WORKER_CONFIG_RUN_DAEMON_PROOF_SPEC
        .sourceReplayAuthorized,
      false,
    )
    assert.equal(
      Object.keys(ownerProofModule).some(name => /REPLAY|apply|build/.test(name)),
      false,
    )

    const strict = fixture.residuePartitions.strict.rowsExact
    assert.deepEqual(
      canonicalDescriptor(strict),
      fixture.residuePartitions.strict.identities,
    )
    for (const [targetIndex, , , start, end] of strict) {
      const unit =
        targetIndex === 22170
          ? fixture.units.targetWorkerConfigManager
          : fixture.units.targetRunDaemon
      assert.ok(start >= unit.start && end <= unit.end && end > start)
    }
    for (const [targetIndex, expected] of Object.entries(
      fixture.residuePartitions.strict.byUnit,
    )) {
      const rows = strict.filter(row => row[0] === Number(targetIndex))
      assert.equal(rows.length, expected.rows)
      assert.deepEqual(canonicalDescriptor(rows), expected.identities)
    }
    const macroValues = new Set(
      fixture.residuePartitions.strict.buildMacroRows.values,
    )
    const macroRows = strict.filter(
      row => row[1] === 'string' && macroValues.has(row[2]),
    )
    const workerRows = strict.filter(row => !macroRows.includes(row))
    assert.equal(
      macroRows.length,
      fixture.residuePartitions.strict.buildMacroRows.rows,
    )
    assert.equal(
      workerRows.length,
      fixture.residuePartitions.strict.workerManagerRows.rows,
    )
    assert.deepEqual(
      canonicalDescriptor(macroRows),
      fixture.residuePartitions.strict.buildMacroRows.identities,
    )
    assert.deepEqual(
      canonicalDescriptor(workerRows),
      fixture.residuePartitions.strict.workerManagerRows.identities,
    )
    assert.deepEqual(fixture.residuePartitions.unclassifiedAdded, {
      units: 0,
      rows: 0,
      identities: {
        bytes: 2,
        sha256:
          '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
      },
    })
    assert.deepEqual(fixture.decision.expectedProductionStrictImpact, {
      units: -2,
      rows: -18,
    })
  },
)

test(
  'authenticated complete units prove the inline-to-extracted worker-manager lineage and shared caller',
  { skip: !selected },
  () => {
    const baselineBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_120_BUNDLE', fixture.inputs.baselineBundle),
      fixture.inputs.baselineBundle,
    )
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_121_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
    )
    const ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
          fixture.inputs.structuralLedger,
        ),
      ),
    )
    const baseline = parseBundleUnit(
      baselineBundle,
      fixture.units.baselineInlineRunDaemon,
      'Target120 inline runDaemon',
    )
    const manager = parseBundleUnit(
      targetBundle,
      fixture.units.targetWorkerConfigManager,
      'Target121 extracted worker manager',
    )
    const runDaemon = parseBundleUnit(
      targetBundle,
      fixture.units.targetRunDaemon,
      'Target121 runDaemon caller',
    )

    const baselineLedger = ledger.unmatchedBaseline.find(
      row => row.index === fixture.units.baselineInlineRunDaemon.index,
    )
    assert.deepEqual(
      {
        classification: 'unmatched-baseline',
        nodeType: baselineLedger.nodeType,
        parseStatus: baselineLedger.parseStatus,
        start: baselineLedger.start,
        end: baselineLedger.end,
        tokenCount: baselineLedger.tokenCount,
        sourceHash: baselineLedger.sourceHash,
        coarseHash: baselineLedger.coarseHash,
        topDefinitionCount: baselineLedger.topDefinitionCount,
      },
      {
        classification: fixture.units.baselineInlineRunDaemon.classification,
        nodeType: fixture.units.baselineInlineRunDaemon.nodeType,
        parseStatus: fixture.units.baselineInlineRunDaemon.parseStatus,
        start: fixture.units.baselineInlineRunDaemon.start,
        end: fixture.units.baselineInlineRunDaemon.end,
        tokenCount: fixture.units.baselineInlineRunDaemon.tokenCount,
        sourceHash: fixture.units.baselineInlineRunDaemon.sha256,
        coarseHash: fixture.units.baselineInlineRunDaemon.coarseHash,
        topDefinitionCount: fixture.units.baselineInlineRunDaemon.topDefinitionCount,
      },
    )
    for (const expected of [
      fixture.units.targetWorkerConfigManager,
      fixture.units.targetRunDaemon,
    ]) {
      const actual = ledger.unresolvedTarget.find(
        row => row.target.index === expected.index,
      )
      assert.equal(actual.classification, expected.classification)
      assert.equal(actual.unknownFreeIdentifierCount, expected.unknownFreeIdentifierCount)
      assert.deepEqual(
        {
          index: actual.target.index,
          nodeType: actual.target.nodeType,
          parseStatus: actual.target.parseStatus,
          start: actual.target.start,
          end: actual.target.end,
          tokenCount: actual.target.tokenCount,
          sourceHash: actual.target.sourceHash,
          coarseHash: actual.target.coarseHash,
          topDefinitionCount: actual.target.topDefinitionCount,
        },
        {
          index: expected.index,
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

    const fragments = fixture.compiledGraph.fragments
    for (const [name, expected] of Object.entries(fragments)) {
      const unit =
        expected.unit === 19500
          ? fixture.units.baselineInlineRunDaemon
          : expected.unit === 22170
            ? fixture.units.targetWorkerConfigManager
            : fixture.units.targetRunDaemon
      const bundle = expected.unit === 19500 ? baselineBundle : targetBundle
      exactFragment(bundle, expected, unit, name)
    }
    for (const [marker, count] of Object.entries(
      fixture.compiledGraph.baselineInvariantCounts,
    )) {
      assert.equal(occurrenceCount(baseline.source, marker), count, marker)
      const targetCount =
        (fixture.compiledGraph.targetWorkerManagerInvariantCounts[marker] ?? 0) +
        (fixture.compiledGraph.targetRunInvariantCounts[marker] ?? 0)
      assert.equal(
        occurrenceCount(manager.source, marker) +
          occurrenceCount(runDaemon.source, marker),
        targetCount,
        marker,
      )
    }
    for (const [marker, count] of Object.entries(
      fixture.compiledGraph.targetWorkerManagerInvariantCounts,
    )) {
      assert.equal(occurrenceCount(manager.source, marker), count, marker)
    }
    for (const [marker, count] of Object.entries(
      fixture.compiledGraph.targetRunInvariantCounts,
    )) {
      assert.equal(occurrenceCount(runDaemon.source, marker), count, marker)
    }
    assert.match(
      exactFragment(
        targetBundle,
        fragments.managerReturn,
        fixture.units.targetWorkerConfigManager,
        'manager return',
      ),
      /workerCount:.*hasOAuthConsumer:.*disposeWatcher:.*drainReloads:.*stop:/,
    )
    assert.match(
      exactFragment(
        targetBundle,
        fragments.runManagerCall,
        fixture.units.targetRunDaemon,
        'manager call',
      ),
      /G=await Sb4\(\{jsonPath:\$,invocation:J,logger:M,authManager:W,watch:z\}\);let U=G\.workerCount\(\)/,
    )
    assert.match(
      exactFragment(
        targetBundle,
        fragments.runTeardown,
        fixture.units.targetRunDaemon,
        'manager teardown',
      ),
      /G\.disposeWatcher\(\),await G\.drainReloads\(\)/,
    )
  },
)

test(
  'report and coverage selector accepts only atomic worker-owner phases',
  { skip: !selected },
  () => {
    const [postPrune, postDaemonOwner] =
      fixture.phaseEvolution.acceptedArtifactPairs
    assert.equal(postPrune.name, 'postPrune')
    assert.equal(postDaemonOwner.name, 'postDaemonOwner')
    for (const phase of fixture.phaseEvolution.acceptedArtifactPairs) {
      assert.equal(
        selectArtifactPhase(
          phase.typedReport,
          expectedDescriptor(phase.sourceCoverage),
          {
            bytes: phase.sourceCoverage.rawBytes,
            sha256: phase.sourceCoverage.rawSha256,
          },
        ),
        phase,
      )
    }
    assert.throws(
      () =>
        selectArtifactPhase(
          postPrune.typedReport,
          expectedDescriptor(postDaemonOwner.sourceCoverage),
          {
            bytes: postDaemonOwner.sourceCoverage.rawBytes,
            sha256: postDaemonOwner.sourceCoverage.rawSha256,
          },
        ),
      /unknown or hybrid/,
    )
    assert.throws(
      () =>
        selectArtifactPhase(
          { bytes: 1, sha256: 'unknown' },
          { bytes: 1, sha256: 'unknown' },
          { bytes: 1, sha256: 'unknown' },
        ),
      /unknown or hybrid/,
    )

    const reportBytes = fs.readFileSync(typedReportPath)
    const coverageGzip = fs.readFileSync(sourceCoveragePath)
    const coverageRaw = gunzipSync(coverageGzip)
    const phase = selectArtifactPhase(
      descriptor(reportBytes),
      descriptor(coverageGzip),
      descriptor(coverageRaw),
    )
    const report = JSON.parse(reportBytes)
    const coverage = JSON.parse(coverageRaw)
    const rows = selectedRows(report.rows)
    const ownerRows = selectedRows(report.sourceRuntimeOwnerResidueRows)
    const addedOwnerRows = selectedRows(
      report.sourceRuntimeAddedOwnerResidueRows,
    )
    const unclassifiedRows = selectedRows(
      report.sourceRuntimeUnclassifiedAddedResidueRows ?? [],
    )

    for (const targetIndex of fixture.targetIndices) {
      const key = String(targetIndex)
      const unitRows = rows.filter(row => row[0] === targetIndex)
      assert.equal(unitRows.length, phase.physicalRows[key].rows)
      assert.deepEqual(
        canonicalDescriptor(unitRows),
        phase.physicalRows[key].identities,
      )
      if (phase.physicalRows[key].rowsExact) {
        assert.deepEqual(unitRows, phase.physicalRows[key].rowsExact)
      }
    }

    if (phase.name === 'postPrune') {
      assert.deepEqual(
        canonicalDescriptor(ownerRows),
        fixture.residuePartitions.owner.identities,
      )
      assert.deepEqual(
        canonicalDescriptor(addedOwnerRows),
        fixture.residuePartitions.addedOwner.identities,
      )
    } else {
      for (const targetIndex of fixture.targetIndices) {
        const key = String(targetIndex)
        const unitOwnerRows = ownerRows.filter(row => row[0] === targetIndex)
        const unitAddedRows = addedOwnerRows.filter(
          row => row[0] === targetIndex,
        )
        assert.equal(unitOwnerRows.length, phase.ownerRows[key].rows)
        assert.deepEqual(
          canonicalDescriptor(unitOwnerRows),
          phase.ownerRows[key].identities,
        )
        assert.equal(unitAddedRows.length, phase.addedOwnerRows[key].rows)
        assert.deepEqual(
          canonicalDescriptor(unitAddedRows),
          phase.addedOwnerRows[key].identities,
        )
      }
      assert.deepEqual(
        canonicalDescriptor(unclassifiedRows),
        phase.unclassifiedAddedRows.identities,
      )
      const ownerById = new Map(
        coverage.owners.map(owner => [owner.id, owner.path]),
      )
      for (const targetIndex of fixture.targetIndices) {
        const row = coverage.rows.find(row => row.targetIndex === targetIndex)
        assert.ok(row)
        assert.deepEqual(
          canonicalDescriptor(row),
          phase.correctedCoverageRows[String(targetIndex)],
        )
        assert.deepEqual(
          row.ownerIds.map(ownerId => ownerById.get(ownerId)),
          ['src/daemon/main.ts'],
        )
        assert.deepEqual(row.evidenceIds, fixture.evidenceIds)
        assert.equal(row.disposition, 'source-runtime-covered')
      }
      assert.deepEqual(
        fixture.phaseEvolution.postDaemonOwnerExpectedProductionStrictImpact,
        { units: -2, rows: -19 },
      )
    }
  },
)

test(
  'raw daemon source pins the complete inline worker/auth/reload graph',
  { skip: !selected },
  () => {
    const states = Object.fromEntries(
      fixture.sourceGraph.states.map(state => [state.name, state]),
    )
    const selectedRoot = targetSourceRoot()
    const selectedFile = fs.readFileSync(
      sourceFilename(selectedRoot, fixture.sourceGraph.path),
    )
    const selectedDescriptor = descriptor(selectedFile)
    const selectedState = fixture.sourceGraph.states.find(
      state =>
        state.file.bytes === selectedDescriptor.bytes &&
        state.file.sha256 === selectedDescriptor.sha256,
    )
    assert.ok(selectedState, 'source root is exact raw or postPrune package state')
    const selectedSource = parseSourceState(selectedRoot, selectedState.file)
    const functionStart = selectedSource.functionNode.getStart(
      selectedSource.sourceFile,
    )
    assert.deepEqual(
      {
        start: functionStart,
        end: selectedSource.functionNode.end,
        chars: selectedSource.functionNode.end - functionStart,
        ...descriptor(
          selectedSource.source.slice(functionStart, selectedSource.functionNode.end),
        ),
        bodyStatementCount: selectedSource.functionNode.body.statements.length,
      },
      selectedState.runDaemon,
    )
    for (const [name, expected] of Object.entries(selectedState)) {
      if (['file', 'name', 'runDaemon'].includes(name)) continue
      sourceSlice(selectedSource, expected, `${selectedState.name}:${name}`)
    }
    const selectedRun = selectedSource.source.slice(
      selectedState.runDaemon.start,
      selectedState.runDaemon.end,
    )
    for (const [needle, count] of Object.entries(
      fixture.sourceGraph.runDaemonInvariantCounts,
    )) {
      assert.equal(occurrenceCount(selectedRun, needle), count, needle)
    }

    const raw =
      selectedState.name === 'raw'
        ? selectedSource
        : parseSourceState(
            path.join(repositoryRoot, fixture.inputs.sourceRoots.raw),
            states.raw.file,
          )
    const builtSource = buildTarget121DaemonStatusProcStartOutput(raw.source)
    assert.deepEqual(
      descriptor(builtSource),
      expectedDescriptor(states.postPrunePackage.file),
    )

    const baseline = parseSourceState(
      baselineSourceRoot(),
      fixture.sourceGraph.baseline.file,
    )
    const baselineStart = baseline.functionNode.getStart(baseline.sourceFile)
    assert.deepEqual(
      {
        start: baselineStart,
        end: baseline.functionNode.end,
        chars: baseline.functionNode.end - baselineStart,
        ...descriptor(
          baseline.source.slice(baselineStart, baseline.functionNode.end),
        ),
        bodyStatementCount: baseline.functionNode.body.statements.length,
      },
      fixture.sourceGraph.baseline.runDaemon,
    )
  },
)

test(
  'fresh Target121 package independently preserves the complete inline worker/auth/reload graph',
  { skip: !selected },
  t => {
    const root = packageSourceRoot()
    if (!fs.existsSync(root)) {
      t.skip(`fresh Target121 package source is unavailable: ${root}`)
      return
    }
    const states = Object.fromEntries(
      fixture.sourceGraph.states.map(state => [state.name, state]),
    )
    const raw = parseSourceState(targetSourceRoot(), states.raw.file)
    const packaged = parseSourceState(root, states.postPrunePackage.file)
    assert.equal(
      buildTarget121DaemonStatusProcStartOutput(raw.source),
      packaged.source,
    )
    assert.equal(
      sourceSlice(raw, states.raw.runDaemon, 'raw runDaemon'),
      sourceSlice(
        packaged,
        states.postPrunePackage.runDaemon,
        'packaged runDaemon',
      ),
    )
    for (const name of [
      'workerManagerGraph',
      'authManagerBinding',
      'workerBootstrap',
      'reloadWorkerConfig',
      'watchAndReloadChain',
      'workerTeardown',
      'workerStops',
      'authDispose',
    ]) {
      assert.equal(
        sourceSlice(raw, states.raw[name], `raw:${name}`),
        sourceSlice(packaged, states.postPrunePackage[name], `package:${name}`),
      )
    }
  },
)

test(
  'build macros remain separate and exact source completeness rejects replay',
  { skip: !selected },
  () => {
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_121_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
    )
    const target = targetBundle
      .subarray(
        fixture.units.targetRunDaemon.start,
        fixture.units.targetRunDaemon.end,
      )
      .toString('utf8')
    const macro = fixture.residuePartitions.strict.buildMacroRows
    for (const value of macro.values) {
      assert.equal(occurrenceCount(target, `\"${value}\"`), macro.counts[value])
    }
    const selectedState = fixture.sourceGraph.states.find(state => {
      const filename = sourceFilename(targetSourceRoot(), fixture.sourceGraph.path)
      const actual = descriptor(fs.readFileSync(filename))
      return state.file.bytes === actual.bytes && state.file.sha256 === actual.sha256
    })
    assert.ok(selectedState)
    const source = fs.readFileSync(
      sourceFilename(targetSourceRoot(), fixture.sourceGraph.path),
      'utf8',
    )
    const run = source.slice(
      selectedState.runDaemon.start,
      selectedState.runDaemon.end,
    )
    assert.equal(occurrenceCount(run, 'MACRO.VERSION'), 2)
    for (const value of macro.values) assert.equal(source.includes(value), false)
    assert.equal(fixture.decision.ownerOverrideAuthorized, true)
    assert.equal(fixture.decision.sourceReplayAuthorized, false)
    assert.equal(fixture.generatorWiring.packageReplayExport, null)
    assert.equal(fixture.generatorWiring.packageCallOrder, null)
  },
)
