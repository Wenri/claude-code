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

const expected =
  'Opus with 1M context is not available for your account. Learn more: https://code.claude.com/docs/en/model-config#extended-context-with-1m'

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

test('authenticates the retained Opus 1M rejection copy', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(bundle.split(expected).length - 1, 1, release.version)
    assert.equal(
      bundle.split(`Opus 4.6 with 1M context is not available for your account.`)
        .length - 1,
      0,
      `${release.version}: no version-qualified rejection`,
    )
  }
})

test('source uses the exact retained copy in the active validation branch', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/commands/model/model.tsx'),
    'utf8',
  )
  assert.match(source, /if \(model && isOpus1mUnavailable\(model\)\)/)
  assert.equal(source.split(expected).length - 1, 1)
  assert.doesNotMatch(
    source,
    /Opus 4\.6 with 1M context is not available for your account/,
  )
})
