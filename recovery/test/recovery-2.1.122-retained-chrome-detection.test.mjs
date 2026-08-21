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

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

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

test('authenticated adjacent bundles retain both Chrome detection catches', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const fragment of [
      '[Claude in Chrome] Failed to check extension installation during manifest install: ',
      '[Claude in Chrome] Failed to check extension installation during cache refresh: ',
    ]) {
      assert.equal(occurrences(bundle, fragment), 1, `${release.version}: ${fragment}`)
    }
    assert.match(
      bundle,
      /First-time install detected, opening reconnect page in browser[^}]+\.catch\([\w$]+\)/,
      `${release.version}: reconnect open rejection is consumed`,
    )
  }
})

test('source logs and consumes manifest, cache, and reconnect failures', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/utils/claudeInChrome/setup.ts'),
    'utf8',
  )
  assert.ok(
    source.includes(
      'void openInChrome(CHROME_EXTENSION_RECONNECT_URL).catch(logError)',
    ),
  )
  for (const fragment of [
    '[Claude in Chrome] Failed to check extension installation during manifest install: ${error}',
    '[Claude in Chrome] Failed to check extension installation during cache refresh: ${error}',
  ]) {
    assert.ok(source.includes(fragment), fragment)
  }
  assert.equal(source.match(/\.catch\(error =>/g)?.length, 2)
  assert.equal(source.match(/\{ level: 'error' \}/g)?.length, 4)
})
