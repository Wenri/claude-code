import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.110-to-2.1.111'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_111_BUNDLE
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_110_BUNDLE and CLAUDE_CODE_2_1_111_BUNDLE are required'
      : false,
}

const units = new Map([
  [17289, ['FunctionDeclaration', 12000676, 12000774, 'e19ff6ca2daf9f833932b2ed71b464cbbac19304ec1663ee96f418bd4b9b0902']],
  [17290, ['FunctionDeclaration', 12000774, 12000959, 'a025a66dcd2abb77d573bffa420a296ca3bca1e794d49fe568fb378c9b2f0835']],
  [17292, ['FunctionDeclaration', 12001016, 12001372, 'f99017bd84cab4b88817440cd3e905f285c4c0dde3ebd9362499167b16323332']],
  [17293, ['FunctionDeclaration', 12001372, 12001494, '8f1e0660e261f920b85948fa2845a69643b7ed7c053092e3072e9385f6075e1c']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

test('2.1.111 authenticates the complete changed sleep-inhibitor unit set', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
  )
  assert.equal(
    sha256(targetBytes),
    '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0',
  )
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  for (const [index, [nodeType, start, end, sourceHash]] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.equal(region.target.nodeType, nodeType, `${index}: node type`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(target.slice(start, end)), sourceHash, `${index}: bytes`)
  }

  for (const fragment of [
    'Restarting sleep inhibitor to maintain prevention',
    'sleep inhibitor spawn error:',
    'Stopped sleep inhibitor, allowing sleep',
  ]) {
    assert.equal(occurrences(baseline, fragment), 0, `baseline: ${fragment}`)
    assert.equal(occurrences(target, fragment), 1, `target: ${fragment}`)
  }
  assert.match(target.slice(12000413, 12000605), /setTimeout\(.*\),.*\.unref\(\)/)
  assert.match(target.slice(12001494, 12001565), /=30000/)
  assert.match(target.slice(12000676, 12000774), /macos.*caffeinate.*-i.*-t/)
  assert.match(target.slice(12001016, 12001372), /windowsHide:!0/)
})

test('source owns the target111-through-116 grace and inhibitor lifecycle', sourceOptions, () => {
  const contents = fs.readFileSync(
    path.join(sourceRoot, 'services/preventSleep.ts'),
    'utf8',
  )
  for (const fragment of [
    'const STOP_GRACE_PERIOD_MS = 30 * 1000',
    'pendingStopTimeout = setTimeout(() => {',
    'pendingStopTimeout.unref()',
    "if (getPlatform() === 'macos')",
    "return ['caffeinate', ['-i', '-t', timeout]]",
    'if (refCount > 0 || pendingStopTimeout !== null)',
    "logForDebugging('Restarting sleep inhibitor to maintain prevention')",
    'windowsHide: true',
    'registerCleanup(async () => {',
    'forceStopPreventSleep()',
    'if (sleepInhibitorProcess === thisProc) sleepInhibitorProcess = null',
    'logForDebugging(`Started ${executable} to prevent sleep`)',
    "logForDebugging('Stopped sleep inhibitor, allowing sleep')",
  ]) {
    assert.ok(contents.includes(fragment), fragment)
  }
  assert.equal(contents.includes('Restarting caffeinate'), false)
  assert.equal(contents.includes('caffeinateProcess'), false)
})
