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
import * as replayModule from '../cases/2.1.120-to-2.1.121/recovered/replay-daemon-status-supervisor-proc-start-source-gap.mjs'
import {
  applyTarget121DaemonStatusProcStartSourceRecovery,
  buildTarget121DaemonStatusProcStartOutput,
  TARGET121_DAEMON_STATUS_PROC_START_EVIDENCE_IDS,
  TARGET121_DAEMON_STATUS_PROC_START_INPUT_FILES,
  TARGET121_DAEMON_STATUS_PROC_START_OUTPUT_FILES,
  TARGET121_DAEMON_STATUS_PROC_START_OWNER_OVERRIDES,
} from '../cases/2.1.120-to-2.1.121/recovered/replay-daemon-status-supervisor-proc-start-source-gap.mjs'

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
    './recovery-2.1.121-daemon-status-supervisor-proc-start-source-gap.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'ecb979016d34ba60cfe514979d1419dcc382f5c2f0a9ea90c681c2185cf75e4a'

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
      coverage: fixture.inputs.sourceCoverageAfterU17548,
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
    artifactPath(fixture.inputs.sourceCoverageAfterU17548),
  )
  const phase = selectArtifactPhase(
    descriptor(reportBytes),
    descriptor(coverageBytes),
  )
  const coverageRaw = gunzipSync(coverageBytes)
  const coverage = JSON.parse(coverageRaw)
  const coverageRows = coverage.rows.filter(
    row => row.targetIndex === fixture.units.target.index,
  )
  if (phase.name === 'postDaemonOwner') {
    const expected = fixture.inputs.postDaemonOwnerSnapshot.sourceCoverage
    assert.deepEqual(descriptor(coverageRaw), {
      bytes: expected.rawBytes,
      sha256: expected.rawSha256,
    })
    const projection = descriptor(Buffer.from(JSON.stringify(coverageRows)))
    assert.deepEqual({
      targetIndices: [...new Set(coverageRows.map(row => row.targetIndex))],
      count: coverageRows.length,
      canonicalBytes: projection.bytes,
      canonicalSha256: projection.sha256,
    }, expected.projection)
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

function namedFunction(parsed, name) {
  const matches = parsed.parsed.statements.filter(
    statement =>
      parsed.ts.isFunctionDeclaration(statement) &&
      statement.name?.text === name,
  )
  assert.equal(matches.length, 1, name)
  return matches[0]
}

function namedVariableStatement(parsed, name) {
  const matches = parsed.parsed.statements.filter(
    statement =>
      parsed.ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        declaration => declaration.name.getText(parsed.parsed) === name,
      ),
  )
  assert.equal(matches.length, 1, name)
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
  assert.deepEqual(sourceRegion(parsed, node), {
    charStart: expected.charStart,
    charEnd: expected.charEnd,
    byteStart: expected.byteStart,
    byteEnd: expected.byteEnd,
    ...expectedDescriptor(expected),
  }, label)
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
  assert.equal(program.body[0].type, expected.nodeType ?? 'FunctionDeclaration')
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
  assert.equal(found.type, expected.nodeType)
  const exact = parsed.source.slice(found.start, found.end)
  assert.deepEqual(descriptor(exact), expectedDescriptor(expected))
  if (expected.exact !== undefined) assert.equal(exact, expected.exact)
  return found
}

function propertyNames(object) {
  return object.properties.map(property => property.key.name ?? property.key.value)
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
    value.object.name === 'JSON' &&
    value.property?.name === 'stringify'
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

async function runWriter(source, target, token, failWrite = false) {
  const calls = []
  const write = async (...args) => {
    calls.push(args)
    if (failWrite) throw new Error('write failed')
  }
  const common = {
    Date: { now: () => 1_770_000_000_123 },
    JSON,
    process: { pid: 4242 },
  }
  const bindings = target
    ? {
        ...common,
        an: () => token,
        Cy6: () => '/state/daemon.status.json',
        H54: undefined,
        tL: write,
        yH: JSON.stringify,
      }
    : {
        ...common,
        getCurrentProcessStartToken: () => token,
        getDaemonStatusPath: () => '/state/daemon.status.json',
        writeDaemonStatus: undefined,
        writeFile: write,
      }
  const context = vm.createContext(bindings)
  new vm.Script(source).runInContext(context)
  const workers = { assistant: { pid: 88, startedAt: 99 } }
  const result = await context[target ? 'H54' : 'writeDaemonStatus'](workers)
  return {
    calls: JSON.parse(JSON.stringify(calls)),
    result,
  }
}

test(
  'Target121 daemon-status proc-start fixture and replay exports are frozen',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.equal(
      selectArtifactPhase(
        expectedDescriptor(fixture.inputs.typedReportSnapshot),
        expectedDescriptor(fixture.inputs.sourceCoverageAfterU17548),
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
      () => selectArtifactPhase({ bytes: 1, sha256: 'unknown' }, { bytes: 2, sha256: 'unknown' }),
      /unknown-or-hybrid-target121-proof-phase/,
    )
    assert.deepEqual(
      Object.keys(replayModule).sort(),
      [
        'TARGET121_DAEMON_STATUS_PROC_START_EVIDENCE_IDS',
        'TARGET121_DAEMON_STATUS_PROC_START_INPUT_FILES',
        'TARGET121_DAEMON_STATUS_PROC_START_OUTPUT_FILES',
        'TARGET121_DAEMON_STATUS_PROC_START_OWNER_OVERRIDES',
        'applyTarget121DaemonStatusProcStartSourceRecovery',
        'buildTarget121DaemonStatusProcStartOutput',
      ],
    )
    assert.deepEqual(TARGET121_DAEMON_STATUS_PROC_START_INPUT_FILES, [
      {
        path: fixture.inputs.sourceFile.path,
        bytes: fixture.inputs.sourceFile.input.bytes,
        sha256: fixture.inputs.sourceFile.input.sha256,
      },
    ])
    assert.deepEqual(TARGET121_DAEMON_STATUS_PROC_START_OUTPUT_FILES, [
      {
        path: fixture.inputs.sourceFile.path,
        bytes: fixture.inputs.sourceFile.output.bytes,
        sha256: fixture.inputs.sourceFile.output.sha256,
      },
    ])
    assert.equal(TARGET121_DAEMON_STATUS_PROC_START_OWNER_OVERRIDES.length, 1)
    assert.deepEqual(
      TARGET121_DAEMON_STATUS_PROC_START_OWNER_OVERRIDES[0],
      {
        key: `${caseName}:18378`,
        targetIndex: fixture.units.target.index,
        paths: [fixture.inputs.sourceFile.path],
        declarations: ['writeDaemonStatus'],
        evidenceIds: TARGET121_DAEMON_STATUS_PROC_START_EVIDENCE_IDS,
        behavior:
          TARGET121_DAEMON_STATUS_PROC_START_OWNER_OVERRIDES[0].behavior,
      },
    )
    assert.match(
      TARGET121_DAEMON_STATUS_PROC_START_OWNER_OVERRIDES[0].behavior,
      /downstream status reader.*separate structural unit/,
    )
  },
)

test(
  'authenticated units pin the writer evolution, retained token helper, and caller',
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
    for (const key of [
      'nodeType',
      'parseStatus',
      'start',
      'end',
      'tokenCount',
      'sourceHash',
      'coarseHash',
    ]) {
      assert.equal(baselineLedger[key], fixture.units.baseline[key])
    }
    const targetLedger = ledger.regions.find(
      region => region.target?.index === fixture.units.target.index,
    )
    assert.equal(targetLedger.classification, 'unresolved')
    for (const key of [
      'nodeType',
      'parseStatus',
      'start',
      'end',
      'tokenCount',
      'sourceHash',
      'coarseHash',
    ]) {
      assert.equal(targetLedger.target[key], fixture.units.target[key])
    }

    for (const [targetKey, baselineKey] of [
      ['targetPrevious', 'baselinePrevious'],
      ['targetNext', 'baselineNext'],
    ]) {
      const targetUnit = fixture.units[targetKey]
      const baselineUnit = fixture.units[baselineKey]
      const region = ledger.regions.find(
        candidate => candidate.target?.index === targetUnit.index,
      )
      assert.equal(region.classification, 'matched')
      assert.equal(region.baselineUnitIndex, baselineUnit.index)
      assert.equal(region.pairReason, 'exact-scope-normalized-token-hash')
      assert.deepEqual(
        descriptor(target.subarray(targetUnit.start, targetUnit.end)),
        expectedDescriptor(targetUnit),
      )
      assert.deepEqual(
        descriptor(baseline.subarray(baselineUnit.start, baselineUnit.end)),
        expectedDescriptor(baselineUnit),
      )
    }
    assert.equal(
      fixture.units.baselinePrevious.end,
      fixture.units.baseline.start,
    )
    assert.equal(fixture.units.baseline.end, fixture.units.baselineNext.start)
    assert.equal(fixture.units.targetPrevious.end, fixture.units.target.start)
    assert.equal(fixture.units.target.end, fixture.units.targetNext.start)

    for (const key of [
      'processStartToken',
      'currentProcessStartToken',
      'currentProcessStartTokenCache',
    ]) {
      const expected = fixture.units[key]
      const region = ledger.regions.find(
        candidate => candidate.target?.index === expected.index,
      )
      assert.equal(region.classification, 'matched')
      assert.equal(region.baselineUnitIndex, expected.baselineUnitIndex)
      assert.equal(region.target.sourceHash, expected.sourceHash)
      assert.deepEqual(
        descriptor(target.subarray(expected.start, expected.end)),
        expectedDescriptor(expected),
      )
    }
    const callerRegion = ledger.regions.find(
      candidate => candidate.target?.index === fixture.units.caller.index,
    )
    assert.equal(callerRegion.classification, 'unresolved')
    assert.equal(callerRegion.target.sourceHash, fixture.units.caller.sourceHash)

    const baselineUnit = parseUnit(baseline, fixture.units.baseline)
    const targetUnit = parseUnit(target, fixture.units.target)
    const callerUnit = parseUnit(target, {
      ...fixture.units.caller,
      nodeType: 'FunctionDeclaration',
    })
    const baselineObject = nodeAtGlobal(
      baselineUnit,
      fixture.bundleRegions.baselineStatusObject,
    )
    const targetObject = nodeAtGlobal(
      targetUnit,
      fixture.bundleRegions.targetStatusObject,
    )
    assert.deepEqual(propertyNames(baselineObject), [
      'supervisorPid',
      'writtenAt',
      'workers',
    ])
    assert.deepEqual(propertyNames(targetObject), [
      'supervisorPid',
      'supervisorProcStart',
      'writtenAt',
      'workers',
    ])
    nodeAtGlobal(
      targetUnit,
      fixture.bundleRegions.targetSupervisorProcStartProperty,
    )
    nodeAtGlobal(targetUnit, fixture.bundleRegions.targetCurrentTokenCall)
    const targetWrite = nodeAtGlobal(
      targetUnit,
      fixture.bundleRegions.targetWriteCall,
    )
    nodeAtGlobal(baselineUnit, fixture.bundleRegions.baselineWriteTry)
    nodeAtGlobal(callerUnit, fixture.bundleRegions.targetCallerCall)
    assert.equal(targetUnit.node.body.body.length, 2)
    assert.equal(targetWrite.arguments.length, 2)
    assert.equal(
      baselineUnit.source.includes('.tmp.${process.pid}'),
      true,
    )
    assert.equal(baselineUnit.source.includes('.rename('), true)
    assert.equal(targetUnit.source.includes('.tmp.'), false)
    assert.equal(targetUnit.source.includes('.rename('), false)
  },
)

test(
  'the exact source candidate transpiles to the complete Target121 writer unit',
  { skip: !selected },
  () => {
    const target = readExact(
      artifactPath(fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
    )
    const targetUnit = parseUnit(target, fixture.units.target)
    const raw = spawnSync(
      'git',
      [
        'show',
        `${fixture.sourceProvenance.commit}:${fixture.sourceProvenance.path}`,
      ],
      { cwd: gitEvidenceRepositoryRoot, encoding: null },
    )
    assert.equal(raw.status, 0, raw.stderr?.toString())
    assert.deepEqual(
      descriptor(raw.stdout),
      expectedDescriptor(fixture.inputs.sourceFile.input),
    )
    const tree = spawnSync(
      'git',
      [
        'ls-tree',
        fixture.sourceProvenance.commit,
        fixture.sourceProvenance.path,
        fixture.sourceProvenance.dependencyPath,
      ],
      { cwd: gitEvidenceRepositoryRoot, encoding: 'utf8' },
    )
    assert.equal(tree.status, 0, tree.stderr)
    assert.match(tree.stdout, new RegExp(`blob ${fixture.sourceProvenance.gitObject}\\s`))
    assert.match(
      tree.stdout,
      new RegExp(`blob ${fixture.sourceProvenance.dependencyGitObject}\\s`),
    )

    const recovered = buildTarget121DaemonStatusProcStartOutput(
      raw.stdout.toString(),
    )
    assert.deepEqual(
      { chars: recovered.length, ...descriptor(recovered) },
      fixture.inputs.sourceFile.output,
    )
    const parsed = parseTypescript(recovered, fixture.inputs.sourceFile.path)
    const declaration = namedFunction(parsed, 'writeDaemonStatus')
    assertSourceRegion(
      parsed,
      declaration,
      fixture.sourceEvidence.outputDeclaration,
      'recovered writer',
    )
    assert.deepEqual(
      descriptor(declaration.getText(parsed.parsed)),
      fixture.wholeUnitProof.candidateDeclaration,
    )
    const imports = parsed.parsed.statements.filter(
      statement =>
        parsed.ts.isImportDeclaration(statement) &&
        statement.moduleSpecifier.text === '../utils/genericProcessUtils.js',
    )
    assert.equal(imports.length, 1)
    assertSourceRegion(
      parsed,
      imports[0],
      fixture.sourceEvidence.outputImport,
      'recovered import',
    )
    assert.deepEqual(
      imports[0].importClause.namedBindings.elements.map(element =>
        element.name.getText(parsed.parsed),
      ),
      ['getCurrentProcessStartToken', 'getProcessStartTokenAsync'],
    )

    const version = spawnSync(
      path.join(repositoryRoot, fixture.wholeUnitProof.compiler.path),
      ['--version'],
      { cwd: repositoryRoot, encoding: 'utf8' },
    )
    assert.equal(version.status, 0, version.stderr)
    assert.equal(version.stdout.trim(), fixture.wholeUnitProof.compiler.version)
    const compiled = compileWithFrozenBun(declaration.getText(parsed.parsed))
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
  },
)

test(
  'source owner, retained dependency, and fail-closed replay are exact and idempotent',
  { skip: !selected },
  () => {
    const root = selectedSourceRoot()
    const sourceBytes = fs.readFileSync(
      sourceFilename(root, fixture.inputs.sourceFile.path),
    )
    const actual = descriptor(sourceBytes)
    const raw =
      actual.sha256 === fixture.inputs.sourceFile.input.sha256
    const expected = raw
      ? fixture.inputs.sourceFile.input
      : fixture.inputs.sourceFile.output
    assert.deepEqual(actual, expectedDescriptor(expected))
    const parsed = parseTypescript(
      sourceBytes.toString(),
      fixture.inputs.sourceFile.path,
    )
    const declaration = namedFunction(parsed, 'writeDaemonStatus')
    assertSourceRegion(
      parsed,
      declaration,
      raw
        ? fixture.sourceEvidence.inputDeclaration
        : fixture.sourceEvidence.outputDeclaration,
      'selected writer',
    )
    const callNodes = []
    const findCalls = node => {
      if (
        parsed.ts.isCallExpression(node) &&
        node.expression.getText(parsed.parsed) === 'writeDaemonStatus'
      ) {
        callNodes.push(node)
      }
      parsed.ts.forEachChild(node, findCalls)
    }
    findCalls(parsed.parsed)
    assert.equal(callNodes.length, 1)
    assertSourceRegion(
      parsed,
      callNodes[0],
      raw ? fixture.sourceEvidence.inputCaller : fixture.sourceEvidence.outputCaller,
      'writer caller',
    )
    const selectedText = declaration.getText(parsed.parsed)
    assert.equal(selectedText.includes('supervisorProcStart'), !raw)
    assert.equal(selectedText.includes('temporary'), raw)
    assert.equal(selectedText.includes('rename(temporary'), raw)

    const dependencyBytes = readExact(
      sourceFilename(root, fixture.inputs.dependencyFile.path),
      fixture.inputs.dependencyFile,
    )
    assert.equal(
      dependencyBytes.toString().length,
      fixture.inputs.dependencyFile.chars,
    )
    const dependency = parseTypescript(
      dependencyBytes.toString(),
      fixture.inputs.dependencyFile.path,
    )
    assertSourceRegion(
      dependency,
      namedFunction(dependency, 'getProcessStartToken'),
      fixture.sourceEvidence.processStartTokenDeclaration,
      'process token helper',
    )
    assertSourceRegion(
      dependency,
      namedVariableStatement(dependency, 'currentProcessStartToken'),
      fixture.sourceEvidence.currentProcessStartTokenCache,
      'current token cache',
    )
    assertSourceRegion(
      dependency,
      namedFunction(dependency, 'getCurrentProcessStartToken'),
      fixture.sourceEvidence.currentProcessStartTokenDeclaration,
      'current token helper',
    )

    const temporary = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target121-daemon-status-proc-start-'),
    )
    const temporarySource = path.join(temporary, 'daemon/main.ts')
    fs.mkdirSync(path.dirname(temporarySource), { recursive: true })
    fs.writeFileSync(
      temporarySource,
      spawnSync(
        'git',
        [
          'show',
          `${fixture.sourceProvenance.commit}:${fixture.sourceProvenance.path}`,
        ],
        { cwd: gitEvidenceRepositoryRoot, encoding: null },
      ).stdout,
    )
    assert.deepEqual(
      applyTarget121DaemonStatusProcStartSourceRecovery({
        sourceRoot: temporary,
      }),
      { status: 'recovered', files: [fixture.inputs.sourceFile.path] },
    )
    assert.deepEqual(
      descriptor(fs.readFileSync(temporarySource)),
      expectedDescriptor(fixture.inputs.sourceFile.output),
    )
    assert.deepEqual(
      applyTarget121DaemonStatusProcStartSourceRecovery({
        sourceRoot: temporary,
      }),
      { status: 'already-recovered', files: [] },
    )
    fs.appendFileSync(temporarySource, '\n// drift')
    assert.throws(
      () =>
        applyTarget121DaemonStatusProcStartSourceRecovery({
          sourceRoot: temporary,
        }),
      /requires exact raw or recovered/,
    )
    assert.throws(
      () => buildTarget121DaemonStatusProcStartOutput(null),
      /source must be a string/,
    )
  },
)

test(
  'target and replayed writers have identical direct-write runtime behavior',
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
      [
        'show',
        `${fixture.sourceProvenance.commit}:${fixture.sourceProvenance.path}`,
      ],
      { cwd: gitEvidenceRepositoryRoot, encoding: 'utf8' },
    ).stdout
    const recovered = buildTarget121DaemonStatusProcStartOutput(raw)
    const parsed = parseTypescript(recovered, fixture.inputs.sourceFile.path)
    const compiled = compileWithFrozenBun(
      namedFunction(parsed, 'writeDaemonStatus').getText(parsed.parsed),
    )
    for (const token of ['linux-birth-token', undefined]) {
      const targetResult = await runWriter(targetSource, true, token)
      const sourceResult = await runWriter(compiled, false, token)
      assert.deepEqual(sourceResult, targetResult)
      assert.equal(targetResult.calls.length, 1)
      assert.equal(targetResult.calls[0].length, 2)
      assert.equal(targetResult.calls[0][0], '/state/daemon.status.json')
      const status = JSON.parse(targetResult.calls[0][1])
      assert.equal(status.supervisorPid, 4242)
      assert.equal(status.writtenAt, 1_770_000_000_123)
      assert.deepEqual(status.workers, {
        assistant: { pid: 88, startedAt: 99 },
      })
      if (token === undefined) {
        assert.equal('supervisorProcStart' in status, false)
      } else {
        assert.equal(status.supervisorProcStart, token)
      }
    }
    assert.deepEqual(
      await runWriter(targetSource, true, 'token', true),
      await runWriter(compiled, false, 'token', true),
    )
  },
)

test(
  'typed rows and coverage select exact legacy or post-daemon-owner phases',
  { skip: !selected },
  () => {
    const { name: phase, report, coverageRows } = readArtifactPhase()
    const addedOwner = report.sourceRuntimeAddedOwnerResidueRows
      .filter(row => row.structural.index === fixture.units.target.index)
      .map(rowTuple)
    const owner = report.sourceRuntimeOwnerResidueRows
      .filter(row => row.structural.index === fixture.units.target.index)
      .map(rowTuple)
    const strict = report.rows
      .filter(row => row.structural.index === fixture.units.target.index)
      .map(rowTuple)
    if (phase === 'legacy') {
      const recovered =
        addedOwner.length === 0 && owner.length === 0 && strict.length === 0
      const raw =
        addedOwner.length === fixture.rows.addedOwner.count &&
        owner.length === fixture.rows.owner.count &&
        strict.length === fixture.rows.strict.count
      assert.ok(raw || recovered, 'legacy typed rows must be wholly raw or recovered')
      if (raw) {
        for (const [rows, expected] of [
          [addedOwner, fixture.rows.addedOwner],
          [owner, fixture.rows.owner],
          [strict, fixture.rows.strict],
        ]) {
          const actual = canonicalRows(rows)
          assert.equal(actual.count, expected.count)
          assert.equal(actual.bytes, expected.canonicalBytes)
          assert.equal(actual.sha256, expected.canonicalSha256)
        }
        assert.deepEqual(strict, fixture.rows.strict.tuples)
      }
    } else {
      for (const [rows, expected] of [
        [addedOwner, fixture.rows.postDaemonOwner.addedOwner],
        [owner, fixture.rows.postDaemonOwner.owner],
        [strict, fixture.rows.postDaemonOwner.strict],
      ]) {
        const actual = canonicalRows(rows)
        assert.equal(actual.count, expected.count)
        assert.equal(actual.bytes, expected.canonicalBytes)
        assert.equal(actual.sha256, expected.canonicalSha256)
      }
      assert.deepEqual(strict, fixture.rows.postDaemonOwner.strict.tuples)
      assert.equal(coverageRows.length, 1)
      assert.deepEqual(coverageRows[0].ownerIds, ['owner-src-daemon-main-ts'])
      assert.deepEqual(
        coverageRows[0].evidenceIds,
        TARGET121_DAEMON_STATUS_PROC_START_EVIDENCE_IDS,
      )
    }
    const literal = (phase === 'postDaemonOwner'
      ? fixture.rows.postDaemonOwner.strict
      : fixture.rows.strict).tuples[0]
    const target = fs.readFileSync(artifactPath(fixture.inputs.targetBundle))
    assert.equal(target.subarray(literal[3], literal[4]).toString(), literal[2])
    assert.deepEqual(
      TARGET121_DAEMON_STATUS_PROC_START_OWNER_OVERRIDES[0].paths,
      ['src/daemon/main.ts'],
    )
    if (phase === 'legacy') {
      assert.notDeepEqual(
        TARGET121_DAEMON_STATUS_PROC_START_OWNER_OVERRIDES[0].paths,
        literal[9],
      )
    } else {
      assert.deepEqual(
        TARGET121_DAEMON_STATUS_PROC_START_OWNER_OVERRIDES[0].paths,
        literal[9].map(owner => `src/${owner}`),
      )
    }
  },
)
