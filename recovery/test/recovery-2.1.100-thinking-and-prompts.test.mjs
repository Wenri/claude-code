import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const sourceRoot = fileURLToPath(new URL('../../src/', import.meta.url))
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_98_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const BASELINE_BUNDLE_SHA256 =
  '27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556'
const TARGET_BUNDLE_SHA256 =
  'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be'
const THINKING_MILESTONES = [
  'Thinking a bit longer… still working on it…',
  'This is a harder one… it might take a few more minutes…',
  'Hang tight… really working through this one…',
]
const OLD_END_OF_TURN =
  "End-of-turn summaries: state what changed and what's next. That's it — no recapping the journey, no restating the problem, no listing everything you considered."
const NEW_END_OF_TURN =
  "End-of-turn summary: one or two sentences. What changed and what's next. Nothing else."
const OLD_EXPLORATORY =
  'When the user asks an open-ended or exploratory question ("what could we do about X?", "how should we approach this?", "what do you think?"), respond with analysis, options, and tradeoffs — do not jump straight to implementation.'
const NEW_EXPLORATORY =
  'For exploratory questions ("what could we do about X?", "how should we approach this?", "what do you think?"), respond in 2-3 sentences with a recommendation and the main tradeoff.'
const NUMERIC_LENGTH_ANCHORS =
  'Length limits: keep text between tool calls to ≤25 words. Keep final responses to ≤100 words unless the task requires more detail.'

function source(relativePath) {
  return fs.readFileSync(`${sourceRoot}${relativePath}`, 'utf8')
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

test('tracks the verified successor to the progressive thinking milestones', () => {
  const repl = source('screens/REPL.tsx')
  const messages = source('components/Messages.tsx')
  const indicator = source('components/ThinkingIndicator.tsx')

  for (const milestone of THINKING_MILESTONES) {
    assert.equal(repl.includes(milestone), false, milestone)
  }
  assert.match(
    indicator,
    /afterMs: 1000,[\s\S]*afterMs: 60000,[\s\S]*afterMs: 120000,[\s\S]*afterMs: 165000,/,
  )
  assert.match(
    indicator,
    /THINKING_HINTS\.map\(\(hint, index\) => setTimeout\(setHintIndex, hint\.afterMs, index\)\)/,
  )
  assert.match(
    messages,
    /\{showThinkingHint && <ThinkingIndicator isLoading=\{isLoading\} \/>\}/,
  )
})

test('recovers the slower stalled-response animation', () => {
  const stalled = source('components/Spinner/useStalledAnimation.ts')

  assert.match(
    stalled,
    /timeSinceLastToken > 10000 && !hasActiveTools/,
  )
  assert.match(
    stalled,
    /Math\.min\(\(timeSinceLastToken - 10000\) \/ 10000, 1\)/,
  )
  assert.doesNotMatch(stalled, /timeSinceLastToken > 3000/)
})

test('removes the obsolete output-efficiency prompt owner', () => {
  const prompts = source('constants/prompts.ts')

  assert.doesNotMatch(prompts, /function getOutputEfficiencySection/)
  assert.doesNotMatch(prompts, /getOutputEfficiencySection\(\)/)
  assert.equal(prompts.includes('# Communicating with the user'), false)
  assert.equal(prompts.includes('# Output efficiency'), false)
})

test('authenticated adjacent bundles contain every observed release behavior', () => {
  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_98_BUNDLE',
    BASELINE_BUNDLE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_100_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )

  for (const milestone of THINKING_MILESTONES) {
    assert.equal(baseline.includes(milestone), false, milestone)
    assert.equal(target.includes(milestone), true, milestone)
  }

  assert.match(
    baseline,
    /let H=j>3000&&!_,J=H\?Math\.min\(\(j-3000\)\/2000,1\):0/,
  )
  assert.match(
    target,
    /let H=j>1e4&&!_,J=H\?Math\.min\(\(j-1e4\)\/1e4,1\):0/,
  )

  assert.equal(baseline.includes('# Communicating with the user'), true)
  assert.equal(baseline.includes('# Output efficiency'), true)
  assert.equal(target.includes('# Communicating with the user'), false)
  assert.equal(target.includes('# Output efficiency'), false)

  assert.equal(baseline.includes(OLD_END_OF_TURN), true)
  assert.equal(target.includes(OLD_END_OF_TURN), false)
  assert.equal(baseline.includes(NEW_END_OF_TURN), false)
  assert.equal(target.includes(NEW_END_OF_TURN), true)

  assert.equal(baseline.includes(OLD_EXPLORATORY), true)
  assert.equal(target.includes(OLD_EXPLORATORY), false)
  assert.equal(baseline.includes(NEW_EXPLORATORY), false)
  assert.equal(target.includes(NEW_EXPLORATORY), true)

  assert.equal(baseline.includes(NUMERIC_LENGTH_ANCHORS), false)
  assert.equal(target.includes(NUMERIC_LENGTH_ANCHORS), true)
})
