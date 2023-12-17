import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.92-to-2.1.94'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const historical = semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_92_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_94_BUNDLE
const latestBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE

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
  [14695, [10980368, 10980412, '49ec56311981c42812c09c94bc5a892c3e0aef6918c06f80ebffb621290dae56']],
  [14696, [10980412, 10980662, '1e4bc81d1ad2ab0964afcbecc2cffbc5a570daf36dea12e8849ca55169be915a']],
  [14697, [10980662, 10981274, 'c2b1f62d9bee1d2b62a76e70c3897912fe1252d59a025fd2701f7181c1b42720']],
  [14698, [10981274, 10981667, 'e08ba259a22aeb09fcf658d55d51843c9e99b55247cf28cb2eec34c37886bd58']],
  [14699, [10981667, 10981864, '9b6795e630c9cb4500dd7dae884509b81989cb1180c9a07574cd5ea6bb2f4fbe']],
  [14700, [10981864, 10983408, 'e579b5c0808024f05fe6967d25abdbe7b58f77323bca8455998fd7fe9f9ae077']],
  [14701, [10983408, 10984132, '9e9d62554b3ae6f92686b09a1296f808439d7c8c6ab10f9cac2cd41b9b124879']],
])

const prompt = `You are searching for past Claude Code conversation sessions on behalf of the user.

Session transcripts are stored as .jsonl files under the projects directory. Each line is a JSON message; user and assistant messages contain a "content" field with the conversation text. The filename (without .jsonl) is the session ID.

You have Grep and Read tools. Use Grep with files_with_matches mode to scan transcript content efficiently before reading individual files.

When you have identified the matching sessions, end with ONLY a JSON object on its own line:
{"session_ids": ["<uuid>", ...]}

Return session IDs ordered by relevance (most relevant first). Return an empty array if nothing matches.`

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function assertFragments(contents, fragments) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), fragment)
  }
}

test(
  '2.1.94 pins the complete seven-unit agentic session-search graph',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetBundlePath
        ? 'CLAUDE_CODE_2_1_94_BUNDLE is not set'
        : false,
  },
  () => {
    const targetBytes = fs.readFileSync(targetBundlePath)
    assert.equal(
      sha256(targetBytes),
      '11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564',
    )
    const target = targetBytes.toString('utf8')
    for (const [index, [start, end, sourceHash]] of pinnedUnits) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: classification`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, sourceHash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), sourceHash, `${index}: bytes`)
    }

    if (baselineBundlePath) {
      const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
      assert.equal(
        sha256(baseline),
        '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362',
      )
      assert.equal(baseline.includes(prompt), false)
      assert.equal(baseline.includes('session_search_out_of_scope'), false)
    }
  },
)

test(
  '2.1.94 bundle exposes the constrained Grep/Read loop and exact result protocol',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetBundlePath
        ? 'CLAUDE_CODE_2_1_94_BUNDLE is not set'
        : false,
  },
  () => {
    const target = fs.readFileSync(targetBundlePath, 'utf8')
    assertFragments(target, [
      prompt,
      'session_search_out_of_scope',
      ' is outside the session transcript directories',
      'Search ONLY these transcript directories (other paths are out of scope):',
      'Recent sessions (id title metadata) — partial list, the match may not be here:',
      'querySource:"session_search"',
      'maxTurns:CCY',
      '/"session_ids"\\s*:\\s*(\\[[^\\]]*\\])/g',
      'Agentic search: no session_ids array in final response',
      'Agentic search found ',
    ])
  },
)

test(
  'source owns the target search prompt, directory jail, isolated context, and abort-safe query loop',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const owner = source('src/utils/agenticSessionSearch.ts')
    assert.ok(owner.includes(prompt), 'exact target search prompt')
    assertFragments(owner, [
      'const MAX_TURNS = 20',
      'const MAX_SESSION_SUMMARIES = 50',
      'const SESSION_SEARCH_TOOLS: Tools = [GrepTool, FileReadTool]',
      "source: 'session' as const",
      'additionalWorkingDirectories',
      "reason: 'session_search_out_of_scope'",
      'decision.behavior === \'ask\'',
      'resolvedPath.startsWith(directory + sep)',
      'Search ONLY these transcript directories (other paths are out of scope):',
      'signal?.addEventListener(\'abort\', abort)',
      'signal?.removeEventListener(\'abort\', abort)',
      "querySource: 'session_search'",
      'maxTurns: MAX_TURNS',
      'event.type === \'stream_event\' || event.type === \'stream_request_start\'',
      '/"session_ids"\\s*:\\s*(\\[[^\\]]*\\])/g',
      'getSessionIdFromLog(log)',
    ])

    if (historical) {
      assert.equal(owner.includes('getToolPermissionContext:'), false)
      assert.equal(owner.includes('taskRegistry,'), false)
      assertFragments(owner, [
        'setResponseLength: () => {}',
        'updateFileHistoryState: () => {}',
        'updateAttributionState: () => {}',
      ])
    } else {
      assertFragments(owner, [
        'getToolPermissionContext: () => appState.toolPermissionContext',
        'getEffortValue: () => appState.effortValue',
        'getAutoCompactWindow: () => appState.autoCompactWindow',
        'getFastMode: () => appState.fastMode',
        'getCacheBreakerPhrase: () => appState.cacheBreakerPhrase',
        'taskRegistry: NOOP_TASK_REGISTRY',
        'sessionHooksRegistry,',
        'agentLifecycle,',
        'teammateColors,',
        'addResponseLength: () => {}',
        'resetResponseLength: () => {}',
        'applyFileHistoryOp: () => {}',
        'applyAttributionOp: () => {}',
      ])
    }
  },
)

test(
  'the target116 bundle retains the same observable session-search protocol',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !latestBundlePath
        ? 'CLAUDE_CODE_2_1_116_BUNDLE is not set'
        : false,
  },
  () => {
    const latest = fs.readFileSync(latestBundlePath, 'utf8')
    assert.equal(
      sha256(latest),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    assertFragments(latest, [
      prompt,
      'session_search_out_of_scope',
      'Search ONLY these transcript directories (other paths are out of scope):',
      'Agentic search: no session_ids array in final response',
    ])
  },
)
