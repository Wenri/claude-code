import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const sourceRoot = fileURLToPath(new URL('../../src/', import.meta.url))
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
const BASELINE_BUNDLE_SHA256 =
  'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be'
const TARGET_BUNDLE_SHA256 =
  'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb'

function source(relativePath) {
  return fs.readFileSync(`${sourceRoot}${relativePath}`, 'utf8')
}

function requiredBundle(filename, label, expectedSha256) {
  assert.ok(filename, `${label} environment variable must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    expectedSha256,
  )
  return bytes.toString('utf8')
}

test('recovers configurable bundled and OS CA trust without shell lookup', () => {
  const caCerts = source('utils/caCerts.ts')
  const which = source('utils/which.ts')

  assert.match(caCerts, /DEFAULT_CA_STORES = \['bundled', 'system'\]/)
  assert.match(caCerts, /process\.env\.CLAUDE_CODE_CERT_STORE/)
  assert.match(caCerts, /getCACerts\?\.\('system'\)/)
  assert.match(caCerts, /return certs\.length > 0 \? uniq\(certs\) : undefined/)

  assert.match(which, /execa\('which', \[command\]/)
  assert.match(which, /execFileSync\('which', \[command\]/)
  assert.match(which, /getWindowsWhereExecutable\(\), \[command\]/)
  assert.doesNotMatch(which, /`which \$\{command\}`/)
})

test('recovers refusal details, retention safety, and SigV4 header isolation', () => {
  const errors = source('services/api/errors.ts')
  const claude = source('services/api/claude.ts')
  const cleanup = source('utils/cleanup.ts')
  const client = source('services/api/client.ts')

  assert.match(errors, /has_explanation: Boolean\(explanation\)/)
  assert.match(errors, /explanation\.slice\(0, maxExplanationLength\)/)
  assert.match(errors, /\/\[.!\?…\]\$\//)
  assert.match(claude, /deltaWithStopDetails\.stop_details/)

  assert.ok(
    cleanup.indexOf('await cleanupOldImageCaches()') <
      cleanup.indexOf("!isSettingSourceEnabled('userSettings')"),
  )
  assert.match(
    cleanup,
    /getSettings_DEPRECATED\(\)\?\.cleanupPeriodDays === undefined/,
  )

  assert.match(client, /defaultHeaders: headersWithoutAuthorization/)
  assert.match(client, /apiKey: null/)
  assert.match(
    client,
    /normalizeModelStringForAPI\(model\)[\s\S]*normalizeModelStringForAPI\(getSmallFastModel\(\)\)/,
  )
})

test('recovers permission precedence and stale ripgrep re-resolution', () => {
  const hooks = source('services/tools/toolHooks.ts')
  const ripgrep = source('utils/ripgrep.ts')

  assert.match(
    hooks,
    /Hook returned '\$\{behavior\}'.*deny rule overrides/,
  )
  assert.match(
    hooks,
    /ask rule\/safety check requires full permission pipeline/,
  )
  assert.match(
    hooks,
    /hookPermissionResult\?\.behavior !== 'allow'[\s\S]*hookPermissionResult\?\.behavior !== 'ask'[\s\S]*const behavior = hookPermissionResult\.behavior[\s\S]*checkRuleBasedPermissions\(/,
  )

  assert.match(ripgrep, /command: systemPath/)
  assert.match(ripgrep, /whichSync\(process\.execPath\)/)
  assert.match(ripgrep, /err\.code === 'ENOENT'.*clearRipgrepCache\(\)/)
  assert.match(
    ripgrep,
    /if \(ripgrepStatus\?\.working !== false\)[\s\S]*ripgrepStatus = null/,
  )
})

test('recovers focus display, thinking cadence, key controls, and live resume leaf', () => {
  const prompts = source('constants/prompts.ts')
  const repl = source('screens/REPL.tsx')
  const keypress = source('ink/parse-keypress.ts')
  const sessions = source('utils/sessionStorage.ts')
  const virtualList = source('components/VirtualMessageList.tsx')

  assert.match(prompts, /systemPromptSection\('focus_mode'/)
  assert.match(prompts, /The user has focus mode enabled/)
  assert.match(
    repl,
    /afterMs: 30000,[\s\S]*afterMs: 60000,[\s\S]*afterMs: 90000,[\s\S]*afterMs: 150000,[\s\S]*afterMs: 240000,/,
  )
  assert.match(keypress, /s === '\\x1c'[\s\S]*key\.name = '\\\\'/)
  assert.match(keypress, /s === '\\x1d'[\s\S]*key\.name = '\]'/)
  assert.match(keypress, /s === '\\x1e'[\s\S]*key\.name = '\^'/)
  assert.match(
    sessions,
    /candidate\.isSidechain !== child\.isSidechain/,
  )
  assert.match(sessions, /lastWrittenNonSidechainUuid/)
  assert.match(virtualList, /renderItemRef\.current\(msg, idx\)/)
})

test('authenticated adjacent bundles contain the recovered target behaviors', () => {
  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_100_BUNDLE',
    BASELINE_BUNDLE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_101_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )

  const targetOnly = [
    'CA certs: stores=',
    'CLAUDE_CODE_CERT_STORE',
    'has_explanation',
    'Skipping retention cleanup: userSettings source is disabled',
    'Not a recognized hook event. Common events:',
    'ask rule/safety check requires full permission pipeline',
    '# Focus mode',
    'This is a harder one… it might take another minute…',
    'Still going… thanks for hanging in there…',
    'Taking the time to get this right… thanks for your patience…',
  ]
  for (const fragment of targetOnly) {
    assert.equal(baseline.includes(fragment), false, fragment)
    assert.equal(target.includes(fragment), true, fragment)
  }

  assert.equal(
    baseline.includes(
      'This is a harder one… it might take a few more minutes…',
    ),
    true,
  )
  assert.equal(
    target.includes(
      'This is a harder one… it might take a few more minutes…',
    ),
    false,
  )
})
