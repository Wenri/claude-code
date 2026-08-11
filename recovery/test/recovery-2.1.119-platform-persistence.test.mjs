import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const BASELINE_BYTES = 13_234_618
const BASELINE_SHA256 =
  '84d06c8582112ca623b66cc28b3a55c5d57e9add86d7a1b1163d6a12a31a9ffa'
const TARGET_BYTES = 13_720_987
const TARGET_SHA256 =
  '9a1fccbe69ffe06c82345db1cc8cdbbc9a9929ed723bc8832ad48dfeff64b4ef'
const repo = fileURLToPath(new URL('../..', import.meta.url))

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function loadBundle(environmentName, expectedBytes, expectedSha256) {
  const filename = process.env[environmentName]
  assert.ok(filename, environmentName + ' must be set')
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, expectedBytes, environmentName + ': byte length')
  assert.equal(sha256(bytes), expectedSha256, environmentName + ': SHA-256')
  return bytes.toString('utf8')
}

function occurrences(contents, fragment) {
  let count = 0
  let offset = 0
  while ((offset = contents.indexOf(fragment, offset)) !== -1) {
    count++
    offset += fragment.length
  }
  return count
}

function compact(value) {
  return value.replaceAll(/\s+/g, ' ').trim()
}

function readSource(sourcePath) {
  return fs.readFileSync(path.join(repo, sourcePath), 'utf8')
}

function assertSourceFragments(sourcePath, fragments) {
  const contents = compact(readSource(sourcePath))
  for (const fragment of fragments) {
    assert.equal(
      contents.includes(compact(fragment)),
      true,
      sourcePath + ': ' + fragment,
    )
  }
}

const BUNDLE_FRAGMENTS = [
  ['message client platform plumbing', 'messageClientPlatform', 41, 41],
  ['first fallback request ID', 'firstAttemptRequestId', 5, 5],
  ['persistence option', 'enableSessionPersistence', 2, 2],
  ['persistence transport callback', 'onTransportPersistenceReady', 2, 2],
  ['transport internal writer', 'getInternalEventWriter', 2, 2],
  [
    'SDK client-platform description',
    'Injected server-side by CCR ingress from the request header.',
    1,
    1,
  ],
  [
    'stale writer cleanup',
    'CCR v2 internal event writer cleared',
    1,
    1,
  ],
  [
    'update reconnect notice',
    'Switching to latest Claude Code\\u2026 reconnecting',
    0,
    1,
  ],
  ['update bridge flush', 'bridge flush', 0, 1],
]

test('platform and persistence witnesses use authenticated bundles', () => {
  const baseline = loadBundle(
    'CLAUDE_CODE_2_1_118_BUNDLE',
    BASELINE_BYTES,
    BASELINE_SHA256,
  )
  const target = loadBundle(
    'CLAUDE_CODE_2_1_119_BUNDLE',
    TARGET_BYTES,
    TARGET_SHA256,
  )

  for (const [name, fragment, baselineCount, targetCount] of BUNDLE_FRAGMENTS) {
    assert.equal(
      occurrences(baseline, fragment),
      baselineCount,
      name + ': baseline count',
    )
    assert.equal(
      occurrences(target, fragment),
      targetCount,
      name + ': target count',
    )
  }
})

test('threads client platform from CCR input through model and tool telemetry', () => {
  assertSourceFragments('src/entrypoints/sdk/coreSchemas.ts', [
    'client_platform: z .string() .optional()',
    'Injected server-side by CCR ingress from the request header.',
  ])
  assertSourceFragments('src/bridge/inboundMessages.ts', [
    "'client_platform' in msg && typeof msg.client_platform === 'string'",
    'clientPlatform,',
  ])
  assertSourceFragments('src/utils/handlePromptSubmit.ts', [
    'commands.find( command => command.clientPlatform, )?.clientPlatform',
    'effort, clientPlatform,',
  ])
  assertSourceFragments('src/screens/REPL.tsx', [
    'if (clientPlatform) toolUseContext.options.messageClientPlatform = clientPlatform;',
    "mode: 'prompt', clientPlatform",
  ])
  assertSourceFragments('src/cli/print.ts', [
    'batch.find(c => c.clientPlatform)?.clientPlatform ?? command.clientPlatform',
    'clientPlatform: cmd.clientPlatform',
    'clientPlatform: message.client_platform',
  ])
  assertSourceFragments('src/query.ts', [
    'messageClientPlatform: toolUseContext.options.messageClientPlatform',
  ])
  assertSourceFragments('src/tools/AgentTool/runAgent.ts', [
    'messageClientPlatform: toolUseContext.options.messageClientPlatform',
  ])
  assert.equal(
    occurrences(
      readSource('src/services/tools/toolExecution.ts'),
      'messageClientPlatform:',
    ),
    6,
    'the six authenticated tool telemetry events carry client platform',
  )
})

test('preserves streaming request ID across non-streaming fallback telemetry', () => {
  assertSourceFragments('src/services/api/claude.ts', [
    'return { message: result.data, requestId: result.request_id }',
    'firstAttemptRequestId = streamRequestId',
    "streamRequestId ?? (failedRequestId !== 'unknown' ? failedRequestId : null)",
    'const { message: result, requestId } = yield* executeNonStreamingRequest',
    'streamRequestId = requestId',
    'firstAttemptRequestId: firstAttemptRequestId ?? null',
    'messageClientPlatform: options.messageClientPlatform',
  ])
  assertSourceFragments('src/services/api/logging.ts', [
    'firstAttemptRequestId && requestId && firstAttemptRequestId !== requestId',
    'firstAttemptRequestId: firstAttemptRequestId',
    'messageClientPlatform: messageClientPlatform',
  ])
})

test('installs only the current transport persistence writer after local sync', () => {
  assertSourceFragments('src/bridge/replBridgeTransport.ts', [
    'getInternalEventWriter?(): InternalEventWriter',
    'getInternalEventReaders?(): InternalEventReaders',
    'ccr.writeInternalEvent(eventType, payload, options)',
    'readMain: () => ccr.readInternalEvents()',
    'readSubagents: () => ccr.readSubagentInternalEvents()',
  ])
  assertSourceFragments('src/bridge/remoteBridgeCore.ts', [
    'onSessionEstablished?.(sessionId)',
    'onTransportPersistenceReady(writer, readers)',
    'onTransportPersistenceTeardown?.()',
    'flushGate.start()',
    'unsubscribeRepoWatcher?.()',
    'flush: () => transport.flush()',
  ])
  assertSourceFragments('src/bridge/sessionPersistenceSync.ts', [
    'await Promise.all([ readers.readMain(), readers.readSubagents(), ])',
    '[persistence-sync] Server has ${serverUuids.size} events since compaction',
    'if (isCompactBoundaryMessage(entry)) break',
    'candidate.size <= SKIP_PRECOMPACT_THRESHOLD',
    '.slice(0, MAX_AGENT_TRANSCRIPTS)',
    '[persistence-sync] Uploaded ${mainEntries.length} main + ${uploadedSubagents} subagent entries',
  ])
  assertSourceFragments('src/bridge/initReplBridge.ts', [
    'const generation = ++persistenceGeneration',
    'if (generation !== persistenceGeneration)',
    'Transport torn down during sync — skipping writer install',
    'setInternalEventWriter(writer)',
    'setInternalEventReader(readers.readMain, readers.readSubagents)',
    'persistenceGeneration++ clearInternalEventWriter()',
    'enableSessionPersistence ? persistenceCallbacks : {}',
  ])
  assertSourceFragments('src/hooks/useReplBridge.tsx', [
    "enableSessionPersistence: outboundOnly || feature('KAIROS')",
  ])
})

test('flushes the reconnect notice before handing an active bridge to update', () => {
  assertSourceFragments('src/bridge/replBridge.ts', [
    'flush(): Promise<void>',
    'return transport?.flush() ?? Promise.resolve()',
  ])
  assertSourceFragments('src/bridge/bridgeMessaging.ts', [
    "model: '<synthetic>'",
    "content: [{ type: 'text', text: content, citations: null }]",
  ])
  assertSourceFragments('src/commands/update/update.ts', [
    'Switching to latest Claude Code… reconnecting',
    "await withTimeout(bridgeHandle.flush(), 2_000, 'bridge flush').catch",
    'await bridgeHandle.teardown({ skipArchive: true })',
  ])
})
