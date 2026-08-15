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
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_104_BUNDLE and CLAUDE_CODE_2_1_105_BUNDLE are required'
      : false,
}
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test('target105 pins the proactive alias in the complete /loop owner', bundleOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath)
  const target = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(baseline), 'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39')
  assert.equal(sha256(target), '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75')

  const region = structural.regions[18678]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [12964182, 12970066, '343beff770ea470b9c163b154d9fec27679299a83d0821b4ee965a47db96311b'],
  )
  const unit = target.toString('utf8').slice(region.target.start, region.target.end)
  assert.equal(sha256(unit), region.target.sourceHash)
  assert.ok(unit.includes('name:"loop",aliases:["proactive"]'))
  assert.ok(unit.includes('isLoopDynamicEnabled'))
  assert.ok(unit.includes('readLoopFile'))
  assert.equal(baseline.toString('utf8').includes('aliases:["proactive"]'), false)
})

test('source registers proactive as an exact alias on the reachable /loop skill', sourceOptions, () => {
  const owner = fs.readFileSync(
    path.join(sourceRoot, 'skills/bundled/loop.ts'),
    'utf8',
  )
  assert.ok(owner.includes("name: 'loop'"))
  assert.ok(owner.includes("aliases: ['proactive']"))
  assert.ok(owner.includes('isKairosCronEnabled'))
  assert.ok(owner.includes('registerBundledSkill'))
  assert.match(owner, /(?:argumentHint:\s*'\[interval\] <prompt>'|get argumentHint\(\))/)
})
