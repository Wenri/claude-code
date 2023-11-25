import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const sourcePath = fileURLToPath(
  new URL('../../src/utils/hooks/execPromptHook.ts', import.meta.url),
)
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_91_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_92_BUNDLE
const BASELINE_BUNDLE_SHA256 =
  'b4bf141f30cf8b40196295816c7a6b9d01a36e906908d73a9f9a865ce4cdf816'
const TARGET_BUNDLE_SHA256 =
  '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362'

function requiredBundle(filename, label, expectedSha256) {
  assert.ok(filename, `${label} environment variable must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    expectedSha256,
  )
  return bytes.toString('utf8')
}

test('recovers the target-backed prompt-hook policy split', () => {
  const source = fs.readFileSync(sourcePath, 'utf8')

  assert.match(
    source,
    /const isStopHook = hookEvent === 'Stop' \|\| hookEvent === 'SubagentStop'/,
  )
  assert.match(
    source,
    /Based on the conversation transcript above,[\s\S]*?Condition: \$\{hook\.prompt\}/,
  )
  assert.match(
    source,
    /isStopHook[\s\S]*?You are evaluating a stop-condition hook[\s\S]*?insufficient evidence in transcript/,
  )
  assert.match(
    source,
    /You are evaluating a hook condition in Claude Code[\s\S]*?Always include a "reason" field/,
  )
  assert.match(source, /tools: \[\]/)
  assert.match(source, /required: \['ok', 'reason'\]/)
  assert.match(
    source,
    /blockingError: `\[\$\{hook\.prompt\}\]: \$\{parsed\.data\.reason\}`/,
  )
  assert.match(source, /preventContinuation: !isStopHook/)
  assert.match(
    source,
    /Prompt hook condition was met: \$\{parsed\.data\.reason\}/,
  )
})

test('adjacent authenticated bundles prove the 2.1.92 behavior', () => {
  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_91_BUNDLE',
    BASELINE_BUNDLE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_92_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )

  assert.equal(
    baseline.includes(
      'Based on the conversation transcript above, has the following stopping condition been satisfied?',
    ),
    false,
  )
  assert.equal(
    target.includes(
      'Based on the conversation transcript above, has the following stopping condition been satisfied?',
    ),
    true,
  )
  assert.equal(
    target.includes(
      'If the transcript does not contain clear evidence that the condition is satisfied, return {"ok": false, "reason": "insufficient evidence in transcript"}.',
    ),
    true,
  )

  const targetStart = target.indexOf(
    'Based on the conversation transcript above, has the following stopping condition been satisfied?',
  )
  const targetEnd = target.indexOf(
    'Hooks: Prompt hook condition was met:',
    targetStart,
  )
  assert.notEqual(targetStart, -1)
  assert.notEqual(targetEnd, -1)

  const recoveredRegion = target.slice(targetStart - 140, targetEnd + 500)
  assert.match(
    recoveredRegion,
    /==="Stop"\|\|[^=]+==="SubagentStop"/,
  )
  assert.match(
    recoveredRegion,
    /tools:\[\][\s\S]*?required:\["ok","reason"\]/,
  )
  assert.match(
    recoveredRegion,
    /preventContinuation:![A-Za-z_$][\w$]*/,
  )
  assert.match(
    recoveredRegion,
    /blockingError:`\[\$\{[^}]+\.prompt\}\]: \$\{[^}]+\.data\.reason\}`/,
  )
})
