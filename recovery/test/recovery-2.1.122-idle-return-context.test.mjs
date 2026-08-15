import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const releases = [
  ['2.1.121', process.env.CLAUDE_CODE_2_1_121_BUNDLE],
  ['2.1.122', process.env.CLAUDE_CODE_2_1_122_BUNDLE],
]

function occurrences(text, needle) {
  return text.split(needle).length - 1
}

test('authenticates retained idle-return context telemetry', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')
    assert.equal(
      occurrences(bundle, 'tengu_idle_return_action'),
      2,
      `${version}: paired shown/converted events`,
    )
    assert.equal(
      occurrences(bundle, 'contextTokens'),
      2,
      `${version}: exact paired token metadata`,
    )
    assert.equal(
      occurrences(bundle, 'totalInputTokens'),
      0,
      `${version}: no renamed token metadata`,
    )
    assert.match(
      bundle,
      /"tengu_idle_return_action",\{action:"hint_converted",idleMinutes:[^}]+,messageCount:[^}]+,contextTokens:[^}]+\}/,
      `${version}: converted event field order`,
    )
    assert.match(
      bundle,
      /"tengu_idle_return_action",\{action:"hint_shown",idleMinutes:[^}]+,messageCount:[^}]+,contextTokens:[^}]+\}/,
      `${version}: shown event field order`,
    )
  }
})

test('source uses compact-boundary context estimates for both events', () => {
  const source = readFileSync(
    new URL('../../src/screens/REPL.tsx', import.meta.url),
    'utf8',
  ).replace(/\s+/g, ' ')
  for (const witness of [
    'const idleHintShownRef = useRef(false)',
    'contextTokens: tokenCountWithEstimation(getMessagesAfterCompactBoundary(messagesRef.current))',
    'const totalTokens = tokenCountWithEstimation(getMessagesAfterCompactBoundary(msgsRef.current))',
    'hintRef.current = true',
    'messageCount: msgsRef.current.length, contextTokens: totalTokens',
  ]) {
    assert.ok(source.includes(witness), `missing source witness: ${witness}`)
  }
})
