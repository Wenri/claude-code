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
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_98_BUNDLE
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_97_BUNDLE and CLAUDE_CODE_2_1_98_BUNDLE are required'
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

const unit = [
  17422,
  12301211,
  12301921,
  'adac9b7c436437cd9282507e14949425f1cfb1abb1feb8908977da1949370bc4',
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function compileNamedFunction(contents, name) {
  const declarationStart = contents.indexOf(`export function ${name}`)
  assert.notEqual(declarationStart, -1, `${name}: declaration`)
  const returnType = contents.indexOf('): PrCheckSummary', declarationStart)
  assert.notEqual(returnType, -1, `${name}: return type`)
  const bodyStart = contents.indexOf('{', returnType)
  let depth = 0
  let bodyEnd = -1
  for (let index = bodyStart; index < contents.length; index++) {
    if (contents[index] === '{') depth++
    if (contents[index] === '}') {
      depth--
      if (depth === 0) {
        bodyEnd = index
        break
      }
    }
  }
  assert.notEqual(bodyEnd, -1, `${name}: body`)
  return Function('checks', contents.slice(bodyStart + 1, bodyEnd))
}

test('target 2.1.98 pins the PR-detail structural unit', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath)
  const target = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baseline),
    '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988',
  )
  assert.equal(
    sha256(target),
    '27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556',
  )
  const [index, start, end, sourceHash] = unit
  const region = structural.regions[index]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [start, end, sourceHash],
  )
  assert.equal(sha256(target.toString('utf8').slice(start, end)), sourceHash)
})

test('mergeability is introduced at the authenticated 97 to 98 boundary', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  for (const fragment of ['mergeStateStatus', 'HAS_HOOKS', 'UNSTABLE']) {
    assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
    assert.equal(target.includes(fragment), true, `${fragment}: target`)
  }
})

test('source owns PR detail parsing and the correct versioned response shape', sourceOptions, () => {
  const owner = source('src/utils/ghPrStatus.ts')
  for (const fragment of [
    'export type PrCheckSummary',
    'export type PrDetails',
    'export function summarizePrChecks',
    'export const fetchPrDetails = memoizeWithTTLAsync(',
    "data.state === 'MERGED'",
    "data.state === 'CLOSED'",
    "data.reviewDecision === 'APPROVED'",
    "data.reviewDecision === 'CHANGES_REQUESTED'",
    "data.reviewDecision === 'REVIEW_REQUIRED'",
    "data.mergeStateStatus === 'CLEAN'",
    "data.mergeStateStatus === 'HAS_HOOKS'",
    "data.mergeStateStatus === 'UNSTABLE'",
    '30_000',
  ]) {
    assert.ok(owner.includes(fragment), fragment)
  }

  const isLatest = owner.includes(
    'mergeStateStatus,additions,deletions',
  )
  if (isLatest) {
    assert.ok(owner.includes('mergeStateStatus: data.mergeStateStatus'))
    assert.ok(owner.includes('additions: data.additions'))
    assert.ok(owner.includes('deletions: data.deletions'))
  } else {
    assert.ok(
      owner.includes(
        'number,title,state,isDraft,statusCheckRollup,reviewDecision,mergeStateStatus',
      ),
    )
    assert.equal(owner.includes('mergeStateStatus: data.mergeStateStatus'), false)
    assert.equal(owner.includes('additions: data.additions'), false)
    assert.equal(owner.includes('deletions: data.deletions'), false)
  }
})

test('compiled source classifies check-rollup results like its published target', sourceOptions, () => {
  const owner = source('src/utils/ghPrStatus.ts')
  const summarizePrChecks = compileNamedFunction(owner, 'summarizePrChecks')
  const isLatest = owner.includes('conclusion ?? check.state')

  const checks = [
    { conclusion: 'SUCCESS', status: 'COMPLETED' },
    { conclusion: 'NEUTRAL', status: 'COMPLETED' },
    { conclusion: 'SKIPPED', status: 'COMPLETED' },
    { conclusion: null, status: 'IN_PROGRESS' },
    { conclusion: 'ACTION_REQUIRED', status: 'COMPLETED' },
    { conclusion: 'FAILURE', status: 'COMPLETED' },
    { conclusion: 'MYSTERY', status: 'COMPLETED' },
  ]
  assert.deepEqual(summarizePrChecks(checks), {
    passed: 3,
    failed: 2,
    pending: 2,
  })
  assert.deepEqual(summarizePrChecks(null), {
    passed: 0,
    failed: 0,
    pending: 0,
  })

  if (isLatest) {
    assert.deepEqual(
      summarizePrChecks([
        { state: 'SUCCESS', status: 'COMPLETED' },
        { conclusion: 'ERROR', status: 'COMPLETED' },
        { conclusion: 'EXPECTED', status: 'COMPLETED' },
      ]),
      { passed: 1, failed: 1, pending: 1 },
    )
  }
})
