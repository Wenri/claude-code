import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const bundleSpecs = [
  [
    'CLAUDE_CODE_2_1_120_BUNDLE',
    13_784_743,
    'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f',
  ],
  [
    'CLAUDE_CODE_2_1_121_BUNDLE',
    13_908_188,
    '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  ],
]

function loadBundle([environmentName, expectedBytes, expectedSha256]) {
  const filename = process.env[environmentName]
  assert.ok(filename, `${environmentName} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, expectedBytes, `${environmentName}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    expectedSha256,
    `${environmentName}: SHA-256`,
  )
  return bytes.toString('utf8')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

function compact(value) {
  return value.replaceAll(/\s+/g, ' ').trim()
}

function assertSource(relativePath, fragments) {
  const contents = compact(source(relativePath))
  for (const fragment of fragments) {
    assert.equal(
      contents.includes(compact(fragment)),
      true,
      `${relativePath}: ${fragment}`,
    )
  }
}

test('authenticates inherited LSP, remote-shell, and upstream-proxy boundaries', () => {
  const bundles = bundleSpecs.map(loadBundle)
  const exactCounts = new Map([
    ['LSP Diagnostics: Dropping stale publishDiagnostics', 1],
    ['getDocumentVersion', 2],
    ['export BUN_OPTIONS="--smol${BUN_OPTIONS:+ $BUN_OPTIONS}"', 1],
    ['[upstreamproxy] no session token; proxy disabled', 1],
    ['[upstreamproxy] token via ', 1],
    ['payload_signing_enabled = false', 1],
    ['npm.jsr.io', 1],
    ['proxy-injected', 4],
  ])
  for (const [fragment, count] of exactCounts) {
    assert.deepEqual(
      bundles.map(bundle => occurrences(bundle, fragment)),
      [count, count],
      fragment,
    )
  }
})

test('recovers monotonic LSP document versions and stale-diagnostic rejection', () => {
  assertSource('src/services/lsp/LSPServerManager.ts', [
    'const documentVersions: Map<string, number> = new Map()',
    'const version = (documentVersions.get(uri) ?? 0) + 1',
    'documentVersions.set(uri, version)',
    'version: nextDocumentVersion(fileUri)',
    'documentVersions.delete(fileUri)',
    'documentVersions.clear()',
    'getDocumentVersion(uri: string): number | undefined',
    'return documentVersions.get(uri)',
    'return Array.from(extensionMap.keys()).sort()',
  ])
  assert.equal(
    occurrences(
      source('src/services/lsp/LSPServerManager.ts'),
      'version: nextDocumentVersion(fileUri)',
    ),
    2,
  )
  assertSource('src/services/lsp/passiveFeedback.ts', [
    'if (diagnosticParams.version !== undefined)',
    'const currentVersion = manager.getDocumentVersion( diagnosticParams.uri, )',
    'diagnosticParams.version < currentVersion',
    'LSP Diagnostics: Dropping stale publishDiagnostics from ${serverName} for ${diagnosticParams.uri} (server v${diagnosticParams.version} < current v${currentVersion})',
    'return',
  ])
})

test('recovers the remote Bun small-heap shell export before eval', () => {
  const contents = compact(source('src/utils/shell/bashProvider.ts'))
  for (const fragment of [
    'if (isEnvTruthy(process.env.CLAUDE_CODE_REMOTE))',
    '\'export BUN_OPTIONS="--smol${BUN_OPTIONS:+ $BUN_OPTIONS}"\'',
    'commandParts.push(`eval ${quotedCommand}`)',
  ]) {
    assert.equal(contents.includes(compact(fragment)), true, fragment)
  }
  assert.match(
    contents,
    /CLAUDE_CODE_REMOTE[\s\S]*?export BUN_OPTIONS[\s\S]*?commandParts\.push\(`eval \$\{quotedCommand\}`\)/,
  )
})

test('recovers fail-closed upstream proxy credentials, environment, and AWS config', () => {
  assertSource('src/upstreamproxy/upstreamproxy.ts', [
    'const tokenResult = await readToken(tokenPath)',
    'const tokenFileExisted = tokenResult.existed',
    'const token = tokenResult.token ?? getSessionIngressAuthToken()',
    "'[upstreamproxy] no session token; proxy disabled'",
    "tokenFileExisted ? tokenPath : 'sessionIngressAuth'",
    'if (tokenFileExisted)',
    "'jsr.io'",
    "'npm.jsr.io'",
    "AWS_ACCESS_KEY_ID: 'proxy-injected'",
    "AWS_SECRET_ACCESS_KEY: 'proxy-injected'",
    "GH_TOKEN: 'proxy-injected'",
    "GITHUB_TOKEN: 'proxy-injected'",
    "flag: 'wx', mode: 0o600",
    'mkdir(join(path, \'..\'), { recursive: true, mode: 0o700 })',
    'payload_signing_enabled = false',
  ])
  const contents = source('src/upstreamproxy/upstreamproxy.ts')
  for (const removedBypass of [
    "'github.com'",
    "'api.github.com'",
    "'*.github.com'",
    "'*.githubusercontent.com'",
  ]) {
    assert.equal(contents.includes(removedBypass), false, removedBypass)
  }
  assert.equal(occurrences(contents, "'proxy-injected'"), 4)
})
