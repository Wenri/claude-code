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

test('2.1.121 removes shell and plugin gates and fixes the VS Code gate', () => {
  const [baseline, target] = specs.map(bundle)
  assert.equal(baseline.split('tengu_cork_m4q').length - 1, 1)
  assert.equal(target.includes('tengu_cork_m4q'), false)
  assert.equal(baseline.split('tengu_lapis_finch').length - 1, 1)
  assert.equal(target.includes('tengu_lapis_finch'), false)
  assert.equal(baseline.includes('tengu_quiet_fern:!0'), false)
  assert.equal(target.split('tengu_quiet_fern:!0').length - 1, 1)
})

test('source makes released paths unconditional and honors DO_NOT_TRACK', () => {
  const read = relative => fs.readFileSync(path.join(repo, relative), 'utf8')
  const prefix = read('src/utils/shell/prefix.ts')
  assert.equal(prefix.includes('tengu_cork_m4q'), false)
  assert.match(prefix, /userPrompt: `Command: \$\{command\}`/)
  assert.match(prefix, /enablePromptCaching: true/)

  const hints = read('src/utils/plugins/hintRecommendation.ts')
  assert.equal(hints.includes('tengu_lapis_finch'), false)
  for (const variable of [
    'CLAUDE_CODE_USE_BEDROCK',
    'CLAUDE_CODE_USE_VERTEX',
    'CLAUDE_CODE_USE_FOUNDRY',
  ]) {
    assert.match(hints, new RegExp(`isEnvTruthy\\(process\\.env\\.${variable}\\)`))
  }
  assert.match(hints, /isTelemetryDisabled\(\)/)

  assert.match(
    read('src/services/mcp/vscodeSdkMcp.ts'),
    /tengu_quiet_fern: true/,
  )
  assert.match(
    read('src/utils/privacyLevel.ts'),
    /isEnvTruthy\(process\.env\.DO_NOT_TRACK\)/,
  )
})
