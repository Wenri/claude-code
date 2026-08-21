import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const version = '1.1.9669'
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

test('authenticates the retained minimum Desktop version', () => {
  for (const release of releases) {
    const filename = process.env[release.env]
    assert.ok(filename, `${release.env} must be set`)
    const bytes = fs.readFileSync(filename)
    assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
    assert.equal(
      crypto.createHash('sha256').update(bytes).digest('hex'),
      release.sha256,
      `${release.version}: SHA-256`,
    )
    const bundle = bytes.toString('utf8')
    assert.equal(bundle.split(version).length - 1, 1, release.version)
    assert.match(bundle, /version-too-old",version:[\w$]+/)
    assert.match(
      bundle,
      /Claude Desktop needs to be updated \(found v\$\{[\w$]+\.version\}, need v\$\{[\w$]+\}\+\)\./,
    )
  }
})

test('source shares the exact retained version across detection and UI', () => {
  const deepLink = fs.readFileSync(
    path.join(repo, 'src/utils/desktopDeepLink.ts'),
    'utf8',
  )
  const handoff = fs.readFileSync(
    path.join(repo, 'src/components/DesktopHandoff.tsx'),
    'utf8',
  )
  assert.match(
    deepLink,
    /export const MIN_DESKTOP_VERSION = '1\.1\.9669'/,
  )
  assert.match(handoff, /need v\$\{MIN_DESKTOP_VERSION\}\+\)\./)
  assert.doesNotMatch(deepLink + handoff, /1\.1\.2396/)
})
