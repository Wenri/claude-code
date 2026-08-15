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
    mcpNonBlockingCount: 2,
    handshakeHasNonBlocking: false,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    mcpNonBlockingCount: 4,
    handshakeHasNonBlocking: true,
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

test('authenticates retained SDK handshake fields and target nonblocking cardinality', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      occurrences(bundle, 'mcpNonBlocking'),
      release.mcpNonBlockingCount,
      `${release.version}: mcpNonBlocking cardinality`,
    )

    assert.equal(
      occurrences(bundle, 'tengu_sdk_init_handshake'),
      2,
      `${release.version}: allowlist plus emitted handshake`,
    )
    const handshakeAt = bundle.lastIndexOf('tengu_sdk_init_handshake')
    assert.ok(handshakeAt >= 0, `${release.version}: emitted SDK handshake`)
    const fields = bundle.slice(handshakeAt, handshakeAt + 500)
    for (const field of ['uptime_ms:', 'mcp_client_count:', 'mcp_pending_count:']) {
      assert.ok(fields.includes(field), `${release.version}: ${field}`)
    }
    assert.equal(
      fields.includes('mcpNonBlocking:'),
      release.handshakeHasNonBlocking,
      `${release.version}: handshake mcpNonBlocking`,
    )
  }
})

test('source emits the target handshake after success and before auth status', () => {
  const source = compact(
    fs.readFileSync(path.join(repo, 'src/cli/print.ts'), 'utf8'),
  )
  const success = source.indexOf("subtype: 'success'")
  const handshake = source.indexOf("logEvent('tengu_sdk_init_handshake'", success)
  const authStatus = source.indexOf('if (enableAuthStatus)', handshake)
  assert.ok(success >= 0, 'success response')
  assert.ok(handshake > success, 'handshake follows success response')
  assert.ok(authStatus > handshake, 'handshake precedes initial auth status')

  for (const fragment of [
    'uptime_ms: Math.round(process.uptime() * 1000)',
    'mcp_client_count: mcp.clients.length',
    "mcp_pending_count: mcp.clients.filter( connection => connection.type === 'pending', ).length",
    'mcpNonBlocking: isEnvTruthy(process.env.MCP_CONNECTION_NONBLOCKING)',
  ]) {
    assert.ok(source.includes(compact(fragment)), fragment)
  }
})
