import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.91-to-2.1.92'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_92_BUNDLE
const targetSha256 =
  '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362'
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

const pins = new Map([
  [8341, ['unresolved', 6752092, 6765307, 'dc38b3c845ce2180db2b2bab79f44caebcdd50e33c39acef7c547cc69ba89b5e']],
  [8347, ['unresolved', 6766618, 6766814, 'c6feee2d2d66e7fed9e9e76952de5c96754fdb94ff1950cc07532c22f350a3a2']],
  [8392, ['unresolved', 6777402, 6778532, '2cf0f0f51bab6e88346b124941d6250e94a486adeb3af909646f1bfc35cfba9a']],
])

test('2.1.92 pins OAuth offline access and both MCP-output instruction paths', {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_92_BUNDLE is not set'
      : false,
}, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), targetSha256)
  const bundle = bytes.toString('utf8')
  for (const [index, [classification, start, end, sourceHash]] of pins) {
    const region = structural.regions[index]
    assert.equal(region.classification, classification, `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
  }
  for (const fragment of [
    'Appended offline_access to authorization scope',
    'scopes_supported?.includes("offline_access")',
    'MCP_TRUNCATION_PROMPT_OVERRIDE',
    'tengu_mcp_subagent_prompt',
    'For targeted queries (find a row, filter by field)',
    'Require it to read the entire file in chunks before answering.',
  ]) {
    assert.ok(bundle.includes(fragment), fragment)
  }
})

test('materialized target92 source owns OAuth and MCP-output branches exactly', {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}, () => {
  const auth = fs.readFileSync(path.join(sourceRoot, 'services/mcp/auth.ts'), 'utf8')
  for (const fragment of [
    'appendOfflineAccessIfSupported(',
    "scope.split(' ').includes('offline_access')",
    "metadata?.scopes_supported?.includes('offline_access')",
    "'Appended offline_access to authorization scope'",
  ]) {
    assert.ok(auth.includes(fragment), fragment)
  }
  const output = fs.readFileSync(
    path.join(sourceRoot, 'utils/mcpOutputStorage.ts'),
    'utf8',
  )
  const historicalFragments = [
    "override === 'subagent'",
    "override === 'legacy'",
    'For targeted queries (find a row, filter by field)',
    'use the ${AGENT_TOOL_NAME} tool to process the file in an isolated context',
    'Require it to read the entire file in chunks before answering.',
  ]
  const currentFragments = [
    "override !== 'legacy'",
    'For targeted queries (find a value, filter by field)',
    'first probe the structure',
    'If the ${AGENT_TOOL_NAME} tool is available',
  ]
  for (const fragment of [
    'MCP_TRUNCATION_PROMPT_OVERRIDE',
    "'tengu_mcp_subagent_prompt'",
    ...(semanticCase === caseName ? historicalFragments : currentFragments),
  ]) {
    assert.ok(output.includes(fragment), fragment)
  }
})
