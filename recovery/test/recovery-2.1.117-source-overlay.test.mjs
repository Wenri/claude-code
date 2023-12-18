import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const defaultRepo = fileURLToPath(new URL('../..', import.meta.url))
const repo = process.env.RECOVERY_REPO_ROOT ?? defaultRepo
const overlayPath =
  process.env.CLAUDE_CODE_2_1_117_OVERLAY ??
  path.join(
    defaultRepo,
    'recovery/cases/2.1.116-to-2.1.117/recovered/source-facing-overlay.patch',
  )
const overlay = fs.readFileSync(overlayPath, 'utf8')

function section(sourcePath) {
  const marker = `diff --git a/${sourcePath} b/${sourcePath}`
  const start = overlay.indexOf(marker)
  assert.notEqual(start, -1, `missing overlay path ${sourcePath}`)
  const next = overlay.indexOf('\ndiff --git ', start + marker.length)
  return overlay.slice(start, next === -1 ? undefined : next)
}

function targetSide(sourcePath) {
  return section(sourcePath)
    .split('\n')
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

function includesTarget(sourcePath, fragments) {
  const contents = compact(targetSide(sourcePath))
  for (const fragment of fragments) {
    assert.equal(
      contents.includes(compact(fragment)),
      true,
      `${sourcePath}: ${fragment}`,
    )
  }
}

test('source-facing overlay is stable, full-index, and reversible in exactly one orientation', () => {
  assert.equal(
    crypto.createHash('sha256').update(overlay).digest('hex'),
    'd2063694679f1a1e02d41c84bb375da029263e1feff9c1e457d66df979e21773',
  )
  assert.equal(Buffer.byteLength(overlay), 637_321)
  assert.equal((overlay.match(/^diff --git /gm) ?? []).length, 123)
  assert.equal((overlay.match(/^index [0-9a-f]{40}\.\.[0-9a-f]{40}/gm) ?? []).length > 0, true)

  const forward = spawnSync('git', ['apply', '--check', overlayPath], {
    cwd: repo,
    encoding: 'utf8',
  })
  const reverse = spawnSync(
    'git',
    ['apply', '--reverse', '--check', overlayPath],
    { cwd: repo, encoding: 'utf8' },
  )
  assert.notEqual(
    forward.status === 0,
    reverse.status === 0,
    `expected exactly one applicable orientation\nforward: ${forward.stderr}\nreverse: ${reverse.stderr}`,
  )
})

test('recovers authenticated filesystem and command-injection hardening', () => {
  includesTarget('src/utils/permissions/pathValidation.ts', [
    "Path contains '..' traversal after a directory segment, which may follow a symlink outside the working directory",
  ])
  includesTarget('src/utils/plugins/pluginLoader.ts', [
    'copyDir: skipping broken symlink',
    'copyDir: skipping symlink escaping source tree:',
    'Invalid sha "${sha}": cannot start with "-"',
  ])
  includesTarget('src/utils/nativeInstaller/installer.ts', [
    '/^[a-zA-Z0-9._+-]+$/',
    "flag: 'wx'",
    'contains path-unsafe characters',
  ])
  includesTarget('src/utils/plugins/marketplaceManager.ts', [
    'refs cannot start with "-"',
  ])
  includesTarget('src/tools/BashTool/pathValidation.ts', [
    'cd with two or more directory arguments requires manual approval.',
    "bashMissKind: 'cd-multi-positional'",
  ])
})

test('recovers remote control, remote UI, and existing-session attach flows', () => {
  includesTarget('src/remote/SessionsWebSocket.ts', [
    'sendControlRequest',
    'return requestId',
  ])
  includesTarget('src/remote/RemoteSessionManager.ts', [
    'pendingControlRequests',
    '[RemoteSessionManager] Cannot send: not connected',
    '[RemoteSessionManager] Disconnected',
  ])
  includesTarget('src/components/PromptInput/PromptInput.tsx', [
    'remote-inference-config-unavailable',
    'set_max_thinking_tokens',
    'Deeper reasoning requested for this turn',
  ])
  includesTarget('src/screens/REPL.tsx', [
    'remote-rewind-unavailable',
    'setActiveRemoteControlTransport',
  ])
  includesTarget('src/commands/context/context.tsx', [
    "subtype: 'get_context_usage'",
    'isRemote />',
  ])
  includesTarget('src/hooks/fileSuggestions.ts', [
    "subtype: 'file_suggestions'",
    '[FileIndex] remote file_suggestions RPC failed:',
  ])
  includesTarget('src/main.tsx', [
    'tengu_remote_attach_session_rejected',
    'is archived and cannot accept new messages.',
    'Attached to remote session',
  ])
})

test('recovers OAuth refresh, model deprecation, autocompact, and scheduled-task ownership', () => {
  includesTarget('src/cli/structuredIO.ts', ['requestOAuthTokenRefresh'])
  includesTarget('src/utils/auth.ts', [
    'getSdkOAuthTokenRefreshCallback',
    'tengu_oauth_401_sdk_callback_refreshed',
    'SDK getOAuthToken callback returned null (no token available)',
    'SDK getOAuthToken callback returned the same expired token; treating as no refresh',
  ])
  includesTarget('src/services/api/withRetry.ts', [
    'MAX_OAUTH_REFRESH_FAILURES = 2',
    'getSdkOAuthTokenRefreshCallback() !== null',
    'await options.onError?.(error)',
  ])
  includesTarget('src/cli/handlers/auth.ts', [
    'process.env.CLAUDE_CODE_OAUTH_TOKEN = tokens.accessToken',
    'setOauthTokenFromFd(tokens.accessToken)',
  ])
  includesTarget('src/utils/model/deprecation.ts', [
    "'claude-opus-4-1'",
    "remappedTo: 'the latest Opus'",
    'has been updated to ${info.remappedTo}.',
  ])
  includesTarget('src/services/compact/autoCompact.ts', [
    'tengu_amber_redwood2',
    'compacted at the auto window',
  ])
  includesTarget('src/utils/cronTasks.ts', [
    'createdBySessionId',
    'createdByPid',
  ])
  includesTarget('src/utils/cronScheduler.ts', [
    'isProcessRunning(task.createdByPid)',
    'failed to refresh task pids',
  ])
})

test('recovers routines, ultrareview, agent MCP display, and terminal parsing', () => {
  includesTarget('src/skills/bundled/scheduleRemoteAgents.ts', [
    'run_once_at',
    '/code/routines',
    'run_once_fired',
    'Connected connectors (available for routines):',
  ])
  includesTarget('src/constants/prompts.ts', [
    'If the user asks about "ultrareview"',
    'you cannot launch it yourself',
  ])
  includesTarget('src/commands/review/reviewRemote.ts', [
    'Ultrareview could not start the remote session:',
    'needs-confirm',
    'taskId',
  ])
  includesTarget('src/components/mcp/MCPListPanel.tsx', [
    "'enterprise', 'agent'",
    'Active agent MCPs',
    'activeAgentServerNames',
  ])
  includesTarget('src/services/mcp/utils.ts', [
    'agent frontmatter',
    'Agent config (from agent frontmatter)',
  ])
  includesTarget('src/types/command.ts', [
    "thinClientDispatch?: 'post-text' | 'control-request'",
    'requires?:',
    'workspace?: boolean',
    'ink?: boolean',
  ])
  includesTarget('src/commands.ts', [
    'requires: { workspace: true }',
    "cmd.type === 'prompt' && supportsThinClient(cmd)",
    'command.thinClientDispatch !== undefined',
    'workspace: true, ink: true',
  ])
  includesTarget('src/commands/statusline.tsx', [
    'requires: { workspace: true }',
  ])
  includesTarget('src/commands/btw/index.ts', [
    "thinClientDispatch: 'control-request'",
  ])
  includesTarget('src/commands/clear/index.ts', [
    'supportsNonInteractive: true',
    "thinClientDispatch: 'post-text'",
  ])
  includesTarget('src/commands/compact/index.ts', [
    "thinClientDispatch: 'post-text'",
  ])
  includesTarget('src/commands/context/index.ts', [
    "thinClientDispatch: 'control-request'",
  ])
  includesTarget('src/commands/cost/index.ts', [
    "thinClientDispatch: 'post-text'",
  ])
  includesTarget('src/commands/version.ts', [
    "thinClientDispatch: 'post-text'",
  ])
  for (const sourcePath of [
    'src/commands/color/index.ts',
    'src/commands/copy/index.ts',
    'src/commands/doctor/index.ts',
    'src/commands/exit/index.ts',
    'src/commands/export/index.ts',
    'src/commands/extra-usage/index.ts',
    'src/commands/feedback/index.ts',
    'src/commands/focus.ts',
    'src/commands/help/index.ts',
    'src/commands/mobile/index.ts',
    'src/commands/passes/index.ts',
    'src/commands/privacy-settings/index.ts',
    'src/commands/release-notes/index.ts',
    'src/commands/rename/index.ts',
    'src/commands/session/index.ts',
    'src/commands/stats/index.ts',
    'src/commands/terminalSetup/index.ts',
    'src/commands/theme/index.ts',
    'src/commands/usage/index.ts',
  ]) {
    includesTarget(sourcePath, ['requires: { ink: true }'])
  }
  includesTarget('src/commands/color/index.ts', [
    "[...AGENT_COLORS, 'default'].join('|')",
  ])
  includesTarget('src/commands/stickers/index.ts', ['requires: {}'])
  assert.match(section('src/commands.ts'), /-\s+autocompactNonInteractive,/)
  assert.match(section('src/commands.ts'), /-import files from/)
  assert.match(section('src/commands.ts'), /-\s+files,/)
  includesTarget('src/ink/termio/parser.ts', [
    "type: 'insertLines'",
    "type: 'deleteLines'",
    'actions.push({ type: \'bell\' })',
  ])
  includesTarget('src/ink/termio/esc.ts', [
    "type: 'index'",
    "type: 'reverseIndex'",
  ])
})
