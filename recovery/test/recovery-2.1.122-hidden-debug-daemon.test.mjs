import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))

const RELEASES = [
  {
    version: '2.1.121',
    env: 'CLAUDE_CODE_2_1_121_BUNDLE',
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
]

function loadBundle(release) {
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

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

test('authenticates the target-only debug daemon context', () => {
  const baseline = loadBundle(RELEASES[0])
  const target = loadBundle(RELEASES[1])
  const targetOnly = [
    'No daemon lock or status file found',
    'roster contains user prompts and env vars',
    'No log file exists yet.',
  ]

  for (const fragment of targetOnly) {
    assert.equal(occurrences(baseline, fragment), 0, `baseline: ${fragment}`)
    assert.equal(occurrences(target, fragment), 1, `target: ${fragment}`)
  }
})

test('recovers bounded daemon state reads and prompt placement', () => {
  const contents = source('src/skills/bundled/debug.ts')
  const fragments = [
    "const STATE_READ_BYTES = 8 * 1024",
    'tailFile(logPath, TAIL_READ_BYTES)',
    'tailFile(path, STATE_READ_BYTES)',
    'readDaemonState(getDaemonLockPath())',
    'readDaemonState(getDaemonStatusPath())',
    'readLogTail(logPath)',
    'if (lock === null && status === null)',
    'No daemon lock or status file found',
    "${lock ?? '(missing)'}",
    "${status ?? '(missing)'}",
    '${getRosterPath()}',
    '${getJobsDir()}/<short>/state.json',
    '${daemonContext}\n\n## Issue Description',
  ]

  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `missing ${fragment}`)
  }
})
