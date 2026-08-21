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
  TARGET121_PTY_WORKER_EVIDENCE_IDS,
  TARGET121_PTY_WORKER_OWNER_OVERRIDES,
} from '../cases/2.1.120-to-2.1.121/recovered/pty-worker-owner-overrides.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.121-pty-worker-owner-proofs.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '2ebb8f355bf3302e746aac8471863cba286ac863e8f29fe0ad34244866e7251c'
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

test('target121 PTY-worker fixture pins three complete units and all 125 coarse-owner residues', t => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.120-to-2.1.121')
  assert.equal(
    fixture.criterion,
    'target121-pty-worker-exact-owner-and-compiler-proof-v1',
  )
  assert.deepEqual(
    fixture.targetIndices,
    TARGET121_PTY_WORKER_OWNER_OVERRIDES.map(row => row.targetIndex),
  )
  assert.deepEqual(fixture.summary, {
    units: 3,
    residues: 125,
    directOwnerResidues: 103,
    buildMacroResidues: 15,
    compilerResidues: 7,
    correctedResidualResidues: 22,
    residueIdentitiesSha256:
      '6b5f39888b386c4aaae845e6f26a187f02f440d05e66887e72daa2c256a2a423',
    correctedResidualIdentitiesSha256:
      '7a64b8f0f126ec4c81a0a04af9f2391e9d9578d7b63569ac086e40f1afc8a1f0',
  })
  assert.equal(
    canonicalDigest(fixture.residues),
    fixture.summary.residueIdentitiesSha256,
  )
  assert.equal(
    canonicalDigest([
      ...fixture.buildMacroResidues,
      ...fixture.compilerResidues,
    ].sort((a, b) => a[0] - b[0] || a[3] - b[3] || a[4] - b[4])),
    fixture.summary.correctedResidualIdentitiesSha256,
  )
  assert.deepEqual(fixture.evidenceIds, [
    ...TARGET121_PTY_WORKER_EVIDENCE_IDS,
  ])
  assert.deepEqual(fixture.ownerOverrides, [
    ...TARGET121_PTY_WORKER_OWNER_OVERRIDES,
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

test('authenticated Target121 fragments are the complete PTY host, launcher, and worker lifecycle', t => {
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

  const host = fragments.get(19577)
  for (const marker of [
    '--bg-pty-host <sock> <cols> <rows> -- <file> [args...]',
    'uncaughtException',
    'unhandledRejection',
    'Bun.Terminal unavailable (running under Node?)',
    'CLAUDE_PTY_RECORD',
    'xterm-256color',
    'hello',
    'live',
    'exit',
  ]) {
    assert.ok(host.includes(marker), `u19577 ${marker}`)
  }

  const launcher = fragments.get(19592)
  for (const marker of [
    'pinToCurrentBinary',
    '--bg-pty-host',
    'ptySock',
    'cols',
    'rows',
    'detached:!0',
    '.unref()',
  ]) {
    assert.ok(launcher.includes(marker), `u19592 ${marker}`)
  }

  const worker = fragments.get(19597)
  for (const marker of [
    'replyChain=Promise.resolve()',
    'workerReady',
    'ptyCols=200',
    'rvSockPath',
    'connectRv',
    'illegal worker-phase transition ',
    'spawning',
    'upgrading',
    'retiring',
    'reap',
    'grace',
    'pidPoll',
  ]) {
    assert.ok(worker.includes(marker), `u19597 ${marker}`)
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

test('Target121 source AST and compiler mappings prove the corrected daemon owners', async () => {
  const ts = await loadTypeScript()
  const sourceTextByPath = new Map()
  for (const expectedFile of fixture.sourceFiles) {
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
    const actualDeclarations = []
    function visit(node) {
      if (
        node.name !== undefined &&
        ts.isIdentifier(node.name) &&
        expectedFile.declarations.some(row => row.name === node.name.text) &&
        (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node))
      ) {
        const start = node.getStart(sourceFile)
        const end = node.end
        actualDeclarations.push({
          name: node.name.text,
          kind: ts.isClassDeclaration(node)
            ? 'ClassDeclaration'
            : 'FunctionDeclaration',
          start,
          end,
          ...descriptor(bytes.subarray(start, end)),
        })
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    actualDeclarations.sort((a, b) => a.start - b.start)
    assert.deepEqual(
      actualDeclarations,
      expectedFile.declarations,
      expectedFile.path,
    )
    sourceTextByPath.set(expectedFile.path, text)
  }

  const hostSource = sourceTextByPath.get('src/daemon/ptyHost.ts')
  for (const marker of [
    'export async function runPtyHost',
    '--bg-pty-host <sock> <cols> <rows> -- <file> [args...]',
    'createRecorder(process.env.CLAUDE_PTY_RECORD, cols, rows)',
    'version: MACRO.VERSION',
  ]) {
    assert.ok(hostSource.includes(marker), marker)
  }
  const supervisorSource = sourceTextByPath.get('src/daemon/supervisor.ts')
  for (const marker of [
    'function pinnedWorkerLauncher()',
    'function defaultSpawnPty()',
    'export class BackgroundHandle',
    "'--bg-pty-host'",
    'private replyChain: Promise<void> = Promise.resolve()',
    'private workerReady = false',
    'private pidPollTick = 0',
  ]) {
    assert.ok(supervisorSource.includes(marker), marker)
  }
  for (const mapping of fixture.compilerMappings) {
    const source = sourceTextByPath.get(mapping.sourcePath)
    assert.ok(source, mapping.sourcePath)
    for (const marker of mapping.sourceMarkers) {
      assert.ok(source.includes(marker), `${mapping.targetIndex}: ${marker}`)
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
    TARGET121_PTY_WORKER_OWNER_OVERRIDES.every(
      row => !row.paths.includes('src/utils/claudeInChrome/chromeNativeHost.ts'),
    ),
  )
})

test('Target121 PTY coverage is either frozen pre-integration or completely corrected', () => {
  const coverage = readCoverage()
  const ownerById = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
  const states = TARGET121_PTY_WORKER_OWNER_OVERRIDES.map(expected => {
    const row = coverage.rows.find(
      candidate => candidate.targetIndex === expected.targetIndex,
    )
    assert.ok(row, expected.key)
    return {
      expected,
      row,
      paths: row.ownerIds.map(id => ownerById.get(id)).sort(),
      ownerSignal:
        JSON.stringify(row.ownerIds.map(id => ownerById.get(id)).sort()) ===
        JSON.stringify([...expected.paths].sort()),
      evidenceSignal: row.evidenceIds.some(id =>
        TARGET121_PTY_WORKER_EVIDENCE_IDS.includes(id),
      ),
    }
  })
  const signaled = states.filter(state => state.ownerSignal || state.evidenceSignal)
  if (signaled.length === 0) {
    for (const { row, paths } of states) {
      assert.deepEqual(paths, [
        'src/utils/claudeInChrome/chromeNativeHost.ts',
      ])
      assert.deepEqual(row.evidenceIds, [
        'source-map-attribution',
        'semantic-test',
      ])
    }
    return
  }
  assert.equal(signaled.length, states.length, 'partial PTY integration')
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

test('Target121 PTY-worker proof builder reproduces the frozen fixture', t => {
  if (!fs.existsSync(targetBundlePath)) {
    t.skip('authenticated Target121 bundle is unavailable')
    return
  }
  if (!fs.existsSync(typedReportPath)) {
    t.skip('frozen Target121 typed report is unavailable')
    return
  }
  if (
    JSON.stringify(descriptor(fs.readFileSync(typedReportPath))) !==
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
        'recovery/cases/2.1.120-to-2.1.121/recovered/build-pty-worker-owner-proofs.mjs',
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
