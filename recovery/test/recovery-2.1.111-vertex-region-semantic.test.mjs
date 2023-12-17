import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.110-to-2.1.111'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_111_BUNDLE
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_110_BUNDLE and CLAUDE_CODE_2_1_111_BUNDLE are required'
      : false,
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

test('target 2.1.111 pins the Opus 4.7 Vertex override table unit', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
  )
  assert.equal(
    sha256(targetBytes),
    '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0',
  )
  const region = structural.regions.find(row => row.target?.index === 616)
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [
      49712,
      50519,
      '9b92636fcb790c3dfe6908f7ae12f20c5947b15673081880ea994be643736beb',
    ],
  )
  const target = targetBytes.toString('utf8')
  const owner = target.slice(region.target.start, region.target.end)
  assert.equal(sha256(owner), region.target.sourceHash)
  assert.equal(
    owner.includes('["claude-opus-4-7","VERTEX_REGION_CLAUDE_4_7_OPUS"]'),
    true,
  )
  assert.equal(
    baselineBytes
      .toString('utf8')
      .includes('VERTEX_REGION_CLAUDE_4_7_OPUS'),
    false,
  )
})

test('source reproduces the complete target 2.1.111 Vertex Opus prefix order', sourceOptions, () => {
  const source = fs.readFileSync(path.join(sourceRoot, 'utils/envUtils.ts'), 'utf8')
  const entries = [
    "['claude-opus-4-7', 'VERTEX_REGION_CLAUDE_4_7_OPUS']",
    "['claude-opus-4-6', 'VERTEX_REGION_CLAUDE_4_6_OPUS']",
    "['claude-opus-4-5', 'VERTEX_REGION_CLAUDE_4_5_OPUS']",
    "['claude-opus-4-1', 'VERTEX_REGION_CLAUDE_4_1_OPUS']",
    "['claude-opus-4', 'VERTEX_REGION_CLAUDE_4_0_OPUS']",
  ]
  let previous = -1
  for (const entry of entries) {
    const index = source.indexOf(entry)
    assert.ok(index > previous, entry)
    previous = index
  }
  assert.ok(source.includes('return process.env[match[1]] || getDefaultVertexRegion()'))
})
