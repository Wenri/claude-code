import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const BASELINE_SHA256 =
  'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861'
const TARGET_SHA256 =
  '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0'

const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    fileURLToPath(new URL('../../src', import.meta.url)),
)
const historicalSource =
  process.env.CLAUDE_CODE_SEMANTIC_CASE === '2.1.110-to-2.1.111'
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases/2.1.110-to-2.1.111/structural/generated-delta.json.gz',
      ),
    ),
  ),
)

const runtimeOwnerUnits = new Map([
  [
    8_311,
    {
      start: 5_680_968,
      end: 5_681_136,
      sourceHash:
        '871b27620bb5f37933af928195b5dd9ff22a454cf11617049a74db54ca957e09',
      residues: [[5_680_993, 5_680_998, 'words']],
    },
  ],
  [
    8_833,
    {
      start: 5_899_447,
      end: 5_899_635,
      sourceHash:
        '12af04a4d612a309e653ed6723329f7b8de03d12edccf4522c0f6b6d83eab766',
      residues: [
        [5_899_569, 5_899_580, 'body_length'],
        [5_899_605, 5_899_619, 'body_truncated'],
      ],
    },
  ],
  [
    8_836,
    {
      start: 5_899_940,
      end: 5_900_045,
      sourceHash:
        'a92f41e1004a42b8393c464c19491cebbce825cedd5171741aeafec3af482a9d',
      residues: [[5_899_992, 5_900_010, '"api_request_body"']],
    },
  ],
  [
    8_837,
    {
      start: 5_900_045,
      end: 5_900_278,
      sourceHash:
        '47c2c12a4f35291cbba65d9797cc7e23f8825afa0307a5a0c59fc78d7a71eec4',
      residues: [
        [5_900_181, 5_900_200, '"api_response_body"'],
        [5_900_218, 5_900_230, 'query_source'],
      ],
    },
  ],
])

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
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

function sha256(contents) {
  return crypto.createHash('sha256').update(contents).digest('hex')
}

function assertRuntimeOwnerUnit(target, index) {
  const expected = runtimeOwnerUnits.get(index)
  assert.ok(expected)
  const region = structural.regions[index]
  assert.deepEqual(
    [
      region.classification,
      region.target.index,
      region.target.nodeType,
      region.target.start,
      region.target.end,
      region.target.sourceHash,
    ],
    [
      'unresolved',
      index,
      'FunctionDeclaration',
      expected.start,
      expected.end,
      expected.sourceHash,
    ],
  )
  const unit = target.slice(expected.start, expected.end)
  assert.equal(sha256(unit), expected.sourceHash)
  for (const [start, end, raw] of expected.residues) {
    assert.ok(start >= expected.start && end <= expected.end)
    assert.equal(target.slice(start, end), raw)
  }
  return unit
}

function declaredFunction(unit, dependencies = {}) {
  const name = unit.match(/^function ([\w$]+)/)?.[1]
  assert.ok(name)
  return Function(
    ...Object.keys(dependencies),
    `${unit}; return ${name}`,
  )(...Object.values(dependencies))
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

test('authenticated runtime-owner fragments execute slug and API-body behavior', () => {
  const baseline = bundle('CLAUDE_CODE_2_1_110_BUNDLE', BASELINE_SHA256)
  const target = bundle('CLAUDE_CODE_2_1_111_BUNDLE', TARGET_SHA256)

  const slugifyPrompt = declaredFunction(assertRuntimeOwnerUnit(target, 8_311))
  assert.equal(
    slugifyPrompt('Hello, Bright New World! trailing'),
    'hello-bright-new-world',
  )
  assert.equal(slugifyPrompt('One Two Three', { words: 2, maxLen: 5 }), 'one-t')
  assert.doesNotMatch(
    baseline,
    /function [\w$]+\([^)]*,[^)]*=\{\}\)\{let\{words:[\w$]+=4,maxLen:/,
  )

  const bodyEvents = []
  const logBody = declaredFunction(assertRuntimeOwnerUnit(target, 8_833), {
    I6: JSON.stringify,
    rb4: 12,
    Xz: (eventName, payload) => bodyEvents.push({ eventName, payload }),
  })
  logBody('api_request_body', { payload: 'abcdefghijklmnop' }, { model: 'm' })
  assert.equal(bodyEvents.length, 1)
  assert.equal(bodyEvents[0].eventName, 'api_request_body')
  assert.equal(bodyEvents[0].payload.body_length, '30')
  assert.equal(bodyEvents[0].payload.body_truncated, 'true')
  assert.equal(bodyEvents[0].payload.model, 'm')

  const requestEvents = []
  const logRequest = declaredFunction(assertRuntimeOwnerUnit(target, 8_836), {
    ob4: () => true,
    f0z: value => ({ redacted: value }),
    ab4: (...args) => requestEvents.push(args),
  })
  logRequest({ model: 'claude' }, 'repl_main_thread')
  assert.deepEqual(requestEvents, [
    [
      'api_request_body',
      { redacted: { model: 'claude' } },
      { model: 'claude', query_source: 'repl_main_thread' },
    ],
  ])

  const responseEvents = []
  const logResponse = declaredFunction(assertRuntimeOwnerUnit(target, 8_837), {
    ob4: () => true,
    sb4: value => value,
    ab4: (...args) => responseEvents.push(args),
  })
  logResponse(
    [{ message: { content: [{ type: 'text', text: 'ok' }] } }],
    { model: 'claude', querySource: 'sdk', requestId: 'request-1' },
  )
  assert.deepEqual(responseEvents, [
    [
      'api_response_body',
      { content: [{ type: 'text', text: 'ok' }] },
      { model: 'claude', query_source: 'sdk', request_id: 'request-1' },
    ],
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

  includesAll(
    source('src/hooks/fileSuggestions.ts'),
    historicalSource
      ? [
          'if (!fileIndex) return',
          'await mergeUntrackedIntoNormalizedCache(normalizedUntracked)',
          'if (indexMtime === null && lastRefreshMs > 0) return',
        ]
      : [
          'if (!state.fileIndex) return',
          'await mergeUntrackedIntoNormalizedCache(',
          'if (indexMtime === null && state.lastRefreshMs > 0) return',
        ],
  )

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
