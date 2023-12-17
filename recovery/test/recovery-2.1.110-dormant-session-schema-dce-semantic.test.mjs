import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const targetPath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(root, 'recovery/cases', caseName, 'structural/generated-delta.json.gz'),
    ),
  ),
)
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')

function walk(node, visit) {
  if (!node || typeof node !== 'object') return
  visit(node)
  for (const [key, value] of Object.entries(node)) {
    if (key === 'start' || key === 'end' || key === 'loc') continue
    if (Array.isArray(value)) for (const child of value) walk(child, visit)
    else walk(value, visit)
  }
}

test(
  'target110 dormant remote-session schema remains a non-escaping allocation',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetPath
        ? 'authenticated target110 bundle is required'
        : false,
  },
  () => {
    const bytes = fs.readFileSync(targetPath)
    assert.equal(sha256(bytes), 'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861')
    const target = bytes.toString('utf8')
    const region = structural.regions[15075]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.nodeType, region.target.sourceHash],
      [10943055, 10944066, 'VariableDeclaration', '424f08f334789f34b5857c1f0a3e9209941160a335284436ba353cfaffce7ae9'],
    )
    const unit = target.slice(region.target.start, region.target.end)
    assert.equal(sha256(unit), region.target.sourceHash)
    for (const property of ['needs_you', 'linkScanOffset', 'linkScanPath', 'routine', 'pinned']) {
      assert.match(unit, new RegExp(`${property}:`))
    }

    const ast = parse(unit, { ecmaVersion: 'latest', sourceType: 'script' })
    const assignments = []
    const identifiers = []
    walk(ast, node => {
      if (node.type === 'AssignmentExpression') assignments.push(node)
      if (node.type === 'Identifier') identifiers.push(node)
    })
    const schemaAssignment = assignments.find(assignment =>
      assignment.left?.type === 'Identifier' &&
      assignment.right?.type === 'CallExpression' &&
      unit.slice(assignment.right.start, assignment.right.end).includes('linkScanOffset'),
    )
    assert.ok(schemaAssignment)
    const binding = schemaAssignment.left.name
    assert.equal(identifiers.filter(identifier => identifier.name === binding).length, 1)
    assert.equal(target.split(binding).length - 1, 2)
    assert.ok(target.includes(`var ${binding};var `))
  },
)
