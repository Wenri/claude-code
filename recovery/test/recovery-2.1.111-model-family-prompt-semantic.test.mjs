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

const modelFamily =
  'The most recent Claude model family is Claude 4.X. Model IDs — Opus 4.7:'
const fastMode =
  'Fast mode for Claude Code uses Claude Opus 4.6 with faster output (it does not downgrade to a smaller model). It can be toggled with /fast and is only available on Opus 4.6.'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

const pinnedUnits = new Map([
  [
    16982,
    [
      11827179,
      11828482,
      '629b68e353d4ee9b176d0024bd1cb403b233f00efeb3cd6b5643dcbe78d29ab9',
      'unresolved',
    ],
  ],
  [
    16993,
    [
      11832360,
      11832674,
      'cb7e4aafe9ada9b755d9de4f5ebf9b31bc5c792665f1802af09c3b11ea5964bc',
      'unresolved',
    ],
  ],
])

test('2.1.111 pins the model-family environment prompt and initializer', bundleOptions, () => {
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
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  for (const [index, [start, end, sourceHash, classification]] of pinnedUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, classification, `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(target.slice(start, end)), sourceHash, `${index}: bytes`)
  }

  assert.equal(baseline.includes(modelFamily), false)
  assert.equal(baseline.includes(fastMode), false)
  assert.equal(target.includes(modelFamily), true)
  assert.equal(target.includes(fastMode), true)
  assert.equal(target.slice(11832360, 11832674).includes('opus:"claude-opus-4-7"'), true)
})

test('source reproduces the target 2.1.111 model-family guidance', sourceOptions, () => {
  const prompts = source('src/constants/prompts.ts')
  for (const fragment of [
    "const LATEST_CLAUDE_MODEL_IDS = {",
    "opus: 'claude-opus-4-7'",
    modelFamily,
    'Fast mode for Claude Code uses ${FRONTIER_MODEL_NAME} with faster output (it does not downgrade to a smaller model). It can be toggled with /fast and is only available on Opus 4.6.',
  ]) {
    assert.ok(prompts.includes(fragment), fragment)
  }
  assert.equal(
    prompts.includes('The most recent Claude model family is Claude 4.5/4.6.'),
    false,
  )
})
