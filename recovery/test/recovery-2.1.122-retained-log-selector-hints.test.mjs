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
    env: 'CLAUDE_CODE_2_1_121_BUNDLE',
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
]

test('authenticates retained resume-selector worktree and preview hints', () => {
  for (const release of releases) {
    const filename = process.env[release.env]
    assert.ok(filename, `${release.env} must be set`)
    const bytes = fs.readFileSync(filename)
    assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
    assert.equal(
      crypto.createHash('sha256').update(bytes).digest('hex'),
      release.sha256,
      `${release.version}: SHA-256`,
    )
    const bundle = bytes.toString('utf8')
    assert.equal(bundle.split('only show current worktree').length - 1, 1)
    assert.equal(bundle.split('show all worktrees').length - 1, 1)
    assert.match(
      bundle,
      /chord:"ctrl\+w",action:[\w$]+\?"only show current worktree":"show all worktrees"/,
    )
    assert.match(bundle, /chord:"space",action:"preview"/)
  }
})

test('source reproduces retained resume-selector hints', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/components/LogSelector.tsx'),
    'utf8',
  )
  assert.match(
    source,
    /shortcut="Ctrl\+W" action=\{showAllWorktrees \? "only show current worktree" : "show all worktrees"\}/,
  )
  assert.match(source, /shortcut="Space" action="preview"/)
  assert.doesNotMatch(source, /shortcut="Ctrl\+V" action="preview"/)
})
