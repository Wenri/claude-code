import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const specs = [
  ['CLAUDE_CODE_2_1_120_BUNDLE', 13_784_743, 'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f'],
  ['CLAUDE_CODE_2_1_121_BUNDLE', 13_908_188, '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a'],
]

function bundle([env, bytes, sha]) {
  const filename = process.env[env]
  assert.ok(filename, `${env} must be set`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, bytes)
  assert.equal(crypto.createHash('sha256').update(value).digest('hex'), sha)
  return value.toString('utf8')
}

test('2.1.121 introduces the bounded runtime-hardening witnesses', () => {
  const [baseline, target] = specs.map(bundle)
  for (const fragment of [
    'malformed updatedPermissions ignored',
    'path traversal or absolute path',
    'auto_restore_cancel',
    'jump_to_message',
    'flush timeout (relaunch)',
    'stdout is not a TTY',
    'frame-link',
  ]) {
    assert.equal(baseline.includes(fragment), false, fragment)
    assert.equal(target.split(fragment).length - 1, 1, fragment)
  }
})

test('source preserves each released behavior at its active boundary', () => {
  const read = relative => fs.readFileSync(path.join(repo, relative), 'utf8')

  const permissions = read('src/utils/queryHelpers.ts')
  assert.match(permissions, /Array\.isArray\(updatedPermissions\)/)
  assert.match(permissions, /applyPermissionUpdates\(/)
  assert.match(permissions, /persistPermissionUpdates\(updatedPermissions\)/)
  assert.match(permissions, /malformed updatedPermissions ignored/)

  const worktree = read('src/utils/worktree.ts')
  assert.match(worktree, /isAbsolute\(dir\)/)
  assert.match(worktree, /\^\\\.\\\.\[ \.\]\*\$/)
  assert.match(worktree, /path traversal or absolute path/)

  const repl = read('src/screens/REPL.tsx')
  assert.match(repl, /source\?: string/)
  assert.match(repl, /source\s*\n\s*\}\);/)
  assert.match(repl, /lastUserMsg, 'auto_restore_cancel'/)
  assert.match(repl, /handleRestoreMessage\(raw, 'jump_to_message'\)/)

  const relaunch = read('src/utils/relaunch.ts')
  assert.match(relaunch, /flushSessionStorage\(\),\s*30_000,\s*'flush timeout \(relaunch\)'/s)
  assert.match(read('src/main.tsx'), /stdout is not a TTY, e\.g\. piped or redirected output/)

  assert.match(read('src/types/logs.ts'), /type: 'frame-link'/)
  assert.match(
    read('src/utils/sessionStorage.ts'),
    /entry\.type === 'frame-link'[\s\S]*?enqueueWrite\(sessionFile, entry\)/,
  )
})
