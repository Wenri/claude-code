import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const inventoryPath = path.join(
  repo,
  'recovery/2.1.121-hidden-semantic-inventory.json',
)

const BASELINE_BYTES = 13_784_743
const BASELINE_SHA256 =
  'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f'
const TARGET_BYTES = 13_908_188
const TARGET_SHA256 =
  '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function readSource(sourcePath) {
  return fs.readFileSync(path.join(repo, sourcePath), 'utf8')
}

function compact(value) {
  return value.replaceAll(/\s+/g, ' ').trim()
}

function occurrences(contents, fragment) {
  let count = 0
  let offset = 0
  while ((offset = contents.indexOf(fragment, offset)) !== -1) {
    count++
    offset += fragment.length
  }
  return count
}

function assertSourceFragments(sourcePath, fragments) {
  const contents = compact(readSource(sourcePath))
  for (const fragment of fragments) {
    assert.equal(
      contents.includes(compact(fragment)),
      true,
      `${sourcePath}: ${fragment}`,
    )
  }
}

function assertSourceOmits(sourcePaths, fragments) {
  const contents = sourcePaths.map(readSource).join('\n')
  for (const fragment of fragments) {
    assert.equal(
      contents.includes(fragment),
      false,
      `${sourcePaths.join(', ')} must omit ${fragment}`,
    )
  }
}

function loadBundle(environmentName, expectedBytes, expectedSha256) {
  const filename = process.env[environmentName]
  assert.ok(filename, `${environmentName} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, expectedBytes, `${environmentName}: byte length`)
  assert.equal(sha256(bytes), expectedSha256, `${environmentName}: SHA-256`)
  return bytes.toString('utf8')
}

test('H01-H13 inventory is finite, row-scoped, and ownership-complete', () => {
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'))
  assert.equal(inventory.case, '2.1.120-to-2.1.121')
  assert.deepEqual(
    inventory.obligations.map(row => row.id),
    Array.from({ length: 13 }, (_, index) =>
      `H${String(index + 1).padStart(2, '0')}`,
    ),
  )
  assert.equal(new Set(inventory.obligations.map(row => row.id)).size, 13)

  const owned = inventory.obligations.filter(row =>
    inventory.auditClosure.ownedRows.includes(row.id),
  )
  assert.equal(owned.length, 8)
  assert.equal(
    owned.every(
      row =>
        row.owner === '/root/hidden_residual_21121' &&
        row.status === 'implemented_verified' &&
        row.paths.length > 0 &&
        row.targetWitnesses.length > 0,
    ),
    true,
  )

  const external = inventory.obligations.filter(row =>
    inventory.auditClosure.externalRows.includes(row.id),
  )
  assert.equal(external.length, 5)
  assert.equal(
    external.every(row => row.status === 'external_owner_frozen'),
    true,
  )
  assert.equal(
    external.every(row => row.owner || row.owners),
    true,
  )
  assert.deepEqual(
    inventory.obligations.find(row => row.id === 'H13').owners[
      '/root/official_recover_21121'
    ],
    [1, 2, 4, 11, 13, 17, 28, 30],
  )

  const ownedPaths = [
    ...new Set(owned.flatMap(row => row.paths)),
  ].sort()
  assert.deepEqual(ownedPaths, [
    'src/commands/compact/compact.ts',
    'src/commands/extra-usage/ExtraUsageDialog.tsx',
    'src/commands/extra-usage/extra-usage-core.ts',
    'src/commands/extra-usage/extra-usage.tsx',
    'src/components/LogoV2/AnimatedClawd.tsx',
    'src/services/PromptSuggestion/speculation.ts',
    'src/services/api/claude.ts',
    'src/services/api/extraUsage.ts',
    'src/services/api/promptCacheBreakDetection.ts',
    'src/services/compact/autoCompact.ts',
    'src/services/compact/compact.ts',
    'src/services/compact/microCompact.ts',
    'src/services/teamMemorySync/secretScanner.ts',
    'src/tools/AgentTool/runAgent.ts',
    'src/utils/debug.ts',
    'src/utils/worktree.ts',
  ])
  assert.equal(inventory.auditClosure.changedLiteralRows, 1453)
  assert.equal(inventory.auditClosure.unassignedActiveRows, 0)
  assert.deepEqual(
    inventory.excluded.map(row => row.category),
    ['dependency-owned', 'generated', 'platform-DCE', 'minifier-only'],
  )
  assert.equal(inventory.retainedNoDelta.length, 1)
})

test('H01-H13 witnesses use the authenticated adjacent bundles', () => {
  const baseline = loadBundle(
    'CLAUDE_CODE_2_1_120_BUNDLE',
    BASELINE_BYTES,
    BASELINE_SHA256,
  )
  const target = loadBundle(
    'CLAUDE_CODE_2_1_121_BUNDLE',
    TARGET_BYTES,
    TARGET_SHA256,
  )

  const witnesses = [
    ['extra-usage setup endpoint', '/setup_overage_billing', 0, 1],
    [
      'extra-usage dialog telemetry',
      'tengu_extra_usage_inline_dialog_shown',
      0,
      1,
    ],
    ['extra-usage rollout', 'tengu_ember_latch', 0, 1],
    ['safe admin-request error helper', 'function _P1', 0, 1],
    ['named Clawd completion sequence', 'celebrate', 1, 3],
    [
      'prompt-cache response diagnosis',
      'tengu_prompt_cache_diagnosis_received',
      0,
      1,
    ],
    ['inherited persisted prompt state', 'cache-break-state-', 1, 1],
    ['inherited message mutation state', 'messagesHistoryChanged', 4, 4],
    ['inherited request diagnosis field', 'previous_message_id', 1, 1],
    ['inherited TTL classification', 'TTL flip expected', 1, 1],
    [
      'worktree include symlink refusal',
      'Skipping symlink in .worktreeinclude: ',
      0,
      1,
    ],
    [
      'local settings symlink refusal',
      'Skipping symlinked settings.local.json: ',
      0,
      1,
    ],
    ['loose Anthropic key redaction', 'loose-sk-ant', 0, 1],
    ['loose bearer redaction', 'loose-bearer', 0, 1],
    ['loose environment redaction', 'loose-env-assign', 0, 1],
    ['loose JWT redaction', 'loose-jwt', 0, 1],
    ['debug rotation suffix', '.1.txt', 0, 1],
    [
      'speculation source symlink refusal',
      '[Speculation] Skipping symlink source ',
      0,
      1,
    ],
    [
      'speculation parent containment',
      'parent dir escapes cwd via symlink',
      0,
      1,
    ],
    [
      'speculation destination unlink failure',
      '[Speculation] Failed to unlink symlink at ',
      0,
      1,
    ],
    ['root-owned renderer cluster', '[reportRenderError] React boundary caught ', 0, 1],
    ['root-owned usage cluster', 'Skills, subagents, and plugins', 0, 1],
    ['root-owned SDK URL cluster', 'tengu_sdk_url_host_rejected', 0, 1],
    ['daemon-owned spare cluster', 'tengu_bg_spare_claim', 0, 4],
  ]

  for (const [name, fragment, baselineCount, targetCount] of witnesses) {
    assert.equal(
      occurrences(baseline, fragment),
      baselineCount,
      `${name}: baseline count`,
    )
    assert.equal(
      occurrences(target, fragment),
      targetCount,
      `${name}: target count`,
    )
  }
})

test('H01-H02 recover the complete production extra-usage flow and safe admin errors', () => {
  assertSourceFragments('src/services/api/extraUsage.ts', [
    "DEFAULT_MONTHLY_SPEND_LIMIT_CENTS = 2_000",
    '/setup_overage_billing',
    '/overage_spend_limit',
    '/contracts/auto_reload_settings',
    '/prepaid/credits',
    '/prepaid/bundles',
    '/payment_method',
    '/contracts/prepaid/credits',
    '/billing/tax_rate',
    '/prepaid/commits/${purchaseId}',
    "error_visibility !== 'user_facing'",
    'expected_price_minor_units: purchase.bundle.price_minor_units',
  ])
  assertSourceFragments('src/commands/extra-usage/extra-usage.tsx', [
    "subscriptionType === 'pro' || subscriptionType === 'max'",
    'isOverageProvisioningAllowed()',
    '!isEssentialTrafficOnly()',
    "getFeatureValue_CACHED_MAY_BE_STALE('tengu_ember_latch', false)",
    'prepareExtraUsageVisit()',
    '<ExtraUsageDialog onDone={onDone} />',
  ])
  assertSourceFragments('src/commands/extra-usage/ExtraUsageDialog.tsx', [
    "tengu_extra_usage_inline_dialog_shown",
    "tengu_extra_usage_inline_dialog_enable_result",
    "tengu_extra_usage_inline_dialog_buy_result",
    "tengu_extra_usage_inline_dialog_auto_reload",
    "s: 'buy_polling'",
    "s: 'auto_reload_config'",
    'fetchExtraUsageTaxPreview(cents, currency, stripeProductId)',
    "result.status === 'action_needed'",
    'Purchase timed out — check claude.ai/settings/usage',
    '<AnimatedClawd autoplay />',
    'sequence="celebrate"',
  ])
  assertSourceFragments('src/components/LogoV2/AnimatedClawd.tsx', [
    'const AUTOPLAY',
    'const CELEBRATE',
    'celebrate: CELEBRATE',
    'autoplay?: boolean',
    'onComplete?: () => void',
    'setFrameIndex(autoplay && !sequence ? 0 : -1)',
  ])
  assertSourceFragments('src/commands/extra-usage/extra-usage-core.ts', [
    'function extractAdminRequestError',
    "typeof status !== 'number' || status >= 500",
    "for (const key of ['message', 'detail'])",
    "if (message) return { type: 'message', value: message }",
  ])
})

test('H03-H04 recover target diagnosis plus the inherited active prompt tracker', () => {
  assertSourceFragments('src/services/api/claude.ts', [
    'shouldTrackPromptCacheBreaks()',
    'is1hCacheTTL: cacheTtl === \'1h\'',
    'messagesForAPI',
    'diagnostics: { previous_message_id: previousMessageId ?? null }',
    'let cacheMissReason: CacheMissReason | undefined',
    'diagnostics?: { cache_miss_reason?: CacheMissReason }',
    'logPromptCacheDiagnosis(cacheMissReason',
  ])
  assertSourceFragments('src/services/api/promptCacheBreakDetection.ts', [
    'export function shouldTrackPromptCacheBreaks',
    "process.env.CLAUDE_CODE_ENTRYPOINT === 'claude-desktop'",
    'function shouldPersistPromptCacheState',
    '`cache-break-state-${getSessionId()}.json`',
    'const persistedStateSchema',
    'persistentStateWrite = persistentStateWrite',
    "BILLING_HEADER_PREFIX = 'x-anthropic-billing-header:'",
    "querySource.startsWith('agent:custom:')",
    'function computeMessageHashes',
    'messagesHistoryChanged',
    'changedBlockLengthDeltas',
    "logEvent('tengu_prompt_cache_diagnosis_received'",
    'previousMessageId',
    'isDesktop',
  ])

  const gateConsumers = [
    'src/commands/compact/compact.ts',
    'src/services/api/claude.ts',
    'src/services/compact/autoCompact.ts',
    'src/services/compact/compact.ts',
    'src/services/compact/microCompact.ts',
    'src/tools/AgentTool/runAgent.ts',
  ]
  for (const sourcePath of gateConsumers) {
    assertSourceFragments(sourcePath, ['shouldTrackPromptCacheBreaks'])
  }
  assertSourceOmits(gateConsumers, ["feature('PROMPT_CACHE_BREAK_DETECTION')"])
})

test('H05 and H08 fail closed for worktree and speculative-overlay symlinks', () => {
  assertSourceFragments('src/utils/worktree.ts', [
    '(await lstat(srcPath)).isSymbolicLink()',
    'Skipping symlink in .worktreeinclude: ${relativePath}',
    '(await lstat(sourceSettingsLocal)).isSymbolicLink()',
    'Skipping symlinked settings.local.json: ${sourceSettingsLocal}',
  ])
  assertSourceFragments('src/services/PromptSuggestion/speculation.ts', [
    'canonicalCwd = await realpath(cwd)',
    '(await lstat(src)).isSymbolicLink()',
    'canonicalParent = await realpath(existingParent)',
    '!canonicalParent.startsWith(canonicalCwd + sep)',
    'await mkdir(dirname(dest), { recursive: true })',
    'destinationStat?.isSymbolicLink()',
    'await unlink(dest)',
    'await copyFile(src, dest)',
  ])
})

test('H06-H07 redact debug secrets, preserve strict scanning, rotate, and recover directory paths', () => {
  assertSourceFragments('src/services/teamMemorySync/secretScanner.ts', [
    'const LOOSE_REDACTION_RULES',
    "id: 'loose-sk-ant'",
    "id: 'loose-bearer'",
    "id: 'loose-env-assign'",
    "id: 'loose-jwt'",
    'compiledRules = SECRET_RULES.map',
    'redactRules ??= [...SECRET_RULES, ...LOOSE_REDACTION_RULES].map',
  ])
  assertSourceFragments('src/utils/debug.ts', [
    'MAX_DEBUG_LOG_BYTES = 10 * 1024 * 1024',
    'async function rotateDebugLogIfNeeded',
    "`${path.slice(0, -4)}.1.txt`",
    'await unlink(rotatedPath).catch',
    "getErrnoCode(error) !== 'EISDIR'",
    'fallbackDebugLogPath = join(path, `${getSessionId()}.txt`)',
    'fallbackDebugLogPath ??',
    'redactSecrets(message.trim())',
  ])
})
