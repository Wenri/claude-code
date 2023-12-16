import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET121_DAEMON_SUPERVISOR_EVIDENCE_IDS,
  TARGET121_DAEMON_SUPERVISOR_OWNER_OVERRIDES,
} from '../cases/2.1.120-to-2.1.121/recovered/daemon-supervisor-owner-overrides.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.121-daemon-supervisor-owner-proofs.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '4be8cd934d5b395a7ea9ef4e55ef0043ef3b35236d7df644d020e7cfa94d31fc'
const baselineBundlePath =
  process.env.CLAUDE_CODE_2_1_120_BUNDLE ??
  path.join(root, fixture.inputs.baselineBundle.path)
const targetBundlePath =
  process.env.CLAUDE_CODE_2_1_121_BUNDLE ??
  path.join(root, fixture.inputs.targetBundle.path)
const sourceRoot =
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
  path.join(root, '.recovery-tmp/semantic-trees/2.1.121/src')
const typedReportPath =
  process.env.CLAUDE_CODE_2_1_121_TYPED_REPORT ??
  path.join(
    root,
    '.recovery-tmp/residue-audits/2.1.120-to-2.1.121.typed-audit.json',
  )

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })
const canonicalDigest = rows =>
  sha256(Buffer.from(`${JSON.stringify(rows)}\n`, 'utf8'))

function readCoverage() {
  return JSON.parse(
    gunzipSync(
      fs.readFileSync(
        path.join(
          root,
          'recovery/cases/2.1.120-to-2.1.121/semantic/source-coverage.json.gz',
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
    ).href,
  ).then(imported => imported.default ?? imported)
  return typescriptPromise
}

test('target121 daemon-supervisor fixture pins three complete units and all 184 coarse-main residues', t => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.120-to-2.1.121')
  assert.equal(
    fixture.criterion,
    'target121-daemon-supervisor-exact-owner-and-compiler-proof-v1',
  )
  assert.deepEqual(
    fixture.targetIndices,
    TARGET121_DAEMON_SUPERVISOR_OWNER_OVERRIDES.map(row => row.targetIndex),
  )
  assert.deepEqual(fixture.summary, {
    units: 3,
    residues: 184,
    directOwnerResidues: 164,
    buildMacroResidues: 9,
    compilerResidues: 11,
    correctedResidualResidues: 20,
    residueIdentitiesSha256:
      '5a0b9c2017fa177e530c528001af1e583663523206a417367139fdd53817a908',
    correctedResidualIdentitiesSha256:
      '406dafbf073e0b8c716b501d8144250b59d190be72a79dfdee76eb2ea4775716',
  })
  assert.equal(
    canonicalDigest(fixture.residues),
    fixture.summary.residueIdentitiesSha256,
  )
  assert.equal(
    canonicalDigest(
      [...fixture.buildMacroResidues, ...fixture.compilerResidues].sort(
        (a, b) => a[0] - b[0] || a[3] - b[3] || a[4] - b[4],
      ),
    ),
    fixture.summary.correctedResidualIdentitiesSha256,
  )
  assert.deepEqual(fixture.evidenceIds, [
    ...TARGET121_DAEMON_SUPERVISOR_EVIDENCE_IDS,
  ])
  assert.deepEqual(fixture.ownerOverrides, [
    ...TARGET121_DAEMON_SUPERVISOR_OWNER_OVERRIDES,
  ])

  if (!fs.existsSync(baselineBundlePath) || !fs.existsSync(targetBundlePath)) {
    t.skip('authenticated Target120/121 bundles are unavailable')
    return
  }
  const baseline = fs.readFileSync(baselineBundlePath)
  const target = fs.readFileSync(targetBundlePath)
  assert.deepEqual(descriptor(baseline), {
    bytes: fixture.inputs.baselineBundle.bytes,
    sha256: fixture.inputs.baselineBundle.sha256,
  })
  assert.deepEqual(descriptor(target), {
    bytes: fixture.inputs.targetBundle.bytes,
    sha256: fixture.inputs.targetBundle.sha256,
  })
  const unitByIndex = new Map(
    fixture.units.map(unit => [unit.targetIndex, unit]),
  )
  for (const unit of fixture.units) {
    const slice = target.subarray(unit.start, unit.end)
    assert.deepEqual(descriptor(slice), {
      bytes: unit.bytes,
      sha256: unit.sha256,
    })
    assert.equal(unit.sourceHash, unit.sha256)
  }
  for (const residue of fixture.residues) {
    const [targetIndex, , , start, end, , , sourceHash] = residue
    const unit = unitByIndex.get(targetIndex)
    assert.ok(unit, `u${targetIndex}`)
    assert.equal(sourceHash, unit.sourceHash, `u${targetIndex}`)
    assert.ok(start >= unit.start && end <= unit.end && end > start)
  }
})

test('authenticated Target121 fragments are the complete supervisor control and lifecycle units', t => {
  if (!fs.existsSync(targetBundlePath)) {
    t.skip('authenticated Target121 bundle is unavailable')
    return
  }
  const target = fs.readFileSync(targetBundlePath)
  const fragments = new Map()
  for (const unit of fixture.units) {
    const text = target.subarray(unit.start, unit.end).toString('utf8')
    const ast = parse(text, {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    })
    assert.equal(ast.body.length, 1, `u${unit.targetIndex}`)
    assert.equal(ast.body[0].type, unit.nodeType, `u${unit.targetIndex}`)
    fragments.set(unit.targetIndex, text)
  }

  const server = fragments.get(22136)
  for (const marker of [
    'tengu_daemon_peer_uid_reject',
    'setTimeout(30000',
    'Buffer.alloc(0)',
    'indexOf(10)',
    'leaseCount',
    'onLeaseChange',
  ]) {
    assert.ok(server.includes(marker), `u22136 ${marker}`)
  }

  const control = fragments.get(22140)
  for (const marker of [
    'bad json',
    'proto mismatch',
    'await-ack',
    'permission-response',
    'Waiting for session to redraw',
    'attachers.get',
    'unknown op:',
  ]) {
    assert.ok(control.includes(marker), `u22140 ${marker}`)
  }

  const supervisor = fragments.get(22151)
  for (const marker of [
    'tengu_bg_spare_enable',
    'tengu_bg_dispatch_sigkill_escalate',
    'tengu_bg_spare_claim',
    'bg adopt: adopted=',
    'tengu_bg_adopt',
    'retireIfSettled',
    'pendingSettleWrites',
    'killAll',
  ]) {
    assert.ok(supervisor.includes(marker), `u22151 ${marker}`)
  }

  const macroCounts = new Map()
  for (const residue of fixture.buildMacroResidues) {
    const [targetIndex, kind, value] = residue
    assert.equal(kind, 'string')
    assert.ok(fixture.buildMacros.values.includes(value))
    macroCounts.set(targetIndex, (macroCounts.get(targetIndex) ?? 0) + 1)
  }
  assert.deepEqual(
    Object.fromEntries([...macroCounts].sort(([a], [b]) => a - b)),
    fixture.buildMacros.countsByUnit,
  )
})

test('Target121 source AST and compiler mappings prove the corrected daemon supervisor owner', async () => {
  const ts = await loadTypeScript()
  assert.equal(fixture.sourceFiles.length, 1)
  const expectedFile = fixture.sourceFiles[0]
  const filename = path.join(sourceRoot, expectedFile.path.slice(4))
  const bytes = fs.readFileSync(filename)
  const text = bytes.toString('utf8')
  assert.deepEqual(descriptor(bytes), {
    bytes: expectedFile.bytes,
    sha256: expectedFile.sha256,
  })
  const sourceFile = ts.createSourceFile(
    filename,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, expectedFile.path)
  const expectedNames = new Set(
    expectedFile.declarations.map(declaration => declaration.name),
  )
  const actualDeclarations = []
  function visit(node) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name !== undefined &&
      expectedNames.has(node.name.text)
    ) {
      const start = node.getStart(sourceFile)
      const end = node.end
      actualDeclarations.push({
        name: node.name.text,
        kind: 'FunctionDeclaration',
        start,
        end,
        ...descriptor(bytes.subarray(start, end)),
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  actualDeclarations.sort((a, b) => a.start - b.start)
  assert.deepEqual(actualDeclarations, expectedFile.declarations)

  for (const marker of [
    'async function startControlServer(',
    'async function handleControl(',
    'export async function runBackgroundSupervisor(',
    "unparsed.op === 'leases'",
    "logEvent('tengu_daemon_peer_uid_reject'",
    "getFeatureValue_CACHED_MAY_BE_STALE('tengu_bg_spare_enable', true)",
    "logEvent('tengu_bg_dispatch_sigkill_escalate'",
    'await BackgroundHandle.adopt(',
    'void handle.retireIfSettled(3_600_000)',
  ]) {
    assert.ok(text.includes(marker), marker)
  }
  for (const mapping of fixture.compilerMappings) {
    assert.equal(mapping.sourcePath, expectedFile.path)
    for (const marker of mapping.sourceMarkers) {
      assert.ok(text.includes(marker), `${mapping.targetIndex}: ${marker}`)
    }
  }

  const compilerCounts = new Map()
  for (const residue of fixture.compilerResidues) {
    const [targetIndex, kind, value] = residue
    const key = JSON.stringify([targetIndex, kind, value])
    compilerCounts.set(key, (compilerCounts.get(key) ?? 0) + 1)
  }
  const mappedCounts = new Map()
  for (const mapping of fixture.compilerMappings) {
    for (const residue of mapping.targetResidues) {
      mappedCounts.set(
        JSON.stringify([mapping.targetIndex, residue.kind, residue.value]),
        residue.count,
      )
    }
  }
  assert.deepEqual(compilerCounts, mappedCounts)
  assert.ok(
    TARGET121_DAEMON_SUPERVISOR_OWNER_OVERRIDES.every(
      row => !row.paths.includes('src/main.tsx'),
    ),
  )
})

test('Target121 daemon-supervisor coverage is either frozen pre-integration or completely corrected', () => {
  const coverage = readCoverage()
  const ownerById = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
  const states = TARGET121_DAEMON_SUPERVISOR_OWNER_OVERRIDES.map(expected => {
    const row = coverage.rows.find(
      candidate => candidate.targetIndex === expected.targetIndex,
    )
    assert.ok(row, expected.key)
    const paths = row.ownerIds.map(id => ownerById.get(id)).sort()
    return {
      expected,
      row,
      paths,
      ownerSignal:
        JSON.stringify(paths) === JSON.stringify([...expected.paths].sort()),
      evidenceSignal: row.evidenceIds.some(id =>
        TARGET121_DAEMON_SUPERVISOR_EVIDENCE_IDS.includes(id),
      ),
    }
  })
  const signaled = states.filter(state => state.ownerSignal || state.evidenceSignal)
  if (signaled.length === 0) {
    for (const { row, paths } of states) {
      assert.deepEqual(paths, ['src/main.tsx'])
      assert.deepEqual(row.evidenceIds, [
        'source-map-attribution',
        'semantic-test',
      ])
    }
    return
  }
  assert.equal(signaled.length, states.length, 'partial supervisor integration')
  for (const { expected, row, paths } of states) {
    assert.equal(row.disposition, 'source-runtime-covered')
    assert.deepEqual(paths, [...expected.paths])
    assert.deepEqual(row.evidenceIds, [...expected.evidenceIds])
    assert.equal(row.behavior, expected.behavior)
    for (const evidenceId of expected.evidenceIds) {
      assert.ok(
        coverage.evidence.some(evidence => evidence.id === evidenceId),
        evidenceId,
      )
    }
  }
})

test('Target121 daemon-supervisor proof builder reproduces the frozen fixture', t => {
  if (!fs.existsSync(targetBundlePath)) {
    t.skip('authenticated Target121 bundle is unavailable')
    return
  }
  if (!fs.existsSync(typedReportPath)) {
    t.skip('frozen Target121 typed report is unavailable')
    return
  }
  const typedReportBytes = fs.readFileSync(typedReportPath)
  if (
    JSON.stringify(descriptor(typedReportBytes)) !==
    JSON.stringify(fixture.inputs.typedReport)
  ) {
    t.skip('live Target121 typed report is newer than the frozen builder input')
    return
  }
  const result = spawnSync(
    process.execPath,
    [
      path.join(
        root,
        'recovery/cases/2.1.120-to-2.1.121/recovered/build-daemon-supervisor-owner-proofs.mjs',
      ),
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        CLAUDE_CODE_2_1_121_TYPED_REPORT: typedReportPath,
      },
    },
  )
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), fixture)
})
