import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const baselineBundlePath = process.env.CLAUDE_CODE_2_1_108_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_109_BUNDLE
const BASELINE_BUNDLE_SHA256 =
  'dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73'
const TARGET_BUNDLE_SHA256 =
  '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7'

const TARGET_HINTS = [
  [1000, 'Hmm…'],
  [6000, 'This one needs a moment…'],
  [12000, 'Working through it…'],
  [20000, 'Untangling some thoughts…'],
  [28000, 'Weighing a few approaches…'],
  [36000, 'Consulting the rubber duck…'],
  [48000, 'Cross-referencing seventeen theories…'],
  [60000, 'Double-checking the double-checks…'],
  [80000, 'Almost there…'],
  [108000, 'Pacing in small circles…'],
  [120000, 'Reticulating splines…'],
  [135000, 'Hmm…?'],
  [150000, 'Staring thoughtfully into the middle distance…'],
  [165000, 'Still here, still at it…'],
]

const BASELINE_HINTS = [
  'Thinking a bit longer… still working on it…',
  'Hang tight… really working through this one…',
  'This is a harder one… it might take another minute…',
  'Still going… thanks for hanging in there…',
  'Taking the time to get this right… thanks for your patience…',
]

function source(relative) {
  return fs.readFileSync(
    fileURLToPath(new URL(`../../${relative}`, import.meta.url)),
    'utf8',
  )
}

function requiredBundle(filename, label, expectedSha256) {
  assert.ok(filename, `${label} environment variable must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    expectedSha256,
  )
  return bytes.toString('utf8')
}

test('recovers the rotating extended-thinking indicator', () => {
  const indicator = source('src/components/ThinkingIndicator.tsx')

  assert.deepEqual(
    [...indicator.matchAll(/afterMs: (\d+)/g)].map(match => Number(match[1])),
    TARGET_HINTS.map(([afterMs]) => afterMs),
  )
  for (const [, hint] of TARGET_HINTS) {
    assert.equal(indicator.includes(`text: '${hint}'`), true, hint)
  }
  assert.match(
    indicator,
    /<ToolUseLoader shouldAnimate=\{true\} isUnresolved=\{true\} isError=\{false\} \/>/,
  )
  assert.match(indicator, /<Text>Thinking<\/Text>/)
  assert.match(
    indicator,
    /<MessageResponse>\s*<Text dimColor=\{true\}>\{THINKING_HINTS\[hintIndex\]!\.text\}<\/Text>/,
  )
  assert.match(
    indicator,
    /THINKING_HINTS\.map\(\(hint, index\) => setTimeout\(setHintIndex, hint\.afterMs, index\)\)/,
  )
  assert.match(
    indicator,
    /if \(!isLoading\) \{\s*if \(hintIndexRef\.current !== -1\) setHintIndex\(-1\);\s*return;/,
  )
  assert.match(indicator, /for \(const timer of timers\) clearTimeout\(timer\)/)
  assert.match(indicator, /\}, \[isLoading\]\);/)
  assert.match(
    indicator,
    /if \(hintIndex < 0 \|\| !isLoading\) return null;/,
  )
})

test('moves the thinking hint into the message stream', () => {
  const messages = source('src/components/Messages.tsx')
  const repl = source('src/screens/REPL.tsx')

  assert.match(messages, /showThinkingHint = false/)
  assert.match(
    messages,
    /\{showThinkingHint && <ThinkingIndicator isLoading=\{isLoading\} \/>\}/,
  )
  assert.ok(
    messages.indexOf('<ThinkingIndicator') <
      messages.indexOf('{streamingText && !isBriefOnly'),
  )
  assert.match(
    repl,
    /showThinkingHint=\{streamMode === 'thinking' && !viewedAgentTask\}/,
  )
  assert.match(
    repl,
    /setSpinnerShimmerColor\(null\);\s*setStreamMode\('responding'\);/,
  )
  assert.equal(repl.includes('THINKING_MILESTONES'), false)
  for (const hint of BASELINE_HINTS) {
    assert.equal(repl.includes(hint), false, hint)
  }
})

test('authenticated adjacent bundles contain the recovered replacement', () => {
  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_108_BUNDLE',
    BASELINE_BUNDLE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_109_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )

  for (const [, hint] of TARGET_HINTS) {
    assert.equal(baseline.includes(hint), false, hint)
    assert.equal(target.includes(hint), true, hint)
  }
  for (const hint of BASELINE_HINTS) {
    assert.equal(baseline.includes(hint), true, hint)
    assert.equal(target.includes(hint), false, hint)
  }

  for (const fragment of [
    'showThinkingHint:G=!1',
    'showThinkingHint:!GN',
    'G&&NK.createElement(dgK,{isLoading:W})',
    'Qq8("responding")',
    'shouldAnimate:!0,isUnresolved:!0,isError:!1',
  ]) {
    assert.equal(baseline.includes(fragment), false, fragment)
    assert.equal(target.includes(fragment), true, fragment)
  }
})
