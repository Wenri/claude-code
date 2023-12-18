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
const isCurrentSource =
  path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_96_BUNDLE
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
const adjacentOptions = {
  skip:
    bundleOptions.skip || !baselineBundlePath
      ? bundleOptions.skip || 'CLAUDE_CODE_2_1_96_BUNDLE is not set'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test(
  '2.1.97 AppleScript quote evidence pins the complete owning function',
  bundleOptions,
  () => {
    const bytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(bytes), targetSha256)
    const bundle = bytes.toString('utf8')
    const region = structural.regions[18325]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [
        13089287,
        13089410,
        '0d100fe08615ff494162d8120895929106bae39ca2fd14a4d0006fe36d1b22e7',
      ],
    )
    const targetFunction = bundle.slice(region.target.start, region.target.end)
    assert.equal(sha256(targetFunction), region.target.sourceHash)
    assert.ok(targetFunction.includes('replaceAll("\\t","\\\\t")'))
    assert.ok(targetFunction.includes('replaceAll(`\n`,"\\\\n")'))

    const cmdRegion = structural.regions[18327]
    assert.equal(cmdRegion.classification, 'unresolved')
    assert.deepEqual(
      [cmdRegion.target.start, cmdRegion.target.end, cmdRegion.target.sourceHash],
      [
        13089462,
        13089581,
        'd660c4984e2c542e9f982ac9f410a7a46e2262b03cf211e9ef3ae4545afeb0e5',
      ],
    )
    const cmdFunction = bundle.slice(cmdRegion.target.start, cmdRegion.target.end)
    assert.equal(sha256(cmdFunction), cmdRegion.target.sourceHash)
    for (const fragment of [
      'replace(/[\\n\\t]/g," ")',
      'replaceAll(\'"\',"")',
      'replaceAll("%","%%")',
      'replace(/(\\\\+)$/,"$1$1")',
    ]) {
      assert.ok(cmdFunction.includes(fragment), fragment)
    }
  },
)

test(
  'source quotes AppleScript backslashes, quotes, newlines, and tabs',
  sourceOptions,
  () => {
    const source = fs.readFileSync(
      path.join(sourceRoot, 'utils/deepLink/terminalLauncher.ts'),
      'utf8',
    )
    for (const fragment of [
      String.raw`replaceAll('\\', '\\\\')`,
      String.raw`replaceAll('"', '\\"')`,
      String.raw`replaceAll('\n', '\\n')`,
      String.raw`replaceAll('\t', '\\t')`,
    ]) {
      assert.ok(source.includes(fragment), fragment)
    }

    const quote = value =>
      `"${value
        .replaceAll('\\', '\\\\')
        .replaceAll('"', '\\"')
        .replaceAll('\n', '\\n')
        .replaceAll('\t', '\\t')}"`
    assert.equal(
      quote('one\\two\n"three"\tfour'),
      '"one\\\\two\\n\\"three\\"\\tfour"',
    )

    const cmdFragments = isCurrentSource
      ? [
          ".replace(/[\\n\\t]/g, ' ')",
          `.replace(/["%]/g, '')`,
          ".replace(/(\\\\+)$/, '$1$1')",
        ]
      : [
          ".replace(/[\\n\\t]/g, ' ')",
          ".replaceAll('\"', '')",
          ".replaceAll('%', '%%')",
          ".replace(/(\\\\+)$/, '$1$1')",
        ]
    for (const fragment of cmdFragments) {
      assert.ok(source.includes(fragment), fragment)
    }

    const cmdQuote = value => {
      const normalized = value.replace(/[\n\t]/g, ' ')
      const stripped = isCurrentSource
        ? normalized.replace(/["%]/g, '')
        : normalized.replaceAll('"', '').replaceAll('%', '%%')
      return `"${stripped.replace(/(\\+)$/, '$1$1')}"`
    }
    assert.equal(
      cmdQuote('a\n%PATH%\t"b"\\'),
      isCurrentSource ? '"a PATH b\\\\"' : '"a %%PATH%% b\\\\"',
    )
  },
)

test('2.1.96 predates the recovered terminal quoting changes', adjacentOptions, () => {
  const bytes = fs.readFileSync(baselineBundlePath)
  assert.equal(
    sha256(bytes),
    '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e',
  )
  const bundle = bytes.toString('utf8')
  assert.equal(bundle.includes('replaceAll("%","%%")'), false)
  assert.equal(bundle.includes('replaceAll("\\t","\\\\t")'), false)
})
