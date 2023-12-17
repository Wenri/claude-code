import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.97-to-2.1.98'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_98_BUNDLE
const latestBundlePath = process.env.CLAUDE_CODE_2_1_116_PUBLISHED_BUNDLE
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

const units = [
  [18213, 12695269, 12695316, '78520e42cb1c7f5872a988bdac2371d1152cb3a8d7517257eaa8b13f04210792'],
  [18214, 12695316, 12696978, '0f1da8915f88ee5390217d07e7bc9cd28b8a34820fcdeee1b1d8dd6d0947ad3f'],
  [18218, 12697047, 12697182, '7066a3cb89d4607746bf5ac629b5dcf376b39150e96b60fe32bebbc07616f993'],
  [18219, 12697182, 12697322, '5a9a2097a4ee7a8f65521a0bf105d042a66d5d738e7f8d643380ef5c0286f60f'],
  [18220, 12697322, 12697411, '2bf1d3f0e6d5d457c8009a09a80be6f302f683c66e6e202ae14632e41df9cb2f'],
  [18221, 12697411, 12697462, 'b4b6cdc94badfdc39dbf04aaa0f5675d10300176df267c4aeb97b8b90cb19d6b'],
  [18222, 12697462, 12698506, '8945bb4f8031e6588cecb2b3eb0ac84946687edbb2085f3665493e270ecaa0d6'],
  [18223, 12698506, 12699562, '72e9198a42422e55ebbd6d5ffb04d61eeb7849457dbc882957c8367bb8d546cb'],
  [18224, 12699562, 12699668, '36f7b0aed9dbf0c5cbfb29fb15115e66fa49a943adedafd8b101b865bc07298a'],
  [18225, 12699668, 12700491, '0e335f6fade395394ea875988c58eb39ca02e347210bfa9ad823f4e45833bb71'],
  [18227, 12700503, 12700830, '050b54512570f75c0421021758c4cbfe520372a3df22b2d8ec2417b82d8004a0'],
  [18235, 12701885, 12704847, '1649aea2266ac089cdadceba0e85258decf6402067096021f2cbcf3acd9be960'],
  [18236, 12704847, 12705060, '3fb15d74672880bbc62d5f253ef249f283d230dec14d83920cc790a07305afab'],
  [18240, 12707622, 12709094, 'dc818dbec82e434c2573a574130ca02ffa935030ea41546ee7a61111008bc4e5'],
  [18241, 12709094, 12709834, 'ebeba6879ce121f3ac1a8597fe94dd4f3147be7a4c1943e26aaef436cea283ac'],
]

const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_97_BUNDLE and CLAUDE_CODE_2_1_98_BUNDLE are required'
      : false,
}
const latestOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !latestBundlePath
      ? 'CLAUDE_CODE_2_1_116_PUBLISHED_BUNDLE is not set'
      : false,
}
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function assertOrdered(contents, fragments, label) {
  let previous = -1
  for (const fragment of fragments) {
    const index = contents.indexOf(fragment, previous + 1)
    assert.notEqual(index, -1, `${label}: ${fragment}`)
    assert.ok(index > previous, `${label}: ordering ${fragment}`)
    previous = index
  }
}

test('target98 pins every Vertex upgrade, fallback, probe, UI, and call-site unit', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath)
  const target = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baseline),
    '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988',
  )
  assert.equal(
    sha256(target),
    '27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556',
  )
  const targetText = target.toString('utf8')
  for (const [index, start, end, sourceHash] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: class`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: identity`,
    )
    assert.equal(
      sha256(targetText.slice(start, end)),
      sourceHash,
      `${index}: fragment hash`,
    )
  }
})

test('Vertex model discovery is introduced at 97-to-98 with all observable branches', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  for (const fragment of [
    'tengu_vertex_upgrade_check',
    'tengu_vertex_default_check',
    'tengu_vertex_upgrade_accepted',
    'tengu_vertex_upgrade_declined',
    'tengu_vertex_default_fallback',
    'vertexDeclinedUpgrades',
    '[vertex-upgrade] tiersWithPin=',
    '[vertex-fallback] unpinnedTiers=',
  ]) {
    assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
    assert.equal(target.includes(fragment), true, `${fragment}: target`)
  }
  for (const fragment of [
    'CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST',
    'CLAUDE_CODE_SKIP_VERTEX_AUTH',
    'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    'ANTHROPIC_SMALL_FAST_MODEL',
    'ANTHROPIC_VERTEX_PROJECT_ID',
    'https://www.googleapis.com/auth/cloud-platform',
    'max_tokens:1',
    'timeout:8000',
    'status===429',
    '[3p-probe]',
    'ms deadline; proceeding without it',
  ]) assert.ok(target.includes(fragment), fragment)
})

test('the exact Vertex upgrade and fallback flow persists through target116', latestOptions, () => {
  const latest = fs.readFileSync(latestBundlePath)
  assert.equal(
    sha256(latest),
    '06cb80193f3af8bb468d1536b230b0e2f854a398b1e88af3c79048ce821bf193',
  )
  const text = latest.toString('utf8')
  for (const fragment of [
    'tengu_vertex_upgrade_check',
    'tengu_vertex_default_check',
    'tengu_vertex_upgrade_accepted',
    'tengu_vertex_upgrade_declined',
    'tengu_vertex_default_fallback',
    '[vertex-upgrade] tiersWithPin=',
    '[vertex-fallback] unpinnedTiers=',
    'ms deadline; proceeding without it',
  ]) assert.ok(text.includes(fragment), fragment)
})

test('source owns the exact Vertex candidate, probe, fallback, and UI semantics', sourceOptions, () => {
  const owner = source('utils/model/vertexModelUpgrade.ts')
  const interactive = source('interactiveHelpers.tsx')
  const dialog = source('components/ThirdPartyModelUpgradeDialog.tsx')
  const config = source('utils/config.ts')

  for (const fragment of [
    "getAPIProvider() !== 'vertex'",
    'CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST',
    "envVarPriority: ['ANTHROPIC_DEFAULT_SONNET_MODEL']",
    "envVarPriority: ['ANTHROPIC_DEFAULT_OPUS_MODEL']",
    "'ANTHROPIC_SMALL_FAST_MODEL'",
    "'ANTHROPIC_DEFAULT_HAIKU_MODEL'",
    "defaultKey: 'sonnet45'",
    "defaultKey: 'opus46'",
    "defaultKey: 'haiku45'",
    "logEvent('tengu_vertex_upgrade_check'",
    "logEvent('tengu_vertex_default_check'",
    "logEvent('tengu_vertex_probe_result'",
    'MODEL_KEYS.indexOf(pinnedKey)',
    'config.envVarPriority.at(-1)!',
    'previousKey(item.defaultKey, item.tier)',
    "import('@anthropic-ai/vertex-sdk')",
    'refreshGcpCredentialsIfNeeded()',
    'getVertexRegionForModel(model)',
    'maxRetries: 0',
    'timeout: 8000',
    'max_tokens: 1',
    'status?: number })?.status === 429',
  ]) assert.ok(owner.includes(fragment), fragment)

  const expectedProviderOrder = interactive.includes('runBedrockUpgradeCheck(root)')
    ? [
        'runBedrockUpgradeCheck(root)',
        'runBedrockFallbackCheck(root)',
        'runVertexUpgradeCheck(root)',
        'runVertexFallbackCheck(root)',
      ]
    : ['runVertexUpgradeCheck(root)', 'runVertexFallbackCheck(root)']
  assertOrdered(interactive, expectedProviderOrder, 'provider check order')
  for (const fragment of [
    'THIRD_PARTY_PROBE_DEADLINE_MS = 20_000',
    '[3p-probe] ${label} hit ${THIRD_PARTY_PROBE_DEADLINE_MS}ms deadline; proceeding without it',
    "'vertex-upgrade'",
    "'vertex-fallback'",
    'getGlobalConfig().vertexDeclinedUpgrades',
    "candidate.envVar === 'ANTHROPIC_SMALL_FAST_MODEL'",
    "logEvent('tengu_vertex_upgrade_accepted'",
    "logEvent('tengu_vertex_upgrade_declined'",
    "logEvent('tengu_vertex_default_fallback'",
    'process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = fallback.fallbackVertexId',
  ]) assert.ok(interactive.includes(fragment), fragment)

  for (const fragment of [
    'Newer ${tierLabel} model available',
    'Currently pinned:',
    'Latest available:',
    'Claude Code will restart to apply.',
    "defaultValue=\"yes\"",
    "onChange={value => onDone(value === 'yes')}",
  ]) assert.ok(dialog.includes(fragment), fragment)
  assert.ok(config.includes('vertexDeclinedUpgrades?: Partial<Record<'))
})
