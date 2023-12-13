import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const BASELINE_BYTES = 13_720_987
const BASELINE_SHA256 =
  '9a1fccbe69ffe06c82345db1cc8cdbbc9a9929ed723bc8832ad48dfeff64b4ef'
const TARGET_BYTES = 13_784_743
const TARGET_SHA256 =
  'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f'
const repo = fileURLToPath(new URL('../..', import.meta.url))

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function loadBundle(environmentName, expectedBytes, expectedSha256) {
  const filename = process.env[environmentName]
  assert.ok(filename, `${environmentName} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, expectedBytes, `${environmentName}: byte length`)
  assert.equal(sha256(bytes), expectedSha256, `${environmentName}: SHA-256`)
  return bytes.toString('utf8')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

const TARGET_FRAGMENTS = [
  ['fleet gate default', 'tengu_slate_meadow', 2, 2],
  ['service install rollout', 'tengu_amber_anchor', 0, 1],
  ['cold-start rollout', 'tengu_quiet_harbor', 0, 1],
  ['cold-start setting', 'daemonColdStart', 0, 4],
  ['interactive install answer', 'tengu_bg_daemon_cold_start_ask_answer', 0, 1],
  ['managed service marker', 'claude-managed: v1', 0, 1],
  ['settled job retirement event', 'tengu_bg_retired', 0, 2],
  ['settled job retirement method', 'retireIfSettled', 0, 2],
  ['attach DEC state', 'decModes', 0, 6],
  ['retiring attach response', 'job is retiring; retry attach', 0, 1],
  ['reconnect overlay', ' Reconnecting\\u2026 ', 0, 1],
  [
    'configured workers no longer pin daemon',
    'daemon.json has configured workers but they do not pin the supervisor',
    0,
    1,
  ],
  [
    'default-config service restriction',
    'service install only supports the default config dir',
    0,
    1,
  ],
]

test('authenticates the canonical 2.1.119 and 2.1.120 inner bundles', () => {
  const baseline = loadBundle(
    'CLAUDE_2_1_119_CLI_INNER',
    BASELINE_BYTES,
    BASELINE_SHA256,
  )
  const target = loadBundle(
    'CLAUDE_2_1_120_CLI_INNER',
    TARGET_BYTES,
    TARGET_SHA256,
  )
  for (const [name, fragment, baselineCount, targetCount] of TARGET_FRAGMENTS) {
    assert.equal(occurrences(baseline, fragment), baselineCount, `${name}: baseline`)
    assert.equal(occurrences(target, fragment), targetCount, `${name}: target`)
  }
})

test('recovers the daemon rollout, cold-start, and service lifecycle', () => {
  const gates = source('src/utils/agentsFleet.ts')
  assert.match(gates, /function isUnsupportedProviderEnvironment\(\)/)
  assert.match(gates, /tengu_slate_meadow/)
  assert.match(gates, /tengu_amber_anchor/)
  assert.match(gates, /tengu_quiet_harbor/)
  assert.match(gates, /export function isDaemonWorkerRegistryEnabled\(\): boolean \{\s*return false/)

  const client = source('src/daemon/client.ts')
  assert.match(client, /getDaemonColdStart\(\) === 'ask'/)
  assert.match(client, /forceTransient\?: boolean/)
  assert.match(client, /Install as a service now\?/)
  assert.match(client, /daemonInstallPromptDismissed/)

  const service = source('src/daemon/service.ts')
  assert.equal(occurrences(service, 'claude-managed: v1'), 1)

  const main = source('src/daemon/main.ts')
  assert.match(main, /removeLegacyDaemonService/)
  assert.match(main, /tengu_daemon_auto_uninstall/)
  assert.match(main, /daemon stop --any/)
  assert.match(main, /new Set<string>\(\[/)
  assert.match(main, /'logs'/)
  assert.equal(main.includes('if (!/[./\\\\~]/.test(candidate))'), true)
  assert.match(
    main,
    /daemon\.json has configured workers but they do not pin the supervisor — they stop when the last client lease and bg job are gone/,
  )
})

test('recovers worker retirement and terminal attach state exactly', () => {
  const supervisor = source('src/daemon/supervisor.ts')
  assert.match(supervisor, /new Set\(\[1000, 1002, 1003, 1004, 1006, 2004, 2031\]\)/)
  assert.match(supervisor, /const DEC_MODE_SEQUENCE = \/\\x1b\\\[\\\?\(\[\\d;\]\+\)\(\[hl\]\)\/g/)
  assert.match(supervisor, /async retireIfSettled\(graceMs: number\)/)
  assert.match(supervisor, /handle\.retireIfSettled\(600_000\)/)
  assert.match(supervisor, /job is retiring; retry attach/)
  assert.match(supervisor, /decModes: handle\.decModeSnapshot\(\)/)

  const bg = source('src/cli/bg.ts')
  assert.match(bg, /stdin\.on\('readable', onReadable\)/)
  assert.match(bg, /cursorPosition\(1, column\)/)
  assert.match(bg, /holdScreenOnDisconnect: true/)
  assert.match(bg, /exitAttachedScreen\(\)/)

  const doctor = source('src/screens/Doctor.tsx')
  assert.match(doctor, /Probing background server…/)
  assert.match(doctor, /isDaemonCliEnabled\(\) \? <BackgroundServer \/>/)
  assert.match(doctor, /configured background/)
})
