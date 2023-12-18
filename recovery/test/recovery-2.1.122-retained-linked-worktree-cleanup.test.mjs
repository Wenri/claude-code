import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = [
  {
    version: '2.1.121',
    envNames: ['CLAUDE_CODE_2_1_121_BUNDLE', 'CLAUDE_2_1_121_CLI_INNER'],
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  {
    version: '2.1.122',
    envNames: ['CLAUDE_CODE_2_1_122_BUNDLE', 'CLAUDE_2_1_122_CLI_INNER'],
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
]

function readBundle(release) {
  const filename = release.envNames.map(name => process.env[name]).find(Boolean)
  assert.ok(filename, `${release.envNames.join(' or ')} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return bytes.toString('utf8')
}

function assertOrder(text, ...needles) {
  let cursor = -1
  for (const needle of needles) {
    const next = text.indexOf(needle, cursor + 1)
    assert.ok(next > cursor, `${needle} is missing or out of order`)
    cursor = next
  }
}

test('authenticates retained linked-worktree residual cleanup contract', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    const start = bundle.indexOf(
      'WorktreeRemove hook did not remove worktree, left at:',
    )
    const end = bundle.indexOf('Linked worktree cleaned up completely', start)
    assert.ok(start >= 0 && end > start, `${release.version}: cleanup anchors`)
    const cleanup = bundle.slice(start - 300, end + 100)

    assertOrder(
      cleanup,
      'WorktreeRemove hook did not remove worktree, left at:',
      'worktree',
      'remove',
      '--force',
      'recursive',
      'force',
      '[worktree] residual dir cleanup failed for',
      'git worktree remove failed (',
      '); rm sweep cleared',
      'Failed to remove linked worktree:',
      'Removed linked worktree at:',
      'branch',
      '-D',
      'Linked worktree cleaned up completely',
    )
    assert.match(
      cleanup,
      /\.rm\([\w$]+,\{recursive:!0,force:!0\}\)\.then\(\(\)=>\{[\w$]+=!0\},\([\w$]+\)=>/,
      `${release.version}: sweep success is an explicit fallback`,
    )
  }
})

test('source sweeps a linked worktree when git removal fails', () => {
  const source = fs.readFileSync(path.join(repo, 'src/utils/worktree.ts'), 'utf8')
  const start = source.indexOf('export async function cleanupWorktree')
  const end = source.indexOf('/**\n * Create a lightweight worktree', start)
  assert.ok(start >= 0 && end > start)
  const cleanup = source.slice(start, end)

  assertOrder(
    cleanup,
    'WorktreeRemove hook did not remove worktree, left at:',
    "['worktree', 'remove', '--force', worktreePath]",
    'let directoryRemoved = removeCode === 0',
    'await rm(worktreePath, { recursive: true, force: true }).then(',
    'directoryRemoved = true',
    '[worktree] residual dir cleanup failed for',
    'if (removeCode !== 0)',
    'git worktree remove failed (',
    '); rm sweep cleared',
    'Failed to remove linked worktree:',
    "level: directoryRemoved ? 'debug' : 'error'",
    'Removed linked worktree at:',
  )
  assert.doesNotMatch(
    cleanup,
    /No WorktreeRemove hook configured, hook-based worktree left at:/,
  )
})
