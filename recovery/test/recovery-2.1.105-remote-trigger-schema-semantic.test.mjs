import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(repositoryRoot, 'recovery/cases', caseName, 'structural/generated-delta.json.gz'),
    ),
  ),
)
const unit = [11907, 9282410, 9284602, '0bed2a02de10814f6c060a05401af34725ce744f082764ee26593fdcc1fe8fb8']

const sourceOptions = { skip: selected ? false : `not applicable to ${semanticCase}` }
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_104_BUNDLE and CLAUDE_CODE_2_1_105_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test('target105 pins the RemoteTrigger schema-copy evolution', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(baselineBytes), 'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39')
  assert.equal(sha256(targetBytes), '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75')
  const [index, start, end, hash] = unit
  const region = structural.regions[index]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash, region.target.nodeType],
    [start, end, hash, 'VariableDeclaration'],
  )
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')
  assert.equal(sha256(target.slice(start, end)), hash)
  assert.equal(baseline.includes('Required for create and update; optional for run'), false)
  assert.ok(target.slice(start, end).includes('Required for create and update; optional for run'))
})

test('source advertises the optional run body in the schema', sourceOptions, () => {
  const tool = fs.readFileSync(
    path.join(sourceRoot, 'tools/RemoteTriggerTool/RemoteTriggerTool.ts'),
    'utf8',
  )
  assert.ok(tool.includes(".describe('Required for create and update; optional for run')"))
})
