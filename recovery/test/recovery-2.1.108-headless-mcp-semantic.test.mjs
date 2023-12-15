import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.107-to-2.1.108'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const historical = semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_107_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_108_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_107_BUNDLE and CLAUDE_CODE_2_1_108_BUNDLE are required'
      : false,
}

const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

const units = new Map([
  [18954, [13222691, 13223406, 'FunctionDeclaration', 'd9c7204dac058d0fba19607617edc816319ce6e5672b46e55120c11de982c73b']],
  [18955, [13223406, 13224371, 'FunctionDeclaration', '1b5ec0ee78d364280fe57c57f8c6be7b53801c7bf01d421cbbf78ad52aeeb76f']],
  [18957, [13224962, 13225869, 'FunctionDeclaration', 'c9bb167e1d8ee620c1e08f8d0e086e7a88fb5fed800db20f161eb6a377d760b5']],
  [19261, [13415102, 13470349, 'FunctionDeclaration', '175eb4570cd1ca09a83c32dc30d08d93e79c7014e10566c26133e05f43b7e2d0']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function count(contents, fragment) {
  return contents.split(fragment).length - 1
}

test('target108 pins retry, late-result, dedup, and headless-store adapter units', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(
    sha256(baselineBytes),
    '6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844',
  )
  assert.equal(
    sha256(targetBytes),
    'dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73',
  )
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  for (const [index, [start, end, nodeType, expectedHash]] of units) {
    const region = structural.regions[index]
    assert.deepEqual(
      [
        region.target.start,
        region.target.end,
        region.target.nodeType,
        region.target.sourceHash,
      ],
      [start, end, nodeType, expectedHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(target.slice(start, end)), expectedHash, `${index}: bytes`)
  }

  assert.equal(count(baseline, 'tengu_mcp_retry_failed_remote'), 0)
  assert.equal(count(target, 'tengu_mcp_retry_failed_remote'), 1)
  const connect = target.slice(13222691, 13223406)
  for (const fragment of [
    'type:"pending"',
    'applyMcpUpdate',
    'connect error:',
    'tengu_mcp_retry_failed_remote',
  ]) {
    assert.ok(connect.includes(fragment), fragment)
  }
  const retry = target.slice(13223406, 13224371)
  for (const fragment of [
    'getClients',
    'applyMcpUpdate',
    'Retry: all remote servers connected, stopping',
    'failed remote server(s) after',
    'still failed after all retries',
  ]) {
    assert.ok(retry.includes(fragment), fragment)
  }
  const dedup = target.slice(13224962, 13225869)
  for (const fragment of [
    'Lazy dedup: suppressing',
    '.client.onclose=void 0',
    'getClients',
    'applyMcpUpdate',
    'claudeai',
  ]) {
    assert.ok(dedup.includes(fragment), fragment)
  }
  const main = target.slice(13415102, 13470349)
  for (const fragment of [
    'getClients:',
    'applyMcpUpdate:',
    'before_connectMcp',
    'after_connectMcp_claudeai',
    'createSubcommandRoot',
  ]) {
    assert.ok(main.includes(fragment), fragment)
  }
})

test('source owns target108 headless deadlines, retries, and late-client cleanup', sourceOptions, () => {
  const main = source('main.tsx')
  for (const fragment of [
    'MCP_REMOTE_RETRY_DELAYS_MS = [500, 1_500, 4_000]',
    "'http'",
    "'sse'",
    "'claudeai-proxy'",
    "getFeatureValue_CACHED_MAY_BE_STALE('tengu_mcp_retry_failed_remote', true)",
    'connectToServer.cache.delete(getServerCacheKey(name, config))',
    'if (!prev.mcp.clients.some(existing => existing.name === client.name))',
    "void clearServerCache(client.name, client.config).catch(() => {})",
    'client.client.onclose = undefined',
    'MCP_CONNECTION_NONBLOCKING',
    "profileCheckpoint('before_connectMcp')",
    "profileCheckpoint('after_connectMcp_claudeai')",
  ]) {
    assert.ok(main.includes(fragment), fragment)
  }

  // Target108 closes over the headless store directly. Target116 moves the
  // same state edges into the reusable headless connection-manager adapter.
  assert.ok(main.includes('headlessStore.getState().mcp.clients'))
  assert.ok(main.includes('headlessStore.setState(prev =>'))
  if (historical) {
    assert.equal(main.includes('getClients: () =>'), false)
    assert.equal(main.includes('applyMcpUpdate:'), false)
  } else {
    assert.ok(
      main.includes(
        'const headlessMcpConnectionManager = createHeadlessMcpConnectionManager({',
      ),
    )
    assert.ok(main.includes('getClients: () => headlessStore.getState().mcp.clients'))
    assert.ok(main.includes('applyMcpUpdate: update =>'))
  }

  // createSubcommandRoot is independently reachable through real Commander
  // handlers; it is not a missing property merely because the minifier uses
  // object destructuring in the target main function.
  assert.ok(count(main, 'createSubcommandRoot') >= 10)
  assert.ok(main.includes('await createSubcommandRoot()'))
})

test('source distinguishes the target108 coordinator from target116 evolution', sourceOptions, () => {
  const main = source('main.tsx')
  const coordinatorStart = main.indexOf('// Print-mode MCP')
  const coordinatorEnd = main.indexOf(
    '// In headless mode, start deferred prefetches',
    coordinatorStart,
  )
  assert.ok(coordinatorStart >= 0 && coordinatorEnd > coordinatorStart)
  const coordinator = main.slice(coordinatorStart, coordinatorEnd)
  if (historical) {
    assert.ok(coordinator.includes('const MCP_CONNECTION_TIMEOUT_MS = 5_000'))
    assert.equal(coordinator.includes('MCP_CONFIG_FETCH_TIMEOUT_MS'), false)
    assert.equal(coordinator.includes('MCP_SERVER_READINESS_TIMEOUT_MS'), false)
    assert.ok(
      coordinator.includes(
        "await connectWithMcpDeadline(mcpConnectionNonblocking, connectMcpBatch(regularMcpConfigs, 'regular'), '--mcp-config servers')",
      ),
    )
    assert.ok(
      coordinator.includes(
        "await connectWithMcpDeadline(mcpConnectionNonblocking, claudeaiConfigPromise.then(connectClaudeAiMcp), 'claude.ai connectors')",
      ),
    )
    assert.equal(coordinator.includes("'tengu_mcp_concurrent_connect'"), false)
    assert.equal(coordinator.includes('setImmediate(() =>'), false)
  } else {
    for (const fragment of [
      'MCP_SERVER_READINESS_TIMEOUT_MS = 5_000',
      'MCP_CONFIG_FETCH_TIMEOUT_MS = 1_000',
      "getFeatureValue_CACHED_MAY_BE_STALE('tengu_mcp_concurrent_connect', false)",
      'setImmediate(() =>',
      'await Promise.all([',
    ]) {
      assert.ok(coordinator.includes(fragment), fragment)
    }
  }
})
