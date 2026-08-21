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

const description =
  '@internal When false, the session recap (shown when you return after being away for 5+ minutes) is disabled. When absent or true, recap is enabled. Hidden from public SDK types until external launch.'

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

test('authenticated adjacent bundles retain exact awaySummaryEnabled metadata', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.ok(bundle.includes(description), `${release.version}: exact copy`)
    assert.match(
      bundle,
      /awaySummaryEnabled:[\w$]+\.boolean\(\)\.optional\(\)\.describe\("@internal When false, the session recap/,
      `${release.version}: schema binding`,
    )
    assert.ok(
      !bundle.includes('mirrors voiceHandsfree pattern above'),
      `${release.version}: no source-only suffix`,
    )
  }
})

test('source reconstructs exact awaySummaryEnabled schema metadata', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/utils/settings/types.ts'),
    'utf8',
  )
  assert.ok(source.includes(description))
  assert.ok(!source.includes('mirrors voiceHandsfree pattern above'))
})
