import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = [
  {
    version: '2.1.121',
    env: 'CLAUDE_CODE_2_1_121_BUNDLE',
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
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

function count(text, needle) {
  return text.split(needle).length - 1
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

test('authenticated adjacent bundles retain GrowthBook cache and experiment helpers', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(count(bundle, 'hasGrowthBookCachedValue'), 1)
    assert.equal(count(bundle, 'isFeatureFromExperiment'), 1)
    assert.equal(count(bundle, 'cachedExperimentFeatures'), 3)

    const cachedExport = bundle.match(
      /hasGrowthBookCachedValue:\(\)=>([A-Za-z_$][\w$]*)/,
    )
    const experimentExport = bundle.match(
      /isFeatureFromExperiment:\(\)=>([A-Za-z_$][\w$]*)/,
    )
    assert.ok(cachedExport, `${release.version}: cached-value helper export`)
    assert.ok(experimentExport, `${release.version}: experiment helper export`)

    assert.match(
      bundle,
      new RegExp(
        `function ${escapeRegExp(cachedExport[1])}\\([^)]*\\)\\{[^}]{0,180}cachedGrowthBookFeatures`,
      ),
    )
    assert.match(
      bundle,
      new RegExp(
        `function ${escapeRegExp(experimentExport[1])}\\([^)]*\\)\\{[^}]{0,240}cachedExperimentFeatures`,
      ),
    )
  }
})

test('source restores exact cache persistence and both live consumers', () => {
  const growthbook = fs.readFileSync(
    path.join(repo, 'src/services/analytics/growthbook.ts'),
    'utf8',
  )
  assert.match(
    growthbook,
    /export function hasGrowthBookCachedValue\(feature: string\): boolean/,
  )
  assert.match(
    growthbook,
    /cachedGrowthBookFeatures\?\.\[feature\] !== undefined/,
  )
  assert.match(
    growthbook,
    /export function isFeatureFromExperiment\(feature: string\): boolean[\s\S]*?experimentDataByFeature\.has\(feature\)[\s\S]*?cachedExperimentFeatures \?\? \[\]/,
  )
  assert.match(
    growthbook,
    /cachedExperimentFeatures: freshExperimentFeatures/,
  )

  const fleet = fs.readFileSync(
    path.join(repo, 'src/utils/agentsFleet.ts'),
    'utf8',
  )
  assert.match(
    fleet,
    /hasGrowthBookCachedValue\('tengu_slate_meadow'\)[\s\S]*?hasGrowthBookCachedValue\('tengu_quiet_harbor'\)/,
  )

  const warmResume = fs.readFileSync(
    path.join(repo, 'src/components/WarmResumeHint.tsx'),
    'utf8',
  )
  assert.match(
    warmResume,
    /isFeatureFromExperiment\(WARM_RESUME_GATE\)[\s\S]*?hasGrowthBookEnvOverride\(WARM_RESUME_GATE\)/,
  )
  assert.doesNotMatch(warmResume, /getAllGrowthBookFeatures/)
})
