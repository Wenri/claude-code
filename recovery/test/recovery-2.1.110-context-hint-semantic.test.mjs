import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const introductionCase = '2.1.109-to-2.1.110'
const refinementCase = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')

const bundlePaths = {
  109: process.env.CLAUDE_CODE_2_1_109_BUNDLE,
  110: process.env.CLAUDE_CODE_2_1_110_BUNDLE,
  114: process.env.CLAUDE_CODE_2_1_114_BUNDLE,
  116: process.env.CLAUDE_CODE_2_1_116_BUNDLE,
}
const bundleHashes = {
  109: '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7',
  110: 'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
  114: 'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
  116: 'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
}

function structural(caseName) {
  return JSON.parse(
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
}

const introductionStructural = structural(introductionCase)
const refinementStructural = structural(refinementCase)
const sourceApplicable =
  !semanticCase ||
  semanticCase === introductionCase ||
  semanticCase === refinementCase
const introductionSource = semanticCase === introductionCase
const refinementSource = !semanticCase || semanticCase === refinementCase

function bundlesRequired(versions) {
  if (semanticCase && !versions.some(version =>
    (version === 109 || version === 110)
      ? semanticCase === introductionCase
      : semanticCase === refinementCase,
  )) {
    return `not applicable to ${semanticCase}`
  }
  const missing = versions.filter(version => !bundlePaths[version])
  return missing.length > 0
    ? `missing bundle path(s): ${missing.join(', ')}`
    : false
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function readBundle(version) {
  const bytes = fs.readFileSync(bundlePaths[version])
  assert.equal(sha256(bytes), bundleHashes[version], `2.1.${version} artifact`)
  return bytes.toString('utf8')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function assertFragments(relative, fragments) {
  const contents = source(relative)
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${relative}: ${fragment}`)
  }
  return contents
}

const introductionUnits = new Map([
  [7381, [4949928, 4950254, 'b9a58d0d880e6442e48b0b48b89e2a56ba91222a745921931565855b46e34e61', 'unresolved']],
  [7382, [4950254, 4951045, 'ab867666914876f1a593846d625614c2b50033766fa3122a88e043a67d80f1f9', 'unresolved']],
  [12365, [9315142, 9329963, 'ae34168221a3e2271f2d07f7fcf881e7ae6f646c63ad962e1824478c5d3808d0', 'unresolved']],
  [13784, [10028730, 10031919, '1925e49380524294db4ebcccd7aabd6b8cc40a1a82387e679e2636ebcc1ffdc2', 'unresolved']],
  [16952, [11819801, 11819851, '3563f818e981a575aeff2ca628d2cb891472c113f96ca226d4ffef2a999c16a7', 'unresolved']],
  [16953, [11819851, 11819924, '8fb1a010fc6b393af77b8e0b0b8e94f580d4d035fff81fc78e7f372584c89eaf', 'unresolved']],
  [16954, [11819924, 11820055, 'c08b4a39ddd93d1442e58a45cbbae6e7db7d88b27dfeea8bda06c81bcc83d72f', 'unresolved']],
  [16955, [11820055, 11820110, '7644d7f7e69435292c90273cd8a7d92294c8af6899e21eb445c1414b67245365', 'unresolved']],
  [16956, [11820110, 11820272, 'c9f7089524a3270e2c82513929446965f7c550b775017397414ff969bbce6e20', 'unresolved']],
  [16957, [11820272, 11820341, 'd53b904e6bb3825eb8cd1d8b1bede6aacabaa58289174faf768bed46ad43492c', 'unresolved']],
  [16958, [11820341, 11820626, '23495ef3bfa30e9cb3b669268ab60512afd51afa25d6744142ee2272285eeaf6', 'unresolved']],
  [16959, [11820626, 11820705, '87e1e14bc4aaabd062a52eab9a9183356e6d9c91668c63fa2655e897c069c27c', 'unresolved']],
  [16960, [11820705, 11820795, '1f99257dc73cd36995f1449d8187b8241d36a8aa293a3ab952a5dc76119d1fa3', 'unresolved']],
  [16961, [11820795, 11820829, 'df7d7c6ad5779d16aa8700f190dc7e21ad2ad79fde3b187b9276b7785a661256', 'unresolved']],
  [16962, [11820829, 11820861, '9cb4fe5591687f81812ed0eead200dcb4429909c322d5ef2263daa46e5fcdf83', 'unresolved']],
  [16963, [11820861, 11820872, 'd72391a542340b0380931523ea2803df461d5f82b848ae1d6059cd4e54572a43', 'moved']],
  [16964, [11820872, 11820966, 'cddea4a0305df478a5aca2e1acc4d7be7b921b2dfe29f0134219482bea7eb367', 'unresolved']],
  [16965, [11820966, 11821626, '0aae6a4df3fbd8980ce8bc39896667f649ebc571074b114aed7a6d264812faea', 'unresolved']],
  [16966, [11821626, 11822079, 'bf3473394d5098500e2bcb3e2b34f66d3034fca34d215343f7c3e4835e53d8bd', 'unresolved']],
  [16967, [11822079, 11822902, 'ec4ce02719d118249c04be05a432c06d74126366154542da21954b986828066c', 'unresolved']],
  [16968, [11822902, 11822916, '69f8e297a4dceca99bb78de10cf5baccea26cda797144629a81c9ad0537cdb4f', 'unresolved']],
  [16969, [11822916, 11822971, 'aa966b57d526a1caff470e28c37bbe28fdbe8617cfcdf97eb530fd8ac619d655', 'unresolved']],
  [16991, [11829280, 11849799, '2b2e93c11630e3a2e02f6c836720d88743eb4e82108ac537304bbacad77e5276', 'unresolved']],
  [18709, [12658846, 12715652, '5d9e75dfd263f1e179a57ae8a61e6b8e2d04a0959bc35787391137dbd1e9c441', 'unresolved']],
])

const refinementUnits = new Map([
  [18222, [11228623, 11229477, 'f34ae2a00203234636d461c5769617924f67e532b7a282ef94fe2d98fff61954', 'unresolved']],
])

function assertPinnedUnits(bundle, data, units) {
  for (const [index, [start, end, sourceHash, classification]] of units) {
    const region = data.regions[index]
    assert.equal(region.classification, classification, `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
  }
}

test(
  '2.1.110 context-hint introduction pins controller, retry, compaction, and query call path',
  { skip: bundlesRequired([109, 110]) },
  () => {
    const baseline = readBundle(109)
    const target = readBundle(110)
    assertPinnedUnits(target, introductionStructural, introductionUnits)
    for (const fragment of [
      'context-hint-2026-04-09',
      'tengu_hazel_osprey',
      'tengu_context_hint_reject',
      'tengu_context_hint_busy_fallback',
      'tengu_thinking_clear_latched',
      '[CONTEXT_HINT_REJECT] thinkingCleared=',
      'context_hint_sse',
      'applyHintClears',
    ]) {
      assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
      assert.equal(target.includes(fragment), true, `${fragment}: target`)
    }

    const replUnit = target.slice(12658846, 12715652)
    assert.ok(replUnit.includes('.action){case"add"'))
    assert.ok(replUnit.includes('.ids)'))
    assert.ok(replUnit.includes('case"remove"'))
    assert.ok(replUnit.includes('case"clear"'))
    assert.match(
      replUnit,
      /case"allow":return!0;case"deny":return!1;case"classify":return[^;]+;case"ask":break/,
      'sandbox requests honor the permission-mode allow/deny/classify/ask decision',
    )
    assert.match(replUnit, /\.isMeta&&![A-Za-z0-9_$]+\([^)]*\.origin\)/)
    assert.match(
      replUnit,
      /origin:[A-Za-z0-9_$]+\.origin,isMeta:[A-Za-z0-9_$]+\.isMeta,skipSlashCommands:/,
    )
    assert.ok(replUnit.includes('stopHookActive:'))
    assert.ok(replUnit.includes('useLayoutEffect'))
    assert.ok(replUnit.includes('preventDefault'))
    assert.ok(replUnit.includes('tabIndex:0'))
    assert.ok(replUnit.includes('toolUseId'))

    // These subgraphs predate the boundary but receive extra compiled
    // occurrences when the large REPL owner changes. Pin their presence in
    // both artifacts so only the classifier/context-hint additions are
    // attributed to 109→110.
    for (const inheritedFragment of [
      'action){case"add"',
      'tengu_concurrent_onquery_enqueued',
      'rendering ${',
      'toolUseId}',
    ]) {
      assert.ok(baseline.includes(inheritedFragment), `${inheritedFragment}: baseline`)
      assert.ok(target.includes(inheritedFragment), `${inheritedFragment}: target`)
    }
  },
)

test(
  '2.1.116 refines context-hint request bodies behind the five-tool keep window',
  { skip: bundlesRequired([114, 116]) },
  () => {
    const baseline = readBundle(114)
    const target = readBundle(116)
    assertPinnedUnits(target, refinementStructural, refinementUnits)
    const targetUnit = target.slice(11228623, 11229477)
    assert.ok(targetUnit.includes('.length>'))
    assert.ok(targetUnit.includes('body:'))
    assert.ok(targetUnit.includes('?{context_hint:{enabled:!0}}:null'))
    assert.ok(targetUnit.includes('betaHeader:'))
    assert.equal(
      baseline.includes('?{context_hint:{enabled:!0}}:null'),
      false,
      '2.1.114 still sends the enabled body whenever the beta is active',
    )
  },
)

test(
  'source owns context-hint predicates, telemetry, and keep-recent edits',
  { skip: sourceApplicable ? false : `not applicable to ${semanticCase}` },
  () => {
    const controller = assertFragments('src/services/compact/apiMicrocompact.ts', [
      "'context-hint-2026-04-09'",
      "'tengu_hazel_osprey'",
      "querySource.startsWith('repl_main_thread')",
      'error.status === 422 || error.status === 424',
      "error.status === 409",
      "message.includes('Unexpected value')",
      "message.includes('anthropic-beta')",
      "'tengu_context_hint_reject'",
      "'tengu_context_hint_busy_fallback'",
      "'tengu_thinking_clear_latched'",
      'Math.round(thinkingCharacters / 4)',
      'keepRecent: CONTEXT_HINT_KEEP_RECENT',
      '[CONTEXT_HINT_REJECT] thinkingCleared=',
    ])
    if (introductionSource) {
      assert.ok(controller.includes('buildRequestParams()'))
      assert.ok(controller.includes('body: { context_hint: { enabled: true } }'))
      assert.equal(controller.includes('collectCompactableToolIds'), false)
    }
    if (refinementSource) {
      assert.ok(controller.includes('buildRequestParams(messages)'))
      assert.ok(
        controller.includes(
          'collectCompactableToolIds(messages).length > CONTEXT_HINT_KEEP_RECENT',
        ),
      )
      assert.ok(
        controller.includes(
          'body: hasEnoughToolUses ? { context_hint: { enabled: true } } : null',
        ),
      )
    }

    assertFragments('src/services/compact/microCompact.ts', [
      'export function collectCompactableToolIds',
      'export function applyContextHintClears',
      'if (clearedIds.size === 0) return [...messages]',
      'clearedIds.has(block.tool_use_id)',
      'content: TIME_BASED_MC_CLEARED_MESSAGE',
      'export function applyContextHintMicrocompact',
      "trigger: 'context_hint'",
      'tokensSaved',
      'clearedIds',
    ])
  },
)

test(
  'source gives each keyed context-hint recovery one budget-neutral retry',
  { skip: sourceApplicable ? false : `not applicable to ${semanticCase}` },
  () => {
    const retry = assertFragments('src/services/api/withRetry.ts', [
      'onError?: (error: unknown) => string | undefined',
      'const handledRecoveryKeys = new Set<string>()',
      'const recoveryKey = options.onError?.(error)',
      'recoveryKey && !handledRecoveryKeys.has(recoveryKey)',
      'handledRecoveryKeys.add(recoveryKey)',
      'attempt--',
      'continue',
    ])
    assert.ok(
      retry.indexOf('handledRecoveryKeys.add(recoveryKey)') <
        retry.indexOf('attempt--', retry.indexOf('handledRecoveryKeys.add(recoveryKey)')),
    )
  },
)

test(
  'source threads context hints through query construction and stream fallback',
  { skip: sourceApplicable ? false : `not applicable to ${semanticCase}` },
  () => {
    const claude = assertFragments('src/services/api/claude.ts', [
      'createContextHintController({',
      'includeFirstPartyBetas',
      'isAfkModeBetaRejection',
      'contextHintController?.buildRequestParams(messagesForAPI)',
      '...(!simulateProxyUsage && contextHintBody ? contextHintBody : {})',
      "return 'retry:context-hint'",
      "fallbackCause: 'watchdog' | 'other' | 'context_hint_sse'",
      "fallbackCause = 'context_hint_sse'",
      'contextHintController?.onStreamFallback(',
      'contextHintController?.strip()',
      'options.onHintCleared?.(hintResult.clearedIds)',
    ])
    assert.ok(
      claude.indexOf('createContextHintController({') <
        claude.indexOf(
          'contextHintController?.buildRequestParams(messagesForAPI)',
        ),
    )

    // These call-path owners enter at 109→110 and are available in the
    // cumulative current tree. An isolated 114→116 materialization owns only
    // the request-body refinement, so do not require the earlier supplement
    // to have been replayed into that single-case source root.
    if (introductionSource || !semanticCase) {
      assertFragments('src/Tool.ts', [
        'applyHintClears?: (clearedIds: Set<string>) => void',
      ])
      assertFragments('src/query.ts', [
        'onHintCleared: toolUseContext.applyHintClears',
      ])
      assertFragments('src/screens/REPL.tsx', [
      'applyContextHintClears, resetMicrocompactState',
      'applyHintClears(clearedIds)',
      'setMessages(previous => applyContextHintClears(previous, clearedIds))',
      "case 'add':",
      'for (const id of action.ids) next.add(id)',
      "case 'remove':",
      "case 'clear':",
      'getSandboxPermissionModeDecision(mode, isBypassPermissionsModeAvailable)',
      'classifySandboxNetworkAccess(hostPattern.host, hostPattern.port',
      'message.isMeta && !isChannelMessageOrigin(message.origin)',
      'origin: message.origin',
      'isMeta: message.isMeta',
      'skipSlashCommands: isChannelMessageOrigin(message.origin)',
      'stopHookActive',
      'toolProgressOverlays.values()',
      'key={event.toolUseId}',
      'event.stopImmediatePropagation()',
      ])
      assertFragments('src/hooks/useRemoteSession.ts', [
      "{ action: 'remove', ids: resultIds }",
      "{ action: 'add', ids: toolUseIds }",
      "{ action: 'clear' }",
      ])
      assertFragments('src/services/tools/toolOrchestration.ts', [
      "action: 'add'",
      "action: 'remove'",
      ])
      assertFragments('src/services/tools/StreamingToolExecutor.ts', [
      "action: 'add'",
      "action: 'remove'",
      ])
      assertFragments('src/utils/messages.ts', [
      'export function isChannelMessageOrigin',
      "return origin?.kind === 'channel'",
      ])
      assertFragments('src/components/ToolProgressOverlay.tsx', [
      "kind: 'background_hint'",
      'toolUseId: string',
      'renderToolProgressOverlay',
      ])
    }
  },
)
