import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const bundleSpecs = [
  {
    env: 'CLAUDE_CODE_2_1_120_BUNDLE',
    bytes: 13_784_743,
    sha256:
      'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f',
  },
  {
    env: 'CLAUDE_CODE_2_1_121_BUNDLE',
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
]

function loadBundle({ env, bytes, sha256 }) {
  const filename = process.env[env]
  assert.ok(filename, `${env} must be set`)
  const contents = fs.readFileSync(filename)
  assert.equal(contents.length, bytes, `${env}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(contents).digest('hex'),
    sha256,
    `${env}: SHA-256`,
  )
  return contents.toString('utf8')
}

function occurrences(value, fragment) {
  return value.split(fragment).length - 1
}

function compact(value) {
  return value.replaceAll(/\s+/g, ' ').trim()
}

test('authenticated adjacent bundles retain the complete gated feedback surface', () => {
  const exactOnce = [
    'tengu_amber_lynx',
    'Feedback sent',
    'Reference ID: ',
    "If you're working with Anthropic support, please include the ID above.",
    'Press any key to close',
    "Couldn't send feedback: not signed in. Run /login, then retry.",
    ' (request timed out)',
    " (couldn't reach the service)",
    'Feedback / bug report cancelled',
    'Feedback / bug report submitted',
    'Thank you for your report!',
    'to open your browser and draft a GitHub issue, or any other key to',
    'surface:"cli"',
  ]

  for (const bundle of bundleSpecs.map(loadBundle)) {
    for (const fragment of exactOnce) {
      assert.equal(occurrences(bundle, fragment), 1, fragment)
    }
    assert.equal(occurrences(bundle, "Couldn't send feedback"), 2)
    assert.equal(occurrences(bundle, 'Error submitting feedback / bug report'), 2)
  }
})

test('source selects report delivery and completion UX with the authenticated gate', () => {
  const feedback = compact(
    fs.readFileSync(path.join(repo, 'src/components/Feedback.tsx'), 'utf8'),
  )

  assert.ok(
    feedback.includes(
      "getFeatureValue_CACHED_MAY_BE_STALE('tengu_amber_lynx', false)",
    ),
  )
  assert.match(
    feedback,
    /Promise\.all\(\[submitFeedbackReport\(\{ messages, description, surface: 'cli', backgroundTasks, signal: abortSignal \}\), useNewFeedbackFlow \? Promise\.resolve\(null\) : generateTitle\(description, abortSignal\)\]\)/,
  )
  assert.ok(
    feedback.includes(
      "Couldn't send feedback: not signed in. Run /login, then retry.",
    ),
  )
  assert.ok(feedback.includes('` (server returned ${result.statusCode})`'))
  assert.ok(feedback.includes("' (request timed out)'"))
  assert.ok(feedback.includes('" (couldn\'t reach the service)"'))
  assert.ok(
    feedback.includes(
      '`Couldn\'t send feedback${failureDetail}. If it keeps failing, you can file at ${GITHUB_ISSUES_REPO_URL} instead.`',
    ),
  )
  assert.ok(feedback.includes('<StatusIcon status="success" withSpace />Feedback sent'))
  assert.ok(feedback.includes('Reference ID: <Text dimColor>{feedbackId}</Text>'))
  assert.ok(
    feedback.includes(
      "If you&apos;re working with Anthropic support, please include the ID above.",
    ),
  )
  assert.ok(feedback.includes('Thank you for your report!'))
})

test('source preserves exact cancel, close, and legacy GitHub key semantics', () => {
  const feedback = compact(
    fs.readFileSync(path.join(repo, 'src/components/Feedback.tsx'), 'utf8'),
  )

  assert.match(
    feedback,
    /const handleCancel = useCallback\(\(\) => \{ onDone\('Feedback \/ bug report cancelled', \{ display: 'system' \}\); \}, \[onDone\]\)/,
  )
  assert.ok(feedback.includes('if (event.ctrl || event.meta) return'))
  assert.ok(
    feedback.includes(
      "!useNewFeedbackFlow && event.key === 'return' && title",
    ),
  )
  assert.ok(
    feedback.includes(
      "step === 'consent' && (event.key === 'return' || event.key === ' ')",
    ),
  )
  assert.ok(
    feedback.includes(
      "const isCancelActive = step !== 'userInput' && !isFinished",
    ),
  )
  assert.ok(
    feedback.includes(
      "const hideInputGuide = step === 'submitting' || step === 'done'",
    ),
  )
  assert.ok(
    feedback.includes(
      '<Box flexDirection="column" tabIndex={0} autoFocus onKeyDown={handleKeyDown}>',
    ),
  )
  assert.ok(!feedback.includes('useInput('))
})
