import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.96-to-2.1.97'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const targetBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)
const targetSha256 =
  '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988'
const hookUnit = {
  index: 17_898,
  start: 12_493_477,
  end: 12_494_633,
  sourceHash:
    '3efedfa5c436077b5a2b3fdd06359af185f2782be7e59fb34c5dceb7a72a3afe',
}
const disabledBindingsUnit = {
  index: 17_900,
  start: 12_494_812,
  end: 12_494_837,
  sourceHash:
    'ec5464603cfaabf8bd5efe6a8f116756571590f909273e9e290e9b777e4d3f8d',
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function walk(node, visit, parent = undefined) {
  if (!node || typeof node !== 'object') return
  visit(node, parent)
  for (const [key, value] of Object.entries(node)) {
    if (key === 'start' || key === 'end' || key === 'loc') continue
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visit, node)
    } else {
      walk(value, visit, node)
    }
  }
}

test(
  'target97 routine task integration is compile-time disabled and nonruntime',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetBundlePath
        ? 'CLAUDE_CODE_2_1_97_BUNDLE is required'
        : false,
  },
  () => {
    const bytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(bytes), targetSha256)
    const bundle = bytes.toString('utf8')
    for (const unit of [hookUnit, disabledBindingsUnit]) {
      const region = structural.regions[unit.index]
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [unit.start, unit.end, unit.sourceHash],
      )
      assert.equal(
        sha256(bundle.slice(unit.start, unit.end)),
        unit.sourceHash,
        `target unit ${unit.index}`,
      )
    }

    const initializer = bundle.slice(
      disabledBindingsUnit.start,
      disabledBindingsUnit.end,
    )
    const match = /^var (\w+),(\w+)=null,(\w+)=null;$/.exec(initializer)
    assert.ok(match, 'the feature integrations must be initialized to null')
    const proactiveBinding = match[2]
    const routineBinding = match[3]
    const hook = bundle.slice(hookUnit.start, hookUnit.end)
    assert.match(
      hook,
      new RegExp(
        `getExtraTasks:${routineBinding}&&[\\w$]+\\?\\(\\)=>${routineBinding}\\.getRoutineCronTasks\\(`,
      ),
    )

    const ast = parse(bundle, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      allowHashBang: true,
    })
    const writes = new Map([
      [proactiveBinding, []],
      [routineBinding, []],
    ])
    const reads = new Map([
      [proactiveBinding, 0],
      [routineBinding, 0],
    ])
    walk(ast, (node, parent) => {
      if (node.type !== 'Identifier' || !writes.has(node.name)) return
      reads.set(node.name, reads.get(node.name) + 1)
      const isDeclaration =
        parent?.type === 'VariableDeclarator' && parent.id === node
      const isAssignment =
        parent?.type === 'AssignmentExpression' && parent.left === node
      const isUpdate = parent?.type === 'UpdateExpression'
      if (isAssignment || isUpdate) writes.get(node.name).push(node.start)
      if (isDeclaration) {
        assert.equal(parent.init?.type, 'Literal')
        assert.equal(parent.init?.value, null)
      }
    })
    assert.ok(reads.get(proactiveBinding) > 1)
    assert.ok(reads.get(routineBinding) > 1)
    assert.deepEqual(writes.get(proactiveBinding), [])
    assert.deepEqual(writes.get(routineBinding), [])
    assert.equal(
      bundle.split('getRoutineCronTasks').length - 1,
      1,
      'the sole routine call is guarded by a binding that remains null',
    )
  },
)
