import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_PUBLISHED_BUNDLE

const BASELINE_SHA256 =
  'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be'
const TARGET_SHA256 =
  'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb'
const LATEST_SHA256 =
  '06cb80193f3af8bb468d1536b230b0e2f854a398b1e88af3c79048ce821bf193'

const targetUnits = [
  [361, 30601, 33213, 'e952f124f4b411f8f0cfd4d598ed10437a4be73adec8d9d5cecd0c48db4c691c'],
  [438, 37129, 37183, 'b4d97746756e7bf79b2fcd2741b800ec015a8f1aa9ee1376fedda92f6c8f7ad2'],
  [4636, 3483335, 3485107, '31b9b4e904e32dcdb0ffe28f97bd046f9a9f76ef84718fc594edef4148081ea0'],
  [4681, 3497992, 3498614, '7eb6b6af91d6b7c41800d731fa3073a336a5bb3ac9527b342b6127bf50c1919a'],
  [17996, 12570592, 12583585, '4968930c8761cac5f3424cba4c4a31af072fe7f26dcf74a474ea54efd988c4c1'],
  [18007, 12585723, 12593614, '23bedc53a663e5b86f207bf60b85b8dcde6741ac688c14dc02c907f5445ebe8f'],
  [18767, 13331502, 13337686, '0cd9386c3762c938aeb1889bd54776516ff9249bfeeaa82df13472c3a2a156e2'],
]

function authenticatedBundle(filename, expectedHash, label) {
  assert.ok(filename, `${label} bundle environment variable must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    expectedHash,
  )
  return bytes.toString('utf8')
}

function readSource(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function loadOAuth401Implementation(source) {
  const start = source.indexOf('async function handleOAuth401ErrorImpl(')
  assert.notEqual(start, -1)
  const endMarker = '\n}\n\n/**\n * Reads OAuth tokens asynchronously'
  const end = source.indexOf(endMarker, start)
  assert.notEqual(end, -1)
  const functionSource = source
    .slice(start, end + 2)
    .replace('failedAccessToken: string', 'failedAccessToken')
    .replace('): Promise<boolean> {', ') {')
  return new Function(
    'clearOAuthTokenCache',
    'getClaudeAIOAuthTokensAsync',
    'getSdkOAuthTokenRefreshCallback',
    'logEvent',
    'logForDebugging',
    'checkAndRefreshOAuthTokenIfNeeded',
    `${functionSource}; return handleOAuth401ErrorImpl`,
  )
}

test('target101 pins the SDK OAuth/control call graph units', () => {
  const baseline = authenticatedBundle(baselinePath, BASELINE_SHA256, '2.1.100')
  const target = authenticatedBundle(targetPath, TARGET_SHA256, '2.1.101')

  for (const marker of [
    'sdkOAuthTokenRefreshCallback',
    'tengu_oauth_401_sdk_callback_refreshed',
    'request_user_dialog',
    'CLAUDE_CODE_SDK_HAS_OAUTH_REFRESH',
  ]) {
    assert.equal(baseline.includes(marker), false, marker)
    assert.equal(target.includes(marker), true, marker)
  }

  for (const [index, start, end, expectedHash] of targetUnits) {
    const unit = target.slice(start, end)
    assert.equal(
      crypto.createHash('sha256').update(unit).digest('hex'),
      expectedHash,
      `target101 unit ${index}`,
    )
  }
})

test('source owns callback state, protocol schemas, timeout, and the guarded host bridge', () => {
  const state = readSource('bootstrap/state.ts')
  const auth = readSource('utils/auth.ts')
  const schemas = readSource('entrypoints/sdk/controlSchemas.ts')
  const io = readSource('cli/structuredIO.ts')
  const print = readSource('cli/print.ts')

  assert.match(
    state,
    /sdkOAuthTokenRefreshCallback: \(\(\) => Promise<string \| null>\) \| null/,
  )
  assert.match(state, /sdkOAuthTokenRefreshCallback: null/)
  assert.match(
    state,
    /function getSdkOAuthTokenRefreshCallback[\s\S]*return STATE\.sdkOAuthTokenRefreshCallback/,
  )
  assert.match(
    state,
    /function setSdkOAuthTokenRefreshCallback[\s\S]*STATE\.sdkOAuthTokenRefreshCallback = callback/,
  )

  for (const entrypoint of [
    "'claude-desktop'",
    "'local-agent'",
    "'claude-vscode'",
  ]) assert.ok(auth.includes(entrypoint), entrypoint)
  assert.ok(auth.includes('export const SDK_OAUTH_REFRESH_ENTRYPOINTS = new Set(['))

  for (const fragment of [
    "z.literal('request_user_dialog')",
    "z.enum(['completed', 'cancelled'])",
    "z.literal('oauth_token_refresh')",
    'accessToken: z.string().nullable()',
    'SDKControlUserDialogRequestSchema()',
    'SDKControlOAuthTokenRefreshRequestSchema()',
  ]) assert.ok(schemas.includes(fragment), fragment)

  for (const fragment of [
    'async requestUserDialog(',
    "subtype: 'request_user_dialog'",
    "return { behavior: 'cancelled' }",
    'async requestOAuthTokenRefresh()',
    "subtype: 'oauth_token_refresh'",
    'AbortSignal.timeout(30_000)',
    'return response.accessToken',
  ]) assert.ok(io.includes(fragment), fragment)

  assert.match(
    print,
    /isEnvTruthy\(process\.env\.CLAUDE_CODE_SDK_HAS_OAUTH_REFRESH\)[\s\S]*SDK_OAUTH_REFRESH_ENTRYPOINTS\.has\([\s\S]*setSdkOAuthTokenRefreshCallback\(\(\) =>[\s\S]*structuredIO\.requestOAuthTokenRefresh\(\)/,
  )
})

test('the recovered source executes every observable OAuth callback outcome', async () => {
  const source = readSource('utils/auth.ts')
  const createImplementation = loadOAuth401Implementation(source)
  const originalToken = process.env.CLAUDE_CODE_OAUTH_TOKEN
  try {
    const events = []
    const debug = []
    let clears = 0
    let forced = 0
    const run = callback =>
      createImplementation(
        () => {
          clears++
        },
        async () => ({ accessToken: 'expired', refreshToken: null }),
        () => callback,
        (name, metadata) => events.push([name, metadata]),
        (message, options) => debug.push([message, options]),
        async () => {
          forced++
          return true
        },
      )

    assert.equal(await run(async () => 'fresh-token')('expired'), true)
    assert.equal(process.env.CLAUDE_CODE_OAUTH_TOKEN, 'fresh-token')
    assert.equal(clears, 2)
    assert.deepEqual(events, [['tengu_oauth_401_sdk_callback_refreshed', {}]])
    assert.equal(forced, 0)

    assert.equal(await run(async () => null)('expired'), false)
    assert.deepEqual(debug.at(-1), [
      'SDK getOAuthToken callback returned null (no token available)',
      { level: 'debug' },
    ])

    assert.equal(await run(async () => 'expired')('expired'), false)
    assert.deepEqual(debug.at(-1), [
      'SDK getOAuthToken callback returned the same expired token; treating as no refresh',
      { level: 'error' },
    ])

    assert.equal(
      await run(async () => {
        throw new Error('host offline')
      })('expired'),
      false,
    )
    assert.deepEqual(debug.at(-1), [
      'SDK getOAuthToken callback failed: host offline',
      { level: 'error' },
    ])
  } finally {
    if (originalToken === undefined) delete process.env.CLAUDE_CODE_OAUTH_TOKEN
    else process.env.CLAUDE_CODE_OAUTH_TOKEN = originalToken
  }
})

test(
  'target116 preserves the SDK refresh callback and user-dialog protocol',
  {
    skip: latestPath
      ? false
      : 'CLAUDE_CODE_2_1_116_PUBLISHED_BUNDLE is not set',
  },
  () => {
    const latest = authenticatedBundle(latestPath, LATEST_SHA256, '2.1.116')
    for (const fragment of [
      'sdkOAuthTokenRefreshCallback',
      'tengu_oauth_401_sdk_callback_refreshed',
      'request_user_dialog',
      'oauth_token_refresh',
      'CLAUDE_CODE_SDK_HAS_OAUTH_REFRESH',
    ]) assert.ok(latest.includes(fragment), fragment)
  },
)
