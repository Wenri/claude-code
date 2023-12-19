import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET117_SETTINGS_SYNC_KEYSET_DCE_CORRECTIONS,
  TARGET117_SETTINGS_SYNC_KEYSET_DCE_EVIDENCE_IDS,
} from '../cases/2.1.116-to-2.1.117/recovered/settings-sync-keyset-dce-overrides.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.117-settings-sync-keyset-dce-proof.json',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.116-to-2.1.117/recovered/settings-sync-keyset-dce-overrides.mjs',
)
const coveragePath = path.join(
  root,
  'recovery/cases/2.1.116-to-2.1.117/semantic/source-coverage.json.gz',
)
const artifactRoot = path.join(root, '.recovery-tmp/authenticated-artifacts')
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.117/src'),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const FIXTURE_SHA256 =
  '053e5392f852399c8488f659897210046ae64fbf3ff5a1c9cf2e4294d0e81bfc'
const HELPER_SHA256 =
  '483e3a4c26d76c06075cfde2cd900d89637d802db1eaaa0ade7c333cfa31a7b9'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(
    descriptor(bytes),
    { bytes: expected.bytes, sha256: expected.sha256 },
    label,
  )
  return bytes
}

function artifactPath(environmentName, input) {
  return process.env[environmentName]
    ? path.resolve(process.env[environmentName])
    : path.join(artifactRoot, input.artifact)
}

function walk(node, visit, parent = null) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, parent)
    return
  }
  visit(node, parent)
  for (const [key, child] of Object.entries(node)) {
    if (!['start', 'end', 'loc', 'range'].includes(key)) {
      walk(child, visit, node)
    }
  }
}

function canonicalRows() {
  return fixture.residues.map(residue => [
    fixture.targetUnit.targetIndex,
    residue.literalKind,
    residue.value,
    residue.start,
    residue.end,
    residue.baselineOccurrenceCount,
    residue.targetOccurrenceNumber,
  ])
}

test(
  'Target117 settings-sync keyset DCE fixture and correction are frozen',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(
      fixture.evidenceIds,
      TARGET117_SETTINGS_SYNC_KEYSET_DCE_EVIDENCE_IDS,
    )
    assert.deepEqual(TARGET117_SETTINGS_SYNC_KEYSET_DCE_CORRECTIONS, [
      {
        key: `${caseName}:${fixture.targetUnit.targetIndex}`,
        targetIndex: fixture.targetUnit.targetIndex,
        category: fixture.category,
        evidenceIds: fixture.evidenceIds,
        reason: fixture.reason,
      },
    ])
    assert.equal(
      sha256(JSON.stringify([fixture.targetUnit.targetIndex])),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      sha256(JSON.stringify(canonicalRows())),
      fixture.summary.residueIdentitiesSha256,
    )
  },
)

test(
  'authenticated Target117 initializer and structural units remain exact',
  { skip: !selected },
  () => {
    readExact(
      artifactPath('CLAUDE_CODE_2_1_116_BUNDLE', fixture.baselineBundle),
      fixture.baselineBundle,
      'Target116 bundle',
    )
    const target = readExact(
      artifactPath('CLAUDE_CODE_2_1_117_BUNDLE', fixture.targetBundle),
      fixture.targetBundle,
      'Target117 bundle',
    )
    const structural = JSON.parse(
      gunzipSync(
        readExact(
          path.join(root, fixture.structural.path),
          fixture.structural,
          'Target117 structural ledger',
        ),
      ),
    )
    for (const expected of [
      fixture.bindingDeclarationUnit,
      fixture.targetUnit,
      fixture.parentInitializerUnit,
    ]) {
      const region = structural.regions.find(
        candidate => candidate.target.index === expected.targetIndex,
      )
      assert.ok(region)
      assert.equal(region.classification, expected.classification)
      assert.equal(region.target.start, expected.start)
      assert.equal(region.target.end, expected.end)
      assert.equal(region.target.sourceHash, expected.sha256)
      if (expected.baselineUnitIndex !== undefined) {
        assert.equal(region.baselineUnitIndex, expected.baselineUnitIndex)
      }
      const bytes = target.subarray(expected.start, expected.end)
      assert.deepEqual(descriptor(bytes), {
        bytes: expected.bytes,
        sha256: expected.sha256,
      })
      if (expected.text !== undefined) {
        assert.equal(bytes.toString('utf8'), expected.text)
      }
    }
    for (const residue of fixture.residues) {
      assert.equal(
        JSON.parse(target.subarray(residue.start, residue.end).toString('utf8')),
        residue.value,
      )
    }
  },
)

test(
  'complete bundle bindings prove the keyset and Set allocations cannot escape',
  { skip: !selected },
  () => {
    const target = fs
      .readFileSync(
        artifactPath('CLAUDE_CODE_2_1_117_BUNDLE', fixture.targetBundle),
      )
      .toString('utf8')
    const ast = parse(target, {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    })
    const identifiers = { db1: [], QGY: [], xd7: [] }
    const parents = new Map()
    let targetDeclaration
    let bindingDeclaration
    let parentDeclaration
    walk(ast, (node, parent) => {
      if (node.type === 'Identifier' && Object.hasOwn(identifiers, node.name)) {
        identifiers[node.name].push(node.start)
        parents.set(node.start, parent)
      }
      if (
        node.type === 'VariableDeclaration' &&
        node.start === fixture.targetUnit.start &&
        node.end === fixture.targetUnit.end
      )
        targetDeclaration = node
      if (
        node.type === 'VariableDeclaration' &&
        node.start === fixture.bindingDeclarationUnit.start &&
        node.end === fixture.bindingDeclarationUnit.end
      )
        bindingDeclaration = node
      if (
        node.type === 'VariableDeclaration' &&
        node.start === fixture.parentInitializerUnit.start &&
        node.end === fixture.parentInitializerUnit.end
      )
        parentDeclaration = node
    })
    assert.deepEqual(identifiers, fixture.bindings)
    assert.ok(bindingDeclaration)
    assert.deepEqual(
      bindingDeclaration.declarations.map(item => item.id.name),
      ['db1', 'QGY'],
    )
    assert.ok(targetDeclaration)
    assert.equal(targetDeclaration.declarations.length, 1)
    const targetDeclarator = targetDeclaration.declarations[0]
    assert.equal(targetDeclarator.id.name, 'xd7')
    assert.equal(targetDeclarator.init.type, 'CallExpression')
    assert.equal(targetDeclarator.init.callee.name, 'v')
    assert.equal(targetDeclarator.init.arguments.length, 1)
    const initializer = targetDeclarator.init.arguments[0]
    assert.equal(initializer.type, 'ArrowFunctionExpression')
    assert.deepEqual(initializer.params, [])
    assert.equal(initializer.body.type, 'BlockStatement')
    assert.equal(initializer.body.body.length, 1)
    const [allocationStatement] = initializer.body.body
    assert.equal(allocationStatement.type, 'ExpressionStatement')
    assert.equal(allocationStatement.expression.type, 'SequenceExpression')
    assert.equal(allocationStatement.expression.expressions.length, 2)
    const [arrayAssignment, setAssignment] =
      allocationStatement.expression.expressions
    assert.equal(arrayAssignment.type, 'AssignmentExpression')
    assert.equal(arrayAssignment.left.name, 'db1')
    assert.equal(arrayAssignment.right.type, 'ArrayExpression')
    assert.deepEqual(
      arrayAssignment.right.elements.map(element => element.value),
      fixture.residues.map(residue => residue.value),
    )
    assert.equal(setAssignment.type, 'AssignmentExpression')
    assert.equal(setAssignment.left.name, 'QGY')
    assert.equal(setAssignment.right.type, 'NewExpression')
    assert.equal(setAssignment.right.callee.name, 'Set')
    assert.deepEqual(
      setAssignment.right.arguments.map(argument => argument.name),
      ['db1'],
    )
    assert.equal(
      initializer.body.body.some(statement => statement.type === 'ReturnStatement'),
      false,
    )

    assert.ok(parentDeclaration)
    const parentText = target.slice(parentDeclaration.start, parentDeclaration.end)
    assert.equal(
      parentText.slice(
        fixture.parentInitializerUnit.requiredCall.start -
          parentDeclaration.start,
        fixture.parentInitializerUnit.requiredCall.end - parentDeclaration.start,
      ),
      fixture.parentInitializerUnit.requiredCall.text,
    )
    assert.equal(parents.get(fixture.bindings.xd7[0]).type, 'VariableDeclarator')
    assert.equal(parents.get(fixture.bindings.xd7[1]).type, 'CallExpression')
    assert.equal(parents.get(fixture.bindings.db1[0]).type, 'VariableDeclarator')
    assert.equal(parents.get(fixture.bindings.db1[1]).type, 'AssignmentExpression')
    assert.equal(parents.get(fixture.bindings.db1[2]).type, 'NewExpression')
    assert.equal(parents.get(fixture.bindings.QGY[0]).type, 'VariableDeclarator')
    assert.equal(parents.get(fixture.bindings.QGY[1]).type, 'AssignmentExpression')
  },
)

test(
  'the provisional agents owner is exact, unrelated, and marker-free',
  { skip: !selected },
  () => {
    const owner = readExact(
      path.join(
        sourceRoot,
        fixture.rejectedProvisionalOwner.path.replace(/^src\//, ''),
      ),
      fixture.rejectedProvisionalOwner,
    ).toString('utf8')
    for (const marker of fixture.rejectedProvisionalOwner.requiredAbsentMarkers) {
      assert.equal(owner.includes(marker), false, marker)
    }
  },
)

test(
  'Target117 coverage classifies the allocation-only unit as ownerless DCE',
  { skip: !selected },
  () => {
    const coverage = JSON.parse(gunzipSync(fs.readFileSync(coveragePath)))
    const row = coverage.rows.find(
      candidate => candidate.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert.ok(row)
    assert.equal(row.sourceHash, fixture.targetUnit.sha256)
    assert.equal(row.disposition, 'dce-nonruntime')
    assert.deepEqual(row.ownerIds, [])
    assert.deepEqual(row.evidenceIds, fixture.evidenceIds)
    assert.equal(row.category, fixture.category)
    assert.equal(row.reason, fixture.reason)
  },
)
