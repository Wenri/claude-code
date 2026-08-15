import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const isCurrentSource =
  path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
const latestBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
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

const targetUnits = new Map([
  [18621, [13266437, 13266759, 'd51ffae49e28d05dea49da0c8adb17ffcf82d25f3020c1a0a596107237b92988', 'FunctionDeclaration']],
  [18622, [13266759, 13267377, 'c7b55e6cf5db204235b527dabf42c7f03b4287ba2dde6e291cf4bfc8a3302140', 'FunctionDeclaration']],
  [18623, [13267377, 13267968, 'ba0f1303f995f678ab2610b6dc8c1727b68b33707e03b6ab4ade43905ba9129a', 'FunctionDeclaration']],
  [18624, [13267968, 13268875, 'f6e786f0b32b8b39b7af2ec20821accbdc12fefe813ce79dedc6f0ded5ad86e9', 'FunctionDeclaration']],
  [18797, [13390491, 13390548, 'bb27677c2d2f7af5be203f631c7ace56da1469c183475941f5601b35635e40fa', 'ExpressionStatement']],
])

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_100_BUNDLE and CLAUDE_CODE_2_1_101_BUNDLE are required'
      : false,
}
const latestOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !latestBundlePath
      ? 'CLAUDE_CODE_2_1_116_BUNDLE is required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function assertFragments(contents, fragments, label) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${label}: ${fragment}`)
  }
}

test('target101 pins the headless MCP coordinator and MCP-server export surface', pairOptions, () => {
  if (pairOptions.skip) return
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be',
  )
  assert.equal(
    sha256(targetBytes),
    'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
  )
  const target = targetBytes.toString('utf8')
  for (const [index, identity] of targetUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [
        region.target.start,
        region.target.end,
        region.target.sourceHash,
        region.target.nodeType,
      ],
      identity,
      `${index}: structural identity`,
    )
    const unit = target.slice(identity[0], identity[1])
    assert.equal(sha256(unit), identity[2], `${index}: target bytes`)
    assert.equal(
      parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
      1,
      `${index}: one top-level statement`,
    )
  }
})

test('target101 introduces the state adapter and createMCPServer factory', pairOptions, () => {
  if (pairOptions.skip) return
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  for (const fragment of ['createMCPServer', 'getClients', 'applyMcpUpdate']) {
    assert.equal(baseline.includes(fragment), false, `${fragment}: target100`)
    assert.equal(target.includes(fragment), true, `${fragment}: target101`)
  }

  for (const [index, fragments] of new Map([
    [18621, ['regularMcpConfigs', 'claudeaiConfigPromise', 'MCP_CONNECTION_NONBLOCKING', 'connect:']],
    [18622, ['type:"pending"', 'applyMcpUpdate', 'new Map', 'clients:', 'tools:', 'commands:']],
    [18623, ['running fully async', 'not ready after', 'background connection continues']],
    [18624, ['getClients', 'Lazy dedup:', 'plugin:', 'applyMcpUpdate']],
    [18797, ['startMCPServer', 'createMCPServer']],
  ])) {
    const [start, end] = targetUnits.get(index)
    assertFragments(target.slice(start, end), fragments, `target unit ${index}`)
  }
})

test('source owns the reachable target101 headless MCP state graph', sourceOptions, () => {
  const manager = source('services/mcp/headlessConnectionManager.ts')
  assertFragments(manager, [
    'export function createHeadlessMcpConnectionManager',
    'regularMcpConfigs',
    'claudeaiConfigPromise',
    'getClients: () =>',
    'applyMcpUpdate:',
    "type: 'pending' as const",
    'readinessResolvers',
    'getMcpToolsCommandsAndResources',
    'dedupClaudeAiMcpServers',
    "!name.startsWith('plugin:')",
    'running fully async (MCP_CONNECTION_NONBLOCKING)',
    'background connection continues',
  ], 'headlessConnectionManager.ts')

  const main = source('main.tsx')
  assertFragments(main, [
    "import { createHeadlessMcpConnectionManager } from './services/mcp/headlessConnectionManager.js'",
    'const headlessMcpConnectionManager = createHeadlessMcpConnectionManager({',
    'getClients: () => headlessStore.getState().mcp.clients',
    'mcp: update(previous.mcp)',
    "profileCheckpoint('before_connectMcp')",
    'await headlessMcpConnectionManager.connect()',
    "profileCheckpoint('after_connectMcp_claudeai')",
  ], 'main.tsx')
  assert.ok(
    main.indexOf('await headlessMcpConnectionManager.connect()') <
      main.indexOf('if (false) {'),
    'the authored coordinator is the reachable call path',
  )

  const entrypoint = source('entrypoints/mcp.ts')
  assertFragments(entrypoint, [
    'export function createMCPServer',
    'const server = createMCPServer(debug, verbose)',
    'await server.connect(transport)',
    "name: 'claude/tengu'",
    'outputSchema: undefined',
    'setToolPermissionContext: () => {}',
    'taskRegistry: MCP_TASK_REGISTRY',
    'addResponseLength: () => {}',
    'resetResponseLength: () => {}',
    'return server',
  ], 'entrypoints/mcp.ts')

  if (isCurrentSource) {
    assertFragments(manager, [
      "'tengu_mcp_concurrent_connect'",
      "'tengu_mcp_retry_failed_remote'",
      'MCP_CONFIG_FETCH_TIMEOUT_MS = 1_000',
      'MCP_REMOTE_RETRY_DELAYS_MS = [500, 1_500, 4_000]',
      'setImmediate(',
    ], 'target116 manager evolution')
    assertFragments(entrypoint, [
      'getToolPermissionContext:',
      'getEffortValue: () => undefined',
      'getAutoCompactWindow: () => undefined',
      'getFastMode: () => false',
      'getCacheBreakerPhrase: () => undefined',
      'sessionHooksRegistry: MCP_SESSION_HOOKS_REGISTRY',
      'setClassifierApprovals: () => {}',
      'setReplContext: () => {}',
      'setWebBrowserSlice: () => {}',
      'agentLifecycle: MCP_AGENT_LIFECYCLE',
      'teammateColors: MCP_TEAMMATE_COLORS',
    ], 'target116 MCP tool context')
  } else {
    assertFragments(manager, [
      'MCP_CONNECTION_TIMEOUT_MS = 5_000',
      'void Promise.resolve(connection).catch(() => {})',
      '? previous.clients.map(existing =>',
      ': [...previous.clients, client]',
    ], 'target101 manager')
    assert.equal(manager.includes('tengu_mcp_concurrent_connect'), false)
    assert.equal(manager.includes('tengu_mcp_retry_failed_remote'), false)
    assert.equal(entrypoint.includes('sessionHooksRegistry:'), false)
    assert.equal(entrypoint.includes('setClassifierApprovals:'), false)
  }
})

test('current source follows the target116 MCP evolution', latestOptions, () => {
  if (latestOptions.skip) return
  const latestBytes = fs.readFileSync(latestBundlePath)
  assert.equal(
    sha256(latestBytes),
    'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
  )
  const latest = latestBytes.toString('utf8')
  for (const fragment of [
    'createMCPServer',
    'tengu_mcp_concurrent_connect',
    'tengu_mcp_retry_failed_remote',
    'MCP_CONNECTION_NONBLOCKING',
    'getToolPermissionContext',
    'getCacheBreakerPhrase',
    'setWebBrowserSlice',
  ]) {
    assert.ok(latest.includes(fragment), fragment)
  }
})
