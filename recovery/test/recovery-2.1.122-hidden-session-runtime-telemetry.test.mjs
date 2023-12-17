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

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

function source(relative) {
  return compact(fs.readFileSync(path.join(repo, relative), 'utf8'))
}

test('authenticates the retained session/runtime telemetry surface', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const [fragment, count] of [
      ['attempt_duration_ms', 1],
      ['has_pr_number', 1],
      ['has_repo_path', 1],
      ['last_session_graceful_shutdown', 1],
      ['sessionStartType', 3],
      ['start_type', 1],
      ['set_env_var_count', 1],
      ['set_env_vars', 1],
      ['nondefault_setting_count', 1],
      ['nondefault_settings', 1],
      ['autoAddRemoteControlDaemonWorker', 1],
      ['saw_retry', 2],
      ['saw_compact', 2],
      ['retry_status', 1],
      ['cause_name', 1],
    ]) {
      assert.equal(
        occurrences(bundle, fragment),
        count,
        `${release.version}: ${fragment}`,
      )
    }
    assert.match(
      bundle,
      /subtype:[\w$]+\.subtype,is_error:[\w$]+\.is_error,num_turns:[\w$]+\.num_turns,duration_ms:[\w$]+\.duration_ms,duration_api_ms:[\w$]+\(\)-[\w$]+,saw_retry:[\w$]+,saw_compact:[\w$]+,retry_status:/,
      `${release.version}: SDK result telemetry`,
    )
  }
})

test('source records retry duration and autofix launch shape', () => {
  const retry = source('src/services/api/withRetry.ts')
  assert.ok(retry.includes('const attemptStartedAt = Date.now()'))
  assert.ok(
    retry.includes('attempt_duration_ms: Date.now() - attemptStartedAt'),
  )

  const autofix = source('src/commands/autofix-pr/autofix-pr.tsx')
  for (const fragment of [
    "action: 'start'",
    'has_pr_number: String(explicitPrNumber !== undefined)',
    'has_repo_path: String(repoPath !== undefined)',
  ]) {
    assert.ok(autofix.includes(compact(fragment)), fragment)
  }
})

test('source preserves start classification and startup inventory telemetry', () => {
  const state = source('src/bootstrap/state.ts')
  assert.ok(state.includes("sessionStartType: 'fresh'"))
  assert.ok(state.includes('export function getSessionStartType()'))
  assert.ok(state.includes('export function setSessionStartType('))

  const init = source('src/entrypoints/init.ts')
  assert.ok(
    init.includes(
      "getSessionCounter()?.add(1, { start_type: getSessionStartType() })",
    ),
  )

  const main = source('src/main.tsx')
  for (const fragment of [
    "arg.startsWith('--resume=') || arg.startsWith('--from-pr=')",
    'setSessionStartType(inferSessionStartType(cliArgs))',
    "'CLAUDE_CODE_ENTRYPOINT'",
    "name.startsWith('CLAUDE_CODE_') || name.startsWith('ANTHROPIC_')",
    'set_env_var_count: setEnvironmentVariables.length',
    "set_env_vars: setEnvironmentVariables.join(',')",
    'nondefault_setting_count: nondefaultSettings.length',
    "nondefault_settings: nondefaultSettings.join(',')",
    "theme: getConfigValue('theme', 'dark').value",
  ]) {
    assert.ok(main.includes(compact(fragment)), fragment)
  }

  const config = source('src/utils/config.ts')
  assert.ok(config.includes('autoAddRemoteControlDaemonWorker?: boolean'))
  assert.ok(config.includes("'autoAddRemoteControlDaemonWorker'"))
})

test('preserves target config-key order in startup telemetry', () => {
  const expectedOrder = [
    'autoScrollEnabled',
    'showTurnDuration',
    'externalEditorContext',
    'showMessageTimestamps',
    'diffTool',
    'env',
    'tipsHistory',
    'todoFeatureEnabled',
    'showExpandedTodos',
    'briefTranscript',
    'messageIdleNotifThresholdMs',
  ]

  for (const release of releases) {
    const bundle = readBundle(release)
    assert.ok(
      bundle.includes(expectedOrder.map(key => `"${key}"`).join(',')),
      `${release.version}: retained GLOBAL_CONFIG_KEYS order`,
    )
  }

  const config = source('src/utils/config.ts')
  let previousIndex = -1
  for (const key of expectedOrder) {
    const index = config.indexOf(`'${key}'`, previousIndex + 1)
    assert.ok(index > previousIndex, `${key}: exact source order`)
    previousIndex = index
  }

  const main = source('src/main.tsx')
  assert.ok(main.includes('for (const key of GLOBAL_CONFIG_KEYS)'))
  assert.ok(
    main.includes("nondefault_settings: nondefaultSettings.join(',')"),
  )
  assert.equal(
    main.includes('nondefaultSettings.sort('),
    false,
    'startup telemetry preserves GLOBAL_CONFIG_KEYS insertion order',
  )
})

test('source tracks prior graceful exit only for local persisted sessions', () => {
  const tracker = source('src/cost-tracker.ts')
  assert.ok(tracker.includes('lastGracefulShutdown: isShuttingDown()'))

  const hook = source('src/costHook.ts')
  for (const fragment of [
    "getRuntimeCapabilities().workspace === 'remote'",
    'getCurrentProjectConfig().lastGracefulShutdown !== false',
    'lastGracefulShutdown: false',
    'if (isShuttingDown()) saveCurrentSessionCosts(getFpsMetrics?.())',
  ]) {
    assert.ok(hook.includes(compact(fragment)), fragment)
  }

  const setup = source('src/setup.ts')
  assert.ok(
    setup.includes(
      'last_session_graceful_shutdown: projectConfig.lastGracefulShutdown ?? false',
    ),
  )
})

test('source records SDK outcomes, crashes, and delivery acknowledgements', () => {
  const print = source('src/cli/print.ts')
  for (const fragment of [
    "subtype: 'terminated'",
    'run_phase: runPhase ?? \'init\'',
    "message.subtype === 'api_retry'",
    "message.subtype === 'compact_boundary'",
    'duration_api_ms: getTotalAPIDuration() - apiDurationAtStart',
    'retry_status: sawRetry ? retryStatus : undefined',
    "logEvent('tengu_sdk_session_crash', getSDKCrashTelemetry(error))",
    'structuredIO.flushDeliveryAcks()',
    'sleep(5000, undefined, { unref: true })',
  ]) {
    assert.ok(print.includes(compact(fragment)), fragment)
  }

  const structured = source('src/cli/structuredIO.ts')
  const remote = source('src/cli/remoteIO.ts')
  const client = source('src/cli/transports/ccrClient.ts')
  assert.ok(structured.includes('flushDeliveryAcks(): Promise<void>'))
  assert.ok(
    remote.includes(
      'return this.ccrClient?.flushDeliveryAcks() ?? Promise.resolve()',
    ),
  )
  assert.ok(client.includes('return this.deliveryUploader.flush()'))

  const errors = source('src/utils/errors.ts')
  const tools = source('src/services/tools/toolExecution.ts')
  assert.ok(errors.includes('export function classifyTelemetryError('))
  assert.ok(tools.includes('return classifyTelemetryError(error)'))
})
