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
    env: 'CLAUDE_CODE_2_1_121_BUNDLE',
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
    count: 0,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    count: 1,
  },
]

function readBundle(release) {
  const filename = process.env[release.env]
  assert.ok(filename, `${release.env} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return bytes.toString('utf8')
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

test('authenticates the target-only worker crash notice', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      bundle.split('[worker crashed (').length - 1,
      release.count,
      `${release.version}: crash notice`,
    )
    assert.equal(
      bundle.split(') \\u2014 respawning\\u2026]').length - 1,
      release.count,
      `${release.version}: respawn notice`,
    )

    for (const event of [
      'tengu_daemon_worker_permanent_exit',
      'tengu_daemon_worker_crash',
    ]) {
      const eventIndex = bundle.lastIndexOf(event)
      assert.ok(eventIndex >= 0, `${release.version}: ${event}`)
      assert.ok(
        bundle.slice(eventIndex, eventIndex + 300).includes('uptime_ms'),
        `${release.version}: ${event} uptime_ms`,
      )
    }
  }
})

test('daemon worker exit telemetry retains measured uptime', () => {
  const source = compact(
    fs.readFileSync(path.join(repo, 'src/daemon/main.ts'), 'utf8'),
  )
  for (const event of [
    'tengu_daemon_worker_permanent_exit',
    'tengu_daemon_worker_crash',
  ]) {
    const eventIndex = source.lastIndexOf(event)
    assert.ok(eventIndex >= 0, event)
    assert.ok(source.slice(eventIndex, eventIndex + 250).includes('uptime_ms: uptime'))
  }
})

test('supervisor retains and streams the crash notice before backoff', () => {
  const source = compact(
    fs.readFileSync(path.join(repo, 'src/daemon/supervisor.ts'), 'utf8'),
  )
  const notice =
    'const notice = `\\r\\n\\x1b[2m[worker crashed (${detail}) — respawning…]\\x1b[0m\\r\\n`'
  assert.ok(source.includes(notice), notice)
  const clear = source.indexOf('this.procStart = undefined', source.indexOf(notice) - 500)
  const retain = source.indexOf('this.pushRing(notice)', clear)
  const stream = source.indexOf('this.stream.emit(notice)', retain)
  const backoff = source.indexOf('this.respawnTimer = setTimeout', stream)
  assert.ok(clear >= 0 && clear < retain)
  assert.ok(retain < stream)
  assert.ok(stream < backoff)
})
