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
const targetSha256 =
  '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988'
const targetUnit = {
  index: 14_516,
  start: 10_884_849,
  end: 10_885_694,
  sourceHash:
    'ab052b1bc265cfb00ae0811ffeb3fd61398f8c7b48d13cf3143c691bdabb0c7e',
}
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

test(
  'target97 linkScanOffset belongs to an unread schema binding',
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
    const region = structural.regions[targetUnit.index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [targetUnit.start, targetUnit.end, targetUnit.sourceHash],
    )
    const unit = bundle.slice(targetUnit.start, targetUnit.end)
    assert.equal(sha256(unit), targetUnit.sourceHash)
    assert.match(unit, /linkScanOffset:\w+\.number\(\)\.default\(0\)/)

    const assignment = /\b(\w+)=\w+\(\(\)=>\w+\.object\(\{/.exec(unit)
    assert.ok(assignment, 'schema initializer binding must be recoverable')
    const schemaBinding = assignment[1]
    const ast = parse(bundle, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      allowHashBang: true,
    })
    const identifiers = []
    walk(ast, node => {
      if (node.type === 'Identifier' && node.name === schemaBinding) {
        identifiers.push(node)
      }
    })
    assert.equal(
      identifiers.length,
      2,
      'binding occurs only in its module declaration and initializer assignment',
    )
    assert.deepEqual(
      identifiers.map(identifier => bundle.slice(identifier.start, identifier.end)),
      [schemaBinding, schemaBinding],
    )
  },
)
