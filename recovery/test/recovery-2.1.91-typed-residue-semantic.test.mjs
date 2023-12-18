import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.90-to-2.1.91'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const bundlePath = process.env.CLAUDE_CODE_2_1_91_BUNDLE
const targetSha256 =
  'b4bf141f30cf8b40196295816c7a6b9d01a36e906908d73a9f9a865ce4cdf816'
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

const pinnedUnits = new Map([
  [5336, ['unresolved', 3955742, 3957408, '368e98d6a8f5590a4ce9ae10001d9cd928fb8bc316ec46a96b55ce04a50ff140']],
  [5740, ['unresolved', 4144433, 4144780, '62b76af27f8e3f277a17de782a9a29ee0abdd21ebe0d72f07860cd8796984647']],
  [2571, ['unresolved', 1039326, 1060585, 'd7120a9d0fbc00a97ea33a93a2e2f25644f7cd7a85a93487af580a4bb5feb163']],
  [7678, ['unresolved', 6480678, 6480745, '4338aa366e8114a71dcb0350119d02417ea044f88d2c0c33e13d78bd79ddd46f']],
  [9785, ['unresolved', 8073371, 8105612, '1c3f09c7cd8e8598bf0314bd42b5ff6096b39b20e45aa3614f1d4472b72110bf']],
  [12505, ['unresolved', 9614527, 9615352, '70fb4f0136aa6df661e33973ec7d61660f7902d63dbeb65ca10774b51f57029c']],
  [14498, ['unresolved', 10841476, 10861878, '43bd9d971543d6e1b129958d600962bb17a8445d1201716005912c21e6ef9aa2']],
  [16707, ['unresolved', 11987894, 11991192, '3695c6e36b9852541b6fccef71cb0781b37cab24b5054e8de2d4789085006510']],
  [5769, ['unresolved', 4150477, 4151210, 'b2cd60262b1be1a46e0629d82da58089b70466f3334de5bc2b34bb9a5074e8bd']],
  [8948, ['unresolved', 7006450, 7006622, 'ec6133a4b3f6bdc9a1cee059e7318ac71025187b4fce2a3826a0f5ca77f18e0b']],
  [10391, ['unresolved', 8339841, 8345160, 'c3971fae09db54d513f851b1761c13ea7b4dbf2893c28865c8250a46d824b903']],
  [11429, ['unresolved', 9057853, 9057934, 'b7483869ae0b42c3f2ef3ff43606fc2aa33a222b35b1551da6352d95700f8d34']],
  [13164, ['unresolved', 9916113, 9916205, 'e8a6f9eef40114f0d96b6958b73cc850ae951f914d4cceaca01860b6f20302ab']],
  [13388, ['unresolved', 9988806, 9991820, '014335c1f151d1dc81ecd95633c81d6e48a6c4fffa959465a6cd155ef2bb5346']],
  [13469, ['unresolved', 10254344, 10254422, 'c16cff148a1bcfd3d3200c74b0a272b4e3fddde0c6b8144fa0ae1d036696c4a9']],
  [13470, ['unresolved', 10254422, 10254500, '1016942d307acae6fb452657c662e715abbd127f1dd35a60fcc8fc87f1a14045']],
  [16608, ['unresolved', 11925003, 11929135, '4d684136cf9dea3d911f5f2e806544d1d04d49c3947de1cea35d979c13b92b35']],
  [17283, ['unresolved', 12225337, 12227928, '595c98a7d3999e90f0c0d0246d16842afb52c3df49a406a37f9143c83467dc6d']],
  [17237, ['unresolved', 12204903, 12206649, 'e2a76e3bb776923c29a8f6e073db22b90b3ccbba22d98aa37058090a7b453d71']],
  [18026, ['unresolved', 12870062, 12870247, '5eab4518ea8610443a6a8d709582476ced20de9d5e7b3fb2aa8e51991a7bfb12']],
  [18029, ['unresolved', 12870556, 12871233, '9fb9ec9124d635e86a9cc333f1a8c59a0ee1467651d08e655c2e0073079d9b5c']],
  [18190, ['unresolved', 12936655, 12967622, '260e31d9e7ff84cc7ebb3a9052d30fd4b61a9e143421452ff7ec42370699d28a']],
  [18250, ['changed', 12998554, 13001627, 'beb952a3d6916d291a83563e2df08875cdc697fa5a6ac60c3cb7a0418bf468cc']],
  [18283, ['changed', 13014438, 13014908, '35095278c2c320ac1631eb49974f94895390995e5ccc6d9544f8356b4fb9d199']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function assertFragments(relative, fragments) {
  const text = source(relative)
  for (const fragment of fragments) {
    assert.ok(text.includes(fragment), `${relative}: ${fragment}`)
  }
  return text
}

test('2.1.91 pins every first-party added typed-residue unit', {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !bundlePath
      ? 'CLAUDE_CODE_2_1_91_BUNDLE is not set'
      : false,
}, () => {
  const bytes = fs.readFileSync(bundlePath)
  assert.equal(sha256(bytes), targetSha256)
  const bundle = bytes.toString('utf8')
  for (const [index, [classification, start, end, sourceHash]] of pinnedUnits) {
    const region = structural.regions.find(item => item.target.index === index)
    assert.equal(region.classification, classification, `${index}: class`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: identity`,
    )
    assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
  }
  assert.ok(bundle.includes('MAX_MCP_RESULT_SIZE_CHARS') || bundle.includes('Og1=500000'))
  assert.ok(bundle.includes('terminal_reason:'))
  assert.ok(bundle.includes('Why the query loop terminated. Unset when the loop was bypassed'))
  assert.ok(bundle.includes('new Set(["extract_memories","auto_dream","prompt_suggestion","speculation","compact"])'))
  assert.ok(bundle.slice(10841476, 10861878).includes('color:"suggestion",width:'))
  assert.ok(bundle.slice(11987894, 11991192).includes('react.early_return_sentinel'))
  const peerRegion = bundle.slice(12936655, 12967622)
  assert.match(peerRegion, /\w+=void 0;\w+\(\{value:\w+,mode:"prompt",uuid:\w+,skipSlashCommands:!0,\.\.\.\w+&&\{origin:\{kind:"peer",from:\w+\},isMeta:!0\}\}\)/)
})

test('2.1.91 source owns exact assembled settings, limits, SDK, selector, and UI semantics', {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}, () => {
  const settings = source('utils/settings/types.ts')
  assert.match(
    settings,
    /'Disable inline shell execution in skills and custom slash commands from user, project, or plugin sources\. '\s*\+\s*'Commands are replaced with a placeholder instead of being run\.'/,
  )
  assertFragments('constants/toolLimits.ts', [
    'export const MAX_MCP_RESULT_SIZE_CHARS = 500_000',
  ])
  assertFragments('entrypoints/sdk/coreSchemas.ts', [
    "'blocking_limit',",
    "'rapid_refill_breaker',",
    "'tool_deferred',",
    "'completed',",
    'Why the query loop terminated. Unset when the loop was bypassed (local slash command) or interrupted externally (budget/retry limits checked between yields).',
    'deferred_tool_use: SDKDeferredToolUseSchema().optional()',
    'terminal_reason: SDKQueryTerminalReasonSchema().optional()',
  ])
  assertFragments('utils/attachments.ts', [
    "'extract_memories',",
    "'auto_dream',",
    "'prompt_suggestion',",
    "'speculation',",
    "'compact',",
    'MEMORY_SELECTOR_EXCLUDED_QUERY_SOURCES.has(querySource)',
  ])
  assertFragments(
    'components/LogSelector.tsx',
    semanticCase === caseName
      ? ['<Divider color="suggestion" width={columns} />']
      : ['const usableColumns = columns - 2 * 2'],
  )
  assertFragments('buddy/CompanionSprite.tsx', [
    "if (!feature('BUDDY')) return null",
    'if (!companion || getGlobalConfig().companionMuted) return null',
    'if (columns < MIN_COLS_FOR_FULL_SPRITE)',
  ])
})

test('2.1.91 source owns the complete public-owner and hydration control graph', {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}, () => {
  assertFragments('ink.ts', [
    "export { default as useFocus } from './ink/hooks/use-focus.js'",
  ])
  assertFragments('bridge/trustedDevice.ts', [
    'export function isTrustedDeviceGateEnabled()',
  ])
  const agent = assertFragments('tools/AgentTool/runAgent.ts', [
    "replHydration?: ToolUseContext['replHydration']",
  ])
  if (semanticCase === caseName) {
    const create = agent.indexOf(
      'const agentToolUseContext = createSubagentContext(toolUseContext,',
    )
    const guard = agent.indexOf('if (override?.replHydration)', create)
    const assign = agent.indexOf(
      'agentToolUseContext.replHydration = override.replHydration',
      guard,
    )
    assert.ok(create >= 0 && guard > create && assign > guard)
  } else {
    assert.ok(agent.includes('replHydration: override?.replHydration'))
  }

  assertFragments('tools/BriefTool/upload.ts', [
    'export function escapeContentDispositionFilename',
    ".replace(/[\\r\\n]/g, '')",
    ".replace(/\\\\/g, '\\\\\\\\')",
    String.raw`.replace(/"/g, '\\"')`,
    'filename="${escapeContentDispositionFilename(filename)}"',
  ])
  assertFragments('commands/feedback/feedback.tsx', [
    'export function getFeedbackUnavailableReason()',
  ])
  assertFragments('hooks/useSearchInput.ts', [
    'onSpaceOnEmpty?: () => void',
    "onSpaceOnEmpty && e.key === ' '",
    'onSpaceOnEmpty()',
  ])
  const input = assertFragments('utils/processUserInput/processUserInput.ts', [
    "const { processSlashCommand } = await import('./processSlashCommand.js')",
    'const slashResult = await processSlashCommand(',
  ])
  assert.ok(input.indexOf('processSlashCommand(') < input.lastIndexOf('processSlashCommand('))

  const claudeApi = source('skills/bundled/claudeApi.ts')
  if (semanticCase === caseName) {
    for (const fragment of [
      'SHARED_PREFIX: string',
      'hasDocsForLang: (lang: DetectedLanguage) => boolean',
      'if (extension && path.startsWith(extension.SHARED_PREFIX))',
      'return extension.hasDocsForLang(lang)',
      'const files = { ...content.SKILL_FILES, ...extension?.FILES }',
      "extension?.SECTION ?? ''",
      'buildPrompt(lang, args, content, null)',
    ]) {
      assert.ok(claudeApi.includes(fragment), fragment)
    }
  } else {
    assert.ok(claudeApi.includes("path.startsWith('shared/')"))
    assert.ok(claudeApi.includes('shared/managed-agents-overview.md'))
  }
})

test('2.1.91 source owns focus observation, UTC streaks, safe permissions, and guarded teammate keys', {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}, () => {
  const focus = assertFragments('ink/focus.ts', [
    'private listeners = new Set<() => void>()',
    'subscribe = (listener: () => void): (() => void) =>',
    'private notify(): void',
    'this.dispatchFocusEvent(node, new FocusEvent(\'focus\', previous))',
    'this.notify()',
  ])
  assert.ok(
    focus.indexOf("this.dispatchFocusEvent(node, new FocusEvent('focus', previous))") <
      focus.indexOf('this.notify()', focus.indexOf("this.dispatchFocusEvent(node, new FocusEvent('focus', previous))")),
  )
  assertFragments('ink/hooks/use-focus.ts', [
    'useSyncExternalStore(',
    'focusManager?.subscribe ?? noopSubscribe',
    'focusNext: () =>',
    'focusManager.focusNext(rootNode)',
    'focusPrevious: () =>',
    'focusManager.focusPrevious(rootNode)',
  ])

  const stats = assertFragments('utils/stats.ts', [
    'date.setUTCDate(date.getUTCDate() + 1)',
    'date.setUTCDate(date.getUTCDate() - 1)',
    'let checkDate = getTodayDateString()',
    'while (activeDates.has(checkDate))',
    'checkDate = getPreviousDay(checkDate)',
  ])
  assert.ok(stats.indexOf('let checkDate = getTodayDateString()') < stats.indexOf('while (activeDates.has(checkDate))'))

  const permission = assertFragments(
    'components/permissions/FallbackPermissionRequest.tsx',
    [
      'const decisionReason = toolUseConfirm.permissionResult.decisionReason',
      'decisionReason?.type === "safetyCheck"',
      '!decisionReason.classifierApprovable',
      'showAlwaysAllowOptions && !classifierDisallowsPersistence',
    ],
  )
  assert.ok(permission.indexOf('classifierDisallowsPersistence') < permission.indexOf('showAlwaysAllowOptions && !classifierDisallowsPersistence'))

  const navigation = assertFragments('hooks/useBackgroundTaskNavigation.ts', [
    "e.key === 'f' &&",
    '!e.ctrl &&',
    '!e.meta &&',
    "e.key === 'k' &&",
  ])
  const fGuard = navigation.indexOf("e.key === 'f' &&")
  const kGuard = navigation.indexOf("e.key === 'k' &&")
  assert.ok(navigation.indexOf('!e.ctrl &&', fGuard) < navigation.indexOf("viewSelectionMode === 'selecting-agent'", fGuard))
  assert.ok(navigation.indexOf('!e.meta &&', kGuard) < navigation.indexOf("viewSelectionMode === 'selecting-agent'", kGuard))
})

test('2.1.91 source owns plugin and agent observable output while peer origin is a target no-op', {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}, () => {
  assertFragments('cli/handlers/plugins.ts', [
    'name: marketplaceName,',
    'data: marketplace,',
    'for (const entry of marketplace.plugins)',
  ])
  assertFragments('cli/handlers/agents.ts', [
    'for (const { label, source } of AGENT_SOURCE_GROUPS)',
    'lines.push(`${label}:`)',
    '.filter(a => a.source === source)',
  ])
  // Target unit 18190 initializes the candidate peer origin to undefined
  // immediately before its conditional spread. It cannot affect runtime output,
  // so source correctly has no fabricated peer owner for this occurrence.
})
