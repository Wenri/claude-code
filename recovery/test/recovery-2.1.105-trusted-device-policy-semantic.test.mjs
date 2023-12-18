import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
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

const units = new Map([
  [9394, [7207325, 7207360, 'a3af204c84d99ac420d2d12d395d8822e7b1a2e0062b1c19474e5373645fce6b']],
  [9395, [7207360, 7207433, '2ff7355f555ece96b4b3ad57df37f76c90c2ea8e38d3a1e3b248953f0e2072a6']],
  [9399, [7207652, 7209339, '24a74609231a026493c9cccd3fc2fd8ac5b1d520371da85145ad0db5f1fa3f97']],
  [9400, [7209339, 7209424, 'a7ffbc29fcb34f74250b35e8ea9311aea9b31413175857f556f06eda7a01b5b5']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function functionSource(contents, name, prefix = 'function') {
  const start = contents.indexOf(`${prefix} ${name}`)
  assert.notEqual(start, -1, `${name}: declaration`)
  const body = contents.indexOf('{', start)
  let depth = 0
  for (let index = body; index < contents.length; index++) {
    if (contents[index] === '{') depth++
    else if (contents[index] === '}' && --depth === 0) {
      return contents.slice(start, index + 1)
    }
  }
  throw new Error(`${name}: unterminated`)
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

test(
  'target105 pins policy-limited trusted-device enrollment',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.104 and 2.1.105 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
    )
    assert.equal(
      sha256(targetBytes),
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    assert.equal(baseline.includes('require_trusted_devices'), false)
    assert.equal(target.includes('require_trusted_devices'), true)
    assert.equal(baseline.includes('Org has not enabled'), false)
    assert.equal(target.includes('Org has not enabled'), true)

    for (const [index, identity] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        identity,
        `${index}: identity`,
      )
      assert.equal(
        sha256(target.slice(identity[0], identity[1])),
        identity[2],
        `${index}: target bytes`,
      )
    }
    const gate = target.slice(7207325, 7207433)
    assert.match(gate, /isPolicyAllowed/)
    const enrollment = target.slice(7207652, 7209339)
    assert.ok(enrollment.includes('waitForPolicyLimitsToLoad'))
    assert.ok(enrollment.includes('Org has not enabled'))
    assert.ok(enrollment.includes('No OAuth token, skipping enrollment'))
    assert.ok(
      enrollment.indexOf('waitForPolicyLimitsToLoad') <
        enrollment.indexOf('No OAuth token, skipping enrollment'),
    )
  },
)

test(
  'authored enrollment fails closed on org policy before loading credentials',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const owner = source('bridge/trustedDevice.ts')
    const gateName = owner.includes('export function isTrustedDeviceGateEnabled')
      ? 'isTrustedDeviceGateEnabled'
      : 'isGateEnabled'
    for (const fragment of [
      "const REQUIRE_TRUSTED_DEVICES_POLICY = 'require_trusted_devices'",
      "require('../services/policyLimits/index.js')",
      '.isPolicyAllowed(REQUIRE_TRUSTED_DEVICES_POLICY)',
      'await policyLimits.waitForPolicyLimitsToLoad()',
      'Org has not enabled ${REQUIRE_TRUSTED_DEVICES_POLICY}, skipping enrollment',
    ]) {
      assert.ok(owner.includes(fragment), fragment)
    }
    const enroll = functionSource(
      owner,
      'enrollTrustedDevice',
      'export async function',
    )
    assert.ok(
      enroll.indexOf('waitForPolicyLimitsToLoad') <
        enroll.indexOf('getClaudeAIOAuthTokens'),
    )
    if (sourceRoot === path.resolve(repositoryRoot, 'src')) {
      const clear = functionSource(
        owner,
        'clearTrustedDeviceToken',
        'export function',
      )
      assert.equal(clear.includes('isTrustedDeviceGateEnabled'), false)
    }

    const gate = functionSource(
      owner,
      gateName,
      gateName === 'isTrustedDeviceGateEnabled'
        ? 'export function'
        : 'function',
    )
    const helper = functionSource(owner, 'getPolicyLimits')
    const harness = `
      const __harness = {
        gate: false,
        policyAllowed: false,
        policyRequires: [] as string[],
        waits: 0,
        logs: [] as string[],
        authRequires: 0,
      };
      const TRUSTED_DEVICE_GATE = 'tengu_sessions_elevated_auth_enforcement';
      const REQUIRE_TRUSTED_DEVICES_POLICY = 'require_trusted_devices';
      const process = { env: {} as Record<string, string | undefined>, platform: 'linux' };
      const getFeatureValue_CACHED_MAY_BE_STALE = (_key: string, _fallback: boolean) => __harness.gate;
      const checkGate_CACHED_OR_BLOCKING = async (_key: string) => __harness.gate;
      const logForDebugging = (message: string) => { __harness.logs.push(message) };
    `
    const ts = await loadTypeScript()
    const javascript = ts.transpileModule(
      `${harness}\n${helper}\n${gate}\n${enroll}\n` +
        `export { __harness, ${gateName}, enrollTrustedDevice };`,
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText
    const module = { exports: {} }
    const policyLimits = {
      waitForPolicyLimitsToLoad: async () => {
        module.exports.__harness.waits++
      },
      isPolicyAllowed: policy => {
        module.exports.__harness.policyRequires.push(policy)
        return module.exports.__harness.policyAllowed
      },
    }
    const localRequire = specifier => {
      if (specifier === '../services/policyLimits/index.js') return policyLimits
      if (specifier === '../utils/auth.js') {
        module.exports.__harness.authRequires++
        throw new Error('auth must not load while policy denies')
      }
      throw new Error(`unexpected require: ${specifier}`)
    }
    new Function('exports', 'module', 'require', javascript)(
      module.exports,
      module,
      localRequire,
    )
    const api = module.exports

    assert.equal(api[gateName](), false)
    assert.deepEqual(api.__harness.policyRequires, [])
    api.__harness.gate = true
    assert.equal(api[gateName](), false)
    assert.deepEqual(api.__harness.policyRequires, ['require_trusted_devices'])

    api.__harness.logs.length = 0
    await api.enrollTrustedDevice()
    assert.equal(api.__harness.waits, 1)
    assert.equal(api.__harness.authRequires, 0)
    assert.ok(
      api.__harness.logs.includes(
        '[trusted-device] Org has not enabled require_trusted_devices, skipping enrollment',
      ),
    )
  },
)

test(
  'target116 retains the same policy gate and enrollment ordering',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !latestPath
        ? 'authenticated 2.1.116 structural bundle is required'
        : false,
  },
  () => {
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const latest = latestBytes.toString('utf8')
    assert.equal((latest.match(/require_trusted_devices/g) ?? []).length, 1)
    assert.equal((latest.match(/Org has not enabled/g) ?? []).length, 1)
    const at = latest.indexOf('Org has not enabled')
    const enrollment = latest.slice(at - 650, at + 400)
    assert.ok(enrollment.includes('waitForPolicyLimitsToLoad'))
    assert.ok(enrollment.includes('isPolicyAllowed'))
    assert.ok(
      enrollment.indexOf('waitForPolicyLimitsToLoad') <
        enrollment.indexOf('Org has not enabled'),
    )
  },
)
