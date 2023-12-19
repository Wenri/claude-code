import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const bundles = [
  [
    ['CLAUDE_CODE_2_1_120_BUNDLE', 'CLAUDE_2_1_120_CLI_INNER'],
    13_784_743,
    'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f',
  ],
  [
    ['CLAUDE_CODE_2_1_121_BUNDLE', 'CLAUDE_2_1_121_CLI_INNER'],
    13_908_188,
    '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  ],
]

function readBundle([names, expectedBytes, expectedSha256]) {
  const filename = names.map(name => process.env[name]).find(Boolean)
  assert.ok(filename, `${names.join(' or ')} must be set`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, expectedBytes)
  assert.equal(
    crypto.createHash('sha256').update(value).digest('hex'),
    expectedSha256,
  )
  return value.toString('utf8')
}

test('authenticates inherited worktree baseline and orphan safeguards', () => {
  for (const bundle of bundles.map(readBundle)) {
    for (const [fragment, count] of [
      ['CLAUDE_BASE', 1],
      ['cannot write baseline: gitdir unresolvable', 1],
      ['Cannot self-heal orphaned worktree', 1],
      ['--no-track', 1],
    ]) {
      assert.equal(bundle.split(fragment).length - 1, count, fragment)
    }
  }
})

test('recovers baseline precedence and fail-closed orphan cleanup', () => {
  const source = fs.readFileSync(path.join(repo, 'src/utils/worktree.ts'), 'utf8')
  for (const fragment of [
    "WORKTREE_BASELINE_FILE = 'CLAUDE_BASE'",
    'headCommit: baseline ?? existingHead',
    "options?.fromHead",
    "baseBranch = 'HEAD'",
    "!defaultBranch.startsWith('-')",
    "addArgs.push('--no-track', '-B'",
    'await writeWorktreeBaseline(worktreePath, baseSha)',
    "['rev-parse', '--verify', '--quiet', worktreeBranch]",
    "'--not', '--remotes'",
    'has unpushed commits — refusing to self-heal',
    'rm(worktreePath, { recursive: true, force: true })',
    'findCanonicalGitRoot(options?.fromCwd ?? getCwd())',
  ]) {
    assert.equal(source.includes(fragment), true, fragment)
  }
})
