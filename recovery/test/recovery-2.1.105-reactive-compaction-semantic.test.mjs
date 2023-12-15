import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'
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

// Every expanded row used to reconstruct the reporter, retry engine, runtime,
// query call path, and manual command is pinned by exact target byte identity.
const units = new Map([
  [7202, ['unresolved', 5132609, 5132880, 'FunctionDeclaration', 'b89780ec846af6d7fcb9202b4ddccb1ca8e931ccbd6163af5ea875a2a9a409c0']],
  [7216, ['unresolved', 5146812, 5148183, 'FunctionDeclaration', 'daf6e9195544060483a11eb8f7bde82e331af71722456c13bf03176763c3dcb1']],
  [7217, ['unresolved', 5148183, 5148318, 'FunctionDeclaration', '9e696bf87828d0bc7a3ec905db1edfd3bd78d720fb10bac22d5fc1b057f15f71']],
  [7218, ['unresolved', 5148318, 5148432, 'FunctionDeclaration', '76f65a2e63c5366be209f4804dd798e2dba01655c7510700c608c7c052dc3238']],
  [7219, ['unresolved', 5148432, 5150198, 'FunctionDeclaration', '247dbd39ea62819edf29048508b022b643ce7678ef1e97cc2295c0195943b68b']],
  [7220, ['unresolved', 5150198, 5150286, 'VariableDeclaration', '5ba299f6711e0d11505460bb036303a81267e708c4df504169946cec093e0057']],
  [12622, ['unresolved', 9641323, 9641391, 'FunctionDeclaration', '7d52ea99d394c5012e0ec7b595ae63ff49cbceeb34efa24830a2a92a09c1b63a']],
  [12623, ['unresolved', 9641391, 9641444, 'FunctionDeclaration', 'e85d3d823762a7a9b41eee1ee36f0b721922bfbc69f31e04e7285607eb5cd831']],
  [12624, ['unresolved', 9641444, 9641497, 'FunctionDeclaration', 'dc4f7123f078b9683d8897b62a37f484312468f0e1093ae90aa98116bd52ede9']],
  [12625, ['unresolved', 9641497, 9643018, 'FunctionDeclaration', '3dee8f136057420d9f72dfb7c0b7c40a829a166c88e376a472bdff60ff57fc2a']],
  [12626, ['unresolved', 9643018, 9645033, 'FunctionDeclaration', '814b77a8791be5a42e65bce0f043e2c3fb68b2c8d0d12b1ac2dffd2ec9ddad2a']],
  [12627, ['unresolved', 9645033, 9645232, 'FunctionDeclaration', '15db1af179208bc572d6e9f5c77e407da2a1323296a9c04ff4342ab66d23724c']],
  [12628, ['unresolved', 9645232, 9645744, 'FunctionDeclaration', 'c5fb6e930e003d0d9be09cc83c22e749921898dc5bb91452e1d2af92846318e9']],
  [12629, ['unresolved', 9645744, 9645904, 'VariableDeclaration', '79f893f13647b678e099b0aef7a4690961cdde1e5f77269acf07d77030e5466f']],
  [12746, ['unresolved', 9731500, 9746246, 'FunctionDeclaration', '53675c8c172c312b1486d90018276b1e1be94c1ddfd23b6b3b8b07f9c288129b']],
  [12749, ['unresolved', 9746423, 9746689, 'VariableDeclaration', 'd6ee8f6b4396ad63e3bcb2265e90043281ff2ba400febf5bb6e4be9b77041dad']],
  [13857, ['unresolved', 10244067, 10244090, 'ExpressionStatement', '917378c3af3ffeb204784428e2ab20238693d71de7301f85152b3c225057fb9f']],
  [13858, ['unresolved', 10244090, 10245697, 'FunctionDeclaration', '64abe416d6c57f080d50927438322d1fdb8ce6ed644a7c0bb453b80fc90722f4']],
  [13861, ['unresolved', 10246397, 10247160, 'VariableDeclaration', '1b68fda227c30bc21b5ff0f1c7d6ffeee79726e1d06f1929b0060a58e94b1d1e']],
  [13862, ['unresolved', 10247160, 10247273, 'VariableDeclaration', 'e438f6757a0e2ee544c50e784fed281093758b96347b03b60b256ef5adb54637']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
}

function assertFragments(contents, fragments, owner) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${owner}: ${fragment}`)
  }
}

function functionSource(contents, name) {
  const marker = `function ${name}(`
  let start = contents.indexOf(marker)
  assert.notEqual(start, -1, `${name}: declaration`)
  if (contents.slice(start - 6, start) === 'async ') start -= 6
  const signatureEnd = contents.indexOf(')', start + marker.length)
  const bodyOffset = contents.slice(signatureEnd + 1).search(/\{\r?\n/)
  assert.notEqual(bodyOffset, -1, `${name}: body`)
  const body = signatureEnd + 1 + bodyOffset
  let depth = 0
  for (let index = body; index < contents.length; index++) {
    if (contents[index] === '{') depth++
    if (contents[index] === '}' && --depth === 0) {
      return contents.slice(start, index + 1)
    }
  }
  throw new Error(`${name}: unterminated declaration`)
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

async function compileFunctions(contents, names, prelude, exportedNames) {
  const ts = await loadTypeScript()
  const declarations = names
    .map(name => functionSource(contents, name))
    .join('\n')
  const javascript = ts.transpileModule(
    `${prelude}\n${declarations}\nexport { ${exportedNames.join(', ')} };`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const module = { exports: {} }
  new Function('exports', 'module', javascript)(module.exports, module)
  return module.exports
}

test(
  'authenticated target105 pins the complete reactive compaction introduction and target116 evolution',
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

    for (const [index, [classification, start, end, nodeType, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, classification, `${index}: class`)
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        [start, end, nodeType, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }

    for (const fragment of [
      'tengu_reactive_compact_attempt',
      'Reactive compact: fewer than 2 groups, nothing to compact',
      'gap_unparseable',
      'gap_guided',
      'groupsToSummarize',
      'groupsToPreserve',
      'messagesToSummarize',
      'strippedMedia',
      'tengu_cobalt_raccoon',
      'forkLabel:"reactive-compact"',
    ]) {
      assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
      assert.equal(target.includes(fragment), true, `${fragment}: target105`)
      assert.equal(latest.includes(fragment), true, `${fragment}: target116`)
    }

    const targetSummary = target.slice(
      units.get(7216)[1],
      units.get(7216)[2],
    )
    assert.ok(targetSummary.includes('let j=hA(),H=!1'))
    assert.ok(targetSummary.includes('N68($,!0,j,void 0,H)'))
    assert.equal(
      target.includes('REPL VM state has been cleared as part of this compaction'),
      false,
    )
    assert.ok(
      latest.includes(
        'let O=nf(),M=FD()&&LsH($.toolUseContext.getAppState().replContexts,$.toolUseContext.agentId)',
      ),
      'target116 detects whether compaction cleared a live REPL VM',
    )
    assert.ok(
      latest.includes(
        'REPL VM state has been cleared as part of this compaction',
      ),
    )

    const targetRuntime = target.slice(
      units.get(12625)[1],
      units.get(12625)[2],
    )
    assert.ok(targetRuntime.includes('cp(_,w.setAppState),ey6(),sd()'))
    assert.ok(
      latest.includes('SF(q,z.setAppState,z.resultDedupState),BwH(),JI()'),
      'target116 resets tool-result dedup state during reactive cleanup',
    )
    assertFragments(target.slice(units.get(13858)[1], units.get(13858)[2]), [
      'trigger:"manual"',
      'preTokens:A',
      'postTokens:O',
      'reactive compaction failed',
      'compactResult:Y?"failed":"success"',
    ], 'target105 manual reactive command')
  },
)

test(
  'source root owns the target105/current reactive runtime and exact query-command call path',
  sourceOptions,
  () => {
    const reactive = source('services/compact/reactiveCompact.ts')
    const query = source('query.ts')
    const command = source('commands/compact/compact.ts')
    const telemetry = source('utils/telemetry/events.ts')
    const prompt = source('services/compact/prompt.ts')
    const target105Mode = !reactive.includes('hasReplContext')

    assertFragments(reactive, [
      "'tengu_cobalt_raccoon'",
      "'tengu_reactive_compact_attempt'",
      "'tengu_reactive_compact_triggered'",
      "'tengu_reactive_compact_failed'",
      "'tengu_reactive_compact_succeeded'",
      "'Reactive compact: fewer than 2 groups, nothing to compact'",
      "mode: 'gap_unparseable'",
      "mode: 'gap_guided'",
      'groupsToSummarize:',
      'groupsToPreserve:',
      'messagesToSummarize:',
      'strippedMedia,',
      "forkLabel: 'reactive-compact'",
      'attempts--',
      "reason: 'media_unstrippable'",
      "{ callSite: 'reactive_compact' }",
      "processSessionStartHooks('compact'",
      'preCompactDiscoveredTools',
      'resetPreservedAssistantUsage',
      'logCompactionEvent({',
      "trigger: 'auto'",
      "compactResult: 'failed'",
      "compactResult: 'success'",
    ], 'reactiveCompact.ts')

    assertFragments(query, [
      "const reactiveCompact = feature('REACTIVE_COMPACT')",
      "require('./services/compact/reactiveCompact.js')",
      'reactiveCompact?.isReactiveCompactEnabled()',
      'reactiveCompact?.isWithheldPromptTooLong(message)',
      'reactiveCompact?.isWithheldMediaSizeError(message)',
      'await reactiveCompact.tryReactiveCompact({',
      'hasAttempted: hasAttemptedReactiveCompact',
      'messages: messagesForQuery',
      'hasAttemptedReactiveCompact: true',
      "transition: { reason: 'reactive_compact_retry' }",
    ], 'query.ts')

    assertFragments(command, [
      "const reactiveCompact = feature('REACTIVE_COMPACT')",
      'reactiveCompact?.isReactiveOnlyMode()',
      'reactive.reactiveCompactOnPromptTooLong(',
      'roughTokenCountEstimationForMessages(messages)',
      "trigger: 'manual'",
      'boundary.compactMetadata.postTokens',
      "'Compaction failed · conversation could not be reduced below the context limit'",
      "'Compaction failed · attached media exceeds size limits'",
      "error instanceof Error ? error.message : 'reactive compaction failed'",
      'logCompactionEvent({',
      "compactResult: compactError ? 'failed' : 'success'",
      "compactResult: 'failed'",
      'compactError: error instanceof Error ? error.message : String(error)',
      'error instanceof CompactionError',
    ], 'commands/compact/compact.ts')
    assertFragments(telemetry, [
      'export function logCompactionEvent',
      "void logOTelEvent('compaction'",
      "success: String(values.success)",
      "duration_ms: String(Math.round(values.durationMs))",
      "pre_tokens: String(values.preTokens)",
      "post_tokens: String(values.postTokens)",
      "...(values.error && { error: values.error })",
    ], 'utils/telemetry/events.ts')

    if (target105Mode) {
      assert.equal(reactive.includes('resetToolResultDedupState'), false)
      assert.ok(reactive.includes('runPostCompactCleanup(values.querySource)'))
      assert.equal(
        prompt.includes(
          'REPL VM state has been cleared as part of this compaction',
        ),
        false,
      )
      assert.ok(command.includes('function resetCompactResponseLength'))
      assert.ok(command.includes('context.setResponseLength?.(() => 0)'))
    } else {
      assertFragments(reactive, [
        'isReplModeEnabled() &&',
        'hasReplContext(',
        'cacheSafeParams.toolUseContext.getAppState().replContexts',
        'replVmWasCleared,',
        'resetToolResultDedupState(toolUseContext.resultDedupState)',
        'runPostCompactCleanup(values.querySource, toolUseContext.setAppState)',
      ], 'current reactiveCompact.ts')
      assert.ok(
        prompt.includes(
          'REPL VM state has been cleared as part of this compaction',
        ),
      )
      assert.ok(command.includes('context.resetResponseLength?.()'))
      assert.ok(
        command.includes('resetToolResultDedupState(context.resultDedupState)'),
      )
    }
  },
)

test(
  'recovered retry engine executes gap-guided, unparseable-gap, and media fallback semantics',
  sourceOptions,
  async () => {
    const reactive = source('services/compact/reactiveCompact.ts')
    const runtime = await compileFunctions(
      reactive,
      [
        'groupsNeededToCoverGap',
        'chooseReactiveStep',
        'attemptReactiveCompact',
      ],
      `
        type Message = any
        type CacheSafeParams = any
        type ReactiveAttemptOutcome = any
        type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS = any
        let harnessGroups: any[][] = []
        let harnessSummaries: any[] = []
        let harnessCalls: any[] = []
        let harnessEvents: any[] = []
        let harnessDebug: any[] = []
        function setHarness(groups: any[][], summaries: any[]) {
          harnessGroups = groups
          harnessSummaries = summaries
          harnessCalls = []
          harnessEvents = []
          harnessDebug = []
        }
        function getHarness() {
          return {
            calls: harnessCalls,
            events: harnessEvents,
            debug: harnessDebug,
          }
        }
        const getMessagesAfterCompactBoundary = (messages: any[]) => messages
        const groupMessagesByApiRound = (_messages: any[]) => harnessGroups
        const logForDebugging = (message: string, metadata?: any) =>
          harnessDebug.push({ message, metadata })
        const logEvent = (name: string, metadata: any) =>
          harnessEvents.push({ name, metadata })
        const roughTokenCountEstimationForMessages = (messages: any[]) =>
          messages.reduce((total, message) => total + (message.tokens ?? 0), 0)
        const summarizeReactiveMessages = async (
          messages: any[],
          _params: any,
          _instructions: any,
          strippedMedia: boolean,
        ) => {
          harnessCalls.push({ messages, strippedMedia })
          return harnessSummaries.shift()
        }
      `,
      [
        'groupsNeededToCoverGap',
        'chooseReactiveStep',
        'attemptReactiveCompact',
        'setHarness',
        'getHarness',
      ],
    )
    const cacheSafeParams = {
      toolUseContext: { abortController: { signal: { aborted: false } } },
    }
    const assistant = (id, tokens = 1) => ({
      type: 'assistant',
      id,
      tokens,
    })
    const usage = {
      input_tokens: 3,
      output_tokens: 2,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    }

    runtime.setHarness([[assistant('only')]], [])
    assert.deepEqual(
      await runtime.attemptReactiveCompact([], cacheSafeParams),
      { ok: false, reason: 'too_few_groups', attempts: 0, totalGroups: 1 },
    )
    assert.equal(
      runtime.getHarness().debug[0].message,
      'Reactive compact: fewer than 2 groups, nothing to compact',
    )

    const mediaGroups = [
      [assistant('a')],
      [assistant('b')],
      [assistant('tail')],
    ]
    runtime.setHarness(mediaGroups, [
      { ok: false, reason: 'media_too_large' },
      {
        ok: true,
        summaryText: 'summary',
        messages: [{ type: 'user', id: 'summary' }],
        totalUsage: usage,
      },
    ])
    const media = await runtime.attemptReactiveCompact([], cacheSafeParams)
    assert.equal(media.ok, true)
    assert.equal(media.result.attempt, 1)
    assert.equal(media.result.groupsPreserved, 1)
    assert.deepEqual(media.result.messagesToPreserve, mediaGroups[2])
    assert.deepEqual(
      runtime.getHarness().calls.map(call => call.strippedMedia),
      [false, true],
    )
    assert.deepEqual(
      runtime.getHarness().events.map(event => event.metadata.attempt),
      [1, 1],
    )
    assert.deepEqual(
      runtime.getHarness().events.map(event => event.metadata.strippedMedia),
      [false, true],
    )

    const gapGroups = [1, 2, 3, 4, 5, 6].map((tokens, index) => [
      assistant(`g${index}`, tokens),
    ])
    runtime.setHarness(gapGroups, [
      { ok: false, reason: 'prompt_too_long', tokenGap: 6 },
      {
        ok: true,
        summaryText: 'smaller summary',
        messages: [{ type: 'user', id: 'summary-2' }],
        totalUsage: usage,
      },
    ])
    const guided = await runtime.attemptReactiveCompact([], cacheSafeParams)
    assert.equal(guided.ok, true)
    assert.equal(guided.result.attempt, 2)
    assert.equal(guided.result.groupsPreserved, 3)
    assert.deepEqual(guided.result.messagesToPreserve, gapGroups.slice(3).flat())
    assert.deepEqual(
      runtime.getHarness().calls.map(call => call.messages.length),
      [5, 3],
    )
    assert.deepEqual(runtime.getHarness().events[1].metadata, {
      attempt: 2,
      groupsToSummarize: 3,
      groupsToPreserve: 3,
      messagesToSummarize: 3,
      strippedMedia: false,
      stepMode: 'gap_guided',
      stepSize: 2,
      tokenGap: 6,
    })

    assert.deepEqual(
      runtime.chooseReactiveStep(undefined, [1, 2, 3], 3),
      { mode: 'gap_unparseable', step: 1 },
    )
    assert.deepEqual(runtime.chooseReactiveStep(3, [1, 2, 3], 3), {
      mode: 'gap_guided',
      step: 1,
    })
    assert.equal(runtime.groupsNeededToCoverGap([1, 1, 1, 1], 4, 99), 2)
  },
)

test(
  'recovered gate and withholding helpers execute exact target105 semantics',
  sourceOptions,
  async () => {
    const reactive = source('services/compact/reactiveCompact.ts')
    const runtime = await compileFunctions(
      reactive,
      [
        'isReactiveCompactEnabled',
        'isReactiveOnlyMode',
        'isWithheldPromptTooLong',
        'isWithheldMediaSizeError',
      ],
      `
        type Message = any
        type StreamEvent = any
        type AssistantMessage = any
        let nonInteractive = false
        let flag = false
        let requested: any[] = []
        function setGate(nextNonInteractive: boolean, nextFlag: boolean) {
          nonInteractive = nextNonInteractive
          flag = nextFlag
          requested = []
        }
        function requestedFlags() { return requested }
        const getIsNonInteractiveSession = () => nonInteractive
        const getFeatureValue_CACHED_MAY_BE_STALE = (
          key: string,
          fallback: boolean,
        ) => {
          requested.push({ key, fallback })
          return flag
        }
        const isPromptTooLongMessage = (message: any) => message.apiError === 'ptl'
        const isMediaSizeErrorMessage = (message: any) => message.apiError === 'media'
      `,
      [
        'isReactiveCompactEnabled',
        'isReactiveOnlyMode',
        'isWithheldPromptTooLong',
        'isWithheldMediaSizeError',
        'setGate',
        'requestedFlags',
      ],
    )

    runtime.setGate(true, true)
    assert.equal(runtime.isReactiveCompactEnabled(), false)
    assert.deepEqual(runtime.requestedFlags(), [])

    runtime.setGate(false, false)
    assert.equal(runtime.isReactiveOnlyMode(), false)
    assert.deepEqual(runtime.requestedFlags(), [
      { key: 'tengu_cobalt_raccoon', fallback: false },
    ])

    runtime.setGate(false, true)
    assert.equal(runtime.isReactiveCompactEnabled(), true)
    assert.equal(
      runtime.isWithheldPromptTooLong({ type: 'assistant', apiError: 'ptl' }),
      true,
    )
    assert.equal(
      runtime.isWithheldPromptTooLong({ type: 'user', apiError: 'ptl' }),
      false,
    )
    assert.equal(
      runtime.isWithheldMediaSizeError({
        type: 'assistant',
        apiError: 'media',
      }),
      true,
    )
  },
)

test(
  'recovered compaction reporter serializes the authenticated OTel fields',
  sourceOptions,
  async () => {
    const telemetry = source('utils/telemetry/events.ts')
    const runtime = await compileFunctions(
      telemetry,
      ['logCompactionEvent'],
      `
        let calls: any[] = []
        function getCalls() { return calls }
        const logOTelEvent = (name: string, metadata: any) => {
          calls.push({ name, metadata })
          return Promise.resolve()
        }
      `,
      ['logCompactionEvent', 'getCalls'],
    )

    runtime.logCompactionEvent({
      trigger: 'manual',
      success: false,
      durationMs: 12.6,
      preTokens: 900,
      postTokens: 321,
      error: 'too large',
    })
    runtime.logCompactionEvent({
      trigger: 'auto',
      success: true,
      durationMs: 1.2,
    })
    assert.deepEqual(runtime.getCalls(), [
      {
        name: 'compaction',
        metadata: {
          trigger: 'manual',
          success: 'false',
          duration_ms: '13',
          pre_tokens: '900',
          post_tokens: '321',
          error: 'too large',
        },
      },
      {
        name: 'compaction',
        metadata: {
          trigger: 'auto',
          success: 'true',
          duration_ms: '1',
        },
      },
    ])
  },
)
