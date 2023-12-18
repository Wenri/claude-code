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
    5058,
    [
      3731481,
      3731531,
      '93cc934de596823cb9b05e8481ec73b82526800c446fe29e82e388c74482bd06',
    ],
  ],
  [
    5060,
    [
      3731553,
      3731610,
      'cc93989d1a2b99525cb9f962eb1273658082723da06cae33a9308f5c76a5824e',
    ],
  ],
  [
    5063,
    [
      3731706,
      3733315,
      'dd4d9115569148e43450085f4a43453359b542ee34ee2218b6323d2f357730b8',
    ],
  ],
  [
    5064,
    [
      3733315,
      3734249,
      '79b8234d1246899fcc6a2104bf3550a0a8fae499f2c628e7a2d1ceb0de24e3ae',
    ],
  ],
  [
    5067,
    [
      3734456,
      3735258,
      '6fc773a4fff058eaf69439f23c0358ec8b61786f5204700fd284306981a9e1c7',
    ],
  ],
  [
    7802,
    [
      6546310,
      6547674,
      '35e64e73f99023b9552684d4c009ccbd1b1fa759df5584cc783b9a2d0157084d',
    ],
  ],
  [
    11095,
    [
      8706133,
      8706429,
      '32c4314c39a40593f44be2435e375291683c98b85aa0bc71f8d8247c87d6ef75',
    ],
  ],
  [
    11227,
    [
      8744902,
      8750840,
      'f5554c7b551c82b984ef000aa740fd02969a66a2ffae95276c7343e50c51edd2',
    ],
  ],
  [
    11244,
    [
      8755619,
      8755700,
      'ab8e4b2b1288bdd5633bbaf67609e95c103384c29426b87ebad1eca453b2f755',
    ],
  ],
  [
    11246,
    [
      8755715,
      8761092,
      'c09a7ad3242a4d5c44cd6bbd5d9ae6894da7b80f44582060bf25240219c1d7cb',
    ],
  ],
  [
    12248,
    [
      9507970,
      9508511,
      'cf6a4b22da32822a03870a5f8868bc0baca35c5f1f099d338bab032019b3b1d5',
    ],
  ],
  [
    12404,
    [
      9561388,
      9569529,
      'c5421dba87d79c44b69d43a7a42e6dc4556f6112d006db3e6191e5d57917def5',
    ],
  ],
  [
    15961,
    [
      11540777,
      11541859,
      '06955b77be48d4e3e8346f1959e91098c2942e2c2772531341e1decb739938bc',
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

test('2.1.91 evidence pins the complete file-prompt runtime chain', bundleOptions, () => {
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
})

test('source recovers no-reread prompts, results, and stub recognition', sourceOptions, () => {
  const prompt = assertFragments('src/tools/FileReadTool/prompt.ts', [
    "'tengu_noreread_q7m_velvet'",
    'Do NOT re-read a file you just edited to verify',
    'file state is current in your context — no need to Read it back',
    'Wasted call — file unchanged since your last Read.',
    'isNoRereadEnabled() ? WASTED_CALL_STUB : FILE_UNCHANGED_STUB',
    'content.startsWith(FILE_UNCHANGED_STUB)',
    'content.startsWith(WASTED_CALL_STUB)',
  ])
  assert.ok(
    prompt.indexOf('isNoRereadEnabled() ? NO_REREAD_INSTRUCTION') >
      prompt.indexOf('export function renderPromptTemplate'),
  )

  assertFragments('src/tools/FileReadTool/FileReadTool.ts', [
    'getFileUnchangedStub,',
    'content: getFileUnchangedStub(),',
  ])
  assertFragments('src/utils/queryHelpers.ts', [
    'isFileUnchangedStub,',
    '!isFileUnchangedStub(content.content)',
  ])
  assertFragments('src/services/compact/compact.ts', [
    'isFileUnchangedStub,',
    'isFileUnchangedStub(block.content)',
  ])
  assertFragments('src/tools/FileEditTool/FileEditTool.ts', [
    'isNoRereadEnabled() && !userModified ? EDIT_SUCCESS_SUFFIX :',
    'All occurrences were successfully replaced.${currentFileStateNote}',
    'updated successfully${modifiedNote}.${currentFileStateNote}',
  ])
  assertFragments('src/tools/FileWriteTool/FileWriteTool.ts', [
    'isNoRereadEnabled()',
    'EDIT_SUCCESS_SUFFIX',
    'currentFileStateNote',
  ])
})

test(
  'historical source recovers relative paths and the gated append implementation',
  { ...sourceOptions, skip: sourceOptions.skip || isCurrentSource },
  () => {
    if (isCurrentSource) return
    assertFragments('src/tools/FileReadTool/prompt.ts', [
      "'tengu_relpath_gh7k'",
      'The file_path parameter can be relative to cwd (preferred for brevity) or absolute',
    ])
    assertFragments('src/constants/prompts.ts', [
      'isRelativeFilePathsEnabled()',
      'The Bash tool resets to cwd between calls; do not rely on `cd` persisting. File-tool paths can be relative to cwd.',
    ])
    assertFragments('src/tools/FileWriteTool/prompt.ts', [
      "'tengu_maple_forge_w8k'",
      "set mode:'append' and pass only the new content",
      "to append with mode:'append'",
    ])
    const write = assertFragments('src/tools/FileWriteTool/FileWriteTool.ts', [
      ".enum(['overwrite', 'append'])",
      'schema.omit({ mode: true })',
      "const isAppend = mode === 'append'",
      "const finalContent = isAppend ? (oldContent ?? '') + content : content",
      "logEvent('tengu_write_append_used'",
      "'tengu_editafterwrite_qpl'",
      'You can Edit this file directly without Reading it first.',
    ])
    const finalContent = write.indexOf('const finalContent')
    assert.ok(
      finalContent >= 0 &&
        write.indexOf('writeTextContent(', finalContent) > finalContent,
    )
    assert.ok(write.indexOf('readFileState.set', finalContent) > finalContent)
    assertFragments('src/tools/FileEditTool/prompt.ts', [
      "'tengu_editafterwrite_qpl'",
      'Files you Wrote this session can be Edited without a prior Read.',
    ])
  },
)

test(
  'current source keeps the live no-reread branch and omits retired target91 gates',
  { ...sourceOptions, skip: sourceOptions.skip || !isCurrentSource },
  () => {
    if (!isCurrentSource) return
    const all = [
      source('src/tools/FileReadTool/prompt.ts'),
      source('src/tools/FileWriteTool/prompt.ts'),
      source('src/tools/FileWriteTool/FileWriteTool.ts'),
      source('src/tools/FileEditTool/prompt.ts'),
      source('src/constants/prompts.ts'),
    ].join('\n')
    assert.ok(all.includes('tengu_noreread_q7m_velvet'))
    assert.equal(all.includes('tengu_relpath_gh7k'), false)
    assert.equal(all.includes('tengu_maple_forge_w8k'), false)
    assert.equal(all.includes('tengu_editafterwrite_qpl'), false)
    assert.ok(
      source('src/tools/FileWriteTool/FileWriteTool.ts').includes(
        '${userModifiedNote}${currentFileStateNote}',
      ),
    )
  },
)

test('modeled file behavior exercises both feature outcomes', () => {
  const unchangedStub = enabled =>
    enabled
      ? 'Wasted call — file unchanged since your last Read. Refer to that earlier tool_result instead.'
      : 'File unchanged since last read. The content from the earlier Read tool_result in this conversation is still current — refer to that instead of re-reading.'
  assert.match(unchangedStub(true), /^Wasted call/)
  assert.match(unchangedStub(false), /^File unchanged/)

  const write = (oldContent, content, mode) =>
    mode === 'append' ? (oldContent ?? '') + content : content
  assert.equal(write('before', ' after', 'append'), 'before after')
  assert.equal(write('before', 'replace', 'overwrite'), 'replace')
  assert.equal(write(null, 'new', 'append'), 'new')
})
