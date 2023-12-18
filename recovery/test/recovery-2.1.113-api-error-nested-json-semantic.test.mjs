import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.112-to-2.1.113'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_112_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE

const BASELINE_SHA256 =
  'bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f'
const TARGET_INNER_SHA256 =
  '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba'
const TARGET_WRAPPER_SHA256 =
  'dda4d89e787fa455706e4f41beffc8e58d42b9094c4d155fcbf62e3f19036681'
const TARGET_WRAPPER_PREFIX_LENGTH = 87
const TARGET_WRAPPER_SUFFIX_LENGTH = 3
const targetUnit = {
  index: 8118,
  start: 3859613,
  end: 3861016,
  nodeType: 'FunctionDeclaration',
  sourceHash:
    '0dfd66c30c78427ace6fec82e5d2f52c5b5edde68423d3f95aeb3ec44b8899b5',
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function authenticatedTargetInner(filename) {
  const bytes = fs.readFileSync(filename)
  const digest = sha256(bytes)
  if (digest === TARGET_INNER_SHA256) return bytes.toString('utf8')
  assert.equal(digest, TARGET_WRAPPER_SHA256, 'authenticated target wrapper')
  const inner = bytes.subarray(
    TARGET_WRAPPER_PREFIX_LENGTH,
    bytes.length - TARGET_WRAPPER_SUFFIX_LENGTH,
  )
  assert.equal(sha256(inner), TARGET_INNER_SHA256, 'authenticated target inner')
  return inner.toString('utf8')
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

async function sourceFormatAPIError() {
  const filename = path.join(sourceRoot, 'services/api/errorUtils.ts')
  const source = fs.readFileSync(filename, 'utf8')
  const ts = await loadTypeScript()
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
    reportDiagnostics: true,
  })
  const errors = (result.diagnostics ?? []).filter(
    diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
  )
  assert.deepEqual(errors, [], 'source error formatter transpiles')
  const module = { exports: {} }
  new Function('exports', 'module', result.outputText)(module.exports, module)
  return module.exports.formatAPIError
}

function targetFormatAPIError(target) {
  const source = target.slice(targetUnit.start, targetUnit.end)
  return Function(
    'XB',
    'Q5K',
    'a$9',
    `${source}; return JMH`,
  )(
    () => null,
    error =>
      error?.error?.error?.message ?? error?.error?.message ?? null,
    error => error.message,
  )
}

test(
  'target113 authenticates nested JSON API-error recovery',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.112 and 2.1.113 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    assert.equal(sha256(baselineBytes), BASELINE_SHA256)
    const target = authenticatedTargetInner(targetPath)
    const row = [...structural.regions, ...structural.unresolvedTarget].find(
      candidate => candidate.target?.index === targetUnit.index,
    )
    assert.ok(row, `target unit ${targetUnit.index}`)
    assert.equal(row.classification, 'unresolved')
    assert.deepEqual(
      [
        row.target.index,
        row.target.start,
        row.target.end,
        row.target.nodeType,
        row.target.sourceHash,
      ],
      [
        targetUnit.index,
        targetUnit.start,
        targetUnit.end,
        targetUnit.nodeType,
        targetUnit.sourceHash,
      ],
    )
    const unit = target.slice(targetUnit.start, targetUnit.end)
    assert.equal(sha256(unit), targetUnit.sourceHash)
    assert.match(unit, /\.message\.includes\('\{\"'\)/)

    const format = targetFormatAPIError(target)
    assert.equal(
      format({
        status: 429,
        message: 'provider response: {"error":"opaque"}',
        error: { message: 'Please retry later' },
      }),
      '429 Please retry later',
    )
    assert.equal(
      format({
        message: 'provider response: {"error":"opaque"}',
        error: { error: { message: 'Deep provider message' } },
      }),
      'Deep provider message',
    )
  },
)

test(
  'source preserves the target nested JSON API-error behavior',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const format = await sourceFormatAPIError()
    assert.equal(
      format({
        status: 429,
        message: 'provider response: {"error":"opaque"}',
        error: { message: 'Please retry later' },
      }),
      '429 Please retry later',
    )
    assert.equal(
      format({
        message: 'provider response: {"error":"opaque"}',
        error: { error: { message: 'Deep provider message' } },
      }),
      'Deep provider message',
    )
    assert.equal(format({ message: 'plain provider error' }), 'plain provider error')
  },
)
