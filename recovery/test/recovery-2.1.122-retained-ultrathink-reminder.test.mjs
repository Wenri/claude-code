import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const reminder =
  'The user included the keyword "ultrathink", requesting deeper reasoning on this turn. Reason as thoroughly as the task warrants.'
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

test('authenticates the retained ultrathink reminder in both bundles', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      bundle.split(reminder).length - 1,
      1,
      `${release.version}: exact reminder cardinality`,
    )
    const branchStart = bundle.indexOf('ultrathink_effort:()=>')
    assert.notEqual(
      branchStart,
      -1,
      `${release.version}: payload-free reminder branch`,
    )
    assert.ok(
      bundle.slice(branchStart, branchStart + 300).includes(reminder),
      `${release.version}: reminder ignores the attachment payload`,
    )
  }
})

test('source emits the exact fixed reminder', () => {
  const source = fs.readFileSync(path.join(repo, 'src/utils/messages.ts'), 'utf8')
  assert.equal(source.split(reminder).length - 1, 1)
  const branch = source.slice(
    source.indexOf("case 'ultrathink_effort'"),
    source.indexOf("case 'deferred_tools_delta'"),
  )
  assert.ok(branch.includes(reminder))
  assert.ok(!branch.includes('attachment.level'))
})
