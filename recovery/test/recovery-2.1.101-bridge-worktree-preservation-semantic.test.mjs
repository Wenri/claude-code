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
const isCurrentSource =
  path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
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

const targetUnits = new Map([
  [
    16653,
    [
      11905422,
      11919922,
      '5eec462633b946850aa524b202127a8a60e502b44dd76310089f4b2f86748d3d',
    ],
  ],
  [
    16659,
    [
      11920954,
      11921622,
      'c9f3cc4f2de98d7ce0be2713fbac0e087518a50a717d3e47f2f87c6571c822ea',
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

function assertFragments(contents, fragments, label) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${label}: ${fragment}`)
  }
}

test('target101 pins bridge worktree lifecycle and cleanup units', pairOptions, () => {
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
  for (const [index, identity] of targetUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: class`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
      `${index}: identity`,
    )
    const unit = target.slice(identity[0], identity[1])
    assert.equal(sha256(unit), identity[2], `${index}: bytes`)
    assert.equal(
      parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
      1,
      `${index}: one top-level statement`,
    )
  }
})

test('target101 introduces crash preservation and dirty-worktree inspection', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  assert.equal(baseline.includes('session crashed'), false)
  assert.equal(target.includes('session crashed'), true)
  for (const fragment of [
    'git error checking changes',
    '[bridge:worktree] kept ',
    'worktree removal failed, kept:',
  ]) {
    assert.equal(baseline.includes(fragment), true, `${fragment}: inherited`)
    assert.equal(target.includes(fragment), true, `${fragment}: target`)
  }
  const lifecycle = target.slice(...targetUnits.get(16653).slice(0, 2))
  assertFragments(
    lifecycle,
    [
      'session crashed',
      '==="failed"&&',
      '.aborted',
      '.archiveSession(',
      '.headCommit',
      '{force:!0}',
    ],
    'target101 lifecycle',
  )
  const cleanup = target.slice(...targetUnits.get(16659).slice(0, 2))
  assertFragments(
    cleanup,
    [
      '?.force',
      '.hookBased',
      '.headCommit===void 0',
      'git error checking changes',
      'uncommitted changes',
      'commitsAhead',
    ],
    'target101 cleanup',
  )
  const baselineCleanupAt = baseline.indexOf('git error checking changes')
  const baselineCleanup = baseline.slice(
    Math.max(0, baselineCleanupAt - 400),
    baselineCleanupAt + 500,
  )
  assert.equal(baselineCleanup.includes('?.force||'), false)
  assert.equal(baselineCleanup.includes('.headCommit===void 0'), false)
  if (latestBundlePath) {
    const latest = fs.readFileSync(latestBundlePath, 'utf8')
    for (const fragment of [
      'session crashed',
      'git error checking changes',
      '[bridge:worktree] kept ',
    ]) {
      assert.ok(latest.includes(fragment), `target116: ${fragment}`)
    }
  }
})

test('source preserves crashed worktrees and force-cleans failed spawns', sourceOptions, () => {
  const source = fs.readFileSync(
    path.join(sourceRoot, 'bridge/bridgeMain.ts'),
    'utf8',
  )
  assertFragments(
    source,
    [
      'getAgentWorktreeChanges,',
      'type BridgeWorktree = {',
      'headCommit?: string',
      'async function cleanupBridgeWorktree(',
      'options?: { force?: boolean }',
      'options?.force || (worktree.hookBased && worktree.headCommit === undefined)',
      '{ dirty: false, commitsAhead: 0, gitError: false }',
      'await getAgentWorktreeChanges(',
      "? 'git error checking changes'",
      'const failedSessionIds = new Set<string>()',
      "status === 'failed' && !loopSignal.aborted && !fatalExit",
      'failedSessionIds.add(sessionId)',
      'kept worktree ${wt.worktreePath} · session crashed',
      'cleanupBridgeWorktree(wt, logger, { force: true })',
      'headCommit: wt.headCommit',
      "if (status === 'completed') {",
      '![...failedSessionIds].some(sessionId =>',
      'sameSessionId(sessionId, initialSessionId)',
    ],
    'src/bridge/bridgeMain.ts',
  )
  if (isCurrentSource) {
    assert.ok(
      source.includes(
        "worktree.hookBased,\n      'bridge',\n    )",
      ),
    )
  } else {
    assert.equal(
      source.includes(
        "worktree.hookBased,\n      'bridge',\n    )",
      ),
      false,
    )
  }
})
