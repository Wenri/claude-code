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
  TARGET121_DAEMON_SPARE_EVIDENCE_IDS,
  TARGET121_DAEMON_SPARE_OWNER_OVERRIDES,
} from '../cases/2.1.120-to-2.1.121/recovered/daemon-spare-owner-overrides.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.121-daemon-spare-owner-proofs.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'daa101fe1dbd747ef9bc1ec59791198c64fe67beca75663bd44d26483a673eda'
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

test('target121 daemon-spare fixture pins the complete unit and all 17 coarse-main residues', t => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.120-to-2.1.121')
  assert.equal(
    fixture.criterion,
    'target121-daemon-spare-exact-owner-and-build-proof-v1',
  )
  assert.deepEqual(
    fixture.targetIndices,
    TARGET121_DAEMON_SPARE_OWNER_OVERRIDES.map(row => row.targetIndex),
  )
  assert.deepEqual(fixture.summary, {
    units: 1,
    residues: 17,
    directOwnerResidues: 14,
    buildMacroResidues: 3,
    correctedResidualResidues: 3,
    residueIdentitiesSha256:
      'ea3a1a145e06de6c2c658ea6d91b322c20c8c7a66ed7ec8be94762a4f821a066',
    correctedResidualIdentitiesSha256:
      '4af57ff638371dd29d1e8ccdf28ad5656f0ba05a922b4e9b697b0084c8f7541c',
  })
  assert.equal(
    canonicalDigest(fixture.residues),
    fixture.summary.residueIdentitiesSha256,
  )
  assert.equal(
    canonicalDigest(fixture.buildMacroResidues),
    fixture.summary.correctedResidualIdentitiesSha256,
  )
  assert.deepEqual(fixture.evidenceIds, [
    ...TARGET121_DAEMON_SPARE_EVIDENCE_IDS,
  ])
  assert.deepEqual(fixture.ownerOverrides, [
    ...TARGET121_DAEMON_SPARE_OWNER_OVERRIDES,
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
  const unit = fixture.units[0]
  const slice = target.subarray(unit.start, unit.end)
  assert.deepEqual(descriptor(slice), {
    bytes: unit.bytes,
    sha256: unit.sha256,
  })
  assert.equal(unit.sourceHash, unit.sha256)
  for (const residue of fixture.residues) {
    const [targetIndex, , , start, end, , , sourceHash] = residue
    assert.equal(targetIndex, unit.targetIndex)
    assert.equal(sourceHash, unit.sourceHash)
    assert.ok(start >= unit.start && end <= unit.end && end > start)
  }
})

test('authenticated Target121 fragment is the complete spare-worker launcher', t => {
  if (!fs.existsSync(targetBundlePath)) {
    t.skip('authenticated Target121 bundle is unavailable')
    return
  }
  const target = fs.readFileSync(targetBundlePath)
  const unit = fixture.units[0]
  const text = target.subarray(unit.start, unit.end).toString('utf8')
  const ast = parse(text, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  assert.equal(ast.body.length, 1)
  assert.equal(ast.body[0].type, unit.nodeType)
  for (const marker of [
    'typeof Bun',
    'randomBytes(4)',
    '--bg-pty-host',
    '--bg-spare',
    'detached:!0',
    '.unref()',
    'hostPid:',
    'claimSock:',
    'cliVersion:',
    'SIGTERM',
    'bg spare spawned host pid=',
  ]) {
    assert.ok(text.includes(marker), marker)
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

test('Target121 source AST proves the corrected daemon spare owner and build boundary', async () => {
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
  const actualDeclarations = []
  function visit(node) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === 'spawnSpare'
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
  assert.deepEqual(actualDeclarations, expectedFile.declarations)

  for (const marker of [
    'export async function spawnSpare(',
    "process.platform === 'win32' || typeof Bun === 'undefined'",
    "randomBytes(4).toString('hex')",
    "'--bg-pty-host'",
    "'--bg-spare'",
    'detached: true',
    'child.unref()',
    'cliVersion: MACRO.VERSION',
    "child.kill('SIGTERM')",
    'void unlink(getPtyErrorPath(ptySock))',
    'options.log(`bg spare spawned host pid=${child.pid}`)',
  ]) {
    assert.ok(text.includes(marker), marker)
  }
  assert.ok(
    TARGET121_DAEMON_SPARE_OWNER_OVERRIDES.every(
      row => !row.paths.includes('src/main.tsx'),
    ),
  )
})

test('Target121 daemon-spare coverage is either frozen pre-integration or completely corrected', () => {
  const coverage = readCoverage()
  const ownerById = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
  const expected = TARGET121_DAEMON_SPARE_OWNER_OVERRIDES[0]
  const row = coverage.rows.find(
    candidate => candidate.targetIndex === expected.targetIndex,
  )
  assert.ok(row, expected.key)
  const paths = row.ownerIds.map(id => ownerById.get(id)).sort()
  const ownerSignal =
    JSON.stringify(paths) === JSON.stringify([...expected.paths].sort())
  const evidenceSignal = row.evidenceIds.some(id =>
    TARGET121_DAEMON_SPARE_EVIDENCE_IDS.includes(id),
  )
  if (!ownerSignal && !evidenceSignal) {
    assert.deepEqual(paths, ['src/main.tsx'])
    assert.deepEqual(row.evidenceIds, [
      'source-map-attribution',
      'semantic-test',
    ])
    return
  }
  assert.ok(ownerSignal && evidenceSignal, 'partial daemon-spare integration')
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
})

test('Target121 daemon-spare proof builder reproduces the frozen fixture', t => {
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
        'recovery/cases/2.1.120-to-2.1.121/recovered/build-daemon-spare-owner-proofs.mjs',
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
