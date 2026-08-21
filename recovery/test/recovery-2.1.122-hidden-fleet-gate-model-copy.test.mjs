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
    enabledCopy: 0,
    modelCopy: 0,
    timeout: 300,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    enabledCopy: 1,
    modelCopy: 1,
    timeout: 1500,
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

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

test('authenticates target fleet hydration and current-session copy', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      occurrences(
        bundle,
        'is not enabled. If this is unexpected, retry in a moment.',
      ),
      release.enabledCopy,
    )
    assert.equal(
      occurrences(
        bundle,
        'for this session only. Selecting a model will undo this.',
      ),
      release.modelCopy,
    )
    assert.equal(
      occurrences(bundle, `,${release.timeout},"gb-before-fleet-gate"`),
      1,
      `${release.version}: hydration timeout`,
    )
  }

  const baseline = readBundle(releases[0])
  const target = readBundle(releases[1])
  const bothOverrides =
    /([A-Za-z_$][\w$]*)\("tengu_slate_meadow"\)&&\1\("tengu_quiet_harbor"\)/
  assert.doesNotMatch(baseline, bothOverrides)
  assert.match(target, bothOverrides)
})

test('source hydrates both fleet gates and renders exact target copy', () => {
  const fleet = compact(
    fs.readFileSync(path.join(repo, 'src/utils/agentsFleet.ts'), 'utf8'),
  )
  for (const fragment of [
    "hasGrowthBookCachedValue('tengu_slate_meadow') && hasGrowthBookCachedValue('tengu_quiet_harbor')",
    "initializeGrowthBook(), 1500, 'gb-before-fleet-gate'",
    "'${operation}' is not enabled. If this is unexpected, retry in a moment.",
  ]) {
    assert.ok(fleet.includes(compact(fragment)), fragment)
  }

  const picker = fs.readFileSync(
    path.join(repo, 'src/components/ModelPicker.tsx'),
    'utf8',
  )
  assert.ok(
    picker.includes(
      'for this session only. Selecting a model will undo this.',
    ),
  )
  assert.ok(!picker.includes('for this session (set by plan mode).'))
})
