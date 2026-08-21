import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  TARGET119_MIGRATION_SESSION_MEMORY_STATIC_EVIDENCE_IDS,
  TARGET119_MIGRATION_SESSION_MEMORY_STATIC_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/migration-session-memory-static-owner-overrides.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-migration-session-memory-static-owner-proofs.json',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/migration-session-memory-static-owner-overrides.mjs',
)
const coveragePath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/semantic/source-coverage.json.gz',
)
const artifactRoot = path.join(root, '.recovery-tmp/authenticated-artifacts')
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src'),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const FIXTURE_SHA256 =
  'eedc5fda052368d9410c565f35a770a0ba4f7f35bd8ab322524eb0c800bc302d'
const HELPER_SHA256 =
  'eb8a52ab9e229ea7a9d6daec3054b27a470f35d3e1b0749a94c09bf116017ac8'

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

function artifactPath(environmentName, input) {
  return process.env[environmentName]
    ? path.resolve(process.env[environmentName])
    : path.join(artifactRoot, input.artifact)
}

async function loadTypeScript() {
  const filename = path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
}

function sourceSpan(source, sourceFile, node) {
  const start = node.getStart(sourceFile)
  const end = node.end
  const text = source.slice(start, end)
  return { start, end, chars: text.length, sha256: sha256(text), text }
}

function residueIdentities() {
  return fixture.rows.flatMap(row =>
    row.residues.map(residue => [
      row.targetIndex,
      residue.kind,
      residue.value,
      residue.start,
      residue.end,
      residue.baselineCount,
      residue.targetOrdinal,
    ]),
  )
}

test(
  'Target119 migration/session-memory fixture and overrides remain frozen',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(
      fixture.evidenceIds,
      TARGET119_MIGRATION_SESSION_MEMORY_STATIC_EVIDENCE_IDS,
    )
    assert.deepEqual(
      TARGET119_MIGRATION_SESSION_MEMORY_STATIC_OWNER_OVERRIDES.map(row => ({
        targetIndex: row.targetIndex,
        paths: row.paths,
        declarations: row.declarations,
        evidenceIds: row.evidenceIds,
      })),
      fixture.rows.map(row => ({
        targetIndex: row.targetIndex,
        paths: row.ownerPaths,
        declarations: row.declarations,
        evidenceIds: fixture.evidenceIds,
      })),
    )
    assert.equal(
      sha256(JSON.stringify(fixture.rows.map(row => row.targetIndex))),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      sha256(JSON.stringify(residueIdentities())),
      fixture.summary.residueIdentitiesSha256,
    )
    assert.equal(fixture.summary.units, 3)
    assert.equal(fixture.summary.residues, 10)
    assert.equal(
      fixture.rows.flatMap(row => row.residues).filter(row => row.targetAdded)
        .length,
      fixture.summary.strictResidues,
    )
  },
)

test(
  'authenticated baseline/target units pin every residue and exact structural pair',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const baseline = readExact(
      artifactPath('CLAUDE_CODE_2_1_118_BUNDLE', fixture.inputs.baselineBundle),
      fixture.inputs.baselineBundle,
      'Target118 bundle',
    ).toString('utf8')
    const target = readExact(
      artifactPath('CLAUDE_CODE_2_1_119_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'Target119 bundle',
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

    for (const row of fixture.rows) {
      const region = structural.regions[row.targetIndex]
      assert.equal(region.classification, row.classification)
      assert.equal(region.baselineUnitIndex, row.baseline.targetIndex)
      assert.equal(region.pairReason, row.pairReason)
      assert.equal(row.baseline.coarseHash, row.target.coarseHash)
      assert.equal(region.target.coarseHash, row.target.coarseHash)
      assert.equal(region.target.sourceHash, row.target.sha256)
      for (const [label, bundle, unit] of [
        ['baseline', baseline, row.baseline],
        ['target', target, row.target],
      ]) {
        const text = bundle.slice(unit.start, unit.end)
        assert.deepEqual(descriptor(text), {
          bytes: unit.bytes,
          sha256: unit.sha256,
        })
        const ast = parse(text, {
          ecmaVersion: 'latest',
          sourceType: 'script',
        })
        assert.equal(ast.body.length, 1, `${label} u${row.targetIndex}`)
        assert.equal(ast.body[0].type, unit.nodeType)
      }
      for (const residue of row.residues) {
        const raw = target.slice(residue.start, residue.end)
        const actual =
          residue.kind === 'string'
            ? JSON.parse(raw)
            : residue.kind === 'number'
              ? raw
              : raw
        assert.equal(actual, residue.value)
        assert.ok(residue.start >= row.target.start)
        assert.ok(residue.end <= row.target.end)
      }
    }
  },
)

test(
  'exact source declarations own both migrations and reject the stale Opus attribution',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  async () => {
    const ts = await loadTypeScript()
    for (const key of ['bypassMigration', 'sonnetMigration']) {
      const input = fixture.sources[key]
      const filename = path.join(sourceRoot, input.path.slice(4))
      const source = readExact(filename, input, input.path).toString('utf8')
      const sourceFile = ts.createSourceFile(
        filename,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      )
      const declaration = sourceFile.statements.find(
        node =>
          ts.isFunctionDeclaration(node) &&
          node.name?.text === input.declaration.name,
      )
      assert(declaration, input.declaration.name)
      const span = sourceSpan(source, sourceFile, declaration)
      assert.deepEqual(
        { start: span.start, end: span.end, chars: span.chars, sha256: span.sha256 },
        {
          start: input.declaration.start,
          end: input.declaration.end,
          chars: input.declaration.chars,
          sha256: input.declaration.sha256,
        },
      )
      if (key === 'bypassMigration') {
        assert.match(span.text, /bypassPermissionsModeAccepted/)
        assert.match(span.text, /skipDangerousModePermissionPrompt/)
        assert.match(span.text, /tengu_migrate_bypass_permissions_accepted/)
      } else {
        assert.match(span.text, /sonnet1m45MigrationComplete/)
        assert.equal((span.text.match(/sonnet\[1m\]/g) ?? []).length, 2)
        assert.equal(
          (span.text.match(/sonnet-4-5-20250929\[1m\]/g) ?? []).length,
          2,
        )
      }
    }

    const rejected = readExact(
      path.join(sourceRoot, fixture.sources.rejectedOpusMigration.path.slice(4)),
      fixture.sources.rejectedOpusMigration,
      'rejected Opus migration',
    ).toString('utf8')
    assert.match(rejected, /migrateOpusToOpus1m/)
    assert.doesNotMatch(rejected, /sonnet1m45MigrationComplete/)
    assert.doesNotMatch(rejected, /sonnet-4-5-20250929/)
  },
)

test(
  'session-memory last-message source spelling is equivalent to authenticated Array.at',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  async () => {
    const ts = await loadTypeScript()
    const input = fixture.sources.sessionMemory
    const filename = path.join(sourceRoot, input.path.slice(4))
    const source = readExact(filename, input, input.path).toString('utf8')
    const sourceFile = ts.createSourceFile(
      filename,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    let declaration
    function visit(node) {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === input.declaration.name
      ) {
        declaration = node
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    assert(declaration)
    const span = sourceSpan(source, sourceFile, declaration)
    assert.deepEqual(
      { start: span.start, end: span.end, chars: span.chars, sha256: span.sha256 },
      {
        start: input.declaration.start,
        end: input.declaration.end,
        chars: input.declaration.chars,
        sha256: input.declaration.sha256,
      },
    )
    assert.match(span.text, /messages\[messages\.length - 1\]/)
    assert.match(span.text, /tengu_session_memory_extraction/)

    for (const messages of [[], [undefined], ['a'], ['a', 'b'], [0, 1, 2]]) {
      assert.equal(messages[messages.length - 1], messages.at(-1))
    }
    const baseline = fs.readFileSync(
      artifactPath('CLAUDE_CODE_2_1_118_BUNDLE', fixture.inputs.baselineBundle),
      'utf8',
    )
    const target = fs.readFileSync(
      artifactPath('CLAUDE_CODE_2_1_119_BUNDLE', fixture.inputs.targetBundle),
      'utf8',
    )
    const row = fixture.rows.find(item => item.targetIndex === 21676)
    assert.match(
      baseline.slice(row.baseline.start, row.baseline.end),
      /\.at\(-1\)/,
    )
    assert.match(target.slice(row.target.start, row.target.end), /\.at\(-1\)/)
  },
)

test(
  'coverage accepts only the complete provisional or corrected three-unit state',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const coverage = JSON.parse(gunzipSync(fs.readFileSync(coveragePath)))
    const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
    const rows = fixture.rows.map(expected => {
      const row = coverage.rows.find(item => item.targetIndex === expected.targetIndex)
      assert(row, `u${expected.targetIndex}`)
      return {
        targetIndex: expected.targetIndex,
        paths: row.ownerIds.map(ownerId => owners.get(ownerId)),
        evidenceIds: row.evidenceIds,
      }
    })
    const corrected = fixture.rows.map(row => ({
      targetIndex: row.targetIndex,
      paths: row.ownerPaths,
      evidenceIds: fixture.evidenceIds,
    }))
    const provisional = [
      {
        targetIndex: 21594,
        paths: [
          'src/migrations/migrateBypassPermissionsAcceptedToSettings.ts',
        ],
        evidenceIds: ['source-map-attribution', 'semantic-test'],
      },
      {
        targetIndex: 21605,
        paths: ['src/migrations/migrateOpusToOpus1m.ts'],
        evidenceIds: ['source-map-attribution', 'semantic-test'],
      },
      {
        targetIndex: 21676,
        paths: ['src/services/SessionMemory/sessionMemory.ts'],
        evidenceIds: ['source-map-attribution', 'semantic-test'],
      },
    ]
    assert.ok(
      JSON.stringify(rows) === JSON.stringify(provisional) ||
        JSON.stringify(rows) === JSON.stringify(corrected),
      `unexpected partial coverage state: ${JSON.stringify(rows)}`,
    )
  },
)
