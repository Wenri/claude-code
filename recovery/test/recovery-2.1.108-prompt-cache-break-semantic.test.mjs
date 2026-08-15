import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.107-to-2.1.108'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_107_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_108_BUNDLE
const baselineSha256 =
  '6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844'
const targetSha256 =
  'dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73'
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
const pin = [
  6958,
  5_032_671,
  5_036_817,
  '4075a521f3b5b0ab5b01ad75f5b87a079e3984e901bde2b57ba71538f2b8feee',
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
}

function extractFunctionContaining(bundle, needle) {
  const needleIndex = bundle.indexOf(needle)
  assert.notEqual(needleIndex, -1, needle)
  const start = bundle.lastIndexOf('async function ', needleIndex)
  assert.notEqual(start, -1, `${needle}: function start`)
  const open = bundle.indexOf('{', start)
  let depth = 0
  for (let index = open; index < bundle.length; index += 1) {
    if (bundle[index] === '{') depth += 1
    if (bundle[index] === '}') {
      depth -= 1
      if (depth === 0) return bundle.slice(start, index + 1)
    }
  }
  assert.fail(`${needle}: unterminated function`)
}

test(
  'target108 pins the detector telemetry delta while target107 preserves the inherited detector',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselineBundlePath || !targetBundlePath
        ? 'CLAUDE_CODE_2_1_107_BUNDLE and CLAUDE_CODE_2_1_108_BUNDLE are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselineBundlePath)
    const targetBytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(baselineBytes), baselineSha256)
    assert.equal(sha256(targetBytes), targetSha256)
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const [index, start, end, sourceHash] = pin
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
    )
    assert.equal(sha256(target.slice(start, end)), sourceHash)

    const baselineDetector = extractFunctionContaining(
      baseline,
      'tengu_prompt_cache_break',
    )
    const targetDetector = extractFunctionContaining(
      target,
      'tengu_prompt_cache_break',
    )
    for (const fragment of [
      'messagesHistoryChanged',
      'firstChangedMessageIndex',
      'prevBlockCount',
      'changedBlockIndices',
      'overage state changed (TTL flip expected)',
    ]) {
      assert.ok(baselineDetector.includes(fragment), `baseline: ${fragment}`)
      assert.ok(targetDetector.includes(fragment), `target: ${fragment}`)
    }
    assert.equal(baselineDetector.includes('systemHash:'), false)
    assert.equal(baselineDetector.includes('toolsHash:'), false)
    assert.ok(targetDetector.includes('systemHash:'))
    assert.ok(targetDetector.includes('toolsHash:'))
  },
)

test(
  'source owns message and system-block mutation detection plus target108 telemetry',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const detector = source('services/api/promptCacheBreakDetection.ts')
    const caller = source('services/api/claude.ts')
    for (const fragment of [
      "const BILLING_HEADER_PREFIX = 'x-anthropic-billing-header:'",
      '.filter(item => !isBillingHeader(item))',
      'function sanitizeMessageContent(value: unknown)',
      'source: { ...sourceRecord, data: sourceRecord.data.length }',
      'content.map(sanitizeMessageContent)',
      'const messageHashes = messagesForAPI',
      'const firstChangedMessageIndex = prev.messageHashes.findIndex(',
      'const messagesHistoryChanged = firstChangedMessageIndex !== -1',
      'prevMessageCount: prev.messageHashes.length',
      'const changedBlockIndices: number[] = []',
      'changedBlockLengthDeltas.push(',
      "parts.push('overage state changed (TTL flip expected)')",
      'messagesHistoryChanged: changes?.messagesHistoryChanged ?? false',
      'systemHash: state.systemHash',
      'toolsHash: state.toolsHash',
      'isCowork: isEnvTruthy(process.env.CLAUDE_CODE_IS_COWORK)',
    ]) {
      assert.ok(detector.includes(fragment), fragment)
    }
    assert.ok(caller.includes('messagesForAPI,'))
    assert.equal(
      caller.match(
        /if \(isEnvTruthy\(process\.env\.CLAUDE_CODE_IS_COWORK\)\)/g,
      )?.length,
      2,
    )
    assert.equal(caller.includes("feature('PROMPT_CACHE_BREAK_DETECTION')"), false)

    const historical = semanticCase === caseName
    if (historical) {
      assert.equal(detector.includes('getPersistedStatePath'), false)
      assert.equal(detector.includes('is1hCacheTTL: state.is1hCacheTTL'), false)
      assert.equal(caller.includes("is1hCacheTTL: cacheTtl === '1h'"), false)
    } else {
      for (const fragment of [
        'function loadPersistedState(): void',
        'function persistState(): void',
        'is1hCacheTTL: state.is1hCacheTTL',
        'queryDepth: state.queryDepth',
        'querySource,',
        'model: state.model',
        'globalCacheStrategy: state.globalCacheStrategy',
      ]) {
        assert.ok(detector.includes(fragment), fragment)
      }
      assert.ok(caller.includes("is1hCacheTTL: cacheTtl === '1h'"))
      assert.ok(caller.includes('queryDepth: options.queryTracking?.depth'))
    }
  },
)

test(
  'source sanitizer preserves safe content and bounds embedded image data before hashing',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const detector = source('services/api/promptCacheBreakDetection.ts')
    const start = detector.indexOf('function sanitizeMessageContent(')
    const end = detector.indexOf('\n}\n\nfunction computeMessageHashes', start)
    assert.notEqual(start, -1)
    assert.notEqual(end, -1)
    const declaration = detector
      .slice(start, end + 2)
      .replace('function sanitizeMessageContent(value: unknown): unknown',
        'function sanitizeMessageContent(value)')
      .replaceAll(' as Record<string, unknown>', '')
    const sanitize = Function(`${declaration}; return sanitizeMessageContent`)()

    const short = { type: 'text', text: 'ok', cache_control: { type: 'ephemeral' } }
    assert.deepEqual(sanitize(short), { type: 'text', text: 'ok' })
    const nested = {
      content: [
        {
          type: 'image',
          cache_control: { type: 'ephemeral' },
          source: { type: 'base64', media_type: 'image/png', data: 'x'.repeat(300) },
        },
      ],
    }
    assert.deepEqual(sanitize(nested), {
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: 300 },
        },
      ],
    })
  },
)
