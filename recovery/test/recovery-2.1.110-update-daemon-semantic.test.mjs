import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceOptions = {
  skip:
    !semanticCase || semanticCase === caseName
      ? false
      : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip:
    semanticCase && semanticCase !== caseName
      ? `not applicable to ${semanticCase}`
      : !semanticCase &&
          (!process.env.CLAUDE_CODE_2_1_109_BUNDLE ||
            !process.env.CLAUDE_CODE_2_1_110_BUNDLE)
        ? 'authenticated target109 and target110 bundles are required'
        : false,
}

const BASELINE_SHA256 =
  '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7'
const TARGET_SHA256 =
  'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861'

const TARGET_UNITS = [
  [19416, 13460593, 13460679, 'ImportDeclaration', '52064ca35458636db4171b721aa1f879bcc8cb5943f2a4538c32afaafc3cbc13'],
  [19417, 13460679, 13460709, 'ImportDeclaration', 'bcfa327c22db3cc3c7a9defbde3721df1ed4101aa6ab13c3f63ebd20c97e870b'],
  [19418, 13460709, 13460745, 'FunctionDeclaration', 'f77d3c9fc2031f87d04eef5105232dfa1c663c0482008c6ecf81d75ff1900f77'],
  [19419, 13460745, 13460967, 'FunctionDeclaration', '147bbe45998803f7c413fc846545135100e1745e09bee85f1b52a1c567f55ffd'],
  [19420, 13460967, 13461078, 'FunctionDeclaration', '77c95d94502dd2de7ebc8cdfafd7a1fe772872b922256b9a1da2924a2f99db0c'],
  [19421, 13461078, 13461208, 'FunctionDeclaration', 'fc0cddcbf12f803aa820ed3d2081f58c245f073a6a5b41cf12a4cb167a13a9ba'],
  [19422, 13461208, 13461230, 'VariableDeclaration', '74404df8d28ebfaef65ab16371fa94fa7e89d86202d5e5242e89ce3e74faad34'],
  [19426, 13461303, 13475957, 'FunctionDeclaration', 'a3d388cded9f9bebd5422c8d7c9f40f815d714364afe85fa2c1688336a28911b'],
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function bundle(environmentName, expectedSha256) {
  const filename = process.env[environmentName]
  assert.ok(filename, `${environmentName} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(sha256(bytes), expectedSha256)
  return bytes.toString('utf8')
}

function source() {
  const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  if (sourceRoot) return fs.readFileSync(path.join(sourceRoot, 'cli/update.ts'), 'utf8')
  return fs.readFileSync(
    fileURLToPath(new URL('../../src/cli/update.ts', import.meta.url)),
    'utf8',
  )
}

function includesAll(contents, fragments) {
  for (const fragment of fragments) {
    assert.equal(contents.includes(fragment), true, fragment)
  }
}

test('target110 pins minimum-version and live-daemon update semantics', bundleOptions, () => {
  const baseline = bundle('CLAUDE_CODE_2_1_109_BUNDLE', BASELINE_SHA256)
  const target = bundle('CLAUDE_CODE_2_1_110_BUNDLE', TARGET_SHA256)
  for (const [index, start, end, nodeType, expected] of TARGET_UNITS) {
    const fragment = target.slice(start, end)
    assert.equal(sha256(fragment), expected, `${nodeType} target unit ${index}`)
  }
  for (const observable of [
    'daemon.lock',
    'Signaled claude daemon to restart',
    ' below your minimumVersion setting (',
  ]) {
    assert.equal(baseline.includes(observable), false, observable)
    assert.equal(target.includes(observable), true, observable)
  }
  assert.equal(target.split('SIGTERM').length, baseline.split('SIGTERM').length + 1)
})

test('source preserves the historical or evolved daemon coordinator exactly', sourceOptions, () => {
  const contents = source()
  includesAll(contents, [
    "const DAEMON_LOCK_FILENAME = 'daemon.lock'",
    'async function readDaemonLock()',
    'process.kill(lock.pid, 0)',
    'const minimumVersion = getInitialSettings()?.minimumVersion',
    'channelVersion && shouldSkipVersion(channelVersion)',
    'latestVersion && shouldSkipVersion(latestVersion)',
    'result.wasUpdated && result.latestVersion !== MACRO.VERSION',
  ])

  if (process.env.CLAUDE_CODE_SEMANTIC_CASE === '2.1.109-to-2.1.110') {
    includesAll(contents, [
      'async function signalDaemonRestartForVersion(',
      "process.kill(lock.pid, 'SIGTERM')",
      "chalk.dim('Signaled claude daemon to restart')",
    ])
    assert.equal(contents.includes('/proc/${pid}/cmdline'), false)
  } else {
    includesAll(contents, [
      'async function isClaudeDaemonProcess(',
      'await readFile(`/proc/${pid}/cmdline`, \'utf8\')',
      'async function willDaemonRestartForVersion(',
      'Claude daemon will restart for the upgrade once background jobs finish',
    ])
    assert.equal(contents.includes("process.kill(lock.pid, 'SIGTERM')"), false)
  }
})
