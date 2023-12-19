import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const specs = [
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

function bundle([env, bytes, sha]) {
  const filename = process.env[env]
  assert.ok(filename, `${env} must be set`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, bytes)
  assert.equal(crypto.createHash('sha256').update(value).digest('hex'), sha)
  return value.toString('utf8')
}

function read(relative) {
  return fs.readFileSync(path.join(repo, relative), 'utf8')
}

test('authenticated bundles contain the inherited active dream, persisted-hook, and defer contracts', () => {
  const [baseline, target] = specs.map(bundle)
  const witnesses = new Map([
    ['tengu_auto_dream_skipped', 2],
    ['daily_logs_found', 1],
    ['files_touched_count', 1],
    ['tengu_hook_output_persisted', 2],
    ['persist-to-disk failed', 1],
    ['hook_deferred_tool', 9],
    ['tengu_pre_tool_hook_deferred', 1],
    ['tool_deferred_unavailable', 1],
    ['Deferred tool resume: permissionMode mismatch', 1],
    ['defer is print-mode only', 1],
    ['defer is solo-only', 1],
    ['deferred_tool_use', 4],
  ])
  for (const [fragment, expected] of witnesses) {
    assert.equal(
      baseline.split(fragment).length - 1,
      expected,
      `baseline ${fragment}`,
    )
    assert.equal(
      target.split(fragment).length - 1,
      expected,
      `target ${fragment}`,
    )
  }
})

test('source preserves exact autoDream completion telemetry and fork-only rollback', () => {
  const source = read('src/services/autoDream/autoDream.ts')
  assert.match(source, /reason: 'sessions',[\s\S]*?session_count:[\s\S]*?min_required:/)
  assert.match(source, /tengu_auto_dream_skipped'[\s\S]*?reason: 'lock'/)
  assert.match(source, /team_memory_enabled: teamMemoryEnabled/)
  assert.match(source, /readdir\(join\(memoryRoot, 'logs'\), \{[\s\S]*?recursive: true/)
  assert.match(source, /daily_logs_found: dailyLogsFound/)
  assert.match(source, /files_touched_count: filesTouchedCount/)
  assert.match(source, /phase: 'fork' \| 'completion'/)
  assert.match(source, /phase = 'completion'[\s\S]*?completeDreamTask/)
  assert.match(source, /error_class: toError\(e\)\.name/)
  assert.match(
    source,
    /if \(phase === 'fork'\) \{[\s\S]*?failDreamTask[\s\S]*?rollbackConsolidationLock/,
  )
})

test('source persists oversized hook injections and implements fail-closed deferred resume', () => {
  const hooks = read('src/utils/hooks.ts')
  assert.match(hooks, /HOOK_OUTPUT_PERSIST_THRESHOLD_CHARS = 10_000/)
  assert.match(hooks, /persistToolResult\(content, `hook-\$\{hookId\}-\$\{source\}`\)/)
  assert.match(hooks, /\[Hook \$\{source\} truncated at \$\{limit\} chars — persist-to-disk failed:/)
  for (const source of ['stdout', 'systemMessage', 'additionalContext', 'initialUserMessage']) {
    assert.ok(hooks.includes(`'${source}'`), source)
  }
  assert.match(hooks, /deny > defer > ask > allow/)

  assert.match(read('src/types/hooks.ts'), /z\.literal\('defer'\)/)
  assert.match(read('src/entrypoints/sdk/coreSchemas.ts'), /deferred_tool_use: SDKDeferredToolUseSchema\(\)\.optional\(\)/)

  const execution = read('src/services/tools/toolExecution.ts')
  assert.match(execution, /permissionDecision=defer in interactive mode/)
  assert.match(execution, /defer is solo-only — siblings would be orphaned on resume/)
  assert.match(execution, /tengu_pre_tool_hook_deferred/)
  assert.match(execution, /type: 'hook_deferred_tool'/)

  const storage = read('src/utils/sessionStorage.ts')
  assert.match(storage, /tailFile\([\s\S]*?1024 \* 1024/)
  assert.match(storage, /const resultNeedle = `"tool_use_id":"\$\{found\.toolUseID\}"`/)

  const recovery = read('src/utils/conversationRecovery.ts')
  assert.match(recovery, /findLastDeferredToolUse\(transcriptPath\)/)
  assert.match(recovery, /new Set\(\[deferredToolUse\.toolUseID\]\)/)
  assert.match(recovery, /preservedUnresolvedIds\?\.size/)

  const helpers = read('src/utils/queryHelpers.ts')
  assert.match(helpers, /export async function\* handleDeferredToolResume/)
  assert.match(helpers, /--resume does not restore permissionMode — pass --permission-mode/)
  assert.match(helpers, /through PreToolUse/)

  const engine = read('src/QueryEngine.ts')
  assert.match(engine, /hasHandledDeferredToolResume/)
  assert.match(engine, /stop_reason: 'tool_deferred_unavailable'/)
  assert.match(engine, /stop_reason: 'tool_deferred'/)
  assert.match(engine, /deferred_tool_use:/)

  const print = read('src/cli/print.ts')
  assert.match(print, /deferredToolUse: result\.deferredToolUse/)
  assert.match(print, /deferredToolUse,\s*setSDKStatus:/)
  assert.match(print, /deferredToolUse = undefined/)
})
