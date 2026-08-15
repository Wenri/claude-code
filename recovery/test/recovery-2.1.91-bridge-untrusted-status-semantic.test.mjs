import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.90-to-2.1.91'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_91_BUNDLE
const targetSha256 =
  'b4bf141f30cf8b40196295816c7a6b9d01a36e906908d73a9f9a865ce4cdf816'
const isCurrentSource =
  path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_91_BUNDLE is not set'
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
  [
    9648,
    [
      8041996,
      8042061,
      'c6ea7c4fe28a2d75c621a3b64bb98bbb878e48de6542804abda2111f5a7f2c2b',
    ],
  ],
  [
    10295,
    [
      8298340,
      8299230,
      'c81662a83de8cf0d5d30bc424f22adca85b1dfe84429b30e228852efe28da8a2',
    ],
  ],
  [
    16342,
    [
      11777763,
      11777981,
      '8e3e5613daf15c11eed718383a4f5e92050fae341d58695c0a8715492bec4d24',
    ],
  ],
  [
    16343,
    [
      11777981,
      11779108,
      '25018fe93379e55effbdc1614317c18449e4ef7ffe603f5aff224c757a21492b',
    ],
  ],
  [
    16349,
    [
      11779389,
      11787823,
      'a44547f6c2933768a1f41bebf948437470c66712532f3577e18b380fb1224f9a',
    ],
  ],
  [
    16353,
    [
      11788783,
      11788843,
      '13d7a14f1fd1f673120dba590e6ba2aaea8bf8746a9b17d47554f4a07e796f36',
    ],
  ],
  [
    16378,
    [
      11796045,
      11805536,
      'f36f6f87c8497d5fda04f1494ec68df56e8ec1e6b8337fbc5cfae2ab38eb7178',
    ],
  ],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function assertFragments(relative, fragments) {
  const text = source(relative)
  for (const fragment of fragments) {
    assert.ok(text.includes(fragment), `${relative}: ${fragment}`)
  }
  return text
}

test('2.1.91 evidence pins every bridge-status and untrusted-device unit', bundleOptions, () => {
  const bundleBytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bundleBytes), targetSha256)
  const bundle = bundleBytes.toString('utf8')
  for (const [index, [start, end, sourceHash]] of pinnedUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
  }
  for (const fragment of [
    '/code?environment=',
    '/remote-control is active',
    ' · Code in CLI or at ',
    'untrusted_device',
    'trusted device',
    'run /login to enroll this device',
    'v2_remote_creds_untrusted_device',
    'Please upgrade to the latest version of the Claude mobile app to see your Remote Control sessions.',
  ]) {
    assert.ok(bundle.includes(fragment), fragment)
  }
})

test('source recovers the connect URL and one-line linked status rendering', sourceOptions, () => {
  assertFragments('src/bridge/bridgeStatusUtil.ts', [
    'return `${baseUrl}/code?environment=${environmentId}`',
  ])
  const display = assertFragments('src/components/messages/SystemTextMessage.tsx', [
    '/remote-control is active',
    ' · Code in CLI or at <Link url={message.url}>{message.url}</Link>',
    '<Text dimColor={true}>⎿  </Text>',
  ])
  if (!isCurrentSource) {
    assert.ok(
      display.includes(
        '<ThemedText color="suggestion">/remote-control is active</ThemedText>',
      ),
    )
    assert.ok(display.includes('<Box flexDirection="column">{t3}{t4}</Box>'))
  }
})

test('source classifies the exact 403 terminal response and preserves the gate', sourceOptions, () => {
  const api = assertFragments('src/bridge/codeSessionApi.ts', [
    "return 'terminal' in value",
    "detail?.includes('trusted device')",
    'response.status === 403',
  ])

  assertFragments('src/bridge/trustedDevice.ts', [
    'export function isTrustedDeviceGateEnabled()',
  ])
  if (isCurrentSource) {
    assertFragments('src/bridge/codeSessionApi.ts', [
      "| 'untrusted_device'",
      "resource === 'untrusted_device'",
      'return { terminal: true, reason }',
    ])
    assertFragments('src/bridge/remoteBridgeCore.ts', [
      'isRemoteCredentialsTerminal(credentials)',
      "case 'untrusted_device':",
      'isRemoteCredentialsTerminal(fresh)',
    ])
  } else {
    assertFragments('src/bridge/codeSessionApi.ts', [
      "reason: 'untrusted_device'",
      "data.error.resource === 'untrusted_device'",
      "return { terminal: true, reason: 'untrusted_device' }",
    ])
    assert.ok(
      api.indexOf("response.status === 403") <
        api.indexOf("return { terminal: true, reason: 'untrusted_device' }"),
    )
    const remote = assertFragments('src/bridge/remoteBridgeCore.ts', [
      'isRemoteCredentialsTerminal(credentials)',
      "const UNTRUSTED_DEVICE_DETAIL = 'run /login to enroll this device'",
      "'v2_remote_creds_untrusted_device'",
      'isRemoteCredentialsTerminal(fresh)',
      "onStateChange?.('failed', UNTRUSTED_DEVICE_DETAIL)",
      'return isTrustedDeviceGateEnabled() ? creds : null',
    ])
    assert.equal(
      remote.split('if (isRemoteCredentialsTerminal(fresh))').length - 1,
      2,
      'proactive refresh and 401 recovery both stop on terminal credentials',
    )
  }
})

test('hook carries the failure detail and the published upgrade nudge', sourceOptions, () => {
  const failureCall = isCurrentSource
    ? 'notifyBridgeFailed(detail_0, handleRef.current !== null)'
    : 'notifyBridgeFailed(detail_0)'
  const hook = assertFragments('src/hooks/useReplBridge.tsx', [
    failureCall,
    'replBridgeError: detail_0',
    'shouldShowAppUpgradeMessage()',
    'Please upgrade to the latest version of the Claude mobile app to see your Remote Control sessions.',
  ])
  assert.ok(
    hook.indexOf(failureCall) <
      hook.indexOf('replBridgeError: detail_0'),
  )
})

test('terminal classification and gate disposition match the bundled control flow', () => {
  function isUntrustedDeviceResponse(data, detail) {
    if (
      data !== null &&
      typeof data === 'object' &&
      'error' in data &&
      data.error !== null &&
      typeof data.error === 'object' &&
      'resource' in data.error &&
      data.error.resource === 'untrusted_device'
    ) {
      return true
    }
    return detail?.includes('trusted device') ?? false
  }
  function applyGate(result, gateEnabled) {
    if (result?.terminal) return gateEnabled ? result : null
    return result
  }

  assert.equal(
    isUntrustedDeviceResponse({ error: { resource: 'untrusted_device' } }),
    true,
  )
  assert.equal(isUntrustedDeviceResponse({}, 'requires trusted device'), true)
  assert.equal(isUntrustedDeviceResponse({}, 'permission denied'), false)
  const terminal = { terminal: true, reason: 'untrusted_device' }
  assert.equal(applyGate(terminal, false), null)
  assert.deepEqual(applyGate(terminal, true), terminal)
  assert.deepEqual(applyGate({ worker_jwt: 'jwt' }, true), {
    worker_jwt: 'jwt',
  })
})

test(
  'current source retains the later generalized terminal protocol',
  { ...sourceOptions, skip: sourceOptions.skip || !isCurrentSource },
  () => {
    if (!isCurrentSource) return
    assertFragments('src/bridge/codeSessionApi.ts', [
      "| 'session_stale_relogin'",
      "resource === 'session_stale_relogin'",
    ])
    assertFragments('src/bridge/remoteBridgeCore.ts', [
      "case 'session_stale_relogin':",
    ])
  },
)
