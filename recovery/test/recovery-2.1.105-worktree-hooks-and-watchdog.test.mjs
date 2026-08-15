import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const BASELINE_BUNDLE_SHA256 =
  'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39'
const TARGET_BUNDLE_SHA256 =
  '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75'

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
}

function requiredBundle(filename, label, expectedSha256) {
  assert.ok(filename, `${label} environment variable must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    expectedSha256,
  )
  return bytes.toString('utf8')
}

test('recovers EnterWorktree path entry and removal safety', () => {
  const enter = source('tools/EnterWorktreeTool/EnterWorktreeTool.ts')
  const prompt = source('tools/EnterWorktreeTool/prompt.ts')
  const worktree = source('utils/worktree.ts')
  const exit = source('tools/ExitWorktreeTool/ExitWorktreeTool.ts')
  const exitDialog = source('components/WorktreeExitDialog.tsx')
  const transcript = source('utils/sessionStorage.ts')

  assert.match(enter, /path: z[\s\S]*Must appear in `git worktree list`/)
  assert.match(
    enter,
    /refine\(input => !\(input\.name && input\.path\)[\s\S]*Provide at most one/,
  )
  assert.match(enter, /enterExistingWorktreeForSession/)
  assert.match(enter, /tengu_worktree_entered_existing/)
  assert.match(prompt, /## Entering an existing worktree/)

  assert.match(worktree, /export async function listRegisteredWorktrees/)
  assert.match(worktree, /worktree', 'list', '--porcelain'/)
  assert.match(worktree, /await realpath\(resolve\(originalCwd, requestedPath\)\)/)
  assert.match(worktree, /enteredExisting: true/)
  assert.match(
    worktree,
    /if \(currentWorktreeSession\.enteredExisting\)[\s\S]*setCurrentWorktreeSession\(null\)[\s\S]*return/,
  )
  assert.match(
    exit,
    /input\.action === 'remove' && session\.enteredExisting/,
  )
  assert.match(exit, /errorCode: 4/)
  assert.match(
    exitDialog,
    /worktreeSession\?\.enteredExisting[\s\S]*await keepWorktree\(\)/,
  )
  assert.match(exitDialog, /worktree at \$\{worktreeSession\.worktreePath\} left in place/)
  assert.match(transcript, /enteredExisting: worktreeSession\.enteredExisting/)
})

test('recovers blocking PreCompact hook propagation', () => {
  const hooks = source('utils/hooks.ts')
  const compact = source('services/compact/compact.ts')
  const autoCompact = source('services/compact/autoCompact.ts')
  const compactCommand = source('commands/compact/compact.ts')
  const teammate = source('utils/swarm/inProcessRunner.ts')

  assert.match(
    hooks,
    /result\.succeeded && !result\.blocked && result\.output\.trim\(\)\.length > 0/,
  )
  assert.match(hooks, /const blocked = results\.filter\(result => result\.blocked\)/)
  assert.match(hooks, /return `\[\$\{result\.command\}\]\$\{output \? `: \$\{output\}` : ''\}`/)
  assert.match(compact, /Compaction blocked by PreCompact hook/)
  assert.match(compact, /key: 'compaction-blocked-by-hook'/)
  assert.match(compact, /color: 'warning'/)
  assert.match(
    compact,
    /throwIfPreCompactBlocked\(hookResult, context, \{[\s\S]*suppressNotification: isAutoCompact/,
  )
  assert.match(compactCommand, /throwIfPreCompactBlocked\(hookResult, context\)/)
  assert.match(
    autoCompact,
    /message\.startsWith\(ERROR_MESSAGE_COMPACTION_BLOCKED\)[\s\S]*wasCompacted: false/,
  )
  assert.match(teammate, /compaction blocked by PreCompact hook; continuing uncompacted/)
})

test('defaults the byte watchdog on at five minutes', () => {
  const client = source('services/api/client.ts')

  assert.match(client, /isEnvDefinedFalsy\(process\.env\.CLAUDE_ENABLE_BYTE_WATCHDOG\)/)
  assert.match(client, /isEnvTruthy\(process\.env\.CLAUDE_ENABLE_BYTE_WATCHDOG\)/)
  assert.match(client, /tengu_stream_watchdog_default_on/)
  assert.match(
    client,
    /response\.headers\.get\('content-type'\)\?\.includes\('text\/event-stream'\) &&[\s\S]*isByteWatchdogEnabled\(\)/,
  )
  assert.match(client, /Math\.max\([\s\S]*300000/)
})

test('strips non-content HTML elements before WebFetch conversion', () => {
  const webFetch = source('tools/WebFetchTool/utils.ts')

  assert.match(
    webFetch,
    /service\.remove\(\['style', 'script', 'noscript', 'iframe'\]\)/,
  )
  assert.match(webFetch, /return service/)
})

test('counts FileWrite truncation by visual terminal rows', () => {
  const ui = source('tools/FileWriteTool/UI.tsx')
  const tool = source('Tool.ts')
  const messages = source('components/Messages.tsx')

  assert.match(ui, /measureText from '\.\.\/\.\.\/ink\/measure-text\.js'/)
  assert.match(ui, /export function countVisualLines/)
  assert.match(ui, /Math\.max\(1, columns - 12\)/)
  assert.match(
    ui,
    /countVisualLines\(contentWithFallback, width\) - MAX_LINES_TO_RENDER/,
  )
  assert.match(ui, /overflowY=\{verbose \? undefined : "hidden"\}/)
  assert.match(ui, /maxHeight=\{verbose \? undefined : MAX_LINES_TO_RENDER\}/)
  assert.match(
    ui,
    /countVisualLines\(content, Math\.max\(1, columns - 12\)\) > MAX_LINES_TO_RENDER/,
  )
  assert.match(tool, /context: \{ columns: number \}/)
  assert.match(messages, /const columnsRef = useRef\(columns\)/)
  assert.match(messages, /columns: columnsRef\.current/)
})

test('surfaces connection retry errors and validates keybindings deeply', () => {
  const errors = source('services/api/errorUtils.ts')
  const errorUI = source('components/messages/SystemAPIErrorMessage.tsx')
  const keybindings = source('keybindings/loadUserBindings.ts')
  const loop = source('skills/bundled/loop.ts')
  const skillPrompt = source('tools/SkillTool/prompt.ts')

  for (const code of [
    'ECONNREFUSED',
    'ConnectionRefused',
    'ENOTFOUND',
    'ENETUNREACH',
    'ENETDOWN',
    'EHOSTUNREACH',
    'EHOSTDOWN',
    'EAI_AGAIN',
    'FailedToOpenSocket',
  ]) {
    assert.match(errors, new RegExp(`'${code}'`))
  }
  assert.match(errors, /export function isNetworkConnectionError/)
  if (errorUI.includes('const hidden =')) {
    assert.match(
      errorUI,
      /retryAttempt < 4 && !isNetworkConnectionError\(error\)/,
    )
  } else {
    assert.match(
      errorUI,
      /retryAttempt < maxRetries && !isNetworkConnectionError\(error\)/,
    )
    assert.match(errorUI, /extractConnectionErrorDetails\(error\)\?\.isSSLError/)
    assert.match(errorUI, /!rateLimitInfo/)
  }
  assert.match(
    keybindings,
    /return KeybindingBlockSchema\(\)\.safeParse\(obj\)\.success/,
  )
  assert.match(
    keybindings,
    /object mapping keys to a string action or null/,
  )
  assert.match(loop, /name: 'loop',[\s\S]*aliases: \['proactive'\]/)
  assert.match(skillPrompt, /MAX_LISTING_DESC_CHARS = 1_536/)
})

test('keeps fired one-shot cron tasks inert while disk cleanup settles', () => {
  const scheduler = source('utils/cronScheduler.ts')
  assert.match(
    scheduler,
    /inFlight\.add\(t\.id\)\s+nextFireAt\.set\(t\.id, Infinity\)\s+void removeCronTasks/,
  )
  assert.doesNotMatch(
    scheduler,
    /\.finally\(\(\) => inFlight\.delete\(t\.id\)\)\s+nextFireAt\.delete\(t\.id\)/,
  )
})

test('fails pending stdio MCP requests fast after transport errors', () => {
  const client = source('services/mcp/client.ts')
  assert.match(
    client,
    /if \(transportType === 'stdio'\) \{[\s\S]*closeTransportAndRejectPending\([\s\S]*`stdio transport error: \$\{error\.name \|\| 'Error'\}`[\s\S]*originalOnerror\(error\)[\s\S]*return/,
  )
})

test('does not suggest a plan-mode permission downgrade', () => {
  const paths = source('tools/BashTool/pathValidation.ts')
  assert.match(
    paths,
    /const hadHigherPrePlanMode =[\s\S]*context\.mode === 'plan'[\s\S]*'auto', 'bypassPermissions', 'acceptEdits', 'dontAsk'/,
  )
  assert.match(
    paths,
    /\(operationType === 'write' \|\| operationType === 'create'\) &&[\s\S]*!hadHigherPrePlanMode/,
  )
})

test('authenticated adjacent bundles contain every localized target sentinel', () => {
  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_104_BUNDLE',
    BASELINE_BUNDLE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_105_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )

  const targetOnly = [
    'tengu_stream_watchdog_default_on',
    'CLAUDE_ENABLE_BYTE_WATCHDOG',
    'Provide at most one of `name` or `path`, not both.',
    'tengu_worktree_entered_existing',
    'Cannot enter an existing worktree: the current directory is not in a git repository.',
    'Compaction blocked by PreCompact hook',
    'compaction-blocked-by-hook',
    'style","script","noscript","iframe',
    'Cleaning up worktree (no pending changes)…',
    'name:"loop",aliases:["proactive"]',
    'FailedToOpenSocket',
    'object mapping keys to a string action or null',
    'stdio transport error:',
  ]
  for (const fragment of targetOnly) {
    assert.equal(baseline.includes(fragment), false, fragment)
    assert.equal(target.includes(fragment), true, fragment)
  }
})
