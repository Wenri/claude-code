import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
      : false,
}

const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'
const targetUnits = [
  [10721, 6263139, 6263537, 'a4b712037e3291f217dc1753c209bf045b3bce40daa1b47273abd389b8d53393'],
  [10723, 6263592, 6263626, 'f04330d11c4975e433c72d1be75eea57cc65319f75568ea7626c50efc04b043a'],
  [10724, 6263626, 6263697, 'cd616cd7e4a3f4c13c8f07062204c873b66db3bfd329e2b0d2c8c0d787efcd52'],
  [10725, 6263697, 6264436, '3ac5e34edd45f0f534ccbd7df3be3f580629822513f9acbb19a7a7aa54950842'],
  [10730, 6264639, 6264702, 'f7f0192b3ddf13458ee85931b8f1e99500d36744100befe22ee2aad2f57c91f4'],
  [10733, 6265768, 6265828, 'd662b7a31b300d0a208af4a1c0350fa8d31e37ebccca645170a0330171a27a33'],
]
const baselineUnits = [
  [10619, 6230482, 6230735, '2a35ead91b4135b984b5e003a386a2a5fcce5d97415059a3d2aaedaa5c8b24d5'],
  [10621, 6230789, 6230853, 'fafec1c12795ce8f1c57e7ec23fb5c80d99157c1c885e14225ee48f3a0fa12c2'],
  [10622, 6230853, 6231518, 'dd230c69ece2797b0875c1d560380b8f7644f2c13901bfc5ce4adb59f6f1f0c5'],
  [10628, 6232621, 6232663, 'd78353d64e88fb9e15158ddc0b05def5dca4712459a78ea4e47b221db8329656'],
]
const typedRows = [
  ['isRunningInRemoteEnvironment', 'property', 6263147, 6263175, 10721],
  ['hasBridgeEntitlement', 'property', 6263332, 6263352, 10721],
  [
    'Remote Control is not available inside a remote session.',
    'string',
    6263733,
    6263791,
    10725,
  ],
]

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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

async function loadTypeScript() {
  const candidates = [
    path.resolve(
      path.dirname(process.execPath),
      '../lib/node_modules/typescript/lib/typescript.js',
    ),
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate, 'the pinned TypeScript compiler must be available')
  const module = await import(pathToFileURL(candidate).href)
  return module.default ?? module
}

async function instantiateBridge({
  remoteMode = false,
  subscriber = true,
  profileScope = true,
  organizationUuid = 'org',
  gate = true,
  persistent = false,
} = {}) {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(source('bridge/bridgeEnabled.ts'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const featureFlags = {
    BRIDGE_MODE: true,
    CCR_AUTO_CONNECT: persistent,
    CCR_MIRROR: false,
  }
  const requireStub = specifier => {
    if (specifier === 'bun:bundle') {
      return { feature: name => featureFlags[name] ?? false }
    }
    if (specifier.endsWith('/bootstrap/state.js')) {
      return { getIsRemoteMode: () => remoteMode }
    }
    if (specifier.endsWith('/services/analytics/growthbook.js')) {
      return {
        checkGate_CACHED_OR_BLOCKING: async () => gate,
        getDynamicConfig_CACHED_MAY_BE_STALE: (_name, fallback) => fallback,
        getFeatureValue_CACHED_MAY_BE_STALE: () => gate,
      }
    }
    if (specifier.endsWith('/utils/auth.js')) {
      return {
        isClaudeAISubscriber: () => subscriber,
        hasProfileScope: () => profileScope,
        getOauthAccountInfo: () =>
          organizationUuid === undefined ? undefined : { organizationUuid },
      }
    }
    if (specifier.endsWith('/utils/envUtils.js')) {
      return {
        isEnvTruthy: value =>
          value !== undefined &&
          !['', '0', 'false', 'no', 'off'].includes(value.toLowerCase()),
      }
    }
    if (specifier.endsWith('/utils/semver.js')) return { lt: () => false }
    throw new Error(`unexpected bridge import: ${specifier}`)
  }
  const module = { exports: {} }
  new Function('exports', 'module', 'require', javascript)(
    module.exports,
    module,
    requireStub,
  )
  return module.exports
}

test('authenticated target116 suppresses nested Remote Control sessions', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(sha256(baselineBytes), baselineSha256)
  assert.equal(sha256(targetBytes), targetSha256)
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  for (const [index, start, end, hash] of targetUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, hash],
    )
    assert.equal(sha256(target.slice(start, end)), hash)
  }
  for (const [index, start, end, hash] of baselineUnits) {
    const region = structural.unmatchedBaseline.find(
      candidate => candidate.index === index,
    )
    assert.ok(region)
    assert.deepEqual(
      [region.start, region.end, region.sourceHash],
      [start, end, hash],
    )
    assert.equal(sha256(baseline.slice(start, end)), hash)
  }
  for (const [value, kind, start, end, structuralIndex] of typedRows) {
    assert.equal(
      target.slice(start, end),
      kind === 'string' ? JSON.stringify(value) : value,
    )
    assert.equal(
      targetUnits.some(([index]) => index === structuralIndex),
      true,
    )
    assert.equal(baseline.includes(value), false)
  }

  const remoteHelper = target.slice(6264639, 6264702)
  assert.match(remoteHelper, /CLAUDE_CODE_REMOTE/)
  assert.match(remoteHelper, /\|\|/)
  assert.match(target.slice(6263592, 6263626), /^function .+\(\)\{return!.+&&.+\(\)\}$/)
  assert.match(target.slice(6263626, 6263697), /^async function .+\(\)\{return!.+&&.+&&await /)
  assert.match(target.slice(6265768, 6265828), /if\(.+\)return!1/)
})

test('source owns the complete remote-environment suppression graph', sourceOptions, () => {
  const owner = source('bridge/bridgeEnabled.ts')
  assert.match(owner, /export function isRunningInRemoteEnvironment/)
  assert.match(owner, /isEnvTruthy\(process\.env\.CLAUDE_CODE_REMOTE\)/)
  assert.match(owner, /\|\| getIsRemoteMode\(\)/)
  assert.match(owner, /export function hasBridgeEntitlement/)
  assert.match(owner, /!isRunningInRemoteEnvironment\(\) && hasBridgeEntitlement\(\)/)
  assert.match(
    owner,
    /!isRunningInRemoteEnvironment\(\) &&\s*isClaudeAISubscriber\(\) &&\s*\(await checkGate_CACHED_OR_BLOCKING/,
  )
  assert.match(
    owner,
    /if \(isRunningInRemoteEnvironment\(\)\) \{\s*return 'Remote Control is not available inside a remote session\.'/,
  )
  assert.match(
    owner,
    /getCcrAutoConnectDefault[\s\S]*if \(isRunningInRemoteEnvironment\(\)\) return false/,
  )
})

test('actual bridge gates fail closed for env and in-memory remote modes', sourceOptions, async () => {
  const oldRemote = process.env.CLAUDE_CODE_REMOTE
  try {
    delete process.env.CLAUDE_CODE_REMOTE
    let bridge = await instantiateBridge()
    assert.equal(bridge.isRunningInRemoteEnvironment(), false)
    assert.equal(bridge.hasBridgeEntitlement(), true)
    assert.equal(bridge.isBridgeEnabled(), true)
    assert.equal(await bridge.isBridgeEnabledBlocking(), true)
    assert.equal(await bridge.getBridgeDisabledReason(), null)

    process.env.CLAUDE_CODE_REMOTE = '1'
    assert.equal(bridge.isRunningInRemoteEnvironment(), true)
    assert.equal(bridge.hasBridgeEntitlement(), true)
    assert.equal(bridge.isBridgeEnabled(), false)
    assert.equal(await bridge.isBridgeEnabledBlocking(), false)
    assert.equal(
      await bridge.getBridgeDisabledReason(),
      'Remote Control is not available inside a remote session.',
    )
    assert.equal(bridge.getCcrAutoConnectDefault(), false)

    delete process.env.CLAUDE_CODE_REMOTE
    bridge = await instantiateBridge({ remoteMode: true, persistent: true })
    assert.equal(bridge.isRunningInRemoteEnvironment(), true)
    assert.equal(bridge.isBridgeEnabled(), false)
    assert.equal(bridge.getCcrAutoConnectDefault(), false)

    bridge = await instantiateBridge({ persistent: true })
    assert.equal(bridge.getCcrAutoConnectDefault(), true)
    bridge = await instantiateBridge({ subscriber: false })
    assert.equal(bridge.hasBridgeEntitlement(), false)
    assert.equal(bridge.isBridgeEnabled(), false)
  } finally {
    if (oldRemote === undefined) delete process.env.CLAUDE_CODE_REMOTE
    else process.env.CLAUDE_CODE_REMOTE = oldRemote
  }
})
