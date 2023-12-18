import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET118_HEADLESS_CLASSIFIER_DCE_EVIDENCE_IDS,
  TARGET118_HEADLESS_CLASSIFIER_DCE_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/headless-classifier-dce-owner-overrides.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-headless-classifier-dce-owner-proof.json',
)
const overridePath = path.join(
  root,
  'recovery/cases/2.1.117-to-2.1.118/recovered/headless-classifier-dce-owner-overrides.mjs',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'd60f81b79878832ad774b7b83be6f51e85398021eba785b4a87ec2a5019b6a2c'
const OVERRIDE_SHA256 =
  '2f1bf32de8f84899fe816d798499224cd4c1eda2867f396b7caace88d45e7ba2'
const baselineBundlePath =
  process.env.CLAUDE_CODE_2_1_117_BUNDLE ??
  path.join(
    root,
    '.recovery-tmp/authenticated-artifacts/2.1.117-linux-x64/cli.inner.js',
  )
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

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({
  bytes: Buffer.byteLength(value),
  sha256: sha256(value),
})
const digest = value => sha256(Buffer.from(JSON.stringify(value)))

function readBundle(filename, expected) {
  const value = fs.readFileSync(filename, 'utf8')
  assert.deepEqual(descriptor(value), {
    bytes: expected.bytes,
    sha256: expected.sha256,
  })
  return value
}

function slicePinned(source, input, label) {
  const value = source.slice(input.start, input.end)
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sha256,
  }, label)
  return value
}

function canonicalAst(node) {
  if (Array.isArray(node)) return node.map(canonicalAst)
  if (!node || typeof node !== 'object') return node
  const output = {}
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'loc', 'raw'].includes(key)) continue
    output[key] =
      key === 'name' && node.type === 'Identifier'
        ? '_'
        : canonicalAst(value)
  }
  return output
}

function walk(node, visitor, parent = null, key = null) {
  if (!node || typeof node !== 'object') return
  visitor(node, parent, key)
  for (const [childKey, child] of Object.entries(node)) {
    if (['start', 'end', 'loc'].includes(childKey)) continue
    if (Array.isArray(child)) {
      for (const value of child) walk(value, visitor, node, childKey)
    } else {
      walk(child, visitor, node, childKey)
    }
  }
}

function parseUnit(bundle, input) {
  const source = slicePinned(bundle, input, `${input.index}: unit`)
  const program = parse(source, { ecmaVersion: 'latest' })
  assert.equal(program.body.length, 1)
  assert.equal(program.body[0].type, input.nodeType)
  return { source, node: program.body[0] }
}

function transitionNodes(source, node) {
  let telemetry
  let permissionSequence
  walk(node, candidate => {
    const text = source.slice(candidate.start, candidate.end)
    if (
      candidate.type === 'CallExpression' &&
      text.includes('"tengu_timer"')
    ) {
      telemetry = candidate
    }
    if (
      candidate.type === 'SequenceExpression' &&
      text.includes('"requires_action"')
    ) {
      permissionSequence = candidate
    }
  })
  assert.ok(telemetry)
  assert.ok(permissionSequence)
  assert.equal(permissionSequence.expressions.length, 2)
  return { telemetry, permissionSequence }
}

let typescriptPromise
function typescript() {
  typescriptPromise ??= import(
    path.join(
      root,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    )
  ).then(module => module.default ?? module)
  return typescriptPromise
}

function historicalSource() {
  const input = fixture.inputs.historicalSource
  const result = spawnSync(
    'git',
    ['show', `${input.commit}:${input.file.path}`],
    { cwd: root, encoding: null },
  )
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(
    { bytes: result.stdout.length, sha256: sha256(result.stdout) },
    { bytes: input.file.bytes, sha256: input.file.sha256 },
  )
  const blob = spawnSync(
    'git',
    ['rev-parse', `${input.commit}:${input.file.path}`],
    { cwd: root, encoding: 'utf8' },
  )
  assert.equal(blob.status, 0, blob.stderr)
  assert.equal(blob.stdout.trim(), input.file.blob)
  return result.stdout.toString('utf8')
}

function exactResidueRows(report) {
  return report.sourceRuntimeAddedOwnerResidueRows
    .filter(row => row.structural.index === fixture.targetIndex)
    .map(row => ({
      literalKind: row.literalKind,
      value: row.value,
      start: row.target.start,
      end: row.target.end,
      baselineOccurrenceCount: row.baselineOccurrenceCount,
      targetOccurrenceNumber: row.targetOccurrenceNumber,
      targetAdded: row.targetAdded,
    }))
}

test('Target118 headless classifier DCE fixture and override are frozen', {
  skip: !selected,
}, () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(sha256(fs.readFileSync(overridePath)), OVERRIDE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, caseName)
  assert.equal(fixture.targetIndex, 20835)
  assert.deepEqual(TARGET118_HEADLESS_CLASSIFIER_DCE_EVIDENCE_IDS, [
    'target118-headless-classifier-dce-authenticated-units',
    'target118-headless-classifier-dce-transition-proof',
    'target118-headless-classifier-dce-null-binding-proof',
    'target118-headless-classifier-dce-source-boundary',
  ])
  assert.equal(TARGET118_HEADLESS_CLASSIFIER_DCE_OWNER_OVERRIDES.length, 1)
  assert.deepEqual(
    TARGET118_HEADLESS_CLASSIFIER_DCE_OWNER_OVERRIDES[0].paths,
    [fixture.owner.path],
  )
  assert.deepEqual(
    TARGET118_HEADLESS_CLASSIFIER_DCE_OWNER_OVERRIDES[0].declarations,
    [fixture.owner.declaration],
  )
})

test('complete runHeadless units differ only at the classifier expression', {
  skip: !selected,
}, () => {
  const baselineBundle = readBundle(
    baselineBundlePath,
    fixture.inputs.baselineBundle,
  )
  const targetBundle = readBundle(targetBundlePath, fixture.inputs.targetBundle)
  const baseline = parseUnit(baselineBundle, fixture.units.baseline)
  const target = parseUnit(targetBundle, fixture.units.target)
  const baselineNodes = transitionNodes(baseline.source, baseline.node)
  const targetNodes = transitionNodes(target.source, target.node)

  const baselineTelemetry = baseline.source.slice(
    baselineNodes.telemetry.start,
    baselineNodes.telemetry.end,
  )
  const targetTelemetry = target.source.slice(
    targetNodes.telemetry.start,
    targetNodes.telemetry.end,
  )
  assert.deepEqual(descriptor(baselineTelemetry), {
    bytes: fixture.transition.baselineTelemetry.bytes,
    sha256: fixture.transition.baselineTelemetry.sha256,
  })
  assert.deepEqual(descriptor(targetTelemetry), {
    bytes: fixture.transition.targetTelemetry.bytes,
    sha256: fixture.transition.targetTelemetry.sha256,
  })
  const baselineTelemetryAst = JSON.stringify(
    canonicalAst(baselineNodes.telemetry),
  )
  const targetTelemetryAst = JSON.stringify(canonicalAst(targetNodes.telemetry))
  assert.equal(baselineTelemetryAst, targetTelemetryAst)
  assert.deepEqual(descriptor(targetTelemetryAst), {
    bytes: fixture.transition.telemetryCanonical.bytes,
    sha256: fixture.transition.telemetryCanonical.sha256,
  })

  const baselineSequence = baseline.source.slice(
    baselineNodes.permissionSequence.start,
    baselineNodes.permissionSequence.end,
  )
  const targetSequence = target.source.slice(
    targetNodes.permissionSequence.start,
    targetNodes.permissionSequence.end,
  )
  assert.deepEqual(descriptor(baselineSequence), {
    bytes: fixture.transition.baselinePermissionSequence.bytes,
    sha256: fixture.transition.baselinePermissionSequence.sha256,
  })
  assert.deepEqual(descriptor(targetSequence), {
    bytes: fixture.transition.targetPermissionSequence.bytes,
    sha256: fixture.transition.targetPermissionSequence.sha256,
  })
  assert.equal(
    baselineNodes.permissionSequence.expressions[1].type,
    'CallExpression',
  )
  assert.equal(
    targetNodes.permissionSequence.expressions[1].type,
    'ChainExpression',
  )

  baselineNodes.permissionSequence.expressions =
    baselineNodes.permissionSequence.expressions.slice(0, 1)
  targetNodes.permissionSequence.expressions =
    targetNodes.permissionSequence.expressions.slice(0, 1)
  const baselineCommon = JSON.stringify(canonicalAst(baseline.node))
  const targetCommon = JSON.stringify(canonicalAst(target.node))
  assert.equal(targetCommon, baselineCommon)
  assert.deepEqual(descriptor(targetCommon), {
    bytes: fixture.transition.completeUnitWithoutClassifierExpression.bytes,
    sha256:
      fixture.transition.completeUnitWithoutClassifierExpression.sha256,
  })
})

test('the Target118 classifier module binding is always null', {
  skip: !selected,
}, () => {
  const targetBundle = readBundle(targetBundlePath, fixture.inputs.targetBundle)
  const input = fixture.transition.targetNullBinding
  assert.equal(
    slicePinned(targetBundle, input, 'null binding'),
    `${input.name}=null`,
  )
  const program = parse(targetBundle, { ecmaVersion: 'latest' })
  const references = []
  const writes = []
  walk(program, (node, parent, key) => {
    if (node.type === 'Identifier' && node.name === input.name) {
      references.push({ node, parent, key })
    }
    if (
      (node.type === 'AssignmentExpression' ||
        node.type === 'UpdateExpression') &&
      targetBundle.slice(node.start, node.end).includes(input.name)
    ) {
      writes.push(node)
    }
  })
  assert.equal(references.length, input.identifierCount)
  assert.equal(writes.length, input.writeCount)
  const declaration = references.find(
    reference => reference.parent.type === 'VariableDeclarator',
  )
  assert.ok(declaration)
  assert.equal(declaration.parent.init.type, 'Literal')
  assert.equal(declaration.parent.init.value, null)
  const access = references.find(
    reference => reference.parent.type === 'MemberExpression',
  )
  assert.ok(access)
  assert.equal(access.parent.optional, true)
  assert.equal(
    targetBundle.slice(access.parent.property.start, access.parent.property.end),
    'runClassifierSummaryForBlocked',
  )
  assert.equal(
    targetBundle.match(/runClassifierSummaryForBlocked/g)?.length,
    1,
  )
  const baselineBundle = readBundle(
    baselineBundlePath,
    fixture.inputs.baselineBundle,
  )
  assert.equal(baselineBundle.includes('runClassifierSummaryForBlocked'), false)
})

test('historical and packaged source implement the notify-only DCE result', {
  skip: !selected,
}, async () => {
  const ts = await typescript()
  const input = fixture.inputs.historicalSource
  const raw = historicalSource()
  const selectedSource = fs.readFileSync(
    path.join(sourceRoot, input.file.path.replace(/^src\//, '')),
    'utf8',
  )
  for (const [label, source] of [
    ['historical', raw],
    ['selected', selectedSource],
  ]) {
    const sourceFile = ts.createSourceFile(
      input.file.path,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    assert.equal(sourceFile.parseDiagnostics.length, 0, label)
    const declaration = sourceFile.statements.find(
      node =>
        ts.isFunctionDeclaration(node) &&
        node.name?.text === input.declaration.name,
    )
    assert.ok(declaration, `${label}: runHeadless`)
    const text = source.slice(declaration.getStart(sourceFile), declaration.end)
    assert.deepEqual(descriptor(text), {
      bytes: input.declaration.bytes,
      sha256: input.declaration.sha256,
    })
    const callbackStart = text.indexOf('const onPermissionPrompt')
    const callbackEnd = text.indexOf('const canUseTool', callbackStart)
    assert.ok(callbackStart >= 0 && callbackEnd > callbackStart)
    const callback = text.slice(callbackStart, callbackEnd)
    assert.deepEqual(descriptor(callback), input.permissionCallback)
    assert.equal(
      callback.match(/notifySessionStateChanged\('requires_action', details\)/g)
        ?.length,
      1,
    )
    assert.equal(callback.includes('runClassifierSummaryForBlocked'), false)
  }
})

test('coverage accepts only provisional or complete headless DCE evidence', {
  skip: !selected,
}, () => {
  const reportPath = path.join(
    root,
    `.recovery-tmp/residue-audits/${caseName}.typed-audit.json`,
  )
  if (fs.existsSync(reportPath)) {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
    const rows = exactResidueRows(report)
    assert.deepEqual(rows, fixture.residues.rows)
    assert.equal(rows.length, fixture.residues.rowCount)
    assert.equal(digest(rows), fixture.residues.sha256)
  }

  const coveragePath = path.join(
    root,
    `recovery/cases/${caseName}/semantic/source-coverage.json.gz`,
  )
  if (!fs.existsSync(coveragePath)) return
  const coverage = JSON.parse(gunzipSync(fs.readFileSync(coveragePath)))
  const row = coverage.rows.find(entry => entry.targetIndex === fixture.targetIndex)
  assert.ok(row)
  const expected = [...TARGET118_HEADLESS_CLASSIFIER_DCE_EVIDENCE_IDS]
  const present = expected.filter(id => row.evidenceIds.includes(id))
  assert.ok(
    present.length === 0 || present.length === expected.length,
    'partial headless classifier evidence is forbidden',
  )
  if (present.length === expected.length) {
    const ownerPaths = row.ownerIds.map(
      ownerId => coverage.owners.find(owner => owner.id === ownerId)?.path,
    )
    assert.deepEqual(ownerPaths, [fixture.owner.path])
  }
})
