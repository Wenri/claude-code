import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))

const bundles = [
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

test('authenticates inherited dynamic-loop behavior in both adjacent bundles', () => {
  const [baseline, target] = bundles.map(loadBundle)
  const witnesses = [
    ['tengu_kairos_loop_dynamic', 1],
    ['tengu_loop_dynamic_wakeup_scheduled', 1],
    ['tengu_loop_dynamic_wakeup_aged_out', 1],
    ['[loop/dynamic] cancelled ', 1],
    ['ScheduleWakeup', 5],
    ['<<autonomous-loop-dynamic>>', 2],
    ['<<autonomous-loop>>', 2],
    ['<<loop.md-dynamic>>', 1],
    ['<<loop.md>>', 1],
    ['Claude resuming /loop wakeup', 1],
    ['autonomousLoopDefault', 1],
    ['cacheLeadMs', 8],
    ["Don't pick 300s.", 1],
    [
      'Wakeup not scheduled. Either the /loop dynamic runtime gate is off',
      1,
    ],
    ['loop.md was truncated to ', 1],
    ['tengu_kairos_loop_prompt', 1],
  ]
  for (const [fragment, count] of witnesses) {
    assert.equal(occurrences(baseline, fragment), count, `baseline: ${fragment}`)
    assert.equal(occurrences(target, fragment), count, `target: ${fragment}`)
  }
})

test('recovers loop scheduling state, cache-aware timing, and runtime lifetime', () => {
  assertSource('src/bootstrap/state.ts', [
    'loopChainStartedAt: Object.create(null)',
    "kind?: 'loop'",
    'getLoopChainStartedAt(',
    'prompt: string, ): LoopChainState | undefined',
    'setLoopChainStartedAt(',
    'deleteLoopChainStartedAt(prompt: string)',
  ])
  assertSource('src/utils/cronTasks.ts', [
    'PROMPT_CACHE_TTL_MS = 5 * 60 * 1000',
    'recurringFrac: 0.5',
    'recurringCapMs: 30 * 60 * 1000',
    'cacheLeadMs: 15 * 1000',
    'EVERY_N_MINUTES_CRON.test(cron)',
    'interval - cfg.cacheLeadMs < PROMPT_CACHE_TTL_MS',
    'return fromMs + interval - cfg.cacheLeadMs',
  ])
  assertSource('src/utils/cronJitterConfig.ts', [
    'cacheLeadMs: z .number() .int() .min(0) .max(60 * 1000)',
  ])
  assertSource('src/utils/loopDynamic.ts', [
    "'tengu_kairos_loop_dynamic'",
    'MIN_LOOP_DELAY_SECONDS = 60',
    'MAX_LOOP_DELAY_SECONDS = 3600',
    'cancelPendingForPrompt(prompt)',
    'now > chain.lastScheduledFor + MAX_LOOP_DELAY_SECONDS * 1000',
    '(MAX_LOOP_DELAY_SECONDS - MIN_LOOP_DELAY_SECONDS) * 1000',
    "if (!chain?.agedOut) { setLoopChainStartedAt(prompt, {",
    "kind: 'loop'",
    "logEvent('tengu_loop_dynamic_wakeup_scheduled'",
    "logEvent('tengu_loop_dynamic_wakeup_aged_out'",
    'reason.slice(0, 200)',
    'clamped * 1000 <= PROMPT_CACHE_TTL_MS',
    'const createdAt = rawTargetMs < targetMs ? rawTargetMs : targetMs - 1',
    'Math.random() * 4_294_967_295',
    '[loop/dynamic] cancelled ${tasks.length} pending loop wakeup(s) on user abort',
  ])
})

test('recovers ScheduleWakeup registration, delivery, cancellation, and reset', () => {
  assertSource('src/tools/ScheduleWakeupTool/prompt.ts', [
    "SCHEDULE_WAKEUP_TOOL_NAME = 'ScheduleWakeup'",
    "AUTONOMOUS_LOOP_SENTINEL = '<<autonomous-loop>>'",
    "AUTONOMOUS_LOOP_DYNAMIC_SENTINEL = '<<autonomous-loop-dynamic>>'",
    "Don't pick 300s.",
  ])
  assertSource('src/tools/ScheduleWakeupTool/ScheduleWakeupTool.ts', [
    'shouldDefer: true',
    'Clamped to [60, 3600] by the runtime.',
    'loopDynamicModule?.scheduleLoopWakeup(',
    'scheduledFor: 0',
    'the loop has ended; do not re-issue.',
    'Next wakeup scheduled for ${time} (in ${remaining}s)${suffix}.',
  ])
  assertSource('src/tools.ts', [
    "feature('AGENT_TRIGGERS')",
    "require('./tools/ScheduleWakeupTool/ScheduleWakeupTool.js')",
    '...(ScheduleWakeupTool ? [ScheduleWakeupTool] : [])',
  ])
  assertSource('src/tools/ToolSearchTool/prompt.ts', [
    "require('../ScheduleWakeupTool/prompt.js')",
    'tool.name === SCHEDULE_WAKEUP_TOOL_NAME',
    'if (loopDynamic.isLoopDynamicEnabled()) return false',
  ])
  assertSource('src/hooks/useCancelRequest.ts', [
    'isExternalLoading = false',
    '(abortSignal !== undefined && !abortSignal.aborted) || isExternalLoading',
    'loopDynamicModule?.cancelAllPendingLoopSessionCrons()',
  ])
  assertSource('src/screens/REPL.tsx', [
    'abortSignal: abortController?.signal, isExternalLoading, popCommandFromQueue:',
  ])
  assertSource('src/hooks/useReplBridge.tsx', [
    'onInterrupt() { loopDynamicModule?.cancelAllPendingLoopSessionCrons(); abortControllerRef.current?.abort();',
  ])
  assertSource('src/hooks/useScheduledTasks.ts', [
    '!isKairosCronEnabled() || getIsRemoteMode()',
    'value: resolveLoopDefaultFire(prompt)',
    "task.kind === 'loop'",
    'Claude resuming /loop wakeup',
  ])
  assertSource('src/cli/print.ts', [
    'loopDefaultModule?.resolveLoopDefaultFire(prompt) ?? prompt',
  ])
  assertSource('src/utils/cronScheduler.ts', [
    'autonomousLoopDefault: isLoopDefaultSentinel(t.prompt)',
  ])
  assertSource('src/services/compact/postCompactCleanup.ts', [
    'if (isMainThreadCompact) { loopDefaultModule?.resetAutonomousLoopDelivered() }',
  ])
})

test('recovers autonomous and loop.md sentinels plus dynamic /loop grammar', () => {
  assertSource('src/utils/loopDefault.ts', [
    "LOOP_FILE_SENTINEL = '<<loop.md>>'",
    "LOOP_FILE_DYNAMIC_SENTINEL = '<<loop.md-dynamic>>'",
    "'tengu_kairos_loop_prompt'",
    "join(getProjectRoot(), '.claude', 'loop.md')",
    "join(getClaudeConfigHomeDir(), 'loop.md')",
    'MAX_LOOP_FILE_LENGTH = 25_000',
    'lastLoopFileContent === loopFile.content',
    'resolveAutonomousLoopFire(prompt) ?? resolveLoopFileFire(prompt) ?? prompt',
    'autonomousLoopDelivered = false',
    'lastLoopFileContent = null',
  ])
  assert.equal(source('src/utils/loopDefault.ts').includes('getOriginalCwd'), false)

  assertSource('src/skills/bundled/loop.ts', [
    'Omit the interval to let the model self-pace.',
    "return '[interval | until <condition>] [prompt]'",
    'The user wants you to self-pace.',
    'If the next run is gated on an event',
    'the full original /loop input verbatim, prefixed with',
    'so the next firing re-enters this skill and continues the loop',
    'loopDefault.readLoopFile()',
    'isEmpty && isLoopDynamicEnabled()',
    'AUTONOMOUS_LOOP_DYNAMIC_SENTINEL',
    'LOOP_FILE_DYNAMIC_SENTINEL',
    'the dynamic-mode sentinel expands at fire time',
  ])
})
