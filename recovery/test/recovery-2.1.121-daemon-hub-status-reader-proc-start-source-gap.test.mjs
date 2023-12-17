import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import * as replayModule from '../cases/2.1.120-to-2.1.121/recovered/replay-daemon-hub-status-reader-proc-start-source-gap.mjs'
import {
  applyTarget121DaemonHubStatusReaderSourceRecovery,
  buildTarget121DaemonHubStatusReaderOutput,
  TARGET121_DAEMON_HUB_STATUS_READER_EVIDENCE_IDS,
  TARGET121_DAEMON_HUB_STATUS_READER_INPUT_FILES,
  TARGET121_DAEMON_HUB_STATUS_READER_OUTPUT_FILES,
  TARGET121_DAEMON_HUB_STATUS_READER_OWNER_OVERRIDES,
} from '../cases/2.1.120-to-2.1.121/recovered/replay-daemon-hub-status-reader-proc-start-source-gap.mjs'

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
    './recovery-2.1.121-daemon-hub-status-reader-proc-start-source-gap.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '89453f835b72e9d565e87d02303727339fa5c819cf1daefa508fad5e5bdf1ae3'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function expectedDescriptor(expected) {
  return {
    bytes: expected.bytes ?? expected.end - expected.start,
    sha256: expected.sha256 ?? expected.sourceHash,
  }
}

function sameDescriptor(actual, expected) {
  return (
    actual.bytes === expected.bytes && actual.sha256 === expected.sha256
  )
}

function selectArtifactPhase(reportDescriptor, coverageDescriptor) {
  const phases = [
    {
      name: 'legacy',
      report: fixture.inputs.typedReportSnapshot,
      coverage: fixture.inputs.sourceCoverageSnapshot,
    },
    {
      name: 'postDaemonOwner',
      report: fixture.inputs.postDaemonOwnerSnapshot.typedReport,
      coverage: fixture.inputs.postDaemonOwnerSnapshot.sourceCoverage,
    },
  ]
  const phase = phases.find(
    candidate =>
      sameDescriptor(reportDescriptor, candidate.report) &&
      sameDescriptor(coverageDescriptor, candidate.coverage),
  )
  if (!phase) throw new Error('unknown-or-hybrid-target121-proof-phase')
  return phase
}

function readArtifactPhase() {
  const reportBytes = fs.readFileSync(
    artifactPath(fixture.inputs.typedReportSnapshot),
  )
  const coverageBytes = fs.readFileSync(
    artifactPath(fixture.inputs.sourceCoverageSnapshot),
  )
  const phase = selectArtifactPhase(
    descriptor(reportBytes),
    descriptor(coverageBytes),
  )
  const coverageRaw = gunzipSync(coverageBytes)
  const expectedCoverage = phase.coverage
  assert.deepEqual(descriptor(coverageRaw), {
    bytes: expectedCoverage.rawBytes,
    sha256: expectedCoverage.rawSha256,
  })
  const coverage = JSON.parse(coverageRaw)
  const coverageRows = coverage.rows.filter(
    row => row.targetIndex === fixture.units.target.index,
  )
  if (phase.name === 'postDaemonOwner') {
    const projection = descriptor(Buffer.from(JSON.stringify(coverageRows)))
    assert.deepEqual({
      targetIndices: [...new Set(coverageRows.map(row => row.targetIndex))],
      count: coverageRows.length,
      canonicalBytes: projection.bytes,
      canonicalSha256: projection.sha256,
    }, expectedCoverage.projection)
  }
  return {
    name: phase.name,
    report: JSON.parse(reportBytes.toString()),
    coverageRows,
  }
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), expectedDescriptor(expected), label)
  return bytes
}

function artifactPath(expected) {
  return path.join(repositoryRoot, expected.path)
}

function selectedSourceRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_121_SOURCE_ROOT ??
      process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
      path.join(repositoryRoot, 'src'),
  )
}

function sourceFilename(root, sourcePath) {
  assert.match(sourcePath, /^src\//)
  return path.join(root, sourcePath.slice(4))
}

function typescript() {
  return require(
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  )
}

function parseTypescript(source, filename) {
  const ts = typescript()
  const parsed = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(parsed.parseDiagnostics.length, 0, filename)
  return { ts, parsed, source }
}

function namedStatement(parsed, name, kind) {
  const matches = parsed.parsed.statements.filter(statement => {
    if (kind === 'function') {
      return (
        parsed.ts.isFunctionDeclaration(statement) &&
        statement.name?.text === name
      )
    }
    if (kind === 'type') {
      return (
        parsed.ts.isTypeAliasDeclaration(statement) &&
        statement.name.text === name
      )
    }
    if (kind === 'variable') {
      return (
        parsed.ts.isVariableStatement(statement) &&
        statement.declarationList.declarations.some(
          declaration => declaration.name.getText(parsed.parsed) === name,
        )
      )
    }
    return false
  })
  assert.equal(matches.length, 1, `${kind} ${name}`)
  return matches[0]
}

function namedImport(parsed, moduleName) {
  const matches = parsed.parsed.statements.filter(
    statement =>
      parsed.ts.isImportDeclaration(statement) &&
      statement.moduleSpecifier.text === moduleName,
  )
  assert.equal(matches.length, 1, moduleName)
  return matches[0]
}

function sourceRegion(parsed, node) {
  const charStart = node.getStart(parsed.parsed)
  const charEnd = node.end
  const text = parsed.source.slice(charStart, charEnd)
  return {
    charStart,
    charEnd,
    byteStart: Buffer.byteLength(parsed.source.slice(0, charStart)),
    byteEnd: Buffer.byteLength(parsed.source.slice(0, charEnd)),
    ...descriptor(text),
  }
}

function assertSourceRegion(parsed, node, expected, label) {
  assert.deepEqual(
    sourceRegion(parsed, node),
    {
      charStart: expected.charStart,
      charEnd: expected.charEnd,
      byteStart: expected.byteStart,
      byteEnd: expected.byteEnd,
      ...expectedDescriptor(expected),
    },
    label,
  )
}

function findTsNodes(parsed, predicate) {
  const matches = []
  function visit(node) {
    if (predicate(node)) matches.push(node)
    parsed.ts.forEachChild(node, visit)
  }
  visit(parsed.parsed)
  return matches
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (typeof node.type === 'string') visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start'].includes(key)) {
      walk(child, visit)
    }
  }
}

function parseUnit(bundle, expected) {
  const source = bundle.subarray(expected.start, expected.end).toString()
  assert.deepEqual(descriptor(source), expectedDescriptor(expected))
  assert.equal(
    [...tokenizer(source, { ecmaVersion: 'latest' })].length,
    expected.tokenCount,
  )
  const program = parse(source, { ecmaVersion: 'latest' })
  assert.equal(program.body.length, 1)
  assert.equal(program.body[0].type, expected.nodeType)
  if (expected.bodyStatementCount !== undefined) {
    assert.equal(
      program.body[0].body.body.length,
      expected.bodyStatementCount,
    )
  }
  return { node: program.body[0], source, unitStart: expected.start }
}

function nodeAtGlobal(parsed, expected) {
  let found
  walk(parsed.node, node => {
    if (
      parsed.unitStart + node.start === expected.start &&
      parsed.unitStart + node.end === expected.end &&
      node.type === expected.nodeType
    ) {
      assert.equal(found, undefined, `unique ${expected.start}..${expected.end}`)
      found = node
    }
  })
  assert.ok(found, `${expected.start}..${expected.end}`)
  const exact = parsed.source.slice(found.start, found.end)
  assert.deepEqual(descriptor(exact), expectedDescriptor(expected))
  if (expected.exact !== undefined) assert.equal(exact, expected.exact)
  return found
}

function statementAt(parsed, expected) {
  const statement = parsed.node.body.body[expected.statementIndex]
  assert.equal(statement.type, expected.nodeType)
  assert.equal(parsed.unitStart + statement.start, expected.start)
  assert.equal(parsed.unitStart + statement.end, expected.end)
  assert.deepEqual(
    descriptor(parsed.source.slice(statement.start, statement.end)),
    expectedDescriptor(expected),
  )
  return statement
}

function canonicalize(value, parent = null, key = null) {
  if (Array.isArray(value)) {
    return value.map(child => canonicalize(child, parent, key))
  }
  if (!value || typeof value !== 'object') return value
  if (
    value.type === 'MemberExpression' &&
    !value.computed &&
    value.object?.type === 'Identifier' &&
    value.property?.type === 'Identifier' &&
    value.property.name === 'readFile'
  ) {
    return { type: 'Identifier', name: '@id' }
  }
  if (value.type === 'Identifier') {
    const semantic =
      (parent?.type === 'MemberExpression' &&
        key === 'property' &&
        !parent.computed) ||
      (parent?.type === 'Property' && key === 'key' && !parent.computed) ||
      (parent?.type === 'MethodDefinition' &&
        key === 'key' &&
        !parent.computed)
    return { type: 'Identifier', name: semantic ? value.name : '@id' }
  }
  if (value.type === 'VariableDeclaration') {
    return {
      type: 'VariableDeclaration',
      kind: 'var',
      declarations: canonicalize(value.declarations, value, 'declarations'),
    }
  }
  const result = {}
  for (const [childKey, child] of Object.entries(value)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'shorthand'].includes(childKey)) {
      result[childKey] = canonicalize(child, value, childKey)
    }
  }
  return result
}

function canonicalDescriptor(node) {
  return descriptor(Buffer.from(JSON.stringify(canonicalize(node))))
}

function reverseTargetDelta(target, baseline) {
  const reversed = structuredClone(target)
  reversed.body.body.splice(7, 2)
  reversed.body.body[1].handler = structuredClone(
    baseline.body.body[1].handler,
  )
  return reversed
}

function compileWithFrozenBun(source) {
  const compiler = path.join(repositoryRoot, fixture.wholeUnitProof.compiler.path)
  const program = [
    'const input = await Bun.stdin.text()',
    `const transpiler = new Bun.Transpiler(${JSON.stringify(
      fixture.wholeUnitProof.compiler.options,
    )})`,
    'process.stdout.write(await transpiler.transform(input))',
  ].join(';')
  const result = spawnSync(compiler, ['-e', program], {
    cwd: repositoryRoot,
    input: Buffer.from(source),
    encoding: null,
  })
  assert.equal(result.status, 0, result.stderr?.toString())
  return result.stdout.toString()
}

function rowTuple(row) {
  return [
    row.structural.index,
    row.literalKind,
    row.value,
    row.target.start,
    row.target.end,
    row.baselineOccurrenceCount,
    row.targetOccurrenceNumber,
    row.targetAdded,
    row.disposition,
    row.ownerPaths,
  ]
}

function canonicalRows(rows) {
  const value = rows.map(JSON.stringify).join('\n')
  return { count: rows.length, ...descriptor(Buffer.from(value)), tuples: rows }
}

async function runReader(source, target, scenario = {}) {
  const calls = { read: [], parse: [], kill: [], match: [] }
  const read = async (...args) => {
    calls.read.push(args)
    if (scenario.readError) throw new Error('read failed')
    return scenario.raw
  }
  const safeParse = (value, shouldLogError) => {
    calls.parse.push([value, shouldLogError])
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }
  const kill = (...args) => {
    calls.kill.push(args)
    if (scenario.killError) throw new Error('dead pid')
  }
  const match = async (...args) => {
    calls.match.push(args)
    if (scenario.matchError) throw new Error('token lookup failed')
    return scenario.match ?? true
  }
  const bindings = target
    ? {
        Cy6: () => '/state/daemon.status.json',
        T7: safeParse,
        bZ: match,
        process: { kill },
        q54: undefined,
        xY8: { readFile: read },
      }
    : {
        getDaemonStatusPath: () => '/state/daemon.status.json',
        process: { kill },
        processStartTokenMatches: match,
        readDaemonWorkerStatus: undefined,
        readFile: read,
        safeParseJSON: safeParse,
      }
  const context = vm.createContext(bindings)
  new vm.Script(source).runInContext(context)
  const invoke = context[target ? 'q54' : 'readDaemonWorkerStatus']()
  const result = scenario.callerCatch
    ? await invoke.catch(() => null)
    : await invoke
  return {
    calls: JSON.parse(JSON.stringify(calls)),
    result: result === null ? null : JSON.parse(JSON.stringify(result)),
  }
}

test(
  'Target121 daemon-hub status-reader fixture and replay exports are frozen',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.status, 'case-owned-bounded-source-replay')
    assert.equal(
      selectArtifactPhase(
        expectedDescriptor(fixture.inputs.typedReportSnapshot),
        expectedDescriptor(fixture.inputs.sourceCoverageSnapshot),
      ).name,
      'legacy',
    )
    assert.equal(
      selectArtifactPhase(
        expectedDescriptor(fixture.inputs.postDaemonOwnerSnapshot.typedReport),
        expectedDescriptor(fixture.inputs.postDaemonOwnerSnapshot.sourceCoverage),
      ).name,
      'postDaemonOwner',
    )
    assert.throws(
      () =>
        selectArtifactPhase(
          expectedDescriptor(fixture.inputs.typedReportSnapshot),
          expectedDescriptor(fixture.inputs.postDaemonOwnerSnapshot.sourceCoverage),
        ),
      /unknown-or-hybrid-target121-proof-phase/,
    )
    assert.throws(
      () =>
        selectArtifactPhase(
          { bytes: 1, sha256: 'unknown' },
          { bytes: 2, sha256: 'unknown' },
        ),
      /unknown-or-hybrid-target121-proof-phase/,
    )
    assert.deepEqual(
      Object.keys(replayModule).sort(),
      [
        'TARGET121_DAEMON_HUB_STATUS_READER_EVIDENCE_IDS',
        'TARGET121_DAEMON_HUB_STATUS_READER_INPUT_FILES',
        'TARGET121_DAEMON_HUB_STATUS_READER_OUTPUT_FILES',
        'TARGET121_DAEMON_HUB_STATUS_READER_OWNER_OVERRIDES',
        'applyTarget121DaemonHubStatusReaderSourceRecovery',
        'buildTarget121DaemonHubStatusReaderOutput',
      ],
    )
    assert.deepEqual(TARGET121_DAEMON_HUB_STATUS_READER_INPUT_FILES, [
      {
        path: fixture.inputs.sourceFile.path,
        bytes: fixture.inputs.sourceFile.input.bytes,
        sha256: fixture.inputs.sourceFile.input.sha256,
      },
    ])
    assert.deepEqual(TARGET121_DAEMON_HUB_STATUS_READER_OUTPUT_FILES, [
      {
        path: fixture.inputs.sourceFile.path,
        bytes: fixture.inputs.sourceFile.output.bytes,
        sha256: fixture.inputs.sourceFile.output.sha256,
      },
    ])
    assert.deepEqual(TARGET121_DAEMON_HUB_STATUS_READER_OWNER_OVERRIDES, [
      {
        key: `${caseName}:18380`,
        targetIndex: 18380,
        paths: ['src/daemon/hub.tsx'],
        declarations: ['DaemonWorkerStatus', 'readDaemonWorkerStatus'],
        evidenceIds: TARGET121_DAEMON_HUB_STATUS_READER_EVIDENCE_IDS,
        behavior:
          TARGET121_DAEMON_HUB_STATUS_READER_OWNER_OVERRIDES[0].behavior,
      },
    ])
    assert.match(
      TARGET121_DAEMON_HUB_STATUS_READER_OWNER_OVERRIDES[0].behavior,
      /safe(?:ly)? parses[\s\S]*reused PID[\s\S]*u18378[\s\S]*not claimed/,
    )
    assert.deepEqual(fixture.expectedStrictEvolution, {
      before: { units: 40, residues: 421 },
      after: { units: 39, residues: 419 },
      removedIndices: [18380],
      removedAddedOwnerRows: 2,
    })
    readExact(
      artifactPath(fixture.inputs.producerReplayModule),
      fixture.inputs.producerReplayModule,
    )
    readExact(
      artifactPath(fixture.inputs.producerFixture),
      fixture.inputs.producerFixture,
    )
  },
)

test(
  'authenticated units pin the complete reader evolution and closed graph',
  { skip: !selected },
  () => {
    const baseline = readExact(
      artifactPath(fixture.inputs.baselineBundle),
      fixture.inputs.baselineBundle,
    )
    const target = readExact(
      artifactPath(fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
    )
    const ledger = JSON.parse(
      gunzipSync(
        readExact(
          artifactPath(fixture.inputs.structuralLedger),
          fixture.inputs.structuralLedger,
        ),
      ),
    )
    const baselineLedger = ledger.unmatchedBaseline.find(
      unit => unit.index === fixture.units.baseline.index,
    )
    assert.ok(baselineLedger)
    const targetLedger = ledger.regions.find(
      region => region.target?.index === fixture.units.target.index,
    )
    assert.equal(targetLedger.classification, 'unresolved')
    for (const key of [
      'index',
      'nodeType',
      'parseStatus',
      'start',
      'end',
      'tokenCount',
      'sourceHash',
      'coarseHash',
    ]) {
      assert.equal(baselineLedger[key], fixture.units.baseline[key])
      assert.equal(targetLedger.target[key], fixture.units.target[key])
    }
    assert.equal(fixture.units.baselinePrevious.end, fixture.units.baseline.start)
    assert.equal(fixture.units.targetPrevious.end, fixture.units.target.start)
    const previous = ledger.regions.find(
      region => region.target?.index === fixture.units.targetPrevious.index,
    )
    assert.equal(previous.classification, 'matched')
    assert.equal(previous.baselineUnitIndex, fixture.units.baselinePrevious.index)
    assert.equal(previous.pairReason, 'exact-scope-normalized-token-hash')
    for (const key of [
      'safeParser',
      'processStartTokenAsync',
      'processStartTokenMatches',
      'caller',
    ]) {
      const expected = fixture.units[key]
      const region = ledger.regions.find(
        candidate => candidate.target?.index === expected.index,
      )
      assert.equal(region.classification, 'matched')
      assert.equal(region.baselineUnitIndex, expected.baselineUnitIndex)
      assert.equal(region.pairReason, 'exact-scope-normalized-token-hash')
      assert.equal(region.target.sourceHash, expected.sourceHash)
    }
    const producer = ledger.regions.find(
      region => region.target?.index === fixture.units.producer.index,
    )
    assert.equal(producer.classification, 'unresolved')
    assert.equal(producer.target.sourceHash, fixture.units.producer.sourceHash)

    const baselineUnit = parseUnit(baseline, fixture.units.baseline)
    const targetUnit = parseUnit(target, fixture.units.target)
    const safeParserUnit = parseUnit(target, fixture.units.safeParser)
    const tokenHelperUnit = parseUnit(
      target,
      fixture.units.processStartTokenMatches,
    )
    const callerUnit = parseUnit(target, fixture.units.caller)
    const producerUnit = parseUnit(target, fixture.units.producer)
    statementAt(baselineUnit, fixture.bundleRegions.baselineReadTry)
    statementAt(targetUnit, fixture.bundleRegions.targetReadTry)
    statementAt(targetUnit, fixture.bundleRegions.targetProcStartDeclaration)
    statementAt(targetUnit, fixture.bundleRegions.targetMatchIf)
    for (const key of [
      'targetReadFileCall',
      'targetSafeParseCall',
      'targetProcStartConditional',
      'targetProcStartMemberOne',
      'targetProcStartMemberTwo',
      'targetMatchCall',
    ]) {
      nodeAtGlobal(targetUnit, fixture.bundleRegions[key])
    }
    nodeAtGlobal(safeParserUnit, fixture.bundleRegions.safeParserAssignment)
    nodeAtGlobal(callerUnit, fixture.bundleRegions.targetCallerCall)
    nodeAtGlobal(callerUnit, fixture.bundleRegions.targetCallerInnerCall)
    nodeAtGlobal(producerUnit, fixture.bundleRegions.producerProperty)
    assert.equal(tokenHelperUnit.node.body.body.length, 3)

    const reversed = reverseTargetDelta(targetUnit.node, baselineUnit.node)
    assert.deepEqual(
      canonicalDescriptor(reversed),
      fixture.wholeUnitProof.baselineAfterReversingDelta,
    )
    assert.deepEqual(
      canonicalDescriptor(reversed),
      canonicalDescriptor(baselineUnit.node),
    )
  },
)

test(
  'the bounded source candidate compiles to the target reader and caller',
  { skip: !selected },
  () => {
    const target = readExact(
      artifactPath(fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
    )
    const targetUnit = parseUnit(target, fixture.units.target)
    const callerUnit = parseUnit(target, fixture.units.caller)
    const raw = spawnSync(
      'git',
      ['show', `${fixture.sourceProvenance.commit}:${fixture.sourceProvenance.path}`],
      { cwd: gitEvidenceRepositoryRoot, encoding: null },
    )
    assert.equal(raw.status, 0, raw.stderr?.toString())
    assert.deepEqual(
      { chars: raw.stdout.toString().length, ...descriptor(raw.stdout) },
      fixture.inputs.sourceFile.input,
    )
    const tree = spawnSync(
      'git',
      [
        'ls-tree',
        fixture.sourceProvenance.commit,
        fixture.sourceProvenance.path,
        fixture.sourceProvenance.jsonPath,
        fixture.sourceProvenance.processPath,
      ],
      { cwd: gitEvidenceRepositoryRoot, encoding: 'utf8' },
    )
    assert.equal(tree.status, 0, tree.stderr)
    for (const object of [
      fixture.sourceProvenance.gitObject,
      fixture.sourceProvenance.jsonGitObject,
      fixture.sourceProvenance.processGitObject,
    ]) {
      assert.match(tree.stdout, new RegExp(`blob ${object}\\s`))
    }
    const recovered = buildTarget121DaemonHubStatusReaderOutput(
      raw.stdout.toString(),
    )
    assert.deepEqual(
      { chars: recovered.length, ...descriptor(recovered) },
      fixture.inputs.sourceFile.output,
    )
    const parsed = parseTypescript(recovered, fixture.inputs.sourceFile.path)
    const reader = namedStatement(
      parsed,
      'readDaemonWorkerStatus',
      'function',
    )
    const type = namedStatement(parsed, 'DaemonWorkerStatus', 'type')
    const caller = namedStatement(parsed, 'loadDaemonHubData', 'function')
    assertSourceRegion(parsed, type, fixture.sourceEvidence.outputType, 'type')
    assertSourceRegion(
      parsed,
      reader,
      fixture.sourceEvidence.outputReader,
      'reader',
    )
    assertSourceRegion(
      parsed,
      caller,
      fixture.sourceEvidence.outputCaller,
      'caller',
    )
    const typeMembers = type.type.members.map(member => ({
      name: member.name.getText(parsed.parsed),
      optional: Boolean(member.questionToken),
    }))
    assert.deepEqual(typeMembers, [
      { name: 'supervisorPid', optional: false },
      { name: 'supervisorProcStart', optional: true },
      { name: 'workers', optional: false },
    ])
    assertSourceRegion(
      parsed,
      namedImport(parsed, '../utils/genericProcessUtils.js'),
      fixture.sourceEvidence.outputGenericImport,
      'process import',
    )
    assertSourceRegion(
      parsed,
      namedImport(parsed, '../utils/json.js'),
      fixture.sourceEvidence.outputJsonImport,
      'json import',
    )
    const genericNames = namedImport(
      parsed,
      '../utils/genericProcessUtils.js',
    ).importClause.namedBindings.elements.map(element => element.name.text)
    assert.deepEqual(genericNames, ['processStartTokenMatches'])
    const jsonNames = namedImport(
      parsed,
      '../utils/json.js',
    ).importClause.namedBindings.elements.map(element => element.name.text)
    assert.deepEqual(jsonNames, ['safeParseJSON'])
    assert.equal(recovered.includes('import { parseJSON }'), false)

    const version = spawnSync(
      path.join(repositoryRoot, fixture.wholeUnitProof.compiler.path),
      ['--version'],
      { cwd: repositoryRoot, encoding: 'utf8' },
    )
    assert.equal(version.status, 0, version.stderr)
    assert.equal(version.stdout.trim(), fixture.wholeUnitProof.compiler.version)
    const compiled = compileWithFrozenBun(reader.getText(parsed.parsed))
    assert.deepEqual(
      descriptor(compiled),
      expectedDescriptor(fixture.wholeUnitProof.compiledDeclaration),
    )
    assert.equal(
      [...tokenizer(compiled, { ecmaVersion: 'latest' })].length,
      fixture.wholeUnitProof.compiledDeclaration.tokenCount,
    )
    const compiledNode = parse(compiled, { ecmaVersion: 'latest' }).body[0]
    assert.deepEqual(
      canonicalDescriptor(compiledNode),
      fixture.wholeUnitProof.targetCanonical,
    )
    assert.deepEqual(
      canonicalDescriptor(targetUnit.node),
      fixture.wholeUnitProof.targetCanonical,
    )

    const callerCalls = findTsNodes(
      parsed,
      node =>
        parsed.ts.isCallExpression(node) &&
        node.expression.getText(parsed.parsed) ===
          'readDaemonWorkerStatus().catch',
    )
    assert.equal(callerCalls.length, 1)
    assertSourceRegion(
      parsed,
      callerCalls[0],
      fixture.sourceEvidence.outputCallerCall,
      'caller call',
    )
    const callerSource = callerCalls[0].getText(parsed.parsed)
    assert.deepEqual(
      descriptor(callerSource),
      fixture.wholeUnitProof.callerSource,
    )
    const compiledCaller = compileWithFrozenBun(callerSource)
    assert.deepEqual(
      descriptor(compiledCaller),
      expectedDescriptor(fixture.wholeUnitProof.compiledCaller),
    )
    assert.equal(
      [...tokenizer(compiledCaller, { ecmaVersion: 'latest' })].length,
      fixture.wholeUnitProof.compiledCaller.tokenCount,
    )
    const compiledCallerNode = parse(compiledCaller, {
      ecmaVersion: 'latest',
    }).body[0].expression
    const targetCallerNode = nodeAtGlobal(
      callerUnit,
      fixture.bundleRegions.targetCallerCall,
    )
    assert.deepEqual(
      canonicalDescriptor(compiledCallerNode),
      fixture.wholeUnitProof.callerCanonical,
    )
    assert.deepEqual(
      canonicalDescriptor(targetCallerNode),
      fixture.wholeUnitProof.callerCanonical,
    )
  },
)

test(
  'source owner, retained dependencies, and replay are exact and idempotent',
  { skip: !selected },
  () => {
    const root = selectedSourceRoot()
    const sourceBytes = fs.readFileSync(
      sourceFilename(root, fixture.inputs.sourceFile.path),
    )
    const actual = descriptor(sourceBytes)
    const raw = actual.sha256 === fixture.inputs.sourceFile.input.sha256
    assert.deepEqual(
      actual,
      expectedDescriptor(
        raw ? fixture.inputs.sourceFile.input : fixture.inputs.sourceFile.output,
      ),
    )
    const parsed = parseTypescript(
      sourceBytes.toString(),
      fixture.inputs.sourceFile.path,
    )
    assertSourceRegion(
      parsed,
      namedStatement(parsed, 'DaemonWorkerStatus', 'type'),
      raw ? fixture.sourceEvidence.inputType : fixture.sourceEvidence.outputType,
      'selected type',
    )
    const reader = namedStatement(parsed, 'readDaemonWorkerStatus', 'function')
    assertSourceRegion(
      parsed,
      reader,
      raw
        ? fixture.sourceEvidence.inputReader
        : fixture.sourceEvidence.outputReader,
      'selected reader',
    )
    const readerText = reader.getText(parsed.parsed)
    assert.equal(readerText.includes('safeParseJSON'), !raw)
    assert.equal(readerText.includes('processStartTokenMatches'), !raw)
    assert.equal(readerText.includes('JSON.parse'), raw)
    const wrappedCalls = findTsNodes(
      parsed,
      node =>
        parsed.ts.isCallExpression(node) &&
        node.expression.getText(parsed.parsed) ===
          'readDaemonWorkerStatus().catch',
    )
    assert.equal(wrappedCalls.length, raw ? 0 : 1)
    if (!raw) {
      assertSourceRegion(
        parsed,
        wrappedCalls[0],
        fixture.sourceEvidence.outputCallerCall,
        'selected caller',
      )
    }

    const jsonBytes = readExact(
      sourceFilename(root, fixture.inputs.jsonDependency.path),
      fixture.inputs.jsonDependency,
    )
    const json = parseTypescript(
      jsonBytes.toString(),
      fixture.inputs.jsonDependency.path,
    )
    assertSourceRegion(
      json,
      namedStatement(json, 'safeParseJSON', 'variable'),
      fixture.sourceEvidence.safeParseJSON,
      'safe parser',
    )
    const processBytes = readExact(
      sourceFilename(root, fixture.inputs.processDependency.path),
      fixture.inputs.processDependency,
    )
    const processSource = parseTypescript(
      processBytes.toString(),
      fixture.inputs.processDependency.path,
    )
    assertSourceRegion(
      processSource,
      namedStatement(processSource, 'getProcessStartTokenAsync', 'function'),
      fixture.sourceEvidence.getProcessStartTokenAsync,
      'token lookup',
    )
    assertSourceRegion(
      processSource,
      namedStatement(processSource, 'processStartTokenMatches', 'function'),
      fixture.sourceEvidence.processStartTokenMatches,
      'token match',
    )
    readExact(
      artifactPath(fixture.inputs.dependencyCoverage),
      fixture.inputs.dependencyCoverage,
    )

    const temporary = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target121-daemon-hub-status-reader-'),
    )
    try {
      const temporarySource = path.join(temporary, 'daemon/hub.tsx')
      fs.mkdirSync(path.dirname(temporarySource), { recursive: true })
      const rawSource = spawnSync(
        'git',
        [
          'show',
          `${fixture.sourceProvenance.commit}:${fixture.sourceProvenance.path}`,
        ],
        { cwd: gitEvidenceRepositoryRoot, encoding: null },
      )
      assert.equal(rawSource.status, 0, rawSource.stderr?.toString())
      fs.writeFileSync(temporarySource, rawSource.stdout)
      assert.deepEqual(
        applyTarget121DaemonHubStatusReaderSourceRecovery({
          sourceRoot: temporary,
        }),
        { status: 'recovered', files: [fixture.inputs.sourceFile.path] },
      )
      assert.deepEqual(
        descriptor(fs.readFileSync(temporarySource)),
        expectedDescriptor(fixture.inputs.sourceFile.output),
      )
      assert.deepEqual(
        applyTarget121DaemonHubStatusReaderSourceRecovery({
          sourceRoot: temporary,
        }),
        { status: 'already-recovered', files: [] },
      )
      fs.appendFileSync(temporarySource, '\n// drift')
      assert.throws(
        () =>
          applyTarget121DaemonHubStatusReaderSourceRecovery({
            sourceRoot: temporary,
          }),
        /requires exact raw or recovered/,
      )
      assert.throws(
        () => buildTarget121DaemonHubStatusReaderOutput(null),
        /source must be a string/,
      )
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true })
    }
  },
)

test(
  'target and replayed readers have identical validation and failure behavior',
  { skip: !selected },
  async () => {
    const target = readExact(
      artifactPath(fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
    )
    const targetSource = target
      .subarray(fixture.units.target.start, fixture.units.target.end)
      .toString()
    const raw = spawnSync(
      'git',
      ['show', `${fixture.sourceProvenance.commit}:${fixture.sourceProvenance.path}`],
      { cwd: gitEvidenceRepositoryRoot, encoding: 'utf8' },
    ).stdout
    const recovered = buildTarget121DaemonHubStatusReaderOutput(raw)
    const parsed = parseTypescript(recovered, fixture.inputs.sourceFile.path)
    const compiled = compileWithFrozenBun(
      namedStatement(parsed, 'readDaemonWorkerStatus', 'function').getText(
        parsed.parsed,
      ),
    )
    const valid = {
      supervisorPid: 4242,
      supervisorProcStart: 'birth-token',
      workers: { assistant: { pid: 88, startedAt: 99 } },
    }
    const scenarios = [
      { raw: JSON.stringify(valid), match: true },
      {
        raw: JSON.stringify({ supervisorPid: 4242, workers: {} }),
        match: true,
      },
      { raw: JSON.stringify(valid), match: false },
      { raw: '{ malformed' },
      { raw: JSON.stringify({ supervisorPid: 4242, workers: null }) },
      { raw: JSON.stringify({ supervisorPid: 4242, workers: [] }) },
      { raw: JSON.stringify(valid), readError: true },
      { raw: JSON.stringify(valid), killError: true },
      {
        raw: JSON.stringify(valid),
        matchError: true,
        callerCatch: true,
      },
    ]
    for (const scenario of scenarios) {
      const targetResult = await runReader(targetSource, true, scenario)
      const sourceResult = await runReader(compiled, false, scenario)
      assert.deepEqual(sourceResult, targetResult)
    }
    const matching = await runReader(targetSource, true, scenarios[0])
    assert.deepEqual(matching.result, valid)
    assert.deepEqual(matching.calls.match, [[4242, 'birth-token']])
    const legacy = await runReader(targetSource, true, scenarios[1])
    assert.deepEqual(legacy.calls.match, [[4242, null]])
    assert.deepEqual(legacy.result, { supervisorPid: 4242, workers: {} })
    assert.equal(
      (await runReader(targetSource, true, scenarios[2])).result,
      null,
    )
    assert.deepEqual(
      (await runReader(targetSource, true, scenarios[3])).calls.kill,
      [],
    )
    assert.deepEqual(
      (await runReader(targetSource, true, scenarios[5])).result,
      { supervisorPid: 4242, workers: [] },
    )
  },
)

test(
  'typed rows and source coverage select exact legacy or post-daemon-owner phases',
  { skip: !selected },
  () => {
    const { name: phase, report, coverageRows } = readArtifactPhase()
    const addedOwner = report.sourceRuntimeAddedOwnerResidueRows
      .filter(row => row.structural.index === fixture.units.target.index)
      .map(rowTuple)
    const owner = report.sourceRuntimeOwnerResidueRows
      .filter(row => row.structural.index === fixture.units.target.index)
      .map(rowTuple)
    const reportRows = report.rows
      .filter(row => row.structural.index === fixture.units.target.index)
      .map(rowTuple)
    let raw = false
    let recovered = false
    if (phase === 'legacy') {
      raw =
        addedOwner.length === fixture.rows.addedOwner.count &&
        owner.length === fixture.rows.owner.count
      recovered =
        addedOwner.length === 0 &&
        owner.length === fixture.rows.recoveredOwner.count
      assert.ok(raw || recovered, 'legacy owner rows must be wholly raw or recovered')
      assert.equal(reportRows.length, fixture.rows.typedReportRows.count)
    }
    if (phase === 'legacy' && raw) {
      for (const [rows, expected] of [
        [addedOwner, fixture.rows.addedOwner],
        [owner, fixture.rows.owner],
      ]) {
        const actual = canonicalRows(rows)
        assert.equal(actual.count, expected.count)
        assert.equal(actual.bytes, expected.canonicalBytes)
        assert.equal(actual.sha256, expected.canonicalSha256)
      }
      assert.deepEqual(addedOwner, fixture.rows.productionStrict.tuples)
    } else if (phase === 'legacy') {
      const actual = canonicalRows(owner)
      assert.equal(actual.count, fixture.rows.recoveredOwner.count)
      assert.equal(actual.bytes, fixture.rows.recoveredOwner.canonicalBytes)
      assert.equal(actual.sha256, fixture.rows.recoveredOwner.canonicalSha256)
      assert.deepEqual(owner, fixture.rows.recoveredOwner.tuples)
    } else {
      for (const [rows, expected] of [
        [addedOwner, fixture.rows.postDaemonOwner.addedOwner],
        [owner, fixture.rows.postDaemonOwner.owner],
        [reportRows, fixture.rows.postDaemonOwner.productionStrict],
      ]) {
        const actual = canonicalRows(rows)
        assert.equal(actual.count, expected.count)
        assert.equal(actual.bytes, expected.canonicalBytes)
        assert.equal(actual.sha256, expected.canonicalSha256)
      }
      assert.deepEqual(
        reportRows,
        fixture.rows.postDaemonOwner.productionStrict.tuples,
      )
    }
    const target = fs.readFileSync(artifactPath(fixture.inputs.targetBundle))
    for (const tuple of fixture.rows.productionStrict.tuples) {
      assert.equal(target.subarray(tuple[3], tuple[4]).toString(), tuple[2])
    }

    assert.equal(coverageRows.length, 1)
    const coverageRow = coverageRows[0]
    const stale = coverageRow.ownerIds.includes(
      fixture.coverage.staleOwner.ownerIds[0],
    )
    const ownerRecovered =
      coverageRow.ownerIds.length === 1 &&
      coverageRow.ownerIds[0] === fixture.coverage.recoveredOwnerIds[0]
    assert.ok(stale || ownerRecovered)
    for (const key of [
      'targetIndex',
      'start',
      'end',
      'nodeType',
      'sourceHash',
      'structuralClass',
      'disposition',
    ]) {
      assert.equal(coverageRow[key], fixture.coverage.staleOwner[key])
    }
    if (stale) {
      assert.deepEqual(coverageRow.ownerIds, fixture.coverage.staleOwner.ownerIds)
      assert.deepEqual(
        coverageRow.evidenceIds,
        fixture.coverage.staleOwner.evidenceIds,
      )
    } else {
      assert.deepEqual(
        coverageRow.evidenceIds,
        TARGET121_DAEMON_HUB_STATUS_READER_EVIDENCE_IDS,
      )
      assert.equal(
        coverageRow.behavior,
        TARGET121_DAEMON_HUB_STATUS_READER_OWNER_OVERRIDES[0].behavior,
      )
    }
    if (phase === 'legacy') {
      assert.equal(raw, stale)
      assert.equal(recovered, ownerRecovered)
      assert.notDeepEqual(
        TARGET121_DAEMON_HUB_STATUS_READER_OWNER_OVERRIDES[0].paths,
        fixture.rows.productionStrict.tuples[0][9],
      )
    } else {
      assert.equal(stale, false)
      assert.equal(ownerRecovered, true)
      assert.deepEqual(
        coverageRow.ownerIds,
        fixture.coverage.postDaemonOwner.ownerIds,
      )
      assert.deepEqual(
        coverageRow.evidenceIds,
        fixture.coverage.postDaemonOwner.evidenceIds,
      )
      assert.deepEqual(
        TARGET121_DAEMON_HUB_STATUS_READER_OWNER_OVERRIDES[0].paths,
        fixture.rows.postDaemonOwner.productionStrict.tuples[0][9].map(
          ownerPath => `src/${ownerPath}`,
        ),
      )
    }
  },
)
