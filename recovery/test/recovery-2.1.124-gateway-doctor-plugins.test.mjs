import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = [
  {
    version: '2.1.123',
    env: 'CLAUDE_CODE_2_1_123_BUNDLE',
    bytes: 13_949_576,
    sha256:
      '59c8eebc0660d4bbc5c1f82af0ca5e94df5db46084687b979ad21a07fba3d7dd',
  },
  {
    version: '2.1.124',
    env: 'CLAUDE_CODE_2_1_124_BUNDLE',
    bytes: 13_980_928,
    sha256:
      'dc2b68c385a3064737343e51e6d7c690f9e03cc40fa89c4393708ae03094d590',
  },
]

function readBundle(release) {
  const filename = process.env[release.env]
  assert.ok(filename, `${release.env} must be set`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    sha256(value),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return value
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  let count = 0
  let offset = 0
  while ((offset = contents.indexOf(fragment, offset)) !== -1) {
    count += 1
    offset += fragment.length
  }
  return count
}

function source(relative) {
  return fs
    .readFileSync(path.join(repo, relative), 'utf8')
    .split('\n//# sourceMappingURL=', 1)[0]
}

function compact(value) {
  return value.replaceAll(';', '').replaceAll(/\s+/g, ' ').trim()
}

function assertSourceFragments(relative, fragments) {
  const contents = compact(source(relative))
  for (const fragment of fragments) {
    assert.ok(
      contents.includes(compact(fragment)),
      `${relative}: missing ${compact(fragment)}`,
    )
  }
}

test('authenticates the 2.1.124 gateway, Doctor, and plugin clusters', () => {
  const [baselineBytes, targetBytes] = releases.map(readBundle)
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  const targetStatements = [
    [9_792_726, 117, '65c89c10685bbe18e34ca3b266264bea1af66e1c3af0d6f393078ead70eca0c4'],
    [9_792_843, 45, '0eff10f12d2f03f173a0c69b8531815d69b63897ffea4da8b652ef33c4f61b91'],
    [9_792_888, 60, 'fb55952e068831c7d35236d47da56ad8c8e298ff3a551cc781fa2840b6ee4cc7'],
    [9_792_948, 205, 'bfcba96a0923c992fb7bfcf53a76370d74e37beab695362a22e09a63d544f426'],
    [9_793_153, 1_336, 'ed582c0987ccfb56636ccb3da0da956ea4d60a27a01c13e110c7f24737a188f0'],
    [9_794_489, 37, 'ae8ae29e7a7a0b54aff85c2caa39d19b2b12e42b7e43dd249156e8faa8218c89'],
    [9_794_526, 440, 'a3cf7da88f8845d799412f64973e4ddf613248bf879d883642e3d3c2f029762f'],
    [9_801_059, 1_140, 'df6a36fc1fd5aaafd74606c50fe11b609e49caf1a533d6fdd8c48b79cbe38527'],
    [9_802_334, 264, 'b553f4819867838f97819237506b81f56cbecb5f3721c4bfd624856edbb4d60c'],
    [10_214_764, 143, '61a65a25098c88785f882183a5ea6d2b5ddd3e8640fa0fe28af76c445dfefbe3'],
    [10_214_907, 1_371, 'f542b93818c107f0071b187ad19677f8925921cd9ec616e7b2889e0f1b36075b'],
    [10_496_142, 29_987, '97cba04ddd7569c58d434db5a0dc770418558a4b13b51fa539b916d824aa62a5'],
  ]
  for (const [offset, bytes, expected] of targetStatements) {
    assert.equal(
      sha256(targetBytes.subarray(offset, offset + bytes)),
      expected,
    )
  }

  const targetOnlyFragments = [
    '"gateway-models.json"',
    'description:"From gateway"',
    '"[gatewayDiscovery] response body failed validation"',
    '"[gatewayDiscovery] 0 usable models after filter"',
    'for(let Y of Rl7())if(!$.some((f)=>f.value===Y.value))$.push(Y);',
    'function qt_(){return u6.isSupportedPlatform()&&u6.isSandboxEnabledInSettings()&&u6.isPlatformInEnabledList()?u6.checkDependencies().errors:[]}',
    'iH!=="uninstall"&&iH!=="update"&&r$',
  ]
  for (const fragment of targetOnlyFragments) {
    assert.equal(occurrences(baseline, fragment), 0, `baseline: ${fragment}`)
    assert.equal(occurrences(target, fragment), 1, `target: ${fragment}`)
  }
})

test('source recovers gateway discovery and duplicate-safe model merging', () => {
  assertSourceFragments('src/utils/model/gatewayModelDiscovery.ts', [
    "if (getAPIProvider() !== 'firstParty') return false",
    'if (isFirstPartyAnthropicBaseUrl()) return false',
    'if (!process.env.ANTHROPIC_BASE_URL) return false',
    "return join(getCacheDir(), 'gateway-models.json')",
    'cached.baseUrl !== process.env.ANTHROPIC_BASE_URL',
    "return cached.models.map(model => ({ value: model.id, label: model.display_name || model.id, description: 'From gateway', }))",
    'if (isEssentialTrafficOnly()) return',
    'const authToken = process.env.ANTHROPIC_AUTH_TOKEN const apiKey = getAnthropicApiKey() if (!authToken && !apiKey) return',
    "process.env.ANTHROPIC_CUSTOM_HEADERS ?? ''",
    "const separator = line.indexOf(':') if (separator <= 0) continue",
    "const url = `${baseUrl.replace(/\\/+$/, '')}/v1/models?limit=1000`",
    "redirect: 'error'",
    'signal: AbortSignal.timeout(GATEWAY_DISCOVERY_TIMEOUT_MS)',
    '...getProxyFetchOptions({ url })',
    '/^(claude|anthropic)/i.test(model.id)',
    'cached.baseUrl === baseUrl && isEqual(cached.models, models)',
    "{ encoding: 'utf-8', mode: 0o600 }",
    'loadCache.cache.delete(cachePath)',
  ])

  assertSourceFragments('src/utils/model/modelOptions.ts', [
    "import { getGatewayModelOptions } from './gatewayModelDiscovery.js'",
    'for (const opt of getGatewayModelOptions()) { if (!options.some(existing => existing.value === opt.value)) { options.push(opt) } }',
  ])

  const discovered = [
    { id: 'claude-gateway-a', display_name: 'Gateway A' },
    { id: 'Anthropic.Model.B', display_name: undefined },
    { id: 'other-model', display_name: 'Other' },
  ]
    .filter(model => /^(claude|anthropic)/i.test(model.id))
    .map(model => ({
      value: model.id,
      label: model.display_name || model.id,
      description: 'From gateway',
    }))
  assert.deepEqual(discovered, [
    {
      value: 'claude-gateway-a',
      label: 'Gateway A',
      description: 'From gateway',
    },
    {
      value: 'Anthropic.Model.B',
      label: 'Anthropic.Model.B',
      description: 'From gateway',
    },
  ])

  const options = [{ value: 'claude-gateway-a' }]
  for (const option of discovered) {
    if (!options.some(existing => existing.value === option.value)) {
      options.push(option)
    }
  }
  assert.deepEqual(options.map(option => option.value), [
    'claude-gateway-a',
    'Anthropic.Model.B',
  ])
})

test('Doctor warnings are injectable and plugin options only follow toggles', () => {
  assertSourceFragments('src/screens/Doctor.tsx', [
    'function getSandboxDependencyErrors(): string[]',
    'SandboxManager.isSupportedPlatform() && SandboxManager.isSandboxEnabledInSettings() && SandboxManager.isPlatformInEnabledList() ? SandboxManager.checkDependencies().errors : []',
    'keybindingWarnings: KeybindingWarning[] = getCachedKeybindingWarnings()',
    'sandboxErrors: string[] = getSandboxDependencyErrors()',
    'for (const warning of keybindingWarnings)',
    'for (const error of sandboxErrors)',
  ])
  assertSourceFragments('src/commands/plugin/ManagePlugins.tsx', [
    "if (operation !== 'uninstall' && operation !== 'update' && enabledAfter)",
  ])

  const shouldOpenOptions = (operation, enabledAfter) =>
    operation !== 'uninstall' && operation !== 'update' && enabledAfter
  assert.equal(shouldOpenOptions('enable', true), true)
  assert.equal(shouldOpenOptions('disable', true), true)
  assert.equal(shouldOpenOptions('uninstall', true), false)
  assert.equal(shouldOpenOptions('update', true), false)
  assert.equal(shouldOpenOptions('enable', false), false)
})
