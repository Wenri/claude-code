import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

function source(relative) {
  return fs.readFileSync(
    fileURLToPath(new URL(`../../${relative}`, import.meta.url)),
    'utf8',
  )
}

function includesAll(contents, fragments) {
  for (const fragment of fragments) {
    assert.equal(contents.includes(fragment), true, fragment)
  }
}

test('restores scheduled work and preserves resume metadata', () => {
  includesAll(source('src/utils/sessionCronTasks.ts'), [
    'extractResumedCronState',
    'resurrectSessionCronTasks',
    'restoreSessionCronTasks',
    'deletedCronIds',
    'setScheduledTasksEnabled(true)',
  ])
  includesAll(source('src/screens/REPL.tsx'), [
    'restoreSessionCronTasks(messages)',
    'restoreSessionCronTasks(initialMessages)',
  ])
  includesAll(source('src/cli/print.ts'), [
    'restoreSessionCronTasks(initialMessages)',
  ])
  includesAll(source('src/utils/sessionStorage.ts'), [
    'bytesSinceMetadataReAppend',
    'LITE_READ_BUF_SIZE / 2',
    'this.reAppendSessionMetadata()',
  ])
})

test('bounds tool and transport stalls', () => {
  includesAll(source('src/tools/BashTool/BashTool.tsx'), [
    'Math.min(timeout || getDefaultTimeoutMs(), getMaxTimeoutMs())',
  ])
  includesAll(source('src/services/mcp/client.ts'), [
    'Date.now() - transportErrorState.lastErrorAt > 90000',
    "}, 30000)",
    'MCP transport lost mid-call',
    'Ignoring non-JSON line on stdout',
  ])
  includesAll(source('src/services/api/claude.ts'), [
    'getNonstreamingFallbackTimeoutMs',
    'NONSTREAMING_FALLBACK_MAX_RETRIES = 2',
    'timeout: fallbackTimeoutMs',
    'tengu_nonstreaming_fallback_error',
  ])
})

test('recovers tracing, recap, queue, cleanup, title, and editor hardening', () => {
  includesAll(source('src/utils/telemetry/sessionTracing.ts'), [
    'process.env.TRACEPARENT',
    'process.env.TRACESTATE',
    'getIsNonInteractiveSession()',
  ])
  includesAll(source('src/utils/awaySummaryEnabled.ts'), [
    'CLAUDE_CODE_ENABLE_AWAY_SUMMARY',
    'awaySummaryEnabled',
  ])
  includesAll(source('src/query.ts'), [
    'const consumedCommands = queuedCommandsSnapshot.filter',
    'removeFromQueue(consumedCommands)',
    'Memory prefetch consume',
  ])
  includesAll(source('src/utils/cleanup.ts'), [
    'join(projectDir, sessionId)',
    'recursive: true',
    'force: true',
  ])
  includesAll(source('src/utils/sessionTitle.ts'), [
    'isSessionTitleGenerationDisabled',
    'isEssentialTrafficOnly()',
    'CLAUDE_CODE_DISABLE_TERMINAL_TITLE',
  ])
  includesAll(source('src/utils/promptEditor.ts'), [
    'spawnSync(executable, [...commandArgs, filePath]',
  ])
  includesAll(source('src/components/Messages.tsx'), [
    'filterForFocusView',
    "message.type === 'system'",
    'briefStandalone',
  ])
})
