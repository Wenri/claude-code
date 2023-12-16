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
    envNames: ['CLAUDE_CODE_2_1_121_BUNDLE', 'CLAUDE_2_1_121_CLI_INNER'],
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  {
    version: '2.1.122',
    envNames: ['CLAUDE_CODE_2_1_122_BUNDLE', 'CLAUDE_2_1_122_CLI_INNER'],
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
]

function readBundle(release) {
  const filename = release.envNames.map(name => process.env[name]).find(Boolean)
  assert.ok(filename, `${release.envNames.join(' or ')} must be set`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(value).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return value.toString('utf8')
}

function compact(value) {
  return value.replaceAll(/\s+/g, '')
}

test('authenticates retained sandbox, fast-org, and Anthropic AWS controls', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.match(
      bundle,
      /function [\w$]+\(\)\{if\([\w$]+\(process\.env\.CLAUDE_CODE_SANDBOXED\)\)return!0;/,
      `${release.version}: sandbox trust short-circuit`,
    )
    assert.match(
      bundle,
      /function [\w$]+\(\)\{return [\w$]+\(process\.env\.CLAUDE_CODE_SKIP_FAST_MODE_ORG_CHECK\)\}/,
      `${release.version}: fast-mode org override`,
    )
    assert.match(
      bundle,
      /status==="disabled"&&!?[\w$]+\(\)/,
      `${release.version}: disabled status bypass`,
    )
    assert.match(
      bundle,
      /if\([\w$]+==="anthropicAws"\)\{let\{AnthropicAws:[\w$]+\}=await [^;]+,[\w$]+=[\w$]+\(process\.env\.CLAUDE_CODE_SKIP_ANTHROPIC_AWS_AUTH\)/,
      `${release.version}: Anthropic AWS client branch`,
    )
    assert.match(
      bundle,
      /if\(!process\.env\.ANTHROPIC_AWS_API_KEY&&!?[\w$]+\)\{let [\w$]+=await [\w$]+\(\);if\([\w$]+\)[\w$]+\.awsAccessKey=/,
      `${release.version}: Anthropic AWS credential fallback`,
    )
  }
})

test('source restores retained sandbox and fast-mode bypass ordering', () => {
  const config = compact(
    fs.readFileSync(path.join(repo, 'src/utils/config.ts'), 'utf8'),
  )
  const sandbox = config.indexOf(
    compact('isEnvTruthy(process.env.CLAUDE_CODE_SANDBOXED)'),
  )
  const session = config.indexOf(compact('getSessionTrustAccepted()'), sandbox)
  assert.ok(sandbox >= 0 && sandbox < session)

  const fastMode = compact(
    fs.readFileSync(path.join(repo, 'src/utils/fastMode.ts'), 'utf8'),
  )
  for (const fragment of [
    'function shouldSkipFastModeOrgCheck(): boolean',
    'orgStatus.status === \'disabled\' && !shouldSkipFastModeOrgCheck()',
    "if (shouldSkipFastModeOrgCheck()) { orgStatus = { status: 'enabled' } return }",
  ]) {
    assert.ok(fastMode.includes(compact(fragment)), fragment)
  }
  assert.equal(
    fastMode.split('shouldSkipFastModeOrgCheck()').length - 1,
    4,
    'definition and all three target call sites',
  )
})

test('source builds the Anthropic AWS client with exact auth precedence', () => {
  const client = compact(
    fs.readFileSync(path.join(repo, 'src/services/api/client.ts'), 'utf8'),
  )
  for (const fragment of [
    "if (apiProvider === 'anthropicAws')",
    "await import('@anthropic-ai/aws-sdk')",
    'process.env.CLAUDE_CODE_SKIP_ANTHROPIC_AWS_AUTH',
    'const anthropicAwsApiKey = skipAuth ? authorizationHeader : undefined',
    'skipAuth: true',
    'Authorization: anthropicAwsApiKey',
    'if (!process.env.ANTHROPIC_AWS_API_KEY && !skipAuth)',
    'anthropicAwsArgs.awsAccessKey = cachedCredentials.accessKeyId',
    'anthropicAwsArgs.awsSecretAccessKey = cachedCredentials.secretAccessKey',
    'anthropicAwsArgs.awsSessionToken = cachedCredentials.sessionToken',
    'return new AnthropicAws(anthropicAwsArgs)',
  ]) {
    assert.ok(client.includes(compact(fragment)), fragment)
  }
})
