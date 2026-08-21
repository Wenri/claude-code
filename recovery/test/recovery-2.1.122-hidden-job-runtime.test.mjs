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
    jobDirCount: 7,
    extendedKeyCount: 0,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    jobDirCount: 11,
    extendedKeyCount: 1,
  },
]

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

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

function readSource(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

test('authenticates the target-only job runtime and extended attach keys', () => {
  const keySequences = [
    '\\x1B[98;5u',
    '\\x1B[27;5;98~',
    '\\x1B[122;5u',
    '\\x1B[27;5;122~',
  ]
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      occurrences(bundle, 'process.env.CLAUDE_JOB_DIR'),
      release.jobDirCount,
      `${release.version}: CLAUDE_JOB_DIR cardinality`,
    )
    for (const sequence of keySequences) {
      assert.equal(
        occurrences(bundle, sequence),
        release.extendedKeyCount,
        `${release.version}: ${sequence}`,
      )
    }
  }
})

test('uses the current job directory and persists every target respawn flag', () => {
  const jobs = compact(readSource('src/daemon/jobs.ts'))
  for (const fragment of [
    "const jobDir = process.env.CLAUDE_JOB_DIR if (jobDir) return basename(jobDir) return getSessionId().slice(0, 8)",
    'isCurrentSession ? getCurrentJobShort() : sessionId.slice(0, 8)',
    '(!isCurrentSession && first.sessionId !== sessionId)',
    'const names = [flag, ...aliases]',
    'argument === name || argument.startsWith(`${name}=`)',
    "!argument.includes('=') && state.respawnFlags[index + 1] !== undefined",
    'const next = value === null ? filtered : [...filtered, flag, value]',
    'state.respawnFlags[index] === flag && state.respawnFlags[index + 1] === value',
    'respawnFlags: [...state.respawnFlags, flag, value]',
  ]) {
    assert.ok(jobs.includes(compact(fragment)), fragment)
  }

  const callerSources = [
    'src/query.ts',
    'src/query/stopHooks.ts',
    'src/jobs/classifier.ts',
    'src/hooks/useBgSessionPr.ts',
    'src/hooks/useJobStateNameSync.ts',
    'src/state/onChangeAppState.ts',
    'src/commands/add-dir/add-dir.tsx',
  ].map(readSource)
  assert.equal(
    occurrences([readSource('src/daemon/jobs.ts'), ...callerSources].join('\n'), 'getCurrentJobShort()'),
    11,
  )
  const state = compact(readSource('src/state/onChangeAppState.ts'))
  assert.ok(
    state.includes(
      compact("setCurrentJobRespawnFlag('--permission-mode', [], newMode)"),
    ),
  )
  assert.ok(
    state.includes(
      compact("setCurrentJobRespawnFlag('--model', ['-m'], selected)"),
    ),
  )
  assert.ok(
    readSource('src/commands/add-dir/add-dir.tsx').includes(
      "appendCurrentJobRespawnFlag('--add-dir', path)",
    ),
  )
})

test('waits for Ink before advertising a ready background job', () => {
  const rendezvous = compact(readSource('src/daemon/rendezvous.ts'))
  for (const fragment of [
    'const socket = activeSocket',
    'for (let attempt = 0; !instances.has(process.stdout); attempt++)',
    'if (attempt >= 60 || activeSocket !== socket) return',
    "!['starting', 'resuming', 'adopted', 'crashed'].includes(state.state)",
    "patch: { state: 'running', tempo: 'idle' }",
    "state: 'running', tempo: 'idle', updatedAt: new Date().toISOString()",
    'markJobReadyAfterInkMount().catch',
  ]) {
    assert.ok(rendezvous.includes(compact(fragment)), fragment)
  }
})

test('recognizes raw, Kitty, and modifyOtherKeys detach input', () => {
  const source = compact(readSource('src/cli/bg.ts'))
  for (const fragment of [
    "Buffer.from('\\x1B[98;5u', 'latin1')",
    "Buffer.from('\\x1B[27;5;98~', 'latin1')",
    "Buffer.from('\\x1B[122;5u', 'latin1')",
    "Buffer.from('\\x1B[27;5;122~', 'latin1')",
    'byte === CTRL_Z || bufferMatchesAt(chunk, index, KITTY_CTRL_Z)',
    'bufferMatchesAt(chunk, index, MODIFY_OTHER_KEYS_CTRL_Z)',
    'byte === CTRL_B ? 1 : bufferMatchesAt(chunk, index, KITTY_CTRL_B)',
    'bufferMatchesAt(chunk, index, MODIFY_OTHER_KEYS_CTRL_B)',
    'index += prefixLength - 1',
    "if (byte === DETACH_KEY) return finish({ outcome: 'detached' })",
  ]) {
    assert.ok(source.includes(compact(fragment)), fragment)
  }
})
