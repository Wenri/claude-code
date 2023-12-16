import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = { skip: selected ? false : `not applicable to ${semanticCase}` }
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
      path.join(repositoryRoot, 'recovery/cases', caseName, 'structural/generated-delta.json.gz'),
    ),
  ),
)
const helperUnit = [
  15045,
  9388687,
  9388815,
  'e09bd718d4334d6d5526c8a73dd944f51103615f054e9ddde547eda7ce72ecc2',
]
const callerUnit = [
  15049,
  9389095,
  9392397,
  '8146f6360885946077867c4dd84943cd67d8b5b2352b7be26d7239b5b1686316',
]
const retryPredicateUnit = [
  15062,
  9394259,
  9395012,
  'aacbe0694c76e0331bbed199adbf4f5f622a7d559b99d3f622ce9a9544a2195f',
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
  const parametersStart = contents.indexOf('(', start)
  let parameterDepth = 0
  let parametersEnd = -1
  for (let index = parametersStart; index < contents.length; index += 1) {
    if (contents[index] === '(') parameterDepth += 1
    if (contents[index] === ')') {
      parameterDepth -= 1
      if (parameterDepth === 0) {
        parametersEnd = index
        break
      }
    }
  }
  const bodyStart = contents.indexOf('{', parametersEnd)
  let bodyDepth = 0
  for (let index = bodyStart; index < contents.length; index += 1) {
    if (contents[index] === '{') bodyDepth += 1
    if (contents[index] === '}') {
      bodyDepth -= 1
      if (bodyDepth === 0) return contents.slice(start, index + 1)
    }
  }
  assert.fail(`unterminated function: ${marker}`)
}

async function compileCommonJs(contents) {
  const candidates = [
    path.resolve(path.dirname(process.execPath), '../lib/node_modules/typescript/lib/typescript.js'),
    path.join(repositoryRoot, '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js'),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate)
  const module = await import(pathToFileURL(candidate).href)
  const ts = module.default ?? module
  return ts.transpileModule(contents, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
}

test('authenticated target116 introduces the remote Linux retry watchdog gate', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(
    sha256(baselineBytes),
    'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
  )
  assert.equal(
    sha256(targetBytes),
    'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
  )
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')
  for (const [index, start, end, hash] of [
    helperUnit,
    callerUnit,
    retryPredicateUnit,
  ]) {
    const region = structural.regions[index]
    assert.notEqual(region.classification, 'matched')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, hash],
    )
    assert.equal(sha256(targetBytes.subarray(start, end)), hash)
  }
  assert.equal(baseline.split('CLAUDE_CODE_RETRY_WATCHDOG').length - 1, 0)
  assert.equal(target.slice(9388787, 9388813), 'CLAUDE_CODE_RETRY_WATCHDOG')
  const helper = target.slice(helperUnit[1], helperUnit[2])
  const caller = target.slice(callerUnit[1], callerUnit[2])
  const retryPredicate = target.slice(
    retryPredicateUnit[1],
    retryPredicateUnit[2],
  )
  const helperName = /^function ([A-Za-z_$][\w$]*)\(/.exec(helper)?.[1]
  assert.ok(helperName)
  assert.match(
    helper,
    /\(\)==="linux"&&process\.env\.CLAUDE_CODE_ENTRYPOINT==="remote"&&[A-Za-z_$][\w$]*\(process\.env\.CLAUDE_CODE_RETRY_WATCHDOG\)/,
  )
  assert.equal(target.split(`${helperName}(`).length - 1, 6)
  assert.equal(caller.split(`${helperName}(`).length - 1, 4)
  assert.equal(retryPredicate.split(`${helperName}(`).length - 1, 1)
  for (const fragment of [
    'tengu_api_persistent_retry_wait',
    'Math.min(k,',
    'if(q.signal?.aborted)',
  ]) {
    assert.ok(caller.includes(fragment), fragment)
  }
})

test('source owns only the authenticated watchdog environment contract', sourceOptions, () => {
  const retry = source('services/api/withRetry.ts')
  assert.ok(retry.includes("import { getPlatform } from '../../utils/platform.js'"))
  assert.ok(retry.includes("getPlatform() === 'linux'"))
  assert.ok(retry.includes("process.env.CLAUDE_CODE_ENTRYPOINT === 'remote'"))
  assert.ok(retry.includes('isEnvTruthy(process.env.CLAUDE_CODE_RETRY_WATCHDOG)'))
  assert.equal(retry.includes('CLAUDE_CODE_UNATTENDED_RETRY'), false)
  // Source reuses the already-computed `persistent` boolean at one target call
  // site; the gate is therefore evaluated four times rather than five.
  assert.equal(retry.split('isPersistentRetryEnabled()').length - 1, 5)
})

test('actual gate requires Linux, remote entrypoint, and a truthy watchdog', sourceOptions, async () => {
  const helper = extractFunction(
    source('services/api/withRetry.ts'),
    'function isPersistentRetryEnabled',
  )
  const javascript = await compileCommonJs(`
    let platform = 'linux'
    const getPlatform = () => platform
    const isEnvTruthy = (value: string | undefined) =>
      value !== undefined && !['', '0', 'false', 'no', 'off'].includes(value.toLowerCase())
    ${helper}
    export { isPersistentRetryEnabled }
    export function setPlatform(value: string) { platform = value }
  `)
  const module = { exports: {} }
  new Function('exports', 'module', javascript)(module.exports, module)
  const recovered = module.exports
  const oldEntrypoint = process.env.CLAUDE_CODE_ENTRYPOINT
  const oldWatchdog = process.env.CLAUDE_CODE_RETRY_WATCHDOG
  try {
    process.env.CLAUDE_CODE_ENTRYPOINT = 'remote'
    process.env.CLAUDE_CODE_RETRY_WATCHDOG = '1'
    assert.equal(recovered.isPersistentRetryEnabled(), true)
    recovered.setPlatform('wsl')
    assert.equal(recovered.isPersistentRetryEnabled(), false)
    recovered.setPlatform('linux')
    process.env.CLAUDE_CODE_ENTRYPOINT = 'cli'
    assert.equal(recovered.isPersistentRetryEnabled(), false)
    process.env.CLAUDE_CODE_ENTRYPOINT = 'remote'
    process.env.CLAUDE_CODE_RETRY_WATCHDOG = 'false'
    assert.equal(recovered.isPersistentRetryEnabled(), false)
    process.env.CLAUDE_CODE_RETRY_WATCHDOG = 'yes'
    assert.equal(recovered.isPersistentRetryEnabled(), true)
  } finally {
    if (oldEntrypoint === undefined) delete process.env.CLAUDE_CODE_ENTRYPOINT
    else process.env.CLAUDE_CODE_ENTRYPOINT = oldEntrypoint
    if (oldWatchdog === undefined) delete process.env.CLAUDE_CODE_RETRY_WATCHDOG
    else process.env.CLAUDE_CODE_RETRY_WATCHDOG = oldWatchdog
  }
})
