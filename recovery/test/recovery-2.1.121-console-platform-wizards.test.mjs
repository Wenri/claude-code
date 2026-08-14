import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const bundles = [
  [
    ['CLAUDE_CODE_2_1_120_BUNDLE', 'CLAUDE_2_1_120_CLI_INNER'],
    13_784_743,
    'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f',
  ],
  [
    ['CLAUDE_CODE_2_1_121_BUNDLE', 'CLAUDE_2_1_121_CLI_INNER'],
    13_908_188,
    '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  ],
]

function readBundle([names, expectedBytes, expectedSha256]) {
  const filename = names.map(name => process.env[name]).find(Boolean)
  assert.ok(filename, `${names.join(' or ')} must be set`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, expectedBytes)
  assert.equal(
    crypto.createHash('sha256').update(value).digest('hex'),
    expectedSha256,
  )
  return value.toString('utf8')
}

function occurrences(value, fragment) {
  return value.split(fragment).length - 1
}

test('authenticates the retained Bedrock and Vertex wizard surface in both adjacent bundles', () => {
  for (const bundle of bundles.map(readBundle)) {
    for (const [fragment, count] of [
      ['tengu_oauth_bedrock_wizard_launched', 1],
      ['tengu_oauth_vertex_wizard_launched', 1],
      ['tengu_bedrock_setup_complete', 1],
      ['tengu_vertex_setup_complete', 1],
      ['Set up AWS Bedrock', 2],
      ['Set up Google Vertex AI', 1],
      ['Pin model versions', 2],
      ['Calling AWS STS and Bedrock', 1],
      ['Calling Google Cloud', 1],
      ['Reading ~/.aws', 1],
      ['Reading ~/.config/gcloud', 1],
      ['Save anyway (skip verification)', 2],
      ['no InvokeModel permission', 1],
      ['no aiplatform.endpoints.predict permission', 1],
      ['Pin the working models with 1M context', 2],
    ]) {
      assert.equal(occurrences(bundle, fragment), count, fragment)
    }
  }
})

test('recovers platform selection, completion, and restart wiring', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/components/ConsoleOAuthFlow.tsx'),
    'utf8',
  )
  for (const fragment of [
    "state: 'bedrock_wizard'",
    "state: 'vertex_wizard'",
    "'tengu_oauth_bedrock_wizard_launched'",
    "'tengu_oauth_vertex_wizard_launched'",
    "'tengu_oauth_platform_docs_opened'",
    '<BedrockSetupWizard',
    '<VertexSetupWizard',
    "hasCompletedOnboarding: true",
    'lastOnboardingVersion: MACRO.VERSION',
    "import('../utils/relaunch.js')",
    "typeof settings.forceLoginOrgUUID === 'string'",
  ]) {
    assert.equal(source.includes(fragment), true, fragment)
  }
})

test('recovers provider discovery, verification, model probing, and settings persistence', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/components/ConsoleOAuthWizards.tsx'),
    'utf8',
  )
  for (const fragment of [
    "fromNodeProviderChain",
    "new GetCallerIdentityCommand({})",
    "new ListInferenceProfilesCommand({",
    "max_tokens: 1",
    "status === 429",
    "GCP_CREDENTIAL_TIMEOUT_MS = 12_000",
    "buildVertexGoogleAuth(",
    "quota_project_id",
    "no InvokeModel permission",
    "no aiplatform.endpoints.predict permission",
    "ANTHROPIC_DEFAULT_SONNET_MODEL",
    "AWS_BEARER_TOKEN_BEDROCK",
    "ANTHROPIC_VERTEX_PROJECT_ID",
    "updateSettingsForSource('userSettings'",
    "'tengu_bedrock_setup_complete'",
    "'tengu_vertex_setup_complete'",
    "Pin the working models with 1M context",
  ]) {
    assert.equal(source.includes(fragment), true, fragment)
  }
})
