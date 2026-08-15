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

const targetUnits = new Map([
  [9058, [4257331, 4257542, 'FunctionDeclaration', '23f7fbdde491a8fb192219793bd5a8c481d13b3da9bf03a1d353cd569a1a013e']],
  [18329, [11292512, 11292848, 'FunctionDeclaration', '4d07b31b5460f2ad9e5f0d16f7087864c2b92cf17d04af5097b4ac176e3b11da']],
])
const baselineCaller = [
  11218533,
  11218862,
  'f131bcebf030c9c3359b6fe3c9c37eee2322741ee1c279d7bf6660a74ad4c20e',
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function extractFunction(contents, marker) {
  const start = contents.indexOf(marker)
  assert.notEqual(start, -1, marker)
  const bodyStart = contents.indexOf('{', start)
  let depth = 0
  for (let index = bodyStart; index < contents.length; index += 1) {
    if (contents[index] === '{') depth += 1
    if (contents[index] === '}') {
      depth -= 1
      if (depth === 0) return contents.slice(start, index + 1)
    }
  }
  assert.fail(`unterminated function: ${marker}`)
}

test('target116 pins the internal-error telemetry helper and live log-sink edge', bundleOptions, () => {
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

  for (const [index, identity] of targetUnits) {
    const region = structural.regions[index]
    assert.notEqual(region.classification, 'matched')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.nodeType, region.target.sourceHash],
      identity,
    )
    assert.equal(sha256(target.subarray(identity[0], identity[1])), identity[3])
  }

  const helper = target.subarray(4257331, 4257542).toString('utf8')
  const caller = target.subarray(11292512, 11292848).toString('utf8')
  const helperName = /^function ([A-Za-z_$][\w$]*)\(/.exec(helper)?.[1]
  assert.ok(helperName)
  for (const fragment of [
    'internal_error',
    'error_name:',
    'error_code:',
    '/^[A-Z][A-Z0-9_]*$/',
    'finally',
  ]) assert.ok(helper.includes(fragment), fragment)
  assert.ok(caller.includes(`${helperName}(H);`), 'error sink invokes helper first')

  const oldCaller = baseline.subarray(
    baselineCaller[0],
    baselineCaller[1],
  )
  assert.equal(sha256(oldCaller), baselineCaller[2])
  assert.equal(oldCaller.toString('utf8').includes('internal_error'), false)
  assert.equal(
    target.toString('utf8').split('internal_error').length - 1,
    baseline.toString('utf8').split('internal_error').length,
  )
})

test('source owns guarded name and errno telemetry at the error-log sink', sourceOptions, () => {
  const events = source('utils/telemetry/events.ts')
  const sink = source('utils/errorLogSink.ts')
  for (const fragment of [
    'let isLoggingInternalError = false',
    'export function logInternalErrorEvent(error: Error): void',
    "error.name !== 'Error'",
    "error.constructor?.name || 'Error'",
    'const errorCode = getErrnoCode(error)',
    "void logOTelEvent('internal_error'",
    '/^[A-Z][A-Z0-9_]*$/.test(errorCode)',
    'isLoggingInternalError = false',
  ]) assert.ok(events.includes(fragment), fragment)
  assert.ok(sink.includes("import { logInternalErrorEvent } from './telemetry/events.js'"))
  assert.ok(
    sink.indexOf('logInternalErrorEvent(error)') <
      sink.indexOf('const errorStr = error.stack || error.message'),
  )
})

test('recovered helper filters codes and blocks recursive error reporting', sourceOptions, () => {
  const typed = extractFunction(
    source('utils/telemetry/events.ts'),
    'export function logInternalErrorEvent',
  )
  const executable = typed
    .replace('export function logInternalErrorEvent(error: Error): void', 'function logInternalErrorEvent(error)')
  const emitted = []
  let logInternalErrorEvent
  logInternalErrorEvent = new Function(
    'getErrnoCode',
    'logOTelEvent',
    `let isLoggingInternalError = false; ${executable}; return logInternalErrorEvent`,
  )(
    error => error.code,
    (name, metadata) => {
      emitted.push([name, metadata])
      if (emitted.length === 1) logInternalErrorEvent(new Error('recursive'))
    },
  )

  const fsError = new (class FilesystemFailure extends Error {})('missing')
  fsError.name = 'Error'
  fsError.code = 'ENOENT'
  logInternalErrorEvent(fsError)
  const invalidCode = new TypeError('bad')
  invalidCode.code = 'bad-code'
  logInternalErrorEvent(invalidCode)

  assert.deepEqual(emitted, [
    ['internal_error', { error_name: 'FilesystemFailure', error_code: 'ENOENT' }],
    ['internal_error', { error_name: 'TypeError', error_code: undefined }],
  ])
})
