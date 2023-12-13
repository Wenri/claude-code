import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const BASELINE_BYTES = 13_721_077
const BASELINE_SHA256 =
  'bc814388b51cbcb5114db927e60f8fbb5e12409532a89137429975556c29464e'
const TARGET_BYTES = 13_784_833
const TARGET_SHA256 =
  '280754b3db23901e986711f11dc74536da9669c43f61999b4a84e2cf76cf1e83'
const repo = fileURLToPath(new URL('../..', import.meta.url))

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function readAuthenticatedBundle(environmentName, bytes, digest) {
  const filename = process.env[environmentName]
  assert.ok(filename, `${environmentName} must be set`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, bytes, `${environmentName}: byte length`)
  assert.equal(sha256(value), digest, `${environmentName}: SHA-256`)
  return value.toString('utf8')
}

function occurrences(contents, fragment) {
  let count = 0
  let offset = 0
  while ((offset = contents.indexOf(fragment, offset)) !== -1) {
    count += 1
    offset += fragment.length
  }
  return count
}

function source(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

function compact(value) {
  return value.replaceAll(/\s+/g, ' ').trim()
}

function assertSourceFragments(relativePath, fragments) {
  const contents = compact(source(relativePath))
  for (const fragment of fragments) {
    assert.ok(contents.includes(compact(fragment)), `${relativePath}: ${fragment}`)
  }
}

function windowBeforeOccurrence(contents, fragment, occurrence, before, after) {
  let offset = -1
  for (let index = 0; index < occurrence; index += 1) {
    offset = contents.indexOf(fragment, offset + 1)
    assert.notEqual(offset, -1, `${fragment}: occurrence ${occurrence}`)
  }
  return contents.slice(Math.max(0, offset - before), offset + after)
}

test('authenticated 2.1.120 bundle adds the Fleet relaunch contract', () => {
  const baseline = readAuthenticatedBundle(
    'CLAUDE_CODE_2_1_119_WRAPPER',
    BASELINE_BYTES,
    BASELINE_SHA256,
  )
  const target = readAuthenticatedBundle(
    'CLAUDE_CODE_2_1_120_WRAPPER',
    TARGET_BYTES,
    TARGET_SHA256,
  )

  assert.equal(occurrences(baseline, 'CLAUDE_AGENTS_AUTO_RELAUNCHED_AT'), 0)
  assert.equal(occurrences(target, 'CLAUDE_AGENTS_AUTO_RELAUNCHED_AT'), 1)
  assert.equal(occurrences(baseline, 'fleetview_update_'), 0)
  assert.equal(occurrences(target, 'fleetview_update_'), 1)
  assert.equal(
    occurrences(baseline, "Couldn't switch to the latest build"),
    0,
  )
  assert.equal(
    occurrences(target, "Couldn't switch to the latest build"),
    1,
  )
  assert.equal(occurrences(baseline, 'Switching from '), 1)
  assert.equal(occurrences(target, 'Switching from '), 2)
  assert.equal(occurrences(baseline, 'onAutoUpdaterResult'), 0)
  assert.equal(occurrences(target, 'onAutoUpdaterResult'), 0)
  assert.equal(occurrences(baseline, 'autoUpdaterResult:null'), 2)
  assert.equal(occurrences(target, 'autoUpdaterResult:null'), 2)
  assert.equal(
    occurrences(baseline, 'AutoUpdaterWrapper: Installation type:'),
    1,
  )
  assert.equal(
    occurrences(target, 'AutoUpdaterWrapper: Installation type:'),
    1,
  )
  for (const exportName of [
    'AUTO_RELAUNCH_UNFOCUSED_MS',
    'AUTO_RELAUNCH_MIN_INTERVAL_MS',
    'AUTO_RELAUNCH_ENV_KEY',
  ]) {
    assert.equal(occurrences(baseline, exportName), 0, `${exportName}: baseline`)
    assert.equal(occurrences(target, exportName), 1, `${exportName}: target`)
  }

  const fleet = windowBeforeOccurrence(
    target,
    'CLAUDE_AGENTS_AUTO_RELAUNCHED_AT',
    1,
    40_000,
    6_500,
  )
  for (const fragment of [
    '3600000',
    '21600000',
    'args:["agents"]',
    'fleetview_update_',
    'Switching from ',
    "Couldn't switch to the latest build \\u2014 ",
    'setInterval(',
    'showSuccessMessage:!0,verbose:!1',
  ]) {
    assert.ok(fleet.includes(fragment), `target Fleet witness: ${fragment}`)
  }
})

test('authenticated 2.1.120 bundle switches relaunch to synchronous ownership', () => {
  const baseline = readAuthenticatedBundle(
    'CLAUDE_CODE_2_1_119_WRAPPER',
    BASELINE_BYTES,
    BASELINE_SHA256,
  )
  const target = readAuthenticatedBundle(
    'CLAUDE_CODE_2_1_120_WRAPPER',
    TARGET_BYTES,
    TARGET_SHA256,
  )
  const marker = 'Failed to relaunch Claude Code:'
  const baselineRelaunch = windowBeforeOccurrence(
    baseline,
    marker,
    2,
    1_350,
    350,
  )
  const targetRelaunch = windowBeforeOccurrence(
    target,
    marker,
    2,
    1_350,
    500,
  )

  assert.ok(baselineRelaunch.includes('.spawn('), '2.1.119 async spawn')
  assert.ok(baselineRelaunch.includes('1073741824'), '2.1.119 keepalive')
  assert.ok(baselineRelaunch.includes('"flush timeout"'), '2.1.119 flush timeout')
  assert.equal(targetRelaunch.includes('1073741824'), false)
  assert.equal(targetRelaunch.includes('"flush timeout"'), false)
  for (const fragment of [
    'Promise.all([',
    '"cleanup timeout"',
    '.spawnSync(',
    'process.removeAllListeners("beforeExit")',
    'process.removeAllListeners("exit")',
    'process.kill(process.pid',
    '.status??(',
  ]) {
    assert.ok(targetRelaunch.includes(fragment), `target relaunch witness: ${fragment}`)
  }
})

test('source recovers exact Fleet update gating and UI behavior', () => {
  const fleetPath = 'src/components/FleetView.tsx'
  const fleet = source(fleetPath)
  assertSourceFragments(fleetPath, [
    'export const AUTO_RELAUNCH_UNFOCUSED_MS = 3_600_000',
    'export const AUTO_RELAUNCH_MIN_INTERVAL_MS = 21_600_000',
    "export const AUTO_RELAUNCH_ENV_KEY = 'CLAUDE_AGENTS_AUTO_RELAUNCHED_AT'",
    'const isTerminalFocused = useTerminalFocus()',
    "state => state.autoUpdaterResult?.status === 'success'",
    "const handleUpdate = useCallback((mode: 'auto' | 'manual') => {",
    "logEvent('tengu_bg_agent_action', { action: `fleetview_update_${mode}`",
    "mode === 'auto' && Date.now() - getLastInteractionTime() < AUTO_RELAUNCH_UNFOCUSED_MS",
    "args: ['agents']",
    "? { [AUTO_RELAUNCH_ENV_KEY]: String(Date.now()) } : undefined",
    '`\\nSwitching from ${MACRO.VERSION} to latest…\\n\\n`',
    "if (mode === 'manual')",
    "`Couldn't switch to the latest build — ${errorMessage(caught)}`",
    'if (!updateAvailable || isTerminalFocused) return',
    'if (Date.now() - previousRelaunch < AUTO_RELAUNCH_MIN_INTERVAL_MS) return',
    "relaunchUpdate('auto')",
    'AUTO_RELAUNCH_UNFOCUSED_MS, handleUpdate',
    'showSuccessMessage={true}',
    'verbose={false}',
  ])
  assert.equal(
    occurrences(fleet, 'getLastInteractionTime()'),
    2,
    'idle is checked both on the interval tick and after launcher resolution',
  )
  assert.equal(
    occurrences(fleet, "handleUpdate('auto')"),
    0,
    'there is no immediate automatic attempt outside the interval callback',
  )
})

test('source recovers inherited AppState updater prerequisite without prop drilling', () => {
  assertSourceFragments('src/state/AppStateStore.ts', [
    'autoUpdaterResult: AutoUpdaterResult | null',
    'autoUpdaterResult: null',
  ])
  assertSourceFragments('src/main.tsx', ['autoUpdaterResult: null'])
  assertSourceFragments('src/components/AutoUpdater.tsx', [
    'const autoUpdaterResult = useAppState(state => state.autoUpdaterResult)',
    'const setAppState = useSetAppState()',
    'autoUpdaterResult: { version: latestVersion, status: installStatus',
  ])
  assertSourceFragments('src/components/NativeAutoUpdater.tsx', [
    'const autoUpdaterResult = useAppState(state => state.autoUpdaterResult)',
    "autoUpdaterResult: { version: result.latestVersion, status: 'success'",
    "autoUpdaterResult: { version: null, status: 'install_failed'",
  ])
  assertSourceFragments('src/components/PromptInput/Notifications.tsx', [
    'const autoUpdaterStatus = useAppState(state => state.autoUpdaterResult?.status)',
    "autoUpdaterStatus !== \"success\"",
  ])

  const wrapper = source('src/components/AutoUpdaterWrapper.tsx')
  assert.equal(wrapper.includes('onAutoUpdaterResult'), false)
  assert.equal(wrapper.includes('autoUpdaterResult:'), false)
  for (const relativePath of [
    'src/components/PromptInput/Notifications.tsx',
    'src/components/PromptInput/PromptInput.tsx',
    'src/components/PromptInput/PromptInputFooter.tsx',
    'src/screens/REPL.tsx',
  ]) {
    const contents = source(relativePath)
    assert.equal(contents.includes('onAutoUpdaterResult'), false, relativePath)
    assert.equal(contents.includes('autoUpdaterResult='), false, relativePath)
  }
})

test('source matches the synchronous relaunch cleanup and signal contract', () => {
  const relativePath = 'src/utils/relaunch.ts'
  const relaunch = source(relativePath)
  assertSourceFragments(relativePath, [
    'markShuttingDownForRelaunch() cleanupTerminalForRelaunch()',
    'await Promise.all([ flushSessionStorage().catch(() => {})',
    "withTimeout(runCleanupFunctions(), 2_000, 'cleanup timeout').catch(",
    "for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const)",
    'const result = spawnSync(cmd, args, { stdio:',
    "process.removeAllListeners('beforeExit')",
    "process.removeAllListeners('exit')",
    'process.removeAllListeners(result.signal)',
    'process.kill(process.pid, result.signal)',
    'process.exit(128 + (constants.signals[result.signal] ?? 0))',
    'process.exit(result.status ?? (result.signal ? 1 : 0))',
  ])
  const relaunchBody = relaunch.slice(relaunch.indexOf('export async function relaunch'))
  assert.equal(relaunchBody.includes('spawn('), false)
  assert.equal(relaunchBody.includes('setInterval('), false)
  assert.equal(relaunchBody.includes("'flush timeout'"), false)
})
