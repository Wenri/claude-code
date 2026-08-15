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

test('target97 pins the complete token-warning notification owner', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(bytes),
    '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988',
  )
  const region = structural.regions[17012]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [
      12127537,
      12129296,
      '2a661a1ba183f9ce4c67075eedb409211d6fd1c563bf491d037abe220a980b7b',
    ],
  )
  const owner = bytes
    .toString('utf8')
    .slice(region.target.start, region.target.end)
  assert.equal(sha256(owner), region.target.sourceHash)
  for (const fragment of [
    'key:"token-warning"',
    'priority:"medium"',
    'timeoutMs:18000000',
    'fold:(m,S)=>S',
    'else v("token-warning")',
  ]) {
    assert.ok(owner.includes(fragment), fragment)
  }
})

test('source queues and replaces the compact warning through notification state', sourceOptions, () => {
  const source = fs.readFileSync(
    path.join(sourceRoot, 'components/PromptInput/Notifications.tsx'),
    'utf8',
  )
  for (const fragment of [
    'useCompactWarningSuppression()',
    'isShowingCompactMessage && !suppressCompactWarning && !isBriefOnly',
    "key: 'token-warning'",
    "priority: 'medium'",
    'timeoutMs: 18_000_000',
    'fold: (_existing, newer) => newer',
    "removeNotification('token-warning')",
    'calculateTokenWarningState(tokenUsage, mainLoopModel, autoCompactWindow)',
  ]) {
    assert.ok(source.includes(fragment), fragment)
  }
  assert.equal(
    source.includes(
      '<TokenWarning tokenUsage={tokenUsage} model={mainLoopModel} />}',
    ),
    false,
    'TokenWarning must not also be rendered directly outside notification state',
  )
})

test('2.1.96 predates the token-warning notification', adjacentOptions, () => {
  const bytes = fs.readFileSync(baselineBundlePath)
  assert.equal(
    sha256(bytes),
    '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e',
  )
  const bundle = bytes.toString('utf8')
  assert.equal(bundle.includes('token-warning'), false)
  assert.equal(bundle.includes('timeoutMs:18000000'), false)
})
