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
const explicitSourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
const sourceRoot = explicitSourceRoot
  ? path.resolve(explicitSourceRoot)
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

test('target97 pins the complete Max-plan cost-steering selector', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(bytes),
    '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988',
  )
  const region = structural.regions[11755]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [
      8989746,
      8989990,
      '344286dcff412f1d5dacd715d9e40ad862b67bebe064ba82174b78b8c706c3a1',
    ],
  )
  const owner = bytes
    .toString('utf8')
    .slice(region.target.start, region.target.end)
  assert.equal(sha256(owner), region.target.sourceHash)
  for (const fragment of [
    'CLAUDE_CODE_AGENT_COST_STEER',
    'q==="pro"',
    'tengu_willow_prism',
    'q==="max"',
    'tengu_basalt_kite',
  ]) {
    assert.ok(owner.includes(fragment), fragment)
  }
})

test('source gates exact no-unsolicited-agent guidance by plan and overrides', sourceOptions, () => {
  const source = fs.readFileSync(
    path.join(sourceRoot, 'tools/AgentTool/prompt.ts'),
    'utf8',
  )
  for (const fragment of [
    'function shouldSteerAgentCost(): boolean',
    'isEnvTruthy(process.env.CLAUDE_CODE_AGENT_COST_STEER)',
    'isEnvDefinedFalsy(process.env.CLAUDE_CODE_AGENT_COST_STEER)',
    "'tengu_willow_prism', false",
    'const costSteerSection = shouldSteerAgentCost()',
    '**Do not spawn agents unless the user asks.**',
    '${agentListSection}${costSteerSection}',
  ]) {
    assert.ok(source.includes(fragment), fragment)
  }

  if (semanticCase === caseName) {
    for (const fragment of [
      "subscriptionType === 'max'",
      "'tengu_basalt_kite', false",
    ]) {
      assert.ok(source.includes(fragment), fragment)
    }
  } else {
    assert.equal(
      source.includes('tengu_basalt_kite'),
      false,
      'latest target116 intentionally returned to Pro-only steering',
    )
  }
})

test('2.1.96 has inherited Pro steering but not the new Max rollout', adjacentOptions, () => {
  const bytes = fs.readFileSync(baselineBundlePath)
  assert.equal(
    sha256(bytes),
    '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e',
  )
  const bundle = bytes.toString('utf8')
  assert.equal(bundle.includes('tengu_willow_prism'), true)
  assert.equal(bundle.includes('tengu_basalt_kite'), false)
})
