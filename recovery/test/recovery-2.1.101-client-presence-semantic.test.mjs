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
  [
    16818,
    [
      12008902,
      12009225,
      'a1f8725047c3173c452005092f1909f4bb052430f1d4e2962aa8f25c1f2f493d',
      'unresolved',
    ],
  ],
  [
    16819,
    [
      12009225,
      12009292,
      '96587129372e054bb97b89f0375285d75eff8a102c9a7d5c44b6217df5c5e8b1',
      'unresolved',
    ],
  ],
  [
    16820,
    [
      12009292,
      12009755,
      '13530cd76a6b48a863dee68dbbb44fdd4798a8e110c29f3b5186aa04c536926e',
      'matched',
    ],
  ],
  [
    16821,
    [
      12009755,
      12009814,
      '25721148bd040d09d9e589743a1396c7111b84d7aceeeb46547dd74d1adfecbf',
      'unresolved',
    ],
  ],
  [
    16882,
    [
      12053291,
      12056598,
      'a0f1c2fb93188a5efba5cb6d67c3fdcfe60c2e6150bf6cffdaaeb4064eac72b0',
      'matched',
    ],
  ],
  [
    16883,
    [
      12056598,
      12056710,
      'f0a882e2997d968ea57aea2526ef610bd21fed57844a22d07453bff894208158',
      'matched',
    ],
  ],
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

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function assertFragments(contents, fragments, label) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${label}: ${fragment}`)
  }
}

test('target101 pins presence wiring, cleanup, pulse, state, and reachability', pairOptions, () => {
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
    assert.equal(region.classification, identity[3], `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity.slice(0, 3),
      `${index}: structural identity`,
    )
    const unit = target.slice(identity[0], identity[1])
    assert.equal(sha256(unit), identity[2], `${index}: target bytes`)
    assert.equal(
      parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
      1,
      `${index}: one top-level statement`,
    )
  }
})

test('target101 adds focused-terminal pulses to the inherited presence path', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  assert.equal(baseline.includes('[presence] terminal focus →'), false)
  assert.equal(target.includes('[presence] terminal focus →'), true)
  for (const fragment of [
    'tengu_bridge_client_presence_enabled',
    '[presence] pulse →',
    '/v1/code/sessions/',
    '/client/presence',
    'anthropic-client-platform":"cli',
  ]) {
    assert.equal(baseline.includes(fragment), true, `${fragment}: baseline`)
    assert.equal(target.includes(fragment), true, `${fragment}: target`)
  }
  assert.ok(target.includes('z===!0)H65()'))
})

test('source owns presence subscriptions, throttled pulse, and teardown', sourceOptions, () => {
  const presence = source('src/bridge/clientPresence.ts')
  assertFragments(
    presence,
    [
      "'tengu_bridge_client_presence_enabled'",
      'unsubscribeInteraction = onUserInteraction(pulseBridgeClientPresence)',
      'unsubscribeFocus = subscribeTerminalFocus(() => {',
      'const focusState = getTerminalFocusState()',
      '[presence] terminal focus → ${focusState}',
      "if (focusState === 'focused') pulseBridgeClientPresence()",
      'unsubscribeInteraction?.()',
      'unsubscribeFocus?.()',
      'if (now - lastPulseAt < PULSE_INTERVAL_MS) return',
      'connectedAt ??= new Date(now).toISOString()',
      '/v1/code/sessions/${session.sessionId}/client/presence',
      "'anthropic-version': '2023-06-01'",
      'timeout: PULSE_INTERVAL_MS',
      'validateStatus: () => true',
      'if (response.status >= 400)',
    ],
    'src/bridge/clientPresence.ts',
  )

  const bridge = source('src/bridge/initReplBridge.ts')
  assertFragments(
    bridge,
    [
      'onSessionEstablished: sessionId => {',
      'wireBridgeClientPresence(',
      'toInfraSessionId(sessionId)',
      'return wrapBridgeClientPresence(handle)',
      'function wrapBridgeClientPresence(',
      'cleanupBridgeClientPresence()',
      'const teardown = handle.teardown.bind(handle)',
      'handle.teardown = async () => {',
      'await teardown()',
    ],
    'src/bridge/initReplBridge.ts',
  )
  assert.ok(
    bridge.indexOf('cleanupBridgeClientPresence()') <
      bridge.indexOf('await teardown()'),
  )

  if (isCurrentSource) {
    assert.ok(presence.includes("import { randomUUID } from 'crypto'"))
    assert.ok(presence.includes('const clientId = randomUUID()'))
    assert.ok(
      presence.includes("'anthropic-client-platform': 'claude_code_cli'"),
    )
    assert.ok(bridge.includes('getSessionIngressAuthHeaders'))
  } else {
    assert.ok(presence.includes('getOrCreateUserID'))
    assert.ok(presence.includes('const clientId = getOrCreateUserID()'))
    assert.ok(presence.includes("'anthropic-client-platform': 'cli'"))
    assert.ok(
      bridge.includes(
        'return token ? { Authorization: `Bearer ${token}` } : {}',
      ),
    )
  }
})
