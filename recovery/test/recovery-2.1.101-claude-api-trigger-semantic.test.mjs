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
const baselinePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(repositoryRoot, 'recovery/cases', caseName, 'structural/generated-delta.json.gz'),
    ),
  ),
)

const unit = [
  18595,
  13252330,
  13253465,
  '0c95ebd7ea9cadc474dfec41941875a8df485bcf43b84037ff6799e99c41a1cf',
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test(
  'target101 pins the expanded Claude API and Managed Agents trigger',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.100 and 2.1.101 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(sha256(baselineBytes), 'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be')
    assert.equal(sha256(targetBytes), 'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb')
    const [index, start, end, hash] = unit
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, hash],
    )
    const fragment = targetBytes.toString('utf8').slice(start, end)
    assert.equal(sha256(fragment), hash)
    for (const marker of [
      'Build, debug, and optimize Claude API / Anthropic SDK apps.',
      'Managed Agents (`/v1/agents`, `/v1/sessions`)',
      'adaptive thinking',
      'cache creation',
      'agent-openai.py',
    ]) assert.ok(fragment.includes(marker), marker)
    assert.equal(
      baselineBytes.toString('utf8').includes(
        'Build, debug, and optimize Claude API / Anthropic SDK apps.',
      ),
      false,
    )
  },
)

test(
  'source owns the target101 trigger and the latest target116 evolution',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const source = fs.readFileSync(
      path.join(sourceRoot, 'skills/bundled/claudeApi.ts'),
      'utf8',
    )
    assert.ok(source.includes('Build, debug, and optimize Claude API / Anthropic SDK apps.'))
    assert.ok(source.includes('Apps built with this skill should include prompt caching.'))
    if (semanticCase === caseName) {
      for (const marker of [
        'Managed Agents (`/v1/agents`, `/v1/sessions`)',
        'adaptive thinking',
        'cache creation',
        'agent-openai.py',
      ]) assert.ok(source.includes(marker), marker)
      return
    }
    assert.ok(
      source.includes(
        'Also handles migrating existing Claude API code between Claude model versions (4.5 → 4.6, 4.6 → 4.7, retired-model replacements).',
      ),
    )
    assert.ok(source.includes('user asks for the Claude API, Anthropic SDK, or Managed Agents'))
    assert.ok(source.includes('SKIP: file imports `openai`/other-provider SDK'))
  },
)

test(
  'target116 retains the evolved Claude API routing description',
  { skip: latestPath ? false : 'authenticated 2.1.116 inner bundle is required' },
  () => {
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(sha256(latestBytes), 'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a')
    const latest = latestBytes.toString('utf8')
    assert.ok(latest.includes('Also handles migrating existing Claude API code between Claude model versions'))
    assert.ok(latest.includes('user asks for the Claude API, Anthropic SDK, or Managed Agents'))
  },
)
