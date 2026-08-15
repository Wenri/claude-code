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
    configuredMcpServerCount: 0,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    configuredMcpServerCount: 2,
  },
]

function source(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
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

test('authenticates the target-only headless MCP-count option', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      occurrences(bundle, 'configuredMcpServerCount'),
      release.configuredMcpServerCount,
      release.version,
    )
  }
})

test('emits the exact headless startup timer immediately after entry', () => {
  const print = compact(source('src/cli/print.ts'))
  const entry = compact(`
    headlessProfilerCheckpoint('runHeadless_entry')
    logEvent('tengu_timer', {
      event: 'startup',
      durationMs: Math.round(process.uptime() * 1000),
      mcpNonBlocking: isEnvTruthy(process.env.MCP_CONNECTION_NONBLOCKING),
      mcpClientCount: options.configuredMcpServerCount,
    })
  `)
  assert.ok(print.includes(entry))
  assert.equal(occurrences(print, 'configuredMcpServerCount'), 2)
})

test('passes only configured non-SDK MCP servers from main', () => {
  const main = compact(source('src/main.tsx'))
  assert.ok(
    main.includes(
      'configuredMcpServerCount: Object.keys(regularMcpConfigs).length',
    ),
  )
  assert.ok(
    main.includes(
      "if (typedConfig.type === 'sdk') { sdkMcpConfigs[name] = typedConfig as McpSdkServerConfig; } else { regularMcpConfigs[name] = typedConfig as ScopedMcpServerConfig; }",
    ),
  )
})
