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
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
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

test('authenticates retained daemon process-birth status protection', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.match(
      bundle,
      /\{supervisorPid:process\.pid,supervisorProcStart:\w+\(\),writtenAt:Date\.now\(\),workers:/,
      `${release.version}: supervisor status writer`,
    )
    assert.match(
      bundle,
      /typeof q\.supervisorProcStart==="string"\?q\.supervisorProcStart:void 0;if\(!await \w+\(q\.supervisorPid,K\)\)return null/,
      `${release.version}: supervisor status validator`,
    )
    assert.match(
      bundle,
      /\{workerPid:process\.pid,workerProcStart:\w+\(\),writtenAt:Date\.now\(\),tasks:/,
      `${release.version}: scheduled worker status writer`,
    )
    assert.match(
      bundle,
      /process\.kill\(q\.workerPid,0\)\}catch\{return null\}if\(!await \w+\(q\.workerPid,q\.workerProcStart\)\)return null/,
      `${release.version}: scheduled worker status validator`,
    )
  }
})

test('source writes and validates supervisor process birth tokens', () => {
  const writer = compact(
    fs.readFileSync(path.join(repo, 'src/daemon/main.ts'), 'utf8'),
  )
  const reader = compact(
    fs.readFileSync(path.join(repo, 'src/daemon/hub.tsx'), 'utf8'),
  )
  assert.match(
    writer,
    /supervisorPid: process\.pid, supervisorProcStart: getCurrentProcessStartToken\(\), writtenAt: Date\.now\(\), workers/,
  )
  assert.match(
    reader,
    /typeof parsed\.supervisorProcStart === 'string' \? parsed\.supervisorProcStart : undefined/,
  )
  assert.match(
    reader,
    /processStartTokenMatches\( parsed\.supervisorPid, supervisorProcStart, \)/,
  )
})

test('source writes and validates scheduled worker process birth tokens', () => {
  const source = compact(
    fs.readFileSync(path.join(repo, 'src/daemon/workerRegistry.ts'), 'utf8'),
  )
  assert.match(
    source,
    /workerPid: process\.pid, workerProcStart: getCurrentProcessStartToken\(\), writtenAt: Date\.now\(\), tasks/,
  )
  assert.match(
    source,
    /processStartTokenMatches\( \(parsed as ScheduledWorkerStatus\)\.workerPid, \(parsed as ScheduledWorkerStatus\)\.workerProcStart, \)/,
  )
})
