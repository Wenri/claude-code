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

test('2.1.121 adds remote-session UX guards and the in-app branch return command', () => {
  const [baseline, target] = specs.map(bundle)
  const modelMessage = String.raw`Model picker shows local options in remote sessions \u2014 pass a model name, e.g. /model sonnet`
  assert.equal(baseline.includes(modelMessage), false)
  assert.equal(target.split(modelMessage).length - 1, 2)
  assert.equal(baseline.includes('remote-permission-mode-noop'), false)
  assert.equal(target.split('remote-permission-mode-noop').length - 1, 1)
  assert.equal(baseline.includes('No other permission modes are available in this remote session'), false)
  assert.equal(target.split('No other permission modes are available in this remote session').length - 1, 1)
  assert.equal(baseline.includes('You are now in the branch. Use /resume '), false)
  assert.equal(target.split('You are now in the branch. Use /resume ').length - 1, 1)
})

test('source keeps local pickers out of remote sessions and uses slash-command resume guidance', () => {
  const read = relative => fs.readFileSync(path.join(repo, relative), 'utf8')
  const branch = read('src/commands/branch/branch.ts')
  const model = read('src/commands/model/model.tsx')
  const input = read('src/components/PromptInput/PromptInput.tsx')
  const modelMessage = 'Model picker shows local options in remote sessions — pass a model name, e.g. /model sonnet'

  assert.match(branch, /You are now in the branch\. Use \/resume \$\{originalSessionId\} to return to the original\./)
  assert.equal(branch.includes('To resume the original: claude -r'), false)
  assert.match(model, /if \(getRuntimeCapabilities\(\)\.workspace === 'remote'\)[\s\S]*?Model picker shows local options in remote sessions/)
  assert.equal(model.split(modelMessage).length - 1, 1)
  assert.equal(input.split(modelMessage).length - 1, 1)
  assert.match(input, /nextMode === toolPermissionContext\.mode[\s\S]*?remote-permission-mode-noop[\s\S]*?No other permission modes are available in this remote session/)
})
