import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.92-to-2.1.94'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const historical = semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_94_BUNDLE
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
  [2619, [1072403, 1073066, '8edd90c6e52ceef1786c05b1c5259bc11683f42a69aa0da7728c7418a600a002']],
  [4507, [3436944, 3440651, '2b515664a822ad3ae62c7235aae015b39545e20db02c7d470c46871a5b4998a2']],
  [4588, [3475143, 3475186, '6caca09d775a0216c7ad31b978c8ee9a221e47c035be05755da2bd6c9d20b076']],
  [4955, [3697390, 3697596, '9402a9766bbdc81d36e4f3d34a33900f4c8abc63aa700c755c79f6e232c5344b']],
  [4989, [3702983, 3703284, 'bbe59b2adbde3bc81bf7331b1f7277a5693eca306e69e25e3663cf477944f4b7']],
  [8575, [6817126, 6817250, '4d1ad5bf7b41aa8936f0838533dd963feaa554177dc45cc902bab160dc5d4938']],
  [8580, [6817656, 6817813, '2e7c3c10ee7721c1e7750ff841bd4832d27e3f6e870a7a282f7c12fb4649b210']],
  [10517, [8398521, 8399075, '302e3058d7dc7b4ba3bc115e67d1dbb5784bbff8aeb29f6f0e527add02ab9016']],
  [12107, [9389402, 9389638, 'b441a2f43f1593b14fb7b1f9a0183c0722637fe82372a2805298162bf5810223']],
  [16047, [11596577, 11597996, '60c5bbbd777bc9c08707e1fa514826ef4f132e4dfcce71db6eecc868ed503515']],
  [16076, [11615970, 11628332, '6062af7b04cfdf2e12079a20d60f8a7f3340a93cda671781d6864a609cc1f049']],
  [16085, [11634113, 11634670, 'f10b09f947519db745c50260e34bcad817f599d771114b96721eff45f3cfb31f']],
  [16439, [11839141, 11839451, 'a9dabde8ea151d4ce58d4949f65d96b1581b4d71e11a60dfee23b8a0fe5b4fc8']],
  [17914, [12528764, 12532085, 'c35c7ee0ace061cc04b8a0ced44e863f088512fab3e8de0e1004a395671c7086']],
  [17920, [12532855, 12533938, '4a3d3d73cac5801d022230d0984fd8363b2ae1e3fe97192de73eb9502f506be6']],
  [18034, [12635623, 12635669, '7fd534c512ddc57e2d521210896908235d643a27200624938ce1808f9cb270f4']],
])

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const targetOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_94_BUNDLE is required'
      : false,
}
const latestOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !latestBundlePath
      ? 'CLAUDE_CODE_2_1_116_BUNDLE is required'
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

function assertFragments(relative, fragments) {
  const contents = source(relative)
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${relative}: ${fragment}`)
  }
  return contents
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return
  visit(node)
  for (const [key, value] of Object.entries(node)) {
    if (key === 'start' || key === 'end' || key === 'loc') continue
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visit)
    } else if (value && typeof value === 'object') {
      walk(value, visit)
    }
  }
}

test('target94 pins all property/control audit units', targetOptions, () => {
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(targetBytes),
    '11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564',
  )
  const target = targetBytes.toString('utf8')
  for (const [index, identity] of targetUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
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

test('target94 hook-only deltas are proven semantic no-ops', targetOptions, () => {
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  const executeUnit = target.slice(...targetUnits.get(16076).slice(0, 2))
  const executeFunction = parse(executeUnit, {
    ecmaVersion: 'latest',
    sourceType: 'module',
  }).body[0]
  const extendedBinding = executeFunction.params[0].properties.find(
    property => property.key?.name === 'extendedHookInput',
  )
  assert.ok(extendedBinding, 'executeHooks destructures extendedHookInput')
  const localName = extendedBinding.value.name
  let bodyReferences = 0
  walk(executeFunction.body, node => {
    if (node.type === 'Identifier' && node.name === localName) bodyReferences++
  })
  assert.equal(bodyReferences, 0, 'destructured value is never observed')

  const stopUnit = target.slice(...targetUnits.get(16085).slice(0, 2))
  const stopFunction = parse(stopUnit, {
    ecmaVersion: 'latest',
    sourceType: 'module',
  }).body[0]
  let extendedProperty
  walk(stopFunction.body, node => {
    if (
      node.type === 'Property' &&
      node.key?.name === 'extendedHookInput'
    ) {
      extendedProperty = node
    }
  })
  assert.ok(extendedProperty, 'Stop hook passes extendedHookInput')
  const stopLocal = extendedProperty.value.name
  let declaration
  let identifierCount = 0
  walk(stopFunction.body, node => {
    if (node.type === 'Identifier' && node.name === stopLocal) identifierCount++
    if (node.type === 'VariableDeclarator' && node.id?.name === stopLocal) {
      declaration = node
    }
  })
  assert.ok(declaration, 'Stop hook local is declared')
  assert.equal(declaration.init, null, 'Stop hook local is always undefined')
  assert.equal(identifierCount, 2, 'local appears only in declaration and pass-through')
})

test('source owns every reachable target94 behavior', sourceOptions, () => {
  assertFragments('src/utils/settings/settings.ts', [
    'export function getUseAutoModeDuringPlan()',
    'export function getAutoModeConfig()',
  ])
  assertFragments('src/services/api/client.ts', [
    'AnthropicBedrockMantle',
    'CLAUDE_CODE_SKIP_MANTLE_AUTH',
    'cachedCredentials',
  ])
  assertFragments('src/utils/sleep.ts', [
    'export function withTimeout<T>',
    'Promise.race',
  ])
  assertFragments('src/services/analytics/growthbook.ts', [
    'refreshFeatures({ skipCache: true })',
  ])
  assertFragments('src/utils/config.ts', [
    'if (isEnvTruthy(process.env.CLAUDE_CODE_SANDBOXED))',
    'return true',
  ])
  assertFragments('src/utils/subprocessEnv.ts', [
    "'ANTHROPIC_AWS_API_KEY'",
    'export function upstreamProxyEnv()',
    'const proxyEnv = upstreamProxyEnv()',
    'export function shouldUseMcpAllowlistEnv()',
    'if (isEnvDefinedFalsy(value)) return false',
    "process.env.CLAUDE_CODE_ENTRYPOINT === 'local-agent'",
  ])
  assertFragments('src/utils/telemetry/pluginTelemetry.ts', [
    'agent_path_count:',
    '(plugin.agentsPath ? 1 : 0) + (plugin.agentsPaths?.length ?? 0)',
    'has_mcp: plugin.mcpServers !== undefined',
    'has_lsp: plugin.lspServers !== undefined',
  ])
  assertFragments('src/services/teamMemorySync/watcher.ts', [
    "export const UNLINK_RECOVERABLE_REASONS = new Set(['http_413'])",
    'UNLINK_RECOVERABLE_REASONS.has(',
  ])
  assertFragments('src/utils/hooks.ts', [
    'export async function applyHookSessionTitle',
  ])
  assertFragments('src/utils/sessionState.ts', [
    "if (state === 'running')",
    historical
      ? 'metadataListener?.({ post_turn_summary: null })'
      : 'this.onMetadataChanged?.({ post_turn_summary: null })',
  ])
  assertFragments('src/components/TeamOnboardingDiscoveryStep.tsx', [
    'export function TeamOnboardingDiscoveryStep',
  ])
  assertFragments('src/interactiveHelpers.tsx', [
    "'./components/TeamOnboardingDiscoveryStep.js'",
    '<TeamOnboardingDiscoveryStep onDone={done} />',
  ])

  const hooks = source('src/utils/hooks.ts')
  assert.equal(
    hooks.includes('extendedHookInput'),
    false,
    'the semantically inert generated hook property is intentionally omitted',
  )

  if (historical) {
    assertFragments('src/utils/cronScheduler.ts', [
      'autonomousLoopDefault: false',
    ])
    assertFragments('src/hooks/useScheduledTasks.ts', [
      "feature('PROACTIVE') || feature('KAIROS')",
      "task.prompt.startsWith('<tick>')",
      'proactiveModule.recordTickFired()',
    ])
  } else {
    assertFragments('src/utils/cronScheduler.ts', [
      'autonomousLoopDefault: isLoopDefaultSentinel(t.prompt)',
    ])
    assert.equal(
      source('src/hooks/useScheduledTasks.ts').includes('recordTickFired'),
      false,
      'target116 removed the old proactive tick accounting call',
    )
  }
})

test('target116 retains the recovered live behaviors and removes old tick accounting', latestOptions, () => {
  const latestBytes = fs.readFileSync(latestBundlePath)
  assert.equal(
    sha256(latestBytes),
    'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
  )
  const latest = latestBytes.toString('utf8')
  for (const fragment of [
    'refreshFeatures({skipCache:!0})',
    'CLAUDE_CODE_SANDBOXED',
    'upstreamProxyEnv',
    'shouldUseMcpAllowlistEnv',
    'agent_path_count',
    'has_lsp',
    'post_turn_summary:null',
    'autonomousLoopDefault',
  ]) {
    assert.ok(latest.includes(fragment), fragment)
  }
  assert.equal(latest.includes('recordTickFired'), false)
})
