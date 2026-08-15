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

const retainedDiagnostics = [
  'Parser aborted (timeout, resource limit, or over-length)',
  'Redirect has multiple targets \\u2014 post-redirect args swallowed',
  'Redirect target contains $(cmd) output \\u2014 path is runtime-determined',
  'Redirect target contains newline \\u2014 potential path traversal',
  'Redirect target starts with ! \\u2014 zsh clobber or history expansion',
  'Quoted heredoc delimiter contains backslash',
  'Word contains unescaped ` or $ \\u2014 parser missed expansion',
  'Legacy $[...] arithmetic inside double-quotes \\u2014 recursive subscript eval',
  'was tracked as literal',
  'runs its argument as a command \\u2014 cannot be statically analyzed',
]

function count(haystack, needle) {
  return haystack.split(needle).length - 1
}

function readBundle(release) {
  const filename = process.env[release.env]
  assert.ok(filename, `${release.env} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return bytes.toString('utf8')
}

test('authenticates retained fail-closed Bash AST guards', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const diagnostic of retainedDiagnostics) {
      assert.equal(
        count(bundle, diagnostic),
        1,
        `${release.version}: ${diagnostic}`,
      )
    }
    assert.match(
      bundle,
      /new Set\(\["watch","ionice","chrt","setsid","taskset","strace","ltrace","script","flock","unshare","nsenter"\]\)/,
      `${release.version}: command-executing utility set`,
    )
  }
})

test('source reproduces retained Bash AST scope and syntax rejection', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/utils/bash/ast.ts'),
    'utf8',
  )

  for (const diagnostic of retainedDiagnostics) {
    assert.ok(
      source.includes(diagnostic.replaceAll('\\u2014', '—')),
      `source diagnostic: ${diagnostic}`,
    )
  }
  assert.match(source, /function mergeVarScopes\(/)
  assert.match(source, /mergeVarScopes\(varScope, bodyScope\)/)
  assert.match(source, /mergeVarScopes\(varScope, branchScope\)/)
  assert.match(source, /mergeVarScopes\(varScope, targetScope\)/)
  assert.match(source, /commands\.length > 0/)
  assert.match(source, /else if \(target !== null\)/)
  assert.match(source, /containsAnyPlaceholder\(target\)/)
  assert.match(source, /startText\.slice\(1, -1\)\.includes\('\\\\'\)/)
  assert.match(source, /const COMMAND_ARGUMENT_BUILTINS = new Set/)
  for (const name of [
    'watch',
    'ionice',
    'chrt',
    'setsid',
    'taskset',
    'strace',
    'ltrace',
    'script',
    'flock',
    'unshare',
    'nsenter',
  ]) {
    assert.match(source, new RegExp(`'${name}'`))
  }
})
