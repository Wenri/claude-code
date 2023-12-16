import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = [
  {
    env: 'CLAUDE_CODE_2_1_121_BUNDLE',
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
    eventCount: 0,
  },
  {
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    eventCount: 1,
  },
]

function readBundle(spec) {
  const filename = process.env[spec.env]
  assert.ok(filename, `${spec.env} must be set`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, spec.bytes)
  assert.equal(
    crypto.createHash('sha256').update(value).digest('hex'),
    spec.sha256,
  )
  return value.toString('utf8')
}

test('2.1.122 adds circuit-breaker telemetry at the failure threshold', () => {
  for (const spec of releases) {
    const bundle = readBundle(spec)
    assert.equal(
      bundle.split('tengu_auto_compact_circuit_breaker').length - 1,
      spec.eventCount,
    )
  }
})

test('source emits the event only in the threshold branch', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/services/compact/autoCompact.ts'),
    'utf8',
  )
  const threshold =
    'if (nextFailures >= MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES) {'
  const event = "logEvent('tengu_auto_compact_circuit_breaker'"
  assert.equal(source.split(event).length - 1, 1)
  assert.ok(source.indexOf(event) > source.indexOf(threshold))
  assert.ok(
    source.includes('consecutiveFailures: nextFailures'),
    'event carries the tripped failure count',
  )
})
