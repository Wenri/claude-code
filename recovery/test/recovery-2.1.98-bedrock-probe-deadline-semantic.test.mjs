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
const baselinePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_98_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_PUBLISHED_BUNDLE
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
  [18206, 12691568, 12692820, 'af4145fa1b2889b2414aa83bc700ada84233e5d25d4d565c06863b2e6634fed4'],
  [18207, 12692820, 12693993, 'b3d3dc254355b88040e9cb6633167c612a6f9720b66ee3dc427a3b8760ca9782'],
  [18235, 12701885, 12704847, '1649aea2266ac089cdadceba0e85258decf6402067096021f2cbcf3acd9be960'],
  [18236, 12704847, 12705060, '3fb15d74672880bbc62d5f253ef249f283d230dec14d83920cc790a07305afab'],
  [18237, 12705060, 12706540, '782b813d2830ffcfc325118662f96959914de0ca38e0be20ad334b0bb229b90d'],
  [18239, 12706877, 12707622, '1c365f01c195d6492bdf57a130630a2843708a7f5dee0e9eee06559ad11fde48'],
]

const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_97_BUNDLE and CLAUDE_CODE_2_1_98_BUNDLE are required'
      : false,
}
const latestOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !latestPath
      ? 'CLAUDE_CODE_2_1_116_PUBLISHED_BUNDLE is not set'
      : false,
}
const sourceOptions = { skip: selected ? false : `not applicable to ${semanticCase}` }

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test('target98 pins the Bedrock discovery, deadline, upgrade, fallback, and call-site delta', pairOptions, () => {
  const baseline = fs.readFileSync(baselinePath)
  const target = fs.readFileSync(targetPath)
  assert.equal(sha256(baseline), '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988')
  assert.equal(sha256(target), '27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556')
  const targetText = target.toString('utf8')
  for (const [index, start, end, sourceHash] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: class`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: identity`,
    )
    assert.equal(sha256(targetText.slice(start, end)), sourceHash, `${index}: hash`)
  }
})

test('target98 adds fail-open probes and exact Bedrock tier resolution', pairOptions, () => {
  const baseline = fs.readFileSync(baselinePath, 'utf8')
  const target = fs.readFileSync(targetPath, 'utf8')
  for (const fragment of [
    '[bedrock-upgrade] tiersWithPin=',
    '[bedrock-fallback] unpinnedTiers=',
    '[3p-probe]',
    'bedrock-upgrade',
    'bedrock-fallback',
  ]) {
    assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
    assert.equal(target.includes(fragment), true, `${fragment}: target`)
  }
  for (const fragment of [
    'application-inference-profile',
    'CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST',
    'ANTHROPIC_SMALL_FAST_MODEL',
    'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    'tengu_bedrock_upgrade_accepted',
    'tengu_bedrock_default_fallback',
    'ms deadline; proceeding without it',
  ]) assert.ok(target.includes(fragment), fragment)
})

test('target116 preserves the Bedrock probe deadline and tier diagnostics', latestOptions, () => {
  const latest = fs.readFileSync(latestPath)
  assert.equal(sha256(latest), '06cb80193f3af8bb468d1536b230b0e2f854a398b1e88af3c79048ce821bf193')
  const text = latest.toString('utf8')
  for (const fragment of [
    '[bedrock-upgrade] tiersWithPin=',
    '[bedrock-fallback] unpinnedTiers=',
    '[3p-probe]',
    'bedrock-upgrade',
    'bedrock-fallback',
  ]) assert.ok(text.includes(fragment), fragment)
})

test('source owns exact Bedrock scanning, fallback, and fail-open startup semantics', sourceOptions, () => {
  const module = source('utils/model/bedrockModelUpgrade.tsx')
  const interactive = source('interactiveHelpers.tsx')
  for (const fragment of [
    "getAPIProvider() !== 'bedrock'",
    'CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST',
    "value.includes('application-inference-profile')",
    'tierForKey(key) !== tier',
    'MODEL_KEYS.indexOf(pinnedKey)',
    'config.envVarPriority.at(-1)!',
    '[bedrock-upgrade] tiersWithPin=${stale.length} candidates=${accessibleCandidates.length}',
    '[bedrock-fallback] unpinnedTiers=${unpinned.length} fallbacks=${fallbacks.length}',
  ]) assert.ok(module.includes(fragment), fragment)
  for (const fragment of [
    'THIRD_PARTY_PROBE_DEADLINE_MS = 20_000',
    "'bedrock-upgrade'",
    "'bedrock-fallback'",
    'ThirdPartyModelUpgradeDialog',
    "candidate.envVar === 'ANTHROPIC_SMALL_FAST_MODEL'",
    'process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = fallback.fallbackBedrockId',
    'runBedrockUpgradeCheck(root)',
    'runBedrockFallbackCheck(root)',
  ]) assert.ok(interactive.includes(fragment), fragment)
})
