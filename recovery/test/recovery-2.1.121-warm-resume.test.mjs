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

test('2.1.121 replaces transcript scanning with bounded warm-resume metadata', () => {
  const [baseline, target] = specs.map(bundle)
  assert.equal(baseline.includes('lastHintSessionId'), false)
  assert.equal(target.split('lastHintSessionId').length - 1, 3)
  assert.equal(baseline.includes('lastSessionModified'), false)
  assert.equal(target.split('lastSessionModified').length - 1, 2)
  assert.equal(baseline.includes('lastSessionFirstPrompt'), false)
  assert.equal(target.split('lastSessionFirstPrompt').length - 1, 3)
  assert.equal(baseline.split('with_todos').length - 1, 1)
  assert.equal(target.includes('with_todos'), false)
})

test('source reads and writes only the bounded config record', () => {
  const read = relative => fs.readFileSync(path.join(repo, relative), 'utf8')
  const hint = read('src/components/WarmResumeHint.tsx')
  assert.match(hint, /const VARIANTS = \['0', '1', '3'\]/)
  assert.match(hint, /if \(value === '2'\) return '1'/)
  assert.match(hint, /config\.lastHintSessionId/)
  assert.match(hint, /config\.lastSessionModified/)
  assert.match(hint, /config\.lastSessionFirstPrompt/)
  assert.match(hint, /with_fork_session: hint\.variant === '1'/)
  assert.equal(hint.includes('getRecentActivity'), false)
  assert.equal(hint.includes('listTasks'), false)
  assert.equal(hint.includes('initializeGrowthBook'), false)

  const repl = read('src/screens/REPL.tsx')
  assert.match(repl, /firstPrompt = text\.replaceAll\('\\n', ' '\)\.trim\(\)\.slice\(0, 200\)/)
  assert.match(repl, /lastHintSessionId: sessionId/)
  assert.match(repl, /lastSessionFirstPrompt: firstPrompt/)
  assert.match(repl, /lastSessionModified: Date\.now\(\)/)

  assert.equal(read('src/setup.ts').includes('getRecentActivity'), false)
  assert.equal(read('src/utils/logoV2Utils.ts').includes('getRecentActivity'), false)
})
