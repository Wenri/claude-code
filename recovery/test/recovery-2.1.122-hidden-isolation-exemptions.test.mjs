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
    fieldCount: 0,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    fieldCount: 7,
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

function source(relativePath) {
  return compact(fs.readFileSync(path.join(repo, relativePath), 'utf8'))
}

test('authenticates the target-only SDK isolation exemption contract', () => {
  const description =
    '@internal Additional MCP server names exempt from the web search / connector isolation latch. Unioned with the built-in infra-server list.'
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      occurrences(bundle, 'webSearchIsolationExemptMcpServers'),
      release.fieldCount,
      `${release.version}: field cardinality`,
    )
    assert.equal(
      occurrences(bundle, description),
      release.version === '2.1.122' ? 1 : 0,
      `${release.version}: schema description`,
    )
  }
})

test('recovers the per-session exemption union and initialize dispatch', () => {
  const isolation = source('src/services/tools/toolIsolation.ts')
  for (const fragment of [
    'if (servers.length === 0) return',
    'latch.exemptServers = new Set([',
    '...(latch.exemptServers ?? EXCLUDED_CONNECTOR_SERVERS)',
    '...servers.map(normalizeNameForMCP)',
    'exemptServers: ReadonlySet<string> = EXCLUDED_CONNECTOR_SERVERS',
    '!exemptServers.has(normalizeNameForMCP(mcpServerName))',
    'classifyToolIsolation(tool, latch.exemptServers)',
  ]) {
    assert.ok(isolation.includes(compact(fragment)), fragment)
  }

  const schema = source('src/entrypoints/sdk/controlSchemas.ts')
  assert.ok(schema.includes('webSearchIsolationExemptMcpServers: z .array(z.string())'))
  assert.ok(
    schema.includes(
      '@internal Additional MCP server names exempt from the web search / connector isolation latch. Unioned with the built-in infra-server list.',
    ),
  )

  const print = source('src/cli/print.ts')
  assert.ok(print.includes('if (message.request.webSearchIsolationExemptMcpServers)'))
  assert.ok(
    print.includes(
      'addWebSearchIsolationExemptMcpServers( isolationLatch, message.request.webSearchIsolationExemptMcpServers, )',
    ),
  )

  const types = source('src/tools/REPLTool/types.ts')
  assert.ok(types.includes('exemptServers?: Set<string>'))
})
