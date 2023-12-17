import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.107-to-2.1.108'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_107_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_108_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_107_BUNDLE and CLAUDE_CODE_2_1_108_BUNDLE are required'
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

const units = new Map([
  [12101, [9170367, 9170398, 'FunctionDeclaration', '83393349fe7c74d0d0e0bde5b71fce84e45385352f0b5fb8cf5c9dc7a3c2c829']],
  [12103, [9170687, 9171363, 'FunctionDeclaration', '69290be457210a50bc6b5ec639dc61aab5b6d5d816768825c6f0726e1f3e532d']],
  [12105, [9171523, 9171546, 'VariableDeclaration', '624d931ce7d0321a1cf48da9d4e0ad43ba4d0a106924f0e855d220a2f81672b3']],
  [12106, [9171546, 9171612, 'VariableDeclaration', '6a00b10d88d0b817f64ec70e865fd0c1f9f6e884259030d745c8a7684c080529']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function assertFragments(contents, fragments, owner) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${owner}: ${fragment}`)
  }
}

function functionBody(contents, name) {
  const start = contents.indexOf(`export function ${name}(`)
  assert.notEqual(start, -1, `${name}: declaration`)
  const bodyStart = contents.indexOf('{', start)
  let depth = 0
  for (let index = bodyStart; index < contents.length; index += 1) {
    if (contents[index] === '{') depth += 1
    else if (contents[index] === '}') {
      depth -= 1
      if (depth === 0) return contents.slice(start, index + 1)
    }
  }
  assert.fail(`${name}: unterminated body`)
}

test('target108 authenticates every changed dedup unit and reachable call site', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(
    sha256(baselineBytes),
    '6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844',
  )
  assert.equal(
    sha256(targetBytes),
    'dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73',
  )
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')
  assert.ok(baseline.includes('tengu_tool_result_dedup'))
  assert.ok(baseline.includes('let O=Math.min(z,cS8);if(A>=O)return q'))
  assert.equal(baseline.includes('A+N2Y>O'), false)

  for (const [index, identity] of units) {
    const region = structural.regions[index]
    assert.notEqual(region.classification, 'matched', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.nodeType, region.target.sourceHash],
      identity,
      `${index}: structural identity`,
    )
    assert.equal(
      sha256(target.slice(identity[0], identity[1])),
      identity[3],
      `${index}: bytes`,
    )
  }

  const applyUnit = target.slice(units.get(12103)[0], units.get(12103)[1])
  assertFragments(applyUnit, [
    'tengu_onyx_basin_m1k',
    'q.is_error',
    'typeof Y!=="string"',
    'A<=V2Y',
    'A+N2Y>O',
    '<identical to result [',
    'tengu_tool_result_dedup',
    'savedBytes:A-H.length',
    '_.counter+=1',
    '[result-id: ${j}]',
  ], 'target apply dedup')
  assert.equal(
    target.slice(units.get(12101)[0], units.get(12101)[1]),
    'function Ad8(q){q.seen.clear()}',
  )
  assertFragments(target, [
    'resultDedupState:QGK()',
    'resultDedupState:d5.current',
    'resultDedupState:J',
    'resultDedupState:H',
    'cGK(q6,q.name,z.resultDedupState,q.maxResultSizeChars)',
    'SF(_,w.setAppState,w.resultDedupState)',
    'Ad8(d5.current)',
  ], 'target dedup call graph')
})

test('source owns the exact threshold, identity, telemetry, and restore algorithm', sourceOptions, () => {
  const owner = source('utils/toolErrors.ts')
  assertFragments(owner, [
    'MIN_TOOL_RESULT_DEDUP_CHARS = 256',
    'RESULT_ID_SUFFIX_MAX_CHARS = 26',
    'RESULT_ID_PATTERN = /\\[result-id: r(\\d+)\\]$/',
    "getFeatureValue_CACHED_MAY_BE_STALE('tengu_onyx_basin_m1k', false)",
    "block.is_error || typeof block.content !== 'string'",
    'originalBytes + RESULT_ID_SUFFIX_MAX_CHARS > persistenceThreshold',
    '<identical to result [${previous.shortId}] from your ${previous.toolName} call earlier — refer to that output>',
    "logEvent('tengu_tool_result_dedup'",
    'savedBytes: originalBytes - content.length',
    'state.counter += 1',
    'content: `${block.content}\\n[result-id: ${shortId}]`',
    'counter = Math.max(counter, Number(match[1]))',
  ], 'utils/toolErrors.ts')

  const reset = functionBody(owner, 'resetToolResultDedupState')
  assert.ok(reset.includes('state?.seen.clear()'))
  if (semanticCase === caseName) {
    assert.equal(reset.includes('state.counter = 0'), false)
  } else {
    assert.ok(reset.includes('state.counter = 0'))
  }
})

test('source wires dedup through non-MCP execution, forks, REPL, clear, and compaction', sourceOptions, () => {
  assertFragments(source('Tool.ts'), [
    "import type { ToolResultDedupState } from './utils/toolErrors.js'",
    'resultDedupState?: ToolResultDedupState',
  ], 'Tool.ts')
  assertFragments(source('services/tools/toolExecution.ts'), [
    'const rawMappedToolResultBlock = tool.mapToolResultToToolResultBlockParam(',
    'const mappedToolResultBlock = isMcpTool(tool)',
    ': applyToolResultDedup(',
    'toolUseContext.resultDedupState',
    'tool.maxResultSizeChars',
  ], 'toolExecution.ts')
  const execution = source('services/tools/toolExecution.ts')
  if (semanticCase === caseName) {
    assert.ok(execution.includes('const mappedContent = rawMappedToolResultBlock.content'))
  } else {
    assert.ok(execution.includes('const mappedContent = mappedToolResultBlock.content'))
  }
  assertFragments(source('utils/forkedAgent.ts'), [
    "import { createToolResultDedupState } from './toolErrors.js'",
    'resultDedupState: createToolResultDedupState()',
  ], 'forkedAgent.ts')
  assertFragments(source('screens/REPL.tsx'), [
    'restoreToolResultDedupState(initialMessages ?? [])',
    'resultDedupState: resultDedupStateRef.current',
  ], 'REPL.tsx')
  assertFragments(source('commands/clear/conversation.ts'), [
    'resultDedupState?: ToolResultDedupState',
    'resetToolResultDedupState(resultDedupState)',
  ], 'clear/conversation.ts')
  assertFragments(source('services/compact/autoCompact.ts'), [
    'resetToolResultDedupState(toolUseContext.resultDedupState)',
  ], 'autoCompact.ts')
  assertFragments(source('commands/compact/compact.ts'), [
    'resetToolResultDedupState(context.resultDedupState)',
  ], 'compact command')

  if (semanticCase === caseName) {
    assert.ok(
      source('commands/clear/conversation.ts').includes(
        'if (resultDedupState) resultDedupState.counter = 0',
      ),
    )
    assert.equal(source('QueryEngine.ts').includes('this.resultDedupState'), false)
  } else {
    assert.ok(source('QueryEngine.ts').includes('this.resultDedupState'))
  }
})
