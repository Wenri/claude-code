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
  [10855, ['unresolved', 8592721, 8593319, '18f3df4ac421924e7f89d82206e235ad67f6b9d7f01a72db8f62feae07662733']],
  [10862, ['unresolved', 8598231, 8600605, 'f428d559cb2922b50819338352cc9fa3b33db4426c7aabfe881097e741ff2b8f']],
  [10929, ['unresolved', 8614797, 8615209, '50990c07c2d1c502961eaf9a787e989638b8ce1c7e78ffb3da5195c6291b72f3']],
  [12203, ['unresolved', 9427971, 9428017, 'b76d868a232f4a44f49ca6ead862469c9fd02229cabecbfd560cf83d954fd454']],
  [12204, ['unresolved', 9428017, 9428306, '05d78e93b9f799ffce4207ff78f05b502bdf50814bc684c634fb92974a1ee92a']],
  [12205, ['unresolved', 9428306, 9428986, '0cd939a6fb8d7b35e95b69d2ce7599f29be76fde79e8b019eeef74041860e261']],
  [12206, ['unresolved', 9428986, 9429146, '9a89cbd1dc42f2151d1e486f5a4c7fc16f2d1442466c0b4f3033ebf15de20da9']],
  [12208, ['unresolved', 9429162, 9429223, '8d20aec11c9d9dceeb67dd2a0b1e4248bd9c2c46f319e66151c2bab38d2159d4']],
])

test('2.1.92 pins executable dispatch, rerun display, and complete result-dedup primitives', {
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
    assert.equal(region.classification, classification, `${index}: class`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: identity`,
    )
    assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
  }
  for (const fragment of [
    'local _cc_bin="\\${',
    '[[ -x $_cc_bin ]] || _cc_bin=$(command -v claude 2>/dev/null)',
    'then command ${q} "$@"; return; fi',
    'return Y?`rerun ${Y}`:null',
    'tengu_onyx_basin_m1k',
    '<identical to result [${w.shortId}] from your ${w.toolName} call earlier — refer to that output>',
    '[result-id: ${j}]',
    '/\\[result-id: r(\\d+)\\]$/',
  ]) {
    assert.ok(bundle.includes(fragment), fragment)
  }
})

test('materialized target92 source owns the full reachable shell and result-dedup call graph', {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}, () => {
  const shell = fs.readFileSync(
    path.join(sourceRoot, 'utils/bash/ShellSnapshot.ts'),
    'utf8',
  )
  for (const fragment of [
    "const CLAUDE_CODE_EXECPATH_ENV = 'CLAUDE_CODE_EXECPATH'",
    'local _cc_bin="\\${${CLAUDE_CODE_EXECPATH_ENV}:-}"',
    '[[ -x $_cc_bin ]] || _cc_bin=$(command -v claude 2>/dev/null)',
    'if [[ ! -x $_cc_bin ]]; then command ${funcName} "$@"; return; fi',
    'ARGV0=${argv0} "$_cc_bin" ${argSuffix}',
  ]) assert.ok(shell.includes(fragment), fragment)

  const ui = fs.readFileSync(path.join(sourceRoot, 'tools/BashTool/UI.tsx'), 'utf8')
  assert.ok(ui.includes('return rerun ? `rerun ${rerun}` : null;'))

  const dedup = fs.readFileSync(path.join(sourceRoot, 'utils/toolErrors.ts'), 'utf8')
  const historicalFragments = [
    'export function createToolResultDedupState',
    'export function restoreToolResultDedupState',
    "getFeatureValue_CACHED_MAY_BE_STALE('tengu_onyx_basin_m1k', false)",
    '<identical to result [${previous.shortId}] from your ${previous.toolName} call earlier — refer to that output>',
    'content: `${block.content}\\n[result-id: ${shortId}]`',
    'const RESULT_ID_PATTERN = /\\[result-id: r(\\d+)\\]$/',
  ]
  if (semanticCase === caseName) {
    historicalFragments.push(
      'Math.min(maxResultSizeChars, DEFAULT_MAX_RESULT_SIZE_CHARS)',
    )
  } else {
    historicalFragments.push('getPersistenceThreshold(')
  }
  for (const fragment of historicalFragments) {
    assert.ok(dedup.includes(fragment), fragment)
  }

  const execution = fs.readFileSync(
    path.join(sourceRoot, 'services/tools/toolExecution.ts'),
    'utf8',
  )
  for (const fragment of [
    'isMcpTool(tool)',
    'applyToolResultDedup(',
    'toolUseContext.resultDedupState',
    'tool.maxResultSizeChars',
  ]) assert.ok(execution.includes(fragment), fragment)

  const tool = fs.readFileSync(path.join(sourceRoot, 'Tool.ts'), 'utf8')
  assert.ok(tool.includes('resultDedupState?: ToolResultDedupState'))
  const fork = fs.readFileSync(path.join(sourceRoot, 'utils/forkedAgent.ts'), 'utf8')
  assert.ok(fork.includes('resultDedupState: createToolResultDedupState()'))
  const repl = fs.readFileSync(path.join(sourceRoot, 'screens/REPL.tsx'), 'utf8')
  assert.ok(repl.includes('current: restoreToolResultDedupState(initialMessages ?? [])'))
  assert.ok(repl.includes('resultDedupState: resultDedupStateRef.current'))
  const clear = fs.readFileSync(
    path.join(sourceRoot, 'commands/clear/conversation.ts'),
    'utf8',
  )
  assert.ok(clear.includes('resetToolResultDedupState(resultDedupState)'))
})

test('current source keeps target116 persistence-threshold evolution', {
  skip: semanticCase ? 'current-tree assertion' : false,
}, () => {
  const dedup = fs.readFileSync(
    path.join(repositoryRoot, 'src/utils/toolErrors.ts'),
    'utf8',
  )
  assert.ok(dedup.includes('const RESULT_ID_SUFFIX_MAX_CHARS = 26'))
  assert.ok(dedup.includes('getPersistenceThreshold('))
  assert.ok(
    dedup.includes(
      'originalBytes + RESULT_ID_SUFFIX_MAX_CHARS > persistenceThreshold',
    ),
  )
})
