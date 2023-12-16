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
  TARGET121_USAGE_CONTRIBUTORS_EVIDENCE_IDS,
  TARGET121_USAGE_CONTRIBUTORS_OWNER_OVERRIDES,
} from '../cases/2.1.120-to-2.1.121/recovered/usage-contributors-owner-overrides.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.121-usage-contributors-owner-proofs.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '63fe7e66b937055a214f022c3aba5c958ab15f16de77e219892e3e5ad530953e'
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

test('target121 usage-contributor fixture pins three complete units and all 29 false-owner residues', t => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.120-to-2.1.121')
  assert.equal(
    fixture.criterion,
    'target121-usage-contributors-exact-owner-and-compiler-proof-v1',
  )
  assert.deepEqual(
    fixture.targetIndices,
    TARGET121_USAGE_CONTRIBUTORS_OWNER_OVERRIDES.map(row => row.targetIndex),
  )
  assert.deepEqual(fixture.summary, {
    units: 3,
    residues: 29,
    directOwnerResidues: 23,
    compilerResidues: 6,
    residueIdentitiesSha256:
      '008c9da010ce345873210f56498cfab443622ed8212cb574df6d389d74ff055a',
    compilerResidueIdentitiesSha256:
      '4eb8ecaeed167b3269c76a27126eea00b2bfebe26d5dd42d9c15072f9cb3c772',
  })
  assert.equal(
    canonicalDigest(fixture.residues),
    fixture.summary.residueIdentitiesSha256,
  )
  assert.equal(
    canonicalDigest(fixture.compilerResidues),
    fixture.summary.compilerResidueIdentitiesSha256,
  )
  assert.deepEqual(fixture.evidenceIds, [
    ...TARGET121_USAGE_CONTRIBUTORS_EVIDENCE_IDS,
  ])
  assert.deepEqual(fixture.ownerOverrides, [
    ...TARGET121_USAGE_CONTRIBUTORS_OWNER_OVERRIDES,
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

test('authenticated Target121 fragments are the complete usage accumulator lifecycle', t => {
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

  const create = fragments.get(16054)
  for (const marker of [
    'totalCost:0',
    'requestCount:0',
    'cacheMissCost:0',
    'longCtxCost:0',
    'sessions:new Map',
    'buckets:new Map',
    'byAgent:new Map',
    'bySkill:new Map',
    'byPlugin:new Map',
  ]) {
    assert.ok(create.includes(marker), `u16054 ${marker}`)
  }

  const add = fragments.get(16056)
  for (const marker of [
    'requestCount++',
    '.attributionAgent',
    '.attributionSkill??',
    '.attributionPlugin',
    '.cacheMissCost+=',
    '.longCtxCost+=',
    '.longCtxCount++',
    '.sessions.get(',
    '.buckets.get(',
    '3600000',
  ]) {
    assert.ok(add.includes(marker), `u16056 ${marker}`)
  }

  const finalize = fragments.get(16057)
  for (const marker of [
    '"cache_miss"',
    '"long_context"',
    '"subagent_heavy"',
    '"high_parallel"',
    '"cron"',
    'requestCount:',
    'sessionCount:',
    'agents:',
    'skills:',
    'plugins:',
  ]) {
    assert.ok(finalize.includes(marker), `u16057 ${marker}`)
  }
})

test('Target121 source AST and compiler mappings prove the corrected UsageContributors owner', async () => {
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
    ts.ScriptKind.TSX,
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
    'function createAccumulator()',
    'function addRecord(',
    'function finalizeAccumulator(',
    'accumulator.longContextCost += cost',
    'accumulator.longContextCount++',
    "key: 'long_context'",
    'agents: summarizeAttribution(accumulator.byAgent',
    'skills: summarizeAttribution(accumulator.bySkill',
    'plugins: summarizeAttribution(accumulator.byPlugin',
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
    TARGET121_USAGE_CONTRIBUTORS_OWNER_OVERRIDES.every(
      row =>
        !row.paths.includes(
          'src/components/LogoV2/OverageCreditUpsell.tsx',
        ),
    ),
  )
})

test('Target121 UsageContributors coverage is either frozen pre-integration or completely corrected', () => {
  const coverage = readCoverage()
  const ownerById = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
  const states = TARGET121_USAGE_CONTRIBUTORS_OWNER_OVERRIDES.map(expected => {
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
        TARGET121_USAGE_CONTRIBUTORS_EVIDENCE_IDS.includes(id),
      ),
    }
  })
  const signaled = states.filter(state => state.ownerSignal || state.evidenceSignal)
  if (signaled.length === 0) {
    for (const { row, paths } of states) {
      assert.deepEqual(paths, [
        'src/components/LogoV2/OverageCreditUpsell.tsx',
      ])
      assert.deepEqual(row.evidenceIds, [
        'source-map-attribution',
        'semantic-test',
      ])
    }
    return
  }
  assert.equal(signaled.length, states.length, 'partial UsageContributors integration')
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

test('Target121 UsageContributors proof builder reproduces the frozen fixture', t => {
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
        'recovery/cases/2.1.120-to-2.1.121/recovered/build-usage-contributors-owner-proofs.mjs',
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
