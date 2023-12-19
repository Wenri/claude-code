import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
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
const identity = [
  6669993,
  6674274,
  'a446c4eac8e6e723757559d25a6f8611bbd7e05fcd6da5c151d87401c9afd94c',
]
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_100_BUNDLE and CLAUDE_CODE_2_1_101_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test('target101 pins the keybinding schema unit containing app:openFrame', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be',
  )
  assert.equal(
    sha256(targetBytes),
    'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
  )
  const region = structural.regions[8167]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    identity,
  )
  const unit = targetBytes.toString('utf8').slice(identity[0], identity[1])
  assert.equal(sha256(unit), identity[2])
  assert.equal(
    parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
    1,
  )
  assert.ok(unit.includes('app:openFrame'))
})

test('app:openFrame enters the observable keybinding validator at 101', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  assert.equal(baseline.includes('app:openFrame'), false)
  assert.equal(target.match(/app:openFrame/g)?.length, 1)
})

test('source exposes app:openFrame as a valid app-level action', sourceOptions, () => {
  const source = fs.readFileSync(
    path.join(sourceRoot, 'keybindings/schema.ts'),
    'utf8',
  )
  assert.ok(source.includes("'app:quickOpen',\n  'app:openFrame',"))
  assert.equal(source.match(/app:openFrame/g)?.length, 1)
  assert.ok(source.indexOf('app:openFrame') < source.indexOf('// History navigation'))
})
