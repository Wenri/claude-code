import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import { TARGET118_BUNDLED_SKILLS_ROOT_OWNER_OVERRIDES } from '../cases/2.1.117-to-2.1.118/recovered/bundled-skills-root-owner-overrides.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-bundled-skills-root-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '32ac765dbf200144a7635f9854b8f285f1e6d6e3b5ba1c2e7705c61482e05b8c'
const targetBundlePath =
  process.env.CLAUDE_CODE_2_1_118_BUNDLE ??
  path.join(
    root,
    '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
  )
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.118/src'),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function canonicalRowsDigest(rows) {
  return sha256(Buffer.from(JSON.stringify(rows)))
}

function readPinnedJson(input) {
  const bytes = fs.readFileSync(path.join(root, input.path))
  assert.deepEqual(descriptor(bytes), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return JSON.parse(bytes)
}

function gitSource() {
  const input = fixture.inputs.historicalSource
  const result = spawnSync(
    'git',
    ['show', `${input.commit}:${input.file.path}`],
    { cwd: root, encoding: null },
  )
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), {
    bytes: input.file.bytes,
    sha256: input.file.sha256,
  })
  return result.stdout
}

function walkAcorn(node, visit) {
  if (!node || typeof node !== 'object') return
  if (typeof node.type === 'string') visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (['end', 'loc', 'range', 'start'].includes(key)) continue
    if (Array.isArray(child)) {
      for (const value of child) walkAcorn(value, visit)
    } else {
      walkAcorn(child, visit)
    }
  }
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

test(
  'Target118 bundled-skills root fixture pins the complete scanner partition',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(
      descriptor(fs.readFileSync(path.join(root, fixture.inputs.override.path))),
      {
        bytes: fixture.inputs.override.bytes,
        sha256: fixture.inputs.override.sha256,
      },
    )
    assert.deepEqual(
      TARGET118_BUNDLED_SKILLS_ROOT_OWNER_OVERRIDES.map(row => ({
        targetIndex: row.targetIndex,
        paths: [...row.paths],
        declarations: [...row.declarations],
        evidenceIds: [...row.evidenceIds],
        behavior: row.behavior,
      })),
      [
        {
          targetIndex: fixture.targetUnit.targetIndex,
          paths: fixture.ownerOverride.paths,
          declarations: fixture.targetUnit.declarations,
          evidenceIds: fixture.ownerOverride.evidenceIds,
          behavior: fixture.ownerOverride.behavior,
        },
      ],
    )
    assert.equal(
      canonicalRowsDigest([fixture.targetUnit.targetIndex]),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      canonicalRowsDigest(
        fixture.targetUnit.residues.map(row => [
          fixture.targetUnit.targetIndex,
          ...row,
        ]),
      ),
      fixture.summary.residueIdentitiesSha256,
    )
    assert.equal(
      canonicalRowsDigest(fixture.scannerPartition.rows),
      fixture.scannerPartition.residueIdentitiesSha256,
    )
    assert.deepEqual(
      fixture.scannerPartition.strictUnsupportedRows,
      fixture.targetUnit.residues.map(row => [
        fixture.targetUnit.targetIndex,
        ...row,
      ]),
    )
    const metadata = readPinnedJson(fixture.inputs.buildMetadataProof)
    assert.deepEqual(metadata.macro, fixture.macro)
    const analysis = readPinnedJson(fixture.inputs.ownerAnalysis)
    const mapping = analysis.analysis.sourceSupplementGaps.find(
      row => row.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert.ok(mapping)
    assert.deepEqual(
      {
        ownerPaths: mapping.ownerPaths,
        target: mapping.target,
        residues: mapping.residues,
        unsupportedResidues: mapping.unsupportedResidues,
        residueIdentitiesSha256: mapping.residueIdentitiesSha256,
        unsupportedResidueIdentitiesSha256:
          mapping.unsupportedResidueIdentitiesSha256,
      },
      {
        ownerPaths: ['utils/permissions/filesystem.ts'],
        target: {
          classification: fixture.targetUnit.classification,
          start: fixture.targetUnit.start,
          end: fixture.targetUnit.end,
          nodeType: fixture.targetUnit.nodeType,
          sourceHash: fixture.targetUnit.sourceHash,
        },
        residues: fixture.scannerPartition.residues,
        unsupportedResidues: fixture.summary.residues,
        residueIdentitiesSha256:
          fixture.scannerPartition.residueIdentitiesSha256,
        unsupportedResidueIdentitiesSha256:
          fixture.summary.residueIdentitiesSha256,
      },
    )
    assert.equal(
      spawnSync(
        'git',
        ['rev-parse', `${fixture.inputs.historicalSource.commit}^{tree}`],
        { cwd: root, encoding: 'utf8' },
      ).stdout.trim(),
      fixture.inputs.historicalSource.tree,
    )
    assert.equal(
      spawnSync(
        'git',
        [
          'rev-parse',
          `${fixture.inputs.historicalSource.commit}:${fixture.inputs.historicalSource.file.path}`,
        ],
        { cwd: root, encoding: 'utf8' },
      ).stdout.trim(),
      fixture.inputs.historicalSource.file.blob,
    )
    gitSource()
  },
)

test(
  'authenticated Target118 initializer is the exact bundled-skills root binding',
  { skip: !selected },
  () => {
    const bundle = fs.readFileSync(targetBundlePath)
    assert.deepEqual(descriptor(bundle), {
      bytes: fixture.inputs.targetBundle.bytes,
      sha256: fixture.inputs.targetBundle.sha256,
    })
    const ledgerBytes = fs.readFileSync(
      path.join(root, fixture.inputs.targetStructuralLedger.path),
    )
    assert.deepEqual(descriptor(ledgerBytes), {
      bytes: fixture.inputs.targetStructuralLedger.bytes,
      sha256: fixture.inputs.targetStructuralLedger.sha256,
    })
    const ledger = JSON.parse(gunzipSync(ledgerBytes))
    const region = ledger.regions.find(
      candidate => candidate.target.index === fixture.targetUnit.targetIndex,
    )
    assert.ok(region)
    assert.deepEqual(
      {
        classification: region.classification,
        start: region.target.start,
        end: region.target.end,
        bytes: region.target.end - region.target.start,
        tokenCount: region.target.tokenCount,
        nodeType: region.target.nodeType,
        sourceHash: region.target.sourceHash,
        coarseHash: region.target.coarseHash,
      },
      {
        classification: fixture.targetUnit.classification,
        start: fixture.targetUnit.start,
        end: fixture.targetUnit.end,
        bytes: fixture.targetUnit.bytes,
        tokenCount: fixture.targetUnit.tokenCount,
        nodeType: fixture.targetUnit.nodeType,
        sourceHash: fixture.targetUnit.sourceHash,
        coarseHash: fixture.targetUnit.coarseHash,
      },
    )
    assert.deepEqual(
      descriptor(
        bundle.subarray(fixture.targetUnit.start, fixture.targetUnit.end),
      ),
      { bytes: fixture.targetUnit.bytes, sha256: fixture.targetUnit.sourceHash },
    )
    const binding = bundle.subarray(
      fixture.targetBinding.start,
      fixture.targetBinding.end,
    )
    assert.deepEqual(descriptor(binding), {
      bytes: fixture.targetBinding.bytes,
      sha256: fixture.targetBinding.sha256,
    })
    const ast = parse(`${binding.toString()};`, { ecmaVersion: 'latest' })
    const calls = []
    walkAcorn(ast, node => {
      if (node.type === 'CallExpression') calls.push(node)
    })
    const randomBytes = calls.find(
      node =>
        node.callee.type === 'MemberExpression' &&
        node.callee.property.name === 'randomBytes',
    )
    assert.ok(randomBytes)
    assert.equal(randomBytes.arguments.length, 1)
    assert.equal(randomBytes.arguments[0].value, 16)
    const bindingText = binding.toString()
    for (const marker of [
      '.randomBytes(16).toString("hex")',
      '"bundled-skills"',
      `VERSION:"${fixture.macro.VERSION}"`,
      '}.VERSION',
    ]) {
      assert.ok(bindingText.includes(marker), `target binding marker ${marker}`)
    }
    for (const residue of fixture.scannerPartition.rows) {
      const expected =
        residue[1] === 'string' ? JSON.stringify(residue[2]) : residue[2]
      assert.equal(
        bundle.subarray(residue[3], residue[4]).toString(),
        expected,
      )
    }
  },
)

test(
  'historical getBundledSkillsRoot declaration owns the complete runtime expression',
  { skip: !selected },
  async () => {
    const historical = gitSource()
    const configured = fs.readFileSync(
      path.join(
        sourceRoot,
        fixture.inputs.historicalSource.file.path.slice('src/'.length),
      ),
    )
    assert.deepEqual(configured, historical)
    const ts = await loadTypeScript()
    const text = historical.toString()
    const sourceFile = ts.createSourceFile(
      'filesystem.ts',
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    const declarations = []
    function visit(node) {
      if (
        ts.isVariableDeclaration(node) &&
        node.name.getText(sourceFile) ===
          fixture.inputs.historicalSource.declaration.name
      ) {
        declarations.push(node)
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    assert.equal(declarations.length, 1)
    const declaration = declarations[0]
    const characterStart = declaration.getStart(sourceFile)
    const characterEnd = declaration.end
    const byteStart = Buffer.byteLength(text.slice(0, characterStart))
    const byteEnd = Buffer.byteLength(text.slice(0, characterEnd))
    assert.deepEqual(
      {
        name: declaration.name.getText(sourceFile),
        characterStart,
        characterEnd,
        byteStart,
        byteEnd,
        ...descriptor(historical.subarray(byteStart, byteEnd)),
      },
      fixture.inputs.historicalSource.declaration,
    )
    const declarationText = declaration.getText(sourceFile)
    for (const marker of [
      "randomBytes(16).toString('hex')",
      "join(getClaudeTempDir(), 'bundled-skills', MACRO.VERSION, nonce)",
    ]) {
      assert.ok(
        declarationText.includes(marker),
        `source declaration marker ${marker}`,
      )
    }
    const cryptoImports = sourceFile.statements.filter(
      statement =>
        ts.isImportDeclaration(statement) &&
        statement.moduleSpecifier.text === 'crypto',
    )
    assert.equal(cryptoImports.length, 1)
    const namedImports = cryptoImports[0].importClause.namedBindings.elements.map(
      element => element.name.text,
    )
    assert.ok(namedImports.includes('randomBytes'))
  },
)

test(
  'bundled-skills root owner coverage evolves only as the complete proof row',
  { skip: !selected },
  () => {
    const coverage = JSON.parse(
      gunzipSync(
        fs.readFileSync(
          path.join(
            root,
            'recovery/cases/2.1.117-to-2.1.118/semantic/source-coverage.json.gz',
          ),
        ),
      ),
    )
    const row = coverage.rows.find(
      candidate => candidate.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert.ok(row)
    const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
    assert.deepEqual(
      row.ownerIds.map(ownerId => owners.get(ownerId)),
      fixture.ownerOverride.paths,
    )
    const provisional =
      JSON.stringify(row.evidenceIds) ===
      JSON.stringify(['source-map-attribution', 'semantic-test'])
    const corrected =
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(fixture.ownerOverride.evidenceIds) &&
      row.behavior === fixture.ownerOverride.behavior
    assert.ok(provisional || corrected)
  },
)
