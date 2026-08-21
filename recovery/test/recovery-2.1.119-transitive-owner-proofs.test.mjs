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
  new URL('./recovery-2.1.119-transitive-owner-proofs.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const expectedFixtureSha256 =
  '3fd537eed06c94efd3db184f7b5c95d93de158239c5f7f40068f955eed9bf4f3'
const RECOVERED_SOURCE_PHASES = Object.freeze({
  'src/utils/udsClient.ts': Object.freeze({
    bytes: 7275,
    sha256: 'af64419e15b607cce8e1eb3aaab6683d29cf4a958433630bd0f29bc83c23dfec',
    declarations: Object.freeze({
      12163: Object.freeze({
        bytes: 2247,
        end: 5756,
        kind: 'VariableDeclaration',
        name: 'values',
        sha256: '483743d9096e030c7328d3f7d88dd984696389e03ca7c3b848543638fe636a9c',
        start: 3509,
      }),
    }),
  }),
})
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

function canonicalFlags(flags) {
  return [...flags].sort().join('')
}

function identity(kind, value) {
  if (kind === 'regexp') {
    return `regexp:${JSON.stringify(value.pattern)}/${canonicalFlags(value.flags)}`
  }
  return `${kind}:${
    kind === 'string' || kind === 'property' ? JSON.stringify(value) : String(value)
  }`
}

function parseRegExp(text) {
  const match = /^\/(.*)\/([a-z]*)$/s.exec(text)
  return match ? { flags: canonicalFlags(match[2]), pattern: match[1] } : null
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

function collectIdentities(ts, node, sourceFile) {
  const identities = new Set()
  function add(kind, value) {
    identities.add(identity(kind, value))
  }
  function visit(child) {
    if (ts.isStringLiteralLike(child) || ts.isTemplateLiteralToken(child)) {
      add('string', child.text)
    } else if (ts.isJsxText(child)) {
      const lines = child.text.split(/\r?\n/)
      for (let index = 0; index < lines.length; index += 1) {
        let line = lines[index].replace(/\t/g, ' ')
        if (index !== 0) line = line.replace(/^ +/, '')
        if (index !== lines.length - 1) line = line.replace(/ +$/, '')
        if (line) add('string', line)
      }
      const collapsed = child.text.replace(/\s+/g, ' ').trim()
      if (collapsed) add('string', collapsed)
    } else if (ts.isNumericLiteral(child)) {
      add('number', Number(child.text.replaceAll('_', '')))
    } else if (ts.isBigIntLiteral(child)) {
      add('bigint', child.text.replace(/n$/, ''))
    } else if (ts.isRegularExpressionLiteral(child)) {
      const value = parseRegExp(child.getText(sourceFile))
      if (value) add('regexp', value)
    }
    const property =
      (ts.isPropertyAssignment(child) ||
        ts.isShorthandPropertyAssignment(child) ||
        ts.isMethodDeclaration(child) ||
        ts.isGetAccessorDeclaration(child) ||
        ts.isSetAccessorDeclaration(child) ||
        ts.isPropertyDeclaration(child) ||
        ts.isPropertySignature(child) ||
        ts.isMethodSignature(child) ||
        ts.isBindingElement(child) ||
        ts.isJsxAttribute(child)) &&
      child.name &&
      ts.isIdentifier(child.name)
        ? child.name.text
        : ts.isPropertyAccessExpression(child) && ts.isIdentifier(child.name)
          ? child.name.text
          : null
    if (property) add('property', property)
    ts.forEachChild(child, visit)
  }
  visit(node)
  return identities
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

test('target119 transitive owner fixture is complete and internally exact', () => {
  assert.equal(sha256(fixtureBytes), expectedFixtureSha256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.118-to-2.1.119')
  assert.equal(fixture.status, 'generator-ready-fail-closed')
  const analysisBytes = fs.readFileSync(
    path.join(repositoryRoot, fixture.inputs.analysis.path),
  )
  assert.deepEqual(descriptor(analysisBytes), {
    bytes: fixture.inputs.analysis.bytes,
    sha256: fixture.inputs.analysis.sha256,
  })
  assert.deepEqual(fixture.summary, {
    units: 197,
    residues: 1578,
    macroResidues: 6,
    declarationUnits: 165,
    fileUnits: 24,
    resourceUnits: 8,
    ownerFiles: 59,
    excludedIncompleteUnits: 3,
  })
  assert.deepEqual(
    fixture.excludedIncompleteRows.map(row => row.targetIndex),
    [16557, 18458, 20626],
  )
  assert.equal(new Set(fixture.rows.map(row => row.targetIndex)).size, 197)
  assert.equal(
    fixture.rows.reduce((sum, row) => sum + row.residues.length, 0),
    fixture.summary.residues,
  )
  assert.equal(new Set(fixture.sourceOwners.map(owner => owner.path)).size, 59)
  for (const row of fixture.rows) {
    assert.match(row.ownerPath, /^src\//)
    assert.ok(row.behavior.includes(`u${row.targetIndex}`))
    assert.ok(row.residues.some(residue => !residue.macro))
    assert.equal(row.target.end > row.target.start, true)
  }
})

test('target119 transitive owners retain exact historical source AST/resource identities', async () => {
  const ts = await loadTypeScript()
  for (const expectedOwner of fixture.sourceOwners) {
    const filename = path.join(sourceRoot, expectedOwner.path.slice(4))
    assert.ok(fs.existsSync(filename), `${expectedOwner.path}: historical source owner exists`)
    const actual = descriptor(fs.readFileSync(filename))
    const recovered = RECOVERED_SOURCE_PHASES[expectedOwner.path]
    assert.ok(
      [expectedOwner, recovered].filter(Boolean).some(
        expected =>
          expected.bytes === actual.bytes && expected.sha256 === actual.sha256,
      ),
      `${expectedOwner.path}: unrecognized Target119 source phase ${JSON.stringify(actual)}`,
    )
  }
  for (const row of fixture.rows) {
    const filename = path.join(sourceRoot, row.ownerPath.slice(4))
    const bytes = fs.readFileSync(filename)
    const sourceDescriptor = descriptor(bytes)
    const recoveredSource = RECOVERED_SOURCE_PHASES[row.ownerPath]
    const recoveredPhase =
      recoveredSource?.bytes === sourceDescriptor.bytes &&
      recoveredSource?.sha256 === sourceDescriptor.sha256
    const expected = new Set(
      row.residues
        .filter(residue => !residue.macro)
        .map(residue => identity(residue.kind, residue.value)),
    )
    if (row.ownerProof.proofScope === 'resource') {
      const source = bytes.toString('utf8')
      for (const value of expected) {
        assert.match(value, /^string:/)
        assert.ok(source.includes(JSON.parse(value.slice('string:'.length))))
      }
      continue
    }
    const source = bytes.toString('utf8')
    const sourceFile = ts.createSourceFile(
      filename,
      source,
      ts.ScriptTarget.Latest,
      true,
      filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    assert.equal(sourceFile.parseDiagnostics.length, 0, `${row.ownerPath}: source parses`)
    const identities = collectIdentities(ts, sourceFile, sourceFile)
    for (const value of expected) {
      assert.ok(identities.has(value), `${row.ownerPath}: source AST contains ${value}`)
    }
    if (row.ownerProof.declaration) {
      const declaration =
        (recoveredPhase &&
          recoveredSource.declarations[row.targetIndex]) ||
        row.ownerProof.declaration
      assert.equal(
        sha256(Buffer.from(source.slice(declaration.start, declaration.end))),
        declaration.sha256,
        `${row.ownerPath}: declaration ${declaration.name}`,
      )
    }
  }
})

const selected = process.env.CLAUDE_CODE_SEMANTIC_CASE === fixture.case
const baselinePath = process.env.CLAUDE_CODE_2_1_118_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_119_BUNDLE
test(
  'target119 transitive owner coverage closes every non-macro residue against authenticated bundles',
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
    const coverageRows = new Map(currentCoverage.rows.map(row => [row.targetIndex, row]))
    for (const row of fixture.rows) {
      const covered = coverageRows.get(row.targetIndex)
      assert.ok(covered, `u${row.targetIndex}: coverage row exists`)
      assert.deepEqual(
        covered.ownerIds.map(ownerId => owners.get(ownerId)),
        [row.ownerPath],
        `u${row.targetIndex}: corrected owner`,
      )
      assert.deepEqual(covered.evidenceIds, fixture.evidenceIds)
      assert.equal(
        sha256(targetBundle.subarray(row.target.start, row.target.end)),
        row.target.sha256,
        `u${row.targetIndex}: authenticated target fragment`,
      )
    }

    const report = scannerReport({ baselinePath, targetPath })
    const fixtureRows = new Map(fixture.rows.map(row => [row.targetIndex, row]))
    const remaining = report.sourceRuntimeAddedOwnerResidueRows.filter(residue =>
      fixtureRows.has(residue.structural.index),
    )
    for (const residue of remaining) {
      const row = fixtureRows.get(residue.structural.index)
      const expected = row.residues.find(
        item =>
          item.kind === residue.literalKind &&
          JSON.stringify(item.value) === JSON.stringify(residue.value) &&
          item.targetStart === residue.target.start &&
          item.targetEnd === residue.target.end &&
          item.targetOccurrenceNumber === residue.targetOccurrenceNumber,
      )
      assert.ok(expected, `u${row.targetIndex}: remaining residue is pinned`)
      assert.ok(expected.macro, `u${row.targetIndex}: only compiler macros may remain`)
    }
  },
)
