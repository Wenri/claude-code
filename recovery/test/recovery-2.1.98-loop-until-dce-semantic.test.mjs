import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.97-to-2.1.98'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const targetBundlePath = process.env.CLAUDE_CODE_2_1_98_BUNDLE
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

test('target98 /until parse binding is statically unobservable', {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_98_BUNDLE is required'
      : false,
}, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), '27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556')
  const region = structural.regions[18345]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [12792719, 12793322, 'c83ea6f14e5103c570c2f67ba40f826f11a30488244fee520e0ab30321f593db'],
  )
  const unit = bytes.toString('utf8').slice(region.target.start, region.target.end)
  assert.equal(sha256(unit), region.target.sourceHash)
  assert.ok(unit.includes('.match(/^until\\s+(.+)$/is)'))

  const ast = parse(unit, { ecmaVersion: 'latest', sourceType: 'script' })
  const declarators = []
  const identifiers = []
  walk(ast, node => {
    if (node.type === 'VariableDeclarator') declarators.push(node)
    if (node.type === 'Identifier') identifiers.push(node)
  })
  const until = declarators.find(
    declaration =>
      declaration.init?.type === 'CallExpression' &&
      declaration.init.callee?.type === 'MemberExpression' &&
      declaration.init.callee.property?.name === 'match' &&
      declaration.init.arguments?.[0]?.type === 'Literal' &&
      declaration.init.arguments[0].regex?.pattern === '^until\\s+(.+)$',
  )
  assert.ok(until)
  assert.equal(until.id.type, 'Identifier')
  assert.equal(
    identifiers.filter(identifier => identifier.name === until.id.name).length,
    1,
    'the binding occurs only at its declaration and cannot affect any branch, return value, mutation, or call argument',
  )
})
