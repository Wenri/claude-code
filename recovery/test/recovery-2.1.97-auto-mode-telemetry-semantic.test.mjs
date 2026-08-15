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

test('target97 pins the auto-mode telemetry flag in its complete owner', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(bytes),
    '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988',
  )
  const region = structural.regions[13123]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [
      9942143,
      9948337,
      '36a66a1d847024246de206a6a30cf9d963af063add4a9da5925bb8d9b534dd56',
    ],
  )
  const bundle = bytes.toString('utf8')
  const owner = bundle.slice(region.target.start, region.target.end)
  for (const fragment of [
    'tengu_auto_mode_decision',
    'stripAllBashFlag:',
    '"tengu_bash_allowlist_strip_all",!1',
    'originalDecisionReasonType:',
    '.decisionReason?.type',
  ]) {
    assert.ok(owner.includes(fragment), fragment)
  }
  assert.equal(sha256(owner), region.target.sourceHash)
})

test('source records the feature flag and original decision in classifier telemetry', sourceOptions, () => {
  const source = fs.readFileSync(
    path.join(sourceRoot, 'utils/permissions/permissions.ts'),
    'utf8',
  )
  for (const fragment of [
    "stripAllBashFlag: getFeatureValue_CACHED_WITH_REFRESH(",
    "'tengu_bash_allowlist_strip_all'",
    'originalDecisionReasonType: result.decisionReason',
    '?.type as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS',
  ]) {
    assert.ok(source.includes(fragment), fragment)
  }
})

test('2.1.96 lacks only the newly introduced strip-all flag', adjacentOptions, () => {
  const bytes = fs.readFileSync(baselineBundlePath)
  assert.equal(
    sha256(bytes),
    '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e',
  )
  const bundle = bytes.toString('utf8')
  assert.equal(bundle.includes('tengu_bash_allowlist_strip_all'), false)
  assert.equal(bundle.includes('originalDecisionReasonType'), true)
})
