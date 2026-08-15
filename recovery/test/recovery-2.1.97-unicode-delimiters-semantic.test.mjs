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

const pinnedUnits = new Map([
  [
    12692,
    [
      9732809,
      9733093,
      'add5b6798ff0bb2060110e3d907f44cbe8c3e9ac4ba4e3be2921a353cf67b313',
    ],
  ],
  [
    12693,
    [
      9733093,
      9733215,
      'e39356de3a4a48a75c49b6356aa83d59252bae3cf96ac9eb1e204555b897c43e',
    ],
  ],
  [
    12694,
    [
      9733215,
      9733451,
      'e7df48d47001fefaddc1e7cb88091c91a1cb3d6b38cbdc3df0d9040290070d65',
    ],
  ],
  [
    17041,
    [
      12140930,
      12141221,
      'a7ad4a700518b785a51ac4f9d530c829026a44f7b4fae0e6dc9300dee3179fcf',
    ],
  ],
  [
    17052,
    [
      12144464,
      12144657,
      'fcd7c0d37184aec525cfd1cf6db6a66c56384647a9ab578ff6f3309a97b57092',
    ],
  ],
  [
    17088,
    [
      12150612,
      12151230,
      '2b1445587803890a9bd471fbf1647a9775b303dda75a39e87324460a5919b3b9',
    ],
  ],
  [
    17093,
    [
      12162998,
      12163499,
      '4fa03fe119d711549cafc7a41e4ef41f00f07205d73d0671b01822ee871d6ed4',
    ],
  ],
])

test(
  '2.1.97 Unicode-delimiter evidence pins every owning target unit',
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
    assert.ok(bundle.includes('(^|[\\s。、？！])@'))
    assert.ok(bundle.includes('[\\s。、？！]\\/([a-zA-Z0-9_:-]*)$'))
    assert.ok(bundle.includes('\\p{L}\\p{N}\\p{M}'))
  },
)

test(
  'attachment, command, and typeahead owners accept CJK punctuation boundaries',
  sourceOptions,
  () => {
    const attachments = source('src/utils/attachments.ts')
    for (const fragment of [
      '/(^|[\\s。、？！])@"([^"]+)"/g',
      '/(^|[\\s。、？！])@([^\\s]+)\\b/g',
      '/(^|[\\s。、？！])@([^\\s]+:[^\\s]+)\\b/g',
      '/(^|[\\s。、？！])@"([\\w:.@-]+) \\(agent\\)"/g',
      '/(^|[\\s。、？！])@(agent-[\\w:.@-]+)/g',
    ]) {
      assert.ok(attachments.includes(fragment), fragment)
    }

    const commands = source('src/utils/suggestions/commandSuggestions.ts')
    assert.ok(
      commands.includes('/[\\s。、？！]\\/([a-zA-Z0-9_:-]*)$/'),
    )
    assert.ok(
      commands.includes(
        '/(^|[\\s。、？！])(\\/[a-zA-Z][a-zA-Z0-9:\\-_]*)/g',
      ),
    )

    const typeahead = source('src/hooks/useTypeahead.tsx')
    for (const fragment of [
      'const HAS_AT_SYMBOL_RE = /(^|[\\s。、？！])@(',
      'const DM_MEMBER_RE = /(^|[\\s。、？！])@[\\w-]*$/',
      '/[\\s。、？！]/.test(textBeforeCursor[atIdx - 1]!)',
      '.match(DM_MEMBER_RE)',
      '\\p{L}\\p{N}\\p{M}',
    ]) {
      assert.ok(typeahead.includes(fragment), fragment)
    }

    // The direct-message grammar itself did not change in this release; it is
    // pinned because it shares the target initializer with the new trigger.
    assert.ok(
      source('src/utils/directMemberMessage.ts').includes(
        '/^@([\\w-]+)\\s+(.+)$/s',
      ),
    )
  },
)

test('the recovered delimiter set has the target observable behavior', () => {
  const boundary = /(^|[\s。、？！])@([^\s]+)\b/g
  const slash = /[\s。、？！]\/([a-zA-Z0-9_:-]*)$/
  for (const delimiter of [' ', '\n', '。', '、', '？', '！']) {
    assert.deepEqual(
      [...`${delimiter}@文件.md`.matchAll(boundary)].map(match => match[2]),
      ['文件.md'],
      delimiter,
    )
    assert.equal(`${delimiter}/help`.match(slash)?.[1], 'help', delimiter)
  }
  assert.equal('x@文件.md'.match(boundary), null)
  assert.equal('x/help'.match(slash), null)
})
