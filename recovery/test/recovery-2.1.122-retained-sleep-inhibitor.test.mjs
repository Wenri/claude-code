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
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return bytes.toString('utf8')
}

test('authenticates retained sleep-inhibitor grace and restart behavior', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const message of [
      'Restarting sleep inhibitor to maintain prevention',
      'Stopped sleep inhibitor, allowing sleep',
      'sleep inhibitor spawn error:',
    ]) {
      assert.equal(
        bundle.split(message).length - 1,
        1,
        `${release.version}: ${message}`,
      )
    }
    assert.match(
      bundle,
      /setTimeout\(\(\)=>\{\w+=null,\w+\(\),\w+\(\)\},\w+\),\w+\.unref\(\)/,
      `${release.version}: delayed unrefed stop`,
    )
    assert.match(
      bundle,
      /setInterval\(\(\)=>\{if\(\w+>0\|\|\w+!==null\)/,
      `${release.version}: restart stays active during the grace window`,
    )
  }
})

test('source reproduces the 30-second cancelable stop window', () => {
  const source = fs.readFileSync(path.join(repo, 'src/services/preventSleep.ts'), 'utf8')
  for (const fragment of [
    'const STOP_GRACE_PERIOD_MS = 30 * 1000',
    'refCount > 0 || pendingStopTimeout !== null',
    'pendingStopTimeout.unref()',
    'windowsHide: true',
    'Restarting sleep inhibitor to maintain prevention',
    'Stopped sleep inhibitor, allowing sleep',
  ]) {
    assert.ok(source.includes(fragment), fragment)
  }
  const start = source.indexOf('export function startPreventSleep')
  const stop = source.indexOf('export function stopPreventSleep')
  const force = source.indexOf('export function forceStopPreventSleep')
  assert.ok(source.slice(start, stop).includes('clearTimeout(pendingStopTimeout)'))
  assert.ok(source.slice(force, source.indexOf('function startRestartInterval')).includes('clearTimeout(pendingStopTimeout)'))
})
