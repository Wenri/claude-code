import test from 'node:test'
import {
  assertAuthenticatedFragments,
  assertSourceFragments,
} from './recovery-2.1.118-test-helpers.mjs'

const FRAGMENTS = [
  [
    'all update paths disabled',
    'DISABLE_UPDATES',
    0,
    5,
    'aca7a42a698fb7e70272f69e201b542d6874dfa4a0c7ffc7a1fc0a1b183ac2f6',
  ],
  [
    'WSL managed settings policy',
    'wslInheritsWindowsSettings',
    0,
    13,
    '2322008ab221aa16c752f05d74419d34415ce5704591a1b892789df4d7a1f549',
  ],
  [
    'auto mode permanent decline',
    'decline-dont-ask',
    0,
    2,
    '95bf090796eb7b7b7267296eecd6545c9c8b838b108e7e48018432133e90b1be',
  ],
  [
    'auto mode decline copy',
    "No, don't ask again",
    0,
    1,
    '20f80c5c41a92962e46229aad81de480ced9506882ed49670e7e95ba6a8a91d6',
  ],
  [
    'MCP token without expiry',
    'No expiration specified',
    0,
    1,
    'dbc244d5b88694dedd1ebdb21c85729cbc1ad4faba190766ca6374114709c8da',
  ],
  [
    'MCP refresh lock fail-closed outcomes',
    'skipping refresh',
    0,
    2,
    'cffb604d0612f83a327b6b3b5cab96140d9c8212ac27816dec2757a67064696e',
  ],
  [
    'MCP cross-process refresh recovery',
    'Another process already refreshed tokens',
    1,
    2,
    '83ad081126fe803ebea5fefa82b6c4a36d079bc99daf51d6c5ca698b43ca6e31',
  ],
  [
    'OAuth revoked-token retry contract',
    'OAuth token has been revoked',
    5,
    5,
    'd6d0feb90f3498fd223ce7b330d9dfc1430e9712f062264ce3c664811a3e4456',
  ],
  [
    'OAuth 403 revoked-token option',
    'also403Revoked',
    2,
    2,
    'a053c06317e576b1b9f006eded47281f27f6cc1b661e70e1cfcee50ee8c0850f',
  ],
  [
    'OAuth refresh race resolution',
    'tengu_oauth_token_refresh_race_resolved',
    1,
    2,
    'f3228919f0a6550c90156f2a6b4b3cd32d20c9e56d672273e6b2679685b0fc0e',
  ],
  [
    'OAuth disk-token recovery',
    'tengu_oauth_401_recovered_from_disk',
    0,
    1,
    '52b90707c5bfaa9d2154370c63613c9a9f1e336b11035fccc327def23c4ae793',
  ],
  [
    'cache diagnosis beta',
    'cache-diagnosis-2026-04-07',
    0,
    1,
    '9a35b7fa4401e61a4b40264ddf33cff2515f4a4a8fe32888d090ba18a8342268',
  ],
  [
    'parent managed settings CLI',
    '--managed-settings',
    0,
    5,
    '1ac05c1bd812a738fee20d6cc56bfcadbf3dc29155da1033cfa65e0f406abd53',
  ],
  [
    'parent policy tier',
    'parent managed settings',
    0,
    2,
    '53470268384001855fc1e786656b9ec505db80a8d8e3fa88def6aa979547776a',
  ],
  [
    'custom plan workflow CLI',
    '--plan-mode-instructions',
    0,
    2,
    'b3a28e4e83bfff142c57e2649757cdae5d09daea513aff58dcf4f1c02f876ca2',
  ],
  [
    'custom plan workflow propagation',
    'planModeInstructions',
    0,
    16,
    '1ac8148f7467ca0ccbe382b9650e9de9c8985ba1e655955f8ca51c3ab98b7493',
  ],
  [
    'gateway Sonnet model override',
    'ANTHROPIC_DEFAULT_SONNET_MODEL_NAME',
    3,
    3,
    '78889f560b53488efaa78215c0697be0d196965acebd61e74fe0646fb1b42263',
  ],
  [
    'MCP headers-helper discriminator',
    'hasHeadersHelper',
    2,
    2,
    '5dafcee9007f187ca5d4ef415e21e3e5f5cdb13e1805a4b507f8f1a11d20aff2',
  ],
  [
    'plan-mode bypass choice',
    'if(H)if(_)f.push({label:`Yes, clear context${z} and bypass permissions`',
    0,
    1,
    '30c7f030872ea8c7fe59dd948e2274e1e538ce72f2cc885d78d8e7769dd479d1',
  ],
  [
    'atomic credential rename fallback',
    'A==="EXDEV"||A==="EPERM"||A==="EEXIST"',
    0,
    1,
    'fdd1fe037a509704d867667891ed00b2dcc62ae30c4b3efdff516c70cf4e07e8',
  ],
  [
    'atomic credential temporary write',
    'writeFileSync(K,$,{encoding:"utf8",mode:q})',
    0,
    1,
    'fb483b790644c58ca0f66e1e68db76d037069bdffd7f3a5464a9110d8cdf49d5',
  ],
  [
    'WIF user OAuth lock',
    'tengu_wif_user_oauth_lock_acquired',
    0,
    1,
    '894cd457b9131605ab67846c1fe6d7dcbbd9569e7a5e09b5f9034784e1f39817',
  ],
]

test('auth and settings fragments are authenticated in both pinned bundles', () => {
  assertAuthenticatedFragments(FRAGMENTS)
})

test('recovers update, WSL, auto-mode, and credential settings behavior', () => {
  assertSourceFragments('src/utils/config.ts', [
    'isEnvTruthy(process.env.DISABLE_UPDATES)',
  ])
  assertSourceFragments('src/cli/update.ts', [
    'isEnvTruthy(process.env.DISABLE_UPDATES)',
  ])
  assertSourceFragments('src/utils/settings/types.ts', [
    'wslInheritsWindowsSettings',
  ])
  assertSourceFragments('src/utils/sandbox/sandbox-adapter.ts', [
    "getPlatform() === 'wsl'",
    "join(WSL_WINDOWS_MANAGED_SETTINGS_PATH, 'managed-settings.json')",
    "join(WSL_WINDOWS_MANAGED_SETTINGS_PATH, 'managed-settings.d')",
  ])
  assertSourceFragments('src/utils/permissions/filesystem.ts', [
    "getPlatform() === 'wsl' && getWslInheritsWindowsSettings()",
    "join(WSL_WINDOWS_MANAGED_SETTINGS_PATH, 'managed-settings.json')",
  ])
  assertSourceFragments('src/cli/handlers/autoMode.ts', [
    'AUTO_MODE_DEFAULTS_MARKER',
  ])
  assertSourceFragments('src/utils/permissions/yoloClassifier.ts', [
    "AUTO_MODE_DEFAULTS_MARKER = '$defaults'",
    'expandAutoModeRules',
  ])
  assertSourceFragments('src/components/AutoModeOptInDialog.tsx', [
    'decline-dont-ask',
    "No, don't ask again",
  ])
  assertSourceFragments('src/utils/secureStorage/plainTextStorage.ts', [
    'atomicWriteFileSync',
    "randomBytes(4).toString('hex')",
    "writeFileSync(temp, content, { encoding: 'utf8', mode })",
    "code !== 'EXDEV' && code !== 'EPERM' && code !== 'EEXIST'",
    'atomicWriteFileSync(storagePath, jsonStringify(data), 0o600)',
    'chmodSync(storagePath, 0o600)',
  ])
})

test('recovers MCP and main OAuth refresh and login safety', () => {
  assertSourceFragments('src/services/mcp/auth.ts', [
    'tokens.expires_in != null',
    'No expiration specified',
    'this._pendingStepUpScope !== undefined',
    'Failed to acquire refresh lock: ${code}; skipping refresh',
    'Could not acquire refresh lock after',
    'Another process already refreshed tokens',
    '.finally(() => {',
    '.catch(() => {})',
    'clearKeychainCache()',
  ])
  assertSourceFragments('src/components/mcp/MCPRemoteServerMenu.tsx', [
    'hasHeadersHelper',
    "server.client.type !== 'needs-auth' || hasHeadersHelper",
  ])
  assertSourceFragments('src/services/api/withRetry.ts', [
    'isOAuthTokenRevokedError(error)',
  ])
  assertSourceFragments('src/utils/auth.ts', [
    'force = false',
    'failedAccessToken?: string',
    'tengu_oauth_token_refresh_race_resolved',
    'tengu_oauth_401_recovered_from_disk',
  ])
  assertSourceFragments('src/commands/logout/logout.tsx', [
    'preserveInProcessTokens = false',
    'delete process.env.CLAUDE_CODE_OAUTH_TOKEN',
  ])
  assertSourceFragments('src/cli/handlers/auth.ts', [
    'preserveInProcessTokens: true',
    'storageResult.success',
    'setOauthTokenFromFd(storageResult.success ? null : tokens.accessToken)',
  ])
})

test('recovers cache diagnosis, WIF profiles, parent policy, and plan workflow', () => {
  assertSourceFragments('src/services/api/claude.ts', [
    'CACHE_DIAGNOSIS_BETA_HEADER',
    'diagnostics: { previous_message_id: previousMessageId }',
    'retry:cache-diagnosis-beta',
  ])
  assertSourceFragments('src/services/api/workloadIdentity.ts', [
    'tengu_wif_user_oauth_lock_acquired',
    'profile-explicit',
    'profile-implicit',
    'MAX_TOKEN_RESPONSE_BYTES = 1024 * 1024',
    "new TextDecoder('utf-8')",
  ])
  assertSourceFragments('src/utils/http.ts', [
    'getAuthHeadersAsync',
    'return getAuthHeaders()',
  ])
  assertSourceFragments('src/utils/settings/settings.ts', [
    'parent managed settings',
    "return 'parent'",
  ])
  assertSourceFragments('src/main.tsx', [
    '--managed-settings <json>',
    '--plan-mode-instructions <instructions>',
    '--plan-mode-instructions can only be used with --print mode',
  ])
  assertSourceFragments('src/entrypoints/sdk/controlSchemas.ts', [
    'planModeInstructions',
  ])
  assertSourceFragments('src/utils/model/modelOptions.ts', [
    'function shouldShowCustomModelOption()',
    '!isDirectAnthropicAPIProvider() || !isFirstPartyAnthropicBaseUrl()',
  ])
  assertSourceFragments('src/utils/messages.ts', [
    '## Plan Workflow',
    'Follow the plan workflow described earlier.',
  ])
  assertSourceFragments(
    'src/components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.tsx',
    [
      'Yes, clear context${usedLabel} and bypass permissions',
      "value: 'yes-bypass-permissions'",
    ],
  )
})
