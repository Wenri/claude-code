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
    count: 0,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    count: 1,
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

test('authenticates target-only remote branch rejection', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      occurrences(bundle, 'Invalid branch name from remote session:'),
      release.count,
      `${release.version}: diagnostic`,
    )
    assert.equal(
      occurrences(bundle, 'Invalid branch name from remote session\n'),
      release.count,
      `${release.version}: display error`,
    )
  }
})

test('validates a remote branch before fetch or checkout', () => {
  const contents = fs.readFileSync(
    path.join(repo, 'src/utils/teleport.tsx'),
    'utf8',
  )
  const validation = contents.indexOf('if (!isSafeRefName(branch))')
  const fetch = contents.indexOf('await fetchFromOrigin(branch)', validation)
  const checkout = contents.indexOf('await checkoutBranch(branch)', validation)
  assert.ok(validation >= 0, 'safe-ref guard')
  assert.ok(fetch > validation, 'guard precedes fetch')
  assert.ok(checkout > validation, 'guard precedes checkout')
  assert.ok(
    contents.includes('`Invalid branch name from remote session: ${branch}`'),
  )
  assert.ok(contents.includes("chalk.red('Invalid branch name from remote session\\n')"))
})
