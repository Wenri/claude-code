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

function count(haystack, needle) {
  return haystack.split(needle).length - 1
}

function readSource() {
  return fs.readFileSync(path.join(repo, 'src/utils/Shell.ts'), 'utf8')
}

test('authenticates retained sandbox temp-directory ordering in both bundles', () => {
  const exactSequence =
    /let [A-Za-z_$][\w$]*=!1;try\{await [A-Za-z_$][\w$]*\(\)\.mkdir\([A-Za-z_$][\w$]*,\{mode:448\}\),[A-Za-z_$][\w$]*=!0\}catch\([A-Za-z_$][\w$]*\)\{if\([A-Za-z_$][\w$]*\([A-Za-z_$][\w$]*\)==="EEXIST"\)[A-Za-z_$][\w$]*=!0;else [A-Za-z_$][\w$]*\(`Failed to create \$\{[A-Za-z_$][\w$]*\} directory: \$\{[A-Za-z_$][\w$]*\}`\)\}if\([A-Za-z_$][\w$]*&&!process\.env\.CLAUDE_TMPDIR\)process\.env\.CLAUDE_TMPDIR=[A-Za-z_$][\w$]*;[A-Za-z_$][\w$]*=await [A-Za-z_$][\w$]*\.wrapWithSandbox\(/

  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      count(bundle, 'Failed to create ${J} directory'),
      1,
      `${release.version}: fail-soft diagnostic cardinality`,
    )
    assert.match(
      bundle,
      exactSequence,
      `${release.version}: mkdir/EEXIST/env/wrap sequence`,
    )
  }
})

test('source preserves the exact order and runtime truth table', async () => {
  const source = readSource()
  const start = source.indexOf('let sandboxTmpDirUsable = false')
  const end = source.indexOf('\n  }\n\n  const spawnBinary', start)
  assert.notEqual(start, -1, 'sandbox temp-directory setup is present')
  assert.notEqual(end, -1, 'sandbox setup block has a stable boundary')

  const block = source.slice(start, end)
  const mkdirIndex = block.indexOf('await fs.mkdir(sandboxTmpDir')
  const envIndex = block.indexOf('process.env.CLAUDE_TMPDIR = sandboxTmpDir')
  const wrapIndex = block.indexOf('SandboxManager.wrapWithSandbox')
  assert.ok(mkdirIndex >= 0 && mkdirIndex < envIndex && envIndex < wrapIndex)
  assert.match(block, /getErrnoCode\(error\) === 'EEXIST'/)
  assert.match(
    block,
    /`Failed to create \$\{sandboxTmpDir\} directory: \$\{error\}`/,
  )

  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  const runBlock = new AsyncFunction(
    'getFsImplementation',
    'getErrnoCode',
    'logForDebugging',
    'process',
    'SandboxManager',
    'sandboxTmpDir',
    'commandString',
    'sandboxBinShell',
    'scrubConfig',
    'abortSignal',
    `${block}\nreturn commandString`,
  )

  async function runCase({ mkdirError, initialValue }) {
    const calls = []
    const fakeProcess = { env: {} }
    if (initialValue !== undefined) {
      fakeProcess.env.CLAUDE_TMPDIR = initialValue
    }
    const sandboxTmpDir = '/tmp/claude-test'
    const result = await runBlock(
      () => ({
        async mkdir(directory, options) {
          calls.push(['mkdir', directory, options])
          if (mkdirError) throw mkdirError
        },
      }),
      error => error?.code,
      message => calls.push(['log', message]),
      fakeProcess,
      {
        async wrapWithSandbox(command) {
          calls.push([
            'wrap',
            command,
            fakeProcess.env.CLAUDE_TMPDIR,
          ])
          return `wrapped:${command}`
        },
      },
      sandboxTmpDir,
      'echo ok',
      '/bin/sh',
      undefined,
      undefined,
    )
    return { calls, env: fakeProcess.env.CLAUDE_TMPDIR, result }
  }

  const success = await runCase({})
  assert.deepEqual(success.calls, [
    ['mkdir', '/tmp/claude-test', { mode: 0o700 }],
    ['wrap', 'echo ok', '/tmp/claude-test'],
  ])
  assert.equal(success.env, '/tmp/claude-test')
  assert.equal(success.result, 'wrapped:echo ok')

  const existsError = Object.assign(new Error('already exists'), {
    code: 'EEXIST',
  })
  const exists = await runCase({ mkdirError: existsError })
  assert.deepEqual(exists.calls, [
    ['mkdir', '/tmp/claude-test', { mode: 0o700 }],
    ['wrap', 'echo ok', '/tmp/claude-test'],
  ])
  assert.equal(exists.env, '/tmp/claude-test')

  const deniedError = Object.assign(new Error('denied'), { code: 'EACCES' })
  const denied = await runCase({ mkdirError: deniedError })
  assert.deepEqual(denied.calls, [
    ['mkdir', '/tmp/claude-test', { mode: 0o700 }],
    [
      'log',
      'Failed to create /tmp/claude-test directory: Error: denied',
    ],
    ['wrap', 'echo ok', undefined],
  ])
  assert.equal(denied.env, undefined)
  assert.equal(denied.result, 'wrapped:echo ok')

  const preexisting = await runCase({ initialValue: '/caller/tmp' })
  assert.deepEqual(preexisting.calls, [
    ['mkdir', '/tmp/claude-test', { mode: 0o700 }],
    ['wrap', 'echo ok', '/caller/tmp'],
  ])
  assert.equal(preexisting.env, '/caller/tmp')

  const empty = await runCase({ initialValue: '' })
  assert.deepEqual(empty.calls, [
    ['mkdir', '/tmp/claude-test', { mode: 0o700 }],
    ['wrap', 'echo ok', '/tmp/claude-test'],
  ])
  assert.equal(empty.env, '/tmp/claude-test')
})
