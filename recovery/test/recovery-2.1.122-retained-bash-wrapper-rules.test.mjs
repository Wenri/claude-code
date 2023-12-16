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
    sha256: '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256: 'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
]

function readBundle(release) {
  const filename = process.env[release.env]
  assert.ok(filename, `${release.env} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
  )
  return bytes.toString('utf8')
}

test('authenticates retained option-aware Bash wrapper matching', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const value of [
      '--other-user',
      '--command-timeout',
      '--summary-syscall-overhead',
      '--split-string',
      '--logging-format',
      '--monotonic',
    ]) {
      assert.equal(
        bundle.split(value).length - 1,
        1,
        `${release.version}: ${value}`,
      )
    }
    assert.equal(
      bundle.match(/new Set\(\["-S","--split-string"\]\)/g)?.length,
      1,
    )
    assert.equal(bundle.match(/new Set\(\["-c","--command"\]\)/g)?.length, 2)
    assert.equal(
      bundle.match(
        /\.argv\?\?\w+\(\w+\),\w+=\w+\(\w+\);if\(\w+\.length>0&&\w+\[0\]!==\w+\[0\]\)/g,
      )?.length,
      1,
      `${release.version}: argv wrapper candidate is added for rule matching`,
    )
  }
})

test('source threads parsed argv through retained wrapper-aware deny and ask rules', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/tools/BashTool/bashPermissions.ts'),
    'utf8',
  )

  for (const fragment of [
    'COMMAND_WRAPPER_VALUE_OPTIONS',
    'COMMAND_WRAPPER_COMMAND_OPTIONS',
    'function stripCommandWrappersFromArgv',
    "env: new Set(['-u', '-C', '--unset', '--chdir'])",
    "env: new Set(['-S', '--split-string'])",
    "flock: new Set(['-c', '--command'])",
    "script: new Set(['-c', '--command'])",
    "wrapper === 'command' && (argument === '-v' || argument === '-V')",
    'astCommand?.argv ?? parseLiteralCommandArgv(commandWithoutRedirections)',
    'const unwrappedArgv = stripCommandWrappersFromArgv(argv)',
    '{ stripAllEnvVars: true, skipCompoundCheck: true, astCommand }',
    '{ astCommand: parsedCommands[index] }',
  ]) {
    assert.ok(source.includes(fragment), fragment)
  }

  for (const wrapper of [
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
    assert.ok(source.includes(`'${wrapper}'`), wrapper)
  }
})
