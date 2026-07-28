import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const sourceRoot = fileURLToPath(new URL('../../src/', import.meta.url))
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const BASELINE_BUNDLE_SHA256 =
  'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb'
const TARGET_BUNDLE_SHA256 =
  'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39'

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

test('recovers the byte-level SSE idle watchdog', () => {
  const client = source('services/api/client.ts')

  assert.match(client, /class StreamIdleTimeoutError extends Error/)
  assert.match(client, /this\.name = 'StreamIdleTimeoutError'/)
  assert.match(client, /stream idle: no bytes for \$\{idleMs\}ms/)
  assert.match(
    client,
    /body\.pipeThrough\([\s\S]*new TransformStream<Uint8Array, Uint8Array>/,
  )
  assert.match(client, /start: resetIdleTimeout/)
  assert.match(
    client,
    /transform\(chunk, controller\)[\s\S]*resetIdleTimeout\(controller\)[\s\S]*controller\.enqueue\(chunk\)/,
  )
  assert.match(client, /flush: clearIdleTimeout/)
  assert.match(client, /timeout\.unref\?\.\(\)/)
})

test('wraps only first-party SSE responses and preserves response metadata', () => {
  const client = source('services/api/client.ts')

  assert.match(client, /provider === 'firstParty'/)
  assert.match(client, /\(provider as string\) === 'anthropicAws'/)
  assert.match(client, /!process\.env\.ANTHROPIC_AWS_BASE_URL/)
  assert.match(
    client,
    /response\.headers\.get\('content-type'\)\?\.includes\('text\/event-stream'\)/,
  )
  assert.match(
    client,
    /parseInt\(process\.env\.CLAUDE_STREAM_IDLE_TIMEOUT_MS \|\| '', 10\) \|\| 90000/,
  )
  assert.match(client, /Math\.max\([\s\S]*15000/)
  assert.match(
    client,
    /new Response\([\s\S]*addStreamIdleTimeout\(response\.body, idleMs\),[\s\S]*response,/,
  )
  assert.match(
    client,
    /Object\.defineProperty\(wrappedResponse, 'url', \{ value: response\.url \}\)/,
  )
})

test('distinguishes event and byte watchdogs and never replays partial output', () => {
  const claude = source('services/api/claude.ts')

  assert.match(
    claude,
    /streamingError instanceof StreamIdleTimeoutError[\s\S]*tier: 'byte'/,
  )
  assert.match(
    claude,
    /timeout_ms: STREAM_IDLE_TIMEOUT_MS,[\s\S]*tier: 'event'/,
  )
  assert.match(
    claude,
    /newMessages\.length > 0[\s\S]*Stream idle timeout - partial response received/,
  )
  assert.match(
    claude,
    /streamingError instanceof APIUserAbortError[\s\S]*else if \(!streamIdleAborted\)/,
  )
  assert.match(claude, /fallback_cause:\s*'partial_yield'/)
  assert.match(
    claude,
    /initialConsecutive529Errors: is529Error\(streamingError\) \? 1 : 0/,
  )

  const partialGuard = claude.indexOf('if (newMessages.length > 0)')
  const fallbackDispatch = claude.indexOf(
    'didFallBackToNonStreaming = true',
    partialGuard,
  )
  assert.ok(partialGuard >= 0)
  assert.ok(fallbackDispatch > partialGuard)
  assert.match(
    claude.slice(partialGuard, fallbackDispatch),
    /throw fallbackError/,
  )
})

test('authenticated adjacent bundles contain every target-only sentinel', () => {
  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_101_BUNDLE',
    BASELINE_BUNDLE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_104_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )

  const targetOnly = [
    'StreamIdleTimeoutError',
    'stream idle: no bytes for ',
    'Streaming idle timeout (byte-level): ',
    'Stream idle timeout - partial response received',
    'partial_yield',
    '# Text output (does not apply to tool calls)',
  ]
  for (const fragment of targetOnly) {
    assert.equal(baseline.includes(fragment), false, fragment)
    assert.equal(target.includes(fragment), true, fragment)
  }

  assert.equal(baseline.includes('# Communication style'), true)
  assert.equal(target.includes('# Communication style'), false)
})
