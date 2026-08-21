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
    envNames: ['CLAUDE_CODE_2_1_121_BUNDLE', 'CLAUDE_2_1_121_CLI_INNER'],
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  {
    version: '2.1.122',
    envNames: ['CLAUDE_CODE_2_1_122_BUNDLE', 'CLAUDE_2_1_122_CLI_INNER'],
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
]

function readBundle(release) {
  const filename = release.envNames.map(name => process.env[name]).find(Boolean)
  assert.ok(filename, `${release.envNames.join(' or ')} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return bytes.toString('utf8')
}

function assertOrder(text, ...needles) {
  let cursor = -1
  for (const needle of needles) {
    const next = text.indexOf(needle, cursor + 1)
    assert.ok(next > cursor, `${needle} is missing or out of order`)
    cursor = next
  }
}

test('authenticates retained sandbox mailbox mode and classifier behavior', () => {
  for (const release of releases) {
    const bundle = readBundle(release)

    assert.match(
      bundle,
      /function [\w$]+\(([\w$]+),([\w$]+)\)\{if\(\1==="auto"\)return"classify";if\(\1==="bypassPermissions"\|\|\1==="plan"&&\2\)return"allow";if\(\1==="dontAsk"\)return"deny";return"ask"\}/,
      `${release.version}: exact sandbox mode policy`,
    )

    const classifierAnchor = bundle.indexOf(
      'Sandbox network classifier unavailable for',
    )
    assert.ok(classifierAnchor >= 0, `${release.version}: classifier anchor`)
    const classifier = bundle.slice(
      classifierAnchor - 1200,
      classifierAnchor + 2200,
    )
    assert.ok(
      classifier.includes('SandboxNetworkAccess'),
      `${release.version}: synthetic sandbox tool`,
    )
    assertOrder(
      classifier,
      'tengu_iron_gate_closed',
      'Sandbox network classifier unavailable for',
      'Auto mode classifier blocked sandbox network access to',
    )

    const inboxAnchor = bundle.indexOf(
      '[InboxPoller] Auto-resolving sandbox request',
    )
    assert.ok(inboxAnchor >= 0, `${release.version}: inbox anchor`)
    const inbox = bundle.slice(inboxAnchor - 1300, inboxAnchor + 1000)
    assert.match(
      inbox,
      /switch\([\w$]+\)\{case"allow":return!0;case"deny":return!1;case"classify":return [\w$]+\([\w$]+,void 0,\[\],[\w$]+\(\),[\w$]+\.toolPermissionContext,new AbortController\(\)\.signal\);case"ask":return null\}/,
      `${release.version}: lead auto-resolution decision`,
    )
    assertOrder(
      inbox,
      'Invalid sandbox permission request: missing hostPattern.host',
      '[InboxPoller] Auto-resolving sandbox request',
      'workerName',
      'requestId',
      'hostPattern.host',
      'continue',
      'workerId',
    )
  }
})

test('source auto-resolves non-interactive sandbox prompts before queueing', () => {
  const permissionMode = fs.readFileSync(
    path.join(repo, 'src/utils/permissions/PermissionMode.ts'),
    'utf8',
  )
  const classifier = fs.readFileSync(
    path.join(repo, 'src/utils/permissions/yoloClassifier.ts'),
    'utf8',
  )
  const inbox = fs.readFileSync(
    path.join(repo, 'src/hooks/useInboxPoller.ts'),
    'utf8',
  )

  assertOrder(
    permissionMode,
    "if (mode === 'auto') return 'classify'",
    "mode === 'bypassPermissions'",
    "mode === 'plan' && isBypassPermissionsModeAvailable",
    "return 'allow'",
    "if (mode === 'dontAsk') return 'deny'",
    "return 'ask'",
  )
  assertOrder(
    classifier,
    "const SANDBOX_NETWORK_ACCESS_TOOL_NAME = 'SandboxNetworkAccess'",
    'formatActionForClassifier(SANDBOX_NETWORK_ACCESS_TOOL_NAME',
    'toAutoClassifierInput: (input: unknown) => input',
    'await classifyYoloAction(',
    "'tengu_iron_gate_closed'",
    'Sandbox network classifier unavailable for',
    'Auto mode classifier blocked sandbox network access to',
  )

  const from = inbox.indexOf(
    '// Handle sandbox permission requests (leader side)',
  )
  const to = inbox.indexOf(
    '// Handle sandbox permission responses (worker side)',
    from,
  )
  assert.ok(from >= 0 && to > from)
  const sandbox = inbox.slice(from, to)
  assertOrder(
    sandbox,
    'getSandboxPermissionBehavior(',
    "case 'allow'",
    "case 'deny'",
    "case 'classify'",
    'classifySandboxNetworkAccess(',
    "case 'ask'",
    'const allow = await resolveSandboxRequest',
    '[InboxPoller] Auto-resolving sandbox request',
    'sendSandboxPermissionResponseViaMailbox(',
    'continue',
    'newSandboxRequests.push({',
  )
})
