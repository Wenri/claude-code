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
    envNames: ['CLAUDE_CODE_2_1_121_BUNDLE', 'CLAUDE_2_1_121_CLI_INNER'],
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
    oldCopyCount: 2,
    claudeAiCopyCount: 0,
    genericCopyCount: 0,
  },
  {
    version: '2.1.122',
    envNames: ['CLAUDE_CODE_2_1_122_BUNDLE', 'CLAUDE_2_1_122_CLI_INNER'],
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    oldCopyCount: 0,
    claudeAiCopyCount: 1,
    genericCopyCount: 2,
  },
]

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

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

test('authenticates distinct ClaudeAI and generic OAuth reconnect copy', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      occurrences(
        bundle,
        'Authentication successful, but server still requires authentication. You may need to manually restart Claude Code.',
      ),
      release.oldCopyCount,
      `${release.version}: superseded shared copy`,
    )
    assert.equal(
      occurrences(bundle, 'Tried reconnecting, but '),
      release.claudeAiCopyCount,
      `${release.version}: ClaudeAI reconnect copy`,
    )
    assert.equal(
      occurrences(bundle, 'Got new credentials, but '),
      release.genericCopyCount,
      `${release.version}: generic OAuth reconnect copy`,
    )
  }
})

test('source keeps the two reconnect flows semantically distinct', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/components/mcp/MCPRemoteServerMenu.tsx'),
    'utf8',
  )
  const genericStart = source.indexOf('const handleAuthenticate')
  assert.ok(genericStart > 0, 'generic OAuth handler')
  const claudeAiFlow = source.slice(0, genericStart)
  const genericFlow = source.slice(genericStart)

  assert.ok(
    claudeAiFlow.includes(
      'Tried reconnecting, but ${server.name} is still unauthorized. Make sure the browser sign-in completed, then try again from /mcp.',
    ),
  )
  assert.ok(
    claudeAiFlow.includes(
      'Tried reconnecting to ${server.name}, but the connection failed. Restart Claude Code to retry.',
    ),
  )
  assert.ok(
    genericFlow.includes(
      'Got new credentials, but ${server.name} rejected them on reconnect. Try re-authenticating, or restart Claude Code if it persists.',
    ),
  )
  assert.ok(
    genericFlow.includes(
      'Got new credentials, but reconnecting to ${server.name} failed. Restart Claude Code to retry.',
    ),
  )
  assert.equal(occurrences(genericFlow, 'Tried reconnecting'), 0)
})
