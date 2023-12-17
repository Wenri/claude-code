import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const agentToolUtils = fs.readFileSync(
  fileURLToPath(
    new URL('../../src/tools/AgentTool/agentToolUtils.ts', import.meta.url),
  ),
  'utf8',
)

test('bounds async-agent stream stalls with the exact configurable timeout', () => {
  assert.match(
    agentToolUtils,
    /parseInt\(process\.env\.CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS \|\| '', 10\) \|\|\s+600_000/,
  )
  assert.match(
    agentToolUtils,
    /stallTimer = setTimeout\(\(\) => \{[\s\S]*?\}, stallTimeoutMs\)\s+stallTimer\.unref\?\.\(\)/,
  )
  assert.match(
    agentToolUtils,
    /resetStallWatchdog\(\)\s+for await \(const message of makeStream\(\s*onCacheSafeParams,\s*onQueryProgress,?\s*\)\) \{\s+lastMessageType =\s+message\.type === 'system'[\s\S]*?: message\.type\s+resetStallWatchdog\(\)/,
  )
})

test('aborts, fails, and reports stalled async agents once', () => {
  assert.match(
    agentToolUtils,
    /\[AsyncAgent \$\{taskId\}\] stall watchdog fired after \$\{stallTimeoutMs\}ms with no progress \(last message: \$\{lastMessageType\}\); aborting/,
  )
  assert.match(
    agentToolUtils,
    /logEvent\('tengu_async_agent_stall_timeout', \{[\s\S]*?stall_ms: stallTimeoutMs,[\s\S]*?last_message_type:[\s\S]*?message_count: agentMessages\.length/,
  )
  assert.match(
    agentToolUtils,
    /abortController\.abort\(\)\s+stopSummarization\?\.\(\)/,
  )
  assert.match(
    agentToolUtils,
    /Agent stalled: no progress for \$\{stallTimeoutMs \/ 1000\}s \(stream watchdog did not recover\)/,
  )
  assert.match(
    agentToolUtils,
    /failAsyncAgent\(taskId, message, toolUseContext\.taskRegistry\)[\s\S]*?status: 'failed',[\s\S]*?error: message,[\s\S]*?finalMessage: extractPartialResult\(agentMessages\)/,
  )
})

test('cleans up the watchdog across every lifecycle exit', () => {
  assert.match(
    agentToolUtils,
    /clearStallTimer\(\)\s+if \(lifecycleFinished\) return\s+lifecycleFinished = true\s+stopSummarization\?\.\(\)/,
  )
  assert.equal(agentToolUtils.match(/if \(lifecycleFinished\) return/g)?.length, 3)
  assert.match(
    agentToolUtils,
    /finally \{\s+clearStallTimer\(\)\s+clearInvokedSkillsForAgent/,
  )
})
