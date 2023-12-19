import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import * as helper from '../cases/2.1.120-to-2.1.121/recovered/daemon-spare-export-binding-owner-overrides.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.121-daemon-spare-export-binding-owner-proof.json',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.120-to-2.1.121/recovered/daemon-spare-export-binding-owner-overrides.mjs',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.121/src'),
)

const FIXTURE_SHA256 =
  '24c6e221d4ab7879c7143a8295d4bdc5fc73cb0a9554916658cf03f9775cd992'
const HELPER_SHA256 =
  '367cfacf58112663763901eb65e7a7ac6f065724763d20e0740a6264541a2148'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function expectedDescriptor(expected) {
  return { bytes: expected.bytes, sha256: expected.sha256 }
}

function matchesDescriptor(actual, expected) {
  return actual.bytes === expected.bytes && actual.sha256 === expected.sha256
}

function canonicalDescriptor(value) {
  return descriptor(Buffer.from(JSON.stringify(value)))
}

function readExact(input) {
  const bytes = fs.readFileSync(path.join(root, input.path))
  assert.deepEqual(descriptor(bytes), expectedDescriptor(input), input.path)
  return bytes
}

function selectArtifactSnapshot(reportDescriptor, coverageDescriptor) {
  const matches = [
    ['postDangerous', fixture.inputs.frozenSnapshot],
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
    'daemon-spare export proof requires one exact known report/coverage phase; unknown and hybrid pairs are forbidden',
  )
  return matches[0]
}

function tokenRows(text) {
  return [...tokenizer(text, { ecmaVersion: 'latest' })].map(token => [
    token.type.label,
    token.type.label === 'name'
      ? '@id'
      : typeof token.value === 'bigint'
        ? `${token.value}n`
        : (token.value ?? null),
  ])
}

function sourceFilename(source) {
  return path.join(sourceRoot, source.path.replace(/^src\//, ''))
}

function sourceNodeDescriptor(bytes, sourceFile, node, name, ts) {
  const start = node.getStart(sourceFile)
  const end = node.end
  return {
    name,
    kind: ts.SyntaxKind[node.kind],
    start,
    end,
    ...descriptor(bytes.subarray(start, end)),
  }
}

function targetRegionAt(structural, offset) {
  return structural.regions.find(
    region =>
      region.target !== undefined &&
      region.target.start <= offset &&
      offset < region.target.end,
  )
}

test(
  'Target121 daemon-spare export-binding fixture and case-only override remain frozen',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(Object.keys(helper), [
      'TARGET121_DAEMON_SPARE_EXPORT_BINDING_DEPENDENCY_TARGET_INDICES',
      'TARGET121_DAEMON_SPARE_EXPORT_BINDING_EVIDENCE_IDS',
      'TARGET121_DAEMON_SPARE_EXPORT_BINDING_OWNER_OVERRIDES',
    ])

    const override =
      helper.TARGET121_DAEMON_SPARE_EXPORT_BINDING_OWNER_OVERRIDES[0]
    assert.equal(
      helper.TARGET121_DAEMON_SPARE_EXPORT_BINDING_OWNER_OVERRIDES.length,
      1,
    )
    assert.equal(override.key, `${caseName}:22116`)
    assert.equal(override.targetIndex, fixture.exportBinding.targetIndex)
    assert.deepEqual(override.paths, [fixture.ownerCorrection.ownerPath])
    assert.deepEqual(
      override.generatedExports,
      fixture.ownerCorrection.generatedExports,
    )
    assert.deepEqual(
      override.authoredDeclarations,
      fixture.ownerCorrection.authoredDeclarations,
    )
    assert.deepEqual(
      override.sourceGapExports,
      fixture.ownerCorrection.sourceGapExports,
    )
    assert.deepEqual(override.supportPaths, fixture.ownerCorrection.supportPaths)
    assert.deepEqual(
      override.dependencyTargetIndices,
      fixture.exportBinding.directDependencyTargetIndices,
    )
    assert.deepEqual(
      helper.TARGET121_DAEMON_SPARE_EXPORT_BINDING_DEPENDENCY_TARGET_INDICES,
      fixture.exportBinding.directDependencyTargetIndices,
    )
    assert.deepEqual(
      helper.TARGET121_DAEMON_SPARE_EXPORT_BINDING_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(override.evidenceIds, fixture.evidenceIds)
    assert.equal('replay' in override, false)
    assert.equal('builder' in override, false)
    assert.equal('wholeUnit' in override, false)
  },
)

test(
  'Target121 post-prune report, coverage, and deterministic generator row remain exact',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const current = fixture.inputs.frozenPostDaemonOwnerSnapshot
    const reportBytes = readExact(current.typedReport)
    const coverageGzip = readExact(current.sourceCoverage)
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
          expectedDescriptor(fixture.inputs.frozenSnapshot.typedReport),
          descriptor(coverageGzip),
        ),
      /unknown and hybrid pairs are forbidden/,
    )
    assert.throws(
      () =>
        selectArtifactSnapshot(
          { ...descriptor(reportBytes), bytes: reportBytes.length + 1 },
          descriptor(coverageGzip),
        ),
      /unknown and hybrid pairs are forbidden/,
    )
    const coverageBytes = gunzipSync(coverageGzip)
    assert.deepEqual(descriptor(coverageBytes), {
      bytes: current.sourceCoverage.rawBytes,
      sha256: current.sourceCoverage.rawSha256,
    })

    const report = JSON.parse(reportBytes)
    assert.deepEqual(
      {
        ownerRows: report.sourceRuntimeOwnerResidueRows.length,
        addedOwnerRows: report.sourceRuntimeAddedOwnerResidueRows.length,
        strictRows: report.rows.length,
      },
      current.globalCounts,
    )
    const ownerRows = report.sourceRuntimeOwnerResidueRows.filter(
      row => row.structural.index === fixture.exportBinding.targetIndex,
    )
    const addedOwnerRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
      row => row.structural.index === fixture.exportBinding.targetIndex,
    )
    const strictRows = report.rows.filter(
      row => row.structural.index === fixture.exportBinding.targetIndex,
    )
    assert.deepEqual(
      {
        ownerRows: ownerRows.length,
        addedOwnerRows: addedOwnerRows.length,
        strictRows: strictRows.length,
      },
      current.unitCounts,
    )
    assert.deepEqual(
      canonicalDescriptor(ownerRows),
      current.ownerRowsDescriptor,
    )
    assert.deepEqual(
      canonicalDescriptor(addedOwnerRows),
      current.addedOwnerRowsDescriptor,
    )
    assert.deepEqual(
      canonicalDescriptor(strictRows),
      current.strictRowsDescriptor,
    )
    const strictIdentities = strictRows.map(row => [
      row.structural.index,
      row.literalKind,
      row.value,
      row.target.start,
      row.target.end,
      row.targetOccurrenceNumber,
    ])
    assert.deepEqual(strictIdentities, fixture.reportSnapshot.unit.strictIdentities)
    assert.deepEqual(
      canonicalDescriptor(strictIdentities),
      fixture.reportSnapshot.unit.strictIdentitiesDescriptor,
    )
    assert.ok(
      strictRows.every(
        row =>
          row.disposition === 'source-runtime-covered' &&
          row.baselineOccurrenceCount === 0 &&
          row.targetAdded === true &&
          JSON.stringify(row.ownerPaths) ===
            JSON.stringify(['daemon/spare.ts']) &&
          row.sourceMatches.length === 0,
      ),
    )

    const coverage = JSON.parse(coverageBytes)
    const coverageRows = coverage.rows.filter(
      row => row.targetIndex === fixture.exportBinding.targetIndex,
    )
    assert.equal(coverageRows.length, 1)
    assert.deepEqual(
      canonicalDescriptor(coverageRows),
      current.coverageRowsDescriptor,
    )
    assert.equal(current.coverageRowProjection, 'frozenPostPruneSnapshot')
    assert.deepEqual(
      coverageRows[0],
      fixture.inputs.frozenPostPruneSnapshot.coverageRow,
    )

    const generatorBytes = readExact(fixture.inputs.generatorInput)
    const generator = JSON.parse(generatorBytes)
    const generatorRows = generator.rows.filter(
      row => row.targetIndex === fixture.exportBinding.targetIndex,
    )
    assert.equal(generatorRows.length, 1)
    assert.equal(
      generator.rows.indexOf(generatorRows[0]),
      fixture.generatorRow.rowIndex,
    )
    assert.deepEqual(
      canonicalDescriptor(generatorRows[0]),
      fixture.generatorRow.descriptor,
    )
    assert.deepEqual(generatorRows[0], fixture.generatorRow.row)
    assert.equal(generatorRows[0].structuralClass, 'unresolved')
    assert.equal(generatorRows[0].alphaByCoarse, false)
    assert.equal(generatorRows[0].metadataEquivalent, true)
  },
)

test(
  'Target121 u22116 is one export table bound to four exact adjacent implementations',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const targetBundle = readExact(fixture.inputs.targetBundle)
    const structural = JSON.parse(gunzipSync(readExact(fixture.inputs.structural)))
    const units = new Map()
    for (const expected of fixture.targetUnits) {
      const region = structural.regions.find(
        candidate => candidate.target?.index === expected.targetIndex,
      )
      assert.ok(region, `u${expected.targetIndex}`)
      assert.equal(region.classification, 'unresolved')
      assert.equal(region.baselineUnitIndex, undefined)
      assert.equal(
        region.unknownFreeIdentifierCount,
        expected.unknownFreeIdentifierCount,
      )
      assert.deepEqual(
        {
          start: region.target.start,
          end: region.target.end,
          nodeType: region.target.nodeType,
          tokenCount: region.target.tokenCount,
          sourceHash: region.target.sourceHash,
          coarseHash: region.target.coarseHash,
        },
        {
          start: expected.start,
          end: expected.end,
          nodeType: expected.nodeType,
          tokenCount: expected.tokenCount,
          sourceHash: expected.sourceHash,
          coarseHash: expected.coarseHash,
        },
      )
      const bytes = targetBundle.subarray(expected.start, expected.end)
      assert.deepEqual(descriptor(bytes), {
        bytes: expected.end - expected.start,
        sha256: expected.sourceHash,
      })
      assert.equal(tokenRows(bytes.toString()).length, expected.tokenCount)
      const program = parse(bytes.toString(), {
        ecmaVersion: 'latest',
        sourceType: 'script',
      })
      assert.equal(program.body.length, 1)
      assert.equal(program.body[0].type, expected.nodeType)
      units.set(expected.targetIndex, {
        expected,
        bytes,
        statement: program.body[0],
      })
    }

    const namespace = units.get(22115).statement
    assert.equal(namespace.declarations.length, 1)
    assert.equal(namespace.declarations[0].id.name, 'Kb4')
    assert.equal(namespace.declarations[0].init.type, 'ObjectExpression')
    assert.equal(namespace.declarations[0].init.properties.length, 0)

    const exportUnit = units.get(fixture.exportBinding.targetIndex)
    assert.equal(exportUnit.bytes.toString(), fixture.exportBinding.fragment)
    assert.deepEqual(descriptor(exportUnit.bytes), {
      bytes: fixture.exportBinding.fragmentBytes,
      sha256: fixture.exportBinding.fragmentSha256,
    })
    const exportCall = exportUnit.statement.expression
    assert.equal(exportCall.type, 'CallExpression')
    assert.equal(exportCall.arguments.length, 2)
    assert.equal(exportCall.arguments[0].name, fixture.exportBinding.namespaceBinding)
    assert.equal(exportCall.arguments[1].type, 'ObjectExpression')
    const properties = exportCall.arguments[1].properties.map(property => {
      assert.equal(property.type, 'Property')
      assert.equal(property.computed, false)
      assert.equal(property.value.type, 'ArrowFunctionExpression')
      assert.equal(property.value.params.length, 0)
      assert.equal(property.value.body.type, 'Identifier')
      const name = property.key.name ?? property.key.value
      const expected = fixture.exportBinding.properties.find(
        candidate => candidate.name === name,
      )
      assert.ok(expected, name)
      return {
        name,
        start: fixture.targetUnits.find(row => row.targetIndex === 22116).start +
          property.key.start,
        end: fixture.targetUnits.find(row => row.targetIndex === 22116).start +
          property.key.end,
        implementationBinding: property.value.body.name,
        dependencyTargetIndex: expected.dependencyTargetIndex,
      }
    })
    assert.deepEqual(properties, fixture.exportBinding.properties)

    for (const property of fixture.exportBinding.properties) {
      const dependency = units.get(property.dependencyTargetIndex)
      assert.equal(dependency.statement.type, 'FunctionDeclaration')
      assert.equal(dependency.statement.id.name, property.implementationBinding)
      assert.equal(dependency.expected.binding, property.implementationBinding)
    }
    assert.deepEqual(
      [...new Set(fixture.exportBinding.properties.map(row => row.dependencyTargetIndex))].sort(
        (a, b) => a - b,
      ),
      fixture.exportBinding.directDependencyTargetIndices,
    )

    const targetText = targetBundle.toString()
    for (const [symbol, expected] of Object.entries(
      fixture.compiledGraph.symbolOccurrences,
    )) {
      const actual = []
      let start = 0
      while ((start = targetText.indexOf(symbol, start)) !== -1) {
        const region = targetRegionAt(structural, start)
        actual.push([start, region?.target.index ?? null])
        start += symbol.length
      }
      assert.deepEqual(actual, expected, symbol)
    }
    const initializer = units.get(22128).bytes.toString()
    for (const required of [
      'require("crypto")',
      'require("fs")',
      'require("fs/promises")',
      'require("net")',
      'require("path")',
    ]) {
      assert.ok(initializer.includes(required), required)
    }
  },
)

test(
  'Target120 has nineteen unrelated normalized tables and no spare behavior',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const baselineBundle = readExact(fixture.inputs.baselineBundle)
    const targetBundle = readExact(fixture.inputs.targetBundle)
    const exportUnit = fixture.targetUnits.find(
      row => row.targetIndex === fixture.exportBinding.targetIndex,
    )
    const signature = tokenRows(
      targetBundle.subarray(exportUnit.start, exportUnit.end).toString(),
    )
    assert.equal(signature.length, fixture.baselineAmbiguity.normalizedTokenSignature.count)
    assert.deepEqual(
      canonicalDescriptor(signature),
      expectedDescriptor(fixture.baselineAmbiguity.normalizedTokenSignature),
    )
    const signatureJson = JSON.stringify(signature)
    const program = parse(baselineBundle.toString(), {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    const matches = []
    for (let index = 0; index < program.body.length; index++) {
      const statement = program.body[index]
      const bytes = baselineBundle.subarray(statement.start, statement.end)
      if (JSON.stringify(tokenRows(bytes.toString())) !== signatureJson) continue
      matches.push([
        index,
        statement.start,
        statement.end,
        bytes.length,
        sha256(bytes),
      ])
    }
    assert.equal(matches.length, fixture.baselineAmbiguity.matchCount)
    assert.deepEqual(matches, fixture.baselineAmbiguity.matches)
    assert.deepEqual(
      canonicalDescriptor(matches),
      fixture.baselineAmbiguity.matchesDescriptor,
    )

    const baselineText = baselineBundle.toString()
    for (const [marker, expected] of Object.entries(
      fixture.baselineAmbiguity.baselineMarkerCounts,
    )) {
      assert.equal(baselineText.split(marker).length - 1, expected, marker)
    }
    assert.equal(
      new Set(matches.map(row => row[4])).size,
      fixture.baselineAmbiguity.matchCount,
      'all normalized matches are distinct physical export tables',
    )
  },
)

test(
  'raw and package source graphs retain three spare exports and the inline claim behavior',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  async () => {
    const imported = await import(
      pathToFileURL(
        path.join(
          root,
          '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
        ),
      ).href
    )
    const ts = imported.default ?? imported

    const spareExpected = fixture.sourceGraph.spare
    const spareBytes = fs.readFileSync(sourceFilename(spareExpected))
    assert.deepEqual(descriptor(spareBytes), expectedDescriptor(spareExpected))
    const spareSource = ts.createSourceFile(
      spareExpected.path,
      spareBytes.toString(),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    assert.deepEqual(spareSource.parseDiagnostics, [])
    const spareFunctions = spareSource.statements.filter(statement =>
      ts.isFunctionDeclaration(statement),
    )
    const exportedFunctions = spareFunctions
      .filter(statement =>
        statement.modifiers?.some(
          modifier => modifier.kind === ts.SyntaxKind.ExportKeyword,
        ),
      )
      .map(statement => statement.name?.text)
    assert.deepEqual(exportedFunctions, spareExpected.exportedFunctions)
    const authoredNodes = spareExpected.authoredExportNodes.map(expected => {
      const node = spareFunctions.find(
        statement => statement.name?.text === expected.name,
      )
      assert.ok(node, expected.name)
      return sourceNodeDescriptor(
        spareBytes,
        spareSource,
        node,
        expected.name,
        ts,
      )
    })
    assert.deepEqual(authoredNodes, spareExpected.authoredExportNodes)
    assert.equal(
      spareFunctions.filter(statement => statement.name?.text === 'claimSpare')
        .length,
      spareExpected.claimSpareDeclarationCount,
    )

    const supervisorExpected = fixture.sourceGraph.supervisor
    const supervisorBytes = fs.readFileSync(sourceFilename(supervisorExpected))
    assert.deepEqual(
      descriptor(supervisorBytes),
      expectedDescriptor(supervisorExpected),
    )
    const supervisorSource = ts.createSourceFile(
      supervisorExpected.path,
      supervisorBytes.toString(),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    assert.deepEqual(supervisorSource.parseDiagnostics, [])
    let spareImport
    let runBackgroundSupervisor
    let claimBranch
    function visitSupervisor(node) {
      if (
        ts.isImportDeclaration(node) &&
        node.moduleSpecifier.text === './spare.js'
      ) {
        spareImport = node
      }
      if (
        ts.isFunctionDeclaration(node) &&
        node.name?.text === 'runBackgroundSupervisor'
      ) {
        runBackgroundSupervisor = node
      }
      if (
        ts.isIfStatement(node) &&
        node.getText(supervisorSource).includes('BackgroundHandle.claim') &&
        node.getText(supervisorSource).includes('sendSpareClaim')
      ) {
        assert.equal(claimBranch, undefined, 'one inline claim branch')
        claimBranch = node
      }
      ts.forEachChild(node, visitSupervisor)
    }
    visitSupervisor(supervisorSource)
    assert.ok(spareImport)
    assert.ok(runBackgroundSupervisor)
    assert.ok(claimBranch)
    assert.deepEqual(
      sourceNodeDescriptor(
        supervisorBytes,
        supervisorSource,
        spareImport,
        supervisorExpected.spareImport.name,
        ts,
      ),
      supervisorExpected.spareImport,
    )
    assert.deepEqual(
      sourceNodeDescriptor(
        supervisorBytes,
        supervisorSource,
        runBackgroundSupervisor,
        supervisorExpected.runBackgroundSupervisor.name,
        ts,
      ),
      supervisorExpected.runBackgroundSupervisor,
    )
    assert.deepEqual(
      sourceNodeDescriptor(
        supervisorBytes,
        supervisorSource,
        claimBranch,
        supervisorExpected.claimBranch.name,
        ts,
      ),
      Object.fromEntries(
        Object.entries(supervisorExpected.claimBranch).filter(
          ([key]) => !['requiredCalls', 'requiredEvent'].includes(key),
        ),
      ),
    )
    const claimText = claimBranch.getText(supervisorSource)
    for (const required of supervisorExpected.claimBranch.requiredCalls) {
      assert.ok(claimText.includes(required), required)
    }
    assert.ok(claimText.includes(supervisorExpected.claimBranch.requiredEvent))

    const entrypointExpected = fixture.sourceGraph.entrypoint
    const entrypointBytes = fs.readFileSync(sourceFilename(entrypointExpected))
    assert.deepEqual(
      descriptor(entrypointBytes),
      expectedDescriptor(entrypointExpected),
    )
    const entrypointSource = ts.createSourceFile(
      entrypointExpected.path,
      entrypointBytes.toString(),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    assert.deepEqual(entrypointSource.parseDiagnostics, [])
    let bgSpareBranch
    function visitEntrypoint(node) {
      if (
        ts.isIfStatement(node) &&
        node
          .getText(entrypointSource)
          .includes(`import('${entrypointExpected.dynamicImport}')`)
      ) {
        assert.equal(bgSpareBranch, undefined, 'one bg-spare entrypoint branch')
        bgSpareBranch = node
      }
      ts.forEachChild(node, visitEntrypoint)
    }
    visitEntrypoint(entrypointSource)
    assert.ok(bgSpareBranch)
    assert.deepEqual(
      sourceNodeDescriptor(
        entrypointBytes,
        entrypointSource,
        bgSpareBranch,
        entrypointExpected.bgSpareBranch.name,
        ts,
      ),
      entrypointExpected.bgSpareBranch,
    )
    assert.ok(
      bgSpareBranch
        .getText(entrypointSource)
        .includes(entrypointExpected.invokedExport),
    )
  },
)

test(
  'one static owner override has an exact four-row impact and authorizes no replay',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const correction = fixture.ownerCorrection
    assert.equal(correction.rowScope, 'one-complete-export-table-unit')
    assert.equal(correction.generatorRowExists, true)
    assert.equal(correction.coverageOverrideEligible, true)
    assert.equal(correction.generatorWiringAuthorized, true)
    assert.equal(correction.generatorWiringPerformedByCase, false)
    assert.equal(correction.replayAuthorized, false)
    assert.equal(fixture.baselineAmbiguity.matchCount > 1, true)
    assert.equal(fixture.generatorRow.row.metadataEquivalent, true)
    assert.equal(fixture.generatorRow.row.alphaByCoarse, false)

    for (const scope of ['global', 'unit']) {
      const impact = correction.predictedReportImpact[scope]
      assert.deepEqual(
        {
          ownerRows: impact.after.ownerRows - impact.before.ownerRows,
          addedOwnerRows:
            impact.after.addedOwnerRows - impact.before.addedOwnerRows,
          strictRows: impact.after.strictRows - impact.before.strictRows,
        },
        impact.delta,
      )
    }
    assert.deepEqual(correction.predictedReportImpact.global.before, {
      ownerRows: 35665,
      addedOwnerRows: 1151,
      strictRows: 1228,
    })
    assert.deepEqual(correction.predictedReportImpact.global.after, {
      ownerRows: 35669,
      addedOwnerRows: 1155,
      strictRows: 1224,
    })
    assert.deepEqual(correction.predictedReportImpact.unit.before, {
      ownerRows: 0,
      addedOwnerRows: 0,
      strictRows: 4,
    })
    assert.deepEqual(correction.predictedReportImpact.unit.after, {
      ownerRows: 4,
      addedOwnerRows: 4,
      strictRows: 0,
    })
    assert.deepEqual(
      correction.predictedReportImpact.coverageRowCount,
      {
        before: 1,
        after: 1,
        replacement: 'alpha-equivalent-to-source-runtime-covered',
      },
    )
    const postPrune = fixture.inputs.frozenPostDaemonOwnerSnapshot.proofProjection
    assert.deepEqual(
      {
        ownerRows:
          postPrune.unitAfter.ownerRows - postPrune.unitBefore.ownerRows,
        addedOwnerRows:
          postPrune.unitAfter.addedOwnerRows -
          postPrune.unitBefore.addedOwnerRows,
        strictRows:
          postPrune.unitAfter.strictRows - postPrune.unitBefore.strictRows,
      },
      postPrune.delta,
    )
    assert.deepEqual(postPrune.unitBefore, {
      ownerRows: 4,
      addedOwnerRows: 4,
      strictRows: 4,
    })
    assert.deepEqual(postPrune.unitAfter, {
      ownerRows: 0,
      addedOwnerRows: 0,
      strictRows: 0,
    })
    assert.equal(postPrune.coverageRowCount, 1)
  },
)
