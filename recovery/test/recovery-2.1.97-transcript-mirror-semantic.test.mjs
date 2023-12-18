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
    10954,
    [
      8615003,
      8648289,
      'dc46f99ebfe1e5e36615692c7ed94cd4c31937f74d6308434de38741ed09631c',
    ],
  ],
  [
    15846,
    [
      11513221,
      11513255,
      '096b9755f9b7d264b431b4b48e443709e4fee22cc971976b0703456dbbca2884',
    ],
  ],
  [
    15847,
    [
      11513255,
      11513294,
      '85b45424da335cef0abaa64f17b5829dd98ffdffa553f3ba223d33effbb99dd3',
    ],
  ],
  [
    15851,
    [
      11513476,
      11523891,
      'e0ade99f50b6231a7c7d21b92ac7962b43a4520c0d06962f5204d46758d772b5',
    ],
  ],
  [
    17347,
    [
      12278260,
      12280408,
      '6d086b0801be66f7c5c963794325f9e679f0eadfedff2c6836a0244e095807d4',
    ],
  ],
  [
    18387,
    [
      13114374,
      13117245,
      '325f8575e433c92ad219c0192c266c252c689aed3f22db516188f62d20f6fc2a',
    ],
  ],
  [
    18428,
    [
      13140282,
      13146200,
      'e087dc17bc568576eff1e14c6b8e86e8fb5f72046d834f629566354bab8fc497',
    ],
  ],
  [
    18429,
    [
      13146200,
      13177760,
      'd3b35edba548c3eefe78e66e81ebb6a3e5b9c9b2f8f243cafb4fb221d1da5ed0',
    ],
  ],
  [
    18556,
    [
      13248112,
      13303625,
      '3b8da3292e35d6575ad9a299498b678a928913b76ac0044cba8af9e63b03e211',
    ],
  ],
])

test(
  '2.1.97 transcript-mirror evidence pins every owning target unit',
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

    assert.ok(
      bundle.includes(
        '@internal Emitted after each successful local transcript write. The parent peels these off the stdout stream and batches them to the SessionStore adapter. Not exposed to public SDK consumers.',
      ),
    )
    assert.ok(bundle.includes('[SessionMirror] mirror failed for'))
    assert.ok(
      bundle.includes(
        'Emit transcript_mirror frames on stdout (SDK-internal; set by ProcessTransport when sessionStore is configured)',
      ),
    )
  },
)

test(
  'source owns the exact transcript frame schema and stdout-only routing',
  sourceOptions,
  () => {
    assertFragments('src/entrypoints/sdk/coreSchemas.ts', [
      "type: z.literal('transcript_mirror')",
      'filePath: z.string()',
      'entries: z.array(z.unknown())',
      '@internal Emitted after each successful local transcript write. The parent peels these off the stdout stream and batches them to the SessionStore adapter. Not exposed to public SDK consumers.',
    ])
    assertFragments('src/entrypoints/sdk/controlSchemas.ts', [
      'SDKTranscriptMirrorMessageSchema',
      'SDKTranscriptMirrorMessageSchema()',
    ])
    assertFragments('src/server/directConnectManager.ts', [
      "parsed.type !== 'transcript_mirror'",
    ])
    assertFragments('src/cli/remoteIO.ts', [
      "if (message.type === 'transcript_mirror')",
      'return',
    ])
  },
)

test(
  'source mirrors only successfully appended transcript chunks',
  sourceOptions,
  () => {
    const sessionStorage = assertFragments('src/utils/sessionStorage.ts', [
      'type SessionMirror = (filePath: string, entries: Entry[]) => void',
      '[SessionMirror] mirror failed for ${filePath}: ${error}',
      'const mirrorEntries:',
      'await this.appendToFile(filePath, content)',
      'this.fireMirror(filePath, mirrorEntries.slice())',
      'this.fireMirror(filePath, mirrorEntries)',
      'mirrorEntries?.push(entry)',
    ])
    assert.match(sessionStorage, /(set|add)SessionMirror/)
    assert.match(sessionStorage, /(set|add)Mirror\(mirror: SessionMirror\)/)

    const drain = sessionStorage.indexOf('private async drainWriteQueue()')
    const append = sessionStorage.indexOf(
      'await this.appendToFile(filePath, content)',
      drain,
    )
    const fire = sessionStorage.indexOf(
      'this.fireMirror(filePath, mirrorEntries.slice())',
      append,
    )
    const resolve = sessionStorage.indexOf('for (', fire)
    assert.ok(drain >= 0 && append > drain && fire > append && resolve > fire)
  },
)

test(
  'headless mode registers, filters, and flushes transcript mirrors before results',
  sourceOptions,
  () => {
    const print = assertFragments('src/cli/print.ts', [
      "options.outputFormat === 'stream-json' && options.sessionMirror",
      "type: 'transcript_mirror'",
      'filePath,',
      'entries,',
      "message.type !== 'transcript_mirror'",
      'await flushSessionStorage()',
    ])
    assert.match(print, /(set|add)SessionMirror\(\(filePath, entries\) =>/)
    assert.ok(
      print.split('await flushSessionStorage()').length - 1 >= 3,
      'flushes immediate, held-back, and error results',
    )

    const immediate = print.indexOf('heldBackResult = null')
    const immediateFlush = print.indexOf('await flushSessionStorage()', immediate)
    const immediateEnqueue = print.indexOf('output.enqueue(message)', immediate)
    assert.ok(immediateFlush > immediate && immediateEnqueue > immediateFlush)

    assertFragments('src/main.tsx', [
      "new Option('--session-mirror'",
      'Emit transcript_mirror frames on stdout (SDK-internal; set by ProcessTransport when sessionStore is configured)',
      'sessionMirror',
    ])
  },
)
