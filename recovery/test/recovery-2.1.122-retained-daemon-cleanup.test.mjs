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

function count(contents, fragment) {
  return contents.split(fragment).length - 1
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

test('authenticates retained daemon and background-job cleanup safety', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const [fragment, cardinality] of [
      ['jobs","settled', 1],
      ['daemon","dispatch","rejected', 1],
      ['daemon.log.1', 1],
      ['roster.json.corrupt.', 1],
    ]) {
      assert.equal(
        count(bundle, fragment),
        cardinality,
        `${release.version}: ${fragment}`,
      )
    }
    assert.match(
      bundle,
      /\.rm\(\w+,\{recursive:!0,force:!0\}\),\w+\.messages\+\+/,
      `${release.version}: stale directories use force-safe recursive removal`,
    )
    assert.match(
      bundle,
      /"jobs",\w+,\w+\?void 0:async\(\w+\)=>\{let \w+=await \w+\(\w+\);if\(\w+===null\)return!0;return!\w+\(\w+\)\}/,
      `${release.version}: unmanaged cleanup preserves missing and unsettled jobs`,
    )
    assert.match(
      bundle,
      /typeof \w+\.pid==="number"&&\w+\(\w+\.pid\)&&await \w+\(\w+\.pid,"procStart"in \w+&&typeof \w+\.procStart==="string"\?\w+\.procStart:void 0\)/,
      `${release.version}: live roster entries are PID-birth validated`,
    )
  }
})

test('source reproduces exact preservation, cleanup, and ordering semantics', () => {
  const source = compact(
    fs.readFileSync(path.join(repo, 'src/utils/cleanup.ts'), 'utf8'),
  )
  for (const fragment of [
    "join(configDir, 'jobs', 'settled')",
    "join(configDir, 'daemon', 'dispatch', 'rejected')",
    "getSettingsForSource('policySettings')?.cleanupPeriodDays !== undefined",
    "!policyCleanupConfigured && errors.length > 0 && rawSettingsContainsKey('cleanupPeriodDays')",
    "await fsImpl.readFile(join(configDir, 'jobs', 'pins.json')",
    'isProcessRunning(record.pid) && (await processStartTokenMatches( record.pid,',
    "await cleanupOldDirectories( 'jobs', preservedJobs, policyCleanupConfigured ? undefined : async jobDir =>",
    'if (state === null) return true return !isSettledJob(state)',
    "join(configDir, 'daemon.log.1')",
    "!entry.isFile() || !entry.name.startsWith('roster.json.corrupt.')",
    'await cleanupFleetDrafts() return result',
    'await cleanupOldShellSnapshots() await cleanupOldJobAndDaemonFiles() await cleanupOldBackups()',
    'fsImpl.rm(childDir, { recursive: true, force: true })',
  ]) {
    assert.ok(source.includes(compact(fragment)), fragment)
  }
})
