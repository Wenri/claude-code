import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  applyTarget118CollapsedShellLabelReplay,
  TARGET118_COLLAPSED_SHELL_LABEL_INPUT,
  TARGET118_COLLAPSED_SHELL_LABEL_OUTPUT,
  TARGET118_COLLAPSED_SHELL_LABEL_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/replay-collapsed-shell-label-source-gap.mjs'

const root = process.cwd()
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      'recovery/test/recovery-2.1.118-collapsed-shell-label-source-gap.json',
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
const targetCommit = 'bd846a24e3886322888f02b9f747c132a4a32314'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })
const descriptorAt = (value, start, end) => ({
  start,
  end,
  ...descriptor(value.subarray(start, end)),
})

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

let typescriptPromise
async function loadTypeScript() {
  typescriptPromise ??= import(
    pathToFileURL(
      path.join(
        root,
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      ),
    ).href
  ).then(imported => imported.default ?? imported)
  return typescriptPromise
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (!['start', 'end', 'loc', 'range'].includes(key)) walk(child, visit)
  }
}

function visitTs(ts, node, predicate, values = []) {
  if (predicate(node)) values.push(node)
  ts.forEachChild(node, child => {
    visitTs(ts, child, predicate, values)
  })
  return values
}

function sourceDeclaration(ts, input, label) {
  const sourceFile = ts.createSourceFile(
    label,
    input.toString(),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, label)
  const matches = sourceFile.statements.filter(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === fixture.row.sourceProof.declaration,
  )
  assert.equal(matches.length, 1, label)
  return { sourceFile, declaration: matches[0] }
}

function writeTempSource(tempRoot, input) {
  const filename = path.join(
    tempRoot,
    TARGET118_COLLAPSED_SHELL_LABEL_INPUT.path.replace(/^src\//, ''),
  )
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, input)
  return filename
}

test('Target118 collapsed shell-label fixture is complete and deterministic', () => {
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.117-to-2.1.118')
  assert.equal(fixture.summary.units, 1)
  assert.equal(fixture.summary.residues, 1)
  assert.equal(fixture.row.targetIndex, 12587)
  assert.equal(fixture.row.residues[0][1], ' shell')
  assert.deepEqual(
    fixture.evidenceIds,
    TARGET118_COLLAPSED_SHELL_LABEL_OWNER_OVERRIDES[0].evidenceIds,
  )
  assert.equal(
    sha256(JSON.stringify([fixture.row.targetIndex])),
    fixture.summary.indicesSha256,
  )
  assert.equal(
    sha256(JSON.stringify(fixture.row.residues)),
    fixture.summary.residueIdentitiesSha256,
  )
})

test('authenticated Target118 bundle pins the complete shell-label function', () => {
  if (!fs.existsSync(targetBundlePath)) {
    return test.skip('authenticated Target118 bundle is unavailable')
  }
  const targetBundle = fs.readFileSync(targetBundlePath)
  assert.deepEqual(descriptor(targetBundle), fixture.inputs.targetBundle)
  const row = fixture.row
  const slice = targetBundle.subarray(row.target.start, row.target.end)
  assert.equal(slice.length, row.target.bytes)
  assert.equal(sha256(slice), row.target.sourceHash)
  const ast = parse(slice.toString(), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  })
  assert.equal(ast.body.length, 1)
  assert.equal(ast.body[0].type, 'FunctionDeclaration')
  const literals = []
  walk(ast, node => {
    if (node.type === 'Literal' && typeof node.value === 'string') {
      literals.push(node.value)
    }
  })
  assert.equal(literals.filter(value => value === ' shell').length, 1)
  assert.equal(literals.filter(value => value === ' bash').length, 0)
  for (const marker of row.targetMarkers) {
    assert(slice.includes(marker), marker)
  }
  const residue = row.residues[0]
  assert.equal(
    targetBundle.subarray(residue[2], residue[3]).toString().slice(1, -1),
    residue[1],
  )
})

test('bounded source replay restores shell wording and is fail-closed', async t => {
  const raw = execFileSync('git', [
    'show',
    `${targetCommit}:${TARGET118_COLLAPSED_SHELL_LABEL_INPUT.path}`,
  ], { cwd: root })
  assert.deepEqual(descriptor(raw), {
    bytes: TARGET118_COLLAPSED_SHELL_LABEL_INPUT.bytes,
    sha256: TARGET118_COLLAPSED_SHELL_LABEL_INPUT.sha256,
  })
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'target118-shell-label.'))
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }))
  const filename = writeTempSource(tempRoot, raw)

  assert.deepEqual(
    applyTarget118CollapsedShellLabelReplay({ sourceRoot: tempRoot }),
    { status: 'recovered', changed: true },
  )
  const recovered = fs.readFileSync(filename)
  assert.deepEqual(descriptor(recovered), {
    bytes: TARGET118_COLLAPSED_SHELL_LABEL_OUTPUT.bytes,
    sha256: TARGET118_COLLAPSED_SHELL_LABEL_OUTPUT.sha256,
  })
  assert.deepEqual(
    applyTarget118CollapsedShellLabelReplay({ sourceRoot: tempRoot }),
    { status: 'already-recovered', changed: false },
  )

  const ts = await loadTypeScript()
  const before = sourceDeclaration(ts, raw, 'before.tsx')
  const after = sourceDeclaration(ts, recovered, 'after.tsx')
  assert.deepEqual(
    descriptorAt(raw, before.declaration.getStart(before.sourceFile), before.declaration.end),
    fixture.row.sourceProof.before,
  )
  assert.deepEqual(
    descriptorAt(
      recovered,
      after.declaration.getStart(after.sourceFile),
      after.declaration.end,
    ),
    fixture.row.sourceProof.after,
  )
  const beforeText = before.declaration.getText(before.sourceFile)
  const afterText = after.declaration.getText(after.sourceFile)
  for (const marker of fixture.row.sourceProof.invariantMarkers) {
    assert(beforeText.includes(marker), `before:${marker}`)
    assert(afterText.includes(marker), `after:${marker}`)
  }
  assert(beforeText.includes(fixture.row.sourceProof.beforeMarker))
  assert(!beforeText.includes(fixture.row.sourceProof.afterMarker))
  assert(!afterText.includes(fixture.row.sourceProof.beforeMarker))
  assert(afterText.includes(fixture.row.sourceProof.afterMarker))
  const beforeLabels = visitTs(
    ts,
    before.declaration,
    node => ts.isJsxText(node) && node.text.trim() === 'bash',
  )
  const afterLabels = visitTs(
    ts,
    after.declaration,
    node => ts.isJsxText(node) && node.text.trim() === 'shell',
  )
  assert.equal(beforeLabels.length, 1)
  assert.equal(afterLabels.length, 1)

  const mutated = Buffer.from(recovered)
  mutated[100] ^= 1
  fs.writeFileSync(filename, mutated)
  assert.throws(
    () => applyTarget118CollapsedShellLabelReplay({ sourceRoot: tempRoot }),
    /unknown preimage/,
  )
})

test('Target118 shell-label replay and coverage change atomically', async () => {
  const source = fs.readFileSync(
    path.join(
      sourceRoot,
      TARGET118_COLLAPSED_SHELL_LABEL_INPUT.path.replace(/^src\//, ''),
    ),
  )
  const sourceState =
    sha256(source) === TARGET118_COLLAPSED_SHELL_LABEL_OUTPUT.sha256
      ? 'recovered'
      : sha256(source) === TARGET118_COLLAPSED_SHELL_LABEL_INPUT.sha256
        ? 'raw'
        : 'unknown'
  assert.notEqual(sourceState, 'unknown')

  const coverage = readCoverage()
  const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
  const row = coverage.rows.find(row => row.targetIndex === 12587)
  assert(row)
  const expected = TARGET118_COLLAPSED_SHELL_LABEL_OWNER_OVERRIDES[0]
  const evidence = expected.evidenceIds.map(id => row.evidenceIds.includes(id))
  assert.equal(new Set(evidence).size, 1, `partial evidence: ${evidence}`)
  const coverageState = evidence[0] ? 'recovered' : 'raw'
  if (coverageState === 'recovered') {
    assert.deepEqual(row.ownerIds.map(id => owners.get(id)), expected.paths)
  }
  assert(
    sourceState === coverageState ||
      (sourceState === 'raw' && coverageState === 'recovered'),
    `source=${sourceState}, coverage=${coverageState}`,
  )
})
