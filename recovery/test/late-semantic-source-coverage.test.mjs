import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const lateCases = [
  ['2.1.107-to-2.1.108', 3435, 147],
  ['2.1.108-to-2.1.109', 209, 8],
  ['2.1.109-to-2.1.110', 6724, 174],
  ['2.1.110-to-2.1.111', 2293, 136],
  ['2.1.111-to-2.1.112', 75, 2],
  ['2.1.112-to-2.1.113', 9043, 2184],
  ['2.1.113-to-2.1.114', 72, 0],
  ['2.1.114-to-2.1.116', 3870, 452],
]
const historicalOnlyOwners = new Map([
  [
    '2.1.108-to-2.1.109:src/components/ThinkingIndicator.tsx',
    {
      evidenceIds: ['thinking-indicator-target-fragment', 'thinking-indicator-semantic-test'],
      retiredInCase: '2.1.114-to-2.1.116',
    },
  ],
  [
    '2.1.109-to-2.1.110:src/commands/remote-workflows/index.ts',
    {
      evidenceIds: ['push-remote-target-fragment', 'push-remote-semantic-test'],
      retiredInCase: '2.1.112-to-2.1.113',
    },
  ],
  [
    '2.1.109-to-2.1.110:src/commands/remote-workflows/spawner.tsx',
    {
      evidenceIds: ['push-remote-target-fragment', 'push-remote-semantic-test'],
      retiredInCase: '2.1.112-to-2.1.113',
    },
  ],
])

function source(relative) {
  return fs.readFileSync(path.join(repositoryRoot, relative), 'utf8')
}

function compressedJson(relative) {
  return JSON.parse(gunzipSync(fs.readFileSync(path.join(repositoryRoot, relative))))
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test('late semantic ledgers classify every nonmatched structural unit fail-closed', () => {
  for (const [caseName, expectedRows, expectedDependencyGaps] of lateCases) {
    const filename = path.join(
      repositoryRoot,
      'recovery',
      'cases',
      caseName,
      'semantic',
      'source-coverage.json.gz',
    )
    const ledger = JSON.parse(gunzipSync(fs.readFileSync(filename)))
    assert.equal(ledger.rows.length, expectedRows, caseName)
    assert.equal(ledger.summary.nonmatchedUnits, expectedRows, caseName)
    assert.equal(ledger.summary.sourceRuntimeGaps, 0, caseName)
    assert.equal(
      ledger.summary.dependencyRuntimeGaps,
      expectedDependencyGaps,
      caseName,
    )
    assert.equal(
      ledger.rows.some(row => row.disposition === 'source-runtime-gap'),
      false,
      caseName,
    )
    for (const owner of ledger.owners) {
      const ownerPath = path.join(repositoryRoot, owner.path)
      if (fs.existsSync(ownerPath)) {
        assert.equal(fs.statSync(ownerPath).isFile(), true)
        assert.equal(owner.retiredInCase, undefined)
        continue
      }
      // These exact owners are intentionally historical-only: the thinking
      // indicator is removed by target116 and remote-workflows is present only
      // in 110–112. Their focused tests authenticate both introduction and
      // later removal. No unlisted missing owner may pass this branch.
      const expected = historicalOnlyOwners.get(
        `${caseName}:${owner.path}`,
      )
      assert.ok(expected, `${caseName}:${owner.path}`)
      assert.equal(owner.retiredInCase, expected.retiredInCase)
      const ownerRows = ledger.rows.filter(row =>
        row.ownerIds.includes(owner.id),
      )
      assert.ok(ownerRows.length > 0)
      for (const row of ownerRows) {
        assert.deepEqual(row.evidenceIds, expected.evidenceIds)
      }
    }
  }
})

test('late dependency audits keep unpinned third-party runtime gaps fail-closed', () => {
  for (const [caseName, , expectedDependencyGaps] of lateCases) {
    const ledger = compressedJson(
      `recovery/cases/${caseName}/semantic/source-coverage.json.gz`,
    )
    const audit = compressedJson(
      `recovery/cases/${caseName}/semantic/dependency-coverage.json.gz`,
    )
    const dependencyRows = ledger.rows.filter(
      row => row.disposition === 'dependency-runtime',
    )
    const auditedRows = audit.groups.flatMap(group => group.rows)
    assert.equal(dependencyRows.length, expectedDependencyGaps, caseName)
    assert.equal(audit.summary.dependencyRows, expectedDependencyGaps, caseName)
    assert.equal(
      audit.summary.dependencyRuntimeGaps,
      expectedDependencyGaps,
      caseName,
    )
    assert.equal(audit.summary.pinnedSourceBuildInputs, 0, caseName)
    assert.equal(audit.summary.exactTargetBundleArtifactRecoverable, true, caseName)
    assert.equal(
      audit.summary.wholeBundleSemanticEquivalentFromSrc,
      false,
      caseName,
    )
    assert.deepEqual(
      auditedRows.map(row => row.targetIndex).sort((left, right) => left - right),
      dependencyRows.map(row => row.targetIndex).sort((left, right) => left - right),
      caseName,
    )
    for (const group of audit.groups) {
      assert.equal(group.summary.sourceBuildInputPinned, false, `${caseName}: ${group.package}`)
      assert.equal(
        group.summary.identifierOrMetadataEquivalent +
          group.summary.materialOrUnresolvedDelta +
          (group.summary.vendoredBuildInputUnpinned ?? 0),
        group.summary.dependencyRows,
        `${caseName}: ${group.package}`,
      )
    }
  }
})

test('the coalesced target116 WIF SDK partition has exact dependency-fragment proof', () => {
  const ledger = compressedJson(
    'recovery/cases/2.1.114-to-2.1.116/semantic/source-coverage.json.gz',
  )
  const evidence = ledger.evidence.find(
    item => item.id === 'workload-identity-dependency-target-fragment',
  )
  assert.deepEqual(
    {
      kind: evidence?.kind,
      path: evidence?.path,
    },
    {
      kind: 'dependency-target-fragment',
      path: 'recovery/test/recovery-2.1.116-workload-identity-semantic.test.mjs',
    },
  )
  const authenticatedRows = ledger.rows.filter(row =>
    row.evidenceIds.includes('workload-identity-dependency-target-fragment'),
  )
  assert.deepEqual(
    authenticatedRows.map(row => row.targetIndex),
    Array.from({ length: 29 }, (_, offset) => 4603 + offset),
  )
  assert.ok(
    authenticatedRows.every(
      row =>
        row.disposition === 'dependency-runtime' &&
        row.ownerIds.length === 0 &&
        row.evidenceIds.includes('dependency-attribution') &&
        row.evidenceIds.includes('dependency-build-input-audit'),
    ),
  )
})

test('misleading source-map boundaries use target-fragment runtime owners', () => {
  const expected = new Map([
    ['2.1.109-to-2.1.110:10535', 'owner-src-commands-provider-setup-relaunch-ts'],
    ['2.1.109-to-2.1.110:15641', 'owner-src-utils-relaunch-ts'],
    ['2.1.110-to-2.1.111:4614', 'owner-src-utils-betas-ts'],
    ['2.1.110-to-2.1.111:10581', 'owner-src-commands-provider-setup-relaunch-ts'],
    ['2.1.112-to-2.1.113:8589', 'owner-src-utils-loopWakeup-ts'],
    ['2.1.112-to-2.1.113:17277', 'owner-src-commands-exit-exit-tsx'],
    ['2.1.112-to-2.1.113:19449', 'owner-src-hooks-useAwaySummary-ts'],
    [
      '2.1.114-to-2.1.116:20421',
      'owner-src-services-mcp-headlessConnectionManager-ts',
    ],
    ['2.1.114-to-2.1.116:19121', 'owner-src-components-CoordinatorAgentStatus-tsx'],
  ])
  for (const [key, expectedOwner] of expected) {
    const [caseName, targetIndexText] = key.split(':')
    const ledger = compressedJson(
      `recovery/cases/${caseName}/semantic/source-coverage.json.gz`,
    )
    const row = ledger.rows.find(
      candidate => candidate.targetIndex === Number(targetIndexText),
    )
    assert.ok(row, key)
    assert.ok(row.ownerIds.includes(expectedOwner), key)
    const expectedEvidence =
      key === '2.1.114-to-2.1.116:20421'
        ? ['headless-mcp-target-fragment', 'headless-mcp-semantic-test']
        : key === '2.1.114-to-2.1.116:19121'
          ? [
              'case116-safe-residual-static-ast',
              'case116-safe-residual-semantic-test',
            ]
          : ['target-fragment', 'semantic-test']
    assert.deepEqual(row.evidenceIds, expectedEvidence, key)
    assert.ok(row.behavior.length > 40, key)
  }
})

test('late claude-api embedded documents and routing are exact source owners', () => {
  const expectedChanges = new Map([
    ['2.1.107-to-2.1.108', [
      'SKILL.md',
      'shared/live-sources.md',
      'shared/models.md',
    ]],
    ['2.1.108-to-2.1.109', []],
    ['2.1.109-to-2.1.110', []],
    ['2.1.110-to-2.1.111', [
      'SKILL.md',
      'curl/examples.md',
      'python/claude-api/README.md',
      'python/claude-api/streaming.md',
      'shared/error-codes.md',
      'shared/live-sources.md',
      'shared/managed-agents-api-reference.md',
      'shared/model-migration.md',
      'shared/models.md',
      'shared/prompt-caching.md',
      'shared/tool-use-concepts.md',
      'typescript/claude-api/README.md',
      'typescript/claude-api/streaming.md',
    ]],
    ['2.1.111-to-2.1.112', []],
    ['2.1.112-to-2.1.113', []],
    ['2.1.113-to-2.1.114', []],
    ['2.1.114-to-2.1.116', [
      'SKILL.md',
      'shared/model-migration.md',
    ]],
  ])
  const latest = new Map()
  for (const [caseName] of lateCases) {
    const artifact = JSON.parse(source(
      `recovery/cases/${caseName}/semantic/claude-api-content.json`,
    ))
    assert.equal(artifact.schemaVersion, 1, caseName)
    assert.equal(artifact.case, caseName, caseName)
    assert.deepEqual(
      artifact.documentChanges.map(change => change.path),
      expectedChanges.get(caseName),
      caseName,
    )
    for (const change of artifact.documentChanges) {
      assert.equal(change.owner, `src/skills/bundled/claude-api/${change.path}`)
      assert.ok(change.target, `${caseName}: ${change.path}`)
      latest.set(change.path, change.target)
    }
  }
  for (const [relative, expected] of latest) {
    const value = fs.readFileSync(path.join(
      repositoryRoot,
      'src/skills/bundled/claude-api',
      relative,
    ))
    assert.equal(value.length, expected.bytes, relative)
    assert.equal(sha256(value), expected.sha256, relative)
  }

  const content = source('src/skills/bundled/claudeApiContent.ts')
  for (const fragment of [
    "OPUS_ID: 'claude-opus-4-7'",
    "OPUS_NAME: 'Claude Opus 4.7'",
    "import sharedModelMigration from './claude-api/shared/model-migration.md'",
    "'shared/model-migration.md': sharedModelMigration",
    "'shared/managed-agents-api-reference.md': sharedManagedAgentsApiReference",
  ]) assert.ok(content.includes(fragment), fragment)
  const routing = source('src/skills/bundled/claudeApi.ts')
  for (const fragment of [
    '**Migrating to a newer model or replacing a retired model:**',
    'shared/model-migration.md',
    'user asks for the Claude API, Anthropic SDK, or Managed Agents',
    'SKIP: file imports `openai`/other-provider SDK',
  ]) assert.ok(routing.includes(fragment), fragment)

  const case107 = compressedJson(
    'recovery/cases/2.1.107-to-2.1.108/semantic/source-coverage.json.gz',
  )
  assert.equal(
    case107.rows.find(row => row.targetIndex === 18926)?.disposition,
    'dce-nonruntime',
  )
  const case116 = compressedJson(
    'recovery/cases/2.1.114-to-2.1.116/semantic/source-coverage.json.gz',
  )
  for (const targetIndex of [20382, 20393]) {
    const row = case116.rows.find(candidate => candidate.targetIndex === targetIndex)
    assert.equal(row?.disposition, 'alpha-equivalent', String(targetIndex))
    assert.ok(row?.evidenceIds.includes('static-semantic-noop'), String(targetIndex))
  }
})

test('inherited generated-only loop and provider commands have real cumulative owners', () => {
  const loop = source('src/utils/loopWakeup.ts')
  for (const fragment of [
    'MIN_LOOP_DELAY_SECONDS = 60',
    'MAX_LOOP_DELAY_SECONDS = 3600',
    'cacheLeadMs',
    "kind: 'loop'",
    'cancelAllPendingLoopSessionCrons',
  ]) assert.ok(loop.includes(fragment), fragment)

  const wakeup = source('src/tools/ScheduleWakeupTool/ScheduleWakeupTool.ts')
  assert.ok(wakeup.includes('scheduleLoopWakeup(delaySeconds, prompt, reason)'))
  assert.ok(wakeup.includes('shouldDefer: true'))
  const toolSearch = source('src/tools/ToolSearchTool/prompt.ts')
  assert.ok(toolSearch.includes("feature('AGENT_TRIGGERS')"))
  assert.ok(toolSearch.includes('tool.name === SCHEDULE_WAKEUP_TOOL_NAME'))
  assert.ok(toolSearch.includes('if (isLoopDynamicEnabled()) return false'))
  const commands = source('src/commands.ts')
  assert.ok(commands.includes('setupBedrock'))
  assert.ok(commands.includes('setupVertex'))
  assert.ok(source('src/commands/provider-setup/bedrock.tsx').includes('BedrockSetupWizard'))
  assert.ok(source('src/commands/provider-setup/vertex.tsx').includes('VertexSetupWizard'))
  const providerRelaunch = source('src/commands/provider-setup/relaunch.ts')
  for (const fragment of [
    'await new Promise<void>(resolve => setImmediate(resolve))',
    'process.argv.slice(2)',
    'severProviderSetupTtyInput()',
    "['SIGINT', 'SIGTERM', 'SIGHUP']",
    'Failed to relaunch Claude Code',
  ]) assert.ok(providerRelaunch.includes(fragment), fragment)
})

test('2.1.112 and 2.1.113 source gaps retain exact runtime semantics', () => {
  const betas = source('src/utils/betas.ts')
  assert.ok(
    betas.includes("canonical.includes('claude-opus-4-7')") ||
      betas.includes("canonical === 'claude-opus-4-7'"),
  )
  const copy = source('src/commands/copy/copy.tsx')
  assert.ok(copy.includes('normalizeTablesInMarkdown(texts[age]!)'))
  assert.ok(copy.includes("cell.replace(/\\|/g, '\\\\|')"))
  const scroll = source('src/components/ScrollKeybindingHandler.tsx')
  assert.ok(scroll.includes('countGraphemes(text)'))
  assert.ok(scroll.includes("n === 1 ? 'char' : 'chars'"))
  const color = source('src/ink/colorize.ts')
  assert.ok(color.includes('`\\x1B[7m${result}\\x1B[27m`'))
  const review = source('src/commands/review/UltrareviewOverageDialog.tsx')
  for (const fragment of [
    'useAnimationFrame(reducedMotion ? null : 50)',
    '19 - (Math.floor(time / 200) % 29)',
    'Math.floor(time / 120)',
    'message="Launching"',
    'shimmerColor="subtle"',
  ]) assert.ok(review.includes(fragment), fragment)

  const bashPrompt = source('src/tools/BashTool/prompt.ts')
  assert.ok(
    bashPrompt.includes(
      'never prepend `cd <current-directory>` to a `git` command',
    ),
  )

  const bashAst = source('src/utils/bash/ast.ts')
  for (const fragment of [
    'DANGEROUS_FIND_PREDICATES',
    "'-execdir'",
    "'-delete'",
    'FIND_NEWER_PREDICATE_RE',
    'COMMAND_WRAPPERS',
    "'ionice'",
    "'setsid'",
    "name === 'command'",
    "a[1] === '-p' && (a[2] === '-v' || a[2] === '-V')",
    "find with '${arg}' executes commands or modifies files",
  ]) assert.ok(bashAst.includes(fragment), fragment)

  const away = source('src/hooks/useAwaySummary.ts')
  for (const fragment of [
    'MIN_USER_MESSAGES = 3',
    'MIN_USER_MESSAGES_SINCE_RECAP = 2',
    "should1hCacheTTL('repl_main_thread')",
    "'tengu_sedge_lantern_config'",
    'cacheTtl * 0.9',
    'Math.min(delayRef.current, cacheTtl * 0.8)',
    'lastSignificantMessageIsAwaySummary',
    '(disable recaps in /config)',
    "last?.type === 'system' && last.subtype === 'api_metrics'",
    "logEvent('tengu_return_to_session'",
    'scrolledBeforeSubmit: lastScrollAtRef.current > focusedAt',
    "getPromptInputValue() !== ''",
    '[awaySummary] skipped: draft input present',
  ]) assert.ok(away.includes(fragment), fragment)
  const awayService = source('src/services/awaySummary.ts')
  for (const fragment of [
    'getLastCacheSafeParams()',
    '[awaySummary] no CacheSafeParams saved, skipping',
    'runForkedAgent({',
    "message: 'Away summary cannot use tools'",
    "querySource: 'away_summary'",
    'maxTurns: 1',
    'skipCacheWrite: true',
    'skipTranscript: true',
    'Recap in under 40 words',
  ]) assert.ok(awayService.includes(fragment), fragment)
  const repl = source('src/screens/REPL.tsx')
  assert.ok(repl.includes('isLoading, lastUserScrollTsRef)'))
  assert.ok(repl.includes('setPromptInputValue(consumeEarlyInput())'))
  assert.ok(repl.includes('usePromptInputValue()'))
  assert.ok(repl.includes('useIsPromptInputEmpty()'))
  assert.ok(repl.includes('useRef(getPromptInputValue())'))
  const promptInput = source('src/utils/promptInputState.ts')
  for (const fragment of [
    "createStore({ value: '' })",
    'useSyncExternalStore(',
    "promptInputStore.getState().value === ''",
    'previous.value === value ? previous : { value }',
  ]) assert.ok(promptInput.includes(fragment), fragment)
  const cancelRequest = source('src/hooks/useCancelRequest.ts')
  assert.ok(cancelRequest.includes('isInputEmpty?: boolean'))
  assert.ok(cancelRequest.includes("inputMode !== 'prompt' && isInputEmpty"))

  const exit = source('src/commands/exit/exit.tsx')
  for (const fragment of [
    'getSessionCronTasks()',
    'computeNextCronRun(fields, new Date(task.createdAt))',
    'Runs once in ${formatDuration(remainingMs, { mostSignificantOnly: true })}',
    "label: 'scheduled task'",
    'truncate(task.prompt, 50, true)',
  ]) assert.ok(exit.includes(fragment), fragment)
  const backgroundExit = source('src/components/BackgroundWorkExitDialog.tsx')
  for (const fragment of [
    "'tengu_exit_background_work_prompt'",
    'title="Background work is running"',
    'subtitle="The following will stop when you exit:"',
    "{ label: 'Exit anyway', value: 'exit' }",
    "{ label: 'Stay', value: 'stay' }",
  ]) assert.ok(backgroundExit.includes(fragment), fragment)
})

test('2.1.113 release behavior ledger accounts for every published bullet', () => {
  const behaviors = JSON.parse(
    source(
      'recovery/cases/2.1.112-to-2.1.113/semantic/release-behaviors.json',
    ),
  )
  assert.equal(behaviors.schemaVersion, 1)
  assert.equal(behaviors.behaviors.length, 38)
  assert.deepEqual(
    behaviors.behaviors.map(item => item.id),
    Array.from({ length: 38 }, (_, index) => index + 1),
  )
  for (const item of behaviors.behaviors) {
    assert.ok(item.behavior.length > 0, `behavior ${item.id}`)
    assert.ok(
      [
        'source-runtime-covered',
        'dependency-runtime',
        'generated-metadata',
      ].includes(item.disposition),
      `behavior ${item.id}: ${item.disposition}`,
    )
    if (item.disposition === 'source-runtime-covered') {
      assert.ok(item.owners.length > 0, `behavior ${item.id}`)
      for (const owner of item.owners) {
        assert.equal(
          fs.statSync(path.join(repositoryRoot, owner)).isFile(),
          true,
          `behavior ${item.id}: ${owner}`,
        )
      }
    }
    assert.ok(item.evidence.length > 0, `behavior ${item.id}`)
  }
})

test('late mcpOutputStorage behavior is structurally stable and cumulatively owned', () => {
  const storage = source('src/utils/mcpOutputStorage.ts')
  for (const fragment of [
    'MCP_TRUNCATION_PROMPT_OVERRIDE',
    "case 'structuredContent'",
    'REQUIREMENTS FOR SUMMARIZATION/ANALYSIS/REVIEW',
    'sequential chunks until 100% of the content has been read',
    "case 'application/pdf'",
    "mt.endsWith('+json')",
    "logEvent('tengu_binary_content_persisted'",
    'Binary content (${mt}, ${formatFileSize(size)}) saved to ${filepath}',
  ]) assert.ok(storage.includes(fragment), fragment)
})

test('2.1.116 headless MCP coordinator preserves deadline, concurrency, retry, and cleanup semantics', () => {
  const main = source('src/main.tsx')
  for (const fragment of [
    'MCP_SERVER_READINESS_TIMEOUT_MS = 5_000',
    'MCP_CONFIG_FETCH_TIMEOUT_MS = 1_000',
    'MCP_REMOTE_RETRY_DELAYS_MS = [500, 1_500, 4_000]',
    "'tengu_mcp_retry_failed_remote'",
    "'tengu_mcp_concurrent_connect'",
    'MCP_CONNECTION_NONBLOCKING',
    'setImmediate(() =>',
    'connectWithMcpDeadline(mcpConnectionNonblocking, regular',
    'connectWithMcpDeadline(mcpConnectionNonblocking, claudeAi',
    'client.client.onclose = undefined',
    'clearServerCache(client.name, client.config)',
  ]) assert.ok(main.includes(fragment), fragment)
})
