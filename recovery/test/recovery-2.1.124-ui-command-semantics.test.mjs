import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = {
  baseline: {
    env: 'CLAUDE_CODE_2_1_123_BUNDLE',
    bytes: 13_949_576,
    sha256:
      '59c8eebc0660d4bbc5c1f82af0ca5e94df5db46084687b979ad21a07fba3d7dd',
  },
  target: {
    env: 'CLAUDE_CODE_2_1_124_BUNDLE',
    bytes: 13_980_928,
    sha256:
      'dc2b68c385a3064737343e51e6d7c690f9e03cc40fa89c4393708ae03094d590',
  },
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function readBundle(release) {
  const filename = process.env[release.env]
  assert.ok(filename, `${release.env} must be set`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, release.bytes)
  assert.equal(sha256(value), release.sha256)
  return value
}

function source(relative) {
  return fs
    .readFileSync(path.join(repo, relative), 'utf8')
    .split('\n//# sourceMappingURL=', 1)[0]
}

function compact(value) {
  return value.replaceAll(';', '').replaceAll(/\s+/g, ' ').trim()
}

function assertFragments(relative, fragments) {
  const contents = compact(source(relative))
  for (const fragment of fragments) {
    assert.ok(
      contents.includes(compact(fragment)),
      `${relative}: missing ${compact(fragment)}`,
    )
  }
}

const baselineStatements = [
  [10_754_561, 589, 'ebc1bdd845c31d741d1d85059d256cb5b0c412c95ff57140bf4123e28d32216d'],
  [10_757_098, 7_169, '3aa9680555fb93ebf3b0a076939ab1b6a90358e3443ba419a43556e81d5338f6'],
  [10_801_462, 42, '2f4d4d1a8fb4f3832e30bd956ff1e9996356182b9027aefbc67ec4556c28beaf'],
  [10_801_504, 22, '41b353c9d976d1fe891c3b1b2a26d321062623fc11e4784f08456c3534d54b7d'],
  [10_903_529, 10_024, 'f2e9f73184a463e4e9a97b23d8fb4a1d6bd234f3e3066fbeee464cf8e531e6c1'],
  [10_924_654, 566, '616c544b82baa40729c589f2e2b620ef40bd0dc11fa31eedc81c3f1842d10d05'],
  [10_925_309, 51, 'cf1a152e0644c18c6dff1e71261fdefa8674fa30ee3891aee1b46975b1d9b475'],
  [11_011_982, 11_026, '744ee923fa1ec5f0a9992b9f4da638d00768f9afedb671b1b032207f343fa93c'],
  [11_134_230, 1_414, '1d4468effcffdd09858a1d1dbe9972a68e370884c25c43a80cce91c02c89faa1'],
  [11_135_919, 98, '19619e52dbf7930d05735fce6beeea0de743af498695abaf0c43a14024cc42c2'],
  [11_243_205, 953, 'fc5387a071497d8fc92e99efcdc9225c26b770070f4d9f4fa00c96a10290471c'],
  [11_244_362, 563, 'd43d0265eb527fd15e2cb79118ce317015b083e347664abf14c9daf51990efe0'],
  [11_265_221, 373, 'bf3ad2c07d50f48fb8c554acf29d18be30acd9de15bf270bcb931503e7027472'],
  [11_265_709, 151, '88c2ddf657a9b3d567e5ff0f5c4212867c4f88344adbec615c2327c70d85e4db'],
  [11_505_374, 2_659, '9661be51cd0533ad1971a8851c4584e9a147b8fe372f322bc9dadea82a34ab51'],
  [11_518_476, 129, '8defb2714bf87e7d2ba956257296444e88b815a464b4c1e81b06a26773842235'],
  [11_523_842, 678, 'e6c4fa8dd9d8af28b0ca685b87463241c458b33c868e299f5c8230041695f2e1'],
]

const targetStatements = [
  [10_769_428, 1_091, '43034ff16a1dc8a832f99c27340ce4a811301f3cacdd912c037ab8aa24863b05'],
  [10_772_467, 7_171, '8c7a9972aeb2f3fa6b037cc91ca1680d0b9565d3c759aae943e7376a39a019e8'],
  [10_816_830, 48, '4adbcae5b48a125169d235a752d2ef3680237a90b798aeae349ed999eebfc7b1'],
  [10_816_878, 27, 'e0b58bc2f555bf0596c5855cf9b4d78ad517eee2571792ad374deb7928f24e1a'],
  [10_918_919, 10_055, '9263b8d185f90e2707c329f75321b9d849042de2cad158f9aadfae7d9d97a51a'],
  [10_940_075, 696, '47d67a516a6cc7104b1d694e07afb09b43bb6248827d073d5336d979ba596a1c'],
  [10_940_860, 56, 'ec052d0de94ecd43173264d898c74719ea42f09532b506f725400c3ad8bede10'],
  [11_027_640, 11_050, 'ff2fe9a3f72c55d9f604a94628e41cb52d1c8b7d6a3f103b09f2c36867d2363d'],
  [11_149_926, 1_420, '4aac429e6ac4ae83044981025bb0af35842549c1706cce106ab4725753565c92'],
  [11_151_621, 103, '9c3ecce5ef88e5c3d511a4317bee3485162bac0e6f049f7a4f08e18e98eb9624'],
  [11_258_918, 821, '2574071bfb6f33234263777b7c9954e2901aaa9c66767db951c052defb5c4310'],
  [11_259_943, 445, '6c35448580e5e2b47a193db405fe30a202dfe779cefd43c2ae934d040b364920'],
  [11_280_676, 399, '03e1361e37f921158102167ab6567d4877da83cc6dc296197aa271485e9d0fd7'],
  [11_281_190, 157, 'bc89ac2fa312eefd12c84ada66209aaeeafcea09e624e2b5c926d73f365f7089'],
  [11_520_860, 2_669, '21a64cbfb5dcc553c7101ea5449f0e2ee683ea2253e0fa662f9319c69c02c9bc'],
  [11_533_972, 106, '3b8bee624da9ec8112a4407d7b6d0a3933f4d9f508294f29b763b33f4419f10d'],
  [11_539_305, 689, '88af8d6fa0fe2a85d2f3f3cbe179f61f4e6e1e78f32a795f33dc4c690b61ba03'],
]

test('authenticates the 2.1.124 UI and command statement deltas', () => {
  const baseline = readBundle(releases.baseline)
  const target = readBundle(releases.target)
  for (const [offset, bytes, expected] of baselineStatements) {
    assert.equal(sha256(baseline.subarray(offset, offset + bytes)), expected)
  }
  for (const [offset, bytes, expected] of targetStatements) {
    assert.equal(sha256(target.subarray(offset, offset + bytes)), expected)
  }
})

test('brief filtering is turn-aware and keeps channel input', () => {
  assertFragments('src/components/Messages.tsx', [
    'textSuppressingToolNames: string[]',
    'const turnsWithReplacementText = new Set<number>()',
    "message.type === 'user' && block?.type !== 'tool_result' && (!message.isMeta || isChannelOrigin(message.origin))",
    "message.attachment.commandMode === 'prompt' && (isChannelOrigin(message.attachment.origin) || (!message.attachment.isMeta && message.attachment.origin === undefined))",
    'turnsWithReplacementText.add(turn)',
    "block?.type === 'text' && !turnsWithReplacementText.has(messageTurns[index]!)",
    'return !msg.isMeta || isChannelOrigin(msg.origin)',
    'filterForBriefTool(messagesToShowNotTruncated, briefToolNames, dropTextToolNames)',
  ])
})

test('UI commands recover bridge gates, MCP guidance, and session-only effort', () => {
  assertFragments('src/commands/review/ultrareviewEnabled.ts', [
    'getUltrareviewConfig()?.enabled === true && isBridgeEnabled()',
  ])
  assertFragments('src/components/tasks/BackgroundTasksDialog.tsx', [
    "(currentSelection as { type: string } | null)?.type !== 'mcp_task'",
  ])
  assertFragments('src/commands/teleport/teleport.tsx', [
    'const appStateStore = useAppStateStore()',
    'Boolean(appStateStore.getState().replBridgeSessionId)',
  ])
  assertFragments('src/utils/hooks/hooksConfigManager.ts', [
    "'authentication_failed', 'oauth_org_not_allowed', 'billing_error'",
  ])

  const effort = source('src/commands/effort/effort.tsx')
  assert.equal(effort.includes('updateSettingsForSource'), false)
  assert.ok(effort.includes('effortUpdate: { value: effortValue }'))
  assert.ok(effort.includes('effortUpdate: { value: undefined }'))
})

test('plugin refresh, trusted-device preflight, and background jobs match target', () => {
  const refresh = source('src/utils/plugins/refresh.ts')
  const installed = refresh.indexOf('clearInstalledPluginsCache()')
  const allCaches = refresh.indexOf('clearAllCaches()', installed)
  const exclusions = refresh.indexOf('clearPluginCacheExclusions()', allCaches)
  assert.ok(installed >= 0 && installed < allCaches && allCaches < exclusions)

  assertFragments('src/bridge/trustedDevice.ts', [
    'if (!isTrustedDeviceGateEnabled()) return null',
    'if (readStoredTrustedDeviceToken()) return null',
    'Your organization requires Trusted Devices for Remote Control, but this device is not enrolled. Please run `/login` in Claude Code to enroll this device.',
  ])
  assertFragments('src/commands/bridge/bridge.tsx', [
    'const trustedDeviceReason = getTrustedDeviceUnenrolledReason()',
    'if (trustedDeviceReason) { return trustedDeviceReason }',
  ])
  assertFragments('src/cli/bg.ts', [
    "SHOW_CURSOR + '\\x1B[0m' + DISABLE_KITTY_KEYBOARD",
  ])

  const jobs = source('src/cli/handlers/templateJobs.ts')
  const reply = jobs.slice(
    jobs.indexOf('export async function sendJobReply'),
    jobs.indexOf('export async function claimPrewarmedJob'),
  )
  assert.equal(reply.includes('detail: text.replace'), false)
  assert.ok(jobs.includes('const { removed, error } = await deleteBgJob'))
  assert.ok(
    jobs.includes(
      "error: error ?? detail ?? 'Background service unreachable'",
    ),
  )
})
