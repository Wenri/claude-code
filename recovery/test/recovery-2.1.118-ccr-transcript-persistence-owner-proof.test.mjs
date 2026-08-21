import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import { TARGET118_CCR_TRANSCRIPT_PERSISTENCE_OWNER_OVERRIDES } from '../cases/2.1.117-to-2.1.118/recovered/ccr-transcript-persistence-owner-overrides.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-ccr-transcript-persistence-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'c4c5cd4eb5e36260cd7a351196fd46541eddf12a14276c5ca037aadd2dca1bdd'
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

function readPinned(input) {
  const bytes = fs.readFileSync(path.join(root, input.path))
  assert.deepEqual(descriptor(bytes), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return bytes
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

function countText(text, needle) {
  let count = 0
  let offset = -1
  while ((offset = text.indexOf(needle, offset + 1)) !== -1) count += 1
  return count
}

test(
  'Target118 CCR transcript fixture pins the complete semantic obligation',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(descriptor(readPinned(fixture.inputs.override)), {
      bytes: fixture.inputs.override.bytes,
      sha256: fixture.inputs.override.sha256,
    })
    assert.deepEqual(
      TARGET118_CCR_TRANSCRIPT_PERSISTENCE_OWNER_OVERRIDES.map(row => ({
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

    const analysis = JSON.parse(readPinned(fixture.inputs.ownerAnalysis))
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
          obligationIds: [fixture.semanticObligation.id],
          sourcePaths: fixture.semanticObligation.sourcePaths,
          testIds: fixture.semanticObligation.testIds,
        },
      },
    )

    const obligations = JSON.parse(readPinned(fixture.inputs.semanticObligations))
    const obligation = obligations.obligations.find(
      candidate => candidate.id === fixture.semanticObligation.id,
    )
    assert.ok(obligation)
    assert.equal(
      obligation.classification,
      fixture.semanticObligation.classification,
    )
    assert.deepEqual(obligation.testIds, fixture.semanticObligation.testIds)
    assert.deepEqual(
      obligation.sourceAssertions.map(assertion => assertion.path),
      fixture.semanticObligation.sourcePaths,
    )
    assert.deepEqual(
      obligation.targetFragments.map(fragment => ({
        text: fragment.text,
        baselineCount: fragment.baselineCount,
        targetCount: fragment.targetCount,
      })),
      [{ text: 'ccr-api', baselineCount: 0, targetCount: 2 }],
    )
    readPinned(fixture.inputs.runtimeWitness)
    assert.ok(analysis.testCatalog.ids.includes(fixture.inputs.runtimeWitness.id))
    assert.deepEqual(
      analysis.testCatalog.files.find(
        file => file.path === fixture.inputs.runtimeWitness.path,
      ),
      {
        path: fixture.inputs.runtimeWitness.path,
        bytes: fixture.inputs.runtimeWitness.bytes,
        sha256: fixture.inputs.runtimeWitness.sha256,
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
      ...fixture.inputs.historicalSource.files,
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
  'authenticated target fragments close the CCR capability producer-consumer chain',
  { skip: !selected },
  () => {
    const bundle = fs.readFileSync(targetBundlePath)
    assert.deepEqual(descriptor(bundle), {
      bytes: fixture.inputs.targetBundle.bytes,
      sha256: fixture.inputs.targetBundle.sha256,
    })
    const ledgerBytes = readPinned(fixture.inputs.targetStructuralLedger)
    const ledger = JSON.parse(gunzipSync(ledgerBytes))
    const structural = new Map(
      ledger.regions.map(region => [region.target.index, region]),
    )
    const region = structural.get(fixture.targetUnit.targetIndex)
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
    const targetText = bundle
      .subarray(fixture.targetUnit.start, fixture.targetUnit.end)
      .toString()
    assert.deepEqual(
      descriptor(Buffer.from(targetText)),
      { bytes: fixture.targetUnit.bytes, sha256: fixture.targetUnit.sourceHash },
    )
    const targetAst = parse(targetText, { ecmaVersion: 'latest' })
    assert.equal(targetAst.body.length, 1)
    assert.equal(targetAst.body[0].type, 'FunctionDeclaration')

    const fragmentTexts = {}
    for (const [name, fragment] of Object.entries(fixture.targetFragments)) {
      const bytes = bundle.subarray(fragment.start, fragment.end)
      assert.deepEqual(descriptor(bytes), {
        bytes: fragment.bytes,
        sha256: fragment.sha256,
      })
      const parent = structural.get(fragment.structuralIndex)
      assert.ok(parent, `${name}: structural unit`)
      assert.ok(parent.target.start <= fragment.start, `${name}: starts in unit`)
      assert.ok(parent.target.end >= fragment.end, `${name}: ends in unit`)
      fragmentTexts[name] = bytes.toString()
      assert.equal(
        countText(bundle.toString(), fragmentTexts[name]),
        1,
        `${name}: unique authenticated fragment`,
      )
    }
    assert.equal(
      fragmentTexts.capabilityGetter,
      'function zYH(){return x$.caps}',
    )
    assert.equal(fragmentTexts.capabilitySetter, 'function Qf8(H){x$.caps=H}')
    assert.ok(fragmentTexts.defaultCapabilities.includes('workspace:"local"'))
    assert.ok(
      fragmentTexts.defaultCapabilities.includes(
        'transcriptSource:"local-jsonl"',
      ),
    )
    assert.ok(fragmentTexts.ccrProducer.includes('jL.kind==="ccr"'))
    assert.ok(fragmentTexts.ccrProducer.includes('?"ccr-api":"local-jsonl"'))
    assert.ok(fragmentTexts.ccrProducer.includes('transcriptSource:g$'))
    assert.equal(
      fragmentTexts.persistenceGuard,
      'if(zYH().transcriptSource==="ccr-api")return;',
    )
    assert.ok(targetText.includes(fragmentTexts.persistenceGuard))
    assert.equal(countText(bundle.toString(), '"ccr-api"'), 2)
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
  'historical source exposes the exact CCR transport and useLogMessages guard',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const sourceFiles = new Map()
    const historicalBytes = new Map()
    for (const input of fixture.inputs.historicalSource.files) {
      const historical = gitFile(input)
      historicalBytes.set(input.path, historical)
      const text = historical.toString()
      sourceFiles.set(
        input.path,
        ts.createSourceFile(
          input.path,
          text,
          ts.ScriptTarget.Latest,
          true,
          input.path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
        ),
      )
    }

    const configuredSourceFiles = new Map()
    for (const input of fixture.inputs.historicalSource.files) {
      const filename = path.join(sourceRoot, input.path.slice('src/'.length))
      const bytes = fs.readFileSync(filename)
      const text = bytes.toString()
      configuredSourceFiles.set(
        input.path,
        ts.createSourceFile(
          input.path,
          text,
          ts.ScriptTarget.Latest,
          true,
          input.path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
        ),
      )
    }

    function namedDeclarations(sourceFile) {
      const declarations = new Map()
      function visit(node) {
        let name
        if (ts.isFunctionDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
          name = node.name?.text
        }
        if (ts.isVariableDeclaration(node)) name = node.name.getText(sourceFile)
        if (name) {
          const rows = declarations.get(name) ?? []
          rows.push(node)
          declarations.set(name, rows)
        }
        ts.forEachChild(node, visit)
      }
      visit(sourceFile)
      return declarations
    }

    for (const expected of fixture.inputs.historicalSource.declarations) {
      const historicalFile = sourceFiles.get(expected.path)
      const configuredFile = configuredSourceFiles.get(expected.path)
      const historical = namedDeclarations(historicalFile).get(expected.name)
      const configured = namedDeclarations(configuredFile).get(expected.name)
      assert.equal(historical?.length, 1, `${expected.name}: historical declaration`)
      assert.equal(configured?.length, 1, `${expected.name}: configured declaration`)
      const declaration = historical[0]
      const text = historicalFile.text
      const characterStart = declaration.getStart(historicalFile)
      const characterEnd = declaration.end
      const byteStart = Buffer.byteLength(text.slice(0, characterStart))
      const byteEnd = Buffer.byteLength(text.slice(0, characterEnd))
      assert.deepEqual(
        {
          path: expected.path,
          name: expected.name,
          characterStart,
          characterEnd,
          byteStart,
          byteEnd,
          ...descriptor(
            historicalBytes.get(expected.path).subarray(byteStart, byteEnd),
          ),
        },
        expected,
      )
      assert.deepEqual(
        descriptor(Buffer.from(configured[0].getText(configuredFile))),
        { bytes: expected.bytes, sha256: expected.sha256 },
        `${expected.name}: configured declaration stays exact`,
      )
    }

    const useLogSource = configuredSourceFiles.get(
      'src/hooks/useLogMessages.ts',
    ).text
    assert.equal(
      countText(
        useLogSource,
        "getRuntimeCapabilities().remote?.kind === 'ccr'",
      ),
      1,
    )
    const bootstrapSource = configuredSourceFiles.get('src/bootstrap/state.ts')
      .text
    for (const marker of [
      "kind: 'ccr' | 'direct' | 'ssh'",
      'remote: STATE.activeRemoteControlTransport',
      'STATE.activeRemoteControlTransport = transport',
    ]) {
      assert.equal(countText(bootstrapSource, marker), 1, marker)
    }
    const replSource = configuredSourceFiles.get('src/screens/REPL.tsx').text
    for (const marker of [
      "remoteSession.isRemoteMode ? 'ccr' : sshRemote.isRemoteMode ? 'ssh' : 'direct'",
      'setActiveRemoteControlTransport(activeRemoteControlTransport)',
      'setActiveRemoteControlTransport(null)',
    ]) {
      assert.equal(countText(replSource, marker), 1, marker)
    }
    const effectStart = replSource.lastIndexOf(
      'useEffect(() => {',
      replSource.indexOf(
        'setActiveRemoteControlTransport(activeRemoteControlTransport)',
      ),
    )
    const effectSuffix = '}, [activeRemoteControlTransport]);'
    const effectEnd = replSource.indexOf(effectSuffix, effectStart) +
      effectSuffix.length
    assert.deepEqual(
      descriptor(Buffer.from(replSource.slice(effectStart, effectEnd))),
      {
        bytes: fixture.inputs.historicalSource.transportEffect.bytes,
        sha256: fixture.inputs.historicalSource.transportEffect.sha256,
      },
    )

    const rejected = gitFile(fixture.inputs.rejectedProvisionalOwner).toString()
    for (const absent of [
      'getRuntimeCapabilities',
      'transcriptSource',
      'ccr-api',
      'useLogMessages',
    ]) {
      assert.equal(rejected.includes(absent), false, `rejected owner lacks ${absent}`)
    }
  },
)

test(
  'target transcriptSource and recovered remote-kind predicates are equivalent',
  { skip: !selected },
  () => {
    const actual = [null, 'ccr', 'direct', 'ssh'].map(remoteKind => {
      const isRemoteMode = remoteKind !== null
      const targetTranscriptSource =
        isRemoteMode && remoteKind === 'ccr' ? 'ccr-api' : 'local-jsonl'
      return {
        remoteKind,
        targetTranscriptSource,
        targetSkipsPersistence: targetTranscriptSource === 'ccr-api',
        sourceSkipsPersistence: remoteKind === 'ccr',
      }
    })
    assert.deepEqual(actual, fixture.semanticInvariant.truthTable)
    assert.ok(
      actual.every(
        row => row.targetSkipsPersistence === row.sourceSkipsPersistence,
      ),
    )
  },
)

test(
  'CCR transcript coverage evolves only as the complete owner proof',
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
