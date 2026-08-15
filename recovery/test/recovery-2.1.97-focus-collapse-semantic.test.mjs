import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.96-to-2.1.97'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_97_BUNDLE is not set'
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

const pinnedUnits = new Map([
  [
    9664,
    [
      7320291,
      7320442,
      'a55874ba15f080a3fb5ec55747ce519caf46d114a1cf44626618c22764ea793c',
    ],
  ],
  [
    9665,
    [
      7320442,
      7321878,
      '7257ee87bbf4497e7aadc613d398e110ce411abb805aa9a390b807fcdd3a7e88',
    ],
  ],
  [
    9666,
    [
      7321878,
      7323201,
      '5addf72019a731a9c3f7179eeb7529f311a48193b5f1b1ce65e7cda42611f4f6',
    ],
  ],
  [
    9667,
    [
      7323201,
      7323758,
      '3273f1f41e101bee552fd8be7d452cd1ddf6e5093848f44535b86028ffcb90a1',
    ],
  ],
  [
    11466,
    [
      8838322,
      8846668,
      'dd269bbb877ef309ea7b29fc50e9002e2698349217c82c97ba3b1ef3b514fb0d',
    ],
  ],
  [
    17271,
    [
      12224845,
      12226890,
      'e7b0e99519d0a1c7afdafa19ad52d1c20676964b8d91cc3bfc8ee3604f08fb28',
    ],
  ],
])

test('target97 pins the complete focus reducer and collapsed renderer units', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(bytes),
    '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988',
  )
  const bundle = bytes.toString('utf8')
  for (const [index, identity] of pinnedUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
      `${index}: structural identity`,
    )
    assert.equal(
      sha256(bundle.slice(region.target.start, region.target.end)),
      region.target.sourceHash,
      `${index}: bytes`,
    )
  }
  for (const fragment of [
    'uuid=`brief-${J.uuid}`',
    'W?.toolStats??',
    'W?.status==="async_launched"',
    'if(K===W4||K===hL)return O',
    'O.editFileCount=A',
    'key:"comma-other"',
    'O?"Editing":"Edited"',
    'O?z6?"Querying":"querying":z6?"Queried":"queried"',
    'A6&&O6&&dA.createElement(T,{dimColor:!0},"Focus")',
  ]) {
    assert.ok(bundle.includes(fragment), fragment)
  }
})

test('source reconstructs focus turn reduction, nested tool stats, and edit accounting', sourceOptions, () => {
  const messages = assertFragments('components/Messages.tsx', [
    'function isFocusTurnStart(',
    'function createFocusToolSummary(',
    'function mergeFocusToolSummary(',
    'export function filterForFocusView(',
    "toolName === 'Agent' || toolName === 'Task'",
    "new Set(['Edit', 'Write', 'NotebookEdit'])",
    'getFocusEditStats(',
    "result?.status === 'async_launched'",
    'getAgentToolStats?.(result.agentId)',
    "summary.uuid = `brief-${summary.uuid}`",
    'task.result?.toolStats',
  ])
  const summaryInsertion = Math.max(
    messages.indexOf('filtered.push(summary)'),
    messages.indexOf('ordered.push([summaryIndex, summary])'),
  )
  assert.ok(
    summaryInsertion >= 0 &&
      messages.indexOf("summary.uuid = `brief-${summary.uuid}`") <
        summaryInsertion,
    'focus summary receives its stable brief UUID before insertion',
  )

  assertFragments('components/messages/CollapsedReadSearchContent.tsx', [
    'const otherToolCount = message.otherToolCount ?? 0',
    'const editFileCount = message.editFileCount ?? 0',
    "const editVerb = isActiveGroup ? 'Editing' : 'Edited'",
    '<Text key="comma-other">, </Text>',
    "otherToolCount === 1 ? 'tool' : 'tools'",
    'message.pendingText',
  ])

  assertFragments('state/AppStateStore.ts', [
    'briefTranscript: boolean',
    'briefTranscript: false',
  ])
  assertFragments('main.tsx', [
    'briefTranscript:',
    'getGlobalConfig().briefTranscript ?? false',
  ])

  if (path.resolve(sourceRoot) !== path.resolve(repositoryRoot, 'src')) {
    assertFragments('components/PromptInput/PromptInputFooter.tsx', [
      'const briefTranscript = useAppState(s => s.briefTranscript)',
      'isFullscreen && briefTranscript && <Text dimColor>Focus</Text>',
    ])
  }
})

test('latest source retains the target116 focus-view evolutions', sourceOptions, () => {
  if (path.resolve(sourceRoot) !== path.resolve(repositoryRoot, 'src')) return
  assertFragments('components/Messages.tsx', [
    'function isFocusQueuedPrompt(',
    "attachment.origin?.kind === 'channel'",
    'function isFocusTrailingStatus(',
    "'frameCount'",
    "message.attachment?.type === 'relevant_memories'",
    "memory.path.startsWith('<synthesis:')",
  ])
  assertFragments('components/messages/CollapsedReadSearchContent.tsx', [
    'const frameCount = message.frameCount ?? 0',
    "isFirst_3 ? 'Calling' : 'calling'",
    "isFirst_3 ? 'Called' : 'called'",
  ])
})
