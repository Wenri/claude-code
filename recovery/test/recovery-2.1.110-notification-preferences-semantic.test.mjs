import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const historical = semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const bundlePaths = {
  109: process.env.CLAUDE_CODE_2_1_109_BUNDLE,
  110: process.env.CLAUDE_CODE_2_1_110_BUNDLE,
}
const bundleHashes = {
  109: '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7',
  110: 'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
}
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !bundlePaths[109] || !bundlePaths[110]
      ? '2.1.109 and 2.1.110 bundle paths are required'
      : false,
}
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

const pinnedUnits = new Map([
  [14145, [10158424, 10158509, '64bc9cd00fecf65d560ffe64564530bee060ac37d9581dff5a924470f2237094']],
  [14146, [10158509, 10158672, '81d7e63a19a6338933a5bd7d6d155e5d7f55f978376f7e9e01adc98c815fa890']],
  [14147, [10158672, 10158882, 'b8885e31041a2fa134bf33a9208eb2d758f26fba21a1c6e52f377183e9146646']],
  [14148, [10158882, 10159104, '855dcb7a837babf1ce717b601a8a663abe0b580b508de3ca436b826698b2c71f']],
  [14149, [10159104, 10159419, 'd7cb12891939f31992eeddce9743326e48dc4b58355c7408978ecdd11abc6b32']],
  [14150, [10159419, 10159728, '9dc6263ed56b2135b5f5c1f8646247b1acbdda405e7042c8b949ab7d37582eb5']],
  [14151, [10159728, 10160642, '201dabbc1784d2848b46ef7b625e442477a3e7dc35d3026ffd4acc41c49b816c']],
  [14153, [10160674, 10160813, 'a1f1086b685cb5fd9f0306cddbd2058ac4c742cb9e6e4c31b1577a9dd4c33b87']],
  [14160, [10164924, 10194516, 'a91c65ac689b6f5b9a53810db6fee4376eeae5d8a43e1d84e3eb3c83a763e81e']],
  [14163, [10195535, 10195854, '45cc7573f32092788271a9c60f132e769a85c2f385872ba0ef4437515654fa85']],
  [14164, [10195854, 10196435, 'c13a372013273ad2fa75c8f5bc1c4ca9908864c5ea333cd2eeb0b0b087b9f74d']],
  [17325, [12036268, 12039969, '4055cccbadafbe0151e356717d8c977f5581c7207dc46ee8365c78c7622c043c']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function readBundle(version) {
  const bytes = fs.readFileSync(bundlePaths[version])
  assert.equal(sha256(bytes), bundleHashes[version], `2.1.${version} artifact`)
  return bytes.toString('utf8')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function assertFragments(relative, fragments) {
  const contents = source(relative)
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${relative}: ${fragment}`)
  }
  return contents
}

test('target110 pins the complete notification-preferences introduction', bundleOptions, () => {
  const baseline = readBundle(109)
  const target = readBundle(110)

  for (const [index, [start, end, sourceHash]] of pinnedUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: class`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(target.slice(start, end)), sourceHash, `${index}: bytes`)
  }

  for (const fragment of [
    '/api/claude_code/notification/preferences',
    'notif_prefs_fetch_failed',
    'notif_prefs_patch_ok',
    'notif_prefs_patch_failed',
    'notif_prefs_hydrate_skipped',
    'notif_prefs_hydrate_result',
    'tengu_push_reachability',
    'fetch_failed_or_no_auth',
    'Push when actions required',
    'tengu_push_notif_pref_changed',
    'No mobile registered ·',
    'https://claude.com/download#mobile',
  ]) {
    assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
    assert.equal(target.includes(fragment), true, `${fragment}: target`)
  }

  for (const fragment of [
    'Session persistence enabled — transcript entries forwarded as internal events',
    'Transport torn down during sync — skipping writer install',
    'tengu_kairos_push_notifications',
  ]) {
    assert.equal(target.includes(fragment), true, `${fragment}: combined bridge unit`)
  }
})

test('source owns authenticated preference fetch, patch, hydration, and seeding', sourceOptions, () => {
  const service = assertFragments('src/services/notificationPreferences.ts', [
    '/api/claude_code/notification/preferences',
    "'anthropic-beta': OAUTH_BETA_HEADER",
    "'User-Agent': getClaudeCodeUserAgent()",
    'NOTIFICATION_PREFERENCES_TIMEOUT_MS = 10_000',
    'await checkAndRefreshOAuthTokenIfNeeded()',
    "logForDiagnosticsNoPII('warn', 'notif_prefs_fetch_failed'",
    "logForDiagnosticsNoPII('info', 'notif_prefs_patch_ok'",
    "logForDiagnosticsNoPII('warn', 'notif_prefs_patch_failed'",
    'featurePreference.bogosort',
    'featurePreference.code_requires_action',
    "logEvent('tengu_push_reachability'",
    'current.agentPushNotifEnabled === undefined',
    'current.inputNeededNotifEnabled === undefined',
    "logForDiagnosticsNoPII('info', 'notif_prefs_hydrate_result'",
    'saveGlobalConfig(config => ({ ...config, ...seeded }))',
    'notificationPreferencesHydrated.emit()',
  ])
  assert.ok(
    service.indexOf('await checkAndRefreshOAuthTokenIfNeeded()') <
      service.indexOf('getNotificationPreferencesHeaders()', service.indexOf('async function fetchNotificationPreferences')),
  )
  assert.ok(
    service.indexOf('current.agentPushNotifEnabled === undefined') <
      service.indexOf('saveGlobalConfig(config => ({ ...config, ...seeded }))'),
    'explicit local values win before server seeding',
  )
})

test('config gates, syncs, warns, and rolls account preferences back on cancel', sourceOptions, () => {
  const config = assertFragments('src/components/Settings/Config.tsx', [
    "'tengu_kairos_push_notifications'",
    "'tengu_kairos_input_needed_push'",
    '!isEssentialTrafficOnly()',
    'getClaudeAIOAuthTokens()?.accessToken',
    'Push when actions required',
    'Push when Claude decides',
    'originalPushNotificationPreferences.current.inputNeededNotifEnabled',
    'originalPushNotificationPreferences.current.agentPushNotifEnabled',
    'syncNotificationPreferences();',
    "logEvent('tengu_push_notif_pref_changed'",
    'subscribeNotificationPreferencesHydrated',
    'rollbackNotificationPreferences(originalPushNotificationPreferences.current)',
    'React.useSyncExternalStore(',
    'reachability?.has_active_channel !== false',
    'No mobile registered ·',
    'https://claude.com/download#mobile',
    'and turn on notif',
  ])
  assert.equal(config.includes("label: 'Push when idle'"), false)
  assert.equal(config.includes("label: 'Push when input needed'"), false)
  assert.ok(
    config.indexOf('originalPushNotificationPreferences.current.inputNeededNotifEnabled') <
      config.indexOf('syncNotificationPreferences();'),
    'first local value is captured before account synchronization',
  )
})

test('remote-session establishment hydrates preferences behind privacy and feature gates', sourceOptions, () => {
  const bridge = assertFragments('src/bridge/initReplBridge.ts', [
    'onSessionEstablished: sessionId => {',
    'wireBridgeClientPresence(',
    "'tengu_kairos_push_notifications'",
    '!isEssentialTrafficOnly()',
    'void hydrateNotificationPreferences()',
  ])
  const hydration = bridge.indexOf('void hydrateNotificationPreferences()')
  const v1Session = bridge.lastIndexOf('onSessionEstablished: sessionId => {', hydration)
  assert.ok(v1Session >= 0)
  assert.ok(bridge.indexOf('wireBridgeClientPresence(', v1Session) < hydration)
})

test('combined bridge owner preserves target110 writer-only persistence and teardown', sourceOptions, () => {
  const bridge = assertFragments('src/bridge/initReplBridge.ts', [
    'listAllSubagentTranscriptIdsFromDisk()',
    'await syncPersistence(writer, readers, subagentIds)',
    'Transport torn down during sync — skipping writer install',
    'setInternalEventWriter(writer)',
    'clearInternalEventWriter()',
    '...(enableSessionPersistence ? persistenceCallbacks : {})',
    'cleanupBridgeClientPresence()',
  ])
  assertFragments('src/bridge/persistenceSync.ts', [
    'export async function syncPersistence(',
    'readMain()',
    'readSubagents()',
  ])
  assertFragments('src/bridge/clientPresence.ts', [
    'export function wireBridgeClientPresence(',
    'export function cleanupBridgeClientPresence()',
  ])
  assertFragments('src/bridge/replBridge.ts', [
    'onTransportPersistenceReady?.(writer, readers)',
    'onTransportPersistenceTeardown?.()',
  ])
  assertFragments('src/bridge/remoteBridgeCore.ts', [
    'onTransportPersistenceReady?.(writer, readers)',
    'onTransportPersistenceTeardown?.()',
  ])
  assertFragments('src/bridge/replBridgeTransport.ts', [
    'getInternalEventWriter?(): InternalEventWriter',
    'getInternalEventReaders?(): InternalEventReaders',
    'ccr.writeInternalEvent(eventType, payload, options)',
    'readSubagents: () => ccr.readSubagentInternalEvents()',
  ])
  assertFragments('src/utils/sessionStorage.ts', [
    'export async function listAllSubagentTranscriptIdsFromDisk()',
    'export function setInternalEventWriter(',
    'export function clearInternalEventWriter()',
  ])

  if (historical) {
    assert.ok(
      bridge.includes(
        'Session persistence enabled — transcript entries forwarded as internal events',
      ),
      'target110 installs only the transcript writer after hydration',
    )
    assert.equal(bridge.includes('setInternalEventReader('), false)
  } else {
    assert.ok(
      bridge.includes(
        'Session persistence enabled — transcript writer + hydrate readers registered',
      ),
      'cumulative current source carries the later target116 reader registration',
    )
  }
})
