import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const targetPath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return
  visit(node)
  for (const [key, value] of Object.entries(node)) {
    if (key === 'start' || key === 'end' || key === 'loc') continue
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visit)
    } else {
      walk(value, visit)
    }
  }
}

test('target101 session-schema delta is behind an unread module binding', {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetPath
      ? 'CLAUDE_CODE_2_1_101_BUNDLE is required'
      : false,
}, () => {
  const bytes = fs.readFileSync(targetPath)
  assert.equal(
    sha256(bytes),
    'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
  )
  const region = structural.regions[14720]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [
      10992157,
      10993070,
      'eb60e77417a76e14c3b70d1d4b674b6b93d7c702e96ad5ab39e024cb548b0340',
    ],
  )
  const bundle = bytes.toString('utf8')
  const unit = bundle.slice(region.target.start, region.target.end)
  assert.equal(sha256(unit), region.target.sourceHash)
  assert.match(unit, /linkScanPath:/)
  assert.match(unit, /proactive:/)

  const ast = parse(unit, { ecmaVersion: 'latest', sourceType: 'script' })
  const assignments = []
  const identifiers = []
  walk(ast, node => {
    if (node.type === 'AssignmentExpression') assignments.push(node)
    if (node.type === 'Identifier') identifiers.push(node)
  })
  const schemaAssignment = assignments.find(
    assignment =>
      assignment.left?.type === 'Identifier' &&
      assignment.right?.type === 'CallExpression' &&
      unit
        .slice(assignment.right.start, assignment.right.end)
        .includes('linkScanPath'),
  )
  assert.ok(schemaAssignment)
  const binding = schemaAssignment.left.name
  assert.equal(
    identifiers.filter(identifier => identifier.name === binding).length,
    1,
    'the schema binding occurs only as its assignment inside the initializer',
  )
  assert.equal(
    bundle.split(binding).length - 1,
    2,
    'the full bundle contains only the outer declaration and initializer assignment',
  )
  assert.ok(bundle.includes(`var ${binding};var `))
})
