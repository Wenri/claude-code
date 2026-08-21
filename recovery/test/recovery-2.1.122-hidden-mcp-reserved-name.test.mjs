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
    filterReservedNames: 0,
    reservedCopy: 2,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    filterReservedNames: 4,
    reservedCopy: 3,
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

test('authenticates reserved MCP name filtering in the target bundle', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      occurrences(bundle, 'filterReservedNames'),
      release.filterReservedNames,
      `${release.version}: filterReservedNames cardinality`,
    )
    assert.equal(
      occurrences(bundle, 'is a reserved MCP name'),
      release.reservedCopy,
      `${release.version}: warning copy`,
    )
  }
})

test('source filters reserved manual names while preserving project edits and SDK servers', () => {
  const source = compact(
    fs.readFileSync(path.join(repo, 'src/services/mcp/config.ts'), 'utf8'),
  )

  for (const fragment of [
    'filterReservedNames = true',
    "name === CLAUDE_IN_CHROME_MCP_SERVER_NAME && config.type !== 'sdk'",
    'message: `"${name}" is a reserved MCP name`',
    'filterReservedNames: false',
    'filterReservedNames,',
  ]) {
    assert.ok(source.includes(compact(fragment)), fragment)
  }
  assert.equal(
    occurrences(source, 'filterReservedNames'),
    7,
    'definition, plumbing, and project opt-out remain explicit',
  )
})
