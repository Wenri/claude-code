import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const plainNotice = 'Model updated to Opus 4.7'
const legacyNotice =
  'Model updated to Opus 4.7 · Set CLAUDE_CODE_DISABLE_LEGACY_MODEL_REMAP=1 to opt out'
const releases = [
  {
    version: '2.1.121',
    envNames: ['CLAUDE_CODE_2_1_121_BUNDLE', 'CLAUDE_2_1_121_CLI_INNER'],
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  {
    version: '2.1.122',
    envNames: ['CLAUDE_CODE_2_1_122_BUNDLE', 'CLAUDE_2_1_122_CLI_INNER'],
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
]

function readBundle(release) {
  const filename = release.envNames.map(name => process.env[name]).find(Boolean)
  assert.ok(filename, `${release.envNames.join(' or ')} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return bytes.toString('utf8')
}

test('authenticates retained Opus 4.7 migration notices', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(bundle.split(plainNotice).length - 1, 2)
    assert.ok(
      bundle.includes(
        'Model updated to Opus 4.7 \\xB7 Set CLAUDE_CODE_DISABLE_LEGACY_MODEL_REMAP=1 to opt out',
      ),
    )
    assert.equal(bundle.split(`"${plainNotice}"`).length - 1, 1)
    const branchStart = bundle.indexOf('legacyOpusMigrationTimestamp')
    assert.ok(
      branchStart >= 0 &&
        bundle.slice(branchStart, branchStart + 500).includes(plainNotice),
      `${release.version}: migration timestamp selects the 4.7 notice`,
    )
  }
})

test('source reproduces both exact notices', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/hooks/notifs/useModelMigrationNotifications.tsx'),
    'utf8',
  )
  assert.equal(source.split(legacyNotice).length - 1, 1)
  assert.equal(source.split(`'${plainNotice}'`).length - 1, 1)
  assert.ok(!source.includes('Model updated to Opus 4.6'))
})
