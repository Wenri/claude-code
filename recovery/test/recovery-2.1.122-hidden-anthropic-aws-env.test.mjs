import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = [
  {
    version: '2.1.121',
    env: 'CLAUDE_CODE_2_1_121_BUNDLE',
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
]

function readBundle(release) {
  const filename = process.env[release.env]
  assert.ok(filename, `${release.env} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return bytes.toString('utf8')
}

function count(haystack, needle) {
  return haystack.split(needle).length - 1
}

test('authenticates retained Claude Platform on AWS environment surfaces', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(count(bundle, 'ANTHROPIC_AWS_API_KEY'), 5, release.version)
    assert.equal(count(bundle, 'ANTHROPIC_AWS_WORKSPACE_ID'), 5, release.version)
    assert.ok(
      bundle.includes(
        '"CLAUDE_CODE_USE_BEDROCK","CLAUDE_CODE_USE_VERTEX","CLAUDE_CODE_USE_FOUNDRY","CLAUDE_CODE_USE_ANTHROPIC_AWS","CLAUDE_CODE_USE_MANTLE","ANTHROPIC_BASE_URL","ANTHROPIC_BEDROCK_BASE_URL","ANTHROPIC_VERTEX_BASE_URL","ANTHROPIC_FOUNDRY_BASE_URL","ANTHROPIC_AWS_BASE_URL","ANTHROPIC_BEDROCK_MANTLE_BASE_URL"',
      ),
      `${release.version}: provider-managed routing set`,
    )
    assert.ok(
      bundle.includes(
        '"CLAUDE_CODE_USE_BEDROCK","CLAUDE_CODE_USE_VERTEX","CLAUDE_CODE_USE_FOUNDRY","CLAUDE_CODE_USE_ANTHROPIC_AWS","CLAUDE_CODE_USE_MANTLE","ANTHROPIC_AWS_WORKSPACE_ID","ANTHROPIC_AWS_BASE_URL","ANTHROPIC_AWS_API_KEY","CLAUDE_CODE_SKIP_ANTHROPIC_AWS_AUTH","AWS_BEARER_TOKEN_BEDROCK"',
      ),
      `${release.version}: teammate forwarding order`,
    )
    assert.ok(
      bundle.includes(
        '"apiKeyHelper","awsAuthRefresh","awsCredentialExport","fileSuggestion","gcpAuthRefresh","otelHeadersHelper","proxyAuthHelper","statusLine"',
      ),
      `${release.version}: dangerous settings surface`,
    )
    assert.match(
      bundle,
      /label:"Claude Platform on AWS base URL"/,
      `${release.version}: provider status base URL`,
    )
    assert.match(bundle, /label:"Workspace ID"/)
    assert.match(bundle, /value:"Claude Platform on AWS auth skipped"/)
  }
})

test('source reproduces retained provider policy, forwarding, and status', () => {
  const managed = fs.readFileSync(
    path.join(repo, 'src/utils/managedEnvConstants.ts'),
    'utf8',
  )
  for (const value of [
    'CLAUDE_CODE_USE_ANTHROPIC_AWS',
    'ANTHROPIC_AWS_BASE_URL',
    'ANTHROPIC_AWS_WORKSPACE_ID',
    'ANTHROPIC_AWS_API_KEY',
    'CLAUDE_CODE_SKIP_ANTHROPIC_AWS_AUTH',
  ]) {
    assert.ok(count(managed, `'${value}'`) >= 1, value)
  }
  assert.match(
    managed,
    /'apiKeyHelper',[\s\S]*?'awsAuthRefresh',[\s\S]*?'awsCredentialExport',[\s\S]*?'fileSuggestion',[\s\S]*?'gcpAuthRefresh',[\s\S]*?'otelHeadersHelper',[\s\S]*?'proxyAuthHelper',[\s\S]*?'statusLine'/,
  )
  for (const value of [
    'ANTHROPIC_CUSTOM_MODEL_OPTION_SUPPORTED_CAPABILITIES',
    'CLAUDE_CODE_USE_POWERSHELL_TOOL',
    'DISABLE_INSTALLATION_CHECKS',
    'VERTEX_REGION_CLAUDE_4_5_OPUS',
    'VERTEX_REGION_CLAUDE_4_6_OPUS',
    'VERTEX_REGION_CLAUDE_4_7_OPUS',
  ]) {
    assert.ok(managed.includes(`'${value}'`), value)
  }

  const spawn = fs.readFileSync(
    path.join(repo, 'src/utils/swarm/spawnUtils.ts'),
    'utf8',
  )
  assert.match(
    spawn,
    /'CLAUDE_CODE_USE_BEDROCK',[\s\S]*?'CLAUDE_CODE_USE_VERTEX',[\s\S]*?'CLAUDE_CODE_USE_FOUNDRY',[\s\S]*?'CLAUDE_CODE_USE_ANTHROPIC_AWS',[\s\S]*?'CLAUDE_CODE_USE_MANTLE',[\s\S]*?'ANTHROPIC_AWS_WORKSPACE_ID',[\s\S]*?'ANTHROPIC_AWS_BASE_URL',[\s\S]*?'ANTHROPIC_AWS_API_KEY',[\s\S]*?'CLAUDE_CODE_SKIP_ANTHROPIC_AWS_AUTH'/,
  )

  const status = fs.readFileSync(
    path.join(repo, 'src/utils/status.tsx'),
    'utf8',
  )
  assert.match(status, /anthropicAws: 'Claude Platform on AWS'/)
  assert.match(status, /process\.env\.ANTHROPIC_AWS_BASE_URL/)
  assert.match(status, /process\.env\.ANTHROPIC_AWS_WORKSPACE_ID/)
  assert.match(status, /value: 'Claude Platform on AWS auth skipped'/)
  assert.match(status, /process\.env\.ANTHROPIC_BEDROCK_BASE_URL/)
  assert.match(status, /process\.env\.ANTHROPIC_VERTEX_BASE_URL/)
})
