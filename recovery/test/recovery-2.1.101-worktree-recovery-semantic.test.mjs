import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const isCurrentSource = sourceRoot === path.join(repositoryRoot, 'src')
const baselinePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_101_BUNDLE

const units = [
  [16439, 11794210, 11797087, '2fdc879f24828f14ba4b1476c427cf1d5ca88c2db1f57e5f3026b089094078dd'],
  [16449, 11801346, 11802388, '7bf246fe3d7398dfbd51500cd8d683c5d7166e35e97c63c2b8989bbb90591e1d'],
  [16452, 11803611, 11804466, 'bd750f35be51035b8192eac16186e7b2cad09523d4043aa2a58f3e32990dbaf6'],
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
  'target101 pins orphan self-healing and removal fallbacks',
  {
    skip:
      !selected || !baselinePath || !targetPath
        ? 'selected authenticated 100/101 artifacts are required'
        : false,
  },
  () => {
    const baseline = authenticated(
      baselinePath,
      'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be',
      '2.1.100',
    )
    const target = authenticated(
      targetPath,
      'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
      '2.1.101',
    )
    for (const [index, start, end, hash] of units) {
      assert.equal(sha256(target.slice(start, end)), hash, `unit ${index}`)
    }
    for (const fragment of [
      'Orphaned worktree dir at ',
      ' has unpushed commits — refusing to self-heal.',
      '[worktree] residual dir cleanup failed for ',
      '); rm sweep cleared ',
    ]) {
      assert.equal(baseline.includes(fragment), false, fragment)
      assert.equal(target.includes(fragment), true, fragment)
    }
  },
)

test(
  'source owns every fail-closed inspection and cleanup outcome',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const source = fs.readFileSync(
      path.join(sourceRoot, 'utils/worktree.ts'),
      'utf8',
    )
    for (const fragment of [
      "['remote']",
      "['rev-parse', '--verify', '--quiet', worktreeBranch]",
      "['rev-list', '--max-count=1', worktreeBranch, '--not', '--remotes']",
      'has unpushed commits — refusing to self-heal.',
      'await rm(worktreePath, { recursive: true, force: false })',
      '[worktree] removed orphaned worktree directory at',
      'Cannot self-heal orphaned worktree at',
      '[worktree] residual dir cleanup failed for',
      'rm sweep cleared',
      "{ level: directoryRemoved ? 'debug' : 'error' }",
    ]) assert.ok(source.includes(fragment), fragment)

    if (isCurrentSource) {
      assert.ok(source.includes("['worktree', 'unlock', worktreePath]"))
      assert.ok(source.includes("logEvent('tengu_worktree_removed'"))
    } else {
      assert.equal(source.includes("['worktree', 'unlock', worktreePath]"), false)
      assert.equal(source.includes("logEvent('tengu_worktree_removed'"), false)
    }
  },
)
