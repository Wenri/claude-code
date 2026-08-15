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
const sourceOptions = { skip: selected ? false : `not applicable to ${semanticCase}` }
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_97_BUNDLE is not set'
      : false,
}
const adjacentOptions = {
  skip: bundleOptions.skip || !baselineBundlePath
    ? bundleOptions.skip || 'CLAUDE_CODE_2_1_96_BUNDLE is not set'
    : false,
}
const isCurrentSource =
  path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')
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

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test('target97 pins the introduced detailed PR status functions', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(bytes),
    '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988',
  )
  const expected = new Map([
    [
      17259,
      [
        12216062,
        12216326,
        'a5c171f7d5dd67b07258a7d0c509ac1efaa6f76c497c09d1de0cf5cbdcc38aa3',
      ],
    ],
    [
      17261,
      [
        12216343,
        12216930,
        '9fbe645b06377a5408a3aa428eb8e266f169a6a44a823e317cc83359ed55eb05',
      ],
    ],
  ])
  const bundle = bytes.toString('utf8')
  for (const [index, identity] of expected) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
    )
    assert.equal(
      sha256(bundle.slice(region.target.start, region.target.end)),
      region.target.sourceHash,
    )
  }
  const checks = bundle.slice(
    structural.regions[17259].target.start,
    structural.regions[17259].target.end,
  )
  for (const fragment of [
    'conclusion?.toUpperCase()',
    '"SUCCESS"',
    '"NEUTRAL"',
    '"SKIPPED"',
    '"ACTION_REQUIRED"',
    'status?.toUpperCase()!=="COMPLETED"',
  ]) {
    assert.ok(checks.includes(fragment), fragment)
  }
  const fetch = bundle.slice(
    structural.regions[17261].target.start,
    structural.regions[17261].target.end,
  )
  for (const fragment of [
    'number,title,state,isDraft,statusCheckRollup,reviewDecision',
    'state==="MERGED"?"MERGED":',
    'isDraft?"DRAFT":"OPEN"',
    'reviewDecision==="REVIEW_REQUIRED"',
    '30000',
  ]) {
    assert.ok(fetch.includes(fragment), fragment)
  }
})

test('source owns the target97 PR check summary and cached details fetch', sourceOptions, () => {
  const pr = source('utils/ghPrStatus.ts')
  for (const fragment of [
    'export function summarizePrChecks(',
    "conclusion === 'SUCCESS'",
    "conclusion === 'NEUTRAL'",
    "conclusion === 'SKIPPED'",
    "conclusion === 'ACTION_REQUIRED'",
    "check.status?.toUpperCase() !== 'COMPLETED'",
    'export const fetchPrDetails = memoizeWithTTLAsync(',
    "'number,title,state,isDraft,statusCheckRollup,reviewDecision",
    'checks: summarizePrChecks(data.statusCheckRollup)',
    '30_000',
  ]) {
    assert.ok(pr.includes(fragment), fragment)
  }
  if (isCurrentSource) {
    for (const fragment of [
      'check.conclusion ?? check.state',
      "conclusion === 'FAILURE' || conclusion === 'ERROR'",
      "conclusion === 'PENDING'",
      "conclusion === 'EXPECTED'",
      'mergeStateStatus,additions,deletions',
      "data.mergeStateStatus === 'HAS_HOOKS'",
    ]) {
      assert.ok(pr.includes(fragment), fragment)
    }
  } else {
    assert.equal(pr.includes('mergeStateStatus'), false)
    assert.equal(pr.includes("conclusion === 'PENDING'"), false)
  }
})

test('2.1.96 lacks the detailed PR status payload', adjacentOptions, () => {
  const bytes = fs.readFileSync(baselineBundlePath)
  assert.equal(
    sha256(bytes),
    '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e',
  )
  assert.equal(
    bytes
      .toString('utf8')
      .includes('number,title,state,isDraft,statusCheckRollup,reviewDecision'),
    false,
  )
})
