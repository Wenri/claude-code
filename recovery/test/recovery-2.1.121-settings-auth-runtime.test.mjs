import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const specs = [
  [
    'CLAUDE_CODE_2_1_120_BUNDLE',
    13_784_743,
    'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f',
  ],
  [
    'CLAUDE_CODE_2_1_121_BUNDLE',
    13_908_188,
    '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  ],
]

function bundle([env, bytes, sha256]) {
  const filename = process.env[env]
  assert.ok(filename, `${env} must be set`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, bytes)
  assert.equal(
    crypto.createHash('sha256').update(value).digest('hex'),
    sha256,
  )
  return value.toString('utf8')
}

function read(relative) {
  return fs.readFileSync(path.join(repo, relative), 'utf8')
}

function count(contents, fragment) {
  return contents.split(fragment).length - 1
}

test('authenticated 2.1.120 and 2.1.121 bundles preserve the inherited settings/auth runtime', () => {
  const [baseline, target] = specs.map(bundle)
  const witnesses = new Map([
    ['CLAUDE_CODE_ENABLE_PROXY_AUTH_HELPER', 1],
    ['CLAUDE_CODE_PROXY_AUTHENTICATE', 1],
    ['proxyAuthHelper failed:', 1],
    ['No organizations are permitted. This is almost certainly a misconfiguration.', 1],
    ['one of these organizations:', 1],
    ['skillListingMaxDescChars', 2],
    ['skillListingBudgetFraction', 2],
    ['cleanupPeriodDays must be at least 1.', 1],
    ['Default transcript view mode on startup', 1],
    ['Voice mode enabled (', 1],
    ['Toggle silence timeout', 1],
    ['tap to send', 1],
  ])
  for (const [fragment, expected] of witnesses) {
    assert.equal(count(baseline, fragment), expected, `baseline ${fragment}`)
    assert.equal(count(target, fragment), expected, `target ${fragment}`)
  }
})

test('source implements proxy helper trust, cache, retry, startup, and Bun header contracts', () => {
  const proxy = read('src/utils/proxy.ts')
  assert.match(proxy, /CLAUDE_CODE_ENABLE_PROXY_AUTH_HELPER/)
  assert.match(proxy, /timeout: 30_000/)
  assert.match(proxy, /CLAUDE_CODE_PROXY_URL/)
  assert.match(proxy, /CLAUDE_CODE_PROXY_HOST/)
  assert.match(proxy, /CLAUDE_CODE_PROXY_AUTHENTICATE/)
  assert.match(proxy, /proxyAuthHelperCache\?\.value \?\? null/)
  assert.match(proxy, /headers: \{ 'Proxy-Authorization': proxyAuthorization \}/)

  const retry = read('src/services/api/withRetry.ts')
  assert.match(retry, /error\.status === 407/)
  assert.match(retry, /error\.headers\?\.get\('proxy-authenticate'\)/)

  const client = read('src/services/api/client.ts')
  assert.match(client, /await getProxyAuthFromHelper\(\)/)
  assert.match(client, /fetchOptions: getProxyFetchOptions\(/)

  const setup = read('src/setup.ts')
  assert.match(setup, /_setProxyAuthHelperConfig\(/)
  assert.match(setup, /getSettingsForSource\('projectSettings'\)/)
  assert.match(setup, /prefetchProxyAuthFromHelperIfSafe\(\)/)
})

test('source implements org arrays, bounded settings, dynamic skill budget, and voice tap mode', () => {
  const settings = read('src/utils/settings/types.ts')
  assert.match(settings, /proxyAuthHelper: z/)
  assert.match(settings, /\.union\(\[z\.string\(\), z\.array\(z\.string\(\)\)\]\)/)
  assert.match(settings, /skillListingMaxDescChars: z/)
  assert.match(settings, /skillListingBudgetFraction: z/)
  assert.match(settings, /skillOverrides: z/)
  assert.match(settings, /viewMode: z/)
  assert.match(settings, /mode: z[\s\S]*?\.enum\(\['hold', 'tap'\]\)/)
  assert.match(settings, /autoSubmit: z/)

  const auth = read('src/utils/auth.ts')
  assert.match(auth, /typeof requiredOrgUuid === 'string'/)
  assert.match(auth, /requiredOrgUuids\.includes\(tokenOrgUuid\)/)
  assert.match(auth, /No organizations are permitted/)

  const skills = read('src/tools/SkillTool/prompt.ts')
  assert.match(skills, /getInitialSettings\(\)\.skillListingMaxDescChars/)
  assert.match(skills, /getInitialSettings\(\)\.skillListingBudgetFraction/)

  const voice = read('src/hooks/useVoice.ts')
  assert.match(voice, /mode\?: 'hold' \| 'tap'/)
  assert.match(voice, /TOGGLE_SILENCE_TIMEOUT_MS = 15_000/)
  assert.match(voice, /TOGGLE_MAX_DURATION_MS = 120_000/)
  assert.match(voice, /cancelRecording: discarding without submit/)

  const integration = read('src/hooks/useVoiceIntegration.tsx')
  assert.match(integration, /voiceMode === 'tap' \|\| autoSubmit/)
  assert.match(integration, /text\.trim\(\)\.split\(\/\\s\+\/\)\.length >= 3/)
  assert.match(integration, /e\.key === 'escape'/)
})
