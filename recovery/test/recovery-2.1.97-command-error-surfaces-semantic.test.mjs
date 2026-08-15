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
    12466,
    [
      9631251,
      9631490,
      '1768f626c9ae422e64a28eae6fdd56ccb3f591b305848819c5d623970b20c808',
    ],
  ],
  [
    13527,
    [
      10090859,
      10092085,
      '7d6a0a50b6a4de52d82f5a686a4c244257a8b7febd538ec15cc67b83fc97cd31',
    ],
  ],
  [
    13530,
    [
      10092785,
      10093613,
      '90513ed1b7b78d50f40da825a40fad965aab53bdd01a4d4a1b8ac5185f13839c',
    ],
  ],
  [
    15215,
    [
      11228278,
      11229371,
      '46423708fb8592b087694192fa4dbb02d2947a50bf5d5faccdb0b142941bad8e',
    ],
  ],
  [
    15945,
    [
      11557933,
      11558045,
      '76ce71279e1caf375d67c1bba89d06bf14fdad0116a1ed466e10785e4652faef',
    ],
  ],
])

test(
  '2.1.97 command-error evidence pins error class, compaction, branch, and size units',
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
      'Compaction failed · attached media exceeds size limits',
      'Compaction failed · conversation could not be reduced below the context limit',
      'Conversation transcript is too large to branch (',
    ]) {
      assert.ok(bundle.includes(fragment), fragment)
    }
  },
)

test(
  'source preserves typed reactive-compaction failures through the command boundary',
  sourceOptions,
  () => {
    assertFragments('src/services/compact/compact.ts', [
      'export class CompactionError extends Error {}',
    ])
    const command = assertFragments('src/commands/compact/compact.ts', [
      'CompactionError,',
      "case 'exhausted':",
      'Compaction failed · conversation could not be reduced below the context limit',
      "case 'media_unstrippable':",
      'Compaction failed · attached media exceeds size limits',
      "case 'error':",
      "`Error during compaction: ${outcome.detail || 'unknown error'}`",
      'error instanceof CompactionError',
      'throw error',
      '{ cause: error }',
    ])
    assert.ok(
      command.indexOf('error instanceof CompactionError') <
        command.indexOf(
          '`Error during compaction: ${error instanceof Error ? error.message',
        ),
      'the command rethrows user-facing compaction errors before generic wrapping',
    )
  },
)

if (isCurrentSource) {
  test(
    'latest source keeps the streaming branch path and typed PreCompact failures',
    sourceOptions,
    () => {
      const branch = assertFragments('src/commands/branch/branch.ts', [
        'createReadStream(currentTranscriptPath',
        'for await (const line of lines)',
        'await writeLine(',
      ])
      assert.ok(
        !branch.includes('Conversation transcript is too large to branch ('),
        'streaming latest branch no longer needs the historical materialization cap',
      )
      assertFragments('src/services/compact/compact.ts', [
        'throw new CompactionError(',
        '`${ERROR_MESSAGE_COMPACTION_BLOCKED}: ${hookResult.blockedBy}`',
      ])
      assertFragments('src/components/MessageSelector.tsx', [
        "import { CompactionError } from 'src/services/compact/compact.js'",
        'if (!(error_1 instanceof CompactionError))',
        'logError(error_1 as Error)',
      ])
    },
  )
} else {
  test(
    'historical source rejects oversized transcripts before reading them into memory',
    sourceOptions,
    () => {
      const branch = assertFragments('src/commands/branch/branch.ts', [
        "import { mkdir, readFile, stat, writeFile } from 'fs/promises'",
        'MAX_TRANSCRIPT_READ_BYTES,',
        'transcriptSize = (await stat(currentTranscriptPath)).size',
        'if (transcriptSize > MAX_TRANSCRIPT_READ_BYTES)',
        '`Conversation transcript is too large to branch (${transcriptSize} bytes)`',
        'if (isENOENT(error))',
        'logError(toError(error))',
        'transcriptContent = await readFile(currentTranscriptPath)',
      ])
      assert.ok(
        branch.indexOf('await stat(currentTranscriptPath)') <
          branch.indexOf('await readFile(currentTranscriptPath)'),
        'the size guard runs before transcript materialization',
      )
    },
  )
}
