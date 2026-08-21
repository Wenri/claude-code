import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import * as helper from '../cases/2.1.120-to-2.1.121/recovered/daemon-cli-parse-kind-args-export-owner-overrides.mjs'

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const gitEvidenceRepositoryRoot = path.resolve(
  process.env.CLAUDE_CODE_2_1_121_REPOSITORY_ROOT ?? repositoryRoot,
)
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-daemon-cli-parse-kind-args-export-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '54ac0f4afcbc5e96687f5e202ca9ce883cd601a6a30c8f6d42d7e2dcafecaefa'

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

function sameDescriptor(actual, expected) {
  return (
    actual?.bytes === expected?.bytes && actual?.sha256 === expected?.sha256
  )
}

function selectFrozenPhase(reportDescriptor, coverageDescriptor) {
  const phases = [
    ['postPrune', fixture.inputs.frozenPostPruneSnapshot],
    ['postDaemonOwner', fixture.inputs.frozenPostDaemonOwnerSnapshot],
  ]
  const match = phases.find(
    ([, snapshot]) =>
      sameDescriptor(reportDescriptor, snapshot.typedReport) &&
      sameDescriptor(coverageDescriptor, snapshot.sourceCoverage),
  )
  if (!match) {
    throw new Error('unknown-or-hybrid-target121-daemon-cli-phase')
  }
  return { name: match[0], snapshot: match[1] }
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

function targetSourceRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_121_SOURCE_ROOT ??
      process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
      path.join(repositoryRoot, fixture.inputs.sourceRoots.raw),
  )
}

function typescript() {
  return require(
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  )
}

function reportIdentity(item, residue) {
  return [
    item.targetIndex,
    residue.literalKind,
    residue.value,
    residue.start,
    residue.end,
    residue.baselineCount,
    residue.targetOccurrenceNumber,
    true,
  ]
}

function typedReportIdentity(row) {
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

function parsedUnit(bundle, expected) {
  const bytes = bundle.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(bytes), {
    bytes: expected.bytes,
    sha256: expected.sourceHash,
  })
  const text = bytes.toString('utf8')
  const ast = parse(text, { ecmaVersion: 'latest', sourceType: 'script' })
  assert.equal(ast.body.length, 1)
  assert.equal(ast.body[0].type, expected.nodeType)
  assert.equal(tokenRows(text).length, expected.tokenCount)
  return { ast, bytes, node: ast.body[0], text }
}

function walkAst(value, visit) {
  if (value === null || typeof value !== 'object') return
  if (typeof value.type === 'string') visit(value)
  for (const [key, child] of Object.entries(value)) {
    if (['end', 'loc', 'range', 'raw', 'start'].includes(key)) continue
    if (Array.isArray(child)) {
      for (const item of child) walkAst(item, visit)
    } else {
      walkAst(child, visit)
    }
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

function tsDescriptor(text, node) {
  const start = node.getStart(node.getSourceFile())
  const end = node.end
  const value = text.slice(start, end)
  return {
    start,
    end,
    chars: value.length,
    ...descriptor(value),
  }
}

function collectTs(root, ts, predicate) {
  const result = []
  function visit(node) {
    if (predicate(node)) result.push(node)
    ts.forEachChild(node, visit)
  }
  visit(root)
  return result
}

function sourceFiles(root) {
  const result = []
  const pending = [root]
  while (pending.length > 0) {
    const directory = pending.pop()
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) pending.push(filename)
      else if (/\.(?:cts|js|jsx|mts|ts|tsx)$/.test(entry.name)) {
        result.push(filename)
      }
    }
  }
  return result.sort()
}

function filesContaining(root, marker) {
  return sourceFiles(root)
    .filter(filename => fs.readFileSync(filename, 'utf8').includes(marker))
    .map(filename => `src/${path.relative(root, filename)}`)
}

function sourceFile(ts, filename, text) {
  const result = ts.createSourceFile(
    filename,
    text,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.deepEqual(result.parseDiagnostics, [])
  return result
}

function exactFunctionRows(source, text, ts, expectedFunctions) {
  const wanted = new Set(expectedFunctions.map(item => item.name))
  const functions = collectTs(
    source,
    ts,
    node => ts.isFunctionDeclaration(node) && wanted.has(node.name?.text),
  )
  return functions.map(node => ({
    name: node.name.text,
    ...tsDescriptor(text, node),
    exported:
      node.modifiers?.some(
        modifier => modifier.kind === ts.SyntaxKind.ExportKeyword,
      ) ?? false,
    parameters: node.parameters.map(parameter =>
      parameter.name.getText(source),
    ),
  }))
}

test(
  'fixture freezes u22178 as one authorized nonmatched owner override with no replay',
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
    assert.deepEqual(Object.keys(helper).sort(), [
      'TARGET121_DAEMON_CLI_PARSE_KIND_ARGS_DEPENDENCY_TARGET_INDICES',
      'TARGET121_DAEMON_CLI_PARSE_KIND_ARGS_EXPORT_EVIDENCE_IDS',
      'TARGET121_DAEMON_CLI_PARSE_KIND_ARGS_EXPORT_OWNER_OVERRIDES',
    ])

    const overrides =
      helper.TARGET121_DAEMON_CLI_PARSE_KIND_ARGS_EXPORT_OWNER_OVERRIDES
    assert.equal(overrides.length, 1)
    const override = overrides[0]
    assert.ok(Object.isFrozen(overrides))
    assert.ok(Object.isFrozen(override))
    assert.ok(Object.isFrozen(override.strictResidues))
    assert.ok(override.strictResidues.every(Object.isFrozen))
    assert.equal(override.key, `${caseName}:22178`)
    assert.equal(override.targetIndex, fixture.exportBinding.targetIndex)
    assert.deepEqual([...override.paths], [fixture.rowBoundary.ownerPath])
    assert.deepEqual(
      [...override.generatedExports],
      fixture.exportBinding.properties.map(item => item.name),
    )
    assert.deepEqual(
      [...override.authoredDeclarations],
      fixture.sourceGraph.target.functions.map(item => item.name),
    )
    assert.deepEqual([...override.supportPaths], [fixture.sourceGraph.supportPath])
    assert.deepEqual(
      [...override.moduleAnchorTargetIndices],
      fixture.exportBinding.moduleAnchorTargetIndices,
    )
    assert.deepEqual(
      [
        ...helper.TARGET121_DAEMON_CLI_PARSE_KIND_ARGS_DEPENDENCY_TARGET_INDICES,
      ],
      [
        ...fixture.exportBinding.directDependencyTargetIndices,
        fixture.exportBinding.runtimeConsumerTargetIndex,
      ],
    )
    assert.deepEqual(
      [...helper.TARGET121_DAEMON_CLI_PARSE_KIND_ARGS_EXPORT_EVIDENCE_IDS],
      fixture.evidenceIds,
    )
    assert.deepEqual([...override.evidenceIds], fixture.evidenceIds)
    assert.equal('replay' in override, false)
    assert.equal('wholeUnit' in override, false)
    assert.equal('builder' in override, false)

    const admitted = reportIdentity(override, override.strictResidues[0])
    assert.deepEqual(admitted, fixture.rowBoundary.admitted)
    assert.deepEqual(
      canonicalDescriptor(admitted),
      fixture.rowBoundary.admittedDescriptor,
    )
    const frozen = fixture.inputs.frozenPostPruneSnapshot
    assert.deepEqual(
      canonicalDescriptor(frozen.reportRow),
      frozen.reportRowDescriptor,
    )
    assert.deepEqual(
      canonicalDescriptor(frozen.coverageRow),
      frozen.coverageRowDescriptor,
    )
    assert.deepEqual(
      canonicalDescriptor(frozen.allOwnerRow),
      frozen.allOwnerRowDescriptor,
    )
    assert.deepEqual(
      [
        frozen.reportRow.structural.index,
        frozen.reportRow.literalKind,
        frozen.reportRow.value,
        frozen.reportRow.target.start,
        frozen.reportRow.target.end,
        frozen.reportRow.baselineOccurrenceCount,
        frozen.reportRow.targetOccurrenceNumber,
        frozen.reportRow.targetAdded,
      ],
      admitted,
    )
    assert.deepEqual(frozen.coverageRow.ownerIds, [])
    assert.deepEqual(frozen.allOwnerRow.owners, [])
    assert.equal(frozen.allOwnerRow.structuralClass, 'unresolved')
    assert.equal(frozen.allOwnerRow.metadataEquivalent, true)
    assert.equal(frozen.allOwnerRow.alphaByCoarse, false)
    assert.deepEqual(expectedDescriptor(frozen.typedReport), {
      bytes: 25396455,
      sha256:
        'f63079907d813bffaf98cb89d28b8b2e183df9fe2e1c72b21f10fa2fd5c0a3f4',
    })
    assert.deepEqual(expectedDescriptor(frozen.sourceCoverage), {
      bytes: 345989,
      sha256:
        '05ac9243d7cee276bc51c8eb0c8e4e3678f96d941560cae620d05af240d7cdd4',
    })
    assert.deepEqual(
      {
        bytes: frozen.sourceCoverage.rawBytes,
        sha256: frozen.sourceCoverage.rawSha256,
      },
      {
        bytes: 2968244,
        sha256:
          '7be9d68b6144e09290d58e3dae17f21df9536852b5f8415e777c9f7dd3ad1c06',
      },
    )

    const post = fixture.inputs.frozenPostDaemonOwnerSnapshot
    assert.deepEqual(
      selectFrozenPhase(frozen.typedReport, frozen.sourceCoverage),
      { name: 'postPrune', snapshot: frozen },
    )
    assert.deepEqual(
      selectFrozenPhase(post.typedReport, post.sourceCoverage),
      { name: 'postDaemonOwner', snapshot: post },
    )
    assert.throws(
      () => selectFrozenPhase(frozen.typedReport, post.sourceCoverage),
      /unknown-or-hybrid-target121-daemon-cli-phase/,
    )
    assert.throws(
      () => selectFrozenPhase(post.typedReport, frozen.sourceCoverage),
      /unknown-or-hybrid-target121-daemon-cli-phase/,
    )
    assert.throws(
      () =>
        selectFrozenPhase(
          { bytes: 0, sha256: 'unknown-report' },
          { bytes: 0, sha256: 'unknown-coverage' },
        ),
      /unknown-or-hybrid-target121-daemon-cli-phase/,
    )
    assert.deepEqual(expectedDescriptor(post.typedReport), {
      bytes: 25369097,
      sha256:
        '2126a6898cf52b4ad639c18d51dddd24d9adfd8df73470cf2ab4298700a66bf3',
    })
    assert.deepEqual(expectedDescriptor(post.sourceCoverage), {
      bytes: 347677,
      sha256:
        '91e279daac39df4d94f0bc34e90eb31b875b5fdeeabeceb0dc83d74660de6b83',
    })
    assert.deepEqual(
      {
        bytes: post.sourceCoverage.rawBytes,
        sha256: post.sourceCoverage.rawSha256,
      },
      {
        bytes: 2974761,
        sha256:
          '8b53acac16477ad92958b40bc7b9c44cba07b6ea48671adacc5c94f7235b173f',
      },
    )
    assert.deepEqual(post.globalCounts, {
      ownerRows: 35634,
      addedOwnerRows: 1118,
      unclassifiedAddedRows: 0,
      strictRows: 1275,
      coverageRows: 4807,
      coverageOwners: 704,
    })
    assert.deepEqual(post.unitCounts, {
      ownerRows: 3,
      addedOwnerRows: 1,
      unclassifiedAddedRows: 0,
      strictRows: 1,
      coverageRows: 1,
    })
    assert.deepEqual(
      canonicalDescriptor(post.ownerRows),
      post.ownerRowsDescriptor,
    )
    assert.deepEqual(
      canonicalDescriptor(post.addedOwnerRows),
      post.addedOwnerRowsDescriptor,
    )
    assert.deepEqual(
      canonicalDescriptor(post.strictRows),
      post.strictRowsDescriptor,
    )
    const ownerIdentities = post.ownerRows.map(typedReportIdentity)
    const addedOwnerIdentities = post.addedOwnerRows.map(typedReportIdentity)
    const strictIdentities = post.strictRows.map(typedReportIdentity)
    assert.deepEqual(
      canonicalDescriptor(ownerIdentities),
      post.ownerIdentitiesDescriptor,
    )
    assert.deepEqual(
      canonicalDescriptor(addedOwnerIdentities),
      post.addedOwnerIdentitiesDescriptor,
    )
    assert.deepEqual(
      canonicalDescriptor(strictIdentities),
      post.strictIdentitiesDescriptor,
    )
    assert.deepEqual(addedOwnerIdentities, strictIdentities)
    assert.deepEqual(strictIdentities, [fixture.rowBoundary.admitted])
    assert.deepEqual(ownerIdentities.map(row => row[2]), [
      'parseKindArgs',
      'handleListAllKinds',
      'handleCliKind',
    ])
    assert.ok(
      post.ownerRows.every(
        row =>
          row.disposition === 'source-runtime-covered' &&
          row.ownerPaths.length === 1 &&
          row.ownerPaths[0] === 'daemon/cli.ts',
      ),
    )
    assert.deepEqual(
      canonicalDescriptor(post.coverageRows),
      post.coverageRowsDescriptor,
    )
    assert.equal(post.coverageRows.length, 1)
    const correctedCoverage = post.coverageRows[0]
    assert.equal(correctedCoverage.disposition, 'source-runtime-covered')
    assert.deepEqual(correctedCoverage.ownerIds, [fixture.rowBoundary.ownerId])
    assert.deepEqual(correctedCoverage.evidenceIds, fixture.evidenceIds)

    assert.equal(fixture.rowBoundary.generatorRowExists, true)
    assert.equal(fixture.rowBoundary.nonmatchedGeneratorBranch, true)
    assert.equal(fixture.rowBoundary.coverageOverrideEligible, true)
    assert.equal(fixture.rowBoundary.generatorWiringAuthorized, true)
    assert.equal(fixture.rowBoundary.generatorWiringPerformedByCase, false)
    assert.equal(fixture.rowBoundary.wholeUnitResidueAdmission, false)
    assert.equal(fixture.rowBoundary.sourceReplayAuthorized, false)
    assert.deepEqual(
      fixture.rowBoundary.correctionMaterializationDelta,
      {
        owner: { units: 1, rows: 3 },
        addedOwner: { units: 1, rows: 1 },
        strict: { units: 0, rows: 0 },
        coverageRowsReplaced: 1,
      },
    )
    assert.deepEqual(
      fixture.rowBoundary.proofSubtractionFromCorrectedState,
      {
        owner: { units: 0, rows: -1 },
        addedOwner: { units: -1, rows: -1 },
        strict: { units: -1, rows: -1 },
        coverage: { units: 0, rows: 0 },
      },
    )
    assert.deepEqual(fixture.rowBoundary.netFrozenToAdmittedDelta, {
      owner: { units: 1, rows: 2 },
      addedOwner: { units: 0, rows: 0 },
      strict: { units: -1, rows: -1 },
      coverageRowsReplaced: 1,
    })
  },
)

test(
  'authenticated u22178 binds three exact exports to implementations and the daemonMain consumer',
  { skip: !selected },
  () => {
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_121_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
    )
    const structural = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
          fixture.inputs.structuralLedger,
        ),
      ),
    )
    const units = new Map()
    for (const expected of fixture.targetUnits) {
      const region = structural.regions.find(
        candidate => candidate.target.index === expected.targetIndex,
      )
      assert.ok(region, `u${expected.targetIndex}`)
      assert.deepEqual(
        {
          classification: region.classification,
          baselineUnitIndex: region.baselineUnitIndex,
          pairReason: region.pairReason,
          moveEvidence: region.moveEvidence,
          unknownFreeIdentifierCount: region.unknownFreeIdentifierCount,
          nodeType: region.target.nodeType,
          parseStatus: region.target.parseStatus,
          start: region.target.start,
          end: region.target.end,
          tokenCount: region.target.tokenCount,
          topDefinitionCount: region.target.topDefinitionCount,
          sourceHash: region.target.sourceHash,
          coarseHash: region.target.coarseHash,
        },
        {
          classification: expected.classification,
          baselineUnitIndex: expected.baselineUnitIndex,
          pairReason: expected.pairReason,
          moveEvidence: expected.moveEvidence,
          unknownFreeIdentifierCount: expected.unknownFreeIdentifierCount,
          nodeType: expected.nodeType,
          parseStatus: expected.parseStatus,
          start: expected.start,
          end: expected.end,
          tokenCount: expected.tokenCount,
          topDefinitionCount: expected.topDefinitionCount,
          sourceHash: expected.sourceHash,
          coarseHash: expected.coarseHash,
        },
      )
      units.set(expected.targetIndex, parsedUnit(targetBundle, expected))
    }

    const namespace = units.get(22177).node
    assert.deepEqual(
      namespace.declarations.map(item => item.id.name),
      [fixture.exportBinding.namespaceBinding],
    )
    assert.equal(namespace.declarations[0].init.type, 'ObjectExpression')
    assert.equal(namespace.declarations[0].init.properties.length, 0)

    const exportUnit = units.get(fixture.exportBinding.targetIndex)
    assert.equal(exportUnit.text, fixture.exportBinding.fragment)
    const exportCall = exportUnit.node.expression
    assert.equal(exportCall.type, 'CallExpression')
    assert.equal(exportCall.arguments.length, 2)
    assert.equal(exportCall.arguments[0].name, fixture.exportBinding.namespaceBinding)
    assert.equal(exportCall.arguments[1].type, 'ObjectExpression')
    const properties = exportCall.arguments[1].properties.map(property => ({
      name: property.key.name,
      start: fixture.targetUnits[1].start + property.key.start,
      end: fixture.targetUnits[1].start + property.key.end,
      implementationBinding: property.value.body.name,
      bindingStart: fixture.targetUnits[1].start + property.value.body.start,
      bindingEnd: fixture.targetUnits[1].start + property.value.body.end,
      dependencyTargetIndex: fixture.exportBinding.properties.find(
        item => item.name === property.key.name,
      ).dependencyTargetIndex,
    }))
    assert.deepEqual(properties, fixture.exportBinding.properties)
    for (const property of properties) {
      const implementation = units.get(property.dependencyTargetIndex).node
      assert.equal(implementation.type, 'FunctionDeclaration')
      assert.equal(implementation.id.name, property.implementationBinding)
    }

    const parserCaller = units.get(22194)
    const parserReferences = []
    walkAst(parserCaller.node, node => {
      if (node.type === 'Identifier' && node.name === 'ub4') {
        parserReferences.push({
          start: fixture.targetUnits.find(item => item.targetIndex === 22194)
            .start + node.start,
          end: fixture.targetUnits.find(item => item.targetIndex === 22194)
            .start + node.end,
        })
      }
    })
    assert.deepEqual(parserReferences, [
      fixture.targetUnits.find(item => item.targetIndex === 22194)
        .parseBindingReference,
    ])

    const consumer = units.get(22207).text
    assert.ok(
      consumer.includes(
        'let{handleListAllKinds:Y}=await Promise.resolve().then(() => (Tu6(),Zu6))',
      ),
    )
    assert.ok(
      consumer.includes(
        'let{handleCliKind:Y}=await Promise.resolve().then(() => (Tu6(),Zu6))',
      ),
    )
    assert.equal(consumer.includes('parseKindArgs'), false)

    const names = new Set(Object.keys(fixture.compiledSymbolOccurrences))
    const actualOccurrences = Object.fromEntries(
      [...names].map(name => [name, []]),
    )
    for (const token of tokenizer(targetBundle.toString('utf8'), {
      ecmaVersion: 'latest',
    })) {
      if (!names.has(token.value)) continue
      actualOccurrences[token.value].push([
        token.start,
        token.end,
        targetRegionAt(structural, token.start)?.target.index ?? null,
      ])
    }
    assert.deepEqual(actualOccurrences, fixture.compiledSymbolOccurrences)
  },
)

test(
  'Target120 exact CLI table omits parseKindArgs while twenty-seven unrelated tables share its coarse shape',
  { skip: !selected },
  () => {
    const baselineBundle = readExact(
      artifactPath(
        'CLAUDE_CODE_2_1_120_BUNDLE',
        fixture.inputs.baselineBundle,
      ),
      fixture.inputs.baselineBundle,
    )
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_121_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
    )
    const baselineProgram = parse(baselineBundle.toString('utf8'), {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'script',
    })

    function baselineUnit(expected) {
      const node = baselineProgram.body[expected.index]
      const bytes = baselineBundle.subarray(node.start, node.end)
      assert.deepEqual(
        {
          start: node.start,
          end: node.end,
          ...descriptor(bytes),
          tokenCount: tokenRows(bytes.toString('utf8')).length,
        },
        {
          start: expected.start,
          end: expected.end,
          bytes: expected.bytes,
          sha256: expected.sourceHash,
          tokenCount: expected.tokenCount,
        },
      )
      return { bytes, node, text: bytes.toString('utf8') }
    }

    const namespace = baselineUnit(fixture.baselineModuleLineage.namespace)
    assert.equal(namespace.text, fixture.baselineModuleLineage.namespace.text)
    const exportTable = baselineUnit(
      fixture.baselineModuleLineage.exportTable,
    )
    assert.equal(exportTable.text, fixture.baselineModuleLineage.exportTable.text)
    assert.deepEqual(
      exportTable.node.expression.arguments[1].properties.map(
        property => property.key.name,
      ),
      fixture.baselineModuleLineage.exportTable.properties,
    )
    assert.equal(exportTable.text.includes('parseKindArgs'), false)

    const baselineParser = baselineUnit(
      fixture.baselineModuleLineage.parseKindArgsImplementation,
    )
    assert.equal(
      baselineParser.node.id.name,
      fixture.baselineModuleLineage.parseKindArgsImplementation.binding,
    )
    baselineUnit(fixture.baselineModuleLineage.handleListAllKindsImplementation)
    const baselineCaller = baselineUnit(
      fixture.baselineModuleLineage.handleCliKindImplementation,
    )
    const baselineParserReferences = []
    walkAst(baselineCaller.node, node => {
      if (
        node.type === 'Identifier' &&
        node.name ===
          fixture.baselineModuleLineage.handleCliKindImplementation.parseBinding
      ) {
        baselineParserReferences.push(node.name)
      }
    })
    assert.deepEqual(baselineParserReferences, ['r35'])

    const exportExpected = fixture.targetUnits.find(
      item => item.targetIndex === fixture.exportBinding.targetIndex,
    )
    const signature = tokenRows(
      targetBundle
        .subarray(exportExpected.start, exportExpected.end)
        .toString('utf8'),
    )
    assert.equal(
      signature.length,
      fixture.baselineNormalizedAmbiguity.normalizedTokenSignature.count,
    )
    assert.deepEqual(
      canonicalDescriptor(signature),
      expectedDescriptor(
        fixture.baselineNormalizedAmbiguity.normalizedTokenSignature,
      ),
    )
    const signatureJson = JSON.stringify(signature)
    const matches = []
    for (let index = 0; index < baselineProgram.body.length; index += 1) {
      const statement = baselineProgram.body[index]
      const bytes = baselineBundle.subarray(statement.start, statement.end)
      if (JSON.stringify(tokenRows(bytes.toString('utf8'))) !== signatureJson) {
        continue
      }
      matches.push([
        index,
        statement.start,
        statement.end,
        bytes.length,
        sha256(bytes),
      ])
    }
    assert.equal(matches.length, fixture.baselineNormalizedAmbiguity.matchCount)
    assert.deepEqual(matches, fixture.baselineNormalizedAmbiguity.matches)
    assert.deepEqual(
      canonicalDescriptor(matches),
      fixture.baselineNormalizedAmbiguity.matchesDescriptor,
    )
    assert.equal(
      matches.some(row => row[0] === fixture.baselineModuleLineage.exportTable.index),
      fixture.baselineNormalizedAmbiguity.actualBaselineDaemonCliTableInMatches,
    )
    assert.equal(new Set(matches.map(row => row[4])).size, matches.length)

    function propertyCoordinates(bundle) {
      const result = []
      for (const token of tokenizer(bundle.toString('utf8'), {
        ecmaVersion: 'latest',
      })) {
        if (token.value === fixture.propertyOccurrenceLineage.value) {
          result.push([token.type.label, token.start, token.end])
        }
      }
      return result
    }
    const baselineCoordinates = propertyCoordinates(baselineBundle)
    const targetCoordinates = propertyCoordinates(targetBundle)
    assert.deepEqual(
      baselineCoordinates,
      fixture.propertyOccurrenceLineage.baseline.tokenCoordinates,
    )
    assert.deepEqual(
      targetCoordinates,
      fixture.propertyOccurrenceLineage.target.tokenCoordinates,
    )
    assert.deepEqual(
      canonicalDescriptor(baselineCoordinates),
      fixture.propertyOccurrenceLineage.baseline.coordinatesDescriptor,
    )
    assert.deepEqual(
      canonicalDescriptor(targetCoordinates),
      fixture.propertyOccurrenceLineage.target.coordinatesDescriptor,
    )
  },
)

test(
  'raw and postPrune source authenticate the evolved export, internal caller, and sole main importer',
  { skip: !selected },
  () => {
    const ts = typescript()
    const root = targetSourceRoot()
    const cliFilename = path.join(root, 'daemon/cli.ts')
    const cliBytes = fs.readFileSync(cliFilename)
    assert.deepEqual(
      descriptor(cliBytes),
      expectedDescriptor(fixture.sourceGraph.target.cliStates[0]),
    )
    assert.ok(
      fixture.sourceGraph.target.cliStates.every(
        state =>
          state.bytes === cliBytes.length && state.sha256 === sha256(cliBytes),
      ),
    )
    const cliText = cliBytes.toString('utf8')
    assert.equal(cliText.length, fixture.sourceGraph.target.cliStates[0].chars)
    const cliSource = sourceFile(ts, cliFilename, cliText)
    assert.deepEqual(
      exactFunctionRows(
        cliSource,
        cliText,
        ts,
        fixture.sourceGraph.target.functions,
      ),
      fixture.sourceGraph.target.functions,
    )
    const parseIdentifiers = collectTs(
      cliSource,
      ts,
      node => ts.isIdentifier(node) && node.text === 'parseKindArgs',
    ).map(node => [node.getStart(cliSource), node.end])
    assert.deepEqual(
      parseIdentifiers,
      fixture.sourceGraph.target.parseIdentifiers,
    )
    const handleCliKind = collectTs(
      cliSource,
      ts,
      node =>
        ts.isFunctionDeclaration(node) && node.name?.text === 'handleCliKind',
    )[0]
    const parseCalls = collectTs(
      handleCliKind,
      ts,
      node =>
        ts.isCallExpression(node) &&
        node.expression.getText(cliSource) === 'parseKindArgs',
    )
    assert.equal(parseCalls.length, 1)
    assert.deepEqual(
      {
        ...tsDescriptor(cliText, parseCalls[0]),
        text: parseCalls[0].getText(cliSource),
      },
      fixture.sourceGraph.target.parseCall,
    )

    const mainFilename = path.join(root, 'daemon/main.ts')
    const mainBytes = fs.readFileSync(mainFilename)
    const mainMatches = fixture.sourceGraph.target.mainStates.filter(
      state =>
        state.file.bytes === mainBytes.length &&
        state.file.sha256 === sha256(mainBytes),
    )
    assert.equal(mainMatches.length, 1)
    const mainExpected = mainMatches[0]
    const mainText = mainBytes.toString('utf8')
    assert.equal(mainText.length, mainExpected.file.chars)
    const mainSource = sourceFile(ts, mainFilename, mainText)
    const cliImports = collectTs(
      mainSource,
      ts,
      node =>
        ts.isImportDeclaration(node) && node.moduleSpecifier.text === './cli.js',
    )
    assert.equal(cliImports.length, 1)
    assert.deepEqual(
      tsDescriptor(mainText, cliImports[0]),
      mainExpected.import,
    )
    assert.deepEqual(
      cliImports[0].importClause.namedBindings.elements.map(
        element => element.name.text,
      ),
      ['handleCliKind', 'handleListAllKinds'],
    )
    assert.equal(mainText.includes('parseKindArgs'), false)

    for (const [name, expectedKey] of [
      ['handleListAllKinds', 'handleListAllKindsCall'],
      ['handleCliKind', 'handleCliKindCall'],
    ]) {
      const calls = collectTs(
        mainSource,
        ts,
        node =>
          ts.isCallExpression(node) &&
          node.expression.getText(mainSource) === name,
      )
      assert.equal(calls.length, 1)
      assert.deepEqual(
        tsDescriptor(mainText, calls[0]),
        mainExpected[expectedKey],
      )
    }
    assert.deepEqual(filesContaining(root, 'parseKindArgs'), [
      fixture.sourceGraph.ownerPath,
    ])
    assert.deepEqual(filesContaining(root, "from './cli.js'"), [
      fixture.sourceGraph.supportPath,
    ])

    const baselineRoot = path.join(
      repositoryRoot,
      fixture.inputs.sourceRoots.baseline,
    )
    const baselineCliFilename = path.join(baselineRoot, 'daemon/cli.ts')
    const baselineCliBytes = readExact(
      baselineCliFilename,
      fixture.sourceGraph.baseline.cliFile,
    )
    const baselineCliText = baselineCliBytes.toString('utf8')
    const baselineCliSource = sourceFile(
      ts,
      baselineCliFilename,
      baselineCliText,
    )
    assert.deepEqual(
      exactFunctionRows(
        baselineCliSource,
        baselineCliText,
        ts,
        fixture.sourceGraph.baseline.functions,
      ),
      fixture.sourceGraph.baseline.functions,
    )
    const baselineParseIdentifiers = collectTs(
      baselineCliSource,
      ts,
      node => ts.isIdentifier(node) && node.text === 'parseKindArgs',
    ).map(node => [node.getStart(baselineCliSource), node.end])
    assert.deepEqual(
      baselineParseIdentifiers,
      fixture.sourceGraph.baseline.parseIdentifiers,
    )
    const baselineHandleCli = collectTs(
      baselineCliSource,
      ts,
      node =>
        ts.isFunctionDeclaration(node) && node.name?.text === 'handleCliKind',
    )[0]
    const baselineParseCall = collectTs(
      baselineHandleCli,
      ts,
      node =>
        ts.isCallExpression(node) &&
        node.expression.getText(baselineCliSource) === 'parseKindArgs',
    )[0]
    assert.deepEqual(
      {
        ...tsDescriptor(baselineCliText, baselineParseCall),
        text: baselineParseCall.getText(baselineCliSource),
      },
      fixture.sourceGraph.baseline.parseCall,
    )

    const baselineMainFilename = path.join(baselineRoot, 'daemon/main.ts')
    const baselineMainBytes = readExact(
      baselineMainFilename,
      fixture.sourceGraph.baseline.mainFile,
    )
    const baselineMainText = baselineMainBytes.toString('utf8')
    const baselineMainSource = sourceFile(
      ts,
      baselineMainFilename,
      baselineMainText,
    )
    const baselineImports = collectTs(
      baselineMainSource,
      ts,
      node =>
        ts.isImportDeclaration(node) && node.moduleSpecifier.text === './cli.js',
    )
    assert.equal(baselineImports.length, 1)
    assert.deepEqual(
      {
        ...tsDescriptor(baselineMainText, baselineImports[0]),
        text: baselineImports[0].getText(baselineMainSource),
        names: baselineImports[0].importClause.namedBindings.elements.map(
          element => element.name.text,
        ),
      },
      fixture.sourceGraph.baseline.mainImport,
    )
    for (const [name, expected] of Object.entries(
      fixture.sourceGraph.baseline.mainCalls,
    )) {
      const call = collectTs(
        baselineMainSource,
        ts,
        node =>
          ts.isCallExpression(node) &&
          node.expression.getText(baselineMainSource) === name,
      )[0]
      assert.deepEqual(
        {
          ...tsDescriptor(baselineMainText, call),
          text: call.getText(baselineMainSource),
        },
        expected,
      )
    }
    assert.deepEqual(filesContaining(baselineRoot, 'parseKindArgs'), [
      fixture.sourceGraph.ownerPath,
    ])

    for (const [lineage, relativePath, expectedBlob, expectedFile] of [
      [
        fixture.sourceGraph.target,
        fixture.sourceGraph.ownerPath,
        fixture.sourceGraph.target.cliGitBlob,
        fixture.sourceGraph.target.cliStates[0],
      ],
      [
        fixture.sourceGraph.baseline,
        fixture.sourceGraph.ownerPath,
        fixture.sourceGraph.baseline.cliGitBlob,
        fixture.sourceGraph.baseline.cliFile,
      ],
      [
        fixture.sourceGraph.target,
        fixture.sourceGraph.supportPath,
        fixture.sourceGraph.target.mainGitBlob,
        fixture.sourceGraph.target.mainStates[0].file,
      ],
      [
        fixture.sourceGraph.baseline,
        fixture.sourceGraph.supportPath,
        fixture.sourceGraph.baseline.mainGitBlob,
        fixture.sourceGraph.baseline.mainFile,
      ],
    ]) {
      const revision = `${lineage.gitCommit}:${relativePath}`
      assert.deepEqual(
        descriptor(
          execFileSync('git', ['show', revision], {
            cwd: gitEvidenceRepositoryRoot,
            maxBuffer: 1024 * 1024,
          }),
        ),
        expectedDescriptor(expectedFile),
      )
      assert.equal(
        execFileSync('git', ['rev-parse', revision], {
          cwd: gitEvidenceRepositoryRoot,
          encoding: 'utf8',
        }).trim(),
        expectedBlob,
      )
    }
    assert.equal(fixture.sourceGraph.externalParseKindArgsImporterCount, 0)
    assert.equal(
      fixture.sourceGraph.decision,
      'source-authenticated-generated-export-owner-with-complete-runtime-graph-no-replay',
    )
  },
)
