import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  applyTarget119RemoteBridgeTeardownDisposalSourceRecovery,
  buildTarget119RemoteBridgeTeardownDisposalOutput,
  TARGET119_REMOTE_BRIDGE_TEARDOWN_DISPOSAL_INPUT_FILE,
  TARGET119_REMOTE_BRIDGE_TEARDOWN_DISPOSAL_OUTPUT_FILE,
  TARGET119_REMOTE_BRIDGE_TEARDOWN_DISPOSAL_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/replay-remote-bridge-teardown-disposal-source-gap.mjs'

const root = process.cwd()
const caseName = '2.1.118-to-2.1.119'
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-remote-bridge-teardown-disposal-source-gap.json',
)
const fixture = JSON.parse(fs.readFileSync(fixturePath))
const artifactRoot = path.join(root, '.recovery-tmp/authenticated-artifacts')
const selectedSourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src'),
)

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(
    descriptor(bytes),
    { bytes: expected.bytes, sha256: expected.sha256 },
    label,
  )
  return bytes
}

function rawSource() {
  const result = spawnSync(
    'git',
    ['show', `${fixture.sourceCommit}:${fixture.sourceFile.path}`],
    { cwd: root, encoding: null },
  )
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), fixture.sourceFile.input)
  return result.stdout.toString('utf8')
}

function materialize(source) {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target119-remote-bridge-teardown-'),
  )
  const sourceRoot = path.join(temporary, 'src')
  const filename = path.join(
    sourceRoot,
    fixture.sourceFile.path.replace(/^src\//, ''),
  )
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, source)
  return { temporary, sourceRoot, filename }
}

let typescriptPromise
function loadTypeScript() {
  typescriptPromise ??= import(
    pathToFileURL(
      path.join(
        root,
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      ),
    ).href,
  ).then(imported => imported.default ?? imported)
  return typescriptPromise
}

function findFunction(ts, parsed, name) {
  const hits = []
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      hits.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  assert.equal(hits.length, 1, `${name}: sole function declaration`)
  return hits[0]
}

function findNestedFunction(ts, rootNode, name) {
  const hits = []
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      hits.push(node)
    }
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(rootNode, visit)
  assert.equal(hits.length, 1, `${name}: sole nested function declaration`)
  return hits[0]
}

function callName(ts, node, parsed) {
  if (!ts.isCallExpression(node)) return null
  return node.expression.getText(parsed)
}

function sourceAnalysis(ts, text) {
  const parsed = ts.createSourceFile(
    'remoteBridgeCore.ts',
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(parsed.parseDiagnostics.length, 0)
  const declaration = findFunction(ts, parsed, 'initEnvLessBridgeCore')
  const declarationText = text.slice(
    declaration.getStart(parsed),
    declaration.end,
  )
  assert.deepEqual(
    {
      name: declaration.name.text,
      start: declaration.getStart(parsed),
      end: declaration.end,
      ...descriptor(declarationText),
    },
    fixture.sourceFile.outputDeclaration,
  )

  const performTeardown = findNestedFunction(
    ts,
    declaration,
    'performTeardown',
  )
  const teardownText = performTeardown.getText(parsed)
  assert.match(teardownText, /const timeoutMs = cfg\.teardown_archive_timeout_ms/)
  assert.match(teardownText, /const startedAt = Date\.now\(\)/)
  assert.match(
    teardownText,
    /const remainingMs = timeoutMs - \(Date\.now\(\) - startedAt\)/,
  )
  assert.match(
    teardownText,
    /status === 401 && onAuth401 && remainingMs >= 200/,
  )
  assert.match(
    teardownText,
    /await Promise\.race\(\[onAuth401\(token \?\? ''\), sleep\(remainingMs\)\]\)/,
  )
  assert.match(
    teardownText,
    /Math\.max\(1, timeoutMs - \(Date\.now\(\) - startedAt\)\)/,
  )

  const teardownCalls = []
  function visitTeardown(node) {
    if (ts.isCallExpression(node)) teardownCalls.push(callName(ts, node, parsed))
    ts.forEachChild(node, visitTeardown)
  }
  visitTeardown(performTeardown)
  assert.equal(
    teardownCalls.filter(name => name === 'unregister').length,
    2,
    'cleanup unregisters on skip-archive and normal completion',
  )
  assert.equal(
    teardownCalls.filter(name => name === 'sleep').length,
    1,
    'OAuth refresh is bounded by the existing sleep dependency',
  )

  const handleDeclarations = []
  function visitHandle(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(parsed) === 'handle'
    ) {
      handleDeclarations.push(node)
    }
    ts.forEachChild(node, visitHandle)
  }
  visitHandle(declaration)
  assert.equal(handleDeclarations.length, 1)
  const handle = handleDeclarations[0]
  assert(ts.isObjectLiteralExpression(handle.initializer))
  const teardownProperties = handle.initializer.properties.filter(
    property => property.name?.getText(parsed) === 'teardown',
  )
  assert.equal(teardownProperties.length, 1)
  assert(ts.isShorthandPropertyAssignment(teardownProperties[0]))
  const disposers = handle.initializer.properties.filter(
    property => property.name?.getText(parsed) === '[Symbol.asyncDispose]',
  )
  assert.equal(disposers.length, 1)
  assert(ts.isMethodDeclaration(disposers[0]))
  assert.equal(
    disposers[0].body.getText(parsed),
    '{\n      return handle.teardown()\n    }',
  )
  const returnedHandles = []
  function visitReturns(node) {
    if (
      ts.isReturnStatement(node) &&
      node.expression?.getText(parsed) === 'handle'
    ) {
      returnedHandles.push(node)
    }
    ts.forEachChild(node, visitReturns)
  }
  visitReturns(declaration)
  assert.equal(returnedHandles.length, 1)

  const importBindings = new Map()
  for (const statement of parsed.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    const moduleName = statement.moduleSpecifier.text
    for (const element of statement.importClause?.namedBindings?.elements ?? []) {
      importBindings.set(element.name.text, moduleName)
    }
  }
  assert.equal(importBindings.get('sleep'), '../utils/sleep.js')
  assert.equal(
    importBindings.get('registerCleanup'),
    '../utils/cleanupRegistry.js',
  )

  return { parsed, declaration, performTeardown }
}

function buildArchiveRetryRunner(ts, text) {
  const analysis = sourceAnalysis(ts, text)
  const statements = analysis.performTeardown.body.statements
  const first = statements.findIndex(
    statement =>
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        declaration => declaration.name.getText(analysis.parsed) === 'timeoutMs',
      ),
  )
  const last = statements.findIndex(
    (statement, index) =>
      index > first &&
      ts.isIfStatement(statement) &&
      statement.expression.getText(analysis.parsed).includes(
        'remainingMs >= 200',
      ),
  )
  assert(first >= 0)
  assert(last > first)
  const fragment = text.slice(
    statements[first].getStart(analysis.parsed),
    statements[last].end,
  )
  const harness = `async function run({
    cfg,
    Date,
    getAccessToken,
    archiveSession,
    sessionId,
    baseUrl,
    orgUUID,
    onAuth401,
    sleep,
    logForDebugging,
    errorMessage,
  }) {
${fragment}
    return { status, remainingMs }
  }`
  const javascript = ts.transpileModule(harness, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText
  return Function(`${javascript}; return run`)()
}

test('Target119 remote-bridge fixture, override, and coverage are atomic', () => {
  assert.equal(fixture.case, caseName)
  assert.deepEqual(TARGET119_REMOTE_BRIDGE_TEARDOWN_DISPOSAL_INPUT_FILE, {
    path: fixture.sourceFile.path,
    ...fixture.sourceFile.input,
  })
  assert.deepEqual(TARGET119_REMOTE_BRIDGE_TEARDOWN_DISPOSAL_OUTPUT_FILE, {
    path: fixture.sourceFile.path,
    ...fixture.sourceFile.output,
  })
  assert.equal(
    sha256(JSON.stringify([fixture.targetUnit.targetIndex])),
    fixture.summary.targetIndicesSha256,
  )
  assert.equal(
    sha256(JSON.stringify(fixture.residues)),
    fixture.summary.residueIdentitiesSha256,
  )

  const exact = TARGET119_REMOTE_BRIDGE_TEARDOWN_DISPOSAL_OWNER_OVERRIDES[0]
  assert.equal(exact.key, `${caseName}:${fixture.targetUnit.targetIndex}`)
  assert.deepEqual(exact.paths, [fixture.sourceFile.path])
  assert.deepEqual(exact.declarations, [fixture.sourceFile.outputDeclaration.name])

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
  const row = coverage.rows.find(
    candidate => candidate.targetIndex === fixture.targetUnit.targetIndex,
  )
  assert(row)
  const ownerPaths = row.ownerIds.map(ownerId => {
    const owner = coverage.owners.find(candidate => candidate.id === ownerId)
    assert(owner)
    return owner.path
  })
  const matchedEvidence = row.evidenceIds.filter(id =>
    exact.evidenceIds.includes(id),
  )
  assert(
    matchedEvidence.length === 0 ||
      matchedEvidence.length === exact.evidenceIds.length,
    'coverage cannot partially apply the teardown/disposal proof',
  )
  if (matchedEvidence.length > 0) {
    assert.deepEqual(ownerPaths, exact.paths)
    assert.deepEqual(row.evidenceIds, exact.evidenceIds)
    assert.equal(row.behavior, exact.behavior)
  } else {
    assert.deepEqual(ownerPaths, [fixture.sourceFile.path])
  }

  const reportPath = path.join(
    root,
    '.recovery-tmp/residue-audits/2.1.118-to-2.1.119.typed-audit.json',
  )
  if (fs.existsSync(reportPath)) {
    const report = JSON.parse(fs.readFileSync(reportPath))
    const live = report.sourceRuntimeAddedOwnerResidueRows
      .filter(residue => residue.structural.index === fixture.targetUnit.targetIndex)
      .map(residue => [
        residue.structural.index,
        residue.literalKind,
        residue.value,
        residue.target.start,
        residue.target.end,
        residue.baselineOccurrenceCount,
        residue.targetOccurrenceNumber,
      ])
    assert(
      live.length === 0 ||
        JSON.stringify(live) === JSON.stringify(fixture.residues),
      'typed audit must expose the exact frozen pre-replay rows or the complete corrected state',
    )
  }
})

test('complete authenticated Target118/119 bridge units retain the teardown contract', () => {
  const baseline = readExact(
    path.join(artifactRoot, fixture.inputs.baselineBundle.artifact),
    fixture.inputs.baselineBundle,
    'Target118 inner bundle',
  ).toString('utf8')
  const target = readExact(
    path.join(artifactRoot, fixture.inputs.targetBundle.artifact),
    fixture.inputs.targetBundle,
    'Target119 inner bundle',
  ).toString('utf8')
  const structural = JSON.parse(
    gunzipSync(
      readExact(
        path.join(root, fixture.inputs.structural.path),
        fixture.inputs.structural,
        'Target119 structural delta',
      ),
    ),
  )
  const region = structural.regions.find(
    candidate => candidate.target.index === fixture.targetUnit.targetIndex,
  )
  assert(region)
  assert.deepEqual(
    {
      nodeType: region.target.nodeType,
      start: region.target.start,
      end: region.target.end,
      tokenCount: region.target.tokenCount,
      sourceHash: region.target.sourceHash,
      coarseHash: region.target.coarseHash,
    },
    {
      nodeType: fixture.targetUnit.nodeType,
      start: fixture.targetUnit.start,
      end: fixture.targetUnit.end,
      tokenCount: fixture.targetUnit.tokenCount,
      sourceHash: fixture.targetUnit.sourceHash,
      coarseHash: fixture.targetUnit.coarseHash,
    },
  )
  assert.equal(region.classification, 'unresolved')
  const unmatchedBaseline = structural.unmatchedBaseline.find(
    candidate => candidate.index === fixture.baselineUnit.targetIndex,
  )
  assert(unmatchedBaseline)
  assert.deepEqual(
    {
      nodeType: unmatchedBaseline.nodeType,
      start: unmatchedBaseline.start,
      end: unmatchedBaseline.end,
      tokenCount: unmatchedBaseline.tokenCount,
      sourceHash: unmatchedBaseline.sourceHash,
      coarseHash: unmatchedBaseline.coarseHash,
    },
    {
      nodeType: fixture.baselineUnit.nodeType,
      start: fixture.baselineUnit.start,
      end: fixture.baselineUnit.end,
      tokenCount: fixture.baselineUnit.tokenCount,
      sourceHash: fixture.baselineUnit.sourceHash,
      coarseHash: fixture.baselineUnit.coarseHash,
    },
  )

  const baselineUnit = baseline.slice(
    fixture.baselineUnit.start,
    fixture.baselineUnit.end,
  )
  const targetUnit = target.slice(
    fixture.targetUnit.start,
    fixture.targetUnit.end,
  )
  assert.deepEqual(descriptor(baselineUnit), {
    bytes: fixture.baselineUnit.bytes,
    sha256: fixture.baselineUnit.sourceHash,
  })
  assert.deepEqual(descriptor(targetUnit), {
    bytes: fixture.targetUnit.bytes,
    sha256: fixture.targetUnit.sourceHash,
  })
  for (const unit of [baselineUnit, targetUnit]) {
    const ast = parse(unit, { ecmaVersion: 'latest', sourceType: 'module' })
    assert.equal(ast.body.length, 1)
    assert.equal(ast.body[0].type, 'FunctionDeclaration')
    assert.match(unit, /teardown_archive_timeout_ms/)
    assert.match(unit, />=200/)
    assert.match(unit, /Promise\.race\(/)
    assert.match(unit, /Math\.max\(1,/)
    assert.match(unit, /\[Symbol\.asyncDispose\]\(\)/)
    assert.match(unit, /\.teardown\(\)/)
  }

  for (const fragment of Object.values(fixture.authenticatedFragments)) {
    const source = fragment.start < fixture.targetUnit.start ? baseline : target
    assert.deepEqual(
      descriptor(source.slice(fragment.start, fragment.end)),
      { bytes: fragment.bytes, sha256: fragment.sha256 },
    )
  }
  assert.equal(
    target.slice(
      fixture.authenticatedFragments.targetFlushAddition.start,
      fixture.authenticatedFragments.targetFlushAddition.end,
    ),
    'flush:()=>r.flush(),',
  )
  assert.equal(
    target.slice(
      fixture.authenticatedFragments.targetCleanupRegistration.start,
      fixture.authenticatedFragments.targetCleanupRegistration.end,
    ),
    'let iH=AK(UH);',
  )
  assert.equal(
    target.slice(
      fixture.authenticatedFragments.targetDirectTeardown.start,
      fixture.authenticatedFragments.targetDirectTeardown.end,
    ),
    'teardown:UH,',
  )
  assert.equal(
    target.slice(
      fixture.authenticatedFragments.targetAsyncDispose.start,
      fixture.authenticatedFragments.targetAsyncDispose.end,
    ),
    '[Symbol.asyncDispose](){return aH.teardown()}',
  )
  assert(!baselineUnit.includes('flush:()=>'))
  assert.equal(targetUnit.split('iH()').length - 1, 2)
})

test('remote-bridge source replay is exact, idempotent, and fail closed', () => {
  const input = rawSource()
  const expected = buildTarget119RemoteBridgeTeardownDisposalOutput(input)
  assert.deepEqual(descriptor(expected), fixture.sourceFile.output)
  const state = materialize(input)
  try {
    assert.deepEqual(
      applyTarget119RemoteBridgeTeardownDisposalSourceRecovery({
        sourceRoot: state.sourceRoot,
      }),
      { status: 'recovered', files: [fixture.sourceFile.path] },
    )
    assert.deepEqual(
      descriptor(fs.readFileSync(state.filename)),
      fixture.sourceFile.output,
    )
    assert.deepEqual(
      applyTarget119RemoteBridgeTeardownDisposalSourceRecovery({
        sourceRoot: state.sourceRoot,
      }),
      { status: 'already-recovered', files: [] },
    )
    fs.appendFileSync(state.filename, '\n// drift')
    assert.throws(
      () =>
        applyTarget119RemoteBridgeTeardownDisposalSourceRecovery({
          sourceRoot: state.sourceRoot,
        }),
      /requires its exact raw or recovered source state/,
    )
  } finally {
    fs.rmSync(state.temporary, { recursive: true, force: true })
  }
})

test('source AST is graph-closed and matches the authenticated teardown shape', async () => {
  const ts = await loadTypeScript()
  const input = rawSource()
  const output = buildTarget119RemoteBridgeTeardownDisposalOutput(input)
  assert(!input.includes('remainingMs >= 200'))
  assert(!input.includes('[Symbol.asyncDispose]()'))
  sourceAnalysis(ts, output)

  const selected = fs.readFileSync(
    path.join(
      selectedSourceRoot,
      fixture.sourceFile.path.replace(/^src\//, ''),
    ),
  )
  assert(
    [fixture.sourceFile.input.sha256, fixture.sourceFile.output.sha256].includes(
      sha256(selected),
    ),
    'selected raw or packaged source has an authenticated replay state',
  )

  const target = fs
    .readFileSync(
      path.join(artifactRoot, fixture.inputs.targetBundle.artifact),
      'utf8',
    )
    .slice(fixture.targetUnit.start, fixture.targetUnit.end)
  const targetRetry = target.slice(
    fixture.authenticatedFragments.targetBoundedArchiveRetry.start -
      fixture.targetUnit.start,
    fixture.authenticatedFragments.targetBoundedArchiveRetry.end -
      fixture.targetUnit.start,
  )
  assert.match(targetRetry, />=200/)
  assert.match(targetRetry, /Promise\.race\(/)
  assert.match(targetRetry, /Math\.max\(1,/)
  assert.match(target, /teardown:[^,]+,\[Symbol\.asyncDispose\]/)
})

test('replayed archive retry executes within one shared teardown deadline', async () => {
  const ts = await loadTypeScript()
  const output = buildTarget119RemoteBridgeTeardownDisposalOutput(rawSource())
  const run = buildArchiveRetryRunner(ts, output)

  const archiveTimeouts = []
  let tokenIndex = 0
  let authCalls = 0
  const nowValues = [1000, 1100, 1200]
  const recovered = await run({
    cfg: { teardown_archive_timeout_ms: 1500 },
    Date: { now: () => nowValues.shift() },
    getAccessToken: () => ['stale', 'fresh'][Math.min(tokenIndex++, 1)],
    archiveSession: async (_sessionId, _baseUrl, _token, _orgUUID, timeout) => {
      archiveTimeouts.push(timeout)
      return archiveTimeouts.length === 1 ? 401 : 204
    },
    sessionId: 'cse_target119',
    baseUrl: 'https://example.invalid',
    orgUUID: 'org_target119',
    onAuth401: async () => {
      authCalls += 1
      return true
    },
    sleep: async () => {},
    logForDebugging: () => {},
    errorMessage: String,
  })
  assert.deepEqual(archiveTimeouts, [1500, 1300])
  assert.equal(authCalls, 1)
  assert.deepEqual(recovered, { status: 204, remainingMs: 1400 })

  const skippedTimeouts = []
  authCalls = 0
  const thresholdTimes = [1000, 2301]
  const skipped = await run({
    cfg: { teardown_archive_timeout_ms: 1500 },
    Date: { now: () => thresholdTimes.shift() },
    getAccessToken: () => 'stale',
    archiveSession: async (_sessionId, _baseUrl, _token, _orgUUID, timeout) => {
      skippedTimeouts.push(timeout)
      return 401
    },
    sessionId: 'cse_target119',
    baseUrl: 'https://example.invalid',
    orgUUID: 'org_target119',
    onAuth401: async () => {
      authCalls += 1
      return true
    },
    sleep: async () => {},
    logForDebugging: () => {},
    errorMessage: String,
  })
  assert.deepEqual(skippedTimeouts, [1500])
  assert.equal(authCalls, 0)
  assert.deepEqual(skipped, { status: 401, remainingMs: 199 })
})
