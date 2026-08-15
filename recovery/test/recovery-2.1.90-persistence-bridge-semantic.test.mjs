import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.89-to-2.1.90'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_90_BUNDLE
const targetSha256 =
  '069185909d50518b8b239acc0f9ae9b062a610595299b35955fc53e6e2c2f5e9'
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_90_BUNDLE is not set'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function assertFragments(relative, fragments) {
  const text = source(relative)
  for (const fragment of fragments) {
    assert.ok(text.includes(fragment), `${relative}: ${fragment}`)
  }
  return text
}

const pinnedUnits = new Map([
  [
    13286,
    [
      'unresolved',
      9959353,
      9959637,
      'e54c420eae038ef54423495452d228d32d2b37dd5d8eb1285893f04804287c13',
    ],
  ],
  [
    15644,
    [
      'unresolved',
      11388056,
      11388801,
      '4211ba5a9fdbb60521411741c0c007f5bed6e419e63236511776b7f5b40837b3',
    ],
  ],
  [
    16254,
    [
      'unresolved',
      11702637,
      11703369,
      '071547b88a9e284482c6cde6a04d43ce23754be331e47ef4a2751d62a9347c5d',
    ],
  ],
  [
    16255,
    [
      'unresolved',
      11703369,
      11703854,
      '6a86045fec0782936fa56a13de4c2b0ed642210ca7d3c4fa89f6beee791af7ad',
    ],
  ],
  [
    16325,
    [
      'unresolved',
      11778515,
      11782997,
      '37e760174eae966b7eb7698528097b1ed76471d14a0b3a3a8a8ed8c10b499907',
    ],
  ],
  [
    16345,
    [
      'unresolved',
      11785526,
      11794792,
      '6cd5d2fc88f74f78b3265e85646b7f75dc8b34e754435ce59bbc16d51e9d1e0b',
    ],
  ],
])

test(
  '2.1.90 persistence bridge evidence pins every owning target unit',
  bundleOptions,
  () => {
    const bundleBytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(bundleBytes), targetSha256)
    const bundle = bundleBytes.toString('utf8')
    for (const [index, [classification, start, end, sourceHash]] of pinnedUnits) {
      const region = structural.regions[index]
      assert.equal(region.classification, classification, `${index}: classification`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, sourceHash],
        `${index}: structural identity`,
      )
      assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
    }
    for (const fragment of [
      '[persistence-sync] Server has ',
      '[persistence-sync] Write failed: ',
      'Transport torn down during sync — skipping writer install',
      'Session persistence enabled — transcript entries forwarded as internal events',
    ]) {
      assert.ok(bundle.includes(fragment), fragment)
    }
  },
)

test('source reconstructs UUID-deduplicated post-compaction replay', sourceOptions, () => {
  const persistence = assertFragments('src/bridge/persistenceSync.ts', [
    'Promise.all([',
    'readers.readMain()',
    'readers.readSubagents()',
    'event.payload.uuid',
    "writeInternalEvent('transcript', entry",
    'isCompactBoundaryMessage(entry)',
    'agentId,',
    '!serverEventIds.has',
    '[persistence-sync] Uploaded ${mainEntries.length} main + ${uploadedSubagents} subagent entries',
  ])
  assert.ok(
    persistence.includes('lastCompactBoundary') ||
      persistence.includes('readLinesReverse'),
    'target90 forward replay or its target116 reverse-scan evolution is present',
  )
  if (persistence.includes('lastCompactBoundary')) {
    const boundary = persistence.indexOf('lastCompactBoundary = entries.length - 1')
    const slice = persistence.indexOf('.slice(lastCompactBoundary + 1)')
    const duplicateFilter = persistence.indexOf(
      '.filter(entry => !serverEventIds.has(entry.uuid))',
    )
    assert.ok(boundary >= 0 && slice > boundary && duplicateFilter > slice)
  } else {
    const reverseRead = persistence.indexOf('readLinesReverse(path)')
    const stopAtBoundary = persistence.indexOf(
      'if (isCompactBoundaryMessage(value)) break',
    )
    const reverseResult = persistence.indexOf('return entries.reverse()')
    assert.ok(
      reverseRead >= 0 && stopAtBoundary > reverseRead && reverseResult > stopAtBoundary,
    )
  }
})

test('source exposes CCR writer/readers and tears stale transports down', sourceOptions, () => {
  assertFragments('src/bridge/replBridgeTransport.ts', [
    'getInternalEventWriter?()',
    'getInternalEventReaders?()',
    'ccr.writeInternalEvent(eventType, payload, options)',
    'readMain: () => ccr.readInternalEvents()',
    'readSubagents: () => ccr.readSubagentInternalEvents()',
  ])
  for (const relative of [
    'src/bridge/replBridge.ts',
    'src/bridge/remoteBridgeCore.ts',
  ]) {
    assertFragments(relative, [
      'onTransportPersistenceReady',
      'onTransportPersistenceTeardown',
      'getInternalEventWriter?.()',
      'getInternalEventReaders?.()',
    ])
  }
  assertFragments('src/utils/sessionStorage.ts', [
    'export function clearInternalEventWriter()',
    'this.internalEventWriter = null',
    'CCR v2 internal event writer cleared',
    'wtPath',
  ])
  assertFragments('src/bridge/bridgeEnabled.ts', [
    'export function isPersistentRemoteSessionEnabled()',
  ])
})

test('source generation guard installs only the live transport writer', sourceOptions, () => {
  const init = assertFragments('src/bridge/initReplBridge.ts', [
    'enableSessionPersistence?: boolean',
    'const generation = ++persistenceGeneration',
    'await syncPersistence(writer, readers,',
    'if (generation !== persistenceGeneration)',
    'setInternalEventWriter(writer)',
    'persistenceGeneration++',
    'clearInternalEventWriter()',
    '...(enableSessionPersistence ? persistenceCallbacks : {})',
  ])
  const sync = init.indexOf('await syncPersistence(writer, readers,')
  const stale = init.indexOf('if (generation !== persistenceGeneration)', sync)
  const install = init.indexOf('setInternalEventWriter(writer)', stale)
  assert.ok(sync >= 0 && stale > sync && install > stale)
})

test('REPL bridge enables target90 persistence and preserves the latest CCR evolution', sourceOptions, () => {
  const hook = source('src/hooks/useReplBridge.tsx')
  if (semanticCase === caseName) {
    assert.ok(
      hook.includes(
        'enableSessionPersistence: isPersistentRemoteSessionEnabled()',
      ),
    )
    assert.ok(
      hook.includes(
        "import { isPersistentRemoteSessionEnabled } from '../bridge/bridgeEnabled.js'",
      ),
    )
  } else {
    assert.ok(
      hook.includes('enableSessionPersistence: outboundOnly'),
      'latest CCR mirror mode is the evolved persistence gate',
    )
  }
})

test('modeled target90 replay drops invalid, compacted, and server-owned rows', () => {
  const lines = [
    JSON.stringify({ type: 'user', uuid: 'before' }),
    '{broken',
    JSON.stringify({ type: 'system', subtype: 'compact_boundary', uuid: 'cut' }),
    JSON.stringify({ type: 'assistant', uuid: 'server-owned' }),
    JSON.stringify({ type: 'attachment', uuid: 'local' }),
    JSON.stringify({ type: 'progress', uuid: 'ephemeral' }),
  ]
  const allowed = new Set(['user', 'assistant', 'attachment', 'system'])
  const parsed = []
  let boundary = -1
  for (const line of lines) {
    let value
    try {
      value = JSON.parse(line)
    } catch {
      continue
    }
    if (
      !value ||
      typeof value !== 'object' ||
      !allowed.has(value.type) ||
      typeof value.uuid !== 'string'
    ) {
      continue
    }
    parsed.push(value)
    if (value.type === 'system' && value.subtype === 'compact_boundary') {
      boundary = parsed.length - 1
    }
  }
  const replayed = parsed
    .slice(boundary + 1)
    .filter(value => !new Set(['server-owned']).has(value.uuid))
  assert.deepEqual(replayed.map(value => value.uuid), ['local'])
})
