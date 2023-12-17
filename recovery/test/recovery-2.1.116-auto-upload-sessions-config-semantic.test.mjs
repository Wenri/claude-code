import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
      : false,
}

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
const units = new Map([
  [6570, [3008904, 3010617, 'VariableDeclaration', '9b9a3f361fba82f6e92a0f6e90324bc1b5165d5315e872756d5047dcf056d0ba']],
  [10729, [6264575, 6264639, 'FunctionDeclaration', '20ddb168dd6cea983fa53d034f3bd4ae5599b271c1713a6bdc471c1b057f734f']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

test('target116 pins the persisted config key and proves its compiled reader is private DCE', bundleOptions, () => {
  const baseline = fs.readFileSync(baselinePath)
  const target = fs.readFileSync(targetPath)
  assert.equal(
    sha256(baseline),
    'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
  )
  assert.equal(
    sha256(target),
    'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
  )
  for (const [index, identity] of units) {
    const region = structural.regions[index]
    assert.notEqual(region.classification, 'matched')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.nodeType, region.target.sourceHash],
      identity,
    )
    assert.equal(sha256(target.subarray(identity[0], identity[1])), identity[3])
  }

  const baselineText = baseline.toString('utf8')
  const targetText = target.toString('utf8')
  assert.equal(occurrences(baselineText, 'autoUploadSessions'), 0)
  assert.equal(occurrences(targetText, 'autoUploadSessions'), 2)
  assert.ok(
    target.subarray(3008904, 3010617).toString('utf8').includes('"autoUploadSessions"'),
  )

  const reader = target.subarray(6264575, 6264639).toString('utf8')
  const readerName = /^function ([A-Za-z_$][\w$]*)\(/.exec(reader)?.[1]
  assert.ok(readerName)
  assert.ok(reader.includes('.autoUploadSessions'))
  assert.equal(occurrences(targetText, readerName), 1)
})

test('source admits autoUploadSessions as a typed persisted global config key', sourceOptions, () => {
  const config = fs.readFileSync(
    path.join(sourceRoot, 'utils/config.ts'),
    'utf8',
  )
  assert.ok(config.includes('autoUploadSessions?: boolean'))
  const list = /export const GLOBAL_CONFIG_KEYS = \[([\s\S]*?)\] as const/.exec(config)?.[1]
  assert.ok(list)
  const keys = [...list.matchAll(/'([^']+)'/g)].map(match => match[1])
  assert.equal(keys.filter(key => key === 'autoUploadSessions').length, 1)
  assert.ok(keys.indexOf('autoUploadSessions') > keys.indexOf('remoteControlAtStartup'))
  assert.ok(keys.indexOf('autoUploadSessions') < keys.indexOf('remoteDialogSeen'))
  const isGlobalConfigKey = key => keys.includes(key)
  assert.equal(isGlobalConfigKey('autoUploadSessions'), true)
  assert.equal(isGlobalConfigKey('autoUploadSession'), false)
})
