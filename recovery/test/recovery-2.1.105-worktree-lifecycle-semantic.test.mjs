import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const isCurrentSource = sourceRoot === path.join(repositoryRoot, 'src')
const baselinePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_105_BUNDLE

const units = [
  [16593, 11859712, 11860832, 'b7e5e76e91fd5e187079c492ab05bb107731b608a78915d44048c762d93fbe19'],
  [16594, 11860832, 11861258, '2abf3d2b0ee24a99787182610f2a0e6f7dede2c1b68447c4d348e280a92d968b'],
  [16595, 11861258, 11861556, 'b965a219fc50a3483fae47e73e9aad7ed1ebae43ef21859d0f21d73779e0ddf6'],
  [16596, 11861556, 11862346, '91b14bfc94e39ca2cc9a4bb734f33429e7b7ba81de4b4efa557aeb01405a5441'],
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function authenticated(filename, expected, label) {
  assert.ok(filename, `${label} bundle is required`)
  const bytes = fs.readFileSync(filename)
  assert.equal(sha256(bytes), expected, label)
  return bytes.toString('utf8')
}

test(
  'target105 pins removal telemetry and safe stale cleanup',
  {
    skip:
      !selected || !baselinePath || !targetPath
        ? 'selected authenticated 104/105 artifacts are required'
        : false,
  },
  () => {
    const baseline = authenticated(
      baselinePath,
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
      '2.1.104',
    )
    const target = authenticated(
      targetPath,
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
      '2.1.105',
    )
    for (const [index, start, end, hash] of units) {
      assert.equal(sha256(target.slice(start, end)), hash, `unit ${index}`)
    }
    for (const [fragment, baselineCount, targetCount] of [
      ['tengu_worktree_removed', 2, 5],
      ['%(upstream:track,nobracket)', 0, 1],
      ['refs/remotes/origin/HEAD', 1, 2],
      ['stale_cleanup', 0, 1],
    ]) {
      assert.equal(baseline.split(fragment).length - 1, baselineCount, fragment)
      assert.equal(target.split(fragment).length - 1, targetCount, fragment)
    }
  },
)

test(
  'source owns the target105 gone-upstream and telemetry policy',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const source = fs.readFileSync(
      path.join(sourceRoot, 'utils/worktree.ts'),
      'utf8',
    )
    for (const fragment of [
      "logEvent('tengu_worktree_removed'",
      'changed_files: changedFiles',
      'hook_based: true',
      "['symbolic-ref', '-q', 'HEAD']",
      "['for-each-ref', '--format=%(upstream:track,nobracket)', branchRef]",
      "'--cherry-pick'",
      "'--right-only'",
      '`${defaultRemote}...HEAD`',
      "['symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD']",
      "['origin/main', 'origin/master']",
      "'stale_cleanup'",
    ]) assert.ok(source.includes(fragment), fragment)

    if (isCurrentSource) {
      assert.ok(source.includes("['worktree', 'unlock', worktreePath]"))
    } else {
      assert.equal(source.includes("['worktree', 'unlock', worktreePath]"), false)
    }
  },
)
