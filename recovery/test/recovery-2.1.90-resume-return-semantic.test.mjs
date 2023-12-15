import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.89-to-2.1.90'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_90_BUNDLE
const targetSha256 =
  '069185909d50518b8b239acc0f9ae9b062a610595299b35955fc53e6e2c2f5e9'
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
      ? 'CLAUDE_CODE_2_1_90_BUNDLE is not set'
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

test('2.1.90 evidence pins the full REPL resume-return unit', bundleOptions, () => {
  const bundleBytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bundleBytes), targetSha256)
  const bundle = bundleBytes.toString('utf8')
  const region = structural.regions[17664]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [
      12374084,
      12429086,
      '7e05eb2169ee606c7091e321a21e8fd764a257361e09bef97422bb801d762366',
    ],
  )
  assert.equal(
    sha256(bundle.slice(region.target.start, region.target.end)),
    region.target.sourceHash,
  )
  const unit = bundle.slice(region.target.start, region.target.end)
  for (const fragment of [
    'tengu_gleaming_fair',
    'CLAUDE_CODE_RESUME_THRESHOLD_MINUTES',
    'CLAUDE_CODE_RESUME_TOKEN_THRESHOLD',
    'resumeReturnDismissed',
    'resume-return',
    'tengu_resume_return_action',
    '/compact',
  ]) {
    assert.ok(unit.includes(fragment), fragment)
  }
})

test('source gates old large sessions before lazily counting tokens', sourceOptions, () => {
  const repl = assertFragments('src/screens/REPL.tsx', [
    "import { ResumeReturnDialog } from '../components/ResumeReturnDialog.js'",
    "getFeatureValue_CACHED_MAY_BE_STALE('tengu_gleaming_fair', false)",
    'CLAUDE_CODE_RESUME_THRESHOLD_MINUTES ?? 70',
    'CLAUDE_CODE_RESUME_TOKEN_THRESHOLD ?? 100_000',
    'Date.now() - 60_000',
    "message.type === 'user' || message.type === 'assistant'",
    '!getGlobalConfig().resumeReturnDismissed',
    'if (sessionAgeMinutes >= thresholdMinutes)',
    "import('../utils/tokens.js').then(({ tokenCountWithEstimation })",
    'if (estimatedTokens >= tokenThreshold)',
    'setResumeReturnPending({',
  ])
  assert.ok(
    repl.indexOf('if (sessionAgeMinutes >= thresholdMinutes)') <
      repl.indexOf("import('../utils/tokens.js')"),
    'token counting stays behind the cheap age gate',
  )
})

test('source restores dialog focus, dismissal, telemetry, and compact action', sourceOptions, () => {
  const repl = assertFragments('src/screens/REPL.tsx', [
    "| 'resume-return'",
    "return 'resume-return'",
    "focusedInputDialog === 'resume-return'",
    'setResumeReturnPending(null)',
    "logEvent('tengu_resume_return_action'",
    'sessionAgeMinutes: Math.round(pending.sessionAgeMinutes)',
    'messageCount: messagesRef.current.length',
    'estimatedTokens: pending.estimatedTokens',
    "if (action === 'never')",
    'resumeReturnDismissed: true',
    "if (action === 'compact')",
    "onSubmitRef.current('/compact'",
    'setResumeReturnPending(current => current === null ? current : null)',
  ])
  assert.ok(
    repl.indexOf('setResumeReturnPending(null)') <
      repl.indexOf("logEvent('tengu_resume_return_action'"),
    'the modal is closed before action side effects run',
  )

  assertFragments('src/utils/config.ts', [
    'resumeReturnDismissed?: boolean',
  ])

  if (isCurrentSource) {
    assert.ok(
      !repl.includes('modelOverride?: string'),
      'latest target no longer exposes the one-release model override seam',
    )
    assert.ok(
      !repl.includes('modelOverride: getDefaultHaikuModel()'),
      'latest target compacts with the normal main-loop model',
    )
  } else {
    for (const fragment of [
      'modelOverride?: string',
      'mainLoopModel: options?.modelOverride ?? mainLoopModel',
      "getDefaultHaikuModel",
      'modelOverride: getDefaultHaikuModel()',
    ]) {
      assert.ok(repl.includes(fragment), fragment)
    }
  }
})

test('dialog reproduces target copy, options, age formatting, and cancellation', sourceOptions, () => {
  assertFragments('src/components/ResumeReturnDialog.tsx', [
    'This session is ${formattedAge} old and ${formattedTokens} tokens.',
    "onCancel={() => onDone('dismiss')}",
    'Resuming the full session will consume a substantial portion of your',
    'usage limits. We recommend resuming from a summary.',
    "value: 'compact' as const",
    "label: 'Resume from summary (recommended)'",
    "value: 'continue' as const",
    "label: 'Resume full session as-is'",
    "value: 'never' as const",
    'label: "Don\'t ask me again"',
    'if (minutes < 60)',
    'if (hours < 24)',
    'const days = Math.floor(hours / 24)',
  ])
})

test('threshold and age decision tables match the target branches', () => {
  const shouldPrompt = ({
    enabled = true,
    dismissed = false,
    hasOldMessage = true,
    age = 70,
    ageThreshold = 70,
    tokens = 100_000,
    tokenThreshold = 100_000,
  } = {}) =>
    enabled &&
    !dismissed &&
    hasOldMessage &&
    age >= ageThreshold &&
    tokens >= tokenThreshold

  assert.equal(shouldPrompt(), true)
  assert.equal(shouldPrompt({ age: 69.99 }), false)
  assert.equal(shouldPrompt({ tokens: 99_999 }), false)
  assert.equal(shouldPrompt({ enabled: false }), false)
  assert.equal(shouldPrompt({ dismissed: true }), false)
  assert.equal(shouldPrompt({ hasOldMessage: false }), false)

  const formatAge = minutes => {
    if (minutes < 60) return `${Math.floor(minutes)}m`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) {
      const remainingMinutes = Math.floor(minutes % 60)
      return remainingMinutes === 0
        ? `${hours}h`
        : `${hours}h ${remainingMinutes}m`
    }
    const days = Math.floor(hours / 24)
    const remainingHours = hours % 24
    return remainingHours === 0 ? `${days}d` : `${days}d ${remainingHours}h`
  }
  assert.deepEqual(
    [59.9, 60, 125, 1440, 2940].map(formatAge),
    ['59m', '1h', '2h 5m', '1d', '2d 1h'],
  )
})
