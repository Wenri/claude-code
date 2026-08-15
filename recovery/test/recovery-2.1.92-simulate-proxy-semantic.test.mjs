import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.91-to-2.1.92'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_92_BUNDLE
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

test('2.1.92 pins the first SIMULATE_PROXY_USAGE request branch', {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_92_BUNDLE is not set'
      : false,
}, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(bytes),
    '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362',
  )
  const bundle = bytes.toString('utf8')
  const region = structural.regions[16151]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [
      11625342,
      11642919,
      '3588ce25909a0b85dbb4ab29bdb4508e97d93a0bc20235106f56c399c4df2c21',
    ],
  )
  const target = bundle.slice(region.target.start, region.target.end)
  assert.equal(sha256(target), region.target.sourceHash)
  for (const fragment of [
    'CLAUDE_CODE_SIMULATE_PROXY_USAGE',
    '[API:client] SIMULATE_PROXY_USAGE: stripping ',
    ' beta headers from request: ',
  ]) {
    assert.ok(target.includes(fragment), fragment)
  }
})

test('materialized source suppresses all proxy-sensitive request fields', {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}, () => {
  const source = fs.readFileSync(
    path.join(sourceRoot, 'services/api/claude.ts'),
    'utf8',
  )
  const fragments = [
    'process.env.CLAUDE_CODE_SIMULATE_PROXY_USAGE',
    '[API:client] SIMULATE_PROXY_USAGE: stripping ${betasParams.length} beta headers from request: ${betasParams.join(\', \')}',
    'lastRequestBetas = simulateProxyUsage ? [] : betasParams',
    'useBetas && !simulateProxyUsage && { betas: betasParams }',
    '!simulateProxyUsage && extraBodyParams ? extraBodyParams : {}',
  ]
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), fragment)
  }
  const logOffset = source.indexOf('SIMULATE_PROXY_USAGE: stripping')
  const assignOffset = source.indexOf(
    'lastRequestBetas = simulateProxyUsage ? [] : betasParams',
  )
  const returnOffset = source.indexOf('return {', assignOffset)
  assert.ok(logOffset >= 0 && assignOffset > logOffset && returnOffset > assignOffset)
})
