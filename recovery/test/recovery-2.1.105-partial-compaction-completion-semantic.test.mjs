import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath || !latestPath
      ? 'authenticated 2.1.104, 2.1.105, and 2.1.116 bundles are required'
      : false,
}

const targetUnit = {
  index: 12794,
  start: 9768673,
  end: 9772875,
  nodeType: 'FunctionDeclaration',
  sourceHash:
    'c58f177acadd09680f43ce77d3527d65a230ac1a2d1122bed022ab02d60204e0',
}
const adjacentUnit = {
  index: 12795,
  start: 9772875,
  end: 9773226,
  nodeType: 'FunctionDeclaration',
  sourceHash:
    'c8876b31bf933e6691ebe6cc67b8d153b00ef5f9dc11a5a61263c3b6947d9548',
}
const typedRow = {
  index: 317,
  start: 9772543,
  end: 9772570,
  value: '"partial compaction failed"',
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

async function loadTypeScript() {
  const candidates = [
    path.resolve(
      path.dirname(process.execPath),
      '../lib/node_modules/typescript/lib/typescript.js',
    ),
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate, 'the pinned TypeScript compiler must be available')
  const module = await import(pathToFileURL(candidate).href)
  return module.default ?? module
}

async function extractPartialCompact() {
  const ts = await loadTypeScript()
  const owner = source('services/compact/compact.ts')
  const parsed = ts.createSourceFile(
    'compact.ts',
    owner,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const declaration = parsed.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'partialCompactConversation',
  )
  assert.ok(declaration, 'partialCompactConversation declaration')
  const snippet = declaration.getText(parsed).replace(/^export\s+/, '')
  return ts.transpileModule(
    `${snippet}\nmodule.exports = { partialCompactConversation }`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
}

async function createHarness({ preHookError } = {}) {
  const telemetry = []
  const sdkStatuses = []
  const notifications = []
  let tokenCall = 0
  const stubs = {
    isCompactBoundaryMessage: () => false,
    tokenCountWithEstimation: () => (++tokenCall === 1 ? 100 : 40),
    executePreCompactHooks: async () => {
      if (preHookError !== undefined) throw preHookError
      return {}
    },
    throwIfPreCompactBlocked: () => {},
    getPartialCompactPrompt: () => 'compact prompt',
    createUserMessage: options => ({
      type: 'user',
      uuid: 'summary-message',
      message: { role: 'user', content: options.content },
      ...options,
    }),
    streamCompactSummary: async () => ({
      type: 'assistant',
      uuid: 'assistant-summary',
      message: { content: [{ type: 'text', text: 'summary' }] },
    }),
    getAssistantMessageText: () => 'summary',
    PROMPT_TOO_LONG_ERROR_MESSAGE: 'Prompt is too long',
    MAX_PTL_RETRIES: 1,
    truncateHeadForPTLRetry: () => null,
    ERROR_MESSAGE_PROMPT_TOO_LONG: 'prompt too long',
    logEvent: () => {},
    startsWithApiErrorPrefix: () => false,
    cacheToObject: () => ({}),
    clearMemorySelectorState: () => {},
    POST_COMPACT_MAX_FILES_TO_RESTORE: 5,
    createPostCompactFileAttachments: async () => [],
    createAsyncAgentAttachmentsIfNeeded: async () => [],
    createPlanAttachmentIfNeeded: () => null,
    createPlanModeAttachmentIfNeeded: async () => null,
    createSkillAttachmentIfNeeded: () => null,
    getDeferredToolsDeltaAttachment: () => [],
    getAgentListingDeltaAttachment: () => [],
    getMcpInstructionsDeltaAttachment: () => [],
    createAttachmentMessage: value => value,
    processSessionStartHooks: async () => [],
    tokenCountFromLastAPIResponse: () => 3,
    getTokenUsage: () => ({ input_tokens: 1, output_tokens: 2 }),
    extractDiscoveredToolNames: () => new Set(),
    createCompactBoundaryMessage: () => ({
      type: 'system',
      subtype: 'compact_boundary',
      uuid: 'boundary',
      compactMetadata: {},
    }),
    getTranscriptPath: () => '/tmp/transcript.jsonl',
    getCompactUserSummaryMessage: () => 'summary message',
    feature: () => false,
    notifyCompaction: () => {},
    markPostCompaction: () => {},
    reAppendSessionMetadata: () => {},
    sessionTranscriptModule: null,
    executePostCompactHooks: async () => ({ userDisplayMessage: undefined }),
    annotateBoundaryWithPreservedSegment: boundary => boundary,
    addErrorNotificationIfNeeded: error => notifications.push(error),
    logCompactionEvent: event => telemetry.push(event),
  }
  const javascript = await extractPartialCompact()
  const module = { exports: {} }
  const names = Object.keys(stubs)
  new Function('module', 'exports', ...names, javascript)(
    module,
    module.exports,
    ...names.map(name => stubs[name]),
  )
  const context = {
    abortController: new AbortController(),
    agentId: undefined,
    getAppState: () => ({ replContexts: {} }),
    readFileState: new Map(),
    loadedNestedMemoryPaths: { clear() {} },
    memorySelector: {},
    options: {
      tools: [],
      mcpClients: [],
      mainLoopModel: 'claude-test',
      querySource: 'compact',
    },
    onCompactProgress() {},
    setStreamMode() {},
    resetResponseLength() {},
    setResponseLength() {},
    setSDKStatus(status, details) {
      sdkStatuses.push({ status, details })
    },
  }
  return {
    partialCompactConversation: module.exports.partialCompactConversation,
    context,
    notifications,
    sdkStatuses,
    telemetry,
  }
}

test(
  'authenticated target105 adds partial-compaction completion telemetry and SDK result status',
  bundleOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(baselineBytes),
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
    )
    assert.equal(
      sha256(targetBytes),
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    )
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const latest = latestBytes.toString('utf8')

    for (const unit of [targetUnit, adjacentUnit]) {
      const region = structural.regions[unit.index]
      assert.equal(region.classification, 'unresolved')
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        [unit.start, unit.end, unit.nodeType, unit.sourceHash],
      )
      assert.equal(sha256(target.slice(unit.start, unit.end)), unit.sourceHash)
    }
    assert.equal(
      target.slice(typedRow.start, typedRow.end),
      typedRow.value,
      `typed-audit row ${typedRow.index}`,
    )
    assert.doesNotMatch(baseline, /partial compaction failed/)
    const targetOwner = target.slice(targetUnit.start, targetUnit.end)
    assert.match(targetOwner, /compactMetadata\.postTokens=/)
    assert.match(targetOwner, /compactResult:/)
    assert.match(targetOwner, /trigger:"manual",success:/)
    assert.match(latest, /partial compaction failed/)
  },
)

test(
  'source reports successful partial compaction with exact pre/post tokens',
  sourceOptions,
  async () => {
    const harness = await createHarness()
    const messages = [
      { type: 'user', uuid: 'user-1', message: { content: 'hi' } },
    ]
    const result = await harness.partialCompactConversation(
      messages,
      0,
      harness.context,
      {},
    )
    assert.equal(result.boundaryMarker.compactMetadata.postTokens, 40)
    assert.deepEqual(harness.telemetry, [
      {
        trigger: 'manual',
        success: true,
        durationMs: harness.telemetry[0].durationMs,
        preTokens: 100,
        postTokens: 40,
        error: undefined,
      },
    ])
    assert.ok(harness.telemetry[0].durationMs >= 0)
    assert.deepEqual(harness.sdkStatuses.at(-1), {
      status: null,
      details: { compactResult: 'success' },
    })
  },
)

test(
  'source reports the exact fallback for a non-Error partial-compaction failure',
  sourceOptions,
  async () => {
    const harness = await createHarness({ preHookError: 'opaque failure' })
    const messages = [
      { type: 'user', uuid: 'user-1', message: { content: 'hi' } },
    ]
    await assert.rejects(
      harness.partialCompactConversation(messages, 0, harness.context, {}),
      error => error === 'opaque failure',
    )
    assert.equal(harness.notifications.length, 1)
    assert.equal(harness.telemetry[0].success, false)
    assert.equal(harness.telemetry[0].preTokens, 100)
    assert.equal(harness.telemetry[0].postTokens, undefined)
    assert.equal(harness.telemetry[0].error, 'partial compaction failed')
    assert.deepEqual(harness.sdkStatuses.at(-1), {
      status: null,
      details: {
        compactResult: 'failed',
        compactError: 'partial compaction failed',
      },
    })
  },
)

test(
  'source keeps the lifecycle in finally after compact-end signaling',
  sourceOptions,
  () => {
    const owner = source('services/compact/compact.ts')
    const functionStart = owner.indexOf(
      'export async function partialCompactConversation',
    )
    const lifecycle = owner.slice(
      functionStart,
      owner.indexOf('\nfunction ', functionStart),
    )
    assert.match(lifecycle, /let compactError: string \| undefined/)
    assert.match(
      lifecycle,
      /boundaryMarker\.compactMetadata\.postTokens = postTokens/,
    )
    assert.ok(
      lifecycle.indexOf("onCompactProgress?.({ type: 'compact_end' })") <
        lifecycle.indexOf('logCompactionEvent({'),
    )
    assert.ok(
      lifecycle.indexOf('logCompactionEvent({') <
        lifecycle.indexOf('setSDKStatus?.(null, {'),
    )
  },
)
