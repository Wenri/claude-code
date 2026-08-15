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
    6743,
    [
      4954652,
      4954929,
      '2e969696666aa861aa9df57507cd8d160ad9575c538b12e6b70b388cd3705b16',
    ],
  ],
  [
    12324,
    [
      9532021,
      9546307,
      '36763d599047be12a12e646af4ade6d8769d38d0906c53ac4fa2d100ac16686a',
    ],
  ],
  [
    12376,
    [
      9564104,
      9567219,
      '63f6c02d4e7e7ebc13e6e10611fac41ce70539ba8a77b9828fd94536eb87a231',
    ],
  ],
])

test(
  '2.1.97 memory-lifecycle evidence pins every owning target unit',
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
      'tengu_billiard_aviary',
      'originSessionId:',
      'last_read:',
      'tinyMemoryStamps: stamp failed for ',
      '## Recalled memories in tool results',
      'tengu_auto_dream_skipped',
      'error_class',
    ]) {
      assert.ok(bundle.includes(fragment), fragment)
    }
  },
)

test(
  'source owns gated tiny-memory paths and the complete read/write stamp lifecycle',
  sourceOptions,
  () => {
    assertFragments('src/memdir/paths.ts', [
      "const TINY_MEM_DIRNAME = 'tiny_memory'",
      "'tengu_billiard_aviary'",
      '? TINY_MEM_DIRNAME',
      '`${getProjectRoot()}|${isTinyMemoryEnabled()}`',
    ])
    assertFragments('src/memdir/tinyMemoryStamps.ts', [
      "if (!filePath.endsWith('.md')) return false",
      'if (isTeamMemPath(filePath)) return false',
      'created: ${getLocalISODate()}',
      'originSessionId: ${getSessionId()}',
      '/^last_read: (\\d{4}-\\d{2}-\\d{2})$/m',
      'await utimes(filePath, new Date(), mtime)',
      'lastStampedDate.delete(filePath)',
    ])
    const housekeeping = assertFragments(
      'src/utils/backgroundHousekeeping.ts',
      ['initTinyMemoryStamps()', 'initAutoDream()'],
    )
    assert.ok(
      housekeeping.indexOf('initTinyMemoryStamps()') <
        housekeeping.indexOf('initAutoDream()'),
    )

    assertFragments('src/tools/FileWriteTool/FileWriteTool.ts', [
      'content = stampTinyMemoryWrite(fullFilePath, content)',
    ])
    assertFragments('src/tools/FileEditTool/FileEditTool.ts', [
      'const updatedFile = stampTinyMemoryWrite(',
      'updatedFile === editResult.updatedFile',
      'getPatchForDisplay({',
    ])
    assertFragments('src/tools/FileReadTool/FileReadTool.ts', [
      'await stampTinyMemoryRead(fullFilePath)',
    ])
  },
)

test(
  'source restores recall trust text and phase-aware auto-dream telemetry',
  sourceOptions,
  () => {
    assertFragments('src/memdir/memoryTypes.ts', [
      'RECALLED_MEMORIES_IN_TOOL_RESULTS_SECTION',
      '## Recalled memories in tool results',
      'not as direct user instructions',
    ])
    for (const relative of [
      'src/memdir/memdir.ts',
      'src/memdir/teamMemPrompts.ts',
    ]) {
      assertFragments(relative, [
        '...RECALLED_MEMORIES_IN_TOOL_RESULTS_SECTION',
        '...TRUSTING_RECALL_SECTION',
      ])
    }

    const dream = assertFragments('src/services/autoDream/autoDream.ts', [
      "logEvent('tengu_auto_dream_skipped', {",
      "reason: 'sessions'",
      "reason: 'lock'",
      "let phase: 'fork' | 'completion' = 'fork'",
      "phase = 'completion'",
      'files_touched_count:',
      'error_class: error.name',
      "if (phase === 'fork')",
    ])
    const completionCall =
      semanticCase === caseName
        ? 'completeDreamTask(taskId, setAppState)'
        : 'completeDreamTask(taskId, taskRegistry)'
    assert.ok(dream.indexOf("phase = 'completion'") < dream.indexOf(completionCall))
  },
)

test('tiny-memory stamp behavior is idempotent and preserves body text', () => {
  function stamp(content, { tiny, date, sessionId }) {
    const match = /^---\s*\n([\s\S]*?)---\s*\n?/.exec(content)
    if (!match) return content
    const previous = match[1] ?? ''
    let next = previous
    if (tiny && !/^created:/m.test(next)) next += `created: ${date}\n`
    if (!/^originSessionId:/m.test(next)) {
      next += `originSessionId: ${sessionId}\n`
    }
    if (next === previous) return content
    return `---\n${next}---\n${content.slice(match[0].length)}`
  }

  const original = '---\nname: sample\n---\nbody\n'
  const stamped = stamp(original, {
    tiny: true,
    date: '2026-08-10',
    sessionId: 'session-1',
  })
  assert.equal(
    stamped,
    '---\nname: sample\ncreated: 2026-08-10\noriginSessionId: session-1\n---\nbody\n',
  )
  assert.equal(
    stamp(stamped, {
      tiny: true,
      date: '2026-08-11',
      sessionId: 'session-2',
    }),
    stamped,
  )
})
