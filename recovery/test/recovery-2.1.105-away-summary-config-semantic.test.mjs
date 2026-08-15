import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const isCurrentSource =
  path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const target107BundlePath = process.env.CLAUDE_CODE_2_1_107_BUNDLE
const target116BundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
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

const targetUnits = new Map([
  [2596, [1046587, 1070166, 'db00de232bb6eb420f145e74c36339269fc1be3cae344ce87cfce8bf8be5fb27']],
  [8749, [5937901, 5938098, '7ebeef6342235e6cf556dcc266d6d74de1eefcbe674a451964957fd3f9cc7aa1']],
  [8823, [5961365, 5963456, '9afa63e6046e2b8f347cbbd8d49b4c88a44af8036a39d555b739b95415318db5']],
  [13489, [10104616, 10105295, 'edfcc7e429fafab498a5ae70028463861dd3b0fd3fc1411f35eb71c8ad72a33a']],
  [13956, [10285399, 10313223, 'fe4dc2baec94c5d62e887fe4b9e9ae6ca9775949d75b5c4b40254d182fb8b65d']],
  [18109, [12614618, 12616945, 'c3c6199a7124d04e413788b5e9b3c28d793db6a6ad9213b5f36a451789265071']],
  [19107, [13549399, 13604560, '9a4b0aee2b5e06161abe44cd8f91c64a7333e23a736e273ce8851e9dcf8e3725']],
])

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_104_BUNDLE and CLAUDE_CODE_2_1_105_BUNDLE are required'
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

function includesAll(contents, fragments, label) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${label}: ${fragment}`)
  }
}

test('target105 pins every changed away-summary configuration unit', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath)
  const target = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baseline),
    'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
  )
  assert.equal(
    sha256(target),
    '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
  )
  const targetText = target.toString('utf8')
  for (const [index, identity] of targetUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
      `${index}: structural identity`,
    )
    const unit = targetText.slice(identity[0], identity[1])
    assert.equal(sha256(unit), identity[2], `${index}: target bytes`)
    assert.equal(
      parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
      1,
      `${index}: one top-level statement`,
    )
  }
})

test('away-summary controls enter at target105 and preserve their versioned defaults', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  for (const fragment of [
    'awaySummaryEnabled',
    'CLAUDE_CODE_ENABLE_AWAY_SUMMARY',
    'tengu_sedge_lantern_config',
    '[awaySummary] skipped: cache age unknown',
    '[awaySummary] skipped: cache stale',
    '(disable recaps in /config)',
    'tengu_return_to_session',
    'Session recap',
  ]) {
    assert.equal(baseline.includes(fragment), false, `${fragment}: target104`)
    assert.equal(target.includes(fragment), true, `${fragment}: target105`)
  }
  assert.ok(target.includes('h8("tengu_sedge_lantern",!1)'))

  if (target107BundlePath) {
    const target107 = fs.readFileSync(target107BundlePath, 'utf8')
    assert.ok(target107.includes('h8("tengu_sedge_lantern",!1)'))
    assert.ok(target107.includes('tengu_sedge_lantern_config'))
  }
  if (target116BundlePath) {
    const target116 = fs.readFileSync(target116BundlePath, 'utf8')
    assert.ok(target116.includes('"tengu_sedge_lantern",!0'))
    assert.ok(target116.includes('[awaySummary] skipped: draft input present'))
  }
})

test('source owns the reachable gate, state, settings, hook, and telemetry graph', sourceOptions, () => {
  const gate = source('src/utils/awaySummaryEnabled.ts')
  includesAll(
    gate,
    [
      'CLAUDE_CODE_ENABLE_AWAY_SUMMARY',
      'isEnvDefinedFalsy(envValue)',
      'isEnvTruthy(envValue)',
      "'tengu_sedge_lantern'",
      'getIsNonInteractiveSession()',
      'getInitialSettings()?.awaySummaryEnabled !== false',
    ],
    'awaySummaryEnabled.ts',
  )
  assert.ok(
    gate.includes(
      isCurrentSource
        ? "'tengu_sedge_lantern', true"
        : "'tengu_sedge_lantern', false",
    ),
  )

  const helperMatch = gate.match(
    /export function isAwaySummaryEnabled\(\): boolean \{([\s\S]*?)\n\}/,
  )
  assert.ok(helperMatch)
  const evaluate = new Function(
    'process',
    'isEnvDefinedFalsy',
    'isEnvTruthy',
    'getFeatureValue_CACHED_MAY_BE_STALE',
    'getIsNonInteractiveSession',
    'getInitialSettings',
    helperMatch[1],
  )
  const run = ({ env, gateValue = true, nonInteractive = false, setting } = {}) =>
    evaluate(
      { env: { CLAUDE_CODE_ENABLE_AWAY_SUMMARY: env } },
      value => value === '0',
      value => value === '1',
      () => gateValue,
      () => nonInteractive,
      () => setting === undefined ? {} : { awaySummaryEnabled: setting },
    )
  assert.equal(run({ env: '0', gateValue: true }), false)
  assert.equal(run({ env: '1', gateValue: false, nonInteractive: true, setting: false }), true)
  assert.equal(run({ gateValue: false }), false)
  assert.equal(run({ nonInteractive: true }), false)
  assert.equal(run({ setting: false }), false)
  assert.equal(run(), true)

  includesAll(
    source('src/utils/settings/types.ts'),
    ['awaySummaryEnabled: z', '@internal When false, the session recap'],
    'settings schema',
  )
  includesAll(
    source('src/state/AppStateStore.ts'),
    [
      'awaySummaryEnabled: boolean',
      'awaySummaryEnabled: isAwaySummaryEnabled()',
    ],
    'AppStateStore',
  )
  const settingsChange = source('src/utils/settings/applySettingsChange.ts')
  includesAll(
    settingsChange,
    [
      'const awaySummaryEnabled = isAwaySummaryEnabled()',
      'prev.awaySummaryEnabled !== awaySummaryEnabled',
      '? { awaySummaryEnabled }',
    ],
    'applySettingsChange',
  )
  const config = source('src/components/Settings/Config.tsx')
  includesAll(
    config,
    [
      "id: 'awaySummaryEnabled'",
      "label: 'Session recap'",
      'value: awaySummaryEnabled',
      'awaySummaryEnabled: enabled_2 ? undefined : false',
      'awaySummaryEnabled: iu?.awaySummaryEnabled',
      'awaySummaryEnabled: ia.awaySummaryEnabled',
    ],
    'Config',
  )
  assert.ok(
    config.includes(
      isCurrentSource
        ? "'tengu_sedge_lantern', true"
        : "'tengu_sedge_lantern', false",
    ),
  )

  const hook = source('src/hooks/useAwaySummary.ts')
  includesAll(
    hook,
    [
      'const DEFAULT_DELAY_MS = 3 * 60_000',
      'const MIN_DELAY_MS = 30_000',
      'const MIN_USER_MESSAGES = 3',
      'const MIN_USER_MESSAGES_SINCE_RECAP = 2',
      "'tengu_sedge_lantern_config'",
      "'[awaySummary] skipped: cache age unknown'",
      "'[awaySummary] skipped: cache stale'",
      'cacheTtl * 0.9',
      'Math.min(delayRef.current, cacheTtl * 0.8)',
      'lastSignificantMessageIsAwaySummary(messagesRef.current)',
      '`${text} (disable recaps in /config)`',
      "last?.type === 'system' && last.subtype === 'api_metrics'",
      "logEvent('tengu_return_to_session'",
      'scrolledBeforeSubmit: lastScrollAtRef.current > focusedAt',
      'isFullscreen: isFullscreenEnvEnabled()',
    ],
    'useAwaySummary',
  )
  if (isCurrentSource) {
    assert.ok(hook.includes("should1hCacheTTL('repl_main_thread')"))
    assert.ok(hook.includes("'[awaySummary] skipped: draft input present'"))
  } else {
    assert.ok(
      hook.includes(
        "getCacheControl({ querySource: 'repl_main_thread' }).ttl === '1h'",
      ),
    )
    assert.equal(hook.includes('draft input present'), false)
  }
  includesAll(
    source('src/screens/REPL.tsx'),
    ['useAwaySummary(messages, setMessages, isLoading, lastUserScrollTsRef)'],
    'REPL call path',
  )
  includesAll(
    source('src/main.tsx'),
    [
      "import { isAwaySummaryEnabled } from './utils/awaySummaryEnabled.js'",
      'awaySummaryEnabled: isAwaySummaryEnabled()',
    ],
    'main initialization',
  )
})
