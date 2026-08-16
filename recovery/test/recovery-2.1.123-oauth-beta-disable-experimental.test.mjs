import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = [
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
  {
    version: '2.1.123',
    env: 'CLAUDE_CODE_2_1_123_BUNDLE',
    bytes: 13_949_576,
    sha256:
      '59c8eebc0660d4bbc5c1f82af0ca5e94df5db46084687b979ad21a07fba3d7dd',
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

function compact(value) {
  return value.replaceAll(/\s+/g, ' ').trim()
}

function escapeRegExp(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function assertSlice(bundle, start, end, expectedSha256, label) {
  const value = Buffer.from(bundle.slice(start, end))
  assert.equal(value.length, end - start, `${label}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(value).digest('hex'),
    expectedSha256,
    `${label}: SHA-256`,
  )
}

function providerOnlyHelper(bundle) {
  return bundle.match(
    /function (?<name>[A-Za-z_$][\w$]*)\(\)\{let (?<provider>[A-Za-z_$][\w$]*)=(?<getProvider>[A-Za-z_$][\w$]*)\(\);return \k<provider>==="firstParty"\|\|\k<provider>==="anthropicAws"\|\|\k<provider>==="foundry"\}/,
  )
}

test('authenticates the adjacent OAuth beta predicate split', () => {
  const baseline = readBundle(releases[0])
  const target = readBundle(releases[1])

  assertSlice(
    baseline,
    2_858_499,
    2_858_641,
    '427f9782618293253302a1f6ef03077d67b20f456505e8fe391b60cfb4145abb',
    '2.1.122 combined predicate',
  )
  assertSlice(
    target,
    2_858_499,
    2_858_668,
    'e7af2430bf610340151a8ef9706ee831bd3d0e168b1a5c2b6a0d07dbbf3b5c25',
    '2.1.123 split predicates',
  )
  assertSlice(
    target,
    2_859_146,
    2_859_213,
    'fe762ab7c6ec7e91341e58afb1daa3b5a3b842f2d0efdb1a1f2d01dff6876351',
    '2.1.123 provider filter',
  )
  assertSlice(
    target,
    2_859_406,
    2_859_444,
    '7e5200863422ed9f1268f2a25f25a220f31985534c717384d9d0a491722196e8',
    '2.1.123 OAuth condition',
  )

  assert.equal(
    providerOnlyHelper(baseline),
    null,
    '2.1.122 combines provider compatibility with the experimental kill switch',
  )

  const helper = providerOnlyHelper(target)
  assert.ok(helper, '2.1.123 defines a provider-only beta predicate')
  const helperName = helper.groups.name
  const escaped = escapeRegExp(helperName)

  assert.match(
    target,
    new RegExp(
      `function [A-Za-z_$][\\w$]*\\(\\)\\{return ${escaped}\\(\\)&&![A-Za-z_$][\\w$]*\\(process\\.env\\.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS\\)\\}`,
    ),
    '2.1.123 keeps the kill switch on experimental beta inclusion',
  )
  assert.match(
    target,
    new RegExp(
      `if\\([A-Za-z_$][\\w$]*\\(\\)\\|\\|${escaped}\\(\\)&&![A-Za-z_$][\\w$]*\\(\\)&&[A-Za-z_$][\\w$]*\\(\\)\\)`,
    ),
    '2.1.123 OAuth/WIF selection uses provider compatibility without the kill switch',
  )
  assert.match(
    target,
    new RegExp(
      `function [A-Za-z_$][\\w$]*\\(H\\)\\{if\\(${escaped}\\(\\)\\)return H;return H\\.filter\\(\\(\\$\\)=>[A-Za-z_$][\\w$]*\\.has\\(\\$\\)\\)\\}`,
    ),
    '2.1.123 final request filtering uses the provider-only predicate',
  )
})

test('provider and kill-switch truth table keeps OAuth independent', () => {
  const compatibleProviders = new Set([
    'firstParty',
    'anthropicAws',
    'foundry',
  ])
  const safeBetas = new Set(['claude-code', 'oauth'])
  const providerOnly = provider => compatibleProviders.has(provider)
  const experimental = (provider, disabled) =>
    providerOnly(provider) && !disabled
  const oauthEnabled = ({ provider, subscriber, apiKey, wif }) =>
    subscriber || (providerOnly(provider) && !apiKey && wif)
  const filter = (provider, betas) =>
    providerOnly(provider) ? betas : betas.filter(beta => safeBetas.has(beta))

  for (const provider of ['firstParty', 'anthropicAws', 'foundry']) {
    assert.equal(experimental(provider, true), false, provider)
    assert.equal(
      oauthEnabled({ provider, subscriber: false, apiKey: false, wif: true }),
      true,
      provider,
    )
    assert.deepEqual(
      filter(provider, ['oauth', 'experimental-only']),
      ['oauth', 'experimental-only'],
      provider,
    )
  }
  for (const provider of ['bedrock', 'vertex', 'mantle']) {
    assert.equal(
      oauthEnabled({ provider, subscriber: false, apiKey: false, wif: true }),
      false,
      provider,
    )
    assert.deepEqual(
      filter(provider, ['oauth', 'experimental-only']),
      ['oauth'],
      provider,
    )
  }
  assert.equal(
    oauthEnabled({
      provider: 'vertex',
      subscriber: true,
      apiKey: true,
      wif: false,
    }),
    true,
    'subscriber OAuth remains independent of provider and WIF',
  )
})

test('source preserves OAuth while disabling only experimental betas', () => {
  const source = compact(
    fs.readFileSync(path.join(repo, 'src/utils/betas.ts'), 'utf8'),
  )

  for (const fragment of [
    "function isFirstPartyBetaProvider(): boolean { const provider = getAPIProvider() return ( provider === 'firstParty' || provider === 'anthropicAws' || provider === 'foundry' ) }",
    'isFirstPartyBetaProvider() && !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS)',
    'isClaudeAISubscriber() || (isFirstPartyBetaProvider() && !getAnthropicApiKey() && shouldUseWIFAuth())',
    'export function filterBetasForProvider(betas: string[]): string[] { if (isFirstPartyBetaProvider()) return betas',
  ]) {
    assert.ok(source.includes(compact(fragment)), fragment)
  }

  assert.ok(
    source.includes(
      compact(
        'if (!shouldIncludeFirstPartyOnlyBetas()) { compatibleSdkBetas = sdkBetas.filter(beta => {',
      ),
    ),
    'SDK experimental betas remain gated by the kill switch',
  )
})
