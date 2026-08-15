import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.96-to-2.1.97'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const targetSha256 =
  '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988'
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
      ? 'CLAUDE_CODE_2_1_97_BUNDLE is not set'
      : false,
}
const isCurrentSource =
  path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')

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
    12445,
    [
      9615352,
      9615514,
      'b77e743ee57d44fc8050110bdb1455a8ff83fc84957dd2e60ebf735efad87a52',
    ],
  ],
  [
    12446,
    [
      9615514,
      9615782,
      'dd18b88a022884d26adb276d556fa0d27e7c080c31974c9c1da69f1c15166287',
    ],
  ],
  [
    12447,
    [
      9615782,
      9616517,
      'e307a69312c3451f404dfa3d5bd887a1125c04e0527faf8ae80a0304f51ec389',
    ],
  ],
  [
    12452,
    [
      9617302,
      9621243,
      '18490f658f64900bed812c12684239786b20fbca3114d19226c57503a53a778e',
    ],
  ],
  [
    12456,
    [
      9625363,
      9628354,
      'c42b215b3e94eb497919c3185e6efef7debfb37fd129462ac01d73d800f5c94a',
    ],
  ],
  [
    12465,
    [
      9630774,
      9631251,
      'a39501bdfd7ad9960f3f928143125476f7303b4ba3d38616e97e7691e1cf3c31',
    ],
  ],
])

test(
  '2.1.97 cold-compaction evidence pins recursive truncation and both call paths',
  bundleOptions,
  () => {
    const bundleBytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(bundleBytes), targetSha256)
    const bundle = bundleBytes.toString('utf8')

    for (const [index, [start, end, sourceHash]] of pinnedUnits) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: classification`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, sourceHash],
        `${index}: structural identity`,
      )
      assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
    }

    for (const fragment of [
      '…[truncated, original ',
      'tengu_cold_compact',
      'enablePromptCaching:!1',
    ]) {
      assert.ok(bundle.includes(fragment), fragment)
    }
  },
)

test(
  'cold compaction remains reachable through the duration and feature gate',
  sourceOptions,
  () => {
    const autoCompact = assertFragments('src/services/compact/autoCompact.ts', [
      'getTotalDuration',
      'COLD_COMPACT_MIN_SESSION_MS = 90 * 60 * 1000',
      "getFeatureValue_CACHED_MAY_BE_STALE('tengu_cold_compact', false)",
      'const stripNonEssential = shouldUseColdCompaction()',
      'recompactionInfo,\n      stripNonEssential,',
    ])
    assert.ok(
      autoCompact.indexOf('const stripNonEssential = shouldUseColdCompaction()') <
        autoCompact.indexOf('recompactionInfo,\n      stripNonEssential,'),
    )
    assertFragments('src/services/compact/compact.ts', [
      'stripNonEssentialCompactAttachments(',
      "message.attachment.type === 'queued_command'",
      'stripNonEssential: boolean = false',
      '!stripNonEssential &&',
      'stripNonEssential,\n      })',
    ])
  },
)

if (isCurrentSource) {
  test(
    'latest source retains the cold-compaction gate after retiring target97 truncation',
    sourceOptions,
    () => {
      const compact = source('src/services/compact/compact.ts')
      assert.ok(!compact.includes('…[truncated, original ${value.length} chars]'))
      assert.ok(compact.includes('stripNonEssentialCompactAttachments('))
    },
  )
} else {
  test(
    'historical source truncates every observable nonessential payload safely',
    sourceOptions,
    () => {
      const compact = assertFragments('src/services/compact/compact.ts', [
        'const COMPACT_NONESSENTIAL_STRING_LIMIT = 100',
        'lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff',
        '…[truncated, original ${value.length} chars]',
        'value.map(truncateNonEssentialCompactValue)',
        'Object.entries(input)',
        "block.type === 'thinking' || block.type === 'redacted_thinking'",
        "block.type !== 'tool_use'",
        "block.type !== 'tool_result'",
        ".map(item => (item.type === 'text' ? item.text : ''))",
        'stripNonEssential ? [] : context.options.tools',
        'tools: stripNonEssential ? [] : tools',
        'enablePromptCaching: false',
      ])
      assert.ok(
        compact.indexOf('stripNonEssentialCompactAttachments(compactMessages)') <
          compact.indexOf('truncateNonEssentialCompactMessages(strippedMessages)'),
      )

      const truncate = value => {
        if (value.length <= 100) return value
        let end = 100
        const codeUnit = value.charCodeAt(end - 1)
        if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) end--
        return `${value.slice(0, end)}…[truncated, original ${value.length} chars]`
      }
      assert.equal(truncate('x'.repeat(100)), 'x'.repeat(100))
      assert.equal(
        truncate(`${'x'.repeat(99)}😀tail`),
        `${'x'.repeat(99)}…[truncated, original 105 chars]`,
      )
    },
  )
}
