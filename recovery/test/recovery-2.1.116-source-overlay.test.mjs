import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const overlayPath = fileURLToPath(
  new URL(
    '../cases/2.1.114-to-2.1.116/recovered/source-facing-overlay.patch',
    import.meta.url,
  ),
)
const overlay = fs.readFileSync(overlayPath, 'utf8')

function section(path) {
  const marker = `diff --git a/${path} b/${path}`
  const start = overlay.indexOf(marker)
  assert.notEqual(start, -1, `missing overlay path ${path}`)
  const next = overlay.indexOf('\ndiff --git ', start + marker.length)
  return overlay.slice(start, next === -1 ? undefined : next)
}

function added(path) {
  return section(path)
    .split('\n')
    // Reconstruct the target side of each hunk: additions plus unchanged
    // context, never removed lines or patch metadata.
    .filter(
      line =>
        (line.startsWith('+') && !line.startsWith('+++')) ||
        line.startsWith(' '),
    )
    .map(line => line.slice(1))
    .join('\n')
}

function compact(value) {
  return value.replaceAll(/\s+/g, ' ').trim()
}

function includesAdded(path, fragments) {
  const contents = compact(added(path))
  for (const fragment of fragments) {
    assert.equal(
      contents.includes(compact(fragment)),
      true,
      `${path}: ${fragment}`,
    )
  }
}

test('source-facing overlay is stable and matches exactly one indexed tree orientation', () => {
  assert.equal(
    crypto.createHash('sha256').update(overlay).digest('hex'),
    '01487cd46ad03070321671860afdfacc445c3de21f7bef50f56d1e221c7405b1',
  )
  assert.equal(Buffer.byteLength(overlay), 962_068)
  // The shared working tree is intentionally a cumulative semantic overlay;
  // test the checked-in target snapshot rather than unrelated unstaged source
  // recovery from other release boundaries.
  const forward = spawnSync('git', ['apply', '--check', '--cached', overlayPath], {
    cwd: repo,
    encoding: 'utf8',
  })
  const reverse = spawnSync(
    'git',
    ['apply', '--reverse', '--check', '--cached', overlayPath],
    { cwd: repo, encoding: 'utf8' },
  )
  assert.notEqual(
    forward.status === 0,
    reverse.status === 0,
    `expected exactly one applicable orientation\nforward: ${forward.stderr}\nreverse: ${reverse.stderr}`,
  )
  assert.equal((overlay.match(/^diff --git /gm) ?? []).length, 56)
})

test('recovers deferred MCP templates, completion, and state bookkeeping', () => {
  includesAdded('src/services/mcp/client.ts', [
    'fetchResourceTemplatesForClient',
    "method: 'resources/templates/list'",
    'tengu_mcp_resource_templates_fetched',
    'fetchResourceTemplatesForClient.cache.delete(client.name)',
    'fetchMissingResourceTemplates',
    "type: 'ref/resource'",
  ])
  includesAdded('src/services/mcp/types.ts', ['resourceTemplates: Record<string, ServerResourceTemplate[]>'])
  includesAdded('src/state/AppStateStore.ts', ['resourceTemplates: {}'])
  includesAdded('src/services/mcp/useManageMCPConnections.ts', [
    'resourceTemplates: updatedResourceTemplates',
    'fetchResourceTemplatesForClient(client)',
    'omit(mcp.resourceTemplates, client.name)',
  ])
  includesAdded('src/hooks/unifiedSuggestions.ts', [
    "type: 'mcp_resource_template'",
    'parseUriTemplate',
    'findBestUriTemplateMatch',
    'generateMcpResourceTemplateCompletions',
    'suggestions.length > 0 ? suggestions : null',
  ])
  includesAdded('src/hooks/useTypeahead.tsx', [
    'fetchMissingResourceTemplates',
    'fetchDeferredResourceTemplates()',
    'mcpResourceTemplates',
  ])
})

test('recovers explicit cache TTL threading and auto-mode callers', () => {
  includesAdded('src/services/api/claude.ts', [
    "ttl?: '1h'",
    'const cacheTtl = should1hCacheTTL(options.querySource)',
    'getCacheControl({ ttl: cacheTtl })',
    'addCacheBreakpoints( messagesForAPI, enablePromptCaching, cacheTtl',
  ])
  includesAdded('src/utils/permissions/yoloClassifier.ts', [
    'getAutoModeCacheTtl',
    "should1hCacheTTL('auto_mode') ? '1h' : undefined",
    'getCacheControl({ ttl: getAutoModeCacheTtl() })',
  ])
})

test('recovers terminal rendering, keyboard, scrollback, and suspend fixes', () => {
  includesAdded('src/ink/output.ts', [
    'offsetX + charWidth > screenWidth',
    'for (let i = 2; i < charWidth; i++)',
    'width: CellWidth.SpacerTail',
    'offsetX += isWideCharacter ? charWidth : 1',
  ])
  includesAdded('src/ink/clearTerminal.ts', [
    'getClearTerminalSequence(includeScrollback = false)',
    "includeScrollback ? ERASE_SCROLLBACK : ''",
  ])
  includesAdded('src/ink/terminal.ts', [
    'getClearTerminalSequence(!patch.altScreen)',
  ])
  includesAdded('src/ink/ink.tsx', [
    'get hasUnmounted(): boolean',
    'cols !== this.terminalColumns || rows !== this.terminalRows',
    'this.handleResize()',
    'supportsExtendedKeys()',
  ])
  includesAdded('src/ink/reconciler.ts', [
    "newProps['autoFocus'] === true",
    'getFocusManager(node).handleAutoFocus(node)',
  ])
  includesAdded('src/ink/log-update.ts', [
    'previousVisibleStart',
    'renderFrameSlice',
  ])
  includesAdded('src/keybindings/defaultBindings.ts', ['ctrl+-', 'ctrl+shift+_'])
  includesAdded('src/hooks/useTextInput.ts', [
    'key.leftArrow && key.super',
    'cursor.startOfLine()',
    'key.rightArrow && key.super',
    'cursor.endOfLine()',
  ])
  includesAdded('src/ink/components/App.tsx', [
    "process.kill(0, 'SIGTSTP')",
  ])
  includesAdded('src/commands/terminalSetup/terminalSetup.tsx', [
    'For smoother scrolling',
    "settings.json isn't a JSON object; not modifying it",
    "Couldn't back up",
  ])
})

test('recovers command and settings UI behavior', () => {
  includesAdded('src/commands/doctor/index.ts', ['immediate: true'])
  includesAdded('src/components/Settings/Config.tsx', [
    "setting.type === 'enum'",
    'setting.options.some(option => option.toLowerCase().includes(lowerQuery))',
  ])
  includesAdded('src/components/LogSelector.tsx', [
    'useModalOrTerminalSize',
    '<Pane color="suggestion">',
    'Math.max(30, usableColumns - 4)',
    'columns={usableColumns - 2}',
  ])
  includesAdded('src/hooks/useTypeahead.tsx', ['suggestionsEmptyMessage?: string'])
  includesAdded('src/components/PromptInput/PromptInputFooterSuggestions.tsx', [
    'emptyMessage?: string',
    'return emptyMessage ? <Text dimColor>{emptyMessage}</Text> : null',
  ])
  includesAdded('src/components/Spinner/SpinnerAnimationRow.tsx', [
    "return 'still thinking'",
    "return 'almost done thinking'",
  ])
  assert.match(section('src/components/ThinkingIndicator.tsx'), /deleted file mode/)
})

test('recovers Usage fallback and local contributor analysis', () => {
  includesAdded('src/components/Settings/Usage.tsx', [
    'getCachedUtilization',
    'limit.utilization * 100',
    'new Date(limit.resets_at * 1000).toISOString()',
    'setUtilization(previous => previous ?? cached)',
    'isActive: (!!error || !!refreshError) && !isLoading',
    '<UsageContributors maxWidth={maxWidth} />',
  ])
  includesAdded('src/components/Settings/UsageContributors.tsx', [
    'MAX_FILE_BYTES = 200 * 1024 * 1024',
    'let end = content.indexOf',
    'position = end + 1',
    'CACHE_READ_TOKENS_RE',
    'cache_miss',
    'high_parallel',
    "What's contributing to your limits usage?",
  ])
})

test('recovers plugin dependency resolution and categorized Installed rows', () => {
  includesAdded('src/utils/plugins/missingDependencyResolver.ts', [
    "error.type !== 'dependency-unsatisfied'",
    "error.reason !== 'not-found'",
    'allowCrossMarketplaceDependenciesOn',
    'stillUnresolved',
    'result.closure',
  ])
  includesAdded('src/utils/plugins/pluginAutoupdate.ts', [
    'Math.random() * MAX_MARKETPLACE_REFRESH_JITTER_MS',
    'resolveMissingDependencies',
    "clearAllCaches('autoupdate dep-resolution')",
  ])
  includesAdded('src/commands/reload-plugins/reload-plugins.ts', [
    'resolvedDependencies.length > 0',
  ])
  includesAdded('src/commands/plugin/ManagePlugins.tsx', [
    "kind: 'section-header'",
    "kind: 'scope-header'",
    'const seenIds = new Set<string>()',
    'beforeFavoriteRef',
    'Math.max(8, availableRows - 10)',
    'findSelectableRow',
  ])
})

test('recovers main-thread --agent hook lifecycle and watcher plumbing', () => {
  includesAdded('src/bootstrap/state.ts', [
    'mainThreadAgentHooks',
    'setMainThreadAgentHooks',
  ])
  includesAdded('src/utils/sessionRestore.ts', [
    'applyMainThreadAgentHooks',
    "isRestrictedToPluginOnly('hooks')",
    'isSourceAdminTrusted(agentDefinition.source)',
  ])
  includesAdded('src/utils/hooks.ts', [
    'getMainThreadAgentHooks()',
    'mainThreadAgentHooks',
    'getSessionEndHookTimeoutMs',
  ])
  includesAdded('src/utils/hooks/fileChangedWatcher.ts', [
    'getMainThreadAgentHooks()',
    'CwdChanged',
    'FileChanged',
  ])
  includesAdded('src/main.tsx', ['applyMainThreadAgentHooks(mainThreadAgentDefinition)'])
  includesAdded('src/cli/print.ts', ['applyMainThreadAgentHooks(mainThreadAgent)'])
})

test('recovers branching, relaunch, resume error, and large-session scanning', () => {
  includesAdded('src/commands/branch/branch.ts', [
    'createReadStream',
    'createWriteStream',
    "mode: 0o600",
    "await once(input, 'open')",
    'await once(output,',
    'await finished(output)',
    'extraMessages',
  ])
  includesAdded('src/utils/relaunch.ts', [
    'getRelaunchCwd',
    'freshIfNoTranscript',
    'cwd: getRelaunchCwd()',
    'options.args',
  ])
  includesAdded('src/commands/update/update.ts', [
    'getProjectDir(getRelaunchCwd())',
    'freshIfNoTranscript: true',
    'different project directory',
  ])
  includesAdded('src/utils/sessionStorage.ts', [
    'TRANSCRIPT_SCAN_CHUNK_SIZE = 1024 * 1024',
    'function scanLargeTranscript',
    'selectedOffsets',
    'jsonParse(buf.toString',
    'logError(error)',
  ])
  const sessionStorage = fs.readFileSync(
    fileURLToPath(
      new URL('../../src/utils/sessionStorage.ts', import.meta.url),
    ),
    'utf8',
  )
  assert.match(sessionStorage, /export const INDEX_HEAD_SCAN_BYTES = 256/)
  assert.match(
    sessionStorage,
    /export const INDEX_BOUNDARY_SCAN_BYTES = 4096/,
  )
})

test('recovers GitHub hints and dangerous-path safety classification', () => {
  includesAdded('src/tools/shared/gitOperationTracking.ts', [
    'GH_RATE_LIMIT_HINT_COOLDOWN_MS',
    'getGhRateLimitHint',
    'GitHub API rate limit exceeded',
  ])
  includesAdded('src/tools/BashTool/BashTool.tsx', ['ghRateLimitHint'])
  includesAdded('src/tools/BashTool/pathValidation.ts', [
    "type: 'safetyCheck'",
    'classifierApprovable: false',
  ])
})
