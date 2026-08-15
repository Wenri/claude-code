import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

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

const targetUnits = new Map([
  [
    16012,
    [
      11557464,
      11557641,
      '813248d88b43366463be6e4b30b4d908521909c6548fd3f7aa6b0282d801f8c4',
    ],
  ],
  [
    16048,
    [
      11620437,
      11621058,
      'ccec3e48f0537ab468d0fdffff5950907d1af27bc5153cba5302715f86ea8358',
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

test('target101 pins the complete insights response formatter', pairOptions, () => {
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
  for (const [index, targetUnit] of targetUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      targetUnit,
    )
    const unit = targetBytes.toString('utf8').slice(targetUnit[0], targetUnit[1])
    assert.equal(sha256(unit), targetUnit[2])
    assert.equal(
      parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
      1,
    )
  }
})

test('target101 replaces the ambiguous insights handoff and persists', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  const summary =
    'At-a-glance summary (for your context only — the user has not seen any output yet):'
  const directive =
    'Output the text between <message> tags verbatim as your entire response. Do not omit any line:'
  assert.equal(baseline.includes(summary), false)
  assert.equal(baseline.includes('Here is what the user sees:'), true)
  assert.equal(target.includes(summary), true)
  assert.equal(target.includes(directive), true)
  assert.equal(target.includes('Here is what the user sees:'), false)
  if (latestBundlePath) {
    const latest = fs.readFileSync(latestBundlePath, 'utf8')
    assert.equal(latest.includes('At-a-glance summary (for your context only'), true)
    assert.equal(latest.includes(directive), true)
  }
})

test('source owns the exact separated context and verbatim user response', sourceOptions, () => {
  const source = fs.readFileSync(
    path.join(sourceRoot, 'commands/insights.ts'),
    'utf8',
  )
  for (const fragment of [
    'function buildInsightsResponsePrompt({',
    'insightsJson: string',
    'At-a-glance summary (for your context only — the user has not seen any output yet):',
    '${header}${summaryText}',
    'Output the text between <message> tags verbatim as your entire response. Do not omit any line:',
    '<message>\nYour shareable insights report is ready:',
    'text: buildInsightsResponsePrompt({',
    'insightsJson: jsonStringify(insights, null, 2)',
    'facetsDir: getFacetsDir()',
  ]) {
    assert.ok(source.includes(fragment), fragment)
  }
  assert.equal(source.includes('Here is what the user sees:'), false)
  assert.equal(source.includes('Now output the following message exactly:'), false)
  assert.equal(source.includes('Your full shareable insights report is ready:'), false)
})
