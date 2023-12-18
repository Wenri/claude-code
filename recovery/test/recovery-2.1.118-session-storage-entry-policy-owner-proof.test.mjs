import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import { TARGET118_SESSION_STORAGE_ENTRY_POLICY_OWNER_OVERRIDES } from '../cases/2.1.117-to-2.1.118/recovered/session-storage-entry-policy-owner-overrides.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-session-storage-entry-policy-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'dfa836abcc9e050273ba5735590f5c4b932eae19228021b8ff78f54e6b79fde6'
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
  'Target118 session-storage entry-policy fixture and prior partition are exact',
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
      TARGET118_SESSION_STORAGE_ENTRY_POLICY_OWNER_OVERRIDES.map(row => ({
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
        rowScopedEvidence: mapping.rowScopedEvidence,
      },
      {
        ownerPaths: ['utils/sessionStorage.ts'],
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
        rowScopedEvidence: fixture.existingRowScopedEvidence,
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
  'authenticated Target118 policy object and appendEntry switch bind route-by-agent',
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
    for (const expected of [fixture.targetUnit, fixture.supportingTargetUnit]) {
      const region = ledger.regions.find(
        candidate => candidate.target.index === expected.targetIndex,
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

    const policy = fixture.targetPolicyObject
    const policyBytes = bundle.subarray(policy.start, policy.end)
    assert.deepEqual(descriptor(policyBytes), {
      bytes: policy.bytes,
      sha256: policy.sha256,
    })
    const policyAst = parse(`(${policyBytes.toString()})`, {
      ecmaVersion: 'latest',
    }).body[0].expression
    assert.equal(policyAst.type, 'ObjectExpression')
    const entries = new Map(
      policyAst.properties.map(property => [
        property.key.name ?? property.key.value,
        property.value.value,
      ]),
    )
    assert.deepEqual(
      [...entries]
        .filter(([, value]) => value === 'route-by-agent')
        .map(([key]) => key),
      policy.routeByAgentTypes,
    )

    const supporting = fixture.supportingTargetUnit
    const classBytes = bundle.subarray(supporting.start, supporting.end)
    const classAst = parse(classBytes.toString(), { ecmaVersion: 'latest' })
      .body[0]
    const appendEntry = classAst.body.body.find(
      node => node.type === 'MethodDefinition' && node.key.name === 'appendEntry',
    )
    assert.ok(appendEntry)
    assert.deepEqual(
      descriptor(
        bundle.subarray(
          supporting.start + appendEntry.start,
          supporting.start + appendEntry.end,
        ),
      ),
      {
        bytes: supporting.appendEntryMethod.bytes,
        sha256: supporting.appendEntryMethod.sha256,
      },
    )
    let policySwitch
    walkAcorn(appendEntry, node => {
      if (node.type === 'SwitchStatement') policySwitch = node
    })
    assert.ok(policySwitch)
    assert.deepEqual(
      descriptor(
        bundle.subarray(
          supporting.start + policySwitch.start,
          supporting.start + policySwitch.end,
        ),
      ),
      {
        bytes: supporting.policySwitch.bytes,
        sha256: supporting.policySwitch.sha256,
      },
    )
    const switchText = classBytes
      .subarray(policySwitch.start, policySwitch.end)
      .toString()
    for (const marker of [
      'Ia7[H.type]',
      'case"route-by-agent"',
      'H.type==="content-replacement"',
      'H.type==="fork-context-ref"',
      'H.agentId?gW(H.agentId)',
      'this.enqueueWrite(A,H)',
    ]) {
      assert.ok(switchText.includes(marker), `target switch marker ${marker}`)
    }
    for (const residue of fixture.scannerPartition.rows) {
      assert.equal(
        bundle.subarray(residue[3], residue[4]).toString(),
        residue[1] === 'string' ? JSON.stringify(residue[2]) : residue[2],
      )
    }
  },
)

test(
  'historical appendEntry source owns both explicit agent-routing branches',
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
      'sessionStorage.ts',
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    const methods = []
    function visit(node) {
      if (
        ts.isMethodDeclaration(node) &&
        node.name.getText(sourceFile) === 'appendEntry'
      ) {
        methods.push(node)
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    assert.equal(methods.length, 1)
    const method = methods[0]
    const characterStart = method.getStart(sourceFile)
    const characterEnd = method.end
    const byteStart = Buffer.byteLength(text.slice(0, characterStart))
    const byteEnd = Buffer.byteLength(text.slice(0, characterEnd))
    assert.deepEqual(
      {
        name: method.name.getText(sourceFile),
        characterStart,
        characterEnd,
        byteStart,
        byteEnd,
        ...descriptor(historical.subarray(byteStart, byteEnd)),
      },
      fixture.inputs.historicalSource.appendEntryMethod,
    )
    const methodText = method.getText(sourceFile)
    assert.equal(methodText.includes('route-by-agent'), false)
    for (const marker of [
      "entry.type === 'content-replacement'",
      'entry.agentId',
      '? getAgentTranscriptPath(entry.agentId)',
      ': sessionFile',
      "entry.type === 'fork-context-ref'",
      'getAgentTranscriptPath(entry.agentId)',
      'this.enqueueWrite(targetFile, entry)',
    ]) {
      assert.ok(methodText.includes(marker), `source branch marker ${marker}`)
    }
    const branchKinds = []
    function visitMethod(node) {
      if (ts.isIfStatement(node)) {
        const condition = node.expression.getText(sourceFile)
        for (const type of fixture.targetPolicyObject.routeByAgentTypes) {
          if (condition === `entry.type === '${type}'`) branchKinds.push(type)
        }
      }
      ts.forEachChild(node, visitMethod)
    }
    visitMethod(method)
    assert.deepEqual(branchKinds, fixture.targetPolicyObject.routeByAgentTypes)
  },
)

test(
  'table-driven and explicit entry routing are equivalent and coverage is atomic',
  { skip: !selected },
  () => {
    const agentPath = agentId => `/agents/${agentId}.jsonl`
    const historicalRoute = (entry, sessionFile) => {
      if (entry.type === 'content-replacement') {
        return entry.agentId ? agentPath(entry.agentId) : sessionFile
      }
      if (entry.type === 'fork-context-ref') return agentPath(entry.agentId)
      return sessionFile
    }
    const targetRoute = (entry, sessionFile) => {
      const policy =
        entry.type === 'content-replacement' ||
        entry.type === 'fork-context-ref'
          ? 'route-by-agent'
          : 'always'
      if (policy !== 'route-by-agent') return sessionFile
      return entry.agentId ? agentPath(entry.agentId) : sessionFile
    }
    for (const scenario of [
      { type: 'content-replacement' },
      { type: 'content-replacement', agentId: 'agent-1' },
      { type: 'fork-context-ref', agentId: 'agent-2' },
      { type: 'summary' },
    ]) {
      assert.equal(
        targetRoute(scenario, '/session.jsonl'),
        historicalRoute(scenario, '/session.jsonl'),
        JSON.stringify(scenario),
      )
    }

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
    assert.deepEqual(paths, fixture.ownerOverride.paths)
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
