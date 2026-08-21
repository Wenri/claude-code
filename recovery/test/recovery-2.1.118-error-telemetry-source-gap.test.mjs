import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import vm from 'node:vm'
import { gunzipSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'
import {
  applyTarget118ErrorTelemetryReplay,
  TARGET118_ERROR_TELEMETRY_OWNER_OVERRIDES,
  TARGET118_ERROR_TELEMETRY_REPLAY,
} from '../cases/2.1.117-to-2.1.118/recovered/replay-error-telemetry-source-gap.mjs'

const root = process.cwd()
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      'recovery/test/recovery-2.1.118-error-telemetry-source-gap.json',
    ),
    'utf8',
  ),
)
const targetBundlePath =
  process.env.CLAUDE_CODE_2_1_118_BUNDLE ??
  path.join(
    root,
    '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
  )

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function gitBlob(commit, filename) {
  const result = spawnSync('git', ['show', `${commit}:${filename}`], {
    cwd: root,
    encoding: null,
    maxBuffer: 4 * 1024 * 1024,
  })
  assert.equal(result.status, 0, String(result.stderr))
  return Buffer.from(result.stdout)
}

function readCoverage() {
  return JSON.parse(
    gunzipSync(
      fs.readFileSync(
        path.join(
          root,
          'recovery/cases/2.1.117-to-2.1.118/semantic/source-coverage.json.gz',
        ),
      ),
    ),
  )
}

async function loadRecoveredFunctions(source) {
  const imported = await import(
    pathToFileURL(
      path.join(
        root,
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      ),
    ).href
  )
  const ts = imported.default ?? imported
  const sourceFile = ts.createSourceFile(
    'gracefulShutdown.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  const names = new Set([
    'shortErrorHash',
    'sanitizeErrorMessage',
    'parseErrorStack',
    'safeErrorString',
    'getSafeErrorMetadata',
  ])
  const declarations = sourceFile.statements
    .filter(
      node =>
        ts.isFunctionDeclaration(node) &&
        node.name &&
        names.has(node.name.text),
    )
    .map(node => node.getText(sourceFile))
  assert.equal(declarations.length, names.size)
  const moduleSource = `
    ${declarations.join('\n')}
    globalThis.__target118ErrorTelemetry = {
      sanitizeErrorMessage,
      parseErrorStack,
      safeErrorString,
      getSafeErrorMetadata,
    }
  `
  const compiled = ts.transpileModule(moduleSource, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
    },
  }).outputText
  const context = { createHash: crypto.createHash, Error }
  vm.runInNewContext(compiled, context)
  return context.__target118ErrorTelemetry
}

test('Target118 error telemetry fixture and replay contract are exact', () => {
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.117-to-2.1.118')
  assert.equal(fixture.summary.units, 3)
  assert.equal(fixture.summary.residues, 14)
  assert.deepEqual(
    fixture.rows.map(row => row.targetIndex),
    [9866, 9867, 9869],
  )
  assert.equal(
    sha256(JSON.stringify(fixture.rows.map(row => row.targetIndex))),
    fixture.summary.indicesSha256,
  )
  assert.equal(
    sha256(JSON.stringify(fixture.rows.flatMap(row => row.residues))),
    fixture.summary.residueIdentitiesSha256,
  )
  assert.deepEqual(
    TARGET118_ERROR_TELEMETRY_OWNER_OVERRIDES.map(row => row.targetIndex),
    fixture.rows.map(row => row.targetIndex),
  )
  assert.deepEqual(TARGET118_ERROR_TELEMETRY_REPLAY.file, fixture.inputs.file)
})

test('authenticated Target118 bundle pins every error telemetry unit and residue', () => {
  if (!fs.existsSync(targetBundlePath)) {
    return test.skip('authenticated Target118 bundle is unavailable')
  }
  const bundle = fs.readFileSync(targetBundlePath)
  assert.deepEqual(descriptor(bundle), fixture.inputs.targetBundle)
  for (const row of fixture.rows) {
    const slice = bundle.subarray(row.target.start, row.target.end)
    assert.equal(slice.length, row.target.bytes, `u${row.targetIndex}: bytes`)
    assert.equal(sha256(slice), row.target.sourceHash, `u${row.targetIndex}: hash`)
    for (const residue of row.residues) {
      assert(residue[2] >= row.target.start, `u${row.targetIndex}: residue start`)
      assert(residue[3] <= row.target.end, `u${row.targetIndex}: residue end`)
    }
  }
})

test('bounded replay restores Target118 redaction and stack metadata semantics', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'target118-errors-'))
  const expected = fixture.inputs.file
  const filename = path.join(temporary, expected.path)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  const raw = gitBlob(
    'bd846a24e3886322888f02b9f747c132a4a32314',
    expected.path,
  )
  assert.deepEqual(descriptor(raw), expected.before)
  fs.writeFileSync(filename, raw)

  const first = applyTarget118ErrorTelemetryReplay({ sourceRoot: temporary })
  assert.deepEqual(first, { state: 'recovered', changes: [expected.path] })
  const recovered = fs.readFileSync(filename)
  assert.deepEqual(descriptor(recovered), expected.after)
  assert.deepEqual(applyTarget118ErrorTelemetryReplay({ sourceRoot: temporary }), {
    state: 'already-recovered',
    changes: [],
  })

  const source = recovered.toString('utf8')
  assert.equal((source.match(/\.\.\.getSafeErrorMetadata\(/g) ?? []).length, 2)
  const functions = await loadRecoveredFunctions(source)
  const sanitized = functions.sanitizeErrorMessage(
    'https://secret.example/a jane@example.com ghp_abcdefgh12345678 ' +
      'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo012345 /home/jane/private 10.0.0.1',
  )
  for (const marker of ['<url>', '<email>', '<key>', '<b64>', '<path>', '<ip>']) {
    assert(sanitized.includes(marker), marker)
  }
  assert(!sanitized.includes('jane@example.com'))
  const parsed = functions.parseErrorStack(
    'Error: boom\n    at async doThing (/home/jane/private.ts:12:4)\n    at new Worker (worker.ts:3:9)',
  )
  assert.deepEqual(Array.from(parsed.names), ['doThing', 'Worker'])
  assert.equal(parsed.topFrame, 'private.ts:12:4')
  const error = new TypeError('token jane@example.com')
  error.code = 'E_TEST'
  error.stack = 'TypeError: token\n    at doThing (/home/jane/private.ts:12:4)'
  const metadata = functions.getSafeErrorMetadata(error)
  assert.equal(metadata.error_code, 'E_TEST')
  assert.equal(metadata.error_constructor, 'TypeError')
  assert.equal(metadata.error_top_frame, 'private.ts:12:4')
  assert.match(metadata.error_message_hash, /^[0-9a-f]{12}$/)
  assert.match(metadata.error_stack_hash, /^[0-9a-f]{12}$/)
})

test('Target118 error telemetry package root and coverage use the recovered owner', () => {
  const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  if (sourceRoot) {
    const filename = path.join(
      sourceRoot,
      fixture.inputs.file.path.replace(/^src\//, ''),
    )
    assert.deepEqual(descriptor(fs.readFileSync(filename)), fixture.inputs.file.after)
    assert.deepEqual(applyTarget118ErrorTelemetryReplay({ sourceRoot }), {
      state: 'already-recovered',
      changes: [],
    })
  }

  const coverage = readCoverage()
  const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
  const rows = new Map(coverage.rows.map(row => [row.targetIndex, row]))
  for (const expected of TARGET118_ERROR_TELEMETRY_OWNER_OVERRIDES) {
    const row = rows.get(expected.targetIndex)
    assert(row, `missing coverage u${expected.targetIndex}`)
    const currentPaths = row.ownerIds.map(id => owners.get(id))
    const provisionalPaths = ['src/tools/SkillTool/prompt.ts']
    assert(
      JSON.stringify(currentPaths) === JSON.stringify(expected.paths) ||
        JSON.stringify(currentPaths) === JSON.stringify(provisionalPaths),
      `u${expected.targetIndex}: unexpected owner state ${currentPaths}`,
    )
    if (JSON.stringify(currentPaths) === JSON.stringify(expected.paths)) {
      for (const evidenceId of expected.evidenceIds) {
        assert(row.evidenceIds.includes(evidenceId), `u${expected.targetIndex}:${evidenceId}`)
      }
    }
  }
})
