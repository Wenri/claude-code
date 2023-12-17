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

test('authenticates original permission reason on auto-mode telemetry', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')
    assert.equal(occurrences(bundle, 'originalDecisionReasonType'), 1, version)
    assert.match(
      bundle,
      /tengu_auto_mode_decision[^}]+stripAllBashFlag:[A-Za-z_$][\w$]*\("tengu_bash_allowlist_strip_all",!1\),originalDecisionReasonType:[A-Za-z_$][\w$]*\.decisionReason\?\.type,agentMsgId:/,
      `${version}: field preserves the pre-classifier permission reason`,
    )
  }
})

test('source emits the retained original decision reason field', () => {
  const source = readFileSync(
    new URL('../../src/utils/permissions/permissions.ts', import.meta.url),
    'utf8',
  ).replace(/\s+/g, ' ')

  assert.equal(occurrences(source, 'originalDecisionReasonType'), 1)
  assert.ok(
    source.includes(
      'originalDecisionReasonType: result.decisionReason?.type,',
    ),
  )
})
