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

test('2.1.121 adds compaction-aware spinner telemetry and hinting', () => {
  const [baseline, target] = specs.map(bundle)
  for (const fragment of [
    'tengu_spinner_stall_cleared',
    'render_loop_dark',
    'Compacting at auto window (',
  ]) {
    assert.equal(baseline.includes(fragment), false, fragment)
    assert.equal(target.split(fragment).length - 1, 1, fragment)
  }
  assert.equal(baseline.split('compacting at the auto').length - 1, 1)
  assert.equal(target.includes('compacting at the auto'), false)
  assert.equal(target.split('compactingHintText').length - 1, 8)
  assert.equal(target.split('isCompacting').length - 1, 10)
})

test('source treats compaction as active and renders its window hint', () => {
  const read = relative => fs.readFileSync(path.join(repo, relative), 'utf8')
  const autoCompact = read('src/services/compact/autoCompact.ts')
  assert.match(
    autoCompact,
    /Compacting at auto window \(\$\{formatTokens\(configured\)\} tokens\) · \/autocompact to configure/,
  )
  assert.equal(autoCompact.includes('autocompact-auto-hint'), false)

  const compact = read('src/services/compact/compact.ts')
  assert.match(compact, /type: 'compact_start',[\s\S]*?hintText: compactingHintText/)

  const row = read('src/components/Spinner/SpinnerAnimationRow.tsx')
  assert.match(row, /mode === 'thinking' \|\| isCompacting/)
  assert.match(row, /tengu_spinner_stall_cleared/)
  assert.match(row, /max_stall_ms: Math\.round\(maxStallMsRef\.current\)/)
  assert.match(row, /render_loop_dark: timeSinceLastToken - thresholdMs > 5000/)

  const spinner = read('src/components/Spinner.tsx')
  assert.match(spinner, /isCompacting && compactingHintText/)
  assert.match(spinner, /<Text dimColor>\{compactingHintText\}<\/Text>/)

  const repl = read('src/screens/REPL.tsx')
  assert.match(repl, /setIsCompacting\(true\)/)
  assert.match(repl, /setCompactingHintText\(event\.hintText \?\? null\)/)
  assert.match(repl, /setIsCompacting\(false\)/)
})
