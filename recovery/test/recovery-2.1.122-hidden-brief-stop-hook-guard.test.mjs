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
    guardCount: 0,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    guardCount: 1,
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

test('authenticates the 2.1.122 brief stop-hook escape hatch', () => {
  for (const release of releases) {
    assert.equal(
      occurrences(readBundle(release), 'DISABLE_BRIEF_MODE_STOP_HOOK'),
      release.guardCount,
      release.version,
    )
  }
})

test('brief enforcement honors the escape hatch before yielding feedback', () => {
  const source = fs
    .readFileSync(path.join(repo, 'src/query/stopHooks.ts'), 'utf8')
    .replaceAll(/\s+/g, ' ')
  assert.match(
    source,
    /briefToolModule\?\.isBriefEnabled\(\) && !isEnvTruthy\(process\.env\.DISABLE_BRIEF_MODE_STOP_HOOK\) && briefPromptModule/,
  )
})
