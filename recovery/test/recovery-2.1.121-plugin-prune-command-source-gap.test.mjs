import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import * as replayModule from '../cases/2.1.120-to-2.1.121/recovered/replay-plugin-prune-command-source-gap.mjs'

const {
  applyTarget121PluginPruneCommandSourceRecovery,
  buildTarget121PluginPruneHandlerOutput,
  buildTarget121PluginPruneMainOutput,
  TARGET121_PLUGIN_PRUNE_COMMAND_EVIDENCE_IDS,
  TARGET121_PLUGIN_PRUNE_COMMAND_OWNER_EVIDENCE,
  TARGET121_PLUGIN_PRUNE_COMMAND_SOURCE_STATES,
} = replayModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-plugin-prune-command-source-gap.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'd06e6283ca4d9b1161ebe6488c4d912e6902262366c8c2390b4b19704eb56b4d'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function expectedDescriptor(expected) {
  return { bytes: expected.bytes, sha256: expected.sha256 }
}

function canonicalDescriptor(value) {
  return descriptor(Buffer.from(JSON.stringify(value)))
}

function matchesDescriptor(actual, expected) {
  return (
    actual.bytes === expected.bytes && actual.sha256 === expected.sha256
  )
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

function selectArtifactSnapshot(reportDescriptor, coverageDescriptor) {
  const matches = [
    ['postDangerous', fixture.inputs.frozenPostDangerousSnapshot],
    ['postPrune', fixture.inputs.frozenPostPruneSnapshot],
    ['postDaemonOwner', fixture.inputs.frozenPostDaemonOwnerSnapshot],
  ].filter(
    ([, snapshot]) =>
      matchesDescriptor(reportDescriptor, snapshot.typedReport) &&
      matchesDescriptor(coverageDescriptor, snapshot.sourceCoverage),
  )
  assert.equal(
    matches.length,
    1,
    'plugin-prune proof requires one exact known report/coverage phase; unknown and hybrid pairs are forbidden',
  )
  return matches[0]
}

function reportIdentity(row) {
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

function findAll(haystack, needle) {
  const positions = []
  let cursor = -1
  while ((cursor = haystack.indexOf(needle, cursor + 1)) >= 0) {
    positions.push(cursor)
  }
  return positions
}

function stripLocations(value) {
  if (Array.isArray(value)) return value.map(stripLocations)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !['start', 'end'].includes(key))
        .map(([key, child]) => [key, stripLocations(child)]),
    )
  }
  return value
}

function astWithoutLocationsDescriptor(text) {
  const ast = parse(text, { ecmaVersion: 'latest', sourceType: 'script' })
  assert.equal(ast.body.length, 1)
  return canonicalDescriptor(stripLocations(ast.body[0]))
}

function identifierNormalizedTokens(text) {
  return [...tokenizer(text, { ecmaVersion: 'latest' })].map(token => [
    token.type.label,
    token.type.label === 'name' ? '@id' : (token.value ?? null),
  ])
}

function parseUnit(bundle, unit, label) {
  const value = bundle.subarray(unit.start, unit.end)
  assert.deepEqual(descriptor(value), expectedDescriptor(unit), label)
  const text = value.toString('utf8')
  const ast = parse(text, { ecmaVersion: 'latest', sourceType: 'script' })
  assert.equal(ast.body.length, 1, `${label}: complete unit`)
  assert.equal(ast.body[0].type, unit.nodeType, label)
  assert.equal(ast.body[0].id?.name, unit.name, label)
  assert.equal(
    [...tokenizer(text, { ecmaVersion: 'latest' })].length,
    unit.tokenCount,
    `${label}: token count`,
  )
  return { ast, node: ast.body[0], text }
}

function structuralTargetDescriptor(region) {
  return {
    targetIndex: region.target.index,
    nodeType: region.target.nodeType,
    parseStatus: region.target.parseStatus,
    start: region.target.start,
    end: region.target.end,
    tokenCount: region.target.tokenCount,
    sha256: region.target.sourceHash,
    coarseHash: region.target.coarseHash,
    line: region.target.location.line,
    column: region.target.location.column,
  }
}

function structuralBaselineDescriptor(unit) {
  return {
    baselineUnitIndex: unit.index,
    nodeType: unit.nodeType,
    parseStatus: unit.parseStatus,
    start: unit.start,
    end: unit.end,
    tokenCount: unit.tokenCount,
    sha256: unit.sourceHash,
    coarseHash: unit.coarseHash,
    line: unit.location.line,
    column: unit.location.column,
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

function sourceNodeDescriptor(source, sourceFile, node) {
  const start = node.getStart(sourceFile)
  const end = node.end
  return { start, end, ...descriptor(source.slice(start, end)) }
}

function callChainContainsPrune(ts, sourceFile, node) {
  let current = node
  while (
    ts.isCallExpression(current) &&
    ts.isPropertyAccessExpression(current.expression)
  ) {
    if (
      current.expression.name.text === 'command' &&
      current.arguments[0]?.getText(sourceFile) === "'prune'"
    ) {
      return true
    }
    current = current.expression.expression
  }
  return false
}

function sourceGraph(mainSource, handlerSource) {
  const ts = typescript()
  const mainFile = ts.createSourceFile(
    'main.tsx',
    mainSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const handlerFile = ts.createSourceFile(
    'plugins.ts',
    handlerSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.deepEqual(mainFile.parseDiagnostics, [], 'main.tsx parses')
  assert.deepEqual(handlerFile.parseDiagnostics, [], 'plugins.ts parses')
  const pruneActions = []
  function visitMain(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'action' &&
      callChainContainsPrune(ts, mainFile, node)
    ) {
      pruneActions.push(node)
    }
    ts.forEachChild(node, visitMain)
  }
  visitMain(mainFile)
  assert.equal(pruneActions.length, 1, 'one plugin prune registration')
  const pruneAction = pruneActions[0]
  const handlerDeclarations = []
  const handlerImports = []
  function visitHandler(node) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === 'pluginPruneHandler'
    ) {
      handlerDeclarations.push(node)
    }
    if (ts.isImportDeclaration(node)) handlerImports.push(node.getText(handlerFile))
    ts.forEachChild(node, visitHandler)
  }
  visitHandler(handlerFile)
  assert.equal(handlerDeclarations.length, 1, 'one source handler declaration')
  const handler = handlerDeclarations[0]
  const actionText = pruneAction.getText(mainFile)
  const handlerText = handler.getText(handlerFile)
  return {
    mainFile,
    handlerFile,
    pruneAction,
    handler,
    actionText,
    handlerText,
    handlerImports,
    mainDescriptor: sourceNodeDescriptor(mainSource, mainFile, pruneAction),
    handlerDescriptor: sourceNodeDescriptor(
      handlerSource,
      handlerFile,
      handler,
    ),
    dynamicPluginImports: (
      actionText.match(/import\('\.\/cli\/handlers\/plugins\.js'\)/g) ?? []
    ).length,
    dynamicUtilImports: (
      actionText.match(/import\('\.\/cli\/handlers\/util\.js'\)/g) ?? []
    ).length,
    handlerCallsWithRoot: (
      actionText.match(
        /pluginPruneHandler\(await createSubcommandRoot\(\), options\)/g,
      ) ?? []
    ).length,
    handlerCallsWithoutRoot: (
      actionText.match(/pluginPruneHandler\(options\)/g) ?? []
    ).length,
    handlerParameterCount: handler.parameters.length,
    handlerHasRender: handlerText.includes('root.render('),
    handlerHasWait: handlerText.includes('await root.waitUntilExit()'),
    handlerHasExit: handlerText.includes('process.exit(0)'),
    handlerCapturesMessage: handlerText.includes(
      'const message = await prunePlugins(',
    ),
  }
}

function configuredSourceRoot() {
  const configured = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  if (configured) return path.resolve(configured)
  return path.resolve(repositoryRoot, fixture.inputs.sourceRoots.raw)
}

function readSourcePair(sourceRoot) {
  return {
    main: fs.readFileSync(path.join(sourceRoot, 'main.tsx')),
    handler: fs.readFileSync(
      path.join(sourceRoot, 'cli/handlers/plugins.ts'),
    ),
  }
}

function identifySourcePhase(sourcePair) {
  const actual = {
    main: descriptor(sourcePair.main),
    handler: descriptor(sourcePair.handler),
  }
  const matches = []
  for (const state of fixture.inputs.sourceStates) {
    for (const phase of ['input', 'output']) {
      if (
        matchesDescriptor(actual.main, state.main[phase]) &&
        matchesDescriptor(actual.handler, state.handler[phase])
      ) {
        matches.push({ state, phase })
      }
    }
  }
  assert.equal(matches.length, 1, 'one exact atomic source state')
  return matches[0]
}

function copySourcePair(sourceRoot, destinationRoot) {
  const handlerDirectory = path.join(destinationRoot, 'cli/handlers')
  fs.mkdirSync(handlerDirectory, { recursive: true })
  fs.copyFileSync(
    path.join(sourceRoot, 'main.tsx'),
    path.join(destinationRoot, 'main.tsx'),
  )
  fs.copyFileSync(
    path.join(sourceRoot, 'cli/handlers/plugins.ts'),
    path.join(handlerDirectory, 'plugins.ts'),
  )
}

test(
  'fixture freezes a row-scoped two-residue boundary and exact cumulative tail',
  { skip: !selected },
  () => {
    assert.deepEqual(descriptor(fixtureBytes), {
      bytes: 15319,
      sha256: FIXTURE_SHA256,
    })
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.summary.wholeUnitOverride, false)
    assert.equal(fixture.summary.buildMacrosAdmitted, 0)
    assert.deepEqual(
      descriptor(
        fs.readFileSync(
          path.join(repositoryRoot, fixture.caseFiles.helper.path),
        ),
      ),
      expectedDescriptor(fixture.caseFiles.helper),
    )
    for (const prior of fixture.inputs.priorCumulativeEvidence) {
      readExact(path.join(repositoryRoot, prior.path), prior, prior.name)
    }
    assert.deepEqual(
      [...TARGET121_PLUGIN_PRUNE_COMMAND_EVIDENCE_IDS],
      fixture.evidenceIds,
    )
    assert.ok(Object.isFrozen(TARGET121_PLUGIN_PRUNE_COMMAND_OWNER_EVIDENCE))
    assert.ok(
      Object.isFrozen(TARGET121_PLUGIN_PRUNE_COMMAND_OWNER_EVIDENCE.residues),
    )
    assert.equal(
      Object.keys(replayModule).some(name => /OVERRIDES?/.test(name)),
      false,
      'the case exports no whole-unit override',
    )
    assert.deepEqual(
      TARGET121_PLUGIN_PRUNE_COMMAND_OWNER_EVIDENCE.paths,
      fixture.sourceGraph.replayFiles,
    )
    assert.deepEqual(
      TARGET121_PLUGIN_PRUNE_COMMAND_OWNER_EVIDENCE.residues.map(row => [
        TARGET121_PLUGIN_PRUNE_COMMAND_OWNER_EVIDENCE.targetIndex,
        row.literalKind,
        row.value,
        row.start,
        row.end,
        row.targetOccurrenceNumber,
      ]),
      fixture.rowBoundary.admitted.map(row => [
        row[0],
        row[1],
        row[2],
        row[3],
        row[4],
        row[6],
      ]),
    )
    assert.deepEqual(
      TARGET121_PLUGIN_PRUNE_COMMAND_SOURCE_STATES.map(state => ({
        name: state.name,
        main: {
          path: state.main.path,
          input: { ...state.main.input },
          output: { ...state.main.output },
        },
        handler: {
          path: state.handler.path,
          input: { ...state.handler.input },
          output: { ...state.handler.output },
        },
      })),
      fixture.inputs.sourceStates,
    )
    assert.deepEqual(
      canonicalDescriptor(fixture.rowBoundary.frozenU22106Tail),
      fixture.rowBoundary.descriptors.frozenTail,
    )
    assert.deepEqual(
      canonicalDescriptor(fixture.rowBoundary.admitted),
      fixture.rowBoundary.descriptors.admitted,
    )
    assert.deepEqual(
      canonicalDescriptor(fixture.rowBoundary.remainingBuildMacros),
      fixture.rowBoundary.descriptors.remainingBuildMacros,
    )
    assert.deepEqual(
      [
        ...fixture.rowBoundary.remainingBuildMacros,
        ...fixture.rowBoundary.admitted,
      ],
      fixture.rowBoundary.frozenU22106Tail,
    )
    assert.ok(
      fixture.rowBoundary.admitted.every(
        row => row[0] === 22106 && row[1] === 'property',
      ),
    )
    assert.ok(
      fixture.rowBoundary.remainingBuildMacros.every(
        row => row[0] === 22106 && row[1] === 'string',
      ),
    )
    const before =
      fixture.cumulativeImpact.frozenAfterFirstAllowedSecondAllowed300AndDangerous
    const after = fixture.cumulativeImpact.afterThisReplay
    assert.equal(before.productionRows, fixture.rowBoundary.admitted.length)
    assert.equal(
      before.buildMacroRows,
      fixture.rowBoundary.remainingBuildMacros.length,
    )
    assert.equal(before.totalRows, before.productionRows + before.buildMacroRows)
    assert.equal(after.productionRows, 0)
    assert.equal(after.buildMacroRows, before.buildMacroRows)
    assert.equal(after.totalRows, before.totalRows - fixture.summary.residues)
    assert.deepEqual(
      [after.ownerRowDelta, after.addedRowDelta, after.strictRowDelta],
      [-2, -2, -2],
    )
    const current = fixture.inputs.frozenPostDaemonOwnerSnapshot
    const reportBytes = readExact(
      artifactPath('CLAUDE_CODE_TARGET121_TYPED_REPORT', current.typedReport),
      current.typedReport,
      'exact post-prune Target121 typed report',
    )
    const coverageGzip = readExact(
      artifactPath(
        'CLAUDE_CODE_TARGET121_SOURCE_COVERAGE',
        current.sourceCoverage,
      ),
      current.sourceCoverage,
      'exact post-prune Target121 coverage',
    )
    assert.equal(
      selectArtifactSnapshot(
        descriptor(reportBytes),
        descriptor(coverageGzip),
      )[0],
      'postDaemonOwner',
    )
    assert.throws(
      () =>
        selectArtifactSnapshot(
          expectedDescriptor(fixture.inputs.frozenPostDangerousSnapshot.typedReport),
          descriptor(coverageGzip),
        ),
      /unknown and hybrid pairs are forbidden/,
    )
    assert.throws(
      () =>
        selectArtifactSnapshot(
          { ...descriptor(reportBytes), sha256: '0'.repeat(64) },
          descriptor(coverageGzip),
        ),
      /unknown and hybrid pairs are forbidden/,
    )
    const report = JSON.parse(reportBytes)
    const ownerRows = report.sourceRuntimeOwnerResidueRows.filter(
      row => row.structural.index === 22106,
    )
    const addedRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
      row => row.structural.index === 22106,
    )
    const strictRows = report.rows.filter(
      row => row.structural.index === 22106,
    )
    assert.deepEqual(
      { owner: ownerRows.length, added: addedRows.length, strict: strictRows.length },
      current.u22106Counts,
    )
    assert.deepEqual(
      strictRows.map(reportIdentity),
      current.strictRows,
    )
    for (const admitted of fixture.rowBoundary.admitted) {
      for (const rows of [ownerRows, addedRows, strictRows]) {
        assert.ok(
          rows.some(
            row =>
              JSON.stringify(reportIdentity(row)) ===
              JSON.stringify(admitted),
          ),
        )
      }
    }
    assert.deepEqual(
      {
        owner: ownerRows.length - fixture.rowBoundary.admitted.length,
        added: addedRows.length - fixture.rowBoundary.admitted.length,
        strict: strictRows.length - fixture.rowBoundary.admitted.length,
      },
      current.localProjection,
    )
    assert.deepEqual(
      {
        owner: current.localProjection.owner - 7,
        added: current.localProjection.added - 7,
        strict: current.localProjection.strict,
      },
      current.cumulativeProjectionAfterSevenStaticAdmissions,
    )
    assert.deepEqual(descriptor(gunzipSync(coverageGzip)), {
      bytes: current.sourceCoverage.rawBytes,
      sha256: current.sourceCoverage.rawSha256,
    })
  },
)

test(
  'authenticated Target120 and Target121 fragments prove one cohesive prune graph and retained ordinal spill',
  { skip: !selected },
  () => {
    const baseline = readExact(
      artifactPath(
        'CLAUDE_CODE_2_1_120_INNER_BUNDLE',
        fixture.inputs.baselineBundle,
      ),
      fixture.inputs.baselineBundle,
      'authenticated Target120 bundle',
    )
    const target = readExact(
      artifactPath(
        'CLAUDE_CODE_2_1_121_INNER_BUNDLE',
        fixture.inputs.targetBundle,
      ),
      fixture.inputs.targetBundle,
      'authenticated Target121 bundle',
    )
    const ledgerBytes = readExact(
      path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
      fixture.inputs.structuralLedger,
      'structural ledger',
    )
    const ledger = JSON.parse(gunzipSync(ledgerBytes))
    for (const unit of Object.values(fixture.targetUnits)) {
      const region = ledger.regions.find(
        row => row.target?.index === unit.targetIndex,
      )
      assert.ok(region)
      assert.equal(region.classification, unit.classification)
      assert.equal(
        region.unknownFreeIdentifierCount,
        unit.unknownFreeIdentifierCount,
      )
      assert.deepEqual(structuralTargetDescriptor(region), {
        targetIndex: unit.targetIndex,
        nodeType: unit.nodeType,
        parseStatus: unit.parseStatus,
        start: unit.start,
        end: unit.end,
        tokenCount: unit.tokenCount,
        sha256: unit.sha256,
        coarseHash: unit.coarseHash,
        line: unit.line,
        column: unit.column,
      })
    }
    const baselineRunUnit = ledger.unmatchedBaseline.find(
      unit =>
        unit.index === fixture.baselineUnits.run.baselineUnitIndex,
    )
    assert.ok(baselineRunUnit)
    assert.deepEqual(
      structuralBaselineDescriptor(baselineRunUnit),
      Object.fromEntries(
        Object.entries(fixture.baselineUnits.run).filter(
          ([key]) => !['name', 'bytes'].includes(key),
        ),
      ),
    )
    const parsedBaselineRun = parseUnit(
      baseline,
      fixture.baselineUnits.run,
      'Target120 run',
    )
    const parsedTargetRun = parseUnit(
      target,
      fixture.targetUnits.run,
      'Target121 run',
    )
    const parsedHandler = parseUnit(
      target,
      fixture.targetUnits.pluginPruneHandler,
      'Target121 pluginPruneHandler',
    )
    assert.equal(parsedBaselineRun.text.includes('pluginPruneHandler'), false)
    assert.equal(parsedTargetRun.text.includes('pluginPruneHandler'), true)
    assert.deepEqual(
      findAll(baseline, 'pluginPruneHandler'),
      fixture.compiledGraph.pluginPruneHandlerOccurrences.baseline,
    )
    assert.deepEqual(
      findAll(target, 'pluginPruneHandler'),
      fixture.compiledGraph.pluginPruneHandlerOccurrences.target,
    )
    assert.deepEqual(
      findAll(baseline, 'createSubcommandRoot'),
      fixture.compiledGraph.createSubcommandRootOccurrences.baseline,
    )
    assert.deepEqual(
      findAll(target, 'createSubcommandRoot'),
      fixture.compiledGraph.createSubcommandRootOccurrences.target,
    )
    assert.equal(
      fixture.compiledGraph.createSubcommandRootOccurrences.target[
        fixture.compiledGraph.createSubcommandRootOccurrences
          .insertedPruneOrdinal - 1
      ],
      13837100,
    )
    assert.equal(
      fixture.compiledGraph.createSubcommandRootOccurrences.target[
        fixture.compiledGraph.createSubcommandRootOccurrences
          .retainedStrictOrdinal - 1
      ],
      fixture.rowBoundary.admitted[1][3],
    )

    const prune = fixture.compiledGraph.targetPruneCommand
    const pruneText = target.subarray(prune.start, prune.end).toString('utf8')
    assert.deepEqual(descriptor(pruneText), expectedDescriptor(prune))
    assert.equal(
      [...tokenizer(pruneText, { ecmaVersion: 'latest' })].length,
      prune.tokenCount,
    )
    assert.deepEqual(
      astWithoutLocationsDescriptor(pruneText),
      prune.astWithoutLocations,
    )
    assert.deepEqual(
      descriptor(target.subarray(prune.action.start, prune.action.end)),
      expectedDescriptor(prune.action),
    )
    assert.deepEqual(
      descriptor(target.subarray(prune.imports.start, prune.imports.end)),
      expectedDescriptor(prune.imports),
    )
    assert.match(pruneText, /pluginPruneHandler/)
    assert.match(pruneText, /createSubcommandRoot/)
    assert.match(pruneText, /await M\(await D\(\),O\)/)

    const handler = fixture.compiledGraph.targetHandler
    assert.deepEqual(descriptor(parsedHandler.text), expectedDescriptor(handler))
    assert.deepEqual(
      astWithoutLocationsDescriptor(parsedHandler.text),
      handler.astWithoutLocations,
    )
    assert.equal(parsedHandler.node.params.length, handler.parameterCount)
    assert.match(parsedHandler.text, /tengu_plugin_prune_command/)
    assert.match(parsedHandler.text, /H\.render/)
    assert.match(parsedHandler.text, /await H\.waitUntilExit\(\)/)
    assert.match(parsedHandler.text, /process\.exit\(0\)/)

    const retained = fixture.compiledGraph.retainedAutoModeCritique
    const baselineCritique = baseline
      .subarray(retained.baseline.start, retained.baseline.end)
      .toString('utf8')
    const targetCritique = target
      .subarray(retained.target.start, retained.target.end)
      .toString('utf8')
    assert.deepEqual(
      descriptor(baselineCritique),
      expectedDescriptor(retained.baseline),
    )
    assert.deepEqual(
      descriptor(targetCritique),
      expectedDescriptor(retained.target),
    )
    const baselineNormalized = identifierNormalizedTokens(baselineCritique)
    const targetNormalized = identifierNormalizedTokens(targetCritique)
    assert.deepEqual(targetNormalized, baselineNormalized)
    assert.equal(
      baselineNormalized.length,
      retained.identifierNormalizedTokens.count,
    )
    assert.deepEqual(
      canonicalDescriptor(baselineNormalized),
      expectedDescriptor(retained.identifierNormalizedTokens),
    )

    for (const row of fixture.rowBoundary.frozenU22106Tail) {
      const literal = target.subarray(row[3], row[4]).toString('utf8')
      if (row[1] === 'string') assert.equal(JSON.parse(literal), row[2])
      else assert.equal(literal, row[2])
    }
  },
)

test(
  'raw or packaged source authenticates the exact stale or recovered two-file graph',
  { skip: !selected },
  () => {
    const sourceRoot = configuredSourceRoot()
    const sourcePair = readSourcePair(sourceRoot)
    const { state, phase } = identifySourcePhase(sourcePair)
    const graph = sourceGraph(
      sourcePair.main.toString('utf8'),
      sourcePair.handler.toString('utf8'),
    )
    assert.deepEqual(
      graph.mainDescriptor,
      fixture.sourceGraph.mainCommand[state.name][phase],
    )
    assert.deepEqual(
      graph.handlerDescriptor,
      fixture.sourceGraph.handler[phase],
    )
    assert.equal(graph.dynamicPluginImports, 1)
    assert.equal(
      graph.handlerImports.some(value =>
        value.includes("import React from 'react'"),
      ),
      true,
    )
    assert.equal(
      graph.handlerImports.some(value =>
        value.includes("{ Text, type Root } from '../../ink.js'"),
      ),
      true,
    )
    assert.equal(
      graph.handlerImports.some(value =>
        value.includes(
          "{ RenderOnceAndExit } from '../../utils/staticRender.js'",
        ),
      ),
      true,
    )
    if (phase === 'input') {
      assert.deepEqual(
        descriptor(
          buildTarget121PluginPruneMainOutput(
            sourcePair.main.toString('utf8'),
          ),
        ),
        state.main.output,
      )
      assert.deepEqual(
        descriptor(
          buildTarget121PluginPruneHandlerOutput(
            sourcePair.handler.toString('utf8'),
          ),
        ),
        state.handler.output,
      )
      assert.equal(graph.dynamicUtilImports, 0)
      assert.equal(graph.handlerCallsWithoutRoot, 1)
      assert.equal(graph.handlerCallsWithRoot, 0)
      assert.equal(graph.handlerParameterCount, 1)
      assert.equal(graph.handlerHasRender, false)
      assert.equal(graph.handlerHasWait, false)
      assert.equal(graph.handlerHasExit, false)
      assert.equal(graph.handlerCapturesMessage, false)
    } else {
      assert.equal(graph.dynamicUtilImports, 1)
      assert.equal(graph.handlerCallsWithoutRoot, 0)
      assert.equal(graph.handlerCallsWithRoot, 1)
      assert.equal(graph.handlerParameterCount, 2)
      assert.equal(graph.handlerHasRender, true)
      assert.equal(graph.handlerHasWait, true)
      assert.equal(graph.handlerHasExit, true)
      assert.equal(graph.handlerCapturesMessage, true)
    }
  },
)

test(
  'bounded replay is atomic, graph-closed, idempotent, and rejects a hybrid state',
  { skip: !selected },
  t => {
    const sourceRoot = configuredSourceRoot()
    const sourcePair = readSourcePair(sourceRoot)
    const { state, phase } = identifySourcePhase(sourcePair)
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target121-plugin-prune-'),
    )
    t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }))
    copySourcePair(sourceRoot, tempRoot)
    const first = applyTarget121PluginPruneCommandSourceRecovery({
      sourceRoot: tempRoot,
    })
    assert.deepEqual(first, {
      status: phase === 'input' ? 'recovered' : 'already-recovered',
      state: state.name,
      files:
        phase === 'input'
          ? fixture.sourceGraph.replayFiles
          : [],
    })
    const recoveredPair = readSourcePair(tempRoot)
    assert.deepEqual(descriptor(recoveredPair.main), state.main.output)
    assert.deepEqual(descriptor(recoveredPair.handler), state.handler.output)
    const recoveredGraph = sourceGraph(
      recoveredPair.main.toString('utf8'),
      recoveredPair.handler.toString('utf8'),
    )
    assert.deepEqual(
      recoveredGraph.mainDescriptor,
      fixture.sourceGraph.mainCommand[state.name].output,
    )
    assert.deepEqual(
      recoveredGraph.handlerDescriptor,
      fixture.sourceGraph.handler.output,
    )
    assert.equal(recoveredGraph.dynamicPluginImports, 1)
    assert.equal(recoveredGraph.dynamicUtilImports, 1)
    assert.equal(recoveredGraph.handlerCallsWithRoot, 1)
    assert.equal(recoveredGraph.handlerCallsWithoutRoot, 0)
    assert.equal(recoveredGraph.handlerParameterCount, 2)
    assert.equal(recoveredGraph.handlerHasRender, true)
    assert.equal(recoveredGraph.handlerHasWait, true)
    assert.equal(recoveredGraph.handlerHasExit, true)
    assert.equal(recoveredGraph.handlerCapturesMessage, true)
    assert.deepEqual(
      applyTarget121PluginPruneCommandSourceRecovery({ sourceRoot: tempRoot }),
      { status: 'already-recovered', state: state.name, files: [] },
    )

    if (phase === 'input') {
      const hybridRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), 'target121-plugin-prune-hybrid-'),
      )
      t.after(() => fs.rmSync(hybridRoot, { recursive: true, force: true }))
      copySourcePair(sourceRoot, hybridRoot)
      fs.writeFileSync(
        path.join(hybridRoot, 'main.tsx'),
        buildTarget121PluginPruneMainOutput(
          sourcePair.main.toString('utf8'),
        ),
      )
      assert.throws(
        () =>
          applyTarget121PluginPruneCommandSourceRecovery({
            sourceRoot: hybridRoot,
          }),
        /requires one exact atomic raw or packaged source state/,
      )
    }
  },
)
