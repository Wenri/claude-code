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

test('2.1.121 introduces both subscription suppression gates', () => {
  const [baseline, target] = specs.map(bundle)
  for (const fragment of ['tengu_idle_amber_finch', 'tengu_quiet_slate_wren']) {
    assert.equal(baseline.includes(fragment), false)
    assert.equal(target.split(fragment).length - 1, 1)
  }
})

test('source applies the gates at every target upsell surface', () => {
  const read = relative => fs.readFileSync(path.join(repo, relative), 'utf8')
  const helper = read('src/utils/subscriptionUpsell.ts')
  assert.match(helper, /tengu_idle_amber_finch/)
  assert.match(helper, /tengu_quiet_slate_wren/)
  assert.match(read('src/services/rateLimitMessages.ts'), /!isUpgradeSuppressed\(\)/)
  assert.match(read('src/components/messages/RateLimitMessage.tsx'), /serverHidesUpgrade: serverHidesUpgrade \|\| upgradeSuppressed/)
  assert.match(read('src/commands/upgrade/index.ts'), /!isUpgradeSuppressed\(\)/)
  assert.match(read('src/commands/pro-trial-expired/pro-trial-expired.tsx'), /\.\.\.\(!isUpgradeSuppressed\(\)/)
  const notice = read('src/hooks/notifs/useCanSwitchToExistingSubscription.tsx')
  assert.match(notice, /has_claude_max && !isUpgradeSuppressed\(\)/)
  assert.match(notice, /has_claude_pro && !isProSwitchSuppressed\(\)/)
})
