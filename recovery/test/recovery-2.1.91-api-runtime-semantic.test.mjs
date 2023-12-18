import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.90-to-2.1.91'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_91_BUNDLE
const targetSha256 =
  'b4bf141f30cf8b40196295816c7a6b9d01a36e906908d73a9f9a865ce4cdf816'
const isCurrentSource =
  path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_91_BUNDLE is not set'
      : false,
}
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

const pinnedUnits = new Map([
  [
    7253,
    [
      'unresolved',
      5290308,
      5290604,
      '91fbe49b81e7994f052c5cc39bc6a8e2a5a13149d94808ac124a7650ac5e8722',
    ],
  ],
  [
    8970,
    [
      'unresolved',
      7013168,
      7013671,
      'ec5daec51377e8c29fe3ee80162b277007971d3fddc0938b217f6d694b7d7f92',
    ],
  ],
  [
    11434,
    [
      'unresolved',
      9058147,
      9058237,
      '42ac7b56357df51fcf025b9ec03f1a312fc351cb2cef64ee7f91862f2e1d355d',
    ],
  ],
  [
    11603,
    [
      'unresolved',
      9142301,
      9142400,
      '4797fcc55ed31089d71ca35b5f333740a7d7d3cc99fea492c95787c802e09ba4',
    ],
  ],
  [
    12001,
    [
      'unresolved',
      9332276,
      9336248,
      '56781e780a48036c47b9c2b6ee8296d234a9e724180ace726f668637d8dec9f3',
    ],
  ],
  [
    12104,
    [
      'unresolved',
      9388520,
      9401063,
      '39f260e6448d2fb2845835959adfa4b4a3c2942cab40f73b3b4947fb591532fc',
    ],
  ],
  [
    12184,
    [
      'changed',
      9452157,
      9465587,
      '4a4ec282bf40dc785368e4623473f484312832302b6e5119b540b5378d8c6cff',
    ],
  ],
  [
    12832,
    [
      'unresolved',
      9773710,
      9774621,
      '0153cfe985589edf54bd69a37bbb35463bd4fb3999ebdd2aff5fe20ea108aa43',
    ],
  ],
  [
    15211,
    [
      'unresolved',
      11183036,
      11184027,
      'c22de823e6c909c15b59fe2d9c8a811dfeac6bc486c7fc3df257fcd8ae42cc33',
    ],
  ],
  [
    15214,
    [
      'unresolved',
      11184941,
      11185246,
      '17f200dc0fbdf041104eef63673fb0e54b04af1d7c6d944591146975b919d876',
    ],
  ],
  [
    15255,
    [
      'unresolved',
      11195084,
      11199573,
      '830c84ad3368c53d8c54acf5e7df6b8823ba782b9b0f9ea8136f730eb1a89042',
    ],
  ],
  [
    15971,
    [
      'unresolved',
      11543956,
      11545392,
      '8629cca43601b840e6a9bd834384a2dfc97259f40b1e1cb7f5e2558de2973efb',
    ],
  ],
  [
    18093,
    [
      'unresolved',
      12894263,
      12894379,
      '4f682d771c5cd5ab2b3db049dc020bfaaac65628d04d5cda296342773caed4de',
    ],
  ],
  [
    18095,
    [
      'unresolved',
      12894429,
      12894544,
      '467885bfe8ab131af5eead715f7ca4c7d883a667a3251107121adc28384a7c5f',
    ],
  ],
])

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

test('target91 pins every reserved API/runtime structural unit', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), targetSha256)
  const bundle = bytes.toString('utf8')
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
  assert.equal(structural.regions[12184].baselineUnitIndex, 12129)
  assert.equal(
    structural.regions[12184].pairReason,
    'unique-coarse-structural-hash',
  )
})

test('source recovers persistent sanitization, retry, peer, Chrome, and worktree behavior', sourceOptions, () => {
  const dump = assertFragments('src/services/api/dumpPrompts.ts', [
    'function sanitizeDumpPromptRequest(',
    'content: record.content.map(sanitizeDumpPromptContent)',
    'sourceRecord.data.length > 256',
    'data: `[${sourceRecord.data.length} base64 chars]`',
  ])
  assert.ok(
    dump.indexOf('sourceRecord.data.length > 256') <
      dump.indexOf('content: record.content.map(sanitizeDumpPromptContent)', dump.indexOf('function sanitizeDumpPromptContent')),
    'large source payloads are replaced before nested content recursion',
  )

  const grove = assertFragments('src/services/api/grove.ts', [
    'const viewedAt = new Date(settings.grove_notice_viewed_at).getTime()',
    'if (Number.isNaN(viewedAt))',
    'Invalid grove_notice_viewed_at from API:',
    'return true',
  ])
  assert.ok(
    grove.indexOf('if (Number.isNaN(viewedAt))') <
      grove.indexOf('const daysSinceViewed'),
  )

  assertFragments('src/services/tools/toolExecution.ts', [
    'The PermissionDenied hook indicated you may retry this tool call.',
  ])
  assertFragments('src/utils/messages.ts', [
    "case 'peer':",
    'A peer session sent a message while you were working:',
    'This is from another Claude session, not your user.',
  ])
  assertFragments('src/utils/claudeInChrome/setup.ts', [
    'Failed to check extension installation during manifest install:',
    'Failed to check extension installation during cache refresh:',
  ])
  const worktree = assertFragments('src/components/WorktreeExitDialog.tsx', [
    'getCurrentSessionTitle(getSessionId())',
    'count === 0 && !sessionTitle',
    'This session was named "${sessionTitle}". Keep the worktree to resume it later, or remove it to clean up.',
  ])
  assert.ok(
    worktree.indexOf('count === 0 && !sessionTitle') <
      worktree.indexOf('This session was named'),
  )
})

test(
  'historical source recovers target91-only gates, schema shaping, and quoting',
  {
    ...sourceOptions,
    skip:
      sourceOptions.skip ||
      (isCurrentSource ? 'historical target-91 source only' : false),
  },
  () => {
    if (isCurrentSource) return
    const upload = assertFragments('src/tools/BriefTool/upload.ts', [
      'function escapeContentDispositionFilename(',
      ".replace(/[\\r\\n]/g, '')",
      ".replace(/\\\\/g, '\\\\\\\\')",
      'filename="${escapeContentDispositionFilename(filename)}"',
    ])
    assert.ok(
      upload.indexOf('function escapeContentDispositionFilename(') <
        upload.indexOf('escapeContentDispositionFilename(filename)'),
    )

    const model = assertFragments('src/utils/model/modelOptions.ts', [
      'function getProOpusUsageSuffix()',
      "getSubscriptionType() === 'pro'",
      "getFeatureValue_CACHED_MAY_BE_STALE('tengu_gypsum_kite', false)",
      ' · ~2× usage vs Sonnet',
      'getProOpusUsageSuffix()',
    ])
    assert.ok(model.match(/getProOpusUsageSuffix\(\)/g).length >= 4)

    assertFragments('src/tools/BashTool/prompt.ts', [
      'isRelativeFilePathsEnabled()',
      'Avoid `cd` unless the User explicitly requests it. The shell already starts in cwd, so do not prefix commands with `cd <cwd> &&` — relative paths work.',
    ])
    const api = assertFragments('src/utils/api.ts', [
      'const isSubagentSchema =',
      '`${tool.name}:subagent`',
      "getFeatureValue_CACHED_MAY_BE_STALE('tengu_lean_sub_pf7q', false)",
      "stripInputSchemaProperties(input_schema, ['description'])",
      "logEvent('tengu_subagent_lean_schema_applied'",
    ])
    assert.ok(
      api.indexOf("stripInputSchemaProperties(input_schema, ['description'])") <
        api.indexOf("logEvent('tengu_subagent_lean_schema_applied'"),
    )

    assertFragments('src/utils/deepLink/terminalLauncher.ts', [
      ".replace(/\\n/g, '\\\\n')",
      ".replace(/\\t/g, '\\\\t')",
      ".replace(/[\\n\\t]/g, ' ')",
      ".replace(/%/g, '%%')",
      ".replace(/(\\\\+)$/, '$1$1')",
    ])
  },
)

test('query-loop residue is proven by the inherited target89 supplements', sourceOptions, () => {
  const mainPatch = fs.readFileSync(
    path.join(
      repositoryRoot,
      'recovery/cases/2.1.88-to-2.1.89/semantic-supplement.patch',
    ),
    'utf8',
  )
  const deferredPatch = fs.readFileSync(
    path.join(
      repositoryRoot,
      'recovery/cases/2.1.88-to-2.1.89/semantic/deferred-tool.patch',
    ),
    'utf8',
  )
  for (const fragment of [
    'consecutiveRapidRefills,',
    "logEvent('tengu_auto_compact_rapid_refill_breaker'",
    "return { reason: 'rapid_refill_breaker' }",
  ]) {
    assert.ok(mainPatch.includes(fragment), fragment)
  }
  for (const fragment of [
    "update.message.attachment.type === 'hook_deferred_tool'",
    "return { reason: 'tool_deferred' }",
  ]) {
    assert.ok(deferredPatch.includes(fragment), fragment)
  }
})
