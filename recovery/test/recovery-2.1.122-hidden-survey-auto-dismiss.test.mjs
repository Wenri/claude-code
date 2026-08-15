import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = [
  {
    version: '2.1.121',
    envNames: ['CLAUDE_CODE_2_1_121_BUNDLE', 'CLAUDE_2_1_121_CLI_INNER'],
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
    propertyCount: 0,
    fragmentCount: 0,
  },
  {
    version: '2.1.122',
    envNames: ['CLAUDE_CODE_2_1_122_BUNDLE', 'CLAUDE_2_1_122_CLI_INNER'],
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    propertyCount: 2,
    fragmentCount: 1,
  },
]

function readBundle(release) {
  const filename = release.envNames
    .map(name => process.env[name])
    .find(Boolean)
  assert.ok(filename, `${release.envNames.join(' or ')} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return bytes.toString('utf8')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

test('authenticates the target-only memory-survey timeout', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const property of ['autoDismissAfterMs', 'onAutoDismiss']) {
      assert.equal(
        occurrences(bundle, property),
        release.propertyCount,
        `${release.version}: ${property}`,
      )
    }
    for (const fragment of [
      'if(O!=="open"||!q)return;let I=setTimeout',
      'C("closed"),F(null),R.current?.(S)',
      'autoDismissAfterMs:tT5,onOpen:j,onSelect:J,onAutoDismiss:X',
      'w("timeout",R)',
      'tT5=60000',
    ]) {
      assert.equal(
        occurrences(bundle, fragment),
        release.fragmentCount,
        `${release.version}: ${fragment}`,
      )
    }
  }
})

test('source auto-dismiss closes only an open survey and reports memory timeout', () => {
  const surveyState = compact(
    fs.readFileSync(
      path.join(repo, 'src/components/FeedbackSurvey/useSurveyState.tsx'),
      'utf8',
    ),
  )
  const memorySurvey = compact(
    fs.readFileSync(
      path.join(repo, 'src/components/FeedbackSurvey/useMemorySurvey.tsx'),
      'utf8',
    ),
  )
  const feedbackSurvey = compact(
    fs.readFileSync(
      path.join(repo, 'src/components/FeedbackSurvey/useFeedbackSurvey.tsx'),
      'utf8',
    ),
  )

  for (const fragment of [
    'autoDismissAfterMs?: number',
    'onAutoDismiss?: (appearanceId: string) => void',
    'const onAutoDismissRef = useRef(onAutoDismiss)',
    'onAutoDismissRef.current = onAutoDismiss',
    "if (state !== 'open' || !autoDismissAfterMs)",
    "setState_0('closed')",
    'setLastResponse_0(null)',
    'callbackRef.current?.(currentAppearanceId)',
    'return () => clearTimeout(timeout)',
    '}, [state, autoDismissAfterMs])',
  ]) {
    assert.ok(surveyState.includes(compact(fragment)), `missing ${fragment}`)
  }

  for (const fragment of [
    'const AUTO_DISMISS_AFTER_MS = 60_000',
    "event_type: 'timeout'",
    "survey_type: 'memory'",
    'autoDismissAfterMs: AUTO_DISMISS_AFTER_MS',
    'onAutoDismiss',
  ]) {
    assert.ok(memorySurvey.includes(compact(fragment)), `missing ${fragment}`)
  }
  assert.equal(feedbackSurvey.includes('autoDismissAfterMs'), false)
  assert.equal(feedbackSurvey.includes('onAutoDismiss'), false)
})
