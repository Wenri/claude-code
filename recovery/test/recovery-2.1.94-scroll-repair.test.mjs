import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const sourcePath = fileURLToPath(
  new URL('../../src/ink/render-node-to-output.ts', import.meta.url),
)
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_92_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_94_BUNDLE
const BASELINE_BUNDLE_SHA256 =
  '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362'
const TARGET_BUNDLE_SHA256 =
  '11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564'

function requiredBundle(filename, label, expectedSha256) {
  assert.ok(filename, `${label} environment variable must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    expectedSha256,
  )
  return bytes.toString('utf8')
}

function staleInterval({
  shiftedOldY,
  height,
  firstRenderedY,
  hintTop,
  hintBottom,
}) {
  const top = Math.max(shiftedOldY, hintTop)
  const bottom = Math.min(
    shiftedOldY + height,
    firstRenderedY ?? hintBottom + 1,
  )
  return top < bottom ? { top, bottom } : null
}

test('clips stale shifted rows before repainting clean children', () => {
  assert.deepEqual(
    staleInterval({
      shiftedOldY: 2,
      height: 8,
      firstRenderedY: undefined,
      hintTop: 4,
      hintBottom: 12,
    }),
    { top: 4, bottom: 10 },
  )
  assert.deepEqual(
    staleInterval({
      shiftedOldY: 7,
      height: 9,
      firstRenderedY: 11,
      hintTop: 4,
      hintBottom: 20,
    }),
    { top: 7, bottom: 11 },
  )
  assert.equal(
    staleInterval({
      shiftedOldY: 13,
      height: 2,
      firstRenderedY: 10,
      hintTop: 4,
      hintBottom: 20,
    }),
    null,
  )

  const raw = fs.readFileSync(sourcePath, 'utf8')
  const sourceMap = raw.indexOf('//# sourceMappingURL=')
  const source = sourceMap === -1 ? raw : raw.slice(0, sourceMap)
  assert.match(source, /let firstRenderedY: number \| undefined/)
  assert.match(
    source,
    /const shiftedOldY = Math\.floor\(childCached\.y\) - delta/,
  )
  assert.match(source, /if \(shiftedOldY === screenY\) continue/)
  assert.match(
    source,
    /const oldTop = Math\.max\(shiftedOldY, hint\.top\)/,
  )
  assert.match(
    source,
    /shiftedOldY \+ childCached\.height,[\s\S]*?firstRenderedY \?\? hint\.bottom \+ 1/,
  )
  assert.match(
    source,
    /if \(oldTop < oldBottom\) \{[\s\S]*?Array\(oldBottom - oldTop\)[\s\S]*?output\.write\(Math\.floor\(x\), oldTop, fill\)/,
  )
  assert.match(source, /firstRenderedY \?\?= screenY/)
  assert.match(source, /if \(!isDirty && cumHeightShift === 0\)/)
})

test('adjacent bundles prove the bounded stale-row repair', () => {
  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_92_BUNDLE',
    BASELINE_BUNDLE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_94_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )
  const repair =
    /let ([A-Za-z_$][\w$]*)=Math\.max\(([A-Za-z_$][\w$]*),([A-Za-z_$][\w$]*)\.top\),([A-Za-z_$][\w$]*)=Math\.min\(\2\+[A-Za-z_$][\w$]*\.height,[A-Za-z_$][\w$]*\?\?\3\.bottom\+1\);if\(\1<\4\)/
  assert.doesNotMatch(baseline, repair)
  assert.match(target, repair)
})
