import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
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

const baselineCaller = {
  index: 14837,
  start: 9_284_828,
  end: 9_285_718,
  sourceHash:
    '6cc4cb90abf7078d6fa7ae43d7517c27ca026da099f4e7087429ca592059b7c6',
}
const targetCaller = {
  index: 14976,
  start: 9_337_452,
  end: 9_338_347,
  sourceHash:
    '783c44abd0a7a510fcdbe7316e81f1088847d85a2080dab7bfa8cb52e17d07f7',
}
const targetHelper = {
  index: 18194,
  start: 11_223_809,
  end: 11_224_352,
  sourceHash:
    '574d2fc9e869d0c606bcc32c0e869c026963e94cb363d07448e2a08a406c2002',
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function loadTypeScript() {
  const require = createRequire(import.meta.url)
  for (const candidate of [
    path.resolve(
      path.dirname(process.execPath),
      '../lib/node_modules/typescript/lib/typescript.js',
    ),
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ]) {
    if (fs.existsSync(candidate)) return require(candidate)
  }
  throw new Error('TypeScript compiler not found')
}

function executableDecoder() {
  const owner = source('utils/api.ts')
  const start = owner.indexOf(
    'export function decodeUnicodeEscapesInToolInput(',
  )
  const end = owner.indexOf(
    '// Strips fields that were added by normalizeToolInput',
    start,
  )
  assert.ok(start >= 0 && end > start)
  const ts = loadTypeScript()
  const javascript = ts.transpileModule(owner.slice(start, end), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const module = { exports: {} }
  Function('module', 'exports', javascript)(module, module.exports)
  return module.exports.decodeUnicodeEscapesInToolInput
}

test('target116 authenticates the recursive Unicode decoder and its live tool-input edge', bundleOptions, () => {
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

  const baselineRegion = structural.unmatchedBaseline.find(
    region => region.index === baselineCaller.index,
  )
  assert.deepEqual(
    [
      baselineRegion?.start,
      baselineRegion?.end,
      baselineRegion?.nodeType,
      baselineRegion?.sourceHash,
    ],
    [
      baselineCaller.start,
      baselineCaller.end,
      'FunctionDeclaration',
      baselineCaller.sourceHash,
    ],
  )
  assert.equal(
    sha256(baseline.subarray(baselineCaller.start, baselineCaller.end)),
    baselineCaller.sourceHash,
  )

  for (const unit of [targetCaller, targetHelper]) {
    const region = structural.regions[unit.index]
    assert.equal(region.classification, 'unresolved', `${unit.index}: classification`)
    assert.deepEqual(
      [
        region.target.start,
        region.target.end,
        region.target.nodeType,
        region.target.sourceHash,
      ],
      [unit.start, unit.end, 'FunctionDeclaration', unit.sourceHash],
    )
    assert.equal(
      sha256(target.subarray(unit.start, unit.end)),
      unit.sourceHash,
      `${unit.index}: bytes`,
    )
  }

  const baselineOwner = baseline
    .subarray(baselineCaller.start, baselineCaller.end)
    .toString('utf8')
  const targetOwner = target
    .subarray(targetCaller.start, targetCaller.end)
    .toString('utf8')
  const helper = target
    .subarray(targetHelper.start, targetHelper.end)
    .toString('utf8')
  assert.match(baselineOwner, /let A=[A-Za-z_$][\w$]*\(_,f\.inputSchema\)/)
  assert.doesNotMatch(baselineOwner, /Ve\$\(/)
  assert.match(targetOwner, /let f=Ve\$\([A-Za-z_$][\w$]*\(_,A\.inputSchema\)\)/)
  assert.match(helper, /\\u\(\[dD\]\[89aAbB\]/)
  assert.match(helper, /z>=55296&&z<=57343/)
})

test('source owns the decoder before tool-specific normalization', sourceOptions, () => {
  const api = source('utils/api.ts')
  const messages = source('utils/messages.ts')
  assert.match(
    api,
    /export function decodeUnicodeEscapesInToolInput\(value: unknown\): unknown/,
  )
  assert.match(
    messages,
    /const correctedInput = decodeUnicodeEscapesInToolInput\(\s*normalizeJsonEncodedToolInputFields\(/,
  )
  assert.ok(
    messages.indexOf('decodeUnicodeEscapesInToolInput(') <
      messages.indexOf('normalizeToolInput(\n', messages.indexOf('decodeUnicodeEscapesInToolInput(')),
  )
})

test('the source decoder handles nesting, surrogate pairs, and escaped escapes without mutation', sourceOptions, () => {
  const decode = executableDecoder()
  assert.equal(decode('plain'), 'plain')
  assert.equal(decode('\\u0041'), 'A')
  assert.equal(decode('\\uD83D\\uDE00'), '😀')
  assert.equal(decode('\\uD800'), '\\uD800')
  assert.equal(decode('\\uDE00'), '\\uDE00')
  assert.equal(decode('\\\\u0041'), '\\\\u0041')

  const original = {
    path: '\\u002Ftmp\\u002Ffile',
    nested: ['\\u0061', 42, null, { emoji: '\\uD83D\\uDE80' }],
  }
  const decoded = decode(original)
  assert.deepEqual(decoded, {
    path: '/tmp/file',
    nested: ['a', 42, null, { emoji: '🚀' }],
  })
  assert.notEqual(decoded, original)
  assert.notEqual(decoded.nested, original.nested)
  assert.equal(original.path, '\\u002Ftmp\\u002Ffile')
})
