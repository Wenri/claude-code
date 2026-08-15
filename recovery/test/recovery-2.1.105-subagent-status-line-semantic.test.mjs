import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const semanticSourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
const sourceTestOptions = {
  skip:
    semanticCase && semanticCase !== '2.1.104-to-2.1.105'
      ? `not applicable to ${semanticCase}`
      : false,
}

function source(relative) {
  const filename =
    semanticSourceRoot && relative.startsWith('src/')
      ? path.join(semanticSourceRoot, relative.slice('src/'.length))
      : path.join(repositoryRoot, relative)
  return fs.readFileSync(filename, 'utf8')
}

function assertFragments(relative, fragments) {
  const text = source(relative)
  for (const fragment of fragments) {
    assert.ok(text.includes(fragment), `${relative}: ${fragment}`)
  }
  return text
}

test('2.1.105 source owns the complete subagentStatusLine execution protocol', sourceTestOptions, () => {
  assertFragments('src/utils/subagentStatusLine.ts', [
    'SUBAGENT_STATUS_LINE_TIMEOUT_MS = 5_000',
    'MAX_SUBAGENT_TOKEN_SAMPLES = 16',
    'shouldDisableAllHooksIncludingManaged()',
    'shouldSkipHookDueToTrust()',
    "getSettingsForSource('policySettings')?.subagentStatusLine",
    '...createBaseHookInput()',
    'tokenSamples: tokenSamples.get(task.id) ?? []',
    'CLAUDE_PROJECT_DIR',
    'timeout: SUBAGENT_STATUS_LINE_TIMEOUT_MS',
    "for (const line of result.stdout.split('\\n'))",
    'TaskDecorationOutputSchema.safeParse(parsed)',
  ])

  assertFragments('src/hooks/useSubagentStatusLine.ts', [
    'SUBAGENT_STATUS_LINE_INITIAL_DELAY_MS = 300',
    'SUBAGENT_STATUS_LINE_POLL_INTERVAL_MS = 5_000',
    'if (runningRef.current) return',
    'Math.max(0, columns - SUBAGENT_STATUS_LINE_COLUMN_RESERVE)',
    'if (taskIds.has(id)) currentDecorations[id] = decoration',
    'taskDecorationsEqual(',
  ])
})

test('2.1.105 source owns decoration-aware visibility and stable selection', sourceTestOptions, () => {
  assertFragments('src/components/CoordinatorAgentStatus.tsx', [
    'getDecoratedVisibleAgentTasks',
    "taskDecorations[task.id]?.content !== ''",
  ])
  assertFragments('src/components/PromptInput/PromptInput.tsx', [
    'preserveDecoratedTaskSelection',
    'const previousIds = previousDecoratedTaskIdsRef.current',
    'getDecoratedVisibleAgentTasks(tasks, taskDecorations)',
  ])
  const footer = assertFragments(
    'src/components/PromptInput/PromptInputFooterLeftSide.tsx',
    ['useSubagentStatusLine();', 'if (exitMessage.show)'],
  )
  assert.ok(
    footer.indexOf('useSubagentStatusLine();') <
      footer.indexOf('if (exitMessage.show)'),
    'polling hook must execute before every footer early return',
  )
  assertFragments('src/state/AppStateStore.ts', [
    'taskDecorations: Record<string, { content: string }>',
    'taskDecorations: {},',
  ])
  assertFragments('src/utils/settings/types.ts', [
    'subagentStatusLine: z',
    "type: z.literal('command')",
  ])
})

test('2.1.105 source owns the interactive recap command', sourceTestOptions, () => {
  assertFragments('src/commands/recap.ts', [
    'generateAwaySummary(context.abortController.signal)',
    "value: 'Recap cancelled.'",
    'No recap available — needs at least one completed turn, or generation failed.',
    "name: 'recap'",
    "getFeatureValue_CACHED_MAY_BE_STALE('tengu_sedge_lantern', false)",
    'supportsNonInteractive: false',
  ])
  assertFragments('src/commands.ts', [
    "import recap from './commands/recap.js'",
    '  recap,',
  ])
})

const targetBundle = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const baselineBundle = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const latestBundle = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const targetUnits = [
  [8823, 5961365, 5963456, '9afa63e6046e2b8f347cbbd8d49b4c88a44af8036a39d555b739b95415318db5'],
  [16088, 11592960, 11593260, '82339c21b3fc67b238d16b11408bd75872b7f692b9c8b474e6053a34040291c0'],
  [16089, 11593260, 11593486, 'f47b68a671d48bc2744b7b532eeecf2dd524d75eaf82e5145b0905806a08f7d5'],
  [17558, 12381993, 12382199, 'cdccd65b16c00e35ffed644b694b8f195e1d6a5d8ed4706361d821414304c4c5'],
  [17559, 12382199, 12382546, '845bb7b2071bd1034f706e02b4b91684a4f0fed10f5f2836fe9fa6c343a6f62c'],
  [17560, 12382546, 12382682, 'ca878111e70f5c78f8ed4e38435040975d3fca1e3f8760de6785705471e60fba'],
  [17561, 12382682, 12383739, 'd1e78f2ddc11f88801624939932b4c2cb187337c069bee9e37bb0e5567a02bfe'],
  [17562, 12383739, 12383769, '5c0dd7dabd5eb3774b2aa5a718a58ceb89934c798db9e7b15e4b8aaa6a4be8a2'],
  [17563, 12383769, 12383909, '1a3c9cf9e08ac122d7684512a80cc0ebf0d51293d42aa0f662fb440ecc1f210e'],
  [17565, 12384024, 12384091, 'a9befb51c0bb66833380a54b88411357bd6d34197e076706a7ee73e3314a8c60'],
  [17566, 12384091, 12384222, 'dd066c589b0ba9acceca798b3e94c9c79b847e9de56e3a63c4dd7c8497e95d22'],
  [17567, 12384222, 12384276, '81b54003a14099c686626055b8d200505d9bbf9246028a939bf2f8f53c681765'],
  [17568, 12384276, 12384317, 'a7e659f2e1cc5ad8e4c48d89e4b5af1a37a8c191962d30a10805b8e3658b91ee'],
  [17693, 12430118, 12430272, '8adb42397693e1b83760f50dcbe2359760dfe2e40fb383b56248e45600af0df2'],
  [17694, 12430272, 12431381, '1a39c69dc613f6c81a4e89ee79a618434621dba38c25f5a3b6302b3127acaaa5'],
  [17695, 12431381, 12431406, '0fca5892f883a56e04c22e5de151a49d0703fb701be0b1b6afc49692c46bbdbb'],
  [17696, 12431406, 12431465, '9a83e6939886f962d8c610a11f81b5c018b0c4ee2669859a162bda68b5a4d26c'],
  [17709, 12434664, 12436192, 'f1d84016847f381385d54aee4572b2ea7d3b6e3ed4c2d7dd07544dd2d20a8ee9'],
  [17710, 12436192, 12440680, 'b488670b6b5cc51fd1b9f8f1cdc73de36a1e0b26fefb4b230e412a4e4d464af7'],
  [17764, 12452543, 12478730, '6935edc4a3c2f8e545731f0fe56d45ca43049966ad20aea36d7f8eee202ac555'],
  [18109, 12614618, 12616945, 'c3c6199a7124d04e413788b5e9b3c28d793db6a6ad9213b5f36a451789265071'],
  [19107, 13549399, 13604560, '9a4b0aee2b5e06161abe44cd8f91c64a7333e23a736e273ce8851e9dcf8e3725'],
]

test(
  '2.1.105 authenticated target pins every subagentStatusLine runtime unit',
  { skip: targetBundle ? false : 'CLAUDE_CODE_2_1_105_BUNDLE not provided' },
  () => {
    const bundle = fs.readFileSync(targetBundle, 'utf8')
    assert.equal(
      crypto.createHash('sha256').update(bundle).digest('hex'),
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    )
    for (const [index, start, end, expectedHash] of targetUnits) {
      const unit = bundle.slice(start, end)
      assert.equal(
        crypto.createHash('sha256').update(unit).digest('hex'),
        expectedHash,
        `target structural unit ${index}`,
      )
      assert.equal(
        parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
        1,
        `target structural unit ${index} must remain a standalone AST statement`,
      )
    }
  },
)

test(
  'recap is introduced at 2.1.105 and remains exact in target116',
  {
    skip:
      baselineBundle && targetBundle && latestBundle
        ? false
        : '2.1.104, 2.1.105, and 2.1.116 bundles are required',
  },
  () => {
    const baseline = fs.readFileSync(baselineBundle, 'utf8')
    const target = fs.readFileSync(targetBundle, 'utf8')
    const latest = fs
      .readFileSync(latestBundle, 'utf8')
      .replaceAll('\\u2014', '—')
    const fragments = [
      'Recap cancelled.',
      'No recap available — needs at least one completed turn, or generation failed.',
      'name:"recap"',
    ]
    for (const fragment of fragments) {
      assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
      assert.equal(target.includes(fragment), true, `${fragment}: target105`)
      assert.equal(latest.includes(fragment), true, `${fragment}: target116`)
    }
    assert.ok(target.includes('tengu_sedge_lantern'))
    assert.ok(latest.includes('tengu_sedge_lantern'))
  },
)
