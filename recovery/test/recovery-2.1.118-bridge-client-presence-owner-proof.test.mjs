import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import { TARGET118_BRIDGE_CLIENT_PRESENCE_OWNER_OVERRIDES } from '../cases/2.1.117-to-2.1.118/recovered/bridge-client-presence-owner-overrides.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-bridge-client-presence-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '3fd25f75bdc5000eda73b9bee5b6825ed2387bc5389c3503433dabf2152577c1'
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
  'Target118 bridge-presence fixture pins its complete scanner partition',
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
      TARGET118_BRIDGE_CLIENT_PRESENCE_OWNER_OVERRIDES.map(row => ({
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
        rowScopedEvidence: mapping.rowScopedEvidence,
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
        rowScopedEvidence: {
          obligationIds: [],
          sourcePaths: [],
          testIds: [],
        },
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
  'authenticated target units form one complete bridge-presence owner cluster',
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
    const structural = new Map(
      ledger.regions.map(region => [region.target.index, region]),
    )
    for (const expected of [
      fixture.targetUnit,
      ...fixture.supportingTargetUnits,
    ]) {
      const region = structural.get(expected.targetIndex)
      assert.ok(region, `u${expected.targetIndex}: structural unit`)
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
          classification: expected.classification,
          start: expected.start,
          end: expected.end,
          bytes: expected.bytes,
          tokenCount: expected.tokenCount,
          nodeType: expected.nodeType,
          sourceHash: expected.sourceHash,
          coarseHash: expected.coarseHash,
        },
      )
      assert.deepEqual(
        descriptor(bundle.subarray(expected.start, expected.end)),
        { bytes: expected.bytes, sha256: expected.sourceHash },
      )
    }
    const targetText = bundle
      .subarray(fixture.targetUnit.start, fixture.targetUnit.end)
      .toString()
    const ast = parse(targetText, { ecmaVersion: 'latest' })
    assert.equal(ast.body.length, 1)
    assert.equal(ast.body[0].type, 'FunctionDeclaration')
    for (const marker of [
      'Date.now()',
      'new Date(H).toISOString()',
      '/v1/code/sessions/',
      '/client/presence',
      'client_id:ci1,connected_at:IG6',
      '"anthropic-version":"2023-06-01"',
      '"anthropic-client-platform":YDH()',
      'timeout:G$4,validateStatus:()=>!0',
      'q.status>=400',
      '},()=>{})',
    ]) {
      assert.ok(targetText.includes(marker), `target marker ${marker}`)
    }
    const supportingText = fixture.supportingTargetUnits
      .map(unit => bundle.subarray(unit.start, unit.end).toString())
      .join('\n')
    for (const marker of [
      'tengu_bridge_client_presence_enabled',
      'terminal focus',
      'EG6?.()',
      'hG6?.()',
      'G$4=5000',
      'randomUUID()',
    ]) {
      assert.ok(supportingText.includes(marker), `supporting marker ${marker}`)
    }
    for (const [index, residue] of fixture.scannerPartition.rows.entries()) {
      assert.equal(
        bundle.subarray(residue[3], residue[4]).toString(),
        fixture.scannerPartition.rawTargetSlices[index],
      )
    }
  },
)

test(
  'historical pulseBridgeClientPresence owns the exact source behavior',
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
      'clientPresence.ts',
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    const declarations = new Map()
    function visit(node) {
      let name
      if (ts.isFunctionDeclaration(node)) name = node.name?.text
      if (ts.isVariableDeclaration(node)) name = node.name.getText(sourceFile)
      if (name) {
        const rows = declarations.get(name) ?? []
        rows.push(node)
        declarations.set(name, rows)
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    for (const expected of fixture.inputs.historicalSource.declarations) {
      const matches = declarations.get(expected.name)
      assert.equal(matches?.length, 1, expected.name)
      const declaration = matches[0]
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
    const throttle = declarations.get('PRESENCE_THROTTLE_MS')[0]
    assert.equal(throttle.initializer.getText(sourceFile), '5_000')
    const clientId = declarations.get('clientId')[0]
    assert.equal(clientId.initializer.getText(sourceFile), 'randomUUID()')
    const pulse = declarations.get('pulseBridgeClientPresence')[0]
    const pulseText = pulse.getText(sourceFile)
    for (const marker of [
      'if (!presence) return',
      'now - lastPulseAt < PRESENCE_THROTTLE_MS',
      'connectedAt ??= new Date(now).toISOString()',
      '${presence.baseUrl}/v1/code/sessions/${presence.sessionId}/client/presence',
      '{ client_id: clientId, connected_at: connectedAt }',
      "'anthropic-version': '2023-06-01'",
      "'anthropic-client-platform': getClientPlatform()",
      'timeout: PRESENCE_THROTTLE_MS',
      'validateStatus: () => true',
      'response.status >= 400',
      '() => {}',
    ]) {
      assert.ok(pulseText.includes(marker), `source pulse marker ${marker}`)
    }
    const setupText = declarations
      .get('setupBridgeClientPresence')[0]
      .getText(sourceFile)
    for (const marker of [
      'cleanupBridgeClientPresence()',
      "'tengu_bridge_client_presence_enabled'",
      'onInteraction(pulseBridgeClientPresence)',
      'subscribeTerminalFocus',
      'pulseBridgeClientPresence()',
    ]) {
      assert.ok(setupText.includes(marker), `source setup marker ${marker}`)
    }
    const cleanupText = declarations
      .get('cleanupBridgeClientPresence')[0]
      .getText(sourceFile)
    for (const marker of [
      'unsubscribeInteraction?.()',
      'unsubscribeTerminalFocus?.()',
      'presence = undefined',
      'connectedAt = undefined',
    ]) {
      assert.ok(cleanupText.includes(marker), `source cleanup marker ${marker}`)
    }
    const axiosImports = sourceFile.statements.filter(
      statement =>
        ts.isImportDeclaration(statement) &&
        statement.moduleSpecifier.text === 'axios',
    )
    assert.equal(axiosImports.length, 1)
    assert.equal(axiosImports[0].importClause.name.text, 'axios')

    const rejected = gitFile(fixture.inputs.rejectedProvisionalOwner).toString()
    for (const absent of [
      'pulseBridgeClientPresence',
      '/client/presence',
      'client_id',
      'anthropic-client-platform',
    ]) {
      assert.equal(rejected.includes(absent), false, `rejected owner lacks ${absent}`)
    }
  },
)

test(
  'bridge-presence coverage evolves only as the complete owner proof',
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
