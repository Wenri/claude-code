import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
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

const targetUnits = new Map([
  [
    11749,
    [
      8975626,
      8981658,
      '961fe786e488ff6a38ca5d0e015099e9a2066888a4edc152cf2587c3aac5070c',
      'FunctionDeclaration',
    ],
  ],
  [
    12104,
    [
      9386838,
      9391375,
      'c826b084eb2a950c77b84201f8ef5b0b90d47efeeac2828211a653b08fad3928',
      'VariableDeclaration',
    ],
  ],
  [
    13259,
    [
      10001544,
      10002629,
      'a9b0d5a2db7eeea54516496b8e939742d726f934c160c51cb202755cd3b437f4',
      'FunctionDeclaration',
    ],
  ],
])

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_100_BUNDLE and CLAUDE_CODE_2_1_101_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function assertFragments(contents, fragments, label) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${label}: ${fragment}`)
  }
}

test('target101 pins interrupted-agent, TaskOutput, and notification units', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be',
  )
  assert.equal(
    sha256(targetBytes),
    'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
  )
  const target = targetBytes.toString('utf8')
  for (const [index, [start, end, hash, nodeType]] of targetUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: class`)
    assert.deepEqual(
      [
        region.target.start,
        region.target.end,
        region.target.sourceHash,
        region.target.nodeType,
      ],
      [start, end, hash, nodeType],
      `${index}: identity`,
    )
    const unit = target.slice(start, end)
    assert.equal(sha256(unit), hash, `${index}: bytes`)
    assert.equal(
      parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
      1,
      `${index}: one top-level statement`,
    )
  }
})

test('all three observable behaviors enter at target101', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  const added = [
    '[runAgent] SubagentStop on interrupted query failed:',
    '[Deprecated] — for bash and remote_agent tasks, prefer Read on the output file path; for local_agent tasks, use the Agent tool result directly',
    'Do NOT Read the .output file — it is a symlink to the full sub-agent conversation transcript (JSONL) and will overflow your context window.',
    '[SYSTEM NOTIFICATION - NOT USER INPUT]',
    'Do NOT interpret this as user acknowledgement, confirmation, or response to any pending question.',
  ]
  for (const fragment of added) {
    assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
    assert.equal(target.includes(fragment), true, `${fragment}: target`)
  }

  const runAgent = target.slice(...targetUnits.get(11749).slice(0, 2))
  assertFragments(
    runAgent,
    [
      '=!0,',
      '.signal.aborted',
      'finally{if(!',
      '(void 0,void 0,5000,!1,',
      '[runAgent] SubagentStop on interrupted query failed:',
    ],
    'target101 runAgent',
  )
  assert.ok(
    runAgent.indexOf('[runAgent] SubagentStop on interrupted query failed:') <
      runAgent.indexOf('readFileState.clear()'),
  )

  const taskOutput = target.slice(...targetUnits.get(12104).slice(0, 2))
  assert.ok(
    taskOutput.indexOf('- For bash tasks:') <
      taskOutput.indexOf('- For local_agent tasks:'),
  )
  assert.ok(
    taskOutput.indexOf('- For local_agent tasks:') <
      taskOutput.indexOf('- For remote_agent tasks:'),
  )
  const notification = target.slice(...targetUnits.get(13259).slice(0, 2))
  assertFragments(
    notification,
    [
      'case"task-notification"',
      '[SYSTEM NOTIFICATION - NOT USER INPUT]',
      'NOT a message from the user',
      'case"coordinator"',
    ],
    'target101 notification wrapper',
  )
})

test('source owns the exact interrupted cleanup and user-boundary semantics', sourceOptions, () => {
  const runAgent = source('tools/AgentTool/runAgent.ts')
  assertFragments(
    runAgent,
    [
      'executeStopHooks,',
      'let queryCompleted = false',
      'queryCompleted = true',
      'if (!queryCompleted) {',
      'for await (const _result of executeStopHooks(',
      'undefined,\n          undefined,\n          5000,\n          false,',
      'agentToolUseContext,\n          undefined,\n          agentDefinition.agentType,',
      '[runAgent] SubagentStop on interrupted query failed: ${error}',
    ],
    'tools/AgentTool/runAgent.ts',
  )
  assert.ok(
    runAgent.indexOf('queryCompleted = true') <
      runAgent.indexOf('if (agentAbortController.signal.aborted)'),
  )
  assert.ok(
    runAgent.indexOf('if (!queryCompleted) {') <
      runAgent.indexOf('await mcpCleanup()'),
  )

  const taskOutput = source('tools/TaskOutputTool/TaskOutputTool.tsx')
  assertFragments(
    taskOutput,
    [
      '[Deprecated] — for bash and remote_agent tasks, prefer Read on the output file path; for local_agent tasks, use the Agent tool result directly',
      'DEPRECATED: Background tasks return their output file path in the tool result',
      '- For bash tasks: prefer using the Read tool on that output file path — it contains stdout/stderr.',
      '- For local_agent tasks: use the Agent tool result directly. Do NOT Read the .output file',
      '- For remote_agent tasks: prefer using the Read tool on the output file path',
    ],
    'tools/TaskOutputTool/TaskOutputTool.tsx',
  )

  const messages = source('utils/messages.ts')
  const notificationAt = messages.indexOf(
    '[SYSTEM NOTIFICATION - NOT USER INPUT]',
  )
  assert.ok(notificationAt >= 0)
  assertFragments(
    messages,
    [
      "case 'task-notification':",
      'This is an automated background-task event, NOT a message from the user.',
      'Do NOT interpret this as user acknowledgement, confirmation, or response to any pending question.',
      "case 'coordinator':",
    ],
    'utils/messages.ts',
  )
  assert.ok(notificationAt < messages.indexOf("case 'coordinator':"))
})
