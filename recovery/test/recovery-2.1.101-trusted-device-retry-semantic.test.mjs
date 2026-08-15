import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const isCurrentSource =
  path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
const latestBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
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

const targetUnits = new Map([
  [10239, [7571490, 7571699, '085167c1ac1d294e0066bee25911ea1d50f814ee370f3dae91e4719b2400ab4a', 'unresolved']],
  [16868, [12041595, 12041643, '76375c42f871b69d6e8d9bec149dd0465db4ca6994a51020525c48c22c65d3de', 'matched']],
  [16869, [12041643, 12041861, 'b235405f8c0df9c08402a0fb8b4864066f849385f5c39cc7ff9d40820c700e73', 'matched']],
  [16870, [12041861, 12042988, '0babf18786bfa5195fddeb74851289f92a51d43e4128f74bfa2939b12bf35991', 'matched']],
  [16876, [12052319, 12052627, 'f855782f1a65aa7ec09456a487894deca1df932febb9a09834bfcf0ede2c18ed', 'unresolved']],
])

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_100_BUNDLE and CLAUDE_CODE_2_1_101_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test('target101 pins inherited terminal parsing and fresh-token retry', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be',
  )
  assert.equal(
    sha256(targetBytes),
    'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
  )
  const target = targetBytes.toString('utf8')
  for (const [index, identity] of targetUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, identity[3], `${index}: class`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity.slice(0, 3),
      `${index}: identity`,
    )
    const unit = target.slice(identity[0], identity[1])
    assert.equal(sha256(unit), identity[2], `${index}: bytes`)
    assert.equal(
      parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
      1,
      `${index}: one top-level statement`,
    )
  }
})

test('fresh trusted-device retry enters at target101 and persists', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  const message =
    '[remote-bridge] Stale trusted-device token cache; retrying with fresh keychain read'
  assert.equal(baseline.includes(message), false)
  assert.equal(target.includes(message), true)
  const retry = target.slice(...targetUnits.get(16876).slice(0, 2))
  assert.ok(retry.includes(message))
  assert.ok(retry.includes('!=='))
  assert.ok(retry.includes('??'))
  if (latestBundlePath) {
    assert.equal(fs.readFileSync(latestBundlePath, 'utf8').includes(message), true)
  }
})

test('source retries once with a freshly-read token and preserves terminal status', sourceOptions, () => {
  const source = fs.readFileSync(
    path.join(sourceRoot, 'bridge/remoteBridgeCore.ts'),
    'utf8',
  )
  const trustedDevice = fs.readFileSync(
    path.join(sourceRoot, 'bridge/trustedDevice.ts'),
    'utf8',
  )
  assert.ok(
    trustedDevice.includes(
      'export { readStoredToken as readStoredTrustedDeviceToken }',
    ),
  )
  assert.ok(
    trustedDevice.includes(
      'export function isTrustedDeviceGateEnabled(): boolean',
    ),
  )
  for (const fragment of [
    'clearTrustedDeviceTokenCache,',
    'isTrustedDeviceGateEnabled,',
    'isRemoteCredentialsTerminal,',
    'type RemoteCredentialsResult,',
    'const trustedDeviceToken = getTrustedDeviceToken()',
    'isRemoteCredentialsTerminal(',
    'clearTrustedDeviceTokenCache()',
    'const freshTrustedDeviceToken = getTrustedDeviceToken()',
    'freshTrustedDeviceToken !== trustedDeviceToken',
    '[remote-bridge] Stale trusted-device token cache; retrying with fresh keychain read',
    'freshTrustedDeviceToken,',
    ')) ??',
  ]) {
    assert.ok(source.includes(fragment), fragment)
  }
  assert.ok(
    source.indexOf('clearTrustedDeviceTokenCache()') <
      source.indexOf('const freshTrustedDeviceToken = getTrustedDeviceToken()'),
  )
  if (isCurrentSource) {
    assert.ok(source.includes("creds.reason === 'untrusted_device'"))
    assert.ok(source.includes('return creds'))
  } else {
    assert.ok(
      source.includes(
        'return isTrustedDeviceGateEnabled() ? credentials : null',
      ),
    )
  }
})
