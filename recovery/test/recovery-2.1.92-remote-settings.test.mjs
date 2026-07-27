import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const sourceRoot = fileURLToPath(new URL('../../src/', import.meta.url))
const targetBundlePath = process.env.CLAUDE_CODE_2_1_92_BUNDLE
const TARGET_BUNDLE_SHA256 =
  '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362'
const requiredLoadError =
  'Your organization requires remote managed settings to load, but they could not be loaded. Check your network connection and credentials, or contact your administrator.'

function readSource(relativePath) {
  return fs.readFileSync(`${sourceRoot}${relativePath}`, 'utf8')
}

function readTargetBundle() {
  assert.ok(
    targetBundlePath,
    'CLAUDE_CODE_2_1_92_BUNDLE environment variable must be set',
  )
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    TARGET_BUNDLE_SHA256,
  )
  return bytes.toString('utf8')
}

async function validateRefreshModel(refresh) {
  try {
    if (await refresh()) return { valid: true }
  } catch {}
  return { valid: false, message: requiredLoadError }
}

test('models fresh-fetch success independently from fail-open cached settings', async () => {
  assert.deepEqual(await validateRefreshModel(async () => true), {
    valid: true,
  })
  assert.deepEqual(await validateRefreshModel(async () => false), {
    valid: false,
    message: requiredLoadError,
  })
  assert.deepEqual(
    await validateRefreshModel(async () => {
      throw new Error('network failure')
    }),
    { valid: false, message: requiredLoadError },
  )

  const service = readSource('services/remoteManagedSettings/index.ts')
  assert.match(
    service,
    /interface RemoteManagedSettingsLoadResult \{[\s\S]*?settings: SettingsJson \| null[\s\S]*?fetchSucceeded: boolean/,
  )
  assert.match(
    service,
    /Using stale cache after fetch failure[\s\S]*?fetchSucceeded: false/,
  )
  assert.match(
    service,
    /Cache still valid \(304 Not Modified\)[\s\S]*?fetchSucceeded: true/,
  )
  assert.match(
    service,
    /export async function loadRemoteManagedSettings\(\): Promise<boolean>/,
  )
  assert.match(
    service,
    /export async function refreshRemoteManagedSettings\(\): Promise<boolean>/,
  )
  const refreshStart = service.indexOf(
    'export async function refreshRemoteManagedSettings',
  )
  const refreshEnd = service.indexOf(
    'function notifyRemoteManagedSettingsChanged',
    refreshStart,
  )
  const refresh = service.slice(refreshStart, refreshEnd)
  assert.doesNotMatch(refresh, /clearRemoteManagedSettingsCache/)
  assert.match(
    refresh,
    /stopBackgroundPolling\(\)[\s\S]*?resetSyncCache\(\)[\s\S]*?loadingCompletePromise = null[\s\S]*?loadingCompleteResolve = null/,
  )
  assert.match(
    refresh,
    /Remote settings: Refreshed after auth change[\s\S]*?startBackgroundPolling\(\)/,
  )
  assert.match(
    service,
    /export async function validateRemoteManagedSettingsRefresh\([\s\S]*?if \(await refresh\(\)\)[\s\S]*?valid: false, message: REQUIRED_SETTINGS_LOAD_ERROR/,
  )
  assert.match(service, new RegExp(requiredLoadError.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

test('gates both initial startup and post-onboarding refresh on the managed policy', () => {
  const settings = readSource('utils/settings/types.ts')
  const main = readSource('main.tsx')

  assert.match(
    settings,
    /forceRemoteSettingsRefresh: z[\s\S]*?\.boolean\(\)[\s\S]*?freshly fetched/,
  )
  assert.match(
    main,
    /forceRemoteSettingsRefresh\) \{[\s\S]*?await validateRemoteManagedSettingsRefresh\(loadRemoteManagedSettings\)[\s\S]*?process\.stderr\.write\([\s\S]*?process\.exit\(1\)/,
  )
  assert.match(
    main,
    /forceRemoteSettingsRefresh\) \{[\s\S]*?await validateRemoteManagedSettingsRefresh\(refreshRemoteManagedSettings\)[\s\S]*?return await exitWithError\(root, result\.message\)/,
  )

  const bundle = readTargetBundle()
  assert.match(
    bundle,
    /forceRemoteSettingsRefresh:[^.]+\.boolean\(\)\.optional\(\)\.describe\("When set in managed settings, the CLI blocks startup until remote managed settings are freshly fetched, and exits if the fetch fails"\)/,
  )
  assert.match(bundle, /fetchSucceeded:!1/)
  assert.match(bundle, /fetchSucceeded:!0/)
  assert.match(bundle, new RegExp(requiredLoadError.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(
    bundle,
    /if\([^)]*\(\),[^)]*\(\),[^=]+?=null,[^=]+?=null,!/,
  )
  assert.match(
    bundle,
    /Remote settings: Refreshed after auth change"\),![^(]+\(\)\)[^(]+\(\)/,
  )

  const firstGate = bundle.indexOf('forceRemoteSettingsRefresh', 10_000_000)
  const secondGate = bundle.indexOf(
    'forceRemoteSettingsRefresh',
    firstGate + 1,
  )
  assert.notEqual(firstGate, -1)
  assert.notEqual(secondGate, -1)
  assert.match(
    bundle.slice(firstGate, firstGate + 400),
    /await [^(]+\([^)]*\)[\s\S]*?\.valid[\s\S]*?process\.stderr\.write/,
  )
  assert.match(
    bundle.slice(secondGate, secondGate + 400),
    /await [^(]+\([^)]*\)[\s\S]*?\.valid[\s\S]*?return await/,
  )
})
