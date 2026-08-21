import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  applyTarget118ThemePickerStateReplay,
  TARGET118_THEME_PICKER_STATE_INPUT,
  TARGET118_THEME_PICKER_STATE_OUTPUT,
  TARGET118_THEME_PICKER_STATE_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/replay-theme-picker-state-source-gap.mjs'

const root = process.cwd()
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      'recovery/test/recovery-2.1.118-theme-picker-state-source-gap.json',
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
const sourceRoot =
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
  path.join(root, '.recovery-tmp/semantic-trees/2.1.118/src')

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
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

async function parseThemePicker(source) {
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
    'theme.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  const declaration = sourceFile.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'ThemePickerCommand',
  )
  assert(declaration)
  return declaration.getText(sourceFile)
}

test('Target118 theme-picker fixture pins one complete source gap', () => {
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.117-to-2.1.118')
  assert.equal(fixture.targetIndex, 17047)
  assert.equal(fixture.residues.length, 3)
  assert.deepEqual(fixture.inputs.sourcePreimage, TARGET118_THEME_PICKER_STATE_INPUT)
  assert.deepEqual(fixture.inputs.sourcePostimage, TARGET118_THEME_PICKER_STATE_OUTPUT)
  assert.deepEqual(
    TARGET118_THEME_PICKER_STATE_OWNER_OVERRIDES.map(row => row.targetIndex),
    [17047],
  )
})

test('authenticated Target118 bundle pins the discriminated picker state', () => {
  if (!fs.existsSync(targetBundlePath)) {
    return test.skip('authenticated Target118 bundle is unavailable')
  }
  const bundle = fs.readFileSync(targetBundlePath)
  assert.deepEqual(descriptor(bundle), fixture.inputs.targetBundle)
  const slice = bundle.subarray(fixture.target.start, fixture.target.end)
  assert.equal(slice.length, fixture.target.bytes)
  assert.equal(sha256(slice), fixture.target.sourceHash)
  const text = slice.toString('utf8')
  for (const marker of fixture.targetMarkers) assert(text.includes(marker), marker)
  for (const residue of fixture.residues) {
    assert(residue[2] >= fixture.target.start)
    assert(residue[3] <= fixture.target.end)
  }
})

test('Target118 theme-picker replay is exact, idempotent, and source-AST valid', async () => {
  const raw = execFileSync(
    'git',
    [
      'show',
      'bd846a24e3886322888f02b9f747c132a4a32314:src/commands/theme/theme.tsx',
    ],
    { cwd: root, maxBuffer: 1024 * 1024 },
  )
  assert.deepEqual(descriptor(raw), {
    bytes: TARGET118_THEME_PICKER_STATE_INPUT.bytes,
    sha256: TARGET118_THEME_PICKER_STATE_INPUT.sha256,
  })
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'target118-theme-picker-'))
  const filename = path.join(tempRoot, 'commands/theme/theme.tsx')
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, raw)
  assert.deepEqual(applyTarget118ThemePickerStateReplay({ sourceRoot: tempRoot }), {
    status: 'recovered',
    changed: true,
  })
  const output = fs.readFileSync(filename)
  assert.deepEqual(descriptor(output), {
    bytes: TARGET118_THEME_PICKER_STATE_OUTPUT.bytes,
    sha256: TARGET118_THEME_PICKER_STATE_OUTPUT.sha256,
  })
  assert.deepEqual(applyTarget118ThemePickerStateReplay({ sourceRoot: tempRoot }), {
    status: 'already-recovered',
    changed: false,
  })
  const outputText = output.toString('utf8')
  const declaration = await parseThemePicker(outputText)
  assert(declaration.includes('function ThemePickerCommand'))
  for (const marker of fixture.sourceMarkers) {
    assert(outputText.includes(marker), marker)
  }
  const selectedSource = fs.readFileSync(
    path.join(sourceRoot, 'commands/theme/theme.tsx'),
  )
  const selectedDescriptor = descriptor(selectedSource)
  assert(
    [TARGET118_THEME_PICKER_STATE_INPUT, TARGET118_THEME_PICKER_STATE_OUTPUT].some(
      expected =>
        expected.bytes === selectedDescriptor.bytes &&
        expected.sha256 === selectedDescriptor.sha256,
    ),
    `unknown selected source ${selectedDescriptor.bytes}/${selectedDescriptor.sha256}`,
  )
})

test('Target118 theme-picker coverage changes only as a complete proof pair', () => {
  const coverage = readCoverage()
  const row = coverage.rows.find(item => item.targetIndex === 17047)
  const expected = TARGET118_THEME_PICKER_STATE_OWNER_OVERRIDES[0]
  const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
  assert(row)
  assert.deepEqual(row.ownerIds.map(id => owners.get(id)), expected.paths)
  const evidenceState = expected.evidenceIds.map(id => row.evidenceIds.includes(id))
  assert.equal(new Set(evidenceState).size, 1, 'partial theme-picker evidence')
})
