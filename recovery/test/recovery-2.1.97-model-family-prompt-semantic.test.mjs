import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.96-to-2.1.97'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const isCurrentSource =
  path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_96_BUNDLE
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_97_BUNDLE is not set'
      : false,
}
const adjacentOptions = {
  skip:
    bundleOptions.skip || !baselineBundlePath
      ? bundleOptions.skip || 'CLAUDE_CODE_2_1_96_BUNDLE is not set'
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

const target97Prefix =
  'The most recent Claude model family is Claude 4.6 and 4.5. Model IDs — Opus 4.6:'
const target116Prefix =
  'The most recent Claude model family is Claude 4.X. Model IDs — Opus 4.7:'

test('target97 pins the complete environment-information prompt owner', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(bytes),
    '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988',
  )
  const region = structural.regions[16219]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [
      11693392,
      11694673,
      'c9791ce82f76b8c3b1492e0c4f39bb7a57459722193eda8b6ac16530bff609f6',
    ],
  )
  const owner = bytes
    .toString('utf8')
    .slice(region.target.start, region.target.end)
  assert.equal(sha256(owner), region.target.sourceHash)
  assert.ok(owner.includes(target97Prefix))
  assert.ok(owner.includes('When building AI applications, default to the latest and most capable Claude models.'))
})

test('source owns the exact target97 prompt or its verified target116 evolution', sourceOptions, () => {
  const source = fs.readFileSync(path.join(sourceRoot, 'constants/prompts.ts'), 'utf8')
  assert.equal(
    source.includes(target97Prefix) || source.includes(target116Prefix),
    true,
  )
  assert.equal(
    source.includes('The most recent Claude model family is Claude 4.5/4.6.'),
    false,
  )
  const modelFragments = isCurrentSource
    ? [
        "Opus 4.7: '${LATEST_CLAUDE_MODEL_IDS.opus}'",
        "Sonnet 4.6: '${LATEST_CLAUDE_MODEL_IDS.sonnet}'",
        "Haiku 4.5: '${LATEST_CLAUDE_MODEL_IDS.haiku}'",
        'Fast mode for Claude Code uses ${FRONTIER_MODEL_NAME}',
      ]
    : [
        "Sonnet 4.6: '${CLAUDE_4_5_OR_4_6_MODEL_IDS.sonnet}'",
        "Haiku 4.5: '${CLAUDE_4_5_OR_4_6_MODEL_IDS.haiku}'",
      ]
  for (const fragment of [
    ...modelFragments,
    'When building AI applications, default to the latest and most capable Claude models.',
  ]) {
    assert.ok(source.includes(fragment), fragment)
  }
})

test('2.1.96 has the immediately preceding family label', adjacentOptions, () => {
  const bytes = fs.readFileSync(baselineBundlePath)
  assert.equal(
    sha256(bytes),
    '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e',
  )
  const bundle = bytes.toString('utf8')
  assert.ok(bundle.includes('The most recent Claude model family is Claude 4.5/4.6.'))
  assert.equal(bundle.includes(target97Prefix), false)
})
