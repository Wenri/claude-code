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
  [361, [30601, 33213, 'e952f124f4b411f8f0cfd4d598ed10437a4be73adec8d9d5cecd0c48db4c691c', 'FunctionDeclaration']],
  [467, [39771, 39814, '5f0278c2b52f321f09a3afceec45f89536656be3ad7e4a078f8123fe7d2b4daa', 'FunctionDeclaration']],
  [468, [39814, 39853, '30f51ece710cae2ca3fd9d6fcbb7ce7cd61d422ce6eb4f30122ccdb8889c906f', 'FunctionDeclaration']],
  [479, [40276, 40324, '36bda766dcb1b4b7dd7fbfee3930ad4a4a43ad714a2895bd89959dd111c61269', 'FunctionDeclaration']],
  [480, [40324, 40368, '7302e128ed6aebd8351730bd166b9abdcc8db24fdb55a12d2bd4a61a7f79cdd3', 'FunctionDeclaration']],
  [6793, [4970929, 4971151, 'a7713efd882679d8bf5f421737aed5a9f0649161023371d917e3ae3270ee40e1', 'ExpressionStatement']],
  [6799, [4971950, 4972013, '9b9c3522ed40189b1817e49ab527e0b081736c0ede21d094a88c1ff37fb371bc', 'FunctionDeclaration']],
  // The metadata parser is inherited from the 92 to 94 boundary, but these
  // exact units prove the helper consumed by target101's new 404 branch.
  [9890, [7398249, 7398326, '557f64cfda905bf9ef9894f8bd1f90acedf1f1895a42d0c38709a94fb1adbe36', 'FunctionDeclaration']],
  [9891, [7398326, 7398648, '9a949ed8490e7e2264ddefaaa49bb018c20e4182955a5c3156aa5cbe1895efa0', 'FunctionDeclaration']],
  [9892, [7398648, 7400373, 'd08cf4e9eb0ae2f404dedbae243c028bc7ef9befc270caa529d9657b5251d559', 'FunctionDeclaration']],
  [9901, [7406156, 7408117, '8892871ebcb2d3e6fd6c9f5386074cc8cb3653add16143e8cea69195dfa71500', 'FunctionDeclaration']],
  [9902, [7408117, 7412776, 'c2038e7807d0622a5dcd4df0d456fefcdc097bbeed08dc1360f626af90a1afc0', 'FunctionDeclaration']],
  [9905, [7414017, 7414111, '332102aebb93bbfe8a20366a8bef54309987b47b4d8cd3f0e2368f13fd878935', 'VariableDeclaration']],
  [18767, [13331502, 13337686, '0cd9386c3762c938aeb1889bd54776516ff9249bfeeaa82df13472c3a2a156e2', 'FunctionDeclaration']],
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

test('target101 pins the complete team-memory availability graph', pairOptions, () => {
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
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [
        region.target.start,
        region.target.end,
        region.target.sourceHash,
        region.target.nodeType,
      ],
      [start, end, hash, nodeType],
      `${index}: structural identity`,
    )
    const unit = target.slice(start, end)
    assert.equal(sha256(unit), hash, `${index}: target bytes`)
    assert.equal(
      parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
      1,
      `${index}: one top-level statement`,
    )
  }
})

test('availability state, 404 status, and streaming-input reachability enter at target101', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  for (const fragment of [
    'hasStreamingInput',
    'teamMemoryServerStatus',
    'team_memory_feature_unavailable',
    'team-memory-sync: no remote data (404, code=',
  ]) {
    assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
    assert.equal(target.includes(fragment), true, `${fragment}: target`)
  }

  const pull = target.slice(...targetUnits.get(9901).slice(0, 2))
  assertFragments(
    pull,
    [
      'errorType==="forbidden"',
      '("not-available")',
      'serverErrorCode===',
      '?"not-available":"empty"',
      '>0?"has-content":"empty"',
    ],
    'target101 pull',
  )
  const push = target.slice(...targetUnits.get(9902).slice(0, 2))
  assert.ok(push.includes('.size>0)'))
  assert.ok(push.includes('("has-content")'))
  const print = target.slice(...targetUnits.get(18767).slice(0, 2))
  assert.ok(print.includes('(typeof q!=="string")'))
})

test('source owns the state, hook, CLI, and sync call graph', sourceOptions, () => {
  const state = source('bootstrap/state.ts')
  assertFragments(
    state,
    [
      'hasStreamingInput: boolean',
      'hasStreamingInput: false',
      'teamMemoryServerStatus:',
      'teamMemoryServerStatus: undefined',
      'export function getHasStreamingInput(): boolean',
      'export function setHasStreamingInput(value: boolean): void',
      'export function getTeamMemoryServerStatus():',
      'export function setTeamMemoryServerStatus(',
    ],
    'bootstrap/state.ts',
  )

  const paths = source('memdir/teamMemPaths.ts')
  assertFragments(
    paths,
    [
      'export function isTeamMemoryActiveForCwd(): boolean',
      'if (!isTeamMemoryEnabled()) return false',
      "return getTeamMemoryServerStatus() === 'has-content'",
    ],
    'memdir/teamMemPaths.ts',
  )

  const hooks = source('utils/hooks.ts')
  assertFragments(
    hooks,
    [
      'const canAsyncRewake =',
      '!getIsNonInteractiveSession() || getHasStreamingInput()',
      '(hook.asyncRewake && canAsyncRewake)',
      '&& !forceSyncExecution',
    ],
    'utils/hooks.ts',
  )

  const print = source('cli/print.ts')
  const streamingAt = print.indexOf(
    "setHasStreamingInput(typeof inputPrompt !== 'string')",
  )
  const ioAt = print.indexOf('const structuredIO = getStructuredIO(')
  assert.ok(streamingAt >= 0, 'cli/print.ts: streaming-input setter')
  assert.ok(ioAt > streamingAt, 'cli/print.ts: setter precedes StructuredIO')

  const sync = source('services/teamMemorySync/index.ts')
  assertFragments(
    sync,
    [
      "const TEAM_MEMORY_FEATURE_UNAVAILABLE = 'team_memory_feature_unavailable'",
      'team-memory-sync: no remote data (404, code=${serverErrorCode',
      "setTeamMemoryServerStatus('not-available')",
      'result.serverErrorCode === TEAM_MEMORY_FEATURE_UNAVAILABLE',
      "? 'not-available'",
      ": 'empty'",
      "setTeamMemoryServerStatus(entryCount > 0 ? 'has-content' : 'empty')",
      "setTeamMemoryServerStatus('has-content')",
    ],
    'services/teamMemorySync/index.ts',
  )
})
