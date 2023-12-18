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
  TARGET121_EXTRA_USAGE_EVIDENCE_IDS,
  TARGET121_EXTRA_USAGE_OWNER_OVERRIDES,
} from '../cases/2.1.120-to-2.1.121/recovered/extra-usage-owner-overrides.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.121-extra-usage-owner-proofs.json',
)
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
const baselineBundlePath =
  process.env.CLAUDE_CODE_2_1_120_BUNDLE ??
  path.join(root, fixture.baselineBundle.path)
const targetBundlePath =
  process.env.CLAUDE_CODE_2_1_121_BUNDLE ??
  path.join(root, fixture.targetBundle.path)
const sourceRoot =
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
  path.join(root, '.recovery-tmp/semantic-trees/2.1.121/src')
const typedReportPath =
  process.env.CLAUDE_CODE_2_1_121_TYPED_REPORT ??
  path.join(
    root,
    '.recovery-tmp/residue-audits/2.1.120-to-2.1.121.typed-audit.json',
  )
const frozenTypedReport = Object.freeze({
  bytes: 31092432,
  sha256: 'f76cfab38ea9cf241a60562c7e697b0db3fbbacd7bda281737a37e052502c929',
})

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })
const canonicalDigest = rows =>
  sha256(Buffer.from(`${JSON.stringify(rows)}\n`, 'utf8'))

function walk(node, visit) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (!['start', 'end', 'loc', 'range'].includes(key)) walk(child, visit)
  }
}

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

test('target121 extra-usage fixture pins all fourteen complete units and 358 residues', t => {
  if (!fs.existsSync(baselineBundlePath) || !fs.existsSync(targetBundlePath)) {
    t.skip('authenticated Target120/121 bundles are unavailable')
    return
  }
  const baseline = fs.readFileSync(baselineBundlePath)
  const target = fs.readFileSync(targetBundlePath)
  assert.deepEqual(descriptor(baseline), {
    bytes: fixture.baselineBundle.bytes,
    sha256: fixture.baselineBundle.sha256,
  })
  assert.deepEqual(descriptor(target), {
    bytes: fixture.targetBundle.bytes,
    sha256: fixture.targetBundle.sha256,
  })
  assert.deepEqual(
    fixture.targetIndices,
    TARGET121_EXTRA_USAGE_OWNER_OVERRIDES.map(row => row.targetIndex),
  )
  assert.equal(fixture.units.length, 14)
  assert.equal(fixture.residues.length, 358)
  assert.equal(
    canonicalDigest(fixture.residues),
    fixture.summary.residueIdentitiesSha256,
  )
  const units = new Map(fixture.units.map(unit => [unit.targetIndex, unit]))
  for (const unit of fixture.units) {
    const slice = target.subarray(unit.start, unit.end)
    assert.deepEqual(descriptor(slice), {
      bytes: unit.bytes,
      sha256: unit.targetSliceSha256,
    })
    assert.equal(unit.sourceHash, unit.targetSliceSha256)
  }
  for (const residue of fixture.residues) {
    const [targetIndex, , , start, end, , , sourceHash] = residue
    const unit = units.get(targetIndex)
    assert.ok(unit, `u${targetIndex}`)
    assert.equal(sourceHash, unit.sourceHash, `u${targetIndex}`)
    assert.ok(start >= unit.start && end <= unit.end && end > start)
  }
})

test('target121 extra-usage live declarations are exact source owners', async () => {
  const ts = await loadTypeScript()
  for (const expectedFile of fixture.sourceFiles) {
    const absolutePath = path.join(sourceRoot, expectedFile.path.slice(4))
    const bytes = fs.readFileSync(absolutePath)
    const text = bytes.toString('utf8')
    assert.deepEqual(descriptor(bytes), {
      bytes: expectedFile.bytes,
      sha256: expectedFile.sha256,
    })
    const sourceFile = ts.createSourceFile(
      absolutePath,
      text,
      ts.ScriptTarget.Latest,
      true,
      absolutePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    const actual = []
    function visit(node) {
      if (
        node.name !== undefined &&
        ts.isIdentifier(node.name) &&
        expectedFile.declarations.some(row => row.name === node.name.text) &&
        (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node))
      ) {
        const start = node.getStart(sourceFile)
        const end = node.end
        actual.push({
          name: node.name.text,
          start,
          end,
          bytes: end - start,
          sha256: sha256(bytes.subarray(start, end)),
        })
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    actual.sort((a, b) => a.start - b.start)
    assert.deepEqual(actual, expectedFile.declarations, expectedFile.path)
  }
})

test('target121 mock-only extra-usage branches are dominated by one always-null binding', t => {
  if (!fs.existsSync(targetBundlePath)) {
    t.skip('authenticated Target121 bundle is unavailable')
    return
  }
  const target = fs.readFileSync(targetBundlePath)
  const source = target.toString('utf8')
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const getters = []
  const identifiers = []
  const calls = []
  const presetRefs = []
  const builderRefs = []
  walk(ast, node => {
    if (node.type === 'FunctionDeclaration' && node.id?.name === 'hT') {
      getters.push(node)
    }
    if (node.type === 'Identifier' && node.name === 'hT') {
      identifiers.push(node.start)
    }
    if (node.type === 'CallExpression' && node.callee?.name === 'hT') {
      calls.push(node.callee.start)
    }
    if (node.type === 'Identifier' && node.name === 'PP1') {
      presetRefs.push(node.start)
    }
    if (node.type === 'Identifier' && node.name === 'QJ7') {
      builderRefs.push(node.start)
    }
  })
  assert.equal(getters.length, 1)
  const getter = getters[0]
  assert.deepEqual(
    {
      start: getter.start,
      end: getter.end,
      ...descriptor(target.subarray(getter.start, getter.end)),
    },
    {
      start: fixture.disabledMockBinding.start,
      end: fixture.disabledMockBinding.end,
      bytes: fixture.disabledMockBinding.bytes,
      sha256: fixture.disabledMockBinding.sha256,
    },
  )
  assert.equal(getter.body.body.length, 1)
  assert.equal(getter.body.body[0].type, 'ReturnStatement')
  assert.equal(getter.body.body[0].argument?.type, 'Literal')
  assert.equal(getter.body.body[0].argument?.value, null)
  assert.deepEqual(identifiers.sort((a, b) => a - b), fixture.disabledMockBinding.identifierOffsets)
  assert.deepEqual(calls.sort((a, b) => a - b), fixture.disabledMockBinding.callOffsets)

  const units = new Map(fixture.units.map(unit => [unit.targetIndex, unit]))
  for (const targetIndex of [12681, 12682, 12683, 12685, 12687, 12688, 12689, 12699]) {
    const unit = units.get(targetIndex)
    assert.ok(
      calls.some(offset => offset >= unit.start && offset < unit.end),
      `u${targetIndex} mock guard`,
    )
  }
  const allowedPresetUnits = [
    units.get(12685),
    units.get(12691),
    fixture.disabledMockBinding.presetDeclaration,
  ]
  assert.ok(
    presetRefs.every(offset =>
      allowedPresetUnits.some(unit => offset >= unit.start && offset < unit.end),
    ),
  )
  const builderUnit = units.get(12684)
  const presetUnit = units.get(12691)
  assert.ok(
    builderRefs.every(
      offset =>
        (offset >= builderUnit.start && offset < builderUnit.end) ||
        (offset >= presetUnit.start && offset < presetUnit.end),
    ),
  )
})

test('target121 extra-usage coverage rejects the coarse RemoteAgentTask attribution', () => {
  const coverage = readCoverage()
  assert.deepEqual(
    fixture.evidenceIds,
    [...TARGET121_EXTRA_USAGE_EVIDENCE_IDS],
  )
  for (const expected of TARGET121_EXTRA_USAGE_OWNER_OVERRIDES) {
    const row = coverage.rows.find(
      candidate => candidate.targetIndex === expected.targetIndex,
    )
    assert.ok(row, expected.key)
    assert.equal(row.disposition, 'source-runtime-covered')
    assert.deepEqual(row.evidenceIds, [...expected.evidenceIds])
    assert.equal(row.behavior, expected.behavior)
    assert.equal(row.ownerIds.length, 1)
    const owner = coverage.owners.find(candidate => candidate.id === row.ownerIds[0])
    assert.ok(owner)
    assert.equal(owner.path, expected.paths[0])
    assert.notEqual(owner.path, 'src/tasks/RemoteAgentTask/RemoteAgentTask.tsx')
  }
})

test('target121 extra-usage proof builder reproduces the frozen fixture', t => {
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
    JSON.stringify(frozenTypedReport)
  ) {
    t.skip('live Target121 typed report is newer than the frozen builder input')
    return
  }
  const result = spawnSync(
    process.execPath,
    [
      path.join(
        root,
        'recovery/cases/2.1.120-to-2.1.121/recovered/build-extra-usage-owner-proofs.mjs',
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
