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

const retainedLiterals = [
  'CLAUDE_CODE_MCP_ALLOWLIST_ENV',
  'CLAUDE_CODE_SCRIPT_CAPS',
  'CLAUDE_CODE_HOST_HTTP_PROXY_PORT',
  'CLAUDE_CODE_HOST_SOCKS_PROXY_PORT',
  'CLAUDE_CODE_HTTP_PROXY',
  'CLAUDE_CODE_HTTPS_PROXY',
  'Script call limit exceeded:',
  'FSSPEC_GCS',
]

function count(haystack, needle) {
  return haystack.split(needle).length - 1
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

test('authenticates the retained subprocess environment surface', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const literal of retainedLiterals) {
      assert.equal(count(bundle, literal), 1, `${release.version}: ${literal}`)
    }
    assert.match(
      bundle,
      /\["HOME","LOGNAME","PATH","SHELL","TERM","USER"\]/,
      `${release.version}: POSIX MCP environment allowlist`,
    )
    assert.match(
      bundle,
      /\.HTTP_PROXY\|\|[\w$]+\.http_proxy\|\|[\w$]+\.CLAUDE_CODE_HTTP_PROXY/,
      `${release.version}: HTTP proxy precedence`,
    )
    assert.match(
      bundle,
      /\.HTTPS_PROXY\|\|[\w$]+\.https_proxy\|\|[\w$]+\.CLAUDE_CODE_HTTPS_PROXY/,
      `${release.version}: HTTPS proxy precedence`,
    )
    assert.match(
      bundle,
      /"ELECTRON_GET_USE_PROXY","1"/,
      `${release.version}: Electron proxy propagation`,
    )
    assert.match(
      bundle,
      /"FSSPEC_GCS",'\{"session_kwargs": \{"trust_env": true\}\}'/,
      `${release.version}: Python proxy propagation`,
    )
    assert.match(
      bundle,
      /\.CLAUDE_CODE_ENTRYPOINT==="local-agent"/,
      `${release.version}: local-agent safe default`,
    )
    assert.match(
      bundle,
      /This limit prevents data exfiltration via repeated write operations in untrusted-input workflows\./,
      `${release.version}: script-cap failure`,
    )
  }
})

test('source reproduces subprocess scrubbing, proxy, MCP, and cap callsites', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/utils/subprocessEnv.ts'),
    'utf8',
  )
  for (const literal of retainedLiterals.filter(
    item =>
      item !== 'CLAUDE_CODE_HOST_HTTP_PROXY_PORT' &&
      item !== 'CLAUDE_CODE_HOST_SOCKS_PROXY_PORT',
  )) {
    assert.equal(count(source, literal), 1, literal)
  }
  assert.match(
    source,
    /: \['HOME', 'LOGNAME', 'PATH', 'SHELL', 'TERM', 'USER'\]/,
  )
  assert.match(source, /value === undefined \|\| value\.startsWith\('\(\)'\)/)
  assert.match(source, /return process\.env\.CLAUDE_CODE_ENTRYPOINT === 'local-agent'/)
  assert.match(source, /delete env\.CLAUDE_CODE_OAUTH_TOKEN/)
  assert.match(source, /delete env\.CLAUDE_CODE_RESUME_INTERRUPTED_TURN/)
  assert.match(source, /return \{ \.\.\.getMcpAllowedProcessEnv\(\), \.\.\.upstreamProxyEnv\(\) \}/)
  assert.match(source, /command\.split\(script\)\.length - 1/)

  const mcpClient = fs.readFileSync(
    path.join(repo, 'src/services/mcp/client.ts'),
    'utf8',
  )
  assert.match(mcpClient, /\.\.\.mcpSubprocessEnv\(\)/)

  const shell = fs.readFileSync(path.join(repo, 'src/utils/Shell.ts'), 'utf8')
  assert.match(shell, /if \(isScrubEnabled\(\)\)/)
  assert.match(shell, /parsed\.commands\.map\(item => item\.text\)\.join\('\\n'\)/)
  assert.match(shell, /: command\s+enforceScriptCaps\(commandForCaps\)/)
  assert.match(shell, /enforceScriptCaps\(commandForCaps\)/)

  const sandbox = fs.readFileSync(
    path.join(repo, 'src/utils/sandbox/sandbox-adapter.ts'),
    'utf8',
  )
  assert.match(sandbox, /httpProxyPort: settings\.sandbox\?\.network\?\.httpProxyPort/)
  assert.match(sandbox, /socksProxyPort: settings\.sandbox\?\.network\?\.socksProxyPort/)
})
