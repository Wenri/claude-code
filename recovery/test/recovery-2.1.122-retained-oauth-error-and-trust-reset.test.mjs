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
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return bytes.toString('utf8')
}

function count(text, needle) {
  return text.split(needle).length - 1
}

function regexEscape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

test('authenticated adjacent bundles retain bounded OAuth error telemetry and trust reset export', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(count(bundle, 'extractOAuthErrorFields'), 1)
    assert.equal(count(bundle, 'oauth_error_status'), 1)
    assert.equal(count(bundle, 'oauth_error_type'), 1)
    assert.equal(count(bundle, 'resetTrustDialogAcceptedCache'), 1)
    assert.ok(bundle.includes('/^[a-z][a-z_]{0,39}$/'))

    const oauthExport = bundle.match(
      /extractOAuthErrorFields:\(\)=>([A-Za-z_$][\w$]*)/,
    )
    assert.ok(oauthExport, `${release.version}: OAuth helper export`)
    const oauthHelper = oauthExport[1]
    const failureEvent = bundle.indexOf('"tengu_oauth_token_refresh_failure"')
    assert.ok(failureEvent >= 0, `${release.version}: refresh failure event`)
    const failureContext = bundle.slice(failureEvent, failureEvent + 500)
    assert.match(
      failureContext,
      new RegExp(`\\.\\.\\.${regexEscape(oauthHelper)}\\(`),
    )
    assert.doesNotMatch(failureContext, /responseBody/)

    const resetExport = bundle.match(
      /resetTrustDialogAcceptedCache:\(\)=>([A-Za-z_$][\w$]*)/,
    )
    assert.ok(resetExport, `${release.version}: trust reset export`)
    const resetHelper = resetExport[1]
    assert.equal(
      count(bundle, resetHelper),
      3,
      `${release.version}: export, definition, and live caller`,
    )
  }
})

test('source restores bounded OAuth telemetry and the exact live trust reset surface', () => {
  const oauth = fs.readFileSync(
    path.join(repo, 'src/services/oauth/client.ts'),
    'utf8',
  )
  assert.match(oauth, /export function extractOAuthErrorFields\(/)
  assert.match(oauth, /OAUTH_ERROR_TYPE_PATTERN = \/\^\[a-z\]\[a-z_\]\{0,39\}\$\//)
  assert.match(oauth, /oauth_error_status: String\(status\)/)
  assert.match(oauth, /oauth_error_type:\s*sanitizedType/)
  assert.match(
    oauth,
    /logEvent\('tengu_oauth_token_refresh_failure',[\s\S]*?\.\.\.extractOAuthErrorFields\(error\)/,
  )
  assert.doesNotMatch(oauth, /responseBody/)

  const config = fs.readFileSync(path.join(repo, 'src/utils/config.ts'), 'utf8')
  assert.match(config, /export function resetTrustDialogAcceptedCache\(\)/)
  assert.match(
    config,
    /export function resetTrustDialogAcceptedCacheForTesting\(\)[\s\S]*?resetTrustDialogAcceptedCache\(\)/,
  )

  const main = fs.readFileSync(path.join(repo, 'src/main.tsx'), 'utf8')
  assert.match(main, /resetTrustDialogAcceptedCache\(\)/)
  assert.doesNotMatch(main, /resetTrustDialogAcceptedCacheForTesting/)
})
