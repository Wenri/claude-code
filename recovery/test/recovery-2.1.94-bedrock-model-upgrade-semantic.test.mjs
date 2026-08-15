import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const sourceRoot = `${(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? `${repositoryRoot}/src`
).replace(/\/$/, '')}/`
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const caseName = '2.1.92-to-2.1.94'
const selected = !semanticCase || semanticCase === caseName
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_92_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_94_BUNDLE
const BASELINE_BUNDLE_SHA256 =
  '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362'
const TARGET_BUNDLE_SHA256 =
  '11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564'

function requiredBundle(filename, label, expectedSha256) {
  assert.ok(filename, `${label} environment variable must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    expectedSha256,
  )
  return bytes.toString('utf8')
}

test('published 2.1.94 bundle introduces the complete Bedrock model-upgrade behavior', {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'authenticated 2.1.92 and 2.1.94 bundles are unavailable'
      : false,
}, () => {
  if (!selected || !baselineBundlePath || !targetBundlePath) return
  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_92_BUNDLE',
    BASELINE_BUNDLE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_94_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )
  for (const fragment of [
    'tengu_bedrock_upgrade_check',
    'tengu_bedrock_probe_result',
    'tengu_bedrock_upgrade_save_failed',
    'tengu_bedrock_upgrade_accepted',
    'tengu_bedrock_upgrade_declined',
    'tengu_bedrock_upgrade_relaunch',
    'tengu_bedrock_default_fallback',
    'Newer ${_} model available',
    'Claude Code will restart to apply.',
    'Restarting Claude Code to apply the new model…',
    'not available — using',
  ]) {
    assert.equal(baseline.includes(fragment), false, `baseline: ${fragment}`)
    assert.equal(target.includes(fragment), true, `target: ${fragment}`)
  }
  assert.equal(target.includes('for this session'), true)
  assert.match(
    target,
    /messages\.create\(\{model:q,max_tokens:1,messages:\[\{role:"user",content:"\."\}\]\}\)/,
  )
  assert.match(target, /if\(_\?\.status===429\)return!0/)
  assert.match(
    target,
    /\{label:"Yes",value:"yes"\},\{label:"No",value:"no"\}/,
  )
})

test('historical supplement and current src retain every reachable upgrade branch', {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}, () => {
  if (!selected) return
  const historicalPatch = fs.readFileSync(
    `${repositoryRoot}/recovery/cases/2.1.92-to-2.1.94/semantic-supplement.patch`,
    'utf8',
  )
  const upgrade = fs.readFileSync(
    `${sourceRoot}utils/model/bedrockModelUpgrade.tsx`,
    'utf8',
  )
  const startup = fs.readFileSync(`${sourceRoot}interactiveHelpers.tsx`, 'utf8')
  const combined = `${historicalPatch}\n${upgrade}\n${startup}`

  for (const fragment of [
    'findBedrockUpgradeCandidates',
    'checkBedrockDefaultAvailability',
    'probeBedrockModelAvailability',
    'BedrockModelUpgradeDialog',
    "getAPIProvider() !== 'bedrock'",
    'CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST',
    'application-inference-profile',
    'getBedrockInferenceProfiles()',
    'max_tokens: 1',
    "content: '.'",
    'status === 429',
    'bedrockDeclinedUpgrades',
    "updateSettingsForSource('userSettings'",
    'ANTHROPIC_SMALL_FAST_MODEL',
    'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    'Restarting Claude Code to apply the new model…',
  ]) assert.ok(combined.includes(fragment), fragment)

  assert.match(upgrade, /previousKey[\s\S]*?MODEL_KEYS\.indexOf/)
  assert.match(
    upgrade,
    /defaultWorks[\s\S]*?fallbackKey[\s\S]*?probeBedrockModelAvailability/,
  )
  if (semanticCase === '2.1.92-to-2.1.94') {
    assert.match(startup, /await runBedrockModelChecks\(root\)/)
  } else {
    assert.match(startup, /await runBedrockUpgradeCheck\(root\)/)
    assert.match(startup, /await runBedrockFallbackCheck\(root\)/)
  }
})
