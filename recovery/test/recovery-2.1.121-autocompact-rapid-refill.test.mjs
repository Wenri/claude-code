import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const specs = [
  ['CLAUDE_CODE_2_1_120_BUNDLE', 13_784_743, 'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f'],
  ['CLAUDE_CODE_2_1_121_BUNDLE', 13_908_188, '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a'],
]

function bundle([env, bytes, sha]) {
  const filename = process.env[env]
  assert.ok(filename, `${env} must be set`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, bytes)
  assert.equal(crypto.createHash('sha256').update(value).digest('hex'), sha)
  return value.toString('utf8')
}

test('2.1.121 extends rapid-refill and surfaced-context telemetry', () => {
  const [baseline, target] = specs.map(bundle)
  assert.equal(baseline.split('Autocompact is thrashing').length - 1, 1)
  assert.equal(target.split('Autocompact is thrashing').length - 1, 1)
  assert.equal(
    baseline.split('tengu_auto_compact_rapid_refill_breaker').length - 1,
    1,
  )
  assert.equal(
    target.split('tengu_auto_compact_rapid_refill_breaker').length - 1,
    2,
  )
  assert.equal(baseline.split('tengu_ptl_surfaced_to_user').length - 1, 1)
  assert.equal(target.split('tengu_ptl_surfaced_to_user').length - 1, 2)
  assert.equal(baseline.split('consecutiveRapidRefills').length - 1, 6)
  assert.equal(target.split('consecutiveRapidRefills').length - 1, 9)
})

test('source breaks proactive and reactive refill loops and reports PTL', () => {
  const autoCompact = fs.readFileSync(
    path.join(repo, 'src/services/compact/autoCompact.ts'),
    'utf8',
  )
  const query = fs.readFileSync(path.join(repo, 'src/query.ts'), 'utf8')

  assert.match(autoCompact, /tracking\.turnCounter < RAPID_REFILL_TURN_THRESHOLD/)
  assert.match(
    autoCompact,
    /\(tracking\.consecutiveRapidRefills \?\? 0\) \+ 1/,
  )
  assert.match(autoCompact, /rapidRefillBreakerTripped: true/)
  assert.match(autoCompact, /Autocompact is thrashing:/)
  assert.match(autoCompact, /consecutiveRapidRefills,/)

  assert.equal(
    query.split("logEvent('tengu_auto_compact_rapid_refill_breaker'").length - 1,
    2,
  )
  assert.equal(
    query.split("logEvent('tengu_ptl_surfaced_to_user'").length - 1,
    3,
  )
  assert.match(query, /!hasAttemptedReactiveCompact[\s\S]*?nextConsecutiveRapidRefills >= 3/)
  assert.match(query, /reactive: true/)
  assert.match(query, /reason: 'blocking_limit'[\s\S]*?wasGatedByPriorAttempt: false/)
  assert.match(query, /consecutiveRapidRefills: nextConsecutiveRapidRefills/)
  assert.match(query, /return \{ reason: 'rapid_refill_breaker' \}/)
})
