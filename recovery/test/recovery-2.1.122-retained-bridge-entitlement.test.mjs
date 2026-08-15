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

test('authenticated adjacent bundles retain bridge environment and entitlement exports', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const name of [
      'isRunningInRemoteEnvironment',
      'isPersistentRemoteSessionEnabled',
      'hasBridgeEntitlement',
    ]) {
      assert.equal(
        bundle.split(name).length - 1,
        1,
        `${release.version}: ${name} export cardinality`,
      )
    }
    assert.match(
      bundle,
      /function [\w$]+\(\)\{return [\w$]+\(process\.env\.CLAUDE_CODE_REMOTE\)\|\|[\w$]+\(\)\}/,
      `${release.version}: remote environment predicate`,
    )
    assert.match(
      bundle,
      /function [\w$]+\(\)\{return![\w$]+\(\)&&[\w$]+\(\)\}/,
      `${release.version}: bridge gate rejects remote workspaces`,
    )
    assert.match(
      bundle,
      /function [\w$]+\(\)\{return!1\}/,
      `${release.version}: persistent remote sessions disabled`,
    )
  }
})

test('source exposes and uses the retained bridge predicates', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/bridge/bridgeEnabled.ts'),
    'utf8',
  )
  assert.match(source, /export function isRunningInRemoteEnvironment\(\)/)
  assert.match(source, /export function isPersistentRemoteSessionEnabled\(\)/)
  assert.match(source, /export function hasBridgeEntitlement\(\)/)
  assert.match(
    source,
    /return !isRunningInRemoteEnvironment\(\) && hasBridgeEntitlement\(\)/,
  )
  assert.match(
    source,
    /isBridgeEnabledBlocking[\s\S]*?\? !isRunningInRemoteEnvironment\(\) &&[\s\S]*?checkGate_CACHED_OR_BLOCKING/,
  )
  assert.match(
    source,
    /getCcrAutoConnectDefault[\s\S]*?if \(isRunningInRemoteEnvironment\(\)\) return false[\s\S]*?if \(isPersistentRemoteSessionEnabled\(\)\) return true/,
  )
})
