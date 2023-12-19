import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const isCurrentSource =
  path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
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

const targetUnits = new Map([
  [
    17943,
    [
      12544503,
      12545168,
      '35fd0a73b5d03d68025020aac8fb030b3d078f2ade43b86b522953f8ba64dbb3',
    ],
  ],
  [
    17944,
    [
      12545168,
      12545349,
      'fbd85a55f4651af84650bc669409c1467e1f965b5dd532f900388edc601ce2c5',
    ],
  ],
  [
    17945,
    [
      12545349,
      12545603,
      '13388881c82a4deb825a54c355f2e95baa0bbb63e71248a17572c4a270d112c8',
    ],
  ],
  [
    17947,
    [
      12545635,
      12545720,
      'bd1104999c4b4815bfb26cb0b598afee9bf35e11405db1b0e2c27a8aae9ce777',
    ],
  ],
  [
    17948,
    [
      12545720,
      12545897,
      '13fd72cfd534e7991e33664bcebdd24a027dff0a58fbb2acba96cc2d31af80e5',
    ],
  ],
  [
    17949,
    [
      12545897,
      12546137,
      '3aad96990faeed3d66549aafd18b84031ffca99caea57e759ba6bd6c9e399343',
    ],
  ],
  [
    17950,
    [
      12546137,
      12547181,
      '964de99256d28e203110ac44c4decebed18f9d0493ad71a21714e2b4031e2bd5',
    ],
  ],
  [
    17951,
    [
      12547181,
      12547211,
      '398971e57ee7549c8fd2bb0377a84917cf218fcab739e2d467a223f52d5ab5ab',
    ],
  ],
])

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_100_BUNDLE and CLAUDE_CODE_2_1_101_BUNDLE are required'
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

function assertFragments(contents, fragments, label) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${label}: ${fragment}`)
  }
}

test('target101 pins the complete away-summary structural graph', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be',
  )
  assert.equal(
    sha256(targetBytes),
    'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
  )

  const target = targetBytes.toString('utf8')
  for (const [index, identity] of targetUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
      `${index}: structural identity`,
    )
    const unit = target.slice(identity[0], identity[1])
    assert.equal(sha256(unit), identity[2], `${index}: target bytes`)
    assert.equal(
      parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
      1,
      `${index}: one top-level statement`,
    )
  }
})

test('away-summary cache-safe runtime enters at target101', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  for (const fragment of [
    'Away summary cannot use tools',
    '[awaySummary] no CacheSafeParams saved, skipping',
    'tengu_sedge_lantern',
    'They remember the session',
  ]) {
    assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
    assert.equal(target.includes(fragment), true, `${fragment}: target`)
  }
  assert.ok(target.includes('skipCacheWrite:!0,skipTranscript:!0'))
  assert.ok(target.includes('p3A=300000,U3A=3,g3A=2'))
})

test('source owns the cache-safe one-turn recap and exact lifecycle', sourceOptions, () => {
  const service = source('src/services/awaySummary.ts')
  assertFragments(
    service,
    [
      'getLastCacheSafeParams',
      'runForkedAgent',
      'Away summary cannot use tools',
      "decisionReason: { type: 'other' as const, reason: 'away_summary' }",
      "querySource: 'away_summary'",
      "forkLabel: 'away_summary'",
      'maxTurns: 1',
      'skipCacheWrite: true',
      'skipTranscript: true',
      "message.type === 'assistant' && !message.isApiErrorMessage",
      ".filter(block => block.type === 'text')",
      '.trim()',
    ],
    'src/services/awaySummary.ts',
  )
  assert.equal(service.includes('queryModelWithoutStreaming'), false)
  assert.equal(service.includes('getSessionMemoryContent'), false)
  const hook = source('src/hooks/useAwaySummary.ts')
  assertFragments(
    hook,
    [
      'function isRealUserMessage',
      '!message.isVirtual',
      "message.subtype === 'api_metrics'",
      'const MIN_USER_MESSAGES = 3',
      'const MIN_USER_MESSAGES_SINCE_RECAP = 2',
      'lastSignificantMessageIsAwaySummary(messagesRef.current)',
      'createAwaySummaryMessage',
    ],
    'src/hooks/useAwaySummary.ts',
  )
  assert.ok(
    hook.indexOf('lastSignificantMessageIsAwaySummary(messagesRef.current)') <
      hook.indexOf('const controller = new AbortController()'),
  )
  assert.ok(
    hook.indexOf("last?.type === 'system' && last.subtype === 'api_metrics'") <
      hook.indexOf('return [...previous, recap]'),
  )

  if (isCurrentSource) {
    assert.ok(service.includes('Recap in under 40 words'))
    assert.ok(service.includes('extractTextContent(text).trim()'))
    assert.ok(
      service.indexOf('if (signal.aborted) return null') <
        service.indexOf('const text = messages'),
    )
    assertFragments(
      hook,
      [
        "'tengu_sedge_lantern_config'",
        "'[awaySummary] skipped: cache stale'",
        "'[awaySummary] skipped: draft input present'",
        "logEvent('tengu_return_to_session'",
        'scrolledBeforeSubmit: lastScrollAtRef.current > focusedAt',
      ],
      'current src/hooks/useAwaySummary.ts',
    )
  } else {
    assert.ok(service.includes('Under 40 words, 1-2 plain sentences — no markdown'))
    assert.ok(service.includes(".join('')"))
    assert.ok(
      service.indexOf('if (signal.aborted) return null') <
        service.indexOf('extractAwaySummaryText(messages)'),
    )
    assert.ok(hook.includes("'tengu_sedge_lantern',\n    false"))
    assert.ok(hook.includes('const BLUR_DELAY_MS = 5 * 60_000'))
    assert.ok(hook.includes('pendingRef.current = true'))
    assert.ok(hook.includes("getTerminalFocusState() !== 'blurred'"))
    assert.equal(hook.includes('tengu_sedge_lantern_config'), false)
    assert.equal(hook.includes('feature(\'AWAY_SUMMARY\')'), false)
  }
})
