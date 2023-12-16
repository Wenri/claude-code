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

function count(haystack, needle) {
  return haystack.split(needle).length - 1
}

test('authenticates retained aggregate MCP cleanup in both print close paths', () => {
  const aggregateCleanupCall =
    /await [\w$]+\(\[\.\.\.[\w$]+\(\)\.mcp\.clients,\.\.\.[\w$]+,\.\.\.[\w$]+\.clients\]\)/g

  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      count(bundle, 'MCP client cleanup failed for '),
      1,
      `${release.version}: cleanup failure diagnostic cardinality`,
    )
    assert.equal(
      [...bundle.matchAll(aggregateCleanupCall)].length,
      2,
      `${release.version}: aggregate cleanup close-path cardinality`,
    )
  }
})

test('source restores fail-soft connected-client cleanup before both closes', () => {
  const source = fs.readFileSync(path.join(repo, 'src/cli/print.ts'), 'utf8')

  assert.match(source, /async function cleanupMcpClients\(/)
  assert.match(source, /if \(client\.type !== 'connected'\) return/)
  assert.match(source, /await client\.cleanup\(\)/)
  assert.match(source, /MCP client cleanup failed for \$\{client\.name\}: \$\{error\}/)
  assert.match(source, /\{ level: 'error' \}/)
  assert.equal(
    source.match(/await cleanupMcpClients\(\[/g)?.length,
    2,
    'both print close paths invoke aggregate cleanup',
  )
  const calls = source.match(
    /await cleanupMcpClients\(\[[\s\S]*?dynamicMcpState\.clients,[\s\S]*?\]\)/g,
  )
  assert.equal(calls?.length, 2)
  for (const call of calls ?? []) {
    assert.match(call, /\.\.\.getAppState\(\)\.mcp\.clients,/)
    assert.match(call, /\.\.\.sdkClients,/)
    assert.match(call, /\.\.\.dynamicMcpState\.clients,/)
  }
  assert.match(
    source,
    /statusListeners\.delete\(rateLimitListener\)\s+await cleanupMcpClients\([\s\S]*?\)\s+output\.done\(\)/,
  )
})
