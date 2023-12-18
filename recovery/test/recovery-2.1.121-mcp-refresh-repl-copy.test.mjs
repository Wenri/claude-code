import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = [
  {
    names: ['CLAUDE_CODE_2_1_120_BUNDLE', 'CLAUDE_2_1_120_CLI_INNER'],
    bytes: 13_784_743,
    sha256:
      'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f',
  },
  {
    names: ['CLAUDE_CODE_2_1_121_BUNDLE', 'CLAUDE_2_1_121_CLI_INNER'],
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
]

function loadBundle({ names, bytes, sha256 }) {
  const filename = names.map(name => process.env[name]).find(Boolean)
  assert.ok(filename, `${names.join(' or ')} must be set`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, bytes)
  assert.equal(crypto.createHash('sha256').update(value).digest('hex'), sha256)
  return value.toString('utf8')
}

function source(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

test('authenticates retained MCP refresh telemetry and canonical REPL warning', () => {
  for (const bundle of releases.map(loadBundle)) {
    assert.equal(bundle.split('tengu_mcp_tools_refreshed_mid_turn').length - 1, 2)
    assert.equal(
      bundle.split(
        'That message is no longer in the active context. Choose a more recent message.',
      ).length - 1,
      1,
    )
    assert.equal(
      bundle.split(
        'That message is no longer in the active context (snipped or pre-compact). Choose a more recent message.',
      ).length - 1,
      0,
    )
  }
})

test('source counts changed MCP tools and preserves exact active-context copy', () => {
  const query = source('src/query.ts')
  for (const fragment of [
    'const oldMcpCount = count(',
    'const newMcpCount = count(refreshedTools',
    "logEvent('tengu_mcp_tools_refreshed_mid_turn'",
    'recovered: oldMcpCount === 0 && newMcpCount > 0',
  ]) {
    assert.ok(query.includes(fragment), fragment)
  }

  const repl = source('src/screens/REPL.tsx')
  const canonical =
    'That message is no longer in the active context. Choose a more recent message.'
  assert.equal(repl.split(canonical).length - 1, 1)
  assert.equal(
    repl.includes(
      'That message is no longer in the active context (snipped or pre-compact). Choose a more recent message.',
    ),
    false,
  )
})
