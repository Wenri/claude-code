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
  applyTarget119GracefulShutdownOutputErrorsSourceRecovery,
  TARGET119_GRACEFUL_SHUTDOWN_OUTPUT_ERRORS_INPUT_FILES,
  TARGET119_GRACEFUL_SHUTDOWN_OUTPUT_ERRORS_OUTPUT_FILES,
  TARGET119_GRACEFUL_SHUTDOWN_OUTPUT_ERRORS_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/replay-graceful-shutdown-output-errors-source-gap.mjs'

const root = process.cwd()
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      'recovery/test/recovery-2.1.119-graceful-shutdown-output-errors-source-gap.json',
    ),
  ),
)
const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })

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

function materializeRawSource() {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target119-graceful-output-errors-'),
  )
  const sourceRoot = path.join(temporary, 'src')
  const files = new Map()
  for (const spec of fixture.sourceFiles) {
    const result = spawnSync(
      'git',
      ['show', `${fixture.sourceCommit}:${spec.path}`],
      { cwd: root, encoding: null },
    )
    assert.equal(result.status, 0, result.stderr?.toString())
    assert.deepEqual(descriptor(result.stdout), spec.input)
    const filename = path.join(sourceRoot, spec.path.replace(/^src\//, ''))
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, result.stdout)
    files.set(spec.path, filename)
  }
  return { temporary, sourceRoot, files }
}

function structuralUnit(structural, side, index) {
  return [
    ...(structural[`unmatched${side}`] ?? []),
    ...structural.regions
      .map(region => region[side.toLowerCase()])
      .filter(Boolean),
  ].find(unit => unit.index === index)
}

function assertStructuralDescriptor(actual, expected) {
  assert(actual)
  assert.deepEqual(
    {
      nodeType: actual.nodeType,
      start: actual.start,
      end: actual.end,
      sourceHash: actual.sourceHash,
      coarseHash: actual.coarseHash,
    },
    {
      nodeType: expected.nodeType,
      start: expected.start,
      end: expected.end,
      sourceHash: expected.sourceHash,
      coarseHash: expected.coarseHash,
    },
  )
}

function parseUnit(bundle, expected) {
  const bytes = bundle.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(bytes), {
    bytes: expected.bytes,
    sha256: expected.sourceHash,
  })
  const ast = parse(bytes.toString('utf8'), {
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  assert.equal(ast.body.length, 1)
  assert.equal(ast.body[0].type, expected.nodeType)
  return { text: bytes.toString('utf8'), node: ast.body[0] }
}

function sourceDeclaration(ts, filename, text, declarationName) {
  const parsed = ts.createSourceFile(
    filename,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(parsed.parseDiagnostics.length, 0)
  const matches = []
  function visit(node) {
    const functionMatch =
      ts.isFunctionDeclaration(node) && node.name?.text === declarationName
    const variableMatch =
      ts.isVariableDeclaration(node) &&
      node.name.getText(parsed) === declarationName
    if (functionMatch || variableMatch) {
      const declaration = variableMatch ? node.parent.parent : node
      const charStart = declaration.getStart(parsed)
      const charEnd = declaration.end
      matches.push({
        path: filename,
        name: declarationName,
        charStart,
        charEnd,
        ...descriptor(Buffer.from(text.slice(charStart, charEnd))),
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  assert.equal(matches.length, 1)
  return { parsed, declaration: matches[0] }
}

function readCoverage() {
  return JSON.parse(
    gunzipSync(
      fs.readFileSync(
        path.join(
          root,
          'recovery/cases/2.1.118-to-2.1.119/semantic/source-coverage.json.gz',
        ),
      ),
    ),
  )
}

function findRegistrationCallback(ts, parsed, text) {
  const matches = []
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(parsed) ===
        'registerProcessOutputErrorHandlers' &&
      node.arguments.length === 1
    ) {
      matches.push(text.slice(node.arguments[0].getStart(parsed), node.arguments[0].end))
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  assert.equal(matches.length, 1)
  return matches[0]
}

function executableOutputHarness(ts, processText, callbackText, interactive) {
  const callbacks = new Map()
  const stream = name => ({
    name,
    destroyed: false,
    on(event, callback) {
      callbacks.set(`${name}:${event}`, callback)
    },
    destroy() {
      this.destroyed = true
    },
  })
  const mockProcess = { stdout: stream('stdout'), stderr: stream('stderr') }
  const processJs = ts.transpileModule(processText, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const processExports = {}
  const register = Function(
    'exports',
    'process',
    `${processJs}; return exports.registerProcessOutputErrorHandlers`,
  )(processExports, mockProcess)
  const callbackJs = ts.transpileModule(`const callback = ${callbackText}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText
  const diagnostics = []
  const shutdowns = []
  const callback = Function(
    'getIsInteractive',
    'logForDiagnosticsNoPII',
    'gracefulShutdown',
    `${callbackJs}; return callback`,
  )(
    () => interactive,
    (...args) => diagnostics.push(args),
    code => {
      shutdowns.push(code)
      return Promise.resolve()
    },
  )
  register(callback)
  return { callbacks, mockProcess, diagnostics, shutdowns }
}

test('fixture and helper freeze the exact complete two-residue lane', () => {
  assert.deepEqual(fixture.summary, {
    units: 1,
    residues: 2,
    indicesSha256: sha256(JSON.stringify([10014])),
    residueIdentitiesSha256: sha256(JSON.stringify(fixture.residueIdentities)),
  })
  assert.deepEqual(
    TARGET119_GRACEFUL_SHUTDOWN_OUTPUT_ERRORS_INPUT_FILES,
    fixture.sourceFiles.map(file => ({ path: file.path, ...file.input })),
  )
  assert.deepEqual(
    TARGET119_GRACEFUL_SHUTDOWN_OUTPUT_ERRORS_OUTPUT_FILES,
    fixture.sourceFiles.map(file => ({ path: file.path, ...file.output })),
  )
  const override = TARGET119_GRACEFUL_SHUTDOWN_OUTPUT_ERRORS_OWNER_OVERRIDES[0]
  assert.deepEqual(
    {
      targetIndex: override.targetIndex,
      ownerPaths: [...override.paths],
      evidenceIds: [...override.evidenceIds],
    },
    fixture.ownerOverride,
  )
})

test('authenticated bundles prove retained SIGHUP handling and the new output-error contract', () => {
  const baseline = fs.readFileSync(
    path.join(root, fixture.inputs.baselineBundle.path),
  )
  const target = fs.readFileSync(path.join(root, fixture.inputs.targetBundle.path))
  const structuralBytes = fs.readFileSync(
    path.join(root, fixture.inputs.structuralLedger.path),
  )
  assert.deepEqual(descriptor(baseline), {
    bytes: fixture.inputs.baselineBundle.bytes,
    sha256: fixture.inputs.baselineBundle.sha256,
  })
  assert.deepEqual(descriptor(target), {
    bytes: fixture.inputs.targetBundle.bytes,
    sha256: fixture.inputs.targetBundle.sha256,
  })
  assert.deepEqual(descriptor(structuralBytes), {
    bytes: fixture.inputs.structuralLedger.bytes,
    sha256: fixture.inputs.structuralLedger.sha256,
  })
  const structural = JSON.parse(gunzipSync(structuralBytes))
  const targetUnits = fixture.targetUnits.map(expected => {
    assertStructuralDescriptor(
      structuralUnit(structural, 'Target', expected.index),
      expected,
    )
    return parseUnit(target, expected)
  })
  const baselineUnits = fixture.baselineUnits.map(expected => {
    assertStructuralDescriptor(
      structuralUnit(structural, 'Baseline', expected.index),
      expected,
    )
    return parseUnit(baseline, expected)
  })
  const [targetProcess, targetShutdown] = targetUnits
  const [baselineStreamCallback, baselineProcess, baselineShutdown] =
    baselineUnits
  assert.match(targetProcess.text, /EPIPE.*EIO/)
  assert.match(targetProcess.text, /process\.stdout.*\(q\.code\)/)
  assert.match(baselineStreamCallback.text, /EPIPE/)
  assert.doesNotMatch(baselineStreamCallback.text, /EIO/)
  assert.match(baselineProcess.text, /process\.stdout/)
  for (const unit of [baselineShutdown, targetShutdown]) {
    assert.match(unit.text, /CLAUDE_BG_BACKEND/)
    assert.match(unit.text, /SIGHUP_ignored_bg/)
  }
  assert.doesNotMatch(baselineShutdown.text, /stdout_/)
  assert.match(targetShutdown.text, /stdout_/)
  assert.match(targetShutdown.text, /shutdown_signal/)
  for (const [, kind, value, start, end] of fixture.residueIdentities) {
    const source = target.subarray(start, end).toString('utf8')
    const decoded =
      kind === 'string' && /^['"]/.test(source) ? JSON.parse(source) : source
    assert.equal(decoded, value)
  }
})

test('source replay is exact, typed, executable, idempotent, and fail-closed', async t => {
  const ts = await loadTypeScript()
  const materialized = materializeRawSource()
  t.after(() =>
    fs.rmSync(materialized.temporary, { recursive: true, force: true }),
  )
  assert.deepEqual(
    applyTarget119GracefulShutdownOutputErrorsSourceRecovery({
      sourceRoot: materialized.sourceRoot,
    }),
    {
      status: 'recovered',
      files: fixture.sourceFiles.map(file => file.path),
    },
  )
  assert.deepEqual(
    applyTarget119GracefulShutdownOutputErrorsSourceRecovery({
      sourceRoot: materialized.sourceRoot,
    }),
    { status: 'already-recovered', files: [] },
  )
  for (const spec of fixture.sourceFiles) {
    assert.deepEqual(
      descriptor(fs.readFileSync(materialized.files.get(spec.path))),
      spec.output,
    )
  }

  const processText = fs.readFileSync(
    materialized.files.get('src/utils/process.ts'),
    'utf8',
  )
  const gracefulText = fs.readFileSync(
    materialized.files.get('src/utils/gracefulShutdown.ts'),
    'utf8',
  )
  const printText = fs.readFileSync(
    materialized.files.get('src/cli/print.ts'),
    'utf8',
  )
  const processParsed = sourceDeclaration(
    ts,
    'src/utils/process.ts',
    processText,
    'registerProcessOutputErrorHandlers',
  )
  const gracefulParsed = sourceDeclaration(
    ts,
    'src/utils/gracefulShutdown.ts',
    gracefulText,
    'setupGracefulShutdown',
  )
  assert.deepEqual(
    processParsed.declaration,
    fixture.sourceDeclarations.processRecovered,
  )
  assert.deepEqual(
    gracefulParsed.declaration,
    fixture.sourceDeclarations.gracefulRecovered,
  )
  assert.equal((printText.match(/registerProcessOutputErrorHandlers/g) ?? []).length, 0)
  assert.match(gracefulText, /CLAUDE_BG_BACKEND === 'daemon'/)
  assert.match(gracefulText, /signal: 'SIGHUP_ignored_bg'/)

  const callbackText = findRegistrationCallback(
    ts,
    gracefulParsed.parsed,
    gracefulText,
  )
  const interactive = executableOutputHarness(
    ts,
    processText,
    callbackText,
    true,
  )
  interactive.callbacks.get('stdout:error')({ code: 'EPIPE' })
  assert.equal(interactive.mockProcess.stdout.destroyed, true)
  assert.deepEqual(interactive.diagnostics, [
    ['info', 'shutdown_signal', { signal: 'stdout_EPIPE' }],
  ])
  assert.deepEqual(interactive.shutdowns, [0])
  interactive.callbacks.get('stderr:error')({ code: 'EIO' })
  assert.equal(interactive.mockProcess.stderr.destroyed, true)
  assert.equal(interactive.diagnostics.length, 1)

  const nonInteractive = executableOutputHarness(
    ts,
    processText,
    callbackText,
    false,
  )
  nonInteractive.callbacks.get('stdout:error')({ code: 'EIO' })
  assert.equal(nonInteractive.mockProcess.stdout.destroyed, true)
  assert.deepEqual(nonInteractive.diagnostics, [])
  assert.deepEqual(nonInteractive.shutdowns, [])

  for (const spec of fixture.sourceFiles) {
    const build = spawnSync(
      'bun',
      [
        'build',
        materialized.files.get(spec.path),
        '--target=node',
        '--external=*',
        '--outfile',
        path.join(materialized.temporary, `${path.basename(spec.path)}.js`),
      ],
      { cwd: root, encoding: 'utf8' },
    )
    assert.equal(build.status, 0, build.stderr)
  }

  const mixed = materializeRawSource()
  t.after(() => fs.rmSync(mixed.temporary, { recursive: true, force: true }))
  fs.copyFileSync(
    materialized.files.get('src/utils/process.ts'),
    mixed.files.get('src/utils/process.ts'),
  )
  assert.throws(
    () =>
      applyTarget119GracefulShutdownOutputErrorsSourceRecovery({
        sourceRoot: mixed.sourceRoot,
      }),
    /exact all-raw or all-recovered source state/,
  )
  assert.deepEqual(
    descriptor(fs.readFileSync(mixed.files.get('src/utils/gracefulShutdown.ts'))),
    fixture.sourceFiles[0].input,
  )

  const drift = materializeRawSource()
  t.after(() => fs.rmSync(drift.temporary, { recursive: true, force: true }))
  fs.appendFileSync(drift.files.get('src/utils/process.ts'), '\n')
  assert.throws(
    () =>
      applyTarget119GracefulShutdownOutputErrorsSourceRecovery({
        sourceRoot: drift.sourceRoot,
      }),
    /exact all-raw or all-recovered source state/,
  )
})

test('coverage and selected package source are exact provisional or recovered states', async () => {
  const ledger = readCoverage()
  const expected = TARGET119_GRACEFUL_SHUTDOWN_OUTPUT_ERRORS_OWNER_OVERRIDES[0]
  const row = ledger.rows.find(item => item.targetIndex === expected.targetIndex)
  assert(row)
  const ownerById = new Map(ledger.owners.map(owner => [owner.id, owner.path]))
  const paths = row.ownerIds.map(id => ownerById.get(id)).sort()
  const signal = expected.evidenceIds.some(id => row.evidenceIds.includes(id))
  if (!signal) {
    assert.deepEqual(paths, ['src/utils/gracefulShutdown.ts'])
    assert.deepEqual(row.evidenceIds, ['source-map-attribution', 'semantic-test'])
  } else {
    assert.deepEqual(paths, [...expected.paths].sort())
    assert.deepEqual(row.evidenceIds, [...expected.evidenceIds])
    assert.equal(row.behavior, expected.behavior)
    for (const id of expected.evidenceIds) {
      assert(ledger.evidence.some(evidence => evidence.id === id))
    }
  }

  const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  if (!sourceRoot) return
  const ts = await loadTypeScript()
  const states = fixture.sourceFiles.map(spec => {
    const bytes = fs.readFileSync(
      path.join(sourceRoot, spec.path.replace(/^src\//, '')),
    )
    const actual = descriptor(bytes)
    return actual.bytes === spec.input.bytes &&
      actual.sha256 === spec.input.sha256
      ? 'raw'
      : actual.bytes === spec.output.bytes &&
          actual.sha256 === spec.output.sha256
        ? 'recovered'
        : 'unknown'
  })
  assert(
    states.every(state => state === 'raw') ||
      states.every(state => state === 'recovered'),
    `unexpected package source state ${states.join(',')}`,
  )
  if (states[0] === 'recovered') {
    const graceful = fs.readFileSync(
      path.join(sourceRoot, 'utils/gracefulShutdown.ts'),
      'utf8',
    )
    const parsed = sourceDeclaration(
      ts,
      'src/utils/gracefulShutdown.ts',
      graceful,
      'setupGracefulShutdown',
    )
    assert.deepEqual(parsed.declaration, fixture.sourceDeclarations.gracefulRecovered)
  }
})
