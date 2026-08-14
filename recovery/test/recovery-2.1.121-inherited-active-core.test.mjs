import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const bundleSpecs = [
  {
    names: ['CLAUDE_CODE_2_1_120_BUNDLE', 'CLAUDE_2_1_120_CLI_INNER'],
    bytes: 13_784_743,
    sha256:
      'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f',
  },
  {
    names: ['CLAUDE_CODE_2_1_121_BUNDLE', 'CLAUDE_2_1_121_CLI_INNER'],
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
]

function loadBundle({ names, bytes, sha256 }) {
  const filename = names.map(name => process.env[name]).find(Boolean)
  assert.ok(filename, `${names.join(' or ')} must be set`)
  const contents = fs.readFileSync(filename)
  assert.equal(contents.length, bytes, `${names[0]}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(contents).digest('hex'),
    sha256,
    `${names[0]}: SHA-256`,
  )
  return contents.toString('utf8')
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

test('authenticates inherited-active A-G witnesses in both adjacent bundles', () => {
  const bundles = bundleSpecs.map(loadBundle)
  const witnesses = [
    ['tengu_mcp_directory_visibility', 1],
    ['tengu_mcp_directory_bff', 1],
    ['tengu_mcp_registry_fetch', 3],
    ['https://api.anthropic.com/api/directory/servers?', 1],
    ['MCP_TRUNCATION_PROMPT_OVERRIDE', 1],
    ['tengu_mcp_subagent_prompt', 1],
    ['A vague "summarize this" may lose detail.', 1],
    ['tengu_tool_use_isolation_latch_denied', 2],
    ['enforce_web_search_mcp_isolation', 1],
    ['tengu_doorbell_agave', 1],
    ['tengu_malformed_tool_use_response', 1],
    ['Your tool call was malformed and could not be parsed. Please retry.', 1],
    ["The model's tool call could not be parsed (retry also failed).", 1],
    ['tengu_slate_reef', 2],
    ['tengu_file_read_reread', 1],
    ['harness truncates oversized files automatically', 1],
    ['tengu_cold_compact', 1],
    ['stripNonEssential', 3],
    ['[truncated, original ', 1],
    ['stripAllBashFlag', 1],
    ['tengu_bash_allowlist_strip_all', 1],
  ]
  for (const [fragment, expected] of witnesses) {
    assert.deepEqual(
      bundles.map(bundle => occurrences(bundle, fragment)),
      [expected, expected],
      fragment,
    )
  }
  for (const bundle of bundles) {
    const retryMessage =
      'Your tool call was malformed and could not be parsed. Please retry.'
    const retryOffset = bundle.indexOf(retryMessage)
    assert.notEqual(retryOffset, -1, 'malformed tool-use retry witness')
    assert.match(
      bundle.slice(retryOffset, retryOffset + 700),
      /maxOutputTokensRecoveryCount:0,hasAttemptedReactiveCompact:!1,[\s\S]*?transition:\{reason:"malformed_tool_use_retry"\}/,
      'malformed retry must reset reactive-compaction state',
    )
  }
})

test('recovers visibility-aware legacy and BFF MCP directories fail-closed', () => {
  assertSource('src/services/mcp/officialRegistry.ts', [
    "'commercial', 'gsuite', 'enterprise', 'health'",
    'const MAX_DIRECTORY_PAGES = 20',
    "'tengu_mcp_directory_visibility'",
    "configured.every(value => typeof value === 'string')",
    'configured.filter(value => value.length > 0)',
    "version: 'latest', limit: '100', visibility: visibilityParam",
    'response.data.metadata?.nextCursor',
    "limit: '500', visibility: visibilityParam",
    'https://api.anthropic.com/api/directory/servers?${params}',
    "if (server.type !== 'remote') continue",
    'response.data.next_cursor ?? undefined',
    "'tengu_mcp_directory_bff'",
    "const source = useDirectoryBff ? 'bff' : 'legacy'",
    'officialRegistryState.urls = new Set()',
    "logEvent('tengu_mcp_registry_fetch'",
    'empty_visibility: true',
    'url_count: urls.size',
    'duration_ms: Date.now() - startedAt',
  ])
  const contents = compact(source('src/services/mcp/officialRegistry.ts'))
  assert.match(
    contents,
    /if \(visibility\.length === 0\)[\s\S]*?empty_visibility: true[\s\S]*?const startedAt = Date\.now\(\)[\s\S]*?useDirectoryBff \? await fetchDirectoryBffUrls\(visibility\) : await fetchLegacyRegistryUrls\(visibility\)/,
  )
})

test('recovers gated MCP persistence prompts and plain-text line sizing', () => {
  assertSource('src/utils/mcpOutputStorage.ts', [
    'const override = process.env.MCP_TRUNCATION_PROMPT_OVERRIDE',
    "override ? override !== 'legacy' : getFeatureValue_CACHED_MAY_BE_STALE('tengu_mcp_subagent_prompt', false)",
    'getDefaultFileReadingLimits().maxTokens * 4 * 0.8',
    'lineStats.count > 1 && lineStats.maxLen <= safeReadChars',
    'Math.floor(safeReadChars / (lineStats.maxLen + 8))',
    "first probe the structure (e.g., jq 'type, length, keys?' ${rawOutputPath})",
    "the file's lines are too long for Read's offset/limit",
    'read ${rawOutputPath} in chunks of ~${linesPerChunk} lines using offset/limit',
    'If the ${AGENT_TOOL_NAME} tool is available',
    'Give it the instruction above verbatim',
    'A vague "summarize this" may lose detail.',
  ])
  assertSource('src/utils/mcpValidation.ts', [
    'export function stripMcpTextBlockMeta',
    "block.type === 'text' && '_meta' in block && block._meta",
    'const { _meta: _, ...withoutMeta } = block',
  ])
  assertSource('src/tools/MCPTool/MCPTool.ts', [
    'content: stripMcpTextBlockMeta(content)',
  ])
  assertSource('src/services/mcp/client.ts', [
    'schema: inferCompactSchema(stripMcpTextBlockMeta(transformedContent))',
    'const persistedContent = stripMcpTextBlockMeta(content)',
    'const useSubagentPrompt = isMcpSubagentPromptEnabled()',
    "!('annotations' in persistedContent[0])",
    "!('_meta' in persistedContent[0])",
    'singlePlainText ?? jsonStringify(persistedContent, null, 2)',
    "const persistedAs = isPlainText ? 'text' : 'json'",
    "const lines = contentStr.split('\\n')",
    "if (lines.length > 1 && lines.at(-1) === '') lines.pop()",
    'resultType: type',
    'blockCount',
    'persistedAs',
    "singlePlainText !== undefined ? 'toolResult' : type",
    'lineStats',
  ])
})

test('recovers shared policy-backed isolation and primary pre-hook denial', () => {
  assertSource('src/services/policyLimits/index.ts', [
    'export function isPolicyEnforced(policy: string): boolean',
    'getRestrictionsFromCache()?.[policy]?.allowed === true',
  ])
  assertSource('src/services/tools/toolIsolation.ts', [
    "const ISOLATION_POLICY = 'enforce_web_search_mcp_isolation'",
    "const ISOLATION_GATE = 'tengu_doorbell_agave'",
    "'cowork', 'workspace', 'session-info', 'mcp-registry', 'plugins', 'scheduled-tasks', 'dispatch', 'ide'",
    "toolName === 'WebSearch' || toolName === 'WebFetch'",
    "toolName === 'McpSearch' || toolName === 'McpFetch'",
    '!EXCLUDED_CONNECTOR_SERVERS.has(normalizeNameForMCP(mcpServerName))',
    'isPolicyEnforced(ISOLATION_POLICY)',
    'const toolsByName = new Map(tools.map(tool => [tool.name, tool]))',
    "block.name.startsWith('mcp__') ? block.name.split('__')[1] : undefined",
    'if (classification !== null) return classification',
    'if (activeLatch && activeLatch !== classifiedAs)',
    'if (!activeLatch) latch.current = classifiedAs',
  ])
  assertSource('src/tools/REPLTool/toolWrappers.ts', [
    'const isolation = checkToolIsolation(tool, context)',
    "logEvent('tengu_tool_use_isolation_latch_denied'",
    'isolationLatch: isolation.activeLatch',
    'isolationClassifiedAs: isolation.classifiedAs',
    'replInnerCall: true',
  ])
  assertSource('src/services/tools/toolExecution.ts', [
    'const isolation = checkToolIsolation(tool, toolUseContext)',
    "logEvent('tengu_tool_use_isolation_latch_denied'",
    'isolationLatch: isolation.activeLatch',
    'isolationClassifiedAs: isolation.classifiedAs',
    'queryChainId: toolUseContext.queryTracking ?.chainId',
    '...mcpToolDetailsForAnalytics( tool.name, mcpServerType, mcpServerBaseUrl, )',
    'content: `<tool_use_error>${isolation.denyMessage}</tool_use_error>`',
    'toolUseResult: `Error: ${isolation.denyMessage}`',
  ])
  const execution = compact(source('src/services/tools/toolExecution.ts'))
  assert.ok(
    execution.indexOf('const isolation = checkToolIsolation') <
      execution.indexOf('streamedCheckPermissionsAndCallTool('),
    'primary isolation latch must deny before hooks/permission execution',
  )
  assertSource('src/screens/REPL.tsx', [
    'isolationLatchRef.current = getIsolationClassFromMessages(messages, tools)',
    'isolationLatchRef.current = getIsolationClassFromMessages(initialMessages, tools)',
  ])
  assertSource('src/cli/print.ts', [
    'const isolationLatch = createToolIsolationLatch( getIsolationClassFromMessages(initialMessages, tools), )',
    'isolationLatch, replayUserMessages:',
  ])
})

test('recovers one-retry malformed tool-use state transition', () => {
  assertSource('src/query.ts', [
    'let lastStopReason: string | null = null',
    "message.type === 'stream_event' && message.event.type === 'message_delta'",
    'lastStopReason = message.event.delta.stop_reason',
    "(lastMessage?.message.stop_reason ?? lastStopReason) === 'tool_use'",
    'toolUseBlocks.length === 0',
    '!lastMessage?.isApiErrorMessage',
    "state.transition?.reason !== 'malformed_tool_use_retry'",
    "logEvent('tengu_malformed_tool_use_response'",
    'will_retry: willRetry',
    'model: currentModel',
    'Your tool call was malformed and could not be parsed. Please retry.',
    'yield recoveryMessage',
    "maxOutputTokensRecoveryCount: 0, hasAttemptedReactiveCompact: false, maxOutputTokensOverride: undefined, pendingToolUseSummary: undefined, stopHookActive, turnCount, transition: { reason: 'malformed_tool_use_retry' }",
    "The model's tool call could not be parsed (retry also failed).",
    'void executeStopFailureHooks(retryFailed, toolUseContext)',
    'void markClassifierApiFailure(toolUseContext, querySource, retryFailed)',
    '.catch(() => {})',
  ])
})

test('recovers slate-reef Read schema and pre-dedup reread attribution', () => {
  assertSource('src/tools/FileReadTool/FileReadTool.ts', [
    "getFeatureValue_CACHED_MAY_BE_STALE('tengu_slate_reef', false)",
    'The line number to start reading from. Provide with `limit` to read a specific line range, or alone when the file is too large to read at once.',
    'ONLY include with offset to read a specific slice. OMIT to read the whole file (harness truncates oversized files automatically).',
    'const priorReadState = readFileState.get(fullFilePath)',
    "logEvent('tengu_file_read_reread'",
    "priorReadState.offset === undefined ? 'edit_write' : 'read'",
  ])
  const contents = compact(source('src/tools/FileReadTool/FileReadTool.ts'))
  assert.ok(
    contents.indexOf('const priorReadState = readFileState.get(fullFilePath)') <
      contents.indexOf("'tengu_read_dedup_killswitch'"),
    'reread attribution must run before dedup gating',
  )
})

test('recovers cold auto-compact nonessential stripping', () => {
  assertSource('src/services/compact/autoCompact.ts', [
    'const COLD_COMPACT_IDLE_MS = 5_400_000',
    'Date.now() - getLastInteractionTime() >= COLD_COMPACT_IDLE_MS',
    "getFeatureValue_CACHED_MAY_BE_STALE('tengu_cold_compact', false)",
    'recompactionInfo, stripNonEssential, compactingHintText',
  ])
  assertSource('src/services/compact/compact.ts', [
    'const COLD_COMPACT_FIELD_MAX_CHARS = 100',
    'finalCodeUnit >= 0xd800 && finalCodeUnit <= 0xdbff',
    '…[truncated, original ${value.length} chars]',
    "block.type === 'thinking' || block.type === 'redacted_thinking'",
    "block.type !== 'thinking' && block.type !== 'redacted_thinking'",
    'const input = truncateColdCompactValue(block.input)',
    "item.type === 'text' ? item.text : ''",
    "message.type !== 'attachment' || message.attachment.type === 'queued_command'",
    'stripNonEssential: boolean = false',
    "!stripNonEssential && getFeatureValue_CACHED_MAY_BE_STALE('tengu_compact_cache_prefix', true)",
    'stripNonEssential,',
    'stripNonEssential ? [] : context.options.tools',
    'filterColdCompactAttachments(sourceMessages)',
    'stripNonEssentialCompactContent(mediaStripped)',
  ])
})

test('recovers Bash allowlist-decision telemetry', () => {
  assertSource('src/utils/permissions/permissions.ts', [
    'getFeatureValue_CACHED_MAY_BE_STALE, getFeatureValue_CACHED_WITH_REFRESH,',
    "logEvent('tengu_auto_mode_decision'",
    "stripAllBashFlag: getFeatureValue_CACHED_MAY_BE_STALE( 'tengu_bash_allowlist_strip_all', false, )",
  ])
  assert.equal(
    occurrences(
      source('src/utils/permissions/permissions.ts'),
      'stripAllBashFlag:',
    ),
    1,
  )
})
