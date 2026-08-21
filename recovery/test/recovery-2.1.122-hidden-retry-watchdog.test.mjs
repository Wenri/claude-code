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

test('authenticates the retained remote Linux retry watchdog callgraph', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    const helper = bundle.match(
      /function ([\w$]+)\(\)\{return [\w$]+\(\)==="linux"&&process\.env\.CLAUDE_CODE_ENTRYPOINT==="remote"&&[\w$]+\(process\.env\.CLAUDE_CODE_RETRY_WATCHDOG\)\}/,
    )
    assert.ok(helper, `${release.version}: watchdog helper`)
    const call = `${helper[1]}()`
    const escaped = helper[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    assert.equal(
      bundle.split(call).length - 1,
      6,
      `${release.version}: helper plus all five active call sites`,
    )
    for (const pattern of [
      new RegExp(`!${escaped}\\(\\).*status===429`),
      new RegExp(`!process\\.env\\.IS_SANDBOX&&!${escaped}\\(\\)`),
      new RegExp(`${escaped}\\(\\)&&[\\w$]+\\([^)]*\\)`),
      new RegExp(`!${escaped}\\(\\)&&[\\w$]+>[\\w$]+`),
    ]) {
      assert.match(bundle, pattern, `${release.version}: ${pattern}`)
    }
  }
})

test('source applies watchdog persistence at every target decision', () => {
  const source = compact(
    fs.readFileSync(path.join(repo, 'src/services/api/withRetry.ts'), 'utf8'),
  )
  for (const fragment of [
    "getPlatform() === 'linux'",
    "process.env.CLAUDE_CODE_ENTRYPOINT === 'remote'",
    'isEnvTruthy(process.env.CLAUDE_CODE_RETRY_WATCHDOG)',
    '!isPersistentRetryEnabled() && error instanceof APIError',
    '!process.env.IS_SANDBOX && !isPersistentRetryEnabled()',
    'isPersistentRetryEnabled() && isTransientCapacityError(error)',
    '!isPersistentRetryEnabled() && delayMs > MAX_RETRY_AFTER_MS',
  ]) {
    assert.ok(source.includes(compact(fragment)), fragment)
  }
  assert.equal(
    source.split('isPersistentRetryEnabled()').length - 1,
    6,
    'definition and all five target decision sites',
  )
})
