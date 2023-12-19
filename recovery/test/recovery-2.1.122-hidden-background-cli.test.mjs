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

function loadBundle(release) {
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

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

test('authenticates the target-only background CLI safety boundary', () => {
  const baseline = loadBundle(releases[0])
  const target = loadBundle(releases[1])
  for (const fragment of [
    '--bg with bypassPermissions requires accepting the disclaimer first.',
    '--bg with auto mode requires opting in first.',
    'warning: piped stdin exceeds ',
  ]) {
    assert.equal(occurrences(baseline, fragment), 0, `baseline: ${fragment}`)
    assert.equal(occurrences(target, fragment), 1, `target: ${fragment}`)
  }
})

test('recovers consent checks, stdin injection, and persistent value flags', () => {
  const source = fs.readFileSync(path.join(repo, 'src/cli/bg.ts'), 'utf8')
  for (const fragment of [
    'getBackgroundLaunchSafetyError(args)',
    '!hasSkipDangerousModePermissionPrompt()',
    '!getGlobalConfig().bypassPermissionsModeAccepted',
    "permissionMode === 'auto' && !hasAutoModeOptIn()",
    'const MAX_BACKGROUND_STDIN_BYTES = 1_048_576',
    'await peekForStdinData(stdin, 3_000)',
    "return input.replace(/\\r?\\n$/, '')",
    'stdin ? withStdinPositional(filteredArgs, stdin) : filteredArgs',
    "result.idle ? '(idle — attach to send a prompt)' : undefined",
  ]) {
    assert.ok(source.includes(fragment), `missing ${fragment}`)
  }
  for (const flag of [
    '--agents',
    '--setting-sources',
    '--autocompact',
    '--plan-mode-instructions',
    '--resume-session-at',
    '--rewind-files',
    '--thinking-display',
  ]) {
    assert.ok(source.includes(`'${flag}',`), `missing persistent flag ${flag}`)
  }
  for (const flag of [
    '--prefill',
    '--prefill-b64',
    '--deep-link-repo',
    '--deep-link-last-fetch',
    '--deep-link-cwd-b64',
    '--handle-uri',
    '--settings',
    '--managed-settings',
    '--setting-sources',
  ]) {
    assert.ok(source.includes(`'${flag}',`), `missing option value flag ${flag}`)
  }
  assert.ok(source.includes('OPTION_VALUE_FLAGS.has(arg)'))
})
