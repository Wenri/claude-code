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
const latestBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
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

const units = new Map([
  [
    12729,
    [
      9751034,
      9755844,
      'fac9af0af39238168faf950085591e747b2ec7b9d213b19e2e09d82e07128448',
    ],
  ],
  [
    17996,
    [
      12570592,
      12583585,
      '4968930c8761cac5f3424cba4c4a31af072fe7f26dcf74a474ea54efd988c4c1',
    ],
  ],
])

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

test('target101 pins API-adjusted unattributed context tokens and SDK schema', pairOptions, () => {
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
  const target = targetBytes.toString('utf8')
  for (const [index, identity] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
      `${index}: structural identity`,
    )
    const unit = target.slice(identity[0], identity[1])
    assert.equal(sha256(unit), identity[2], `${index}: target bytes`)
    assert.ok(unit.includes('unattributedTokens'), `${index}: property`)
  }

  const analysis = target.slice(...units.get(12729).slice(0, 2))
  assert.match(analysis, /Math\.max\(0,[^;]+toolCallTokens[^;]+toolResultTokens[^;]+attachmentTokens[^;]+assistantMessageTokens[^;]+userMessageTokens/)
  assert.match(analysis, /Math\.max\([^,]+,Math\.min\(/)
  assert.ok(analysis.includes('redirectedContextTokens:'))

  const baseline = baselineBytes.toString('utf8')
  assert.equal(baseline.includes('unattributedTokens'), false)
  assert.equal((target.match(/unattributedTokens/g) ?? []).length, 2)
})

test('source owns the exact residual calculation and public schema', sourceOptions, () => {
  const analysis = fs.readFileSync(
    path.join(sourceRoot, 'utils/analyzeContext.ts'),
    'utf8',
  )
  const schema = fs.readFileSync(
    path.join(sourceRoot, 'entrypoints/sdk/controlSchemas.ts'),
    'utf8',
  )
  for (const fragment of [
    'const availableMessageSpace = contextWindow - fixedUsage - reservedTokens',
    'Math.min(totalFromAPI - fixedUsage, availableMessageSpace)',
    'const unattributedTokens = Math.max(',
    'messageBreakdown.toolCallTokens',
    'messageBreakdown.toolResultTokens',
    'messageBreakdown.attachmentTokens',
    'messageBreakdown.assistantMessageTokens',
    'messageBreakdown.userMessageTokens',
    'redirectedContextTokens,',
    'unattributedTokens,',
  ]) {
    assert.ok(analysis.includes(fragment), fragment)
  }
  assert.match(schema, /redirectedContextTokens:\s*z\.number\(\),\s*unattributedTokens:\s*z\.number\(\)/)
})

test(
  'target116 retains residual calculation and schema',
  {
    skip:
      semanticCase || !latestBundlePath
        ? 'current-source target116 bundle evidence is not available in this run'
        : false,
  },
  () => {
    const latest = fs.readFileSync(latestBundlePath, 'utf8')
    assert.equal((latest.match(/unattributedTokens/g) ?? []).length, 2)
    const first = latest.indexOf('unattributedTokens')
    const fragment = latest.slice(first - 4000, first + 250)
    assert.match(fragment, /Math\.max\(0,[^;]+toolCallTokens[^;]+toolResultTokens/)
  },
)
