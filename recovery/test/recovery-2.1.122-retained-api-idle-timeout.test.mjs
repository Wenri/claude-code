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

function count(haystack, needle) {
  return haystack.split(needle).length - 1
}

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

test('authenticates retained Anthropic API idle-timeout behavior', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      count(bundle, 'API_FORCE_IDLE_TIMEOUT'),
      1,
      `${release.version}: environment control cardinality`,
    )
    assert.match(
      bundle,
      /forAnthropicAPI&&typeof Bun<"u"&&!\w+\(process\.env\.API_FORCE_IDLE_TIMEOUT\)&&\{timeout:!1\}/,
      `${release.version}: Bun Anthropic fetch disables the idle timeout by default`,
    )
  }
})

test('source reproduces scoped idle-timeout fetch options', () => {
  const source = fs.readFileSync(path.join(repo, 'src/utils/proxy.ts'), 'utf8')
  assert.equal(count(source, 'API_FORCE_IDLE_TIMEOUT'), 1)
  assert.match(source, /opts\?\.forAnthropicAPI\s*&&\s*typeof Bun !== 'undefined'/)
  assert.match(
    source,
    /!isEnvTruthy\(process\.env\.API_FORCE_IDLE_TIMEOUT\)\s*&&\s*\{\s*timeout: false as const/,
  )
  assert.match(source, /timeout\?: false/)

  const apiClient = fs.readFileSync(
    path.join(repo, 'src/services/api/client.ts'),
    'utf8',
  )
  assert.match(apiClient, /forAnthropicAPI: true/)

  const workloadIdentity = fs.readFileSync(
    path.join(repo, 'src/services/api/workloadIdentity.ts'),
    'utf8',
  )
  assert.match(workloadIdentity, /forAnthropicAPI: true/)
})
