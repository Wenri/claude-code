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
  [10122, 7895728, 7896080, 'FunctionDeclaration', 'db963cefa3c00c2c41857fc296108cd429212d349ddae22cd275ec9fdb16626f'],
  [10134, 7900016, 7900215, 'FunctionDeclaration', 'e67b44ec26a41f9f1485a9b0a119d561ef53dda816aa26b06fdf70cf48e8df21'],
  [10135, 7900215, 7902844, 'FunctionDeclaration', '8c910af02e193c83b9ab0ecae81f1d405b892c8bd9a9a9e5cb3c5f8e79f418d1'],
  [10153, 7914879, 7914920, 'VariableDeclaration', '6b1be69b46a7b3785e92d3712d23c4d4a79014bd7e1b6f3e9c1bce30d80ba294'],
  [10154, 7914920, 7915189, 'VariableDeclaration', '153e2364bc923b92aa0747d3285ea68195bf58915c622aecdf98c78bacd498ab'],
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
  if (sourceRoot) {
    return fs.readFileSync(
      path.join(sourceRoot, 'utils/nativeInstaller/installer.ts'),
      'utf8',
    )
  }
  return fs.readFileSync(
    fileURLToPath(
      new URL('../../src/utils/nativeInstaller/installer.ts', import.meta.url),
    ),
    'utf8',
  )
}

test('target110 pins canary selection and Rosetta architecture detection', bundleOptions, () => {
  const baseline = bundle('CLAUDE_CODE_2_1_109_BUNDLE', BASELINE_SHA256)
  const target = bundle('CLAUDE_CODE_2_1_110_BUNDLE', TARGET_SHA256)
  for (const [index, start, end, nodeType, expected] of TARGET_UNITS) {
    assert.equal(
      sha256(target.slice(start, end)),
      expected,
      `${nodeType} target unit ${index}`,
    )
  }
  for (const observable of [
    'getCanaryVersion: GB read failed, falling through: ',
    'Native installer: canary ',
  ]) {
    assert.equal(baseline.includes(observable), false, observable)
    assert.equal(target.includes(observable), true, observable)
  }
  assert.equal(
    target.split('sysctl.proc_translated').length,
    baseline.split('sysctl.proc_translated').length + 1,
  )
})

test('source preserves canary precedence, max-version safety, and Rosetta mapping', sourceOptions, () => {
  const contents = source()
  for (const fragment of [
    "getFeatureValue_CACHED_MAY_BE_STALE<{",
    ">('tengu_canary', {})",
    "typeof canary.external === 'string' && semver.valid(canary.external)",
    "channelOrVersion === 'latest'",
    'canaryVersion && maxVersion && gt(canaryVersion, maxVersion)',
    'gt(canaryVersion, version)',
    '!canaryExceedsMaxVersion',
    'canary ${canaryVersion} active, overriding ${version}',
    'canary ${canaryVersion} exceeds maxVersion ${maxVersion}, not applying',
    "process.platform === 'darwin'",
    "process.arch === 'x64'",
    "spawnSync('sysctl', ['-n', 'sysctl.proc_translated']",
    "if (isRosettaTranslated) arch = 'arm64'",
  ]) {
    assert.equal(contents.includes(fragment), true, fragment)
  }
})
