import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const bundles = [
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

test('authenticates target-only Remote Control boundary behavior', () => {
  const [baseline, target] = bundles.map(loadBundle)
  const witnesses = [
    ['tengu_sdk_url_host_rejected', 0, 1],
    ['is not an approved Anthropic endpoint', 0, 1],
    ['only wss:// and https:// are accepted', 0, 1],
    ['This flag is reserved for Remote Control worker processes', 0, 1],
    ['bridge_repl_v2_reattach_fallback', 0, 1],
    ['fetchRemoteCredentials (post-fallback)', 0, 1],
    ['mcp_status', 3, 4],
    ['mcp_authenticate', 2, 6],
    ['mcp_oauth_callback_url', 2, 4],
    ['No OAuth flow in progress for "', 0, 1],
    ['MCP connection manager not ready', 0, 1],
    ['tengu_claudeai_mcp_auth_started', 1, 3],
    ['Unable to build claude.ai connector auth URL', 0, 2],
    ['callbackExpected', 0, 6],
    ['redirectScheme', 0, 2],
    ['Ran immediate command without enqueue', 0, 1],
  ]
  for (const [fragment, baselineCount, targetCount] of witnesses) {
    assert.equal(occurrences(baseline, fragment), baselineCount, fragment)
    assert.equal(occurrences(target, fragment), targetCount, fragment)
  }
})

test('recovers SDK endpoint validation and env-less token lifecycle', () => {
  assertSource('src/main.tsx', [
    'const APPROVED_SDK_HOSTNAMES = new Set([',
    'is not an approved Anthropic endpoint',
    'only wss:// and https:// are accepted',
    "logEvent('tengu_sdk_url_host_rejected', {})",
    'Promise.all([shutdown1PEventLogging(), shutdownDatadog()])',
    "isPolicyAllowed('allow_remote_control')",
  ])
  assertSource('src/bridge/initReplBridge.ts', [
    'if (reattachSessionId) { delete process.env.CLAUDE_BRIDGE_REATTACH_SESSION delete process.env.CLAUDE_BRIDGE_REATTACH_SEQ }',
    'const initialHistoryCap = 200',
    'const versionError = await checkEnvLessBridgeMinVersion()',
    'const { initEnvLessBridgeCore } = await import',
    'getToolPermissionContext?.() ?? getEmptyToolPermissionContext()',
    'onProactiveRefresh: async () => { await checkAndRefreshOAuthTokenIfNeeded() }',
    'onMcpAuthenticate, onMcpOauthCallbackUrl, onMcpReconnect, onMcpStatus',
  ])
  assertSource('src/bridge/envLessBridgeConfig.ts', [
    'const cfg = await getEnvLessBridgeConfig() return cfg.should_show_app_upgrade_message',
  ])
  assertSource('src/bridge/remoteBridgeCore.ts', [
    'let isReattach = !!reattachSessionId',
    'bridge_repl_v2_reattach_fallback',
    "'fetchRemoteCredentials (post-fallback)'",
    'if (onProactiveRefresh) await onProactiveRefresh()',
    'initialSequenceNum: isReattach ? reattachSequenceNum : undefined',
    'initialFlushDone = isReattach',
    'if (!isReattach && initialMessages && initialMessages.length > 0)',
  ])
})

test('recovers MCP bridge controls and reactive system metadata', () => {
  assertSource('src/bridge/bridgeMessaging.ts', [
    "case 'mcp_status':",
    'response: { mcpServers: onMcpStatus?.() ?? [] }',
    "case 'mcp_authenticate': case 'mcp_oauth_callback_url': case 'mcp_reconnect':",
    'is not supported in this context (callback not registered)',
    'response: result ?? {}',
  ])
  assertSource('src/hooks/useReplBridge.tsx', [
    'onMcpStatus() { return store.getState().mcp.clients.map',
    'async onMcpAuthenticate(serverName, redirectUri)',
    'getToolPermissionContext: () => store.getState().toolPermissionContext',
    "logEvent('tengu_claudeai_mcp_auth_started', {})",
    'trackMCPOAuthFlow(serverName, oauthPromise)',
    'requiresUserAction: true, callbackExpected: true',
    'async onMcpOauthCallbackUrl(serverName, callbackUrl)',
    'async onMcpReconnect(serverName)',
    'const sendBridgeSystemInit = useCallback(() =>',
    'if (!replBridgeConnected || replBridgeOutboundOnly) return',
    '!replBridgeEnabled || getIsRemoteMode()',
    'mainLoopModel, permissionMode, fastMode, sendBridgeSystemInit',
    "message.subtype === 'bridge_status' && message.url === url",
    'notifyBridgeFailed detail="${detail}" outboundOnly=${outboundOnly} wasConnected=${wasConnected}',
    "Remote Control {wasConnected ? 'disconnected' : 'failed'}",
    "lastFailureDetailRef.current === normalizedDetail",
    "wasConnected ? 'info' : 'warning'",
    '<Text color="error">Remote Control failed</Text> <Text dimColor> · {fuseHint}</Text>',
    'if (!outboundOnly) { addNotification',
    'handleStateChange state=${state} detail="${detail_0}" cancelled=${cancelled} outboundOnly=${outboundOnly}',
    'No handler for control_response request_id=${requestId} (late response after local resolve, or unknown id)',
    "{ level: 'verbose' }",
    'async function persistBridgeSessionId(bridgeSessionId: string)',
    'bridgeSessionId, bridgeSessionSeq: undefined',
    'if (isBgSession()) { void persistBridgeSessionId(handle_0.bridgeSessionId) }',
    "display_name: formatToolDisplayName(toolName)",
    "(toolName.split('__').pop() || toolName) .replace(/_/g, ' ') .replace(/\\b\\w/g, character => character.toUpperCase())",
    'handle_0.sendControlCancelRequest(requestId_2)',
    'pendingPermissionHandlers.delete(requestId_2)',
    "Hook: init cancelled during flight, tearing down'",
    'replBridgePermissionCallbacks: permissionCallbacks, replBridgeConnected: true, replBridgeSessionUrl: url, replBridgeEnvironmentId: handle_0.environmentId',
    'Hook cleanup: starting teardown for session=${handleRef.current.bridgeSessionId}',
  ])
  assertSource('src/services/mcp/MCPConnectionManager.tsx', [
    'let activeMcpReconnect:',
    'export function getMcpReconnect()',
    'activeMcpReconnect = reconnectMcpServer',
  ])
})
