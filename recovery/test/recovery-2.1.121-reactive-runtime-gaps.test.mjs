import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))

const RELEASES = [
  {
    version: '2.1.120',
    names: ['CLAUDE_CODE_2_1_120_BUNDLE', 'CLAUDE_2_1_120_CLI_INNER'],
    bytes: 13_784_743,
    sha256:
      'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f',
  },
  {
    version: '2.1.121',
    names: ['CLAUDE_CODE_2_1_121_BUNDLE', 'CLAUDE_2_1_121_CLI_INNER'],
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
]

function loadBundle(release) {
  const filename = release.names.map(name => process.env[name]).find(Boolean)
  assert.ok(filename, `${release.names.join(' or ')} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
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

function assertFragments(relativePath, fragments) {
  const contents = compact(source(relativePath))
  for (const fragment of fragments) {
    assert.ok(
      contents.includes(compact(fragment)),
      `${relativePath}: missing ${fragment}`,
    )
  }
}

test('authenticates inherited reactive, stall, and no-prose behavior', () => {
  const witnesses = [
    ['tengu_reactive_compact_attempt', 1],
    ['tengu_reactive_compact_triggered', 1],
    ['tengu_reactive_compact_succeeded', 1],
    ['tengu_reactive_compact_failed', 1],
    ['reactive-compact', 1],
    ['tengu_cobalt_raccoon', 1],
    ['gap_unparseable', 1],
    ['media_unstrippable', 2],
    ['tengu_event_loop_stall', 1],
    ['tengu_drift_lantern', 1],
    ['event-loop-stall', 2],
    ['likely sleep/wake', 1],
    ['tengu_extract_memories_skipped_no_prose', 1],
    ['no user prose since last extraction', 1],
  ]

  for (const release of RELEASES) {
    const bundle = loadBundle(release)
    for (const [fragment, expected] of witnesses) {
      assert.equal(
        occurrences(bundle, fragment),
        expected,
        `${release.version}: ${fragment}`,
      )
    }
  }
})

test('recovers active reactive compaction gates and retry engine', () => {
  assertFragments('src/services/compact/autoCompact.ts', [
    "getContextWindowForModel(model, getSdkBetas()) !== 1_000_000",
    'getAutoCompactExperimentWindow(getCanonicalName(model)) !== undefined',
    "getFeatureValue_CACHED_MAY_BE_STALE( 'tengu_cobalt_raccoon', false, )",
    "return source === 'env' || source === 'settings'",
    'isReactiveCompactEligible(model) && !isAutoCompactWindowOverridden(model, autoCompactWindow)',
  ])
  assert.equal(
    source('src/query.ts').includes("feature('REACTIVE_COMPACT')"),
    false,
  )
  assertFragments('src/query.ts', [
    "import * as reactiveCompact from './services/compact/reactiveCompact.js'",
    'reactiveCompact.isReactiveCompactEnabled( toolUseContext.options.mainLoopModel, )',
    'const compacted = await reactiveCompact.tryReactiveCompact({',
    "transition: { reason: 'reactive_compact_retry' }",
  ])
  assertFragments('src/commands/compact/compact.ts', [
    'reactiveCompact.isReactiveOnlyMode(context.options.mainLoopModel)',
    'reactive.reactiveCompactOnPromptTooLong(',
    "trigger: 'manual'",
    "'Compaction failed · conversation could not be reduced below the context limit'",
    "'Compaction failed · attached media exceeds size limits'",
    'reactive.recordCompactionTelemetry({',
  ])
  assertFragments('src/services/compact/reactiveCompact.ts', [
    "forkLabel: 'reactive-compact'",
    'maxTurns: 1',
    'skipTranscript: true',
    'skipCacheWrite: true',
    "return { mode: 'gap_unparseable', step: 1 }",
    'groupsNeededFromTail(',
    'stripImagesFromMessages(normalizeMessagesForAPI(messages))',
    "reason: 'media_unstrippable'",
    "callSite: 'reactive_compact'",
    "processSessionStartHooks('compact'",
    'executePostCompactHooks(',
    'annotateBoundaryWithPreservedSegment(',
    'reAppendSessionMetadata()',
    "logOTelEvent('compaction'",
  ])
})

test('recovers the runtime stall detector and released main gate', () => {
  assertFragments('src/utils/eventLoopStallDetector.ts', [
    'const EXPECTED_INTERVAL_MS = 200',
    'const STALL_THRESHOLD_MS = 500',
    'const LIKELY_SLEEP_THRESHOLD_MS = 5_000',
    'process.memoryUsage()',
    "logEvent('tengu_event_loop_stall'",
    'instances.get(process.stdout)?.reassertTerminalModes(true)',
    'detector.unref()',
  ])
  assertFragments('src/main.tsx', [
    "getFeatureValue_CACHED_MAY_BE_STALE('tengu_drift_lantern', false)",
    "import('./utils/eventLoopStallDetector.js').then(m => m.startEventLoopStallDetector())",
  ])
})

test('skips memory extraction without new substantive user prose', () => {
  assertFragments('src/services/extractMemories/extractMemories.ts', [
    'const MIN_USER_PROSE_WORDS = 3',
    'count(text.split(/\\s+/), Boolean)',
    "message.type !== 'user' || message.isMeta",
    "block.type === 'text' && countWords(block.text) >= MIN_USER_PROSE_WORDS",
    'if (!foundStart) { return messages.some(isSubstantiveUserProse) }',
    'if (!hasUserProseSince(messages, lastMemoryMessageUuid))',
    "'[extractMemories] skipping — no user prose since last extraction'",
    'lastMemoryMessageUuid = lastMessage.uuid',
    "logEvent('tengu_extract_memories_skipped_no_prose'",
  ])
})
