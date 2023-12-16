import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.119-binding-owner-proofs.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const fixtureSha256 =
  'b78e748c8878f45d0babdd602940bada7657a5b9c028df2894591ac46213ef43'
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.119/src'),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

async function loadTypeScript() {
  const filename = path.join(
    repositoryRoot,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  assert.ok(fs.existsSync(filename), 'the repository-pinned TypeScript compiler exists')
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
}

function bindingCounts(ts, sourceFile) {
  const counts = new Map()
  function add(name) {
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  function visit(node) {
    if (
      (ts.isBindingElement(node) ||
        ts.isPropertySignature(node) ||
        ts.isParameter(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    ) {
      add(node.name.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return counts
}

function coverage() {
  return JSON.parse(
    gunzipSync(
      fs.readFileSync(
        path.join(
          repositoryRoot,
          'recovery/cases/2.1.118-to-2.1.119/semantic/source-coverage.json.gz',
        ),
      ),
    ),
  )
}

function scannerReport({ baselinePath, targetPath }) {
  const result = spawnSync(
    process.execPath,
    [
      path.join(repositoryRoot, 'recovery/scripts/inspect-semantic-literal-gaps.mjs'),
      '--baseline',
      baselinePath,
      '--target',
      targetPath,
      '--source-root',
      sourceRoot,
      '--structural',
      path.join(
        repositoryRoot,
        'recovery/cases/2.1.118-to-2.1.119/structural/generated-delta.json.gz',
      ),
      '--partitions',
      path.join(
        repositoryRoot,
        'recovery/cases/2.1.118-to-2.1.119/attribution/target-partitions.jsonl.gz',
      ),
      '--sources',
      path.join(
        repositoryRoot,
        'recovery/cases/2.1.118-to-2.1.119/attribution/sources.jsonl.gz',
      ),
      '--coverage',
      path.join(
        repositoryRoot,
        'recovery/cases/2.1.118-to-2.1.119/semantic/source-coverage.json.gz',
      ),
    ],
    { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 },
  )
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return JSON.parse(result.stdout)
}

test('target119 binding-owner fixture is exact and rejects alternate whole-owner moves', () => {
  assert.equal(sha256(fixtureBytes), fixtureSha256)
  assert.equal(fixture.case, '2.1.118-to-2.1.119')
  const analysisBytes = fs.readFileSync(
    path.join(repositoryRoot, fixture.inputs.analysis.path),
  )
  assert.deepEqual(descriptor(analysisBytes), {
    bytes: fixture.inputs.analysis.bytes,
    sha256: fixture.inputs.analysis.sha256,
  })
  assert.deepEqual(fixture.summary, {
    units: 3,
    residues: 10,
    bindingResidues: 7,
    buildMacroResidues: 3,
    ownerFiles: 3,
  })
  assert.deepEqual(
    fixture.rows.map(row => row.targetIndex),
    [16557, 18458, 20626],
  )
  assert.equal(
    fixture.rows.reduce((sum, row) => sum + row.residues.length, 0),
    fixture.summary.residues,
  )
})

test('target119 original owners contain the exact binding AST and macro call sites', async () => {
  const ts = await loadTypeScript()
  for (const row of fixture.rows) {
    const filename = path.join(sourceRoot, row.ownerPath.slice(4))
    const bytes = fs.readFileSync(filename)
    assert.deepEqual(descriptor(bytes), {
      bytes: row.owner.bytes,
      sha256: row.owner.sha256,
    })
    const source = bytes.toString('utf8')
    for (const marker of row.owner.markers) {
      assert.ok(source.includes(marker), `${row.ownerPath}: ${marker}`)
    }
    const sourceFile = ts.createSourceFile(
      filename,
      source,
      ts.ScriptTarget.Latest,
      true,
      filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    assert.equal(sourceFile.parseDiagnostics.length, 0, `${row.ownerPath}: source parses`)
    const counts = bindingCounts(ts, sourceFile)
    for (const residue of row.residues.filter(item => item.proof === 'binding-element')) {
      assert.ok(
        (counts.get(residue.value) ?? 0) > 0,
        `${row.ownerPath}: binding AST contains ${residue.value}`,
      )
    }
  }
})

const selected = process.env.CLAUDE_CODE_SEMANTIC_CASE === fixture.case
const baselinePath = process.env.CLAUDE_CODE_2_1_118_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_119_BUNDLE
test(
  'target119 binding-owner proof authenticates target fragments and complete residual set',
  {
    skip:
      !selected || !baselinePath || !targetPath
        ? 'exact semantic case and authenticated bundles are required'
        : false,
    timeout: 180_000,
  },
  () => {
    const targetBundle = fs.readFileSync(targetPath)
    assert.deepEqual(descriptor(targetBundle), fixture.inputs.targetBundle)
    const currentCoverage = coverage()
    const owners = new Map(currentCoverage.owners.map(owner => [owner.id, owner.path]))
    const rows = new Map(currentCoverage.rows.map(row => [row.targetIndex, row]))
    for (const row of fixture.rows) {
      assert.equal(
        sha256(targetBundle.subarray(row.target.start, row.target.end)),
        row.target.sha256,
        `u${row.targetIndex}: target fragment`,
      )
      const coverageRow = rows.get(row.targetIndex)
      assert.deepEqual(
        coverageRow.ownerIds.map(ownerId => owners.get(ownerId)),
        [row.ownerPath],
        `u${row.targetIndex}: original complete-unit owner`,
      )
      assert.deepEqual(coverageRow.evidenceIds, fixture.evidenceIds)
    }

    const report = scannerReport({ baselinePath, targetPath })
    const fixtureRows = new Map(fixture.rows.map(row => [row.targetIndex, row]))
    const remaining = report.sourceRuntimeAddedOwnerResidueRows.filter(residue =>
      fixtureRows.has(residue.structural.index),
    )
    assert.equal(remaining.length, fixture.summary.residues)
    for (const residue of remaining) {
      const row = fixtureRows.get(residue.structural.index)
      assert.ok(
        row.residues.some(
          expected =>
            expected.kind === residue.literalKind &&
            JSON.stringify(expected.value) === JSON.stringify(residue.value) &&
            expected.targetStart === residue.target.start &&
            expected.targetEnd === residue.target.end &&
            expected.targetOccurrenceNumber === residue.targetOccurrenceNumber,
        ),
        `u${row.targetIndex}: residue is explicitly pinned`,
      )
    }
  },
)
