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

test('authenticates the retained one-time needs-auth reconnect retry', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.match(
      bundle,
      /if\([\w$]+\.type==="needs-auth"\)\{[\w$]+\([\w$]+,"Reconnect returned 'needs-auth'; retrying once after cache clear"\);let [\w$]+=[\w$]+\([\w$]+,[\w$]+\);[\w$]+\.cache\?\.delete\?\.\([\w$]+\),[\w$]+=await [\w$]+\([\w$]+,[\w$]+\)\}/,
      `${release.version}: retry/cache-clear sequence`,
    )
  }
})

test('source reproduces the retained retry before the final connection check', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/services/mcp/client.ts'),
    'utf8',
  )
  const reconnect = source.slice(
    source.indexOf('export async function reconnectMcpServerImpl'),
    source.indexOf('export async function prefetchMcpResources'),
  )

  const firstConnect = reconnect.indexOf(
    'let client = await connectToServer(name, config)',
  )
  const retryCheck = reconnect.indexOf("if (client.type === 'needs-auth')")
  const cacheDelete = reconnect.indexOf('connectToServer.cache?.delete?.(key)')
  const secondConnect = reconnect.indexOf(
    'client = await connectToServer(name, config)',
    cacheDelete,
  )
  const finalCheck = reconnect.indexOf("if (client.type !== 'connected')")

  assert.ok(firstConnect >= 0)
  assert.ok(firstConnect < retryCheck)
  assert.ok(retryCheck < cacheDelete)
  assert.ok(cacheDelete < secondConnect)
  assert.ok(secondConnect < finalCheck)
  assert.match(
    reconnect,
    /logMCPDebug\(\s*name,\s*"Reconnect returned 'needs-auth'; retrying once after cache clear",?\s*\)/,
  )
  assert.match(reconnect, /const key = getServerCacheKey\(name, config\)/)
})
