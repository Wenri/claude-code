import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.98-to-2.1.100'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetSha256 =
  'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be'
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
      ? 'CLAUDE_CODE_2_1_100_BUNDLE is not set'
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

test('2.1.100 evidence pins spinner behavior and threshold units', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), targetSha256)
  const bundle = bytes.toString('utf8')
  const expected = new Map([
    [
      10961,
      [
        8627272,
        8630102,
        '652512d84f627134f440bacd74981795af059819432c6d75af9279c0c767ca18',
      ],
    ],
    [
      10963,
      [
        8630560,
        8630612,
        '866a151745f1745f9608485bdabcc494ca19c158fc23470a5bb98ad7bba30f7d',
      ],
    ],
  ])
  for (const [index, identity] of expected) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
    )
    assert.equal(
      sha256(bundle.slice(region.target.start, region.target.end)),
      region.target.sourceHash,
    )
  }

  const spinner = bundle.slice(
    structural.regions[10961].target.start,
    structural.regions[10961].target.end,
  )
  for (const fragment of [
    'q==="thinking"',
    'chord:"escape",action:"interrupt",format:{keyCase:"lower"}',
  ]) {
    assert.ok(spinner.includes(fragment), fragment)
  }
  assert.ok(
    bundle
      .slice(
        structural.regions[10963].target.start,
        structural.regions[10963].target.end,
      )
      .includes('=16000'),
  )
})

test('source recovers the target100 spinner transition', sourceOptions, () => {
  const spinner = source('src/components/Spinner/SpinnerAnimationRow.tsx')
  for (const fragment of [
    'const SHOW_TOKENS_AFTER_MS = 16_000',
    "hasActiveTools || leaderIsIdle || mode === 'thinking'",
    '<KeyboardShortcutHint chord="escape" action="interrupt"',
    "format={{ keyCase: 'lower' }}",
  ]) {
    assert.ok(spinner.includes(fragment), fragment)
  }
})

test(
  'latest source retains the target116 progressive thinking and token gates',
  { skip: sourceOptions.skip || !isCurrentSource },
  () => {
    const spinner = source('src/components/Spinner/SpinnerAnimationRow.tsx')
    for (const fragment of [
      'function thinkingMilestone(elapsedMs: number)',
      'verbose || hasRunningTeammates || wantsThinking || totalTokens > 0 || effectiveElapsedMs > SHOW_TOKENS_AFTER_MS',
      "effortSuffix || thinkingMilestone(effectiveElapsedMs) !== 'thinking'",
    ]) {
      assert.ok(spinner.includes(fragment), fragment)
    }
  },
)

test(
  'latest shared hint implements the inherited formatter API used by the spinner',
  { skip: sourceOptions.skip || !isCurrentSource },
  () => {
    const hint = source('src/components/design-system/KeyboardShortcutHint.tsx')
    for (const fragment of [
      'export function formatKeyboardShortcut',
      "escape: ['Esc', 'esc', '⎋']",
      "compact: {",
      "symbol: {",
      "chord?: string | string[]",
      "if (!display) return null",
    ]) {
      assert.ok(hint.includes(fragment), fragment)
    }
  },
)
