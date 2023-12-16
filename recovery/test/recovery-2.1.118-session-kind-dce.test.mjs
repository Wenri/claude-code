import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'

const root = process.cwd()
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(root, 'recovery/test/recovery-2.1.118-session-kind-dce.json'),
    'utf8',
  ),
)
const baselineBundlePath =
  process.env.CLAUDE_CODE_2_1_117_BUNDLE ??
  path.join(root, fixture.baselineBundle.path)
const targetBundlePath =
  process.env.CLAUDE_CODE_2_1_118_BUNDLE ??
  path.join(root, fixture.targetBundle.path)

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })

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
          'recovery/cases/2.1.117-to-2.1.118/semantic/source-coverage.json.gz',
        ),
      ),
    ),
  )
}

test('target118 session-kind DCE fixture pins exact authenticated inputs', t => {
  if (!fs.existsSync(baselineBundlePath) || !fs.existsSync(targetBundlePath)) {
    t.skip('authenticated Target117/118 bundles are unavailable')
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
  assert.equal(baseline.toString('utf8').match(/session_kind/g)?.length ?? 0, 0)
  assert.equal(target.toString('utf8').match(/session_kind/g)?.length ?? 0, 1)
  const unit = target.subarray(fixture.targetUnit.start, fixture.targetUnit.end)
  assert.deepEqual(descriptor(unit), {
    bytes: fixture.targetUnit.end - fixture.targetUnit.start,
    sha256: fixture.targetUnit.sourceHash,
  })
  assert.equal(
    target
      .subarray(fixture.residue.start, fixture.residue.end)
      .toString('utf8'),
    fixture.residue.value,
  )
})

test('target118 session_kind emission is unreachable through its complete getter and metadata binding chain', t => {
  if (!fs.existsSync(targetBundlePath)) {
    t.skip('authenticated Target118 bundle is unavailable')
    return
  }
  const target = fs.readFileSync(targetBundlePath)
  const source = target.toString('utf8')
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const declarations = new Map()
  const identifiers = new Map()
  const calls = new Map()
  walk(ast, node => {
    if (node.type === 'FunctionDeclaration' && node.id?.type === 'Identifier') {
      const values = declarations.get(node.id.name) ?? []
      values.push(node)
      declarations.set(node.id.name, values)
    }
    if (node.type === 'Identifier') {
      const values = identifiers.get(node.name) ?? []
      values.push(node.start)
      identifiers.set(node.name, values)
    }
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier') {
      const values = calls.get(node.callee.name) ?? []
      values.push(node.callee.start)
      calls.set(node.callee.name, values)
    }
  })

  const getter = declarations.get(fixture.sessionKindGetter.name) ?? []
  assert.equal(getter.length, 1)
  assert.deepEqual(
    {
      start: getter[0].start,
      end: getter[0].end,
      sha256: sha256(target.subarray(getter[0].start, getter[0].end)),
    },
    {
      start: fixture.sessionKindGetter.start,
      end: fixture.sessionKindGetter.end,
      sha256: fixture.sessionKindGetter.sha256,
    },
  )
  assert.equal(getter[0].body.body.length, 1)
  assert.equal(getter[0].body.body[0].type, 'ReturnStatement')
  assert.equal(getter[0].body.body[0].argument, null)
  assert.deepEqual(
    identifiers.get(fixture.sessionKindGetter.name),
    fixture.sessionKindGetter.identifierOffsets,
  )
  assert.deepEqual(
    calls.get(fixture.sessionKindGetter.name),
    fixture.sessionKindGetter.callOffsets,
  )

  for (const binding of [fixture.metadataProducer, fixture.metadataFormatter]) {
    const matches = declarations.get(binding.name) ?? []
    assert.equal(matches.length, 1, binding.name)
    assert.deepEqual(
      {
        start: matches[0].start,
        end: matches[0].end,
        sha256: sha256(target.subarray(matches[0].start, matches[0].end)),
      },
      { start: binding.start, end: binding.end, sha256: binding.sha256 },
    )
    const text = source.slice(binding.start, binding.end)
    for (const fragment of binding.requiredFragments) {
      assert.equal(text.split(fragment).length - 1, 1, fragment)
    }
  }
  assert.deepEqual(
    identifiers.get(fixture.metadataFormatter.name),
    fixture.metadataFormatter.identifierOffsets,
  )
})

test('target118 session-kind coverage is admitted only as authenticated DCE', () => {
  const coverage = readCoverage()
  const row = coverage.rows.find(
    candidate => candidate.targetIndex === fixture.targetIndex,
  )
  assert.ok(row)
  assert.equal(row.sourceHash, fixture.targetUnit.sourceHash)
  assert.equal(row.disposition, 'dce-nonruntime')
  assert.deepEqual(row.ownerIds, [])
  assert.deepEqual(row.evidenceIds, fixture.evidenceIds)
  assert.equal(row.category, fixture.category)
  assert.equal(row.reason, fixture.reason)
})
