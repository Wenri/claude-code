import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import { TARGET118_BACKGROUND_WORK_STATE_OWNER_OVERRIDES } from '../cases/2.1.117-to-2.1.118/recovered/background-work-state-owner-overrides.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-background-work-state-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '40212d0bff1601862447b5044eac552023538e603fa53a0e177015d3f4351760'
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

function gitFile(input) {
  const result = spawnSync(
    'git',
    ['show', `${fixture.inputs.historicalSource.commit}:${input.path}`],
    { cwd: root, encoding: null },
  )
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return result.stdout
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
  'Target118 background-work state fixture pins its complete scanner partition',
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
      TARGET118_BACKGROUND_WORK_STATE_OWNER_OVERRIDES.map(row => ({
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
    const proofRows = fixture.targetUnit.residues.map(row => [
      fixture.targetUnit.targetIndex,
      ...row,
    ])
    assert.equal(
      canonicalRowsDigest(proofRows),
      fixture.summary.residueIdentitiesSha256,
    )
    assert.equal(
      canonicalRowsDigest(fixture.scannerPartition.rows),
      fixture.scannerPartition.residueIdentitiesSha256,
    )
    assert.deepEqual(fixture.scannerPartition.strictUnsupportedRows, proofRows)

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
        ownerPaths: [
          fixture.targetUnit.provisionalOwnerPath.replace(/^src\//, ''),
        ],
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
    for (const input of [
      fixture.inputs.historicalSource.file,
      fixture.inputs.rejectedProvisionalOwner,
    ]) {
      assert.equal(
        spawnSync(
          'git',
          [
            'rev-parse',
            `${fixture.inputs.historicalSource.commit}:${input.path}`,
          ],
          { cwd: root, encoding: 'utf8' },
        ).stdout.trim(),
        input.blob,
      )
      gitFile(input)
    }
  },
)

test(
  'authenticated Target118 target unit is exactly the background-work state initializer',
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
    const regions = ledger.regions.filter(
      candidate => candidate.target.index === fixture.targetUnit.targetIndex,
    )
    assert.equal(regions.length, 1)
    const region = regions[0]
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
    const binding = bundle.subarray(
      fixture.targetBinding.start,
      fixture.targetBinding.end,
    )
    assert.deepEqual(descriptor(binding), {
      bytes: fixture.targetBinding.bytes,
      sha256: fixture.targetBinding.sha256,
    })
    const ast = parse(binding.toString(), { ecmaVersion: 'latest' })
    assert.equal(ast.body.length, 1)
    const declaration = ast.body[0].declarations[0]
    assert.equal(declaration.init.type, 'CallExpression')
    const callback = declaration.init.arguments[0]
    assert.equal(callback.type, 'ArrowFunctionExpression')
    const assignment = callback.body.body[0].expression
    assert.equal(assignment.type, 'AssignmentExpression')
    assert.equal(assignment.right.type, 'ObjectExpression')
    assert.deepEqual(
      assignment.right.properties.map(property => property.key.name),
      ['tasks', 'queued', 'kinds'],
    )
    assert.equal(assignment.right.properties[0].value.value, 0)
    assert.equal(assignment.right.properties[1].value.value, 0)
    assert.equal(assignment.right.properties[2].value.type, 'ArrayExpression')
    assert.equal(assignment.right.properties[2].value.elements.length, 0)
    for (const residue of fixture.scannerPartition.rows) {
      assert.equal(
        bundle.subarray(residue[3], residue[4]).toString(),
        residue[2],
      )
    }
  },
)

test(
  'historical backgroundWorkState declaration owns the exact state and accessors',
  { skip: !selected },
  async () => {
    const historical = gitFile(fixture.inputs.historicalSource.file)
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
      'backgroundWorkState.ts',
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    const declarations = new Map()
    for (const statement of sourceFile.statements) {
      let name
      if (ts.isTypeAliasDeclaration(statement)) name = statement.name.text
      if (ts.isVariableStatement(statement)) {
        assert.equal(statement.declarationList.declarations.length, 1)
        name = statement.declarationList.declarations[0].name.getText(sourceFile)
      }
      if (ts.isFunctionDeclaration(statement)) name = statement.name?.text
      assert.ok(name)
      declarations.set(name, statement)
    }
    const expectedDeclarations = [
      fixture.inputs.historicalSource.typeDeclaration,
      fixture.inputs.historicalSource.stateDeclaration,
      fixture.inputs.historicalSource.setterDeclaration,
      fixture.inputs.historicalSource.getterDeclaration,
    ]
    for (const expected of expectedDeclarations) {
      const declaration = declarations.get(expected.name)
      assert.ok(declaration, expected.name)
      const characterStart = declaration.getStart(sourceFile)
      const characterEnd = declaration.end
      const byteStart = Buffer.byteLength(text.slice(0, characterStart))
      const byteEnd = Buffer.byteLength(text.slice(0, characterEnd))
      assert.deepEqual(
        {
          name: expected.name,
          characterStart,
          characterEnd,
          byteStart,
          byteEnd,
          ...descriptor(historical.subarray(byteStart, byteEnd)),
        },
        expected,
      )
    }

    const typeDeclaration = declarations.get('BackgroundWorkState')
    assert.deepEqual(
      typeDeclaration.type.members.map(member => member.name.getText(sourceFile)),
      ['tasks', 'queued', 'kinds'],
    )
    const stateStatement = declarations.get('backgroundWorkState')
    const state = stateStatement.declarationList.declarations[0]
    assert.equal(state.type.getText(sourceFile), 'BackgroundWorkState')
    assert.deepEqual(
      state.initializer.properties.map(property => property.name.getText(sourceFile)),
      ['tasks', 'queued', 'kinds'],
    )
    assert.equal(state.initializer.properties[0].initializer.text, '0')
    assert.equal(state.initializer.properties[1].initializer.text, '0')
    assert.equal(state.initializer.properties[2].initializer.elements.length, 0)
    assert.ok(
      declarations
        .get('setBackgroundWorkState')
        .getText(sourceFile)
        .includes('backgroundWorkState = state'),
    )
    assert.ok(
      declarations
        .get('getBackgroundWorkState')
        .getText(sourceFile)
        .includes('return backgroundWorkState'),
    )

    const rejected = gitFile(fixture.inputs.rejectedProvisionalOwner).toString()
    for (const absent of [
      'backgroundWorkState',
      'setBackgroundWorkState',
      'getBackgroundWorkState',
    ]) {
      assert.equal(rejected.includes(absent), false, `rejected owner lacks ${absent}`)
    }
  },
)

test(
  'background-work state coverage evolves only as the complete owner proof',
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
    const paths = row.ownerIds.map(ownerId => owners.get(ownerId))
    const provisional =
      JSON.stringify(paths) ===
        JSON.stringify([fixture.targetUnit.provisionalOwnerPath]) &&
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(['source-map-attribution', 'semantic-test'])
    const corrected =
      JSON.stringify(paths) === JSON.stringify(fixture.ownerOverride.paths) &&
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(fixture.ownerOverride.evidenceIds) &&
      row.behavior === fixture.ownerOverride.behavior
    assert.ok(provisional || corrected)
  },
)
