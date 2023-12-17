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

test('authenticates the four inherited-active runtime clusters', () => {
  const bundles = bundleSpecs.map(loadBundle)
  for (const fragment of [
    'Prior session exited uncleanly:',
    'tengu_unclean_exit',
    'session_age_sec',
    'prior_version',
    'on_current_version',
    'prior_session_id',
    'tengu_forked_agent_default_turns_exceeded',
    'Hooks: truncated Stop transcript',
    'tengu_hook_prompt_transcript_truncated',
    "Earlier conversation truncated to fit the hook evaluator's context window",
    'tengu_memory_threshold_crossed',
  ]) {
    assert.deepEqual(
      bundles.map(bundle => occurrences(bundle, fragment)),
      [1, 1],
      fragment,
    )
  }
})

test('recovers one-shot unclean interactive-session attribution', () => {
  const contents = source('src/utils/concurrentSessions.ts')
  assertSource('src/utils/concurrentSessions.ts', [
    "if (!/^\\d+\\.json$/.test(file)) continue",
    'const parsed = hasScannedPriorUncleanSessions ? null : await readFile(stalePath, \'utf8\')',
    'ConcurrentSessionSchema().safeParse(jsonParse(contents))',
    'const removed = await unlink(stalePath).then( () => true, () => false, )',
    "removed && parsed?.success && parsed.data.kind === 'interactive'",
    'Prior session exited uncleanly: ${parsed.data.sessionId} (v${parsed.data.version ?? \'?\'})',
    "logEvent('tengu_unclean_exit'",
    '(Date.now() - parsed.data.startedAt) / 1000',
    "prior_version: (parsed.data.version ?? 'unknown')",
    'on_current_version: parsed.data.version === MACRO.VERSION',
    'prior_session_id: parsed.data.sessionId',
    '(left, right) => right.startedAt - left.startedAt',
    'hasScannedPriorUncleanSessions = true',
  ])
  assert.match(
    compact(contents),
    /const parsed = hasScannedPriorUncleanSessions[\s\S]*?const removed = await unlink[\s\S]*?if \( removed && parsed\?\.success && parsed\.data\.kind === 'interactive' \)[\s\S]*?priorUncleanSessions\.sort[\s\S]*?hasScannedPriorUncleanSessions = true/,
  )
  const countBody = contents.slice(
    contents.indexOf('export async function countConcurrentSessions'),
    contents.indexOf('export async function listAllLiveSessions'),
  )
  assert.equal(countBody.includes('void unlink(join(dir, file))'), false)
})

test('recovers the bounded default fork and exact threshold event', () => {
  const contents = compact(source('src/utils/forkedAgent.ts'))
  for (const fragment of [
    'const DEFAULT_FORKED_AGENT_MAX_TURNS = 50',
    'const effectiveMaxTurns = maxTurns ?? DEFAULT_FORKED_AGENT_MAX_TURNS',
    'let assistantTurns = 0',
    'maxTurns: effectiveMaxTurns',
    "if (message.type === 'assistant') { assistantTurns++ }",
    'maxTurns === undefined && assistantTurns >= DEFAULT_FORKED_AGENT_MAX_TURNS',
    "logEvent('tengu_forked_agent_default_turns_exceeded'",
    'turnCount: assistantTurns',
  ]) {
    assert.equal(contents.includes(compact(fragment)), true, fragment)
  }
  assert.match(
    contents,
    /if \( maxTurns === undefined && assistantTurns >= DEFAULT_FORKED_AGENT_MAX_TURNS \)[\s\S]*?tengu_forked_agent_default_turns_exceeded[\s\S]*?logForkAgentQueryEvent/,
  )
})

test('recovers grouped model-aware Stop-hook transcript truncation', () => {
  const contents = compact(source('src/utils/hooks/execPromptHook.ts'))
  for (const fragment of [
    'const STOP_HOOK_TRANSCRIPT_BUDGET_RATIO = 0.7',
    'const contextWindow = has1mContext(evaluatorModel) ? 1_000_000 : MODEL_CONTEXT_WINDOW_DEFAULT',
    'const budget = Math.floor( contextWindow * STOP_HOOK_TRANSCRIPT_BUDGET_RATIO, )',
    "message?.type === 'assistant' && 'usage' in message.message && message.message.model !== SYNTHETIC_MODEL",
    'usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + usage.output_tokens',
    'if (lastResponseTokenCount(messages) <= budget) return messages',
    'const groups = groupMessagesByApiRound(messages)',
    'message.type === \'assistant\' || message.type === \'user\' ? roughTokenCountEstimationForMessage(message) : jsonStringify(message).length / 4',
    'suffixStart < groups.length && selectedTokens + groupTokens > budget',
    'const suffix = groups.slice(suffixStart).flat()',
    'const droppedMessages = messages.length - suffix.length',
    'Hooks: truncated Stop transcript ${messages.length}→${suffix.length} msgs (budget ${budget}, model ${evaluatorModel})',
    "logEvent('tengu_hook_prompt_transcript_truncated'",
    "[Earlier conversation truncated to fit the hook evaluator's context window — ${droppedMessages} earlier messages omitted.",
    'if the required evidence may be in the omitted prefix, return {"ok": false, "reason": "insufficient evidence in transcript"}.]',
    'const evaluatorModel = hook.model ?? getSmallFastModel()',
    '...truncateStopHookTranscript(messages, evaluatorModel), userMessage',
    'model: evaluatorModel',
  ]) {
    assert.equal(contents.includes(compact(fragment)), true, fragment)
  }
})

test('recovers upward-only memory threshold telemetry with RSS', () => {
  const contents = source('src/hooks/useMemoryUsage.ts')
  assertSource('src/hooks/useMemoryUsage.ts', [
    "const priorStatusRef = useRef<MemoryUsageStatus>('normal')",
    'normal: 0, high: 1, critical: 2',
    'const { heapUsed, rss } = process.memoryUsage()',
    'MEMORY_STATUS_RANK[status] > MEMORY_STATUS_RANK[priorStatusRef.current]',
    "logEvent('tengu_memory_threshold_crossed'",
    'rss_mb: Math.round(rss / 1024 / 1024)',
    'heap_used_mb: Math.round(heapUsed / 1024 / 1024)',
    'priorStatusRef.current = status',
  ])
  assert.equal(occurrences(contents, 'priorStatusRef.current = status'), 1)
  assert.match(
    compact(contents),
    /if \(MEMORY_STATUS_RANK\[status\] > MEMORY_STATUS_RANK\[priorStatusRef\.current\]\) \{ logEvent\('tengu_memory_threshold_crossed'[\s\S]*?priorStatusRef\.current = status \} setMemoryUsage/,
  )
})
