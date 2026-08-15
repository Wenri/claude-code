import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.91-to-2.1.92'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_92_BUNDLE
const targetSha256 =
  '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362'
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

const pins = new Map([
  [12366, ['unresolved', 9557381, 9560241, '53a6a81b33b2c0414485f70056416341ae755429048b38de66bf438b9e0abd50']],
  [12407, ['unresolved', 9574662, 9575210, '39a22eef00fd1b062783410867588366fbdaa36e967b27527a5cd863355e81e1']],
  [12415, ['unresolved', 9577715, 9577957, 'ebdc7704121f5b39a075b355154b74d1ae411132f26149e4e4530fc30bfcc861']],
  [13414, ['unresolved', 10009052, 10009614, 'af11f38c5497674d47f06dcffcbc96a66b96bdd159c7b6b337a650f5061ae3dc']],
  [13420, ['unresolved', 10010896, 10014417, '0d0b2b3c17f3ed18df2faf483e17e7b19eba3af4dcf03251f9ab41152e07acda']],
])

test('2.1.92 pins compact streaming, window resolution, notification, and both autocompact UIs', {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_92_BUNDLE is not set'
      : false,
}, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), targetSha256)
  const bundle = bytes.toString('utf8')
  for (const [index, [classification, start, end, sourceHash]] of pins) {
    const region = structural.regions[index]
    assert.equal(region.classification, classification, `${index}: class`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: identity`,
    )
    assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
  }
  for (const fragment of [
    'Compact streaming failed. hasStartedStreaming=${j}',
    'tengu_amber_redwood',
    'autocompact-experiment-hint',
    'override with CLAUDE_CODE_AUTO_COMPACT_WINDOW=1000000',
    'Auto-compact window: ${s5(z)} tokens',
    "The actual threshold is the minimum of this setting and your model's context window.",
    '↑/↓ to change · Enter to apply · Esc to cancel',
    'tengu_autocompact_dialog_opened',
  ]) {
    assert.ok(bundle.includes(fragment), fragment)
  }
})

test('materialized target92 source owns the exact compact and autocompact behavior graph', {
  skip:
    semanticCase === caseName ? false : 'historical target92 source assertion',
}, () => {
  if (semanticCase !== caseName) return
  const auto = fs.readFileSync(
    path.join(sourceRoot, 'services/compact/autoCompact.ts'),
    'utf8',
  )
  for (const fragment of [
    "getFeatureValue_CACHED_MAY_BE_STALE('tengu_amber_redwood', '')",
    "key: 'autocompact-experiment-hint'",
    'override with CLAUDE_CODE_AUTO_COMPACT_WINDOW=1000000',
    "source: 'experiment'",
  ]) assert.ok(auto.includes(fragment), fragment)

  const compact = fs.readFileSync(
    path.join(sourceRoot, 'services/compact/compact.ts'),
    'utf8',
  )
  assert.ok(
    compact.includes(
      '`Compact streaming failed. hasStartedStreaming=${hasStartedStreaming}`',
    ),
  )

  const noninteractive = fs.readFileSync(
    path.join(
      sourceRoot,
      'commands/autocompact/autocompact-noninteractive.ts',
    ),
    'utf8',
  )
  for (const fragment of [
    'Auto-compact window: ${formatTokens(configured)} tokens',
    "actual threshold is the minimum of this setting and your model\\'s context window.",
    "normalized === 'reset'",
    "updateSettingsForSource('userSettings'",
    'context.setAppState(previous =>',
  ]) assert.ok(noninteractive.includes(fragment), fragment)

  const dialog = fs.readFileSync(
    path.join(sourceRoot, 'commands/autocompact/autocompact.tsx'),
    'utf8',
  )
  for (const fragment of [
    "'select:previous': () => move(1)",
    "'tabs:next': () => move(1)",
    "{ context: 'Tabs' }",
    '↑/↓ to change · Enter to apply · Esc to cancel',
    'Both Opus 4.6 and Sonnet 4.6 achieve state-of-the-art scores',
    "logEvent('tengu_autocompact_dialog_opened'",
  ]) assert.ok(dialog.includes(fragment), fragment)

  const commands = fs.readFileSync(path.join(sourceRoot, 'commands.ts'), 'utf8')
  assert.match(commands, /autocompactNonInteractive[\s\S]*INTERNAL_ONLY_COMMANDS/)
  assert.match(
    commands,
    /INTERNAL_ONLY_COMMANDS\s*=\s*\[[\s\S]*autocompact,[\s\S]*autocompactNonInteractive/,
  )
})

test('current source preserves target116 post-compact result-dedup reset', {
  skip: semanticCase ? 'current-tree assertion' : false,
}, () => {
  const auto = fs.readFileSync(
    path.join(repositoryRoot, 'src/services/compact/autoCompact.ts'),
    'utf8',
  )
  assert.ok(auto.includes('resetToolResultDedupState(toolUseContext.resultDedupState)'))
})
