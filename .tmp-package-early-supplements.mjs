import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const repositoryRoot = process.cwd()
const cases = [
  ['2.1.88-to-2.1.89', '/tmp/claude-2.1.89-cumulative-worktree-zJR5v1'],
  ['2.1.89-to-2.1.90', '/tmp/early-own-worktrees/90'],
  ['2.1.90-to-2.1.91', '/tmp/early-own-worktrees/91'],
  ['2.1.91-to-2.1.92', '/tmp/early-own-worktrees/92'],
  ['2.1.92-to-2.1.94', '/tmp/early-own-worktrees/94'],
  ['2.1.94-to-2.1.96', '/tmp/early-own-worktrees/96'],
]

function git(cwd, args, encoding = 'utf8') {
  const result = spawnSync('git', args, {
    cwd,
    encoding,
    maxBuffer: 512 * 1024 * 1024,
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(' ')} failed`)
  }
  return result.stdout
}

for (const [caseName, historicalRoot] of cases) {
  if (!fs.existsSync(path.join(historicalRoot, 'src'))) {
    throw new Error(`${caseName}: historical source root is missing`)
  }

  // Intent-to-add makes authored new source files visible to one canonical
  // HEAD-to-working-tree diff without staging their contents.
  git(historicalRoot, ['add', '--intent-to-add', '--', 'src'])
  const patch = git(historicalRoot, [
    'diff',
    '--binary',
    '--full-index',
    '--no-renames',
    '--no-ext-diff',
    'HEAD',
    '--',
    'src',
  ])
  if (!patch.startsWith('diff --git ')) {
    throw new Error(`${caseName}: semantic supplement is empty`)
  }
  const paths = [...patch.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)]
  if (paths.length === 0 || paths.some(match => !match[1].startsWith('src/') || !match[2].startsWith('src/'))) {
    throw new Error(`${caseName}: semantic supplement escaped src/`)
  }
  if (/^\+\/\/ @bun(?:\s|$)/m.test(patch)) {
    throw new Error(`${caseName}: semantic supplement contains a Bun build artifact`)
  }

  const output = path.join(
    repositoryRoot,
    'recovery/cases',
    caseName,
    'semantic-supplement.patch',
  )
  fs.writeFileSync(output, patch)
  process.stdout.write(`${caseName} ${paths.length} paths ${Buffer.byteLength(patch)} bytes\n`)
}
