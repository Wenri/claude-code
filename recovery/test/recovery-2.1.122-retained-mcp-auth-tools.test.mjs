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

function count(contents, needle) {
  return contents.split(needle).length - 1
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

test('authenticates retained MCP OAuth completion tools', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      count(bundle, 'complete_authentication'),
      3,
      `${release.version}: complete tool cardinality`,
    )
    assert.equal(count(bundle, 'No OAuth flow is in progress'), 1)
    assert.equal(
      count(bundle, 'This session is remote, so after authorizing'),
      1,
    )
    assert.match(
      bundle,
      /let \w+=\w+\(\w+\);\w+\(\w+\);try\{return await \w+,\{data:\{status:"success",message:`Authentication complete for/,
      `${release.version}: active flow is captured before callback submission`,
    )
    assert.match(
      bundle,
      /tools:\[\w+\(\w+,\w+\),\w+\(\w+\)\]/,
      `${release.version}: needs-auth exposes both pseudo-tools`,
    )
  }
})

test('source reproduces MCP OAuth completion and pairing semantics', () => {
  const authTool = fs.readFileSync(
    path.join(repo, 'src/tools/McpAuthTool/McpAuthTool.ts'),
    'utf8',
  )
  const client = fs.readFileSync(
    path.join(repo, 'src/services/mcp/client.ts'),
    'utf8',
  )

  for (const fragment of [
    "buildMcpToolName(serverName, 'complete_authentication')",
    'getMcpOAuthCallbackSubmitter(serverName)',
    'getActiveMCPOAuthFlow(serverName)',
    'parsed.searchParams.has(\'code\') || parsed.searchParams.has(\'error\')',
    'submit(callbackUrl)',
    'await flow',
    'error instanceof AuthenticationCancelledError',
    'This session is remote, so after authorizing',
  ]) {
    assert.ok(authTool.includes(fragment), fragment)
  }
  assert.ok(
    authTool.indexOf('const flow = getActiveMCPOAuthFlow(serverName)') <
      authTool.indexOf('submit(callbackUrl)'),
    'capture active flow before callback submission',
  )
  assert.equal(count(client, 'createMcpCompleteAuthTool(name)'), 2)
  assert.equal(count(client, 'createMcpAuthTool(name, config)'), 2)
})
