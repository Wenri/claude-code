import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = [
  {
    version: '2.1.121',
    envNames: ['CLAUDE_CODE_2_1_121_BUNDLE', 'CLAUDE_2_1_121_CLI_INNER'],
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  {
    version: '2.1.122',
    envNames: ['CLAUDE_CODE_2_1_122_BUNDLE', 'CLAUDE_2_1_122_CLI_INNER'],
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
]

function readBundle(release) {
  const filename = release.envNames.map(name => process.env[name]).find(Boolean)
  assert.ok(filename, `${release.envNames.join(' or ')} must be set`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(value).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return value.toString('utf8')
}

function compact(value) {
  return value.replaceAll(/\s+/g, '')
}

test('authenticates the retained remote GrowthBook system-prompt override', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    const match = bundle.match(
      /([\w$]+)=[\w$]+\(process\.env\.CLAUDE_CODE_REMOTE\)\?process\.env\.CLAUDE_CODE_SYSTEM_PROMPT_GB_FEATURE:void 0,([\w$]+)=\(\)=>\{if\(!\1\)return ([\w$]+)\.systemPrompt;let [\w$]+=[\w$]+\(\1,""\);return typeof [\w$]+==="string"&&[\w$]+\.length>0\?[\w$]+:\3\.systemPrompt\}/,
    )
    assert.ok(match, `${release.version}: remote-only override getter`)
    const getter = match[2]
    assert.equal(
      bundle.split(`customSystemPrompt:${getter}()`).length - 1,
      3,
      `${release.version}: all three headless prompt consumers use the getter`,
    )
  }
})

test('source gates the override remotely and uses it at every target callsite', () => {
  const source = compact(
    fs.readFileSync(path.join(repo, 'src/cli/print.ts'), 'utf8'),
  )
  for (const fragment of [
    'isEnvTruthy(process.env.CLAUDE_CODE_REMOTE,)?process.env.CLAUDE_CODE_SYSTEM_PROMPT_GB_FEATURE:undefined',
    'getFeatureValue_CACHED_MAY_BE_STALE(systemPromptGrowthBookFeature,\'\',)',
    "typeof override === 'string' && override.length > 0 ? override : options.systemPrompt",
  ]) {
    assert.ok(source.includes(compact(fragment)), fragment)
  }
  assert.equal(
    source.split('customSystemPrompt:getEffectiveSystemPrompt()').length - 1,
    3,
    'main query, context usage, and side-query consumers use the getter',
  )
})
