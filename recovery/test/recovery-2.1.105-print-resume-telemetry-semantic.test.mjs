import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const middleCase = '2.1.104-to-2.1.105'
const lateCase = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected =
  !semanticCase || semanticCase === middleCase || semanticCase === lateCase
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)

const bundle104 = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const bundle105 = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const bundle114 = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const bundle116 = process.env.CLAUDE_CODE_2_1_116_BUNDLE

const middleStructural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        middleCase,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)
const lateStructural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        lateCase,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

const middleBaseline = {
  index: 18_779,
  start: 13_378_817,
  end: 13_382_040,
  nodeType: 'FunctionDeclaration',
  hash: '801627096d8dafa72e95e576a6427b0eed3bf3af7e5f6a4dcbf9e6b938103bfc',
}
const middleTarget = {
  index: 18_978,
  start: 13_480_443,
  end: 13_484_827,
  nodeType: 'FunctionDeclaration',
  hash: 'c4d50696a1c8ba0f7477d8be555964f9d2da6f08deeb5828e05a2450d2f49e1d',
}
const lateBaseline = {
  index: 20_307,
  start: 12_850_536,
  end: 12_854_987,
  nodeType: 'FunctionDeclaration',
  hash: 'a709c1a44f0d8c27ac012a3237baf2345ec1ee95b83d4b2460c00cfd6033af54',
}
const lateTarget = {
  index: 20_593,
  start: 12_962_435,
  end: 12_966_947,
  nodeType: 'FunctionDeclaration',
  hash: '042568740c042b285307da1f66d3c9a60583dfa61184f79466d31e10e1f4497c',
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

const late114Inner = {
  bytes: 12_986_755,
  sha256: 'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
}
const late114Wrapped = {
  bytes: 12_986_845,
  sha256: '5db5e2191a2ea9d74713e0881fa689ab244a2c1c4a58986840fb7b02cd162c83',
}
const bunWrapperPrefix = Buffer.from(
  '// @bun @bytecode @bun-cjs\n(function(exports, require, module, __filename, __dirname) {',
)
const bunWrapperSuffix = Buffer.from('})\n')

function authenticatedLate114Inner(bytes) {
  const digest = sha256(bytes)
  if (digest === late114Inner.sha256) {
    assert.equal(bytes.length, late114Inner.bytes)
    return bytes
  }

  assert.deepEqual(
    [bytes.length, digest],
    [late114Wrapped.bytes, late114Wrapped.sha256],
  )
  assert.equal(bunWrapperPrefix.length, 87)
  assert.equal(bunWrapperSuffix.length, 3)
  assert.equal(
    bytes.subarray(0, bunWrapperPrefix.length).equals(bunWrapperPrefix),
    true,
  )
  assert.equal(
    bytes.subarray(bytes.length - bunWrapperSuffix.length).equals(bunWrapperSuffix),
    true,
  )
  const inner = bytes.subarray(
    bunWrapperPrefix.length,
    bytes.length - bunWrapperSuffix.length,
  )
  assert.deepEqual(
    [inner.length, sha256(inner)],
    [late114Inner.bytes, late114Inner.sha256],
  )
  return inner
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
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

async function compileResumeBranch(contents) {
  const ts = await loadTypeScript()
  const sourceFile = ts.createSourceFile(
    'print.ts',
    contents,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const declaration = sourceFile.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'loadInitialMessages',
  )
  assert.ok(declaration?.body, 'loadInitialMessages declaration')
  const resumeBranch = declaration.body.statements.find(
    statement =>
      ts.isIfStatement(statement) &&
      statement.expression.getText(sourceFile) === 'options.resume',
  )
  assert.ok(resumeBranch, 'print resume branch')

  const branch = contents.slice(
    resumeBranch.getStart(sourceFile),
    resumeBranch.end,
  )
  const isolated = `
    export async function runPrintResume(setAppState: any, options: any, dependencies: any) {
      const {
        asSessionId,
        coordinatorModeModule,
        dirname,
        emitLoadError,
        externalMetadataToAppState,
        feature,
        getCwd,
        getSessionIdFromLog,
        gracefulShutdownSync,
        hydrateFromCCRv2InternalEvents,
        hydratePostTurnSummary,
        hydrateRemoteSession,
        isEnvTruthy,
        loadConversationForResume,
        logError,
        logEvent,
        parseSessionIdentifier,
        performance,
        persistSession,
        processSessionStartHooks,
        resetSessionFilePointer,
        restoreSessionMetadata,
        restoreSessionStateFromLog,
        saveMode,
        searchSessionsByCustomTitle,
        setMainLoopModelOverride,
        switchSession,
        toError,
      } = dependencies
      ${branch}
      return { messages: [] }
    }
  `
  const javascript = ts.transpileModule(isolated, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const module = { exports: {} }
  new Function('exports', 'module', 'require', javascript)(
    module.exports,
    module,
    () => {
      throw new Error('coordinator loader must remain unreachable')
    },
  )
  return module.exports.runPrintResume
}

function createHarness(overrides = {}) {
  const events = []
  const errors = []
  const shutdowns = []
  const calls = []
  const now = [100, 147.6]
  const result = {
    messages: [{ uuid: 'message-1' }],
    sessionId: 'session-1',
    fullPath: '/tmp/transcript.jsonl',
    mode: 'normal',
    turnInterruptionState: { interrupted: false },
    deferredToolUse: { toolUseId: 'deferred-1' },
    agentSetting: 'agent-1',
  }
  const dependencies = {
    asSessionId: value => value,
    coordinatorModeModule: null,
    dirname: () => '/tmp',
    emitLoadError: message => errors.push(message),
    externalMetadataToAppState: value => value,
    feature: () => false,
    getCwd: () => '/tmp',
    getSessionIdFromLog: match => match.sessionId,
    gracefulShutdownSync: code => shutdowns.push(code),
    hydrateFromCCRv2InternalEvents: async () => {},
    hydratePostTurnSummary: () => {},
    hydrateRemoteSession: async () => {},
    isEnvTruthy: () => false,
    loadConversationForResume: async () => result,
    logError: error => calls.push(['logError', error.name]),
    logEvent: (name, metadata) => events.push([name, metadata]),
    parseSessionIdentifier: value =>
      value === 'session-1'
        ? { sessionId: value, isUrl: false, jsonlFile: null }
        : null,
    performance: { now: () => now.shift() ?? 147.6 },
    persistSession: false,
    processSessionStartHooks: async () => [],
    resetSessionFilePointer: async () => {},
    restoreSessionMetadata: value => calls.push(['metadata', value.sessionId]),
    restoreSessionStateFromLog: value => calls.push(['state', value.sessionId]),
    saveMode: () => {},
    searchSessionsByCustomTitle: async () => [],
    setMainLoopModelOverride: () => {},
    switchSession: value => calls.push(['switch', value]),
    toError: value => (value instanceof Error ? value : new Error(String(value))),
    ...overrides,
  }
  const options = {
    continue: false,
    teleport: null,
    resume: 'session-1',
    resumeSessionAt: undefined,
    forkSession: false,
    outputFormat: 'text',
    restoredWorkerState: Promise.resolve(null),
  }
  return { calls, dependencies, errors, events, options, shutdowns }
}

function resumedEvents(harness) {
  return harness.events.filter(([name]) => name === 'tengu_session_resumed')
}

test(
  'authenticated 104→105 introduces the complete print resume telemetry graph',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !bundle104 || !bundle105
        ? 'authenticated 2.1.104 and 2.1.105 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(bundle104)
    const targetBytes = fs.readFileSync(bundle105)
    assert.equal(baselineBytes.length, 13_567_412)
    assert.equal(targetBytes.length, 13_676_915)
    assert.equal(
      sha256(baselineBytes),
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
    )
    assert.equal(
      sha256(targetBytes),
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    )

    const baselineUnit = middleStructural.unmatchedBaseline.find(
      unit => unit.index === middleBaseline.index,
    )
    assert.deepEqual(
      [
        baselineUnit?.start,
        baselineUnit?.end,
        baselineUnit?.nodeType,
        baselineUnit?.sourceHash,
      ],
      [
        middleBaseline.start,
        middleBaseline.end,
        middleBaseline.nodeType,
        middleBaseline.hash,
      ],
    )
    const targetRegion = middleStructural.regions[middleTarget.index]
    assert.equal(targetRegion.classification, 'unresolved')
    assert.deepEqual(
      [
        targetRegion.target.start,
        targetRegion.target.end,
        targetRegion.target.nodeType,
        targetRegion.target.sourceHash,
      ],
      [
        middleTarget.start,
        middleTarget.end,
        middleTarget.nodeType,
        middleTarget.hash,
      ],
    )

    const baseline = baselineBytes.toString('utf8').slice(
      middleBaseline.start,
      middleBaseline.end,
    )
    const target = targetBytes.toString('utf8').slice(
      middleTarget.start,
      middleTarget.end,
    )
    assert.equal(sha256(baseline), middleBaseline.hash)
    assert.equal(sha256(target), middleTarget.hash)
    assert.equal(occurrences(baseline, 'tengu_session_resumed'), 0)
    assert.equal(occurrences(target, 'tengu_session_resumed'), 6)
    assert.equal(occurrences(target, 'failure_reason:"not_found"'), 3)
    assert.equal(occurrences(target, 'failure_reason:"processing_error"'), 1)
    assert.equal(occurrences(target, 'resume_duration_ms'), 1)
    assert.equal(occurrences(target, 'error_name:'), 1)
  },
)

test(
  'authenticated 114→116 narrows only the three explicit-ID failures',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !bundle114 || !bundle116
        ? 'authenticated 2.1.114 and 2.1.116 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = authenticatedLate114Inner(fs.readFileSync(bundle114))
    const targetBytes = fs.readFileSync(bundle116)
    assert.equal(baselineBytes.length, late114Inner.bytes)
    assert.equal(targetBytes.length, 13_102_272)
    assert.equal(
      sha256(baselineBytes),
      late114Inner.sha256,
    )
    assert.equal(
      sha256(targetBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )

    const baselineUnit = lateStructural.unmatchedBaseline.find(
      unit => unit.index === lateBaseline.index,
    )
    assert.deepEqual(
      [
        baselineUnit?.start,
        baselineUnit?.end,
        baselineUnit?.nodeType,
        baselineUnit?.sourceHash,
      ],
      [
        lateBaseline.start,
        lateBaseline.end,
        lateBaseline.nodeType,
        lateBaseline.hash,
      ],
    )
    const targetRegion = lateStructural.regions[lateTarget.index]
    assert.equal(targetRegion.classification, 'unresolved')
    assert.deepEqual(
      [
        targetRegion.target.start,
        targetRegion.target.end,
        targetRegion.target.nodeType,
        targetRegion.target.sourceHash,
      ],
      [lateTarget.start, lateTarget.end, lateTarget.nodeType, lateTarget.hash],
    )

    const baseline = baselineBytes.toString('utf8').slice(
      lateBaseline.start,
      lateBaseline.end,
    )
    const target = targetBytes.toString('utf8').slice(
      lateTarget.start,
      lateTarget.end,
    )
    assert.equal(sha256(baseline), lateBaseline.hash)
    assert.equal(sha256(target), lateTarget.hash)
    for (const owner of [baseline, target]) {
      assert.equal(occurrences(owner, 'tengu_session_resumed'), 6)
      assert.equal(occurrences(owner, 'failure_reason:"processing_error"'), 1)
      assert.equal(occurrences(owner, 'resume_duration_ms'), 1)
      assert.equal(occurrences(owner, 'error_name:'), 1)
    }
    assert.equal(occurrences(baseline, 'failure_reason:"not_found"'), 3)
    assert.equal(occurrences(baseline, 'not_found_explicit_id'), 0)
    assert.equal(occurrences(target, 'failure_reason:"not_found"'), 0)
    assert.equal(occurrences(target, 'failure_reason:"not_found_explicit_id"'), 3)
  },
)

test(
  'actual source branch reports invalid, missing, processing, success, and catch outcomes',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const owner = source('cli/print.ts')
    const runPrintResume = await compileResumeBranch(owner)
    const explicitReason = owner.includes("failure_reason: 'not_found_explicit_id'")
      ? 'not_found_explicit_id'
      : 'not_found'
    assert.equal(
      occurrences(owner, `failure_reason: '${explicitReason}'`),
      3,
    )
    assert.equal(occurrences(owner, "failure_reason: 'processing_error'"), 1)
    assert.equal(occurrences(owner, 'failure_reason: failureReason'), 1)

    const invalid = createHarness({ parseSessionIdentifier: () => null })
    invalid.options.resume = 'not-a-session'
    await runPrintResume(() => {}, invalid.options, invalid.dependencies)
    assert.deepEqual(resumedEvents(invalid), [
      [
        'tengu_session_resumed',
        { entrypoint: 'print', success: false, failure_reason: explicitReason },
      ],
    ])
    assert.equal(invalid.shutdowns.at(-1), 1)

    const ambiguous = createHarness({
      parseSessionIdentifier: () => null,
      searchSessionsByCustomTitle: async () => [
        { sessionId: 'one', modified: new Date(0) },
        { sessionId: 'two', modified: new Date(1) },
      ],
    })
    ambiguous.options.resume = 'same title'
    await runPrintResume(() => {}, ambiguous.options, ambiguous.dependencies)
    assert.equal(resumedEvents(ambiguous)[0][1].failure_reason, explicitReason)
    assert.match(ambiguous.errors[0], /matches 2 sessions/)

    const missing = createHarness({
      loadConversationForResume: async () => null,
    })
    await runPrintResume(() => {}, missing.options, missing.dependencies)
    assert.equal(resumedEvents(missing)[0][1].failure_reason, explicitReason)
    assert.match(missing.errors[0], /No conversation found with session ID/)

    const missingMessage = createHarness()
    missingMessage.options.resumeSessionAt = 'message-missing'
    await runPrintResume(
      () => {},
      missingMessage.options,
      missingMessage.dependencies,
    )
    assert.equal(
      resumedEvents(missingMessage)[0][1].failure_reason,
      'processing_error',
    )

    const success = createHarness()
    const resumed = await runPrintResume(
      () => {},
      success.options,
      success.dependencies,
    )
    assert.equal(resumed.messages[0].uuid, 'message-1')
    assert.deepEqual(resumedEvents(success), [
      [
        'tengu_session_resumed',
        {
          entrypoint: 'print',
          success: true,
          resume_duration_ms: 48,
        },
      ],
    ])

    const loadFailure = createHarness({
      loadConversationForResume: async () => {
        throw new TypeError('load failed')
      },
    })
    await runPrintResume(
      () => {},
      loadFailure.options,
      loadFailure.dependencies,
    )
    assert.deepEqual(resumedEvents(loadFailure)[0][1], {
      entrypoint: 'print',
      success: false,
      failure_reason: 'load_error',
      error_name: 'TypeError',
    })

    const processingFailure = createHarness({
      restoreSessionStateFromLog: () => {
        throw new RangeError('restore failed')
      },
    })
    await runPrintResume(
      () => {},
      processingFailure.options,
      processingFailure.dependencies,
    )
    assert.deepEqual(resumedEvents(processingFailure)[0][1], {
      entrypoint: 'print',
      success: false,
      failure_reason: 'processing_error',
      error_name: 'RangeError',
    })
  },
)
