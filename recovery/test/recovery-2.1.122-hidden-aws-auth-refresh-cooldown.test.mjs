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
    resetCount: 0,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    resetCount: 1,
  },
]

function bundle(release) {
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

test('authenticates the 2.1.122 AWS refresh cooldown reset surface', () => {
  for (const release of releases) {
    assert.equal(
      bundle(release).split('resetAwsAuthRefreshCooldown').length - 1,
      release.resetCount,
      release.version,
    )
  }
})

test('AWS refreshes share one request, cool down, and reset on settings changes', () => {
  const auth = fs
    .readFileSync(path.join(repo, 'src/utils/auth.ts'), 'utf8')
    .replaceAll(/\s+/g, ' ')
  for (const fragment of [
    'const AWS_AUTH_REFRESH_COOLDOWN_MS = 30 * 1000',
    'if (awsAuthRefreshInFlight) return awsAuthRefreshInFlight',
    'Date.now() - lastAwsAuthRefreshAt < AWS_AUTH_REFRESH_COOLDOWN_MS',
    'if (refreshEpoch === awsAuthRefreshEpoch)',
    'lastAwsAuthRefreshAt = Date.now()',
    'export function resetAwsAuthRefreshCooldown(): void',
    'lastAwsAuthRefreshAt = null awsAuthRefreshEpoch++',
  ]) {
    assert.ok(auth.includes(fragment.replaceAll(/\s+/g, ' ')), fragment)
  }

  const onChange = fs.readFileSync(
    path.join(repo, 'src/state/onChangeAppState.ts'),
    'utf8',
  )
  assert.match(
    onChange,
    /clearAwsCredentialsCache\(\)\s+resetAwsAuthRefreshCooldown\(\)\s+clearGcpCredentialsCache\(\)/,
  )
})
