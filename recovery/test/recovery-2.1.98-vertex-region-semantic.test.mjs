import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.97-to-2.1.98'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const historicalSource = semanticCase === caseName
const targetBundlePath = process.env.CLAUDE_CODE_2_1_98_BUNDLE
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = { skip: selected ? false : `not applicable to ${semanticCase}` }
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_98_BUNDLE is not set'
      : false,
}
const adjacentOptions = {
  skip: bundleOptions.skip || !baselineBundlePath
    ? bundleOptions.skip || 'CLAUDE_CODE_2_1_97_BUNDLE is not set'
    : false,
}
const structural = JSON.parse(gunzipSync(fs.readFileSync(path.join(
  repositoryRoot,
  'recovery/cases',
  caseName,
  'structural/generated-delta.json.gz',
))))

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test('target98 pins the Vertex Opus 4.5 region override', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), '27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556')
  const bundle = bytes.toString('utf8')
  const region = structural.regions.find(row => row.target?.index === 613)
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [49475, 50218, '6573a0ccd32d37ca00c3a7ac0975ab8dc5e7b4d6af30adb9f1941aad270041e9'],
  )
  const owner = bundle.slice(region.target.start, region.target.end)
  assert.equal(sha256(owner), region.target.sourceHash)
  assert.ok(owner.includes('["claude-opus-4-5","VERTEX_REGION_CLAUDE_4_5_OPUS"]'))
  assert.ok(owner.indexOf('claude-opus-4-6') < owner.indexOf('claude-opus-4-5'))
  assert.ok(owner.indexOf('claude-opus-4-5') < owner.indexOf('claude-opus-4-1'))
})

test('source keeps the dedicated Opus 4.5 Vertex override in model-prefix order', sourceOptions, () => {
  const source = fs.readFileSync(path.join(sourceRoot, 'utils/envUtils.ts'), 'utf8')
  const opus46 = "['claude-opus-4-6', 'VERTEX_REGION_CLAUDE_4_6_OPUS']"
  const opus45 = "['claude-opus-4-5', 'VERTEX_REGION_CLAUDE_4_5_OPUS']"
  const opus41 = "['claude-opus-4-1', 'VERTEX_REGION_CLAUDE_4_1_OPUS']"
  assert.ok(source.includes(opus45))
  assert.ok(source.indexOf(opus46) < source.indexOf(opus45))
  assert.ok(source.indexOf(opus45) < source.indexOf(opus41))
  if (historicalSource) {
    assert.equal(source.includes('VERTEX_REGION_CLAUDE_4_7_OPUS'), false)
  } else {
    assert.ok(source.includes('VERTEX_REGION_CLAUDE_4_7_OPUS'))
  }
})

test('2.1.97 has not introduced the Opus 4.5 override yet', adjacentOptions, () => {
  const bytes = fs.readFileSync(baselineBundlePath)
  assert.equal(sha256(bytes), '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988')
  assert.equal(bytes.toString('utf8').includes('VERTEX_REGION_CLAUDE_4_5_OPUS'), false)
})
