import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
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

const identity = [
  12067961,
  12068436,
  'a16f48005b781e00add016b78c1920089d82def4f6e0c4099a2b3e27f0199c2a',
]

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_104_BUNDLE and CLAUDE_CODE_2_1_105_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test('target105 pins the bridge client-platform transition', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
  )
  assert.equal(
    sha256(targetBytes),
    '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
  )

  const region = structural.regions[16955]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    identity,
  )
  const unit = targetBytes.toString('utf8').slice(identity[0], identity[1])
  assert.equal(sha256(unit), identity[2])
  assert.equal(
    parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
    1,
  )
  assert.ok(unit.includes('anthropic-client-platform":"claude_code_cli'))
})

test('client presence changes only the advertised platform at target105', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  assert.ok(baseline.includes('anthropic-client-platform":"cli'))
  assert.equal(
    baseline.includes('anthropic-client-platform":"claude_code_cli'),
    false,
  )
  assert.ok(target.includes('anthropic-client-platform":"claude_code_cli'))
  for (const fragment of [
    'tengu_bridge_client_presence_enabled',
    '[presence] terminal focus →',
    '[presence] pulse →',
    '/client/presence',
  ]) {
    assert.ok(baseline.includes(fragment), `${fragment}: baseline`)
    assert.ok(target.includes(fragment), `${fragment}: target`)
  }
  if (latestBundlePath) {
    const latest = fs.readFileSync(latestBundlePath, 'utf8')
    assert.ok(latest.includes('anthropic-client-platform":"claude_code_cli'))
  }
})

test('source advertises claude_code_cli on the reachable presence request', sourceOptions, () => {
  const presence = fs.readFileSync(
    path.join(sourceRoot, 'bridge/clientPresence.ts'),
    'utf8',
  )
  const bridge = fs.readFileSync(
    path.join(sourceRoot, 'bridge/initReplBridge.ts'),
    'utf8',
  )
  assert.ok(
    presence.includes("'anthropic-client-platform': 'claude_code_cli'"),
  )
  assert.equal(
    presence.includes("'anthropic-client-platform': 'cli'"),
    false,
  )
  assert.ok(presence.includes('void axios'))
  assert.ok(presence.includes('/client/presence'))
  assert.ok(bridge.includes('wireBridgeClientPresence('))
  assert.ok(bridge.includes('return wrapBridgeClientPresence(handle)'))
})
