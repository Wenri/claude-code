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

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

test('authenticates both retained remote transcript persistence calls', () => {
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
    assert.equal(
      occurrences(bytes.toString('utf8'), 'this.persistToRemote('),
      2,
      `${release.version}: persist call cardinality`,
    )
  }
})

test('persists sidechain transcript entries only through internal events', () => {
  const source = compact(
    fs.readFileSync(path.join(repo, 'src/utils/sessionStorage.ts'), 'utf8'),
  )
  const mainPersist = source.indexOf(
    'await this.persistToRemote(sessionId, entry)',
  )
  const sidechainPersist = source.indexOf(
    'void this.persistToRemote(sessionId, entry)',
    mainPersist + 1,
  )
  assert.ok(mainPersist >= 0)
  assert.ok(sidechainPersist > mainPersist)
  const branch = source.slice(mainPersist, sidechainPersist)
  assert.ok(branch.includes('} else if ('))
  assert.ok(branch.includes('this.internalEventWriter &&'))
  assert.ok(branch.includes('isTranscriptMessage(entry)'))
})
