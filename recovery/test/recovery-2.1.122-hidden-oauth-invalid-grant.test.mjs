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
    count: 0,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    count: 1,
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

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

function source(relativePath) {
  return compact(fs.readFileSync(path.join(repo, relativePath), 'utf8'))
}

test('authenticates both target-only invalid-grant clearing paths', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const event of [
      'tengu_oauth_refresh_token_cleared_invalid_grant',
      'tengu_wif_user_oauth_refresh_token_cleared',
    ]) {
      assert.equal(
        occurrences(bundle, event),
        release.count,
        `${release.version}: ${event}`,
      )
    }
  }
})

test('OAuth refresh clears only the concurrently rejected stored token', () => {
  const client = source('src/services/oauth/client.ts')
  for (const fragment of [
    'axios.isAxiosError(error)',
    'status !== 400 && status !== 401',
    "return type === 'invalid_grant'",
  ]) {
    assert.ok(client.includes(compact(fragment)), fragment)
  }

  const auth = source('src/utils/auth.ts')
  for (const fragment of [
    'oauthData.refreshToken !== refreshToken',
    "refreshToken: ''",
    "logEvent('tengu_oauth_refresh_token_cleared_invalid_grant', {})",
    'if (isInvalidGrantError(error) && currentTokens?.refreshToken)',
  ]) {
    assert.ok(auth.includes(compact(fragment)), fragment)
  }
})

test('WIF clears a matching rejected file token and preserves URL-aware proxying', () => {
  const sourceText = source('src/services/api/workloadIdentity.ts')
  for (const fragment of [
    "error.statusCode === 400 || error.statusCode === 401",
    "typeof error.body === 'string'",
    "error.body.includes('\"invalid_grant\"')",
    'current.refresh_token === refreshToken',
    'refresh_token: undefined',
    "logEvent('tengu_wif_user_oauth_refresh_token_cleared', {})",
    'clearRejectedUserOAuthRefreshToken( resolved.provider, credentialsPath, )',
    'getProxyFetchOptions({ forAnthropicAPI: true, url: String(url), })',
  ]) {
    assert.ok(sourceText.includes(compact(fragment)), fragment)
  }
})
