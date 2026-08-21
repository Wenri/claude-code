import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import * as ownerProofModule from '../cases/2.1.120-to-2.1.121/recovered/daemon-service-executable-owner-overrides.mjs'

const {
  TARGET121_DAEMON_SERVICE_EXECUTABLE_EVIDENCE_IDS,
  TARGET121_DAEMON_SERVICE_EXECUTABLE_OWNER_OVERRIDES,
} = ownerProofModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-daemon-service-executable-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'd9cbf5f792fe183d30459842d5d09dba721a2cd881b3e6842838a98644df77e4'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function expectedDescriptor(expected) {
  return { bytes: expected.bytes, sha256: expected.sha256 }
}


function sameDescriptor(actual, expected) {
  return (
    actual?.bytes === expected?.bytes && actual?.sha256 === expected?.sha256
  )
}

function selectArtifactPhase(reportDescriptor, coverageDescriptor) {
  const legacy = fixture.inputs.typedReport
  const post = fixture.inputs.postDaemonOwnerSnapshot
  if (sameDescriptor(reportDescriptor, legacy)) {
    if (coverageDescriptor !== undefined) {
      throw new Error('unknown-or-hybrid-target121-proof-phase')
    }
    return { name: 'legacy', snapshot: { typedReport: legacy } }
  }
  if (
    sameDescriptor(reportDescriptor, post.typedReport) &&
    sameDescriptor(coverageDescriptor, post.sourceCoverage)
  ) {
    return { name: 'postDaemonOwner', snapshot: post }
  }
  throw new Error('unknown-or-hybrid-target121-proof-phase')
}

function readTypedReportPhase() {
  const post = fixture.inputs.postDaemonOwnerSnapshot
  assert.equal(
    selectArtifactPhase(expectedDescriptor(fixture.inputs.typedReport)).name,
    'legacy',
  )
  assert.equal(
    selectArtifactPhase(
      expectedDescriptor(post.typedReport),
      expectedDescriptor(post.sourceCoverage),
    ).name,
    'postDaemonOwner',
  )
  assert.throws(
    () =>
      selectArtifactPhase(
        expectedDescriptor(fixture.inputs.typedReport),
        expectedDescriptor(post.sourceCoverage),
      ),
    /unknown-or-hybrid-target121-proof-phase/,
  )
  assert.throws(
    () => selectArtifactPhase(expectedDescriptor(post.typedReport)),
    /unknown-or-hybrid-target121-proof-phase/,
  )
  assert.throws(
    () =>
      selectArtifactPhase(
        { ...expectedDescriptor(post.typedReport), bytes: post.typedReport.bytes + 1 },
        expectedDescriptor(post.sourceCoverage),
      ),
    /unknown-or-hybrid-target121-proof-phase/,
  )

  const reportBytes = fs.readFileSync(
    path.join(repositoryRoot, fixture.inputs.typedReport.path),
  )
  const reportDescriptor = descriptor(reportBytes)
  if (sameDescriptor(reportDescriptor, fixture.inputs.typedReport)) {
    selectArtifactPhase(reportDescriptor)
    return { name: 'legacy', report: JSON.parse(reportBytes) }
  }

  const coverageBytes = fs.readFileSync(
    path.join(repositoryRoot, post.sourceCoverage.path),
  )
  const phase = selectArtifactPhase(
    reportDescriptor,
    descriptor(coverageBytes),
  )
  const rawCoverage = gunzipSync(coverageBytes)
  assert.deepEqual(descriptor(rawCoverage), {
    bytes: post.sourceCoverage.rawBytes,
    sha256: post.sourceCoverage.rawSha256,
  })
  const coverage = JSON.parse(rawCoverage)
  const projection = post.coverageProjection
  const coverageRows = coverage.rows.filter(row =>
    projection.targetIndices.includes(row.targetIndex),
  )
  assert.equal(coverageRows.length, projection.count)
  assert.deepEqual(descriptor(Buffer.from(JSON.stringify(coverageRows))), {
    bytes: projection.canonicalBytes,
    sha256: projection.canonicalSha256,
  })
  return { name: phase.name, report: JSON.parse(reportBytes) }
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), expectedDescriptor(expected), label)
  return bytes
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

function canonicalDigest(rows) {
  return descriptor(Buffer.from(JSON.stringify(rows)))
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

function walk(node, visit, parents = []) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, parents)
    return
  }
  if (typeof node.type === 'string') visit(node, parents)
  const nextParents = typeof node.type === 'string' ? [...parents, node] : parents
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start'].includes(key)) {
      walk(child, visit, nextParents)
    }
  }
}

function parseUnit(bundle, expected, label) {
  const source = exactBufferSlice(bundle, expected, label)
  const program = parse(source, { ecmaVersion: 'latest' })
  assert.equal(program.body.length, 1, `${label}: one top-level unit`)
  const node = program.body[0]
  assert.equal(node.type, expected.nodeType)
  assert.equal(
    [...tokenizer(source, { ecmaVersion: 'latest' })].length,
    expected.tokenCount,
  )
  if (expected.bodyStatementCount !== undefined) {
    assert.equal(node.body.body.length, expected.bodyStatementCount)
  }
  return { node, source, unitStart: expected.start }
}

function exactNodeSlice(parsed, node, expected, label) {
  assert.equal(node.type, expected.nodeType, label)
  assert.equal(parsed.unitStart + node.start, expected.start, label)
  assert.equal(parsed.unitStart + node.end, expected.end, label)
  const value = parsed.source.slice(node.start, node.end)
  assert.deepEqual(descriptor(value), expectedDescriptor(expected), label)
  if (expected.exact !== undefined) assert.equal(value, expected.exact, label)
  return value
}

function nodeAt(parsed, expected) {
  let found
  walk(parsed.node, node => {
    if (
      parsed.unitStart + node.start === expected.start &&
      parsed.unitStart + node.end === expected.end
    ) {
      assert.equal(found, undefined, 'unique exact AST region')
      found = node
    }
  })
  assert.ok(found, `AST region ${expected.start}..${expected.end}`)
  return found
}

function typescript() {
  return require(
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  )
}

function selectedSourceRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_121_SOURCE_ROOT ??
      process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
      path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.121/src'),
  )
}

function selectedBaselineSourceRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_120_SOURCE_ROOT ??
      path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.120/src'),
  )
}

function sourceFilename(root, sourcePath) {
  assert.ok(sourcePath.startsWith('src/'))
  return path.join(root, sourcePath.slice(4))
}

function parseTypescript(filename, expected) {
  const ts = typescript()
  const bytes = readExact(filename, expected, filename)
  const source = bytes.toString('utf8')
  assert.equal(source.length, expected.chars)
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  return { ts, source, sourceFile }
}

function selectTargetMainState(filename) {
  const actual = descriptor(fs.readFileSync(filename))
  const states = [
    fixture.sourceCallerEvolution.target121,
    fixture.sourceCallerEvolution.target121PostDaemonOwner,
  ]
  const matches = states.filter(state => sameDescriptor(actual, state))
  assert.equal(matches.length, 1, 'exact Target121 daemon/main.ts state')
  return matches[0]
}

function tsNodeDescriptor(parsed, node, expected, label) {
  const start = node.getStart(parsed.sourceFile)
  const end = node.end
  const value = parsed.source.slice(start, end)
  const first = parsed.sourceFile.getLineAndCharacterOfPosition(start)
  const last = parsed.sourceFile.getLineAndCharacterOfPosition(end)
  assert.deepEqual(
    {
      start,
      end,
      line: first.line + 1,
      endLine: last.line + 1,
      chars: value.length,
      ...descriptor(value),
    },
    {
      start: expected.start,
      end: expected.end,
      line: expected.line,
      endLine: expected.endLine,
      chars: expected.chars,
      bytes: expected.bytes,
      sha256: expected.sha256,
    },
    label,
  )
  if (expected.exact !== undefined) assert.equal(value, expected.exact, label)
  return value
}

function findTsFunction(parsed, name) {
  let found
  const visit = node => {
    if (
      parsed.ts.isFunctionDeclaration(node) &&
      node.name?.text === name
    ) {
      assert.equal(found, undefined, `unique ${name}`)
      found = node
    }
    parsed.ts.forEachChild(node, visit)
  }
  visit(parsed.sourceFile)
  assert.ok(found, name)
  return found
}

function findTsImport(parsed, moduleName) {
  const imports = parsed.sourceFile.statements.filter(
    node =>
      parsed.ts.isImportDeclaration(node) &&
      node.moduleSpecifier.text === moduleName,
  )
  assert.equal(imports.length, 1, `one ${moduleName} import`)
  return imports[0]
}

function findTsCalls(parsed, expressionText) {
  const calls = []
  const visit = node => {
    if (
      parsed.ts.isCallExpression(node) &&
      node.expression.getText(parsed.sourceFile) === expressionText
    ) {
      calls.push(node)
    }
    parsed.ts.forEachChild(node, visit)
  }
  visit(parsed.sourceFile)
  return calls
}

function compileSourceProbe(declaration, dependencies) {
  const ts = typescript()
  const output = ts.transpileModule(declaration, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const context = { exports: {}, ...dependencies }
  vm.runInNewContext(output, context)
  assert.equal(typeof context.exports.serviceExecutableIsMissing, 'function')
  return context.exports.serviceExecutableIsMissing
}

function compileBundleProbe(unit, dependencies) {
  const context = { ...dependencies }
  const probe = vm.runInNewContext(`${unit}; El7`, context)
  assert.equal(typeof probe, 'function')
  return probe
}

async function runProbe(kind, declarationOrUnit, scenario) {
  const trace = []
  const dependencies = {
    getSystemdServicePath() {
      trace.push(['path'])
      return '/config/systemd/user/claude.service'
    },
    fT6() {
      trace.push(['path'])
      return '/config/systemd/user/claude.service'
    },
    async readFile(value, encoding) {
      trace.push(['readFile', value, encoding])
      if (scenario.readThrows) throw new Error('missing unit')
      return scenario.unit
    },
    async access(value) {
      trace.push(['access', value])
      if (scenario.accessThrows) throw new Error('missing executable')
    },
  }
  const probe =
    kind === 'source'
      ? compileSourceProbe(declarationOrUnit, dependencies)
      : compileBundleProbe(declarationOrUnit, {
          fT6: dependencies.fT6,
          ms: {
            readFile: dependencies.readFile,
            access: dependencies.access,
          },
        })
  return { result: await probe(), trace }
}

test(
  'Target121 daemon service executable fixture and owner override are frozen',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.equal(
      fixture.status,
      'case-owned-static-owner-proof-source-already-authentic',
    )
    assert.deepEqual(
      Object.keys(ownerProofModule).sort(),
      [
        'TARGET121_DAEMON_SERVICE_EXECUTABLE_EVIDENCE_IDS',
        'TARGET121_DAEMON_SERVICE_EXECUTABLE_OWNER_OVERRIDES',
      ],
    )
    assert.deepEqual(
      TARGET121_DAEMON_SERVICE_EXECUTABLE_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET121_DAEMON_SERVICE_EXECUTABLE_OWNER_OVERRIDES,
      [
        {
          key: `${caseName}:16315`,
          targetIndex: 16315,
          paths: [fixture.ownerCorrection.correctedOwner],
          declarations: [fixture.ownerCorrection.declaration],
          evidenceIds: fixture.evidenceIds,
          behavior:
            TARGET121_DAEMON_SERVICE_EXECUTABLE_OWNER_OVERRIDES[0]
              .behavior,
        },
      ],
    )
    assert.equal(
      Object.isFrozen(TARGET121_DAEMON_SERVICE_EXECUTABLE_OWNER_OVERRIDES),
      true,
    )
    assert.match(
      TARGET121_DAEMON_SERVICE_EXECUTABLE_OWNER_OVERRIDES[0].behavior,
      /byte-identical.*only Target121 daemonMain imports and calls.*newly live.*ms\.access.*attribution collision.*no source replay/s,
    )
    assert.equal(fixture.classification.sourceReplay, 'not-needed-and-forbidden')
  },
)

test(
  'authenticated u16315, its dependency units, and its caller are exact',
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
    const baseline = readExact(
      baselinePath,
      fixture.inputs.baselineBundle,
      'Target120 bundle',
    )
    const target = readExact(
      targetPath,
      fixture.inputs.targetBundle,
      'Target121 bundle',
    )
    const ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
          fixture.inputs.structuralLedger,
          'Target121 structural ledger',
        ),
      ),
    )

    const region = ledger.regions[fixture.targetUnit.targetIndex]
    assert.equal(region.target.index, fixture.targetUnit.targetIndex)
    assert.equal(region.classification, fixture.targetUnit.classification)
    assert.equal(region.baselineUnitIndex, undefined)
    assert.deepEqual(
      {
        nodeType: region.target.nodeType,
        start: region.target.start,
        end: region.target.end,
        tokenCount: region.target.tokenCount,
        sourceHash: region.target.sourceHash,
        coarseHash: region.target.coarseHash,
        topDefinitionCount: region.target.topDefinitionCount,
        line: region.target.location.line,
        column: region.target.location.column,
        unknownFreeIdentifierCount: region.unknownFreeIdentifierCount,
      },
      {
        nodeType: fixture.targetUnit.nodeType,
        start: fixture.targetUnit.start,
        end: fixture.targetUnit.end,
        tokenCount: fixture.targetUnit.tokenCount,
        sourceHash: fixture.targetUnit.sha256,
        coarseHash: fixture.targetUnit.coarseHash,
        topDefinitionCount: fixture.targetUnit.topDefinitionCount,
        line: fixture.targetUnit.line,
        column: fixture.targetUnit.column,
        unknownFreeIdentifierCount:
          fixture.targetUnit.unknownFreeIdentifierCount,
      },
    )

    const targetUnit = parseUnit(target, fixture.targetUnit, 'Target121 u16315')
    assert.equal(targetUnit.node.async, true)
    assert.equal(targetUnit.node.id.name, fixture.targetUnit.minifiedName)

    for (const expected of Object.values(fixture.compiledSemanticRegions)) {
      const node = nodeAt(targetUnit, expected)
      exactNodeSlice(targetUnit, node, expected, expected.exact)
    }
    const regexp = nodeAt(targetUnit, fixture.compiledSemanticRegions.regexp)
    assert.deepEqual(regexp.regex, {
      pattern: fixture.compiledSemanticRegions.regexp.pattern,
      flags: fixture.compiledSemanticRegions.regexp.flags,
    })
    const selection = nodeAt(
      targetUnit,
      fixture.compiledSemanticRegions.executableSelection,
    )
    assert.equal(selection.operator, '??')
    assert.equal(selection.left.type, 'ChainExpression')
    assert.equal(selection.right.type, 'ChainExpression')
    assert.equal(selection.left.expression.optional, true)
    assert.equal(selection.right.expression.optional, true)
    assert.deepEqual(
      [
        selection.left.expression.property.value,
        selection.right.expression.property.value,
      ],
      fixture.compiledSemanticRegions.executableSelection.indices,
    )
    const accessMember = nodeAt(
      targetUnit,
      fixture.compiledSemanticRegions.accessMember,
    )
    assert.equal(accessMember.computed, false)
    assert.equal(accessMember.property.name, 'access')

    for (const expected of Object.values(fixture.compiledDependencies)) {
      const parsed = parseUnit(target, expected, `Target121 u${expected.targetIndex}`)
      const dependencyRegion = ledger.regions[expected.targetIndex]
      assert.equal(dependencyRegion.classification, expected.classification)
      assert.equal(dependencyRegion.baselineUnitIndex, expected.baselineUnitIndex)
      if (expected.fsPromisesBinding) {
        exactBufferSlice(target, expected.fsPromisesBinding, 'fs/promises namespace')
        assert.equal(
          countOccurrences(parsed.source, 'require("fs/promises")'),
          1,
        )
      }
    }

    const caller = parseUnit(target, fixture.compiledCaller, 'Target121 u22207')
    const callerRegion = ledger.regions[fixture.compiledCaller.targetIndex]
    assert.equal(callerRegion.classification, fixture.compiledCaller.classification)
    for (const key of ['call', 'await', 'regenerationBranch']) {
      const expected = fixture.compiledCaller[key]
      exactNodeSlice(caller, nodeAt(caller, expected), expected, key)
    }
    const calls = []
    walk(caller.node, (node, parents) => {
      if (
        node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        node.callee.name === fixture.targetUnit.minifiedName
      ) {
        calls.push({ node, parents })
      }
    })
    assert.equal(calls.length, 1)
    assert.ok(calls[0].parents.some(node => node.type === 'AwaitExpression'))
    assert.ok(calls[0].parents.some(node => node.type === 'IfStatement'))

    const probeRegexp = fixture.compiledSemanticRegions.regexp.exact
    assert.equal(countOccurrences(baseline.toString('utf8'), probeRegexp), 0)
    assert.equal(countOccurrences(target.toString('utf8'), probeRegexp), 1)
    assert.equal(
      countOccurrences(baseline.toString('utf8'), 'service binary missing'),
      fixture.baselineRelation.bundleMarkerCounts.baseline.serviceBinaryMissing,
    )
    assert.equal(
      countOccurrences(target.toString('utf8'), 'service binary missing'),
      fixture.baselineRelation.bundleMarkerCounts.target.serviceBinaryMissing,
    )
    assert.equal(
      countOccurrences(target.toString('utf8'), `${fixture.targetUnit.minifiedName}()`),
      fixture.baselineRelation.bundleMarkerCounts.target
        .minifiedNameDefinitionAndCall,
    )
  },
)

test(
  'typed report pins all five u16315 rows and the sole strict access residue',
  { skip: !selected },
  () => {
    const { name: reportPhase, report } = readTypedReportPhase()
    const expectedResidues =
      reportPhase === 'postDaemonOwner'
        ? fixture.ownerResidues.postDaemonOwner
        : fixture.ownerResidues
    const ownerRows = report.sourceRuntimeOwnerResidueRows.filter(
      row => row.structural.index === fixture.targetUnit.targetIndex,
    )
    const addedRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
      row => row.structural.index === fixture.targetUnit.targetIndex,
    )
    const strictRows = report.rows.filter(
      row => row.structural.index === fixture.targetUnit.targetIndex,
    )
    const rowIdentity = row => [
      row.literalKind,
      row.value,
      row.target.start,
      row.target.end,
      row.baselineOccurrenceCount,
      row.targetOccurrenceNumber,
      row.targetAdded,
    ]
    const strictIdentity = row => [
      row.structural.index,
      row.literalKind,
      row.value,
      row.target.start,
      row.target.end,
      row.targetOccurrenceNumber,
    ]
    assert.equal(ownerRows.length, expectedResidues.totalRows)
    assert.equal(addedRows.length, expectedResidues.targetAddedRows)
    assert.equal(strictRows.length, expectedResidues.strictRows)
    assert.deepEqual(
      canonicalDigest(ownerRows.map(rowIdentity)),
      expectedResidues.rowIdentities,
    )
    assert.deepEqual(
      canonicalDigest(addedRows.map(rowIdentity)),
      expectedResidues.addedIdentities,
    )
    assert.deepEqual(
      addedRows.map(rowIdentity),
      expectedResidues.targetAddedRowsExact,
    )
    assert.deepEqual(
      canonicalDigest(strictRows.map(strictIdentity)),
      expectedResidues.strictIdentities,
    )
    assert.deepEqual(
      strictRows.map(strictIdentity),
      expectedResidues.strictRowsExact,
    )
    for (const row of ownerRows) {
      assert.deepEqual(row.ownerPaths, [
        expectedResidues.reportedOwner ?? fixture.ownerCorrection.reportedOwner,
      ])
      assert.deepEqual(row.ownerSourceMatches, [])
    }
    const regexp = addedRows.find(row => row.literalKind === 'regexp')
    if (reportPhase === 'legacy') {
      assert.deepEqual(regexp.cookedSourceMatches, ['daemon/service.ts'])
    } else {
      assert.equal(regexp, undefined)
    }
    const access = strictRows[0]
    assert.equal(access.value, 'access')
    assert.deepEqual(access.cookedSourceMatches, [])
    assert.deepEqual(access.sourceMatches, [])
  },
)

test(
  'retained service source declaration and new daemonMain reachability are exact',
  { skip: !selected },
  t => {
    const targetRoot = selectedSourceRoot()
    const baselineRoot = selectedBaselineSourceRoot()
    const targetServicePath = sourceFilename(targetRoot, fixture.sourceState.path)
    const baselineServicePath = sourceFilename(
      baselineRoot,
      fixture.sourceState.path,
    )
    const targetMainPath = sourceFilename(
      targetRoot,
      fixture.sourceCallerEvolution.path,
    )
    const baselineMainPath = sourceFilename(
      baselineRoot,
      fixture.sourceCallerEvolution.path,
    )
    if (
      !fs.existsSync(targetServicePath) ||
      !fs.existsSync(baselineServicePath) ||
      !fs.existsSync(targetMainPath) ||
      !fs.existsSync(baselineMainPath)
    ) {
      t.skip('recovered Target120/121 daemon source roots are unavailable')
      return
    }

    const baselineService = parseTypescript(
      baselineServicePath,
      fixture.sourceState.target120,
    )
    const targetService = parseTypescript(
      targetServicePath,
      fixture.sourceState.target121,
    )
    const baselineDeclaration = findTsFunction(
      baselineService,
      fixture.sourceState.declarationName,
    )
    const targetDeclaration = findTsFunction(
      targetService,
      fixture.sourceState.declarationName,
    )
    const baselineDeclarationText = tsNodeDescriptor(
      baselineService,
      baselineDeclaration,
      fixture.sourceState.target120.declaration,
      'Target120 service declaration',
    )
    const targetDeclarationText = tsNodeDescriptor(
      targetService,
      targetDeclaration,
      fixture.sourceState.target121.declaration,
      'Target121 service declaration',
    )
    assert.equal(targetDeclarationText, baselineDeclarationText)

    for (const [parsed, state] of [
      [baselineService, fixture.sourceState.target120],
      [targetService, fixture.sourceState.target121],
    ]) {
      const imported = findTsImport(parsed, 'fs/promises')
      const text = tsNodeDescriptor(
        parsed,
        imported,
        state.fsPromisesImport,
        'fs/promises import',
      )
      assert.match(text, /\baccess\b/)
      assert.match(text, /\breadFile\b/)
    }
    for (const [expression, expected] of Object.entries(
      fixture.sourceState.target121.sourceCalls,
    )) {
      const expressionText = expression === 'match' ? 'unit.match' : expression
      const calls = findTsCalls(targetService, expressionText)
      assert.equal(calls.length, 1, expressionText)
      tsNodeDescriptor(targetService, calls[0], expected, expressionText)
    }

    const baselineMain = parseTypescript(
      baselineMainPath,
      fixture.sourceCallerEvolution.target120,
    )
    const targetMainState = selectTargetMainState(targetMainPath)
    const targetMain = parseTypescript(targetMainPath, targetMainState)
    for (const [parsed, state] of [
      [baselineMain, fixture.sourceCallerEvolution.target120],
      [targetMain, targetMainState],
    ]) {
      tsNodeDescriptor(
        parsed,
        findTsImport(parsed, './service.js'),
        state.serviceImport,
        './service.js import',
      )
      for (const [marker, expected] of Object.entries(state.markerCounts)) {
        const needle =
          marker === 'serviceBinaryMissing'
            ? 'service binary missing'
            : marker
        assert.equal(countOccurrences(parsed.source, needle), expected, needle)
      }
    }
    const daemonMain = findTsFunction(
      targetMain,
      targetMainState.declaration.name,
    )
    tsNodeDescriptor(
      targetMain,
      daemonMain,
      targetMainState.declaration,
      'daemonMain declaration',
    )
    const calls = findTsCalls(targetMain, 'serviceExecutableIsMissing')
    assert.equal(calls.length, 1)
    tsNodeDescriptor(
      targetMain,
      calls[0],
      targetMainState.call,
      'serviceExecutableIsMissing call',
    )
    const branch = calls[0].parent.parent
    assert.equal(targetMain.ts.isIfStatement(branch), true)
    tsNodeDescriptor(
      targetMain,
      branch,
      targetMainState.regenerationBranch,
      'service regeneration branch',
    )

    const staleOwnerPath = sourceFilename(
      targetRoot,
      fixture.ownerCorrection.staleOwner.path,
    )
    const staleBytes = readExact(
      staleOwnerPath,
      fixture.ownerCorrection.staleOwner,
      'stale MCP owner',
    )
    const staleSource = staleBytes.toString('utf8')
    assert.equal(staleSource.length, fixture.ownerCorrection.staleOwner.chars)
    for (const [marker, expected] of Object.entries(
      fixture.ownerCorrection.staleOwner.markerCounts,
    )) {
      assert.equal(countOccurrences(staleSource, marker), expected, marker)
    }
  },
)

test(
  'compiled u16315 and authored service declaration have the same runtime truth table',
  { skip: !selected },
  async t => {
    const targetPath = artifactPath(
      'CLAUDE_CODE_2_1_121_INNER_BUNDLE',
      fixture.inputs.targetBundle,
    )
    const sourcePath = sourceFilename(selectedSourceRoot(), fixture.sourceState.path)
    if (!fs.existsSync(targetPath) || !fs.existsSync(sourcePath)) {
      t.skip('authenticated Target121 bundle or source is unavailable')
      return
    }
    const target = readExact(targetPath, fixture.inputs.targetBundle)
    const targetUnit = exactBufferSlice(target, fixture.targetUnit, 'u16315')
    const source = parseTypescript(sourcePath, fixture.sourceState.target121)
    const sourceDeclaration = tsNodeDescriptor(
      source,
      findTsFunction(source, fixture.sourceState.declarationName),
      fixture.sourceState.target121.declaration,
      'source runtime declaration',
    )
    const scenarios = [
      {
        name: 'service unit read failure',
        readThrows: true,
        unit: '',
        accessThrows: false,
        expected: fixture.semanticContract.outcomes.serviceReadFailure,
      },
      {
        name: 'missing ExecStart',
        readThrows: false,
        unit: '[Service]\nType=simple\n',
        accessThrows: false,
        expected: fixture.semanticContract.outcomes.missingExecStart,
      },
      {
        name: 'quoted executable is accessible',
        readThrows: false,
        unit: '[Service]\nExecStart="/opt/Claude Code/claude" daemon\n',
        accessThrows: false,
        expected: fixture.semanticContract.outcomes.executableAccessible,
      },
      {
        name: 'unquoted executable is missing',
        readThrows: false,
        unit: '[Service]\nExecStart=/missing/claude daemon\n',
        accessThrows: true,
        expected: fixture.semanticContract.outcomes.executableMissing,
      },
    ]
    for (const scenario of scenarios) {
      const sourceResult = await runProbe('source', sourceDeclaration, scenario)
      const bundleResult = await runProbe('bundle', targetUnit, scenario)
      assert.equal(sourceResult.result, scenario.expected, scenario.name)
      assert.equal(bundleResult.result, scenario.expected, scenario.name)
      assert.deepEqual(bundleResult.trace, sourceResult.trace, scenario.name)
      if (!scenario.readThrows) {
        assert.deepEqual(sourceResult.trace[1].slice(0, 3), [
          'readFile',
          '/config/systemd/user/claude.service',
          fixture.semanticContract.encoding,
        ])
      }
    }
  },
)
