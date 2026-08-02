import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const BASELINE_SHA256 =
  'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861'
const TARGET_SHA256 =
  '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0'

function source(relative) {
  return fs.readFileSync(
    fileURLToPath(new URL(`../../${relative}`, import.meta.url)),
    'utf8',
  )
}

function bundle(environmentName, expectedSha256) {
  const filename = process.env[environmentName]
  assert.ok(filename, `${environmentName} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    expectedSha256,
  )
  return bytes.toString('utf8')
}

function includesAll(contents, fragments) {
  for (const fragment of fragments) {
    assert.equal(contents.includes(fragment), true, fragment)
  }
}

test('derives plan filenames from the prompt without generating during checks', () => {
  includesAll(source('src/utils/words.ts'), [
    'export function slugifyPrompt',
    'export function generateShortWordSlug',
  ])
  includesAll(source('src/utils/plans.ts'), [
    'prompt?: string',
    'const promptPrefix = prompt ? slugifyPrompt(prompt)',
    '`${promptPrefix}-${generateShortWordSlug()}`',
    'export function getCachedPlanSlug',
  ])
  includesAll(source('src/utils/attachments.ts'), [
    'options?.planSlugSeed ?? input ?? undefined',
  ])
  includesAll(source('src/utils/permissions/filesystem.ts'), [
    'const planSlug = getCachedPlanSlug()',
    'if (!planSlug) return false',
  ])
})

test('emits raw API-body telemetry while redacting thinking', () => {
  includesAll(source('src/utils/telemetry/apiBodyLogging.ts'), [
    'const MAX_RAW_BODY_LENGTH = 60 * 1024',
    'OTEL_LOG_RAW_API_BODIES',
    "eventName: 'api_request_body' | 'api_response_body'",
    "thinking: '<REDACTED>'",
    "data: '<REDACTED>'",
    '[TRUNCATED - Content exceeds 60KB limit]',
  ])
  includesAll(source('src/services/api/claude.ts'), [
    'logRawAPIRequestBody(params, options.querySource)',
  ])
  includesAll(source('src/services/api/logging.ts'), [
    'logRawAPIResponseBody(newMessages',
  ])
  includesAll(source('src/utils/managedEnvConstants.ts'), [
    "'OTEL_LOG_RAW_API_BODIES'",
  ])
})

test('restores fallback retries and fixes file and LSP refresh state', () => {
  const claude = source('src/services/api/claude.ts')
  assert.equal(claude.includes('NONSTREAMING_FALLBACK_MAX_RETRIES'), false)
  assert.equal(claude.includes('getDefaultMaxRetries'), false)
  includesAll(claude, [
    'const fallbackTimeoutMs = getNonstreamingFallbackTimeoutMs()',
    'timeout: fallbackTimeoutMs',
  ])

  includesAll(source('src/hooks/fileSuggestions.ts'), [
    'if (!fileIndex) return',
    'await mergeUntrackedIntoNormalizedCache(normalizedUntracked)',
    'if (indexMtime === null && lastRefreshMs > 0) return',
  ])

  includesAll(source('src/services/lsp/LSPDiagnosticRegistry.ts'), [
    'export function purgePendingDiagnosticsForFile',
    'diagnostic.files.filter(file => file.uri !== fileUri)',
    'pendingDiagnostics.delete(id)',
  ])
  for (const file of [
    'src/tools/FileEditTool/FileEditTool.ts',
    'src/tools/FileWriteTool/FileWriteTool.ts',
  ]) {
    includesAll(source(file), ['purgePendingDiagnosticsForFile(fileUri)'])
  }
})

test('recovers rate-limit details from a representative rejected claim', () => {
  includesAll(source('src/services/claudeAiLimits.ts'), [
    'export function getRateLimitInfoFromError(',
    "'anthropic-ratelimit-unified-representative-claim'",
    "'anthropic-ratelimit-unified-overage-status'",
    "status: 'rejected'",
    'if (resetsAt) limits.resetsAt = Number(resetsAt)',
    'if (rateLimitType) limits.rateLimitType = rateLimitType',
    'if (overageStatus) limits.overageStatus = overageStatus',
    'if (overageResetsAt) limits.overageResetsAt = Number(overageResetsAt)',
    'limits.overageDisabledReason = overageDisabledReason',
  ])
})

test('suppresses transient API details while preserving retry status', () => {
  includesAll(source('src/components/messages/SystemAPIErrorMessage.tsx'), [
    'extractConnectionErrorDetails',
    'getRateLimitInfoFromError',
    'retryAttempt < maxRetries',
    '!isNetworkConnectionError(error)',
    '!extractConnectionErrorDetails(error)?.isSSLError',
    '!rateLimitInfo',
    'if (suppressTransientError)',
    '<MessageResponse>{retryStatus}</MessageResponse>',
    'if (rateLimitInfo)',
    'getRateLimitDisplayName(rateLimitInfo.rateLimitType)',
  ])
})

test('reports plugin dependency failures in stream-json init', () => {
  includesAll(source('src/entrypoints/sdk/coreSchemas.ts'), [
    'plugin_errors: z',
    'plugin: z.string()',
    'type: z.string()',
    'message: z.string()',
  ])
  includesAll(source('src/utils/messages/systemInit.ts'), [
    'pluginErrors: ReadonlyArray',
    'inputs.pluginErrors.length > 0',
    'plugin_errors: inputs.pluginErrors.map',
  ])
  includesAll(source('src/QueryEngine.ts'), [
    'errors: pluginErrors',
    'pluginErrors.filter(isPluginDependencyError)',
    'getPluginErrorMessage(error)',
  ])
})

test('diagnoses plugin constraints and repairs interrupted install state', () => {
  includesAll(source('src/utils/plugins/dependencyResolver.ts'), [
    "reason: 'disjoint' | 'too-complex' | 'invalid'",
    "return { ok: false, reason: 'invalid' }",
    "return { ok: false, reason: 'disjoint' }",
    'has version requirements too complex to intersect',
    'has an invalid version requirement among',
    'no version satisfies all of',
  ])
  includesAll(source('src/utils/plugins/pluginInstallationHelpers.ts'), [
    'getInMemoryInstalledPlugins().plugins',
    'installation.scope === scope',
    'installation.projectPath === projectPath',
    'why: intersection.reason',
    'formatConstraintIntersectionError(',
  ])
  includesAll(source('src/utils/plugins/installedPluginsManager.ts'), [
    'delete entry.resolvedVersion',
  ])
  includesAll(source('src/services/plugins/pluginOperations.ts'), [
    'formatConstraintIntersectionError(',
    'formatNoMatchingTagError(',
  ])
})

test('suggests CLI subcommands and does not invent a commit skill', () => {
  includesAll(source('src/main.tsx'), [
    'async function suggestUnknownSubcommand',
    'findClosestCommand(normalizedInput',
    'Did you mean ',
    'await suggestUnknownSubcommand(prompt, program)',
  ])
  const skillPrompt = source('src/tools/SkillTool/prompt.ts')
  includesAll(skillPrompt, [
    'Only invoke a skill that appears in that list',
    'Never guess or invent a skill name from training data',
  ])
  assert.equal(skillPrompt.includes('skill: "commit"'), false)

  includesAll(source('src/services/api/errors.ts'), [
    'isFirstPartyCompatibleAPIProvider()',
    "'this may be a temporary capacity issue'",
  ])
})

test('authenticated adjacent bundles contain the runtime replacement', () => {
  const baseline = bundle('CLAUDE_CODE_2_1_110_BUNDLE', BASELINE_SHA256)
  const target = bundle('CLAUDE_CODE_2_1_111_BUNDLE', TARGET_SHA256)
  for (const fragment of [
    'OTEL_LOG_RAW_API_BODIES',
    'plugin_errors',
    'external-build-2172',
    'has conflicting version requirements (no version satisfies all of:',
    'has version requirements too complex to intersect — simplify the ranges:',
    'has an invalid version requirement among:',
  ]) {
    assert.equal(baseline.includes(fragment), false, fragment)
    assert.equal(target.includes(fragment), true, fragment)
  }
})
