import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

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
  8919489,
  8921248,
  'd06f40fef04316b7fb0cee3ffb8b16e6160fcdf6d5e5cec70ef4df1a1fda1a3d',
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

test('target101 pins rate-limit-aware API retry rendering', pairOptions, () => {
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
  const region = structural.regions[11628]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    identity,
  )
  const target = targetBytes.toString('utf8')
  const unit = target.slice(identity[0], identity[1])
  assert.equal(sha256(unit), identity[2])
  for (const fragment of [
    'mostSignificantOnly:!0',
    ' · attempt ',
    'usage limit',
    ' reached',
  ]) {
    assert.ok(unit.includes(fragment), fragment)
  }
  assert.match(unit, /retryAttempt|Y<4/)

  const baseline = baselineBytes.toString('utf8')
  const baselineAnchor = baseline.indexOf('API_TIMEOUT_MS=')
  const baselineUnit = baseline.slice(baselineAnchor - 1500, baselineAnchor + 500)
  assert.equal(baselineUnit.includes('mostSignificantOnly:!0'), false)
})

test('source owns target101 retry timing and current transient-error evolution', sourceOptions, () => {
  const source = fs.readFileSync(
    path.join(sourceRoot, 'components/messages/SystemAPIErrorMessage.tsx'),
    'utf8',
  )
  for (const fragment of [
    'getRateLimitInfoFromError(error)',
    'formatResetTime(rateLimitInfo.resetsAt)',
    'mostSignificantOnly: true',
    'usage limit',
    ' reached',
  ]) {
    assert.ok(source.includes(fragment), fragment)
  }
  assert.match(source, /remainingMs > 60_?000 \? 60_?000 : 1_?000/)
  if (semanticCase) {
    assert.ok(source.includes('const hidden = true && retryAttempt < 4'))
    assert.ok(source.includes('const upgrade = false'))
    assert.equal(source.includes('suppressTransientError'), false)
  } else {
    assert.ok(source.includes('const suppressTransientError ='))
    assert.ok(source.includes('!isNetworkConnectionError(error)'))
    assert.ok(source.includes('!rateLimitInfo'))
  }
})
