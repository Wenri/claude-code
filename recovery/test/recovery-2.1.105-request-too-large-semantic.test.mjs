import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
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
  [13377, ['unresolved', 10051870, 10052078, 'FunctionDeclaration', 'e88dafa33e29ed008c793c3ccfd58d991552933425653241dccf0e6f1613da52']],
  [13389, ['unresolved', 10055865, 10061881, 'FunctionDeclaration', 'a0a1a573503e3f4d3f857827631c37b9d04bf1073aad4984c6713ed239bd8e26']],
  [13391, ['unresolved', 10062160, 10064774, 'FunctionDeclaration', '289cbd92e80f8a2fee16e7e31ed65eee1298539747179aac841876767bab479b']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function ownerSource() {
  return fs.readFileSync(path.join(sourceRoot, 'services/api/errors.ts'), 'utf8')
}

function assertFragments(contents, fragments, label) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${label}: ${fragment}`)
  }
}

function functionSource(contents, name) {
  const marker = `export function ${name}`
  const start = contents.indexOf(marker)
  assert.notEqual(start, -1, `${name}: declaration`)
  const body = contents.indexOf('{', start)
  let depth = 0
  for (let index = body; index < contents.length; index++) {
    if (contents[index] === '{') depth++
    if (contents[index] === '}' && --depth === 0) {
      return contents.slice(start, index + 1)
    }
  }
  throw new Error(`${name}: unterminated declaration`)
}

async function loadTypeScript() {
  const candidates = [
    path.resolve(
      path.dirname(process.execPath),
      '../lib/node_modules/typescript/lib/typescript.js',
    ),
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate, 'the pinned TypeScript compiler must be available')
  const module = await import(pathToFileURL(candidate).href)
  return module.default ?? module
}

async function compileErrorClassifiers(contents) {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(
    `
      class APIError extends Error {
        status: number
        constructor(status: number, message: string) {
          super(message)
          this.status = status
        }
      }
      class APIConnectionError extends Error {}
      class APIConnectionTimeoutError extends APIConnectionError {}
      const REPEATED_529_ERROR_MESSAGE = 'Repeated 529 Overloaded errors'
      const CUSTOM_OFF_SWITCH_MESSAGE = 'capacity switch'
      const PROMPT_TOO_LONG_ERROR_MESSAGE = 'Prompt is too long'
      const CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE = 'Credit balance is too low'
      const isEnvTruthy = (value: string | undefined) => value === '1'
      const extractConnectionErrorDetails = () => null
      ${functionSource(contents, 'isMediaSizeError')}
      ${functionSource(contents, 'classifyAPIError')}
      export { APIError }
    `,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const module = { exports: {} }
  new Function('exports', 'module', 'process', javascript)(
    module.exports,
    module,
    process,
  )
  return module.exports
}

test(
  'authenticated target105 pins request-too-large and context-window classification',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath || !latestPath
        ? 'authenticated 2.1.104, 2.1.105, and 2.1.116 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(baselineBytes),
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
    )
    assert.equal(
      sha256(targetBytes),
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    )
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const latest = latestBytes.toString('utf8')

    for (const [index, [classification, start, end, nodeType, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, classification, `${index}: class`)
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        [start, end, nodeType, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }

    assertFragments(target.slice(10051870, 10052078), [
      'includes("request_too_large")',
    ], 'target105 media classifier')
    assertFragments(target.slice(10055865, 10061881), [
      'status===413',
      'includes("context window")',
      'errorDetails:q.message',
      'errorDetails:`request_too_large: ${q.message}`',
    ], 'target105 assistant message')
    assertFragments(target.slice(10062160, 10064774), [
      'status===413',
      '?"prompt_too_long":"request_too_large"',
    ], 'target105 analytics classifier')

    assert.equal(
      baseline.includes('?"prompt_too_long":"request_too_large"'),
      false,
    )
    assert.equal(
      baseline.includes('errorDetails:`request_too_large: ${'),
      false,
    )
    assertFragments(latest, [
      'includes("request_too_large")',
      'errorDetails:`request_too_large: ${H.message}`',
      '?"prompt_too_long":"request_too_large"',
    ], 'target116 persistence')
  },
)

test(
  'authored API error owner preserves the target105 413 decision boundary',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const source = ownerSource()
    assertFragments(source, [
      "raw.includes('request_too_large')",
      'if (error instanceof APIError && error.status === 413)',
      "error.message.toLowerCase().includes('context window')",
      'errorDetails: error.message',
      'errorDetails: `request_too_large: ${error.message}`',
      "? 'prompt_too_long'",
      ": 'request_too_large'",
    ], 'services/api/errors.ts')
  },
)

test(
  'request-too-large source classifiers execute the target105 split',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const runtime = await compileErrorClassifiers(ownerSource())
    assert.equal(runtime.isMediaSizeError('request_too_large: 32 MB'), true)
    assert.equal(runtime.isMediaSizeError('ordinary request failure'), false)
    assert.equal(
      runtime.classifyAPIError(
        new runtime.APIError(413, 'maximum context window exceeded'),
      ),
      'prompt_too_long',
    )
    assert.equal(
      runtime.classifyAPIError(new runtime.APIError(413, 'body exceeds 32 MB')),
      'request_too_large',
    )
  },
)
