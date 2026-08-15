import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

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
    11919,
    [
      9065424,
      9076309,
      '8181e7962dc4546059f77ff2b7521064a6edc223ea77c89ef7783f051f60e7c8',
      'FunctionDeclaration',
    ],
  ],
  [
    11924,
    [
      9076630,
      9094353,
      '2bdcd72cf75ee2bc7a1e6ba45d44e30a71da1163f5f522a446b31c71a11a65da',
      'VariableDeclaration',
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

test('target101 pins the fork prompt and background-result structural owners', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath)
  const target = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baseline),
    'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be',
  )
  assert.equal(
    sha256(target),
    'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
  )
  const targetText = target.toString('utf8')
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
    assert.equal(sha256(targetText.slice(start, end)), hash, `${index}: bytes`)
  }
})

test('the no-reread contract and progress events enter at target101', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  const oldPrompt =
    'do not Read or tail it unless the user explicitly asks for a progress check.'
  const prompt = 'do not Read or tail it. You get a completion notification; trust it.'
  const asyncResult =
    "tail this file — it is the full sub-agent JSONL transcript and reading it will overflow your context. If the user asks for progress, say the agent is still running; you'll get a completion notification."
  assert.equal(baseline.includes(oldPrompt), true)
  assert.equal(target.includes(oldPrompt), false)
  for (const fragment of [prompt, asyncResult, 'background_hint', 'emitToolProgress']) {
    assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
    assert.equal(target.includes(fragment), true, `${fragment}: target`)
  }
})

test('source owns the reachable prompt, progress, clear, and async-result behavior', sourceOptions, () => {
  const prompt = source('tools/AgentTool/prompt.ts')
  assert.ok(
    prompt.includes(
      '**Don\'t peek.** The tool result includes an \\`output_file\\` path — do not Read or tail it. You get a completion notification; trust it.',
    ),
  )
  assert.equal(
    prompt.includes('unless the user explicitly asks for a progress check'),
    false,
  )

  const tool = source('tools/AgentTool/AgentTool.tsx')
  for (const fragment of [
    "kind: 'background_hint'",
    "kind: 'clear'",
    'toolUseContext.emitToolProgress?.({',
    'Do NOT ${FILE_READ_TOOL_NAME} or ${BASH_TOOL_NAME} tail this file — it is the full sub-agent JSONL transcript and reading it will overflow your context.',
    "If the user asks for progress, say the agent is still running; you'll get a completion notification.",
  ]) {
    assert.ok(tool.includes(fragment), fragment)
  }
  assert.ok(
    tool.indexOf("kind: 'background_hint'") <
      tool.indexOf("kind: 'clear'"),
  )
})
